-- GO Assistant — Fase 1: persistencia de la conversación.
--
-- Hoy el hilo vive en `useState`: se cierra el panel o se recarga la página y se
-- perdió todo (C6 del plan). No hay historial, no se puede retomar "lo que
-- estábamos subiendo ayer", no hay trazabilidad de qué pidió el usuario antes de
-- una acción, y no se puede medir ni mejorar nada.
--
-- Aditiva: no toca ninguna tabla existente.

create table if not exists public.ai_assistant_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id       integer,
  user_id         uuid not null,
  title           text,
  channel         text not null default 'text' check (channel in ('text','voice','mixed')),
  status          text not null default 'active' check (status in ('active','archived')),
  message_count   integer not null default 0,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ai_assistant_conversations_user_idx
  on public.ai_assistant_conversations (organization_id, user_id, last_message_at desc nulls last);
create index if not exists ai_assistant_conversations_status_idx
  on public.ai_assistant_conversations (organization_id, status);

create table if not exists public.ai_assistant_messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.ai_assistant_conversations(id) on delete cascade,
  organization_id   integer not null references public.organizations(id) on delete cascade,
  role              text not null check (role in ('user','assistant','tool','system')),
  content           text,
  -- Partes estructuradas: llamadas a herramienta, adjuntos, pasos. El texto
  -- plano vive en `content` para poder leerlo sin parsear nada.
  content_json      jsonb not null default '{}'::jsonb,
  attachment_ids    uuid[],
  action_id         uuid references public.ai_agent_actions(id) on delete set null,
  model             text,
  prompt_tokens     integer,
  completion_tokens integer,
  credits           numeric,
  latency_ms        integer,
  created_at        timestamptz not null default now()
);

create index if not exists ai_assistant_messages_thread_idx
  on public.ai_assistant_messages (conversation_id, created_at);

alter table public.ai_assistant_conversations enable row level security;
alter table public.ai_assistant_messages enable row level security;

-- Mismo criterio que `ai_agent_actions`: el autor ve y escribe lo suyo; el
-- administrador de la organización puede leer para auditar (§9.5).
drop policy if exists "Authors and org admins can view conversations" on public.ai_assistant_conversations;
create policy "Authors and org admins can view conversations"
  on public.ai_assistant_conversations for select
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid() and om.is_active = true)
    and (
      user_id = auth.uid()
      or organization_id in (
        select om.organization_id from public.organization_members om
        where om.user_id = auth.uid() and om.is_active = true
          and (om.is_super_admin = true or om.role_id in (1,2)))
    )
  );

drop policy if exists "Authors manage their conversations" on public.ai_assistant_conversations;
create policy "Authors manage their conversations"
  on public.ai_assistant_conversations for all
  using (
    user_id = auth.uid()
    and organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid() and om.is_active = true))
  with check (
    user_id = auth.uid()
    and organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid() and om.is_active = true));

drop policy if exists "Messages follow their conversation" on public.ai_assistant_messages;
create policy "Messages follow their conversation"
  on public.ai_assistant_messages for select
  using (
    conversation_id in (select id from public.ai_assistant_conversations)
  );

drop policy if exists "Authors write messages in their conversations" on public.ai_assistant_messages;
create policy "Authors write messages in their conversations"
  on public.ai_assistant_messages for insert
  with check (
    conversation_id in (
      select c.id from public.ai_assistant_conversations c
      where c.user_id = auth.uid()
        and c.organization_id in (
          select om.organization_id from public.organization_members om
          where om.user_id = auth.uid() and om.is_active = true))
  );

comment on table public.ai_assistant_conversations is
  'GO Assistant: hilos de conversacion del asistente del header.';
comment on table public.ai_assistant_messages is
  'GO Assistant: mensajes de cada hilo, con su coste y la accion que propusieron.';

-- Contador y marca de tiempo del hilo, para poder listar sin contar mensajes.
create or replace function public.fn_ai_assistant_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_assistant_conversations
     set message_count = message_count + 1,
         last_message_at = new.created_at,
         updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_ai_assistant_touch_conversation on public.ai_assistant_messages;
create trigger trg_ai_assistant_touch_conversation
  after insert on public.ai_assistant_messages
  for each row execute function public.fn_ai_assistant_touch_conversation();

revoke all on function public.fn_ai_assistant_touch_conversation() from public;