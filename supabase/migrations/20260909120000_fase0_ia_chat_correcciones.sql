-- =============================================================================
-- Fase 0 - Correcciones criticas del motor de IA conversacional (Chat/CRM)
--
-- Objetivo: cerrar los agujeros de seguridad, cobro y fiabilidad de
-- `ai-auto-response` SIN cambiar el comportamiento observable del bot.
-- Todos los flags nuevos nacen con default conservador (= comportamiento actual).
--
-- Idempotente: se puede re-aplicar sin efectos secundarios.
-- Rollback: 20260909120000_fase0_ia_chat_correcciones_rollback.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) ai_settings: flags de comportamiento
-- -----------------------------------------------------------------------------
alter table public.ai_settings
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists hybrid_agent_pause_minutes integer not null default 30,
  add column if not exists hybrid_respect_business_hours boolean not null default false,
  add column if not exists reply_fallback_on_no_credits boolean not null default false;

comment on column public.ai_settings.metadata is
  'Flags y ajustes experimentales por organizacion (Fase 0).';
comment on column public.ai_settings.hybrid_agent_pause_minutes is
  'ai_mode=hybrid: minutos que la IA guarda silencio tras el ultimo mensaje de un agente humano.';
comment on column public.ai_settings.hybrid_respect_business_hours is
  'ai_mode=hybrid: si es true Y el canal tiene business_hours configurado, la IA solo responde FUERA del horario laboral. Default false para preservar el comportamiento actual (los 7 canales productivos tienen business_hours vacio).';
comment on column public.ai_settings.reply_fallback_on_no_credits is
  'Si es true, al quedarse sin creditos se envia fallback_message en lugar de guardar silencio.';

-- -----------------------------------------------------------------------------
-- 2) channels: modo borrador por canal
--    OJO: un borrador NUNCA se inserta en `messages`, porque trg_channel_dispatch
--    despacha a WhatsApp/Facebook/Instagram cualquier outbound con role='ai'.
--    El borrador se guarda en ai_jobs con status='draft'.
-- -----------------------------------------------------------------------------
alter table public.channels
  add column if not exists ai_draft_mode boolean not null default false;

comment on column public.channels.ai_draft_mode is
  'Si es true, la IA propone la respuesta (ai_jobs.status=draft) y NO la envia al cliente. La UI de aprobacion llega en la Fase 4.';

-- -----------------------------------------------------------------------------
-- 3) ai_jobs: estados nuevos, candado de idempotencia y trazabilidad de fallos
-- -----------------------------------------------------------------------------
alter table public.ai_jobs drop constraint if exists ai_jobs_status_check;
alter table public.ai_jobs add constraint ai_jobs_status_check
  check (status = any (array[
    'pending','processing','completed','failed','cancelled','skipped','draft'
  ]));

-- Candado: dos invocaciones concurrentes para el mismo mensaje disparador no
-- pueden generar dos respuestas. El INSERT del perdedor falla con SQLSTATE 23505.
create unique index if not exists ai_jobs_auto_response_lock_idx
  on public.ai_jobs (conversation_id, trigger_message_id)
  where trigger_message_id is not null and job_type = 'auto_response';

-- Consultas del panel de observabilidad (Fase 6).
create index if not exists ai_jobs_org_status_created_idx
  on public.ai_jobs (organization_id, status, created_at desc);

-- -----------------------------------------------------------------------------
-- 4) Creditos: una sola fuente de verdad
--
--    Antes: el trigger trg_consume_ai_credits_on_message descontaba 1 credito por
--    cada messages.role='ai', y ademas las rutas Next llamaban consumeAICredits()
--    -> cobro doble en cuanto esas rutas se conecten.
--
--    Ahora: cobra quien genera (Edge Function / rutas API) via decrement_ai_credits,
--    que es atomico (FOR UPDATE) y permite registrar modelo y costo reales.
-- -----------------------------------------------------------------------------
drop trigger if exists trg_consume_ai_credits_on_message on public.messages;

comment on function public.fn_consume_ai_credits_on_message() is
  'DEPRECADA (Fase 0): su trigger trg_consume_ai_credits_on_message se elimino para acabar con el cobro doble. Se conserva la funcion para poder reactivar el trigger si hiciera falta revertir.';

-- deduct_ai_credits esta rota y es peligrosa: inserta en ai_usage_logs.credits_used
-- (columna inexistente), omite action_type (NOT NULL), y su EXCEPTION WHEN OTHERS
-- revierte el descuento al savepoint del bloque pero AUN ASI devuelve TRUE.
-- No la llama nadie en el repositorio. Se elimina.
drop function if exists public.deduct_ai_credits(integer, integer);

-- -----------------------------------------------------------------------------
-- 5) Secreto compartido trigger -> Edge Function
--    Se guarda en vault, nunca en el repositorio ni en el codigo de la funcion.
-- -----------------------------------------------------------------------------
do $seed$
begin
  if not exists (select 1 from vault.secrets where name = 'AI_INTERNAL_SECRET') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'AI_INTERNAL_SECRET',
      'Secreto compartido: trigger_ai_auto_response -> Edge Function ai-auto-response (Fase 0)'
    );
  end if;
end
$seed$;

-- Lectura del secreto para la Edge Function (que entra con service_role).
-- PostgREST no expone el esquema vault: por eso hace falta este envoltorio.
create or replace function public.get_ai_internal_secret()
returns text
language sql
security definer
set search_path = public, vault
as $fn$
  select decrypted_secret from vault.decrypted_secrets where name = 'AI_INTERNAL_SECRET' limit 1;
$fn$;

revoke all on function public.get_ai_internal_secret() from public;
revoke all on function public.get_ai_internal_secret() from anon;
revoke all on function public.get_ai_internal_secret() from authenticated;
grant execute on function public.get_ai_internal_secret() to service_role;

comment on function public.get_ai_internal_secret() is
  'Devuelve el secreto compartido con ai-auto-response. Solo service_role puede ejecutarla.';

-- -----------------------------------------------------------------------------
-- 6) trigger_ai_auto_response: firma la llamada y respeta auto_response_enabled
-- -----------------------------------------------------------------------------
create or replace function public.trigger_ai_auto_response()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions, vault
as $fn$
declare
  v_channel_ai_mode text;
  v_ai_active boolean;
  v_auto_enabled boolean;
  v_secret text;
begin
  -- Solo mensajes entrantes de clientes
  if NEW.direction <> 'inbound' or NEW.role <> 'customer' then
    return NEW;
  end if;

  -- ai_mode del canal, verificando que la conversacion sea de la misma org
  select c.ai_mode into v_channel_ai_mode
  from conversations conv
  join channels c on c.id = conv.channel_id
  where conv.id = NEW.conversation_id
    and conv.organization_id = NEW.organization_id;

  -- 'manual' nunca responde. La semantica de 'hybrid' vs 'ai_only' se resuelve
  -- dentro de la Edge Function, que si tiene el historial a mano.
  if v_channel_ai_mode is null or v_channel_ai_mode = 'manual' then
    return NEW;
  end if;

  select is_active, coalesce(auto_response_enabled, true)
    into v_ai_active, v_auto_enabled
  from ai_settings
  where organization_id = NEW.organization_id;

  if not coalesce(v_ai_active, false) or not coalesce(v_auto_enabled, false) then
    return NEW;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'AI_INTERNAL_SECRET'
  limit 1;

  perform net.http_post(
    url := 'https://jgmgphmzusbluqhuqihj.supabase.co/functions/v1/ai-auto-response',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object(
      'conversationId', NEW.conversation_id,
      'messageId', NEW.id,
      'organizationId', NEW.organization_id
    )
  );

  return NEW;
end;
$fn$;
