-- =============================================================================
-- ROLLBACK de la Fase 0 - motor de IA conversacional (Chat/CRM)
--
-- Restaura el estado previo: cobro de creditos en el trigger, llamada a la
-- Edge Function sin secreto, y sin flags nuevos.
--
-- OJO: hay que revertir TAMBIEN la Edge Function `ai-auto-response` a la v69,
-- porque la version de la Fase 0 exige la cabecera x-internal-secret y cobra
-- creditos por su cuenta. Si se revierte solo el SQL, la funcion respondera 401
-- a todas las llamadas del trigger.
-- =============================================================================

-- 1) Devolver el cobro de creditos al trigger
create trigger trg_consume_ai_credits_on_message
  after insert on public.messages
  for each row
  execute function public.fn_consume_ai_credits_on_message();

-- 2) Trigger original (sin secreto, sin comprobar auto_response_enabled)
create or replace function public.trigger_ai_auto_response()
returns trigger
language plpgsql
security definer
as $fn$
DECLARE
  channel_ai_mode text;
  ai_is_active boolean;
  supabase_url text;
BEGIN
  IF NEW.direction != 'inbound' OR NEW.role != 'customer' THEN
    RETURN NEW;
  END IF;

  SELECT c.ai_mode INTO channel_ai_mode
  FROM conversations conv
  JOIN channels c ON c.id = conv.channel_id
  WHERE conv.id = NEW.conversation_id;

  IF channel_ai_mode = 'manual' OR channel_ai_mode IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_active INTO ai_is_active
  FROM ai_settings
  WHERE organization_id = NEW.organization_id;

  IF NOT COALESCE(ai_is_active, false) THEN
    RETURN NEW;
  END IF;

  supabase_url := 'https://jgmgphmzusbluqhuqihj.supabase.co/functions/v1/ai-auto-response';

  PERFORM net.http_post(
    url := supabase_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'conversationId', NEW.conversation_id,
      'messageId', NEW.id,
      'organizationId', NEW.organization_id
    )
  );

  RETURN NEW;
END;
$fn$;

-- 3) Quitar el candado de idempotencia y los estados nuevos
drop index if exists public.ai_jobs_auto_response_lock_idx;
drop index if exists public.ai_jobs_org_status_created_idx;

alter table public.ai_jobs drop constraint if exists ai_jobs_status_check;
alter table public.ai_jobs add constraint ai_jobs_status_check
  check (status = any (array['pending','processing','completed','failed','cancelled']));

-- 4) Lector del secreto
drop function if exists public.get_ai_internal_secret();

-- 5) Columnas nuevas
--    Se dejan comentadas a proposito: borrarlas destruye configuracion que el
--    usuario pudo haber cambiado. Descomentar solo si se quiere limpieza total.
-- alter table public.channels drop column if exists ai_draft_mode;
-- alter table public.ai_settings
--   drop column if exists metadata,
--   drop column if exists hybrid_agent_pause_minutes,
--   drop column if exists hybrid_respect_business_hours,
--   drop column if exists reply_fallback_on_no_credits;

-- NOTA: deduct_ai_credits NO se restaura. Estaba rota (insertaba en la columna
-- inexistente ai_usage_logs.credits_used, omitia action_type NOT NULL y devolvia
-- TRUE sin descontar). No la llamaba nadie.
