-- PUC por prefijo. Cada archivo es una transacción corta.
-- El candado exclusivo de chart_of_accounts no se sostiene
-- mientras se leen journal_lines ni se reemplazan funciones.
--
-- Orden:
--   20261023120000 columnas, funciones de prefijo y respaldo
--   20261023120010 plantilla
--   20261023120020 validador y nombres
--   20261023120030 padre por prefijo
--   20261023120040 funciones de plan y de caja
--   20261023120100 movimiento, reglas y traslado
-- Reversión, de la más nueva a la más vieja:
--   supabase/rollbacks/ con el mismo nombre y sufijo _rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

create or replace function public.fn_puc_codigo_normalizado(p_code text)
returns text
language sql
immutable
set search_path to public, pg_temp
as $fn$
  select replace(coalesce(p_code, ''), '-', '');
$fn$;

comment on function public.fn_puc_codigo_normalizado(text) is
  'Quita el guion. 1405-01 se lee como 140501 y cuelga del prefijo 1405.';

create or replace function public.fn_puc_presentacion_defecto(p_code text)
returns text
language sql
immutable
set search_path to public, pg_temp
as $fn$
  select case left(public.fn_puc_codigo_normalizado(p_code), 2)
    when '11' then 'corriente'
    when '13' then 'corriente'
    when '14' then 'corriente'
    when '22' then 'corriente'
    when '23' then 'corriente'
    when '24' then 'corriente'
    when '25' then 'corriente'
    when '26' then 'corriente'
    when '28' then 'corriente'
    when '15' then 'no_corriente'
    when '16' then 'no_corriente'
    when '18' then 'no_corriente'
    when '19' then 'no_corriente'
    when '29' then 'no_corriente'
    when '12' then 'segun_plazo'
    when '17' then 'segun_plazo'
    when '21' then 'segun_plazo'
    when '27' then 'segun_plazo'
    else null
  end;
$fn$;

comment on function public.fn_puc_presentacion_defecto(text) is
  'Atributo NIIF del grupo. 11 sigue llamándose Disponible; corriente no es su nombre.';

create or replace function public.fn_puc_ancestros(p_organization_id integer, p_code text)
returns text[]
language sql
stable
security definer
set search_path to public, pg_temp
as $fn$
  select coalesce(array_agg(s.account_code order by s.largo desc), '{}'::text[])
  from (
    select a.account_code, length(public.fn_puc_codigo_normalizado(a.account_code)) as largo
    from public.chart_of_accounts a
    where a.organization_id = p_organization_id
      and length(public.fn_puc_codigo_normalizado(a.account_code))
          < length(public.fn_puc_codigo_normalizado(p_code))
      and a.account_code = left(
        public.fn_puc_codigo_normalizado(p_code),
        length(public.fn_puc_codigo_normalizado(a.account_code))
      )
      and (
        length(public.fn_puc_codigo_normalizado(a.account_code)) in (1, 2, 4, 6, 8)
        or (
          length(public.fn_puc_codigo_normalizado(a.account_code)) >= 10
          and length(public.fn_puc_codigo_normalizado(a.account_code)) % 2 = 0
        )
      )
  ) s;
$fn$;

comment on function public.fn_puc_ancestros(integer, text) is
  'Prefijos 1/2/4/6/8 que existen en la organización, del más largo al más corto.';

revoke all on function public.fn_puc_codigo_normalizado(text) from public, anon;
revoke all on function public.fn_puc_presentacion_defecto(text) from public, anon;
revoke all on function public.fn_puc_ancestros(integer, text) from public, anon;
grant execute on function public.fn_puc_codigo_normalizado(text) to authenticated, service_role;
grant execute on function public.fn_puc_presentacion_defecto(text) to authenticated, service_role;
grant execute on function public.fn_puc_ancestros(integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Columnas y tablas
-- ---------------------------------------------------------------------------

alter table public.chart_of_accounts
  add column if not exists presentacion_niif text;

alter table public.puc_plantilla
  add column if not exists presentacion_niif text;

alter table public.branch_account_mappings
  add column if not exists legacy_code text;

alter table public.chart_of_accounts
  drop constraint if exists chart_of_accounts_presentacion_niif_check;
alter table public.chart_of_accounts
  add constraint chart_of_accounts_presentacion_niif_check
  check (presentacion_niif is null or presentacion_niif in ('corriente', 'no_corriente', 'segun_plazo'));

alter table public.puc_plantilla
  drop constraint if exists puc_plantilla_presentacion_niif_check;
alter table public.puc_plantilla
  add constraint puc_plantilla_presentacion_niif_check
  check (presentacion_niif is null or presentacion_niif in ('corriente', 'no_corriente', 'segun_plazo'));

alter table public.journal_reversals
  drop constraint if exists journal_reversals_categoria_check;
alter table public.journal_reversals
  add constraint journal_reversals_categoria_check
  check (categoria = any (array[
    'F-48', 'F-45', 'F-49', 'CC-001', 'F-01', 'CC-009', 'F-63', 'manual', 'puc_migracion'
  ]));

create table if not exists public.puc_migracion_corrida (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null,
  estado text not null check (estado in ('preview', 'aplicado', 'revertido')),
  resumen jsonb not null default '{}'::jsonb,
  journal_entry_id integer,
  asientos integer[] not null default '{}',
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  reverted_at timestamptz
);

create table if not exists public.puc_migracion_mapa (
  id bigint generated always as identity primary key,
  corrida_id uuid not null references public.puc_migracion_corrida (id),
  organization_id integer not null,
  origen text,
  destino text,
  accion text not null check (accion in ('renombrar', 'reclasificar', 'inactivar', 'crear', 'regla', 'mapeo')),
  motivo text,
  sector text,
  detalle jsonb not null default '{}'::jsonb
);

create index if not exists puc_migracion_corrida_org_idx
  on public.puc_migracion_corrida (organization_id, estado);
create index if not exists puc_migracion_mapa_corrida_idx
  on public.puc_migracion_mapa (corrida_id);

comment on table public.puc_migracion_corrida is
  'Cada aplicación del traslado de PUC. Reversible con fn_puc_migracion_revertir.';
comment on table public.puc_migracion_mapa is
  'Qué cuenta, regla o mapeo tocó una corrida, para poder devolverlo.';

alter table public.puc_migracion_corrida enable row level security;
alter table public.puc_migracion_mapa enable row level security;

drop policy if exists puc_migracion_corrida_miembros on public.puc_migracion_corrida;
create policy puc_migracion_corrida_miembros on public.puc_migracion_corrida
  for select to authenticated
  using (organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = auth.uid() and om.is_active = true
  ));

drop policy if exists puc_migracion_mapa_miembros on public.puc_migracion_mapa;
create policy puc_migracion_mapa_miembros on public.puc_migracion_mapa
  for select to authenticated
  using (organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.user_id = auth.uid() and om.is_active = true
  ));

revoke all on table public.puc_migracion_corrida from public, anon;
revoke all on table public.puc_migracion_mapa from public, anon;
grant select on table public.puc_migracion_corrida to authenticated, service_role;
grant select on table public.puc_migracion_mapa to authenticated, service_role;

-- Respaldo tomado una sola vez, antes de renombrar y de reescribir funciones.
create table if not exists public.puc_consolidacion_cuentas (
  organization_id integer not null,
  account_code text not null,
  parent_code text,
  name text not null,
  primary key (organization_id, account_code)
);

create table if not exists public.puc_consolidacion_plantilla (like public.puc_plantilla);

create table if not exists public.puc_consolidacion_funciones (
  firma text primary key,
  definicion text not null
);

revoke all on table public.puc_consolidacion_cuentas from public, anon, authenticated;
revoke all on table public.puc_consolidacion_plantilla from public, anon, authenticated;
revoke all on table public.puc_consolidacion_funciones from public, anon, authenticated;

insert into public.puc_consolidacion_cuentas (organization_id, account_code, parent_code, name)
select c.organization_id, c.account_code, c.parent_code, c.name
from public.chart_of_accounts c
where not exists (select 1 from public.puc_consolidacion_cuentas);

insert into public.puc_consolidacion_plantilla
select p.*
from public.puc_plantilla p
where not exists (select 1 from public.puc_consolidacion_plantilla);

insert into public.puc_consolidacion_funciones (firma, definicion)
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any (array[
    'fn_auto_journal_stock_movement',
    'fn_cuentas_movimiento_stock',
    'fn_puc_validar_cuenta',
    'fn_create_default_chart_of_accounts',
    'fn_create_default_accounting_rules',
    'fn_propuesta_configuracion_sector',
    'fn_clave_cuenta_configurable',
    'fn_asiento_movimiento_caja',
    'fn_auto_journal_bank',
    'fn_traslado_int_asiento',
    'fn_create_branch_subaccounts'
  ])
  and not exists (select 1 from public.puc_consolidacion_funciones);
