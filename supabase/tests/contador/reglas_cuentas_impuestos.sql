-- Prueba aislada de los hallazgos 1 y 2 de la auditoría del Contador (reglas con cuentas inválidas e impuestos).
-- Solo para una base local vacía: borra el esquema public. Datos inventados, sin clientes.
--
-- Uso, desde la raíz del repositorio:
--   psql -p <puerto> -U postgres -d <base> -v ON_ERROR_STOP=1 -f supabase/tests/contador/reglas_cuentas_impuestos.sql
--
-- Copia exacta de producción: fn_assert_acceso_org, fn_tiene_permiso, fn_es_cuenta_de_titulo, fn_tesoreria_fallo_cuenta.
-- Copia reducida a lo que se prueba: fn_clave_cuenta_configurable, fn_cuenta_auxiliar_de_titulo, fn_asiento_tesoreria_elegido.
-- Dobles: auth.uid, auth.role, get_user_permission_codes, fn_centro_defecto, fn_puc_asegurar_cuenta.
-- Las funciones que cambian se instalan con el propio rollback: así se prueba la migración sobre la versión vigente.
-- No cubre el alta real de una empresa con todos sus disparadores: solo la siembra temprana y el cierre del alta.

\set ON_ERROR_STOP on
set client_min_messages = warning;

drop schema if exists public cascade;
drop schema if exists auth cascade;
drop schema if exists prueba cascade;
create schema public;
create schema auth;
create schema prueba;
grant usage on schema public, auth, prueba to public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;

create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable
as $$ select coalesce(nullif(current_setting('test.role', true), ''), '') $$;

-- Estructura mínima, leída de producción.
create table public.organizations (
  id integer primary key, owner_user_id uuid, created_by uuid, type_id integer
);
create table public.organization_members (
  user_id uuid, organization_id integer, is_active boolean default true
);
create table public.chart_of_accounts (
  organization_id integer not null, account_code text not null, name text not null, type text not null,
  parent_code text, is_active boolean default true, es_movimiento boolean,
  requiere_tercero boolean not null default false, requiere_centro_costo boolean not null default false,
  primary key (organization_id, account_code)
);
create table public.accounting_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null,
  name text not null, description text, source_type text not null, event_type text not null,
  debit_account_code text not null, credit_account_code text not null,
  tax_account_code text, discount_account_code text,
  use_tax_from_document boolean default false, is_active boolean not null default true,
  priority smallint default 0, conditions jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.configuracion_contable (
  id bigserial primary key, organization_id integer not null, branch_id integer, clave text not null, account_code text not null
);
create table public.branch_account_mappings (
  organization_id integer, branch_id integer, base_account_code text, sub_account_code text
);
create table public.journal_entries (
  id serial primary key, organization_id integer not null, posted boolean default true
);
create table public.journal_lines (
  id serial primary key, journal_entry_id integer references public.journal_entries(id), account_code text not null,
  debit numeric default 0, credit numeric default 0
);
create table public.categorias_tesoreria (
  id bigint generated always as identity primary key,
  organization_id integer not null, tipo text not null, nombre text not null, icono text not null default 'circle',
  cuenta_sugerida text, padre_id bigint references public.categorias_tesoreria(id),
  activa boolean not null default true, es_predefinida boolean not null default false,
  clave text, orden integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index categorias_tesoreria_org_clave on public.categorias_tesoreria (organization_id, clave) where clave is not null;
create unique index categorias_tesoreria_org_tipo_nombre on public.categorias_tesoreria (organization_id, tipo, lower(nombre));
create table public.bitacora_impuestos_20261027 (
  id bigserial primary key, objeto text not null, organization_id integer, clave text,
  valor_anterior text, valor_nuevo text, creado timestamptz not null default now()
);
create table public.cost_centers (id uuid primary key, organization_id integer, is_active boolean default true);
create table public.cash_movements (
  id bigserial primary key, organization_id integer not null, branch_id integer, type text, concept text,
  amount numeric, notes text, categoria_id bigint references public.categorias_tesoreria(id), cuenta_contable text,
  centro_costo_id uuid, tercero_nit text, tercero_nombre text, soporte_path text
);
create table public.bank_transactions (
  id bigserial primary key, organization_id integer not null, branch_id integer, transaction_type text,
  amount numeric, notes text, categoria_id bigint references public.categorias_tesoreria(id), cuenta_contable text,
  centro_costo_id uuid, tercero_nit text, tercero_nombre text, soporte_path text
);
create table prueba.permisos (user_id uuid, organization_id integer, code text);

-- Copias de producción.
create function public.fn_assert_acceso_org(p_org integer) returns void
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'Acceso denegado a la organización' using errcode = '42501';
    end if;
    return;
  end if;
  if p_org is not null and (
       exists (select 1 from public.organization_members om
               where om.user_id = v_uid and om.organization_id = p_org and om.is_active = true)
    or exists (select 1 from public.organizations o
               where o.id = p_org and (o.owner_user_id = v_uid or o.created_by = v_uid))
  ) then
    return;
  end if;
  raise exception 'Acceso denegado a la organización' using errcode = '42501';
end;
$function$;

create function public.get_user_permission_codes(p_user_id uuid, p_organization_id integer) returns text[]
language sql stable security definer set search_path to 'public', 'prueba', 'pg_temp' as $function$
  select coalesce(array_agg(code), array[]::text[]) from prueba.permisos
   where user_id = p_user_id and organization_id = p_organization_id;
$function$;

create function public.fn_tiene_permiso(p_organization_id integer, p_code text) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select auth.uid() is not null
     and exists (select 1 from public.organization_members om
                  where om.user_id = auth.uid() and om.organization_id = p_organization_id and om.is_active)
     and p_code = any (coalesce(public.get_user_permission_codes(auth.uid(), p_organization_id), array[]::text[]));
$function$;

create function public.fn_es_cuenta_de_titulo(p_organization_id integer, p_cuenta text) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select length(coalesce(p_cuenta, '')) < 4
      or exists (
        select 1
          from public.chart_of_accounts h
         where h.organization_id = p_organization_id
           and coalesce(h.is_active, true)
           and h.account_code <> p_cuenta
           and (
             h.parent_code = p_cuenta
             or left(h.account_code, length(p_cuenta)) = p_cuenta
           )
      );
$function$;
revoke all on function public.fn_es_cuenta_de_titulo(integer, text) from public;

create function public.fn_clave_cuenta_configurable(p_source text, p_lado text, p_codigo text) returns text
language sql immutable set search_path to 'public', 'pg_temp' as $function$
  select case
    when s.code is null then null
    when s.code = '1105' then 'caja'
    when s.code in ('1405', '1435') then 'inventario'
    when s.code in ('4105', '4135', '4110', '414015', '4145') then 'ventas_productos'
    when s.code in ('4235', '4115', '4140', '414005', '414095', '4155') then 'ventas_servicios'
    else null
  end
  from (select nullif(btrim(p_codigo), '') as code, coalesce(btrim(p_source), '') as origen) s;
$function$;

create function public.fn_cuenta_auxiliar_de_titulo(p_org integer, p_branch integer, p_codigo text, p_tarifa numeric default null, p_lado text default null)
returns text language sql stable set search_path to 'public', 'pg_temp' as $function$
  select case nullif(btrim(p_codigo), '') when '2408' then '24080501' else nullif(btrim(p_codigo), '') end;
$function$;

create function public.fn_tesoreria_fallo_cuenta(p_org integer, p_codigo text) returns text
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_activa boolean;
  v_mov boolean;
begin
  select is_active, es_movimiento into v_activa, v_mov
    from public.chart_of_accounts
   where organization_id = p_org and account_code = p_codigo;
  if not found or v_activa is false then
    return format('La cuenta %s no está en el plan contable', p_codigo);
  end if;
  if v_mov is false or public.fn_es_cuenta_de_titulo(p_org, p_codigo) then
    return format('La cuenta %s no es de movimiento', p_codigo);
  end if;
  return null;
end;
$function$;

create function public.fn_asiento_tesoreria_elegido(p_organization_id integer, p_tipo text, p_cuenta_movimiento text, p_cuenta_tesoreria text)
returns table(debito text, credito text, fallo text)
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_mov text := nullif(btrim(p_cuenta_movimiento), '');
  v_tes text := nullif(btrim(p_cuenta_tesoreria), '');
  v_fallo text;
begin
  v_fallo := public.fn_tesoreria_fallo_cuenta(p_organization_id, v_mov);
  if v_fallo is not null then
    return query select null::text, null::text, v_fallo;
    return;
  end if;
  v_fallo := public.fn_tesoreria_fallo_cuenta(p_organization_id, v_tes);
  if v_fallo is not null then
    return query select null::text, null::text, v_fallo;
    return;
  end if;
  if p_tipo = 'out' then
    return query select v_mov, v_tes, null::text;
    return;
  end if;
  return query select v_tes, v_mov, null::text;
end;
$function$;

create function public.fn_centro_defecto(p_org integer, p_branch integer) returns uuid
language sql stable as $function$ select null::uuid $function$;

-- Si la siembra nueva llama esto, la prueba falla: esa era la cuenta inventada.
create function public.fn_puc_asegurar_cuenta(p_organization_id integer, p_codigo text, p_nombre text, p_movimiento boolean)
returns text language plpgsql as $function$
begin
  raise exception 'fn_puc_asegurar_cuenta no debe llamarse desde la siembra';
end;
$function$;

-- Disparadores reales, con función provisional que reemplaza el rollback.
create function public.fn_categorias_tesoreria_guardar() returns trigger language plpgsql as $$ begin return new; end $$;
create function public.fn_validar_datos_tesoreria() returns trigger language plpgsql as $$ begin return new; end $$;
create function public.fn_tesoreria_sembrar_impuestos(p_org integer) returns integer language sql as $$ select 0 $$;
create function public.fn_sembrar_categorias_tesoreria(p_org integer) returns integer language sql as $$ select 0 $$;
create trigger trg_categorias_tesoreria_guardar before insert or delete or update on public.categorias_tesoreria
  for each row execute function public.fn_categorias_tesoreria_guardar();
create trigger trg_validar_datos_tesoreria_caja before insert or update on public.cash_movements
  for each row execute function public.fn_validar_datos_tesoreria();
create trigger trg_validar_datos_tesoreria_banco before insert or update on public.bank_transactions
  for each row execute function public.fn_validar_datos_tesoreria();

\i supabase/rollbacks/20261107101000_tesoreria_impuestos_padre_y_subcategorias_rollback.sql

-- Privilegios y RLS como en producción.
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage on all sequences in schema public to authenticated, service_role;
alter table public.accounting_rules enable row level security;
create policy accounting_rules_org_isolation on public.accounting_rules
  using (organization_id in (
    select organization_members.organization_id from public.organization_members
     where organization_members.user_id = auth.uid() and organization_members.is_active = true));
alter table public.categorias_tesoreria enable row level security;
create policy categorias_org on public.categorias_tesoreria
  using (organization_id in (
    select organization_members.organization_id from public.organization_members
     where organization_members.user_id = auth.uid() and organization_members.is_active = true));

-- Datos inventados. Empresa 10 y 20 con dos planes distintos. U1 solo en 10, U2 en 10 y 20, U3 en 10 sin permisos.
insert into public.organizations (id, type_id) values (10, 3), (20, 3), (30, 3);
insert into public.organization_members (user_id, organization_id) values
  ('00000000-0000-0000-0000-000000000001', 10),
  ('00000000-0000-0000-0000-000000000002', 10),
  ('00000000-0000-0000-0000-000000000002', 20),
  ('00000000-0000-0000-0000-000000000003', 10);
insert into prueba.permisos values
  ('00000000-0000-0000-0000-000000000001', 10, 'finance.view'),
  ('00000000-0000-0000-0000-000000000002', 10, 'finance.view'),
  ('00000000-0000-0000-0000-000000000002', 20, 'finance.view');

insert into public.chart_of_accounts (organization_id, account_code, name, type, parent_code, is_active, es_movimiento) values
  (10, '1105', 'Caja', 'asset', null, true, false),
  (10, '11050501', 'Caja general', 'asset', '1105', true, true),
  (10, '1305', 'Clientes', 'asset', null, true, true),
  (10, '1435', 'Mercancías', 'asset', null, true, false),
  (10, '143505', 'Mercancías sede', 'asset', '1435', true, false),
  (10, '14350501', 'Mercancías bodega', 'asset', '143505', true, true),
  (10, '2365', 'Retención', 'liability', null, true, false),
  (10, '23652501', 'Retención servicios', 'liability', '2365', true, true),
  (10, '23670501', 'ReteIVA', 'liability', null, true, true),
  (10, '23680501', 'ReteICA', 'liability', null, true, true),
  (10, '2408', 'IVA', 'liability', null, true, false),
  (10, '240805', 'IVA generado', 'liability', '2408', true, false),
  (10, '24080501', 'IVA por pagar', 'liability', '240805', true, true),
  (10, '4135', 'Ventas', 'income', null, true, false),
  (10, '413595', 'Ventas otras', 'income', '4135', true, false),
  (10, '41359501', 'Ventas de mercancías', 'income', '413595', true, true),
  (10, '4155', 'Servicios', 'income', null, true, false),
  (10, '415595', 'Servicios otros', 'income', '4155', true, false),
  (10, '41559501', 'Servicios del negocio', 'income', '415595', true, true),
  (10, '4235', 'Servicios ocasionales', 'income', null, true, true),
  (10, '5105', 'Gastos de personal', 'expense', null, true, true),
  (10, '511595', 'Otros impuestos', 'expense', null, true, true),
  (10, '6135', 'Costo', 'expense', null, false, true),
  (20, '1105', 'Caja', 'asset', null, true, true),
  (20, '1305', 'Clientes', 'asset', null, true, true),
  (20, '4135', 'Ventas', 'income', null, true, true),
  (20, '98989898', 'Cuenta solo de la empresa 20', 'expense', null, true, true),
  (20, '511595', 'Otros impuestos', 'expense', null, true, true),
  (30, '1305', 'Clientes', 'asset', null, true, true),
  (30, '1435', 'Mercancías', 'asset', null, true, false),
  (30, '14350501', 'Mercancías bodega', 'asset', '1435', true, true),
  (30, '4135', 'Ventas', 'income', null, true, false),
  (30, '41359501', 'Ventas de mercancías', 'income', '4135', true, true);

insert into public.configuracion_contable (organization_id, clave, account_code) values
  (10, 'inventario', '14350501'),
  (10, 'ventas_productos', '41359501'),
  (10, 'ventas_servicios', '4235'),
  (30, 'inventario', '14350501');

-- Reglas que ya venían mal, como en producción (semilla sin plan).
insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code) values
  (10, 'Compra', 'purchase', 'created', '14350101', '1305'),
  (10, 'Folio alimentos', 'folio_item', 'created', '1305', '4135'),
  (10, 'Folio servicios', 'folio_item', 'created', '1305', '4155'),
  (10, 'Sin evidencia', 'bank', 'adjusted', '77777777', '1305'),
  (20, 'Venta', 'sale', 'created', '1305', '4135'),
  (30, 'Compra nueva', 'purchase', 'created', '14350101', '1305'),
  (30, 'Folio nuevo', 'folio_item', 'created', '1305', '4135');

insert into public.journal_entries (id, organization_id) values (1, 10), (2, 10);
insert into public.journal_lines (journal_entry_id, account_code, debit) values
  (1, '14350501', 100), (2, '14350501', 50);

create table prueba.foto_reglas as
  select md5(string_agg(r::text, '|' order by r.id)) as huella from public.accounting_rules r;

-- Las migraciones.
\i supabase/migrations/20261107100000_reglas_contables_cuentas_invalidas.sql
\i supabase/migrations/20261107101000_tesoreria_impuestos_padre_y_subcategorias.sql

create function prueba.como(p_uid text, p_rol text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('test.uid', p_uid, false);
  perform set_config('test.role', p_rol, false);
end $$;

create function prueba.falla(p_sql text, p_fragmento text, p_caso text) returns void
language plpgsql as $$
declare
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position(p_fragmento in v_msg) = 0 then
      raise exception 'FALLO %: se esperaba «%», llegó «%»', p_caso, p_fragmento, v_msg;
    end if;
    raise notice 'ok  %', p_caso;
    return;
  end;
  raise exception 'FALLO %: la sentencia pasó y debía fallar', p_caso;
end $$;

create function prueba.pasa(p_sql text, p_caso text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise notice 'ok  %', p_caso;
end $$;

create function prueba.igual(p_real text, p_esperado text, p_caso text) returns void
language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    raise exception 'FALLO %: esperado «%», real «%»', p_caso, p_esperado, p_real;
  end if;
  raise notice 'ok  %', p_caso;
end $$;

grant execute on all functions in schema prueba to public;
grant select on all tables in schema prueba to public;

set client_min_messages = notice;

\echo '--- La migración no toca reglas existentes'
select prueba.igual(
  (select md5(string_agg(r::text, '|' order by r.id)) from public.accounting_rules r),
  (select huella from prueba.foto_reglas),
  'reglas idénticas tras aplicar');

\echo '--- Hallazgo 1: cuentas inválidas, como cliente'
select prueba.como('00000000-0000-0000-0000-000000000001');
set role authenticated;

select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code)
  values (10, 'x', 'sale', 'created', '5235', '1305')$$, 'cuenta_no_existe', 'insert con cuenta inexistente');
select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code)
  values (10, 'x', 'sale', 'created', '1305', '4135')$$, 'cuenta_de_titulo', 'insert con título por es_movimiento');
select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code)
  values (10, 'x', 'sale', 'created', '13', '1305')$$, 'cuenta_no_existe', 'código de 2 dígitos que no está en el plan');
select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code)
  values (10, 'x', 'sale', 'created', '6135', '1305')$$, 'cuenta_inactiva', 'insert con cuenta inactiva');
select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code, tax_account_code)
  values (10, 'x', 'sale', 'created', '1305', '41359501', '2408')$$, 'cuenta_de_titulo', 'impuesto de título');
select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code, discount_account_code)
  values (10, 'x', 'sale', 'created', '1305', '41359501', '4175')$$, 'cuenta_no_existe', 'descuento inexistente');
select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code)
  values (10, 'x', 'sale', 'created', '', '1305')$$, 'cuenta_no_existe', 'débito vacío');
select prueba.pasa($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code, tax_account_code)
  values (10, 'Buena', 'sale', 'created', '1305', '41359501', '')$$, 'insert válido, impuesto vacío');
select prueba.igual((select coalesce(tax_account_code, 'null') from public.accounting_rules where name = 'Buena'), 'null', 'impuesto vacío queda null');

select prueba.pasa($$update public.accounting_rules set name = 'Compra 2', is_active = false where name = 'Compra'$$, 'fila mala: cambiar nombre y estado no se bloquea');
select prueba.pasa($$update public.accounting_rules set credit_account_code = '4235' where name = 'Compra 2'$$, 'fila mala: cambiar otra columna válida');
select prueba.pasa($$update public.accounting_rules set debit_account_code = '14350101', credit_account_code = '4235', name = 'Compra' where name = 'Compra 2'$$, 'fila mala: reenviar el mismo código no bloquea');
select prueba.falla($$update public.accounting_rules set debit_account_code = '1435' where name = 'Compra'$$, 'cuenta_de_titulo', 'update que introduce un título');
select prueba.falla($$update public.accounting_rules set credit_account_code = '999' where name = 'Compra'$$, 'cuenta_no_existe', 'update que introduce una inexistente');
select prueba.pasa($$update public.accounting_rules set debit_account_code = '14350501' where name = 'Compra'$$, 'corregir con una cuenta de movimiento');

\echo '--- Hallazgo 1: aislamiento entre empresas'
select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code)
  values (10, 'x', 'sale', 'created', '98989898', '1305')$$, 'cuenta_no_existe', 'la cuenta de otra empresa no sirve');
select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code)
  values (20, 'x', 'sale', 'created', '1305', '4135')$$, 'Acceso denegado', 'insert en empresa ajena');
do $$ declare n integer; begin
  update public.accounting_rules set name = 'hack' where organization_id = 20; get diagnostics n = row_count;
  perform prueba.igual(n::text, '0', 'update en empresa ajena no alcanza filas');
  delete from public.accounting_rules where organization_id = 20; get diagnostics n = row_count;
  perform prueba.igual(n::text, '0', 'delete en empresa ajena no alcanza filas');
end $$;
select prueba.falla($$select public.fn_regla_fallo_cuenta(20, '1305')$$, 'Acceso denegado', 'helper en empresa ajena');
select prueba.falla($$select * from public.fn_reglas_contables_diagnostico(20)$$, 'Acceso denegado', 'diagnóstico de empresa ajena');
select prueba.falla($$select * from public.fn_reglas_cuentas_invalidas(10)$$, 'permission denied', 'núcleo cerrado a authenticated');
select prueba.falla($$select public.fn_reglas_sanear_org_nueva(10)$$, 'permission denied', 'saneamiento cerrado a authenticated');
reset role;

select prueba.como('00000000-0000-0000-0000-000000000002');
set role authenticated;
select prueba.falla($$update public.accounting_rules set organization_id = 20 where name = 'Buena'$$, 'regla_otra_organizacion', 'miembro de dos empresas no mueve una regla');
reset role;

select prueba.como('00000000-0000-0000-0000-000000000003');
set role authenticated;
select prueba.falla($$select * from public.fn_reglas_contables_diagnostico(10)$$, 'SIN_PERMISO', 'diagnóstico sin finance.view');
reset role;

\echo '--- Hallazgo 1: las semillas y funciones internas siguen funcionando'
create function public.prueba_semilla() returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code)
  values (10, 'Semilla sin plan', 'inventory', 'opening', '14350101', '37050501');
  update public.accounting_rules set credit_account_code = '4135' where name = 'Buena';
end $$;
select prueba.como('00000000-0000-0000-0000-000000000001');
set role authenticated;
select prueba.pasa($$select public.prueba_semilla()$$, 'SECURITY DEFINER escribe sin validar (alta de empresa, reversa del PUC)');
reset role;
drop function public.prueba_semilla();
delete from public.accounting_rules where name in ('Semilla sin plan', 'Buena');

select prueba.como('', '');
insert into public.organizations (id, type_id) values (99, 3);
select prueba.igual('ok', 'ok', 'el alta de una empresa no se rompe con el disparador nuevo');
select prueba.como('00000000-0000-0000-0000-000000000002', 'service_role');
set role service_role;
select prueba.falla($$insert into public.accounting_rules (organization_id, name, source_type, event_type, debit_account_code, credit_account_code)
  values (10, 'x', 'sale', 'created', '5235', '1305')$$, 'cuenta_no_existe', 'service_role también se valida');
reset role;

\echo '--- Hallazgo 1: diagnóstico y propuesta'
select prueba.como('00000000-0000-0000-0000-000000000001');
set role authenticated;
create temp table d on commit preserve rows as
  select r.name, x.* from public.fn_reglas_contables_diagnostico(10) x join public.accounting_rules r on r.id = x.regla_id;
select prueba.igual(
  (select propuesta || '/' || evidencia from d where name = 'Folio alimentos'), '41359501/configuracion', 'título con configuración igual al plan');
select prueba.igual(
  (select coalesce(propuesta, 'null') || '/' || evidencia from d where name = 'Folio servicios'), 'null/conflicto', 'configuración y plan distintos: del Contador');
select prueba.igual(
  (select coalesce(propuesta, 'null') || '/' || evidencia from d where name = 'Sin evidencia'), 'null/ninguna', 'sin evidencia: del Contador');
reset role;
insert into public.configuracion_contable (organization_id, clave, account_code) values (10, 'nomina', '77');
select prueba.igual(
  (select propuesta from public.fn_reglas_cuentas_invalidas(30) d join public.accounting_rules r on r.id = d.regla_id where r.name = 'Compra nueva'),
  '14350501', 'inexistente 14350101: clave inventario');
update public.accounting_rules set debit_account_code = '14350101' where name = 'Compra';
select prueba.igual(
  (select propuesta || '/' || evidencia || '/' || usos_propuesta from public.fn_reglas_cuentas_invalidas(10) d join public.accounting_rules r on r.id = d.regla_id where r.name = 'Compra'),
  '14350501/configuracion/2', 'propuesta con asientos reales');
update public.accounting_rules set debit_account_code = '14350501' where name = 'Compra';

\echo '--- Hallazgo 1: empresa nueva'
select prueba.igual(public.fn_reglas_sanear_org_nueva(10)::text, '0', 'empresa con asientos no se toca');
select prueba.igual(public.fn_reglas_sanear_org_nueva(30)::text, '2', 'empresa sin asientos: corrige la semilla');
select prueba.igual(
  (select debit_account_code from public.accounting_rules where name = 'Compra nueva'), '14350501', 'semilla corregida');
select prueba.igual(
  (select count(*)::text from public.fn_reglas_cuentas_invalidas(30)), '0', 'empresa nueva sin reglas inválidas');

\echo '--- Hallazgo 2: siembra sin inventar cuentas'
select prueba.como('', '');
insert into public.categorias_tesoreria (organization_id, tipo, nombre, cuenta_sugerida, es_predefinida, clave)
  select o, 'egreso', 'Impuestos', null, false, null from unnest(array[10, 20]) o where false;
create temp table cuentas_antes on commit preserve rows as select count(*) n from public.chart_of_accounts;
select public.fn_sembrar_categorias_tesoreria(10);
select public.fn_sembrar_categorias_tesoreria(20);
select prueba.igual((select count(*)::text from public.chart_of_accounts), (select n::text from cuentas_antes), 'la siembra no crea cuentas');
select prueba.igual((select coalesce(cuenta_sugerida, 'null') from public.categorias_tesoreria where organization_id = 10 and clave = 'impuestos'), 'null', 'el padre nace sin cuenta');
select prueba.igual(
  (select string_agg(clave || '=' || coalesce(cuenta_sugerida, '-'), ',' order by orden)
     from public.categorias_tesoreria c
    where organization_id = 10 and clave like 'imp\_%'),
  'imp_iva=24080501,imp_inc=-,imp_retefuente=23652501,imp_reteiva=23670501,imp_reteica=23680501,imp_ica=-,imp_renta=-,imp_gasto=-',
  'subcategorías: cuenta solo si existe en el plan');
select prueba.igual(
  (select count(*)::text from public.categorias_tesoreria where organization_id = 20 and clave like 'imp\_%' and cuenta_sugerida is not null), '0',
  'otra empresa con otro plan: sin cuenta');
select prueba.igual(
  (select p.clave from public.categorias_tesoreria c join public.categorias_tesoreria p on p.id = c.padre_id where c.organization_id = 10 and c.clave = 'gmf'),
  'impuestos', 'GMF cuelga del padre y conserva su cuenta');
select prueba.igual(public.fn_tesoreria_sembrar_impuestos(10)::text, '0', 'siembra idempotente');
insert into public.chart_of_accounts (organization_id, account_code, name, type, is_active, es_movimiento)
  values (10, '24120501', 'ICA por pagar', 'liability', true, true);
select public.fn_tesoreria_sembrar_impuestos(10);
select prueba.igual((select cuenta_sugerida from public.categorias_tesoreria where organization_id = 10 and clave = 'imp_ica'), '24120501', 'la cuenta que aparece después se completa');
update public.categorias_tesoreria set cuenta_sugerida = '23680501' where organization_id = 10 and clave = 'imp_ica';
select public.fn_tesoreria_sembrar_impuestos(10);
select prueba.igual((select cuenta_sugerida from public.categorias_tesoreria where organization_id = 10 and clave = 'imp_ica'), '23680501', 'una cuenta ya elegida no se cambia');
select prueba.igual((select count(*)::text from public.bitacora_impuestos_20261027 where objeto = 'subcategoria_nueva' and organization_id = 10), '8', 'bitácora para el rollback');

\echo '--- Hallazgo 2: padre no imputable'
select prueba.como('00000000-0000-0000-0000-000000000001');
set role authenticated;
select prueba.falla($$update public.categorias_tesoreria set cuenta_sugerida = '511595' where organization_id = 10 and clave = 'impuestos'$$,
  'padre_no_imputable', 'el padre no acepta cuenta');
select prueba.pasa($$update public.categorias_tesoreria set nombre = 'Impuestos y tasas' where organization_id = 10 and clave = 'impuestos'$$, 'el padre se puede renombrar');
reset role;
select prueba.como('', '');
create function public.prueba_id(p_org integer, p_clave text) returns bigint language sql stable security definer as
  $$ select id from public.categorias_tesoreria where organization_id = p_org and clave = p_clave $$;

insert into public.cash_movements (organization_id, type, amount, concept, categoria_id)
  select 10, 'out', 5, 'histórico', null;
alter table public.cash_movements disable trigger trg_validar_datos_tesoreria_caja;
update public.cash_movements set categoria_id = public.prueba_id(10, 'impuestos'), concept = 'histórico al padre';
alter table public.cash_movements enable trigger trg_validar_datos_tesoreria_caja;

select prueba.como('00000000-0000-0000-0000-000000000001');
set role authenticated;
select prueba.pasa($$update public.cash_movements set notes = 'nota' where concept = 'histórico al padre'$$, 'lo ya registrado con el padre no se bloquea');
select prueba.falla($$insert into public.cash_movements (organization_id, type, amount, categoria_id, cuenta_contable)
  values (10, 'out', 100, public.prueba_id(10, 'impuestos'), '24080501')$$, 'categoria_no_imputable', 'caja: el padre no se elige');
select prueba.falla($$insert into public.bank_transactions (organization_id, transaction_type, amount, categoria_id, cuenta_contable)
  values (10, 'withdrawal', -100, public.prueba_id(10, 'impuestos'), '24080501')$$, 'categoria_no_imputable', 'banco: el padre no se elige');

\echo '--- Hallazgo 2: subcategorías con cuenta válida'
select prueba.falla($$update public.categorias_tesoreria set cuenta_sugerida = '5105' where id = public.prueba_id(10, 'imp_iva')$$,
  'impuesto_cancela_pasivo', 'subcategoría de pasivo no acepta gasto');
select prueba.falla($$update public.categorias_tesoreria set cuenta_sugerida = '2408' where id = public.prueba_id(10, 'imp_iva')$$,
  'cuenta_no_es_de_movimiento', 'subcategoría no acepta título');
select prueba.falla($$update public.categorias_tesoreria set cuenta_sugerida = null where id = public.prueba_id(10, 'imp_iva')$$,
  'cuenta_obligatoria', 'una cuenta puesta no se quita');
select prueba.pasa($$update public.categorias_tesoreria set activa = false where id = public.prueba_id(10, 'imp_renta')$$, 'sembrada sin cuenta: se puede desactivar');
select prueba.pasa($$update public.categorias_tesoreria set activa = true where id = public.prueba_id(10, 'imp_renta')$$, 'sembrada sin cuenta: se puede activar');
select prueba.pasa($$update public.categorias_tesoreria set cuenta_sugerida = '5105' where id = public.prueba_id(10, 'imp_gasto')$$, 'el impuesto que es gasto sí va a gasto');
select prueba.falla($$insert into public.categorias_tesoreria (organization_id, tipo, nombre, padre_id)
  values (10, 'egreso', 'Predial', public.prueba_id(10, 'impuestos'))$$, 'cuenta_obligatoria', 'subcategoría manual exige cuenta');
select prueba.pasa($$insert into public.categorias_tesoreria (organization_id, tipo, nombre, padre_id, cuenta_sugerida)
  values (10, 'egreso', 'Predial', public.prueba_id(10, 'impuestos'), '511595')$$, 'subcategoría manual con cuenta');

\echo '--- Hallazgo 2: pago de impuesto sin gasto'
select prueba.falla($$insert into public.cash_movements (organization_id, type, amount, categoria_id)
  values (10, 'out', 100, public.prueba_id(10, 'imp_renta'))$$, 'categoria_requiere_cuenta', 'sin cuenta se exige al usar');
select prueba.falla($$insert into public.cash_movements (organization_id, type, amount, categoria_id, cuenta_contable)
  values (10, 'out', 100, public.prueba_id(10, 'imp_iva'), '5105')$$, 'impuesto_cancela_pasivo', 'caja: pago de IVA contra gasto rechazado');
select prueba.falla($$insert into public.bank_transactions (organization_id, transaction_type, amount, categoria_id, cuenta_contable)
  values (10, 'withdrawal', -100, public.prueba_id(10, 'imp_iva'), '5105')$$, 'impuesto_cancela_pasivo', 'banco: pago de IVA contra gasto rechazado');
select prueba.pasa($$insert into public.cash_movements (organization_id, type, amount, categoria_id, cuenta_contable, concept)
  values (10, 'out', 100, public.prueba_id(10, 'imp_iva'), '24080501', 'pago iva')$$, 'caja: pago de IVA contra el pasivo');
select prueba.pasa($$insert into public.bank_transactions (organization_id, transaction_type, amount, categoria_id, cuenta_contable)
  values (10, 'withdrawal', -100, public.prueba_id(10, 'imp_reteica'), '23680501')$$, 'banco: pago de ReteICA contra el pasivo');
select prueba.falla($$update public.cash_movements set cuenta_contable = '5105' where concept = 'pago iva'$$, 'impuesto_cancela_pasivo', 'tampoco al editar');
select prueba.pasa($$insert into public.cash_movements (organization_id, type, amount, categoria_id, cuenta_contable)
  values (10, 'out', 100, public.prueba_id(10, 'gmf'), '511595')$$, 'GMF sigue siendo gasto directo');
select prueba.igual(
  (select a.debito || '/' || a.credito from public.fn_asiento_tesoreria_elegido(10, 'out', '24080501', '11050501') a),
  '24080501/11050501', 'el asiento debita el pasivo y acredita la caja');
select prueba.igual(
  (select count(*)::text from public.fn_asiento_tesoreria_elegido(10, 'out', '24080501', '11050501') a where left(a.debito, 1) = '5' or left(a.credito, 1) = '5'),
  '0', 'ninguna línea en gasto');

\echo '--- Hallazgo 2: aislamiento'
select prueba.falla($$insert into public.cash_movements (organization_id, type, amount, categoria_id, cuenta_contable)
  values (10, 'out', 100, public.prueba_id(20, 'imp_iva'), '24080501')$$, 'categoria_invalida', 'subcategoría de otra empresa');
select prueba.falla($$select public.fn_tesoreria_sembrar_impuestos(30)$$, 'Acceso denegado', 'siembra en empresa ajena');
reset role;
select prueba.como('', '');

\echo '--- Alta de empresa: la cuenta nace después de la siembra'
select prueba.como('', '');
insert into public.organizations (id, type_id) values (98, 3);
select public.fn_sembrar_categorias_tesoreria(98);
select prueba.igual((select coalesce(cuenta_sugerida, 'null') from public.categorias_tesoreria where organization_id = 98 and clave = 'imp_iva'), 'null', 'siembra temprana: aún sin el auxiliar');
insert into public.chart_of_accounts (organization_id, account_code, name, type, is_active, es_movimiento) values
  (98, '24080501', 'IVA por pagar', 'liability', true, true);
select public.fn_tesoreria_sembrar_impuestos(98);
select prueba.igual((select cuenta_sugerida from public.categorias_tesoreria where organization_id = 98 and clave = 'imp_iva'), '24080501', 'el final del alta completa la cuenta');
select prueba.igual((select string_agg(tgname, ',' order by tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relname = 'organizations' and not t.tgisinternal), 'trg_zzzzz_reglas_saneadas,trg_zzzzz_tesoreria_impuestos', 'disparadores nuevos del alta');

\echo '--- Rollback y reaplicación'
\i supabase/rollbacks/20261107101000_tesoreria_impuestos_padre_y_subcategorias_rollback.sql
\i supabase/rollbacks/20261107100000_reglas_contables_cuentas_invalidas_rollback.sql
select prueba.igual(
  (select count(*)::text from pg_trigger where tgname = 'trg_accounting_rules_validar_cuentas'), '0', 'rollback quita el disparador');
select prueba.igual(
  (select count(*)::text from public.categorias_tesoreria where organization_id = 20 and clave like 'imp\_%'), '0', 'rollback borra subcategorías sin movimientos');
select prueba.igual(
  (select count(*)::text from public.categorias_tesoreria where organization_id = 10 and clave = 'imp_iva' and activa = false), '1', 'rollback desactiva la que tiene movimientos');
select prueba.igual(
  (select coalesce(padre_id::text, 'raiz') from public.categorias_tesoreria where organization_id = 10 and clave = 'gmf'), 'raiz', 'rollback devuelve GMF a la raíz');
\i supabase/migrations/20261107100000_reglas_contables_cuentas_invalidas.sql
\i supabase/migrations/20261107101000_tesoreria_impuestos_padre_y_subcategorias.sql
\i supabase/migrations/20261107100000_reglas_contables_cuentas_invalidas.sql
\i supabase/migrations/20261107101000_tesoreria_impuestos_padre_y_subcategorias.sql
select prueba.igual(
  (select count(*)::text from pg_trigger where tgname = 'trg_accounting_rules_validar_cuentas'), '1', 'reaplicar dos veces deja un solo disparador');

\echo 'TODAS LAS PRUEBAS PASARON'
