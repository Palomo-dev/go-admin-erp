-- POS de doble pantalla — Fase 2
-- Identidad de la caja física (terminal). Solo identidad y emparejamiento:
-- los ajustes de presentación de la pantalla del cliente viven en
-- organization_settings (key 'pos_customer_display'), como el resto de
-- ajustes del POS. Ver docs/pos-doble-pantalla/PLAN.md §6.
--
-- Migración aditiva: no toca tablas con datos de clientes.
--
-- Los secretos del emparejamiento (código de 6 dígitos y hash del token de
-- la pantalla remota, Fase 3) van en una tabla APARTE sin ningún permiso para
-- anon/authenticated: en este proyecto las tablas nuevas nacen con GRANT ALL
-- para ambos roles (pg_default_acl), y un `revoke select (columna)` no anula
-- un SELECT concedido a nivel de tabla, así que las columnas seguirían
-- saliendo por PostgREST. Solo las rutas de servidor (service role) los leen.

create table if not exists public.pos_terminals (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       integer not null references public.organizations(id) on delete cascade,
  branch_id             integer not null references public.branches(id) on delete cascade,
  name                  text not null,
  code                  text not null,
  is_active             boolean not null default true,
  -- Última señal de una pantalla remota emparejada (Fase 3). No es secreto.
  display_last_seen_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint pos_terminals_code_unico unique (organization_id, branch_id, code),
  constraint pos_terminals_code_formato check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  constraint pos_terminals_name_no_vacio check (length(btrim(name)) > 0)
);

comment on table public.pos_terminals is
  'Caja física del POS (terminal). Identidad de la caja; los ajustes de presentación van en organization_settings.pos_customer_display y los secretos de emparejamiento en pos_terminal_secrets.';

create index if not exists pos_terminals_org_branch_idx
  on public.pos_terminals (organization_id, branch_id);

-- updated_at automático, mismo helper que usan las demás tablas si existe.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    execute 'create trigger pos_terminals_set_updated_at
      before update on public.pos_terminals
      for each row execute function public.update_updated_at_column()';
  end if;
end $$;

-- RLS por pertenencia a la organización. Nada para anon.
alter table public.pos_terminals enable row level security;

drop policy if exists pos_terminals_select on public.pos_terminals;
create policy pos_terminals_select on public.pos_terminals
  for select to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));

drop policy if exists pos_terminals_insert on public.pos_terminals;
create policy pos_terminals_insert on public.pos_terminals
  for insert to authenticated
  with check (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));

drop policy if exists pos_terminals_update on public.pos_terminals;
create policy pos_terminals_update on public.pos_terminals
  for update to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true))
  with check (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));

drop policy if exists pos_terminals_delete on public.pos_terminals;
create policy pos_terminals_delete on public.pos_terminals
  for delete to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));

revoke all on public.pos_terminals from anon;

-- Secretos del emparejamiento (Fase 3). Una fila por terminal, opcional.
-- pairing_code: 6 dígitos, vida corta. display_token_hash: sha256 del token
-- de larga duración; el token en claro se devuelve una sola vez y no se guarda.
create table if not exists public.pos_terminal_secrets (
  terminal_id              uuid primary key references public.pos_terminals(id) on delete cascade,
  organization_id          integer not null references public.organizations(id) on delete cascade,
  pairing_code             text,
  pairing_code_expires_at  timestamptz,
  display_token_hash       text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint pos_terminal_secrets_code_formato check (pairing_code is null or pairing_code ~ '^[0-9]{6}$')
);

comment on table public.pos_terminal_secrets is
  'Código de emparejamiento y hash del token de la pantalla remota de una terminal del POS. Solo la leen y escriben las rutas de servidor con service role; sin permisos para anon ni authenticated.';

-- Canje del código de emparejamiento: búsqueda por código vigente.
create index if not exists pos_terminal_secrets_pairing_code_idx
  on public.pos_terminal_secrets (pairing_code)
  where pairing_code is not null;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    execute 'create trigger pos_terminal_secrets_set_updated_at
      before update on public.pos_terminal_secrets
      for each row execute function public.update_updated_at_column()';
  end if;
end $$;

-- RLS activo sin políticas + sin grants: ni anon ni authenticated pueden
-- tocarla por PostgREST. service_role la lee/escribe sin pasar por RLS.
alter table public.pos_terminal_secrets enable row level security;
revoke all on public.pos_terminal_secrets from anon;
revoke all on public.pos_terminal_secrets from authenticated;
