-- GO Assistant — Fase 0
-- Cierra C1 de raíz: la propuesta de acción se persiste en el SERVIDOR y el
-- cliente solo puede referirse a ella por id. Los argumentos que se ejecutan
-- nunca viajan en el body de /execute-action.
--
-- Aditiva: no toca ninguna tabla de negocio.

create table if not exists public.ai_agent_actions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   integer not null references public.organizations(id) on delete cascade,
  user_id           uuid not null,
  branch_id         integer,
  conversation_id   uuid,
  message_id        uuid,
  tool_name         text not null,
  risk              text not null default 'medium' check (risk in ('low','medium','high')),
  args              jsonb not null default '{}'::jsonb,
  preview           jsonb not null default '{}'::jsonb,
  status            text not null default 'pending'
                      check (status in ('pending','confirmed','executing','executed','failed','rejected','expired','undone')),
  result            jsonb,
  error_code        text,
  error_message     text,
  undo_payload      jsonb,
  undone_at         timestamptz,
  client_action_id  uuid not null default gen_random_uuid(),
  entity_type       text,
  entity_id         text,
  credits           numeric default 0,
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  executed_at       timestamptz,
  expires_at        timestamptz not null default (now() + interval '30 minutes')
);

create unique index if not exists ai_agent_actions_client_action_id_key
  on public.ai_agent_actions (client_action_id);
create index if not exists ai_agent_actions_org_created_idx
  on public.ai_agent_actions (organization_id, created_at desc);
create index if not exists ai_agent_actions_conversation_idx
  on public.ai_agent_actions (conversation_id);
create index if not exists ai_agent_actions_open_idx
  on public.ai_agent_actions (status) where status in ('pending','executing');

alter table public.ai_agent_actions enable row level security;

drop policy if exists "Members can view agent actions of their organization" on public.ai_agent_actions;
create policy "Members can view agent actions of their organization"
  on public.ai_agent_actions for select
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = auth.uid() and om.is_active = true));

drop policy if exists "Members can create agent actions in their organization" on public.ai_agent_actions;
create policy "Members can create agent actions in their organization"
  on public.ai_agent_actions for insert
  with check (
    user_id = auth.uid()
    and organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid() and om.is_active = true));

-- Solo el autor de la propuesta puede confirmarla/ejecutarla. Un compañero de
-- organización puede verla (auditoría) pero no dispararla.
drop policy if exists "Authors can update their own agent actions" on public.ai_agent_actions;
create policy "Authors can update their own agent actions"
  on public.ai_agent_actions for update
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

comment on table public.ai_agent_actions is
  'GO Assistant: propuestas de acción del asistente del header. El servidor guarda args y preview; el cliente solo confirma por id (§9.1.5 del plan).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Nivel de capacidad por organización (contrato de no regresión §3.2).
-- Default 'off': una organización sin configurar ve el asistente de hoy.

create table if not exists public.ai_assistant_settings (
  organization_id           integer primary key references public.organizations(id) on delete cascade,
  capability_level          text not null default 'off'
                              check (capability_level in ('off','read','write_low','write_full')),
  enabled_tools             text[],
  voice_enabled             boolean not null default false,
  voice_allow_high          boolean not null default false,
  tts_enabled               boolean not null default false,
  tts_voice_id              text,
  undo_window_minutes       integer not null default 15,
  bulk_max_rows             integer not null default 500,
  min_field_confidence      numeric not null default 0.75,
  attachment_retention_days integer default 365,
  daily_credit_cap_per_user integer,
  model_overrides           jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table public.ai_assistant_settings enable row level security;

drop policy if exists "Members can view assistant settings" on public.ai_assistant_settings;
create policy "Members can view assistant settings"
  on public.ai_assistant_settings for select
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = auth.uid() and om.is_active = true));

drop policy if exists "Org admins can manage assistant settings" on public.ai_assistant_settings;
create policy "Org admins can manage assistant settings"
  on public.ai_assistant_settings for all
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = auth.uid() and om.is_active = true
      and (om.is_super_admin = true or om.role_id in (1,2))))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = auth.uid() and om.is_active = true
      and (om.is_super_admin = true or om.role_id in (1,2))));

comment on table public.ai_assistant_settings is
  'GO Assistant: nivel de capacidad y límites por organización. capability_level=off (default) deja el asistente en modo solo-respuesta.';