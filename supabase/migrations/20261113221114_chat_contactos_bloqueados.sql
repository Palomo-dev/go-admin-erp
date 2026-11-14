-- Chat › «Bloquear contacto» (Figma 93-chat-pendientes-01/02).
--
-- 1. Tabla `chat_contactos_bloqueados`: un bloqueo por cliente y organización
--    (vale para todos sus canales). Guarda quién y cuándo bloqueó y, al
--    desbloquear, quién y cuándo; la fila no se borra, así queda la historia
--    y el hilo puede mostrar «X bloqueó el contacto». Como mucho un bloqueo
--    vigente por cliente (índice único parcial).
--    Lectura: miembros de la organización. Escritura: solo el servidor
--    (`/api/chat/conversaciones/[id]/bloqueo`, que valida organización de la
--    sesión y acceso al Chat); `authenticated` no tiene insert/update.
--
-- 2. Efecto en la entrada de mensajes, en la base y no en cada webhook, porque
--    WhatsApp, Instagram, Facebook y el widget insertan todos en `messages`:
--    - BEFORE INSERT `trg_messages_contacto_bloqueado`: un mensaje entrante de
--      un contacto bloqueado SE GUARDA (no se pierde) pero marcado:
--      metadata.contacto_bloqueado = true, is_read = true.
--    - `update_conversation_last_message`: ese mensaje no suma no leídos ni
--      sube la conversación en la Bandeja (no toca last_message_at).
--    - `trigger_ai_auto_response`: la IA no le responde.
--    La Edge Function `ai-auto-response` lo vuelve a comprobar (defensa en
--    profundidad).

create table if not exists public.chat_contactos_bloqueados (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  conversation_id uuid null references public.conversations(id) on delete set null,
  bloqueado_por_member_id bigint null references public.organization_members(id) on delete set null,
  bloqueado_en timestamptz not null default now(),
  desbloqueado_por_member_id bigint null references public.organization_members(id) on delete set null,
  desbloqueado_en timestamptz null,
  constraint chat_contactos_bloqueados_fechas_ck check (desbloqueado_en is null or desbloqueado_en >= bloqueado_en)
);

comment on table public.chat_contactos_bloqueados is
  'Chat: contactos bloqueados por organización. Sus mensajes nuevos se guardan marcados (metadata.contacto_bloqueado), no cuentan como no leídos y la IA no les responde. Se escribe solo desde el servidor.';

create unique index if not exists uq_chat_contactos_bloqueados_vigente
  on public.chat_contactos_bloqueados (organization_id, customer_id)
  where desbloqueado_en is null;
create index if not exists idx_chat_contactos_bloqueados_cliente
  on public.chat_contactos_bloqueados (customer_id, bloqueado_en desc);
create index if not exists idx_chat_contactos_bloqueados_conversacion
  on public.chat_contactos_bloqueados (conversation_id);
create index if not exists idx_chat_contactos_bloqueados_bloqueado_por
  on public.chat_contactos_bloqueados (bloqueado_por_member_id);
create index if not exists idx_chat_contactos_bloqueados_desbloqueado_por
  on public.chat_contactos_bloqueados (desbloqueado_por_member_id);

alter table public.chat_contactos_bloqueados enable row level security;

drop policy if exists chat_contactos_bloqueados_lectura on public.chat_contactos_bloqueados;
create policy chat_contactos_bloqueados_lectura on public.chat_contactos_bloqueados
  for select to authenticated
  using (organization_id in (
    select m.organization_id from public.organization_members m
     where m.user_id = (select auth.uid()) and m.is_active = true
  ));

revoke all on public.chat_contactos_bloqueados from public, anon;
revoke insert, update, delete on public.chat_contactos_bloqueados from authenticated;
grant select on public.chat_contactos_bloqueados to authenticated;
grant all on public.chat_contactos_bloqueados to service_role;

-- Marca el mensaje entrante de un contacto bloqueado antes de guardarlo.
create or replace function public.fn_messages_marcar_contacto_bloqueado()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.direction <> 'inbound' or new.role <> 'customer' then
    return new;
  end if;
  if exists (
    select 1
      from public.conversations c
      join public.chat_contactos_bloqueados b
        on b.organization_id = c.organization_id
       and b.customer_id = c.customer_id
       and b.desbloqueado_en is null
     where c.id = new.conversation_id
       and c.organization_id = new.organization_id
  ) then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('contacto_bloqueado', true);
    new.is_read := true;
    new.read_at := coalesce(new.read_at, now());
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_messages_marcar_contacto_bloqueado() from public, anon, authenticated;

drop trigger if exists trg_messages_contacto_bloqueado on public.messages;
create trigger trg_messages_contacto_bloqueado
  before insert on public.messages
  for each row execute function public.fn_messages_marcar_contacto_bloqueado();

-- Un mensaje marcado no suma no leídos ni sube la conversación en la Bandeja.
create or replace function public.update_conversation_last_message()
 returns trigger
 language plpgsql
as $function$
declare
  -- coalesce: sin la clave, la comparación da NULL y `not NULL` dejaba de
  -- sumar los no leídos de TODOS los mensajes (lo atrapó la prueba en
  -- begin/rollback; se corrigió con `chat_contactos_bloqueados_correccion`).
  v_bloqueado boolean := coalesce((new.metadata->>'contacto_bloqueado') = 'true', false);
begin
  update conversations
  set
    last_message_at = case when v_bloqueado then last_message_at else new.created_at end,
    message_count = message_count + 1,
    unread_count = case
      when new.direction = 'inbound' and new.role = 'customer' and not v_bloqueado then unread_count + 1
      else unread_count
    end,
    last_agent_message_at = case
      when new.role = 'agent' then new.created_at
      else last_agent_message_at
    end,
    updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$function$;

-- La IA no responde a un contacto bloqueado (resto idéntico a la versión viva).
create or replace function public.trigger_ai_auto_response()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_channel_ai_mode text;
  v_ai_active boolean;
  v_auto_enabled boolean;
  v_secret text;
  v_channel_type text;
  v_gate jsonb;
begin
  if NEW.direction <> 'inbound' or NEW.role <> 'customer' then
    return NEW;
  end if;

  if (NEW.metadata->>'contacto_bloqueado') = 'true' then
    return NEW;
  end if;

  select c.ai_mode,c.type into v_channel_ai_mode,v_channel_type
  from public.conversations conv
  join public.channels c on c.id = conv.channel_id and c.organization_id=conv.organization_id
  where conv.id = NEW.conversation_id
    and conv.organization_id = NEW.organization_id;

  if v_channel_ai_mode is null or v_channel_ai_mode = 'manual' then
    return NEW;
  end if;

  if v_channel_type='whatsapp' then
    v_gate:=public.crm_message_contact_gate(new.organization_id,new.id);
    if v_gate->>'allowed' is distinct from 'true' then return new;end if;
  end if;

  select is_active, coalesce(auto_response_enabled, true)
    into v_ai_active, v_auto_enabled
  from public.ai_settings
  where organization_id = NEW.organization_id;

  if not coalesce(v_ai_active, false) or not coalesce(v_auto_enabled, false) then
    return NEW;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'AI_INTERNAL_SECRET'
  limit 1;

  perform net.http_post(
    url := 'https://taqjemqjtumhwptchcxk.supabase.co/functions/v1/ai-auto-response',
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
$function$;
