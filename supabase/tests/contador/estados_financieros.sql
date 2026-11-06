-- Prueba en aislado de los estados financieros (hallazgo 8 del Contador).
-- Se corre con psql contra una base vacía, desde la raíz del repositorio:
--   psql -d <base> -v ON_ERROR_STOP=1 -f supabase/tests/contador/estados_financieros.sql
-- Estructura leída de producción con SELECT. Sin datos de clientes.
-- Funciones reales copiadas: fn_assert_acceso_org, fn_tiene_permiso, monto_base_asiento,
-- reporte_exigir_alcance_sucursal. Stubs: auth.uid, auth.role, fn_timezone_for,
-- get_user_permission_codes (lee t_permisos).

create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public, auth to anon, authenticated, service_role;

create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create table public.organizations (id integer primary key, owner_user_id uuid, created_by uuid);
create table public.organization_members (
  id bigserial primary key, organization_id integer not null, user_id uuid not null,
  is_active boolean default true, is_super_admin boolean default false, role_id integer not null default 3
);
create table public.branches (id integer primary key, organization_id integer not null, name varchar not null, is_active boolean default true);
create table public.member_branches (organization_member_id bigint not null, branch_id integer not null);
create table public.chart_of_accounts (
  account_code text not null, organization_id integer not null, name text not null, type text not null,
  parent_code text, presentacion_niif text, primary key (organization_id, account_code)
);
create table public.journal_entries (
  id serial primary key, organization_id integer not null, branch_id integer not null,
  entry_date timestamptz, memo text, posted boolean, source text, source_id text, fact_key text
);
create table public.journal_lines (
  id serial primary key, journal_entry_id integer not null references public.journal_entries(id),
  organization_id integer not null, account_code text not null, debit numeric, credit numeric,
  exchange_rate numeric, debit_base numeric, credit_base numeric, cost_center_id uuid,
  tercero_nit text, tercero_nombre text
);
create table public.journal_entry_failures (
  id bigserial primary key, organization_id integer not null, entry_date timestamptz,
  amount numeric, reason text not null default 'prueba', resolved_at timestamptz
);
create table public.budgets (
  id uuid primary key default gen_random_uuid(), organization_id integer not null, name text not null,
  fiscal_year integer not null, status text not null default 'draft', approved_by uuid, updated_at timestamptz
);
create table public.budget_lines (
  id uuid primary key default gen_random_uuid(), budget_id uuid not null references public.budgets(id) on delete cascade,
  organization_id integer not null, account_code text not null, period integer, planned_amount numeric not null default 0
);
create table public.fixed_assets (id serial primary key, organization_id integer not null);
create table public.cost_centers (id uuid primary key default gen_random_uuid(), organization_id integer not null, code text, name text);
create table public.t_permisos (user_id uuid, organization_id integer, code text);

create function public.monto_base_asiento(p_monto numeric, p_monto_base numeric, p_tasa numeric)
returns numeric language sql immutable parallel safe set search_path to '' as $function$
  SELECT coalesce(nullif(p_monto_base, 0), coalesce(p_monto, 0) * coalesce(nullif(p_tasa, 0), 1))
$function$;

create function public.get_user_permission_codes(p_user_id uuid, p_organization_id integer)
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(code), '{}') from public.t_permisos
   where user_id = p_user_id and organization_id = p_organization_id;
$$;

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

create function public.fn_tiene_permiso(p_organization_id integer, p_code text) returns boolean
language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select auth.uid() is not null
     and exists (select 1 from public.organization_members om
                  where om.user_id = auth.uid() and om.organization_id = p_organization_id and om.is_active)
     and p_code = any (coalesce(public.get_user_permission_codes(auth.uid(), p_organization_id), array[]::text[]));
$function$;

create function public.fn_timezone_for(p_organization_id integer, p_branch_id integer default null)
returns text language sql stable as $$ select 'America/Bogota'::text $$;

create function public.reporte_exigir_alcance_sucursal(p_organization_id bigint, p_branch_id bigint) returns void
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_member_id bigint;
  v_es_admin boolean;
  v_asignadas integer[];
begin
  select om.id, (om.is_super_admin = true or om.role_id in (1, 2))
    into v_member_id, v_es_admin
  from public.organization_members om
  where om.user_id = (select auth.uid())
    and om.organization_id = p_organization_id
    and om.is_active = true;
  if v_member_id is null then
    raise exception 'ORG_FORBIDDEN' using errcode = '42501';
  end if;
  if v_es_admin then
    return;
  end if;
  select coalesce(array_agg(mb.branch_id), '{}')
    into v_asignadas
  from public.member_branches mb
  join public.branches b on b.id = mb.branch_id
  where mb.organization_member_id = v_member_id
    and b.organization_id = p_organization_id;
  if cardinality(v_asignadas) = 0 then
    return;
  end if;
  if p_branch_id is null then
    if exists (
      select 1 from public.branches b
      where b.organization_id = p_organization_id
        and b.is_active = true
        and b.id <> all (v_asignadas)
    ) then
      raise exception 'BRANCH_SCOPE_REQUIRED' using errcode = '42501';
    end if;
    return;
  end if;
end;
$function$;

\ir ../../migrations/20261107140000_estados_financieros_configuracion.sql
\ir ../../migrations/20261107141000_estados_financieros_motor.sql

-- La versión anterior debe existir antes de reemplazarla, igual que en producción.
\ir ../../rollbacks/20261107142000_presupuesto_contra_real_aprobados_rollback.sql
\ir ../../migrations/20261107142000_presupuesto_contra_real_aprobados.sql
\ir ../../migrations/20261107143000_presupuesto_aprobar.sql

-- Ayudas de la prueba ------------------------------------------------------------------
create table public.t_resultados (id serial primary key, prueba text, ok boolean, detalle text);

create function public.t_org(p_org integer) returns void language plpgsql as $$
begin
  insert into public.organizations(id) values (p_org) on conflict do nothing;
  insert into public.branches(id, organization_id, name) values (p_org, p_org, 'Principal') on conflict do nothing;
end $$;

-- Líneas: 'cuenta:debito:credito[:base]' separadas por ';'. Con base, el importe original
-- va en moneda extranjera y la base es lo que vale en pesos.
create function public.t_asiento(p_org integer, p_fecha date, p_lineas text, p_source text default 'manual',
                                 p_posted boolean default true, p_source_id text default null)
returns integer language plpgsql as $$
declare
  v_id integer;
  v_l text;
  v_p text[];
begin
  perform public.t_org(p_org);
  insert into public.journal_entries(organization_id, branch_id, entry_date, memo, posted, source, source_id)
  values (p_org, p_org, (p_fecha::timestamp + interval '12 hours') at time zone 'America/Bogota', 'prueba', p_posted, p_source, p_source_id)
  returning id into v_id;
  foreach v_l in array string_to_array(p_lineas, ';') loop
    v_p := string_to_array(btrim(v_l), ':');
    insert into public.chart_of_accounts(account_code, organization_id, name, type)
    values (v_p[1], p_org, 'Cuenta ' || v_p[1],
            case left(v_p[1], 1) when '1' then 'asset' when '2' then 'liability' when '3' then 'equity'
                                 when '4' then 'income' else 'expense' end)
    on conflict do nothing;
    insert into public.journal_lines(journal_entry_id, organization_id, account_code, debit, credit, debit_base, credit_base)
    values (v_id, p_org, v_p[1], v_p[2]::numeric, v_p[3]::numeric,
            case when v_p[4] is not null and v_p[2]::numeric <> 0 then v_p[4]::numeric else v_p[2]::numeric end,
            case when v_p[4] is not null and v_p[3]::numeric <> 0 then v_p[4]::numeric else v_p[3]::numeric end);
  end loop;
  return v_id;
end $$;

-- Reversa completa: líneas invertidas, source reversal, como fn_revertir_asiento_nucleo.
create function public.t_reversa(p_org integer, p_entry integer, p_fecha date) returns integer language plpgsql as $$
declare v_id integer;
begin
  insert into public.journal_entries(organization_id, branch_id, entry_date, memo, posted, source, source_id, fact_key)
  values (p_org, p_org, (p_fecha::timestamp + interval '12 hours') at time zone 'America/Bogota', 'REVERSION', true, 'reversal', p_entry::text, 'reversal:' || p_entry)
  returning id into v_id;
  insert into public.journal_lines(journal_entry_id, organization_id, account_code, debit, credit, debit_base, credit_base)
  select v_id, organization_id, account_code, credit, debit, credit_base, debit_base
    from public.journal_lines where journal_entry_id = p_entry;
  return v_id;
end $$;

-- Marcas que un Contador pondría: grupos enteros.
create function public.t_marcas(p_org integer) returns void language plpgsql as $$
declare v_m text[];
begin
  foreach v_m slice 1 in array array[
    ['13','operacion'],['14','operacion'],['22','operacion'],['23','operacion'],['24','operacion'],
    ['25','operacion'],['26','operacion'],['28','operacion'],
    ['12','inversion'],['15','inversion'],['16','inversion'],['4245','inversion'],['5310','inversion'],
    ['21','financiacion'],['31','financiacion'],['32','financiacion'],['33','financiacion'],['36','financiacion'],['37','financiacion']
  ] loop
    insert into public.chart_of_accounts(account_code, organization_id, name, type)
    values (v_m[1], p_org, 'Grupo ' || v_m[1],
            case left(v_m[1], 1) when '1' then 'asset' when '2' then 'liability' when '3' then 'equity'
                                 when '4' then 'income' else 'expense' end)
    on conflict do nothing;
    insert into public.financial_report_account_metadata(organization_id, account_code, categoria_flujo)
    values (p_org, v_m[1], v_m[2]) on conflict do nothing;
  end loop;
end $$;

create function public.t_igual(p_prueba text, p_real numeric, p_esperado numeric) returns void language plpgsql as $$
begin
  insert into public.t_resultados(prueba, ok, detalle)
  values (p_prueba, p_real is not distinct from p_esperado, format('real %s, esperado %s', p_real, p_esperado));
end $$;

create function public.t_si(p_prueba text, p_ok boolean) returns void language plpgsql as $$
begin
  insert into public.t_resultados(prueba, ok, detalle) values (p_prueba, coalesce(p_ok, false), '');
end $$;

-- Suma de los renglones de una sección; grupo y sentido opcionales.
create function public.t_fila(j jsonb, p_seccion text, p_tipo text, p_grupo text default null, p_sentido text default null)
returns numeric language sql immutable as $$
  select coalesce(sum((f ->> 'valor')::numeric), 0)
    from jsonb_array_elements(j -> 'filas') f
   where f ->> 'seccion' = p_seccion and f ->> 'tipo' = p_tipo
     and (p_grupo is null or f ->> 'grupo' = p_grupo)
     and (p_sentido is null or f ->> 'sentido' = p_sentido);
$$;

create function public.t_flujo(p_org integer, p_desde date default '2026-01-01', p_hasta date default '2026-12-31')
returns jsonb language plpgsql as $$
declare j jsonb;
begin
  j := public.fn_estado_flujos_efectivo(p_org, p_desde, p_hasta);
  -- La identidad de todo el estado: inicial + variación + efecto cambiario = final.
  perform public.t_igual('cuadre efectivo org ' || p_org || ' ' || p_desde, (j ->> 'diferencia')::numeric, 0);
  perform public.t_igual('variacion suma org ' || p_org || ' ' || p_desde,
    (j ->> 'efectivo_inicial')::numeric + (j ->> 'variacion')::numeric + (j ->> 'efecto_cambiario')::numeric,
    (j ->> 'efectivo_final')::numeric);
  return j;
end $$;

create function public.t_patrimonio(p_org integer, p_desde date default '2026-01-01', p_hasta date default '2026-12-31')
returns jsonb language plpgsql as $$
declare j jsonb;
begin
  j := public.fn_estado_cambios_patrimonio(p_org, p_desde, p_hasta);
  perform public.t_igual('cuadre patrimonio org ' || p_org || ' ' || p_desde, (j ->> 'diferencia')::numeric, 0);
  return j;
end $$;

create function public.t_valor(j jsonb, p_clave text, p_columna text) returns numeric language sql immutable as $$
  select coalesce((select (f -> 'valores' ->> p_columna)::numeric
                     from jsonb_array_elements(j -> 'filas') f where f ->> 'clave' = p_clave), 0);
$$;

select set_config('test.role', 'service_role', false);

-- Casos -------------------------------------------------------------------------------
do $$
declare j jsonb; p jsonb; e integer; e2 integer;
begin
  -- 1. Activo de contado: es inversión y no toca la operación.
  perform t_marcas(1); perform t_org(1);
  perform t_asiento(1, '2025-06-01', '1110:5000:0;3115:0:5000');
  perform t_asiento(1, '2026-02-01', '1524:1000:0;1110:0:1000');
  j := t_flujo(1);
  perform t_igual('contado: inversión', (j ->> 'inversion')::numeric, -1000);
  perform t_igual('contado: operación', (j ->> 'operacion')::numeric, 0);
  perform t_igual('contado: renglón salida 15', t_fila(j, 'inversion', 'movimiento', '15', 'salida'), -1000);
  perform t_igual('contado: inicial', (j ->> 'efectivo_inicial')::numeric, 5000);
  perform t_igual('contado: final', (j ->> 'efectivo_final')::numeric, 4000);

  -- 2. Activo a crédito de proveedor: sin efectivo, no es inversión ni capital de trabajo.
  perform t_marcas(2);
  perform t_asiento(2, '2025-06-01', '1110:5000:0;3115:0:5000');
  perform t_asiento(2, '2026-02-01', '1524:1000:0;2205:0:1000');
  j := t_flujo(2);
  perform t_igual('crédito: inversión', (j ->> 'inversion')::numeric, 0);
  perform t_igual('crédito: operación', (j ->> 'operacion')::numeric, 0);
  perform t_igual('crédito: sin renglón proveedores', t_fila(j, 'operacion', 'variacion', '22'), 0);
  perform t_igual('crédito: revelado sin efectivo', (j -> 'sin_efectivo' -> 0 ->> 'monto')::numeric, 1000);

  -- 3. Activo pagado a medias: solo lo pagado es inversión.
  perform t_marcas(3);
  perform t_asiento(3, '2025-06-01', '1110:5000:0;3115:0:5000');
  perform t_asiento(3, '2026-02-01', '1524:1000:0;1110:0:300;2205:0:700');
  j := t_flujo(3);
  perform t_igual('a medias: inversión', (j ->> 'inversion')::numeric, -300);
  perform t_igual('a medias: operación', (j ->> 'operacion')::numeric, 0);
  perform t_igual('a medias: sin efectivo', (j -> 'sin_efectivo' -> 0 ->> 'monto')::numeric, 700);

  -- 4. Activo financiado con banco y préstamo con intereses.
  perform t_marcas(4);
  perform t_asiento(4, '2025-06-01', '1110:5000:0;3115:0:5000');
  perform t_asiento(4, '2026-02-01', '1524:1000:0;2105:0:1000');
  perform t_asiento(4, '2026-03-01', '1110:2000:0;2105:0:2000');
  perform t_asiento(4, '2026-04-01', '2105:400:0;530520:50:0;1110:0:450');
  j := t_flujo(4);
  perform t_igual('préstamo: inversión', (j ->> 'inversion')::numeric, 0);
  perform t_igual('préstamo: entrada', t_fila(j, 'financiacion', 'movimiento', '21', 'entrada'), 2000);
  perform t_igual('préstamo: abono', t_fila(j, 'financiacion', 'movimiento', '21', 'salida'), -400);
  perform t_igual('préstamo: intereses en operación por política', (j ->> 'operacion')::numeric, -50);
  perform t_igual('préstamo: utilidad', (j ->> 'utilidad')::numeric, -50);
  perform public.fn_estados_configuracion_guardar(4, '{"version":0,"politicas_flujo":{"intereses_pagados":"financiacion"}}');
  j := t_flujo(4);
  perform t_igual('política financiación: operación', (j ->> 'operacion')::numeric, 0);
  perform t_igual('política financiación: financiación', (j ->> 'financiacion')::numeric, 1550);
  perform t_igual('política financiación: utilidad igual', (j ->> 'utilidad')::numeric, -50);
  perform t_si('política sin confirmar', (j ->> 'politicas_confirmadas')::boolean = false);

  -- 5. Depreciación y venta: la depreciación es ajuste y la utilidad sale de operación.
  perform t_marcas(5);
  perform t_asiento(5, '2025-06-01', '1110:5000:0;3115:0:5000');
  perform t_asiento(5, '2025-07-01', '1524:1000:0;1110:0:1000');
  perform t_asiento(5, '2026-02-01', '516010:100:0;1592:0:100');
  perform t_asiento(5, '2026-03-01', '1110:950:0;1592:100:0;1524:0:1000;4245:0:50');
  j := t_flujo(5);
  perform t_igual('venta: utilidad neta', (j ->> 'utilidad')::numeric, -50);
  perform t_igual('venta: depreciación suma', t_fila(j, 'operacion', 'ajuste', 'depreciacion_amortizacion'), 100);
  perform t_igual('venta: utilidad en venta resta', t_fila(j, 'operacion', 'ajuste', 'venta_activos'), -50);
  perform t_igual('venta: operación', (j ->> 'operacion')::numeric, 0);
  perform t_igual('venta: cobro en inversión', t_fila(j, 'inversion', 'movimiento', '15', 'entrada'), 950);
  perform t_igual('venta: sin revelación de depreciación', jsonb_array_length(j -> 'sin_efectivo'), 0);

  -- 6. Aportes y dividendos. El dividendo no es gasto.
  perform t_marcas(6);
  perform t_asiento(6, '2026-01-10', '1110:3000:0;3115:0:3000');
  perform t_asiento(6, '2026-02-01', '1110:1000:0;4135:0:1000');
  perform t_asiento(6, '2026-03-01', '3705:500:0;2360:0:500');
  perform t_asiento(6, '2026-04-01', '2360:500:0;1110:0:500');
  j := t_flujo(6); p := t_patrimonio(6);
  perform t_igual('dividendos: aporte', t_fila(j, 'financiacion', 'movimiento', '31', 'entrada'), 3000);
  perform t_igual('dividendos: pago', t_fila(j, 'financiacion', 'movimiento', '23', 'salida'), -500);
  perform t_igual('dividendos: decreto sin efectivo no cambia utilidad', (j ->> 'utilidad')::numeric, 1000);
  perform t_igual('patrimonio: aportes', t_valor(p, 'aportes', '31'), 3000);
  perform t_igual('patrimonio: dividendos contra 37', t_valor(p, 'dividendos', '37'), -500);
  perform t_igual('patrimonio: resultado', t_valor(p, 'resultado', '36'), 1000);
  perform t_igual('patrimonio: saldo final', (p ->> 'saldo_final')::numeric, 3500);

  -- 7. Anticipos y dinero de terceros.
  perform t_marcas(7);
  perform t_asiento(7, '2026-01-10', '1110:1190:0;2805:0:1190');
  perform t_asiento(7, '2026-02-10', '2805:1190:0;4135:0:1000;2408:0:190');
  perform t_asiento(7, '2026-03-10', '1110:300:0;2815:0:300');
  j := t_flujo(7);
  perform t_igual('anticipo: utilidad al aplicar', (j ->> 'utilidad')::numeric, 1000);
  perform t_igual('anticipo: variación 28 incluye terceros', t_fila(j, 'operacion', 'variacion', '28'), 300);
  perform t_igual('anticipo: variación 24', t_fila(j, 'operacion', 'variacion', '24'), 190);
  perform t_igual('anticipo: operación igual al efectivo', (j ->> 'operacion')::numeric, 1490);

  -- 8. Transferencias entre bancos: no aparecen. La comisión sí es gasto.
  perform t_marcas(8);
  perform t_asiento(8, '2025-06-01', '1110:5000:0;3115:0:5000');
  perform t_asiento(8, '2026-02-01', '1120:700:0;1110:0:700', 'bank_transfers');
  perform t_asiento(8, '2026-02-02', '1120:100:0;530505:5:0;1110:0:105', 'bank_transfers');
  j := t_flujo(8);
  perform t_igual('transferencia: operación es la comisión', (j ->> 'operacion')::numeric, -5);
  perform t_igual('transferencia: inversión', (j ->> 'inversion')::numeric, 0);
  perform t_igual('transferencia: financiación', (j ->> 'financiacion')::numeric, 0);
  perform t_igual('transferencia: variación', (j ->> 'variacion')::numeric, -5);

  -- 9. Divisas: revaluación de caja en efecto cambiario; la diferencia realizada es del pago.
  perform t_marcas(9);
  perform t_asiento(9, '2026-01-10', '111005:100:0:400000;3115:0:400000');
  perform t_asiento(9, '2026-02-10', '111005:20000:0;421020:0:20000');
  perform t_asiento(9, '2026-03-10', '1435:380000:0;2205:0:380000');
  perform t_asiento(9, '2026-04-10', '2205:380000:0;530525:10000:0;111005:0:390000');
  j := t_flujo(9);
  perform t_igual('divisas: efecto cambiario', (j ->> 'efecto_cambiario')::numeric, 20000);
  perform t_igual('divisas: diferencia no realizada sale de operación', t_fila(j, 'operacion', 'ajuste', 'diferencia_cambio'), -20000);
  perform t_igual('divisas: operación', (j ->> 'operacion')::numeric, -390000);
  perform t_igual('divisas: aporte en base', (j ->> 'financiacion')::numeric, 400000);
  perform t_igual('divisas: final', (j ->> 'efectivo_final')::numeric, 30000);

  -- 10. Notas crédito, sin efectivo hasta el cobro.
  perform t_marcas(10);
  perform t_asiento(10, '2026-01-10', '1305:1190:0;4135:0:1000;2408:0:190', 'invoice_sales');
  perform t_asiento(10, '2026-02-10', '4175:500:0;2408:95:0;1305:0:595', 'credit_note');
  perform t_asiento(10, '2026-03-10', '1110:595:0;1305:0:595', 'payments');
  j := t_flujo(10);
  perform t_igual('nota crédito: utilidad', (j ->> 'utilidad')::numeric, 500);
  perform t_igual('nota crédito: cartera neta', t_fila(j, 'operacion', 'variacion', '13'), 0);
  perform t_igual('nota crédito: impuesto', t_fila(j, 'operacion', 'variacion', '24'), 95);
  perform t_igual('nota crédito: operación', (j ->> 'operacion')::numeric, 595);

  -- 11. Anulación: dentro del periodo no queda nada; partida en dos, cada uno lo suyo.
  perform t_marcas(11);
  e := t_asiento(11, '2026-03-10', '1110:1000:0;4135:0:1000', 'sales');
  perform t_reversa(11, e, '2026-04-10');
  j := t_flujo(11);
  perform t_igual('anulación: año sin efecto', (j ->> 'operacion')::numeric, 0);
  j := t_flujo(11, '2026-01-01', '2026-03-31');
  perform t_igual('anulación: antes de la reversa', (j ->> 'operacion')::numeric, 1000);
  j := t_flujo(11, '2026-04-01', '2026-12-31');
  perform t_igual('anulación: al revertir', (j ->> 'operacion')::numeric, -1000);
  perform t_igual('anulación: inicial del segundo tramo', (j ->> 'efectivo_inicial')::numeric, 1000);
  p := t_patrimonio(11, '2026-04-01', '2026-12-31');
  perform t_igual('anulación: patrimonio', (p ->> 'saldo_final')::numeric, 0);

  -- 12. Pendientes: borrador y fallo no entran y se avisan; sin marcas nada se adivina.
  perform t_org(12);
  perform t_asiento(12, '2025-06-01', '1110:5000:0;3115:0:5000');
  perform t_asiento(12, '2026-02-01', '1305:1000:0;4135:0:1000');
  perform t_asiento(12, '2026-03-01', '1110:800:0;1305:0:800');
  perform t_asiento(12, '2026-04-01', '1524:600:0;1110:0:600');
  perform t_asiento(12, '2026-05-01', '1110:9999:0;4135:0:9999', 'manual', false);
  insert into journal_entry_failures(organization_id, entry_date, amount) values (12, '2026-05-02', 250);
  j := t_flujo(12);
  perform t_igual('pendiente: borrador no suma', (j ->> 'utilidad')::numeric, 1000);
  perform t_igual('pendiente: aviso borradores', ((j -> 'avisos') ->> 'borradores')::numeric, 1);
  perform t_igual('pendiente: aviso fallos', ((j -> 'avisos') ->> 'fallos')::numeric, 1);
  perform t_igual('pendiente: inversión no se adivina', (j ->> 'inversion')::numeric, 0);
  perform t_igual('pendiente: total', (j ->> 'pendiente')::numeric, -800);
  perform t_igual('pendiente: cuentas', jsonb_array_length(j -> 'pendientes_cuentas'), 2);
  perform t_si('pendiente: 11 queda como propuesta', (j -> 'cuentas_efectivo' -> 0 ->> 'propuesta')::boolean);
  perform t_igual('pendiente: marcas no guardadas', (select count(*) from financial_report_account_metadata where organization_id = 12), 0);

  -- 13. Efectivo restringido y equivalente.
  perform t_marcas(13);
  insert into chart_of_accounts(account_code, organization_id, name, type) values
    ('1125', 13, 'Fondos', 'asset'), ('120505', 13, 'CDT a 90 días', 'asset');
  insert into financial_report_account_metadata(organization_id, account_code, clase_efectivo, categoria_flujo, plazo_meses)
  values (13, '1125', 'restringido', 'inversion', null), (13, '120505', 'equivalente', null, 3);
  perform t_asiento(13, '2025-06-01', '1110:5000:0;3115:0:5000');
  perform t_asiento(13, '2026-02-01', '1125:300:0;1110:0:300');
  perform t_asiento(13, '2026-03-01', '120505:200:0;1110:0:200');
  j := t_flujo(13);
  perform t_igual('restringido: fuera del efectivo', (j ->> 'efectivo_final')::numeric, 4700);
  perform t_igual('restringido: saldo aparte', ((j -> 'restringido') ->> 'final')::numeric, 300);
  perform t_igual('restringido: traslado sale por su categoría', (j ->> 'inversion')::numeric, -300);
  perform t_igual('equivalente: no es movimiento', (j ->> 'variacion')::numeric, -300);

  -- 14. Asiento de cierre: no duplica la utilidad ni la deja en cero.
  perform t_marcas(14);
  perform t_asiento(14, '2025-06-01', '1110:5000:0;3115:0:5000');
  perform t_asiento(14, '2026-02-01', '1110:1000:0;4135:0:1000');
  perform t_asiento(14, '2026-03-01', '5135:300:0;1110:0:300');
  j := t_flujo(14); p := t_patrimonio(14);
  perform t_igual('antes del cierre: utilidad', (j ->> 'utilidad')::numeric, 700);
  e := t_asiento(14, '2026-12-31', '4135:1000:0;3605:0:1000', 'cierre_ejercicio');
  e2 := t_asiento(14, '2026-12-31', '3605:300:0;5135:0:300', 'cierre_ejercicio');
  j := t_flujo(14); p := t_patrimonio(14);
  perform t_igual('con cierre: utilidad igual', (j ->> 'utilidad')::numeric, 700);
  perform t_igual('con cierre: operación igual', (j ->> 'operacion')::numeric, 700);
  perform t_igual('con cierre: renglón resultado', t_valor(p, 'resultado', '36'), 700);
  perform t_igual('con cierre: patrimonio', (p ->> 'saldo_final')::numeric, 5700);
  perform t_igual('con cierre: resultado integral', (fn_estado_resultado_integral(14, '2026-01-01', '2026-12-31') ->> 'utilidad')::numeric, 700);
  perform t_asiento(14, '2027-03-01', '3605:700:0;3705:0:700');
  j := t_flujo(14, '2027-01-01', '2027-12-31'); p := t_patrimonio(14, '2027-01-01', '2027-12-31');
  perform t_igual('año siguiente: resultado cero', (j ->> 'utilidad')::numeric, 0);
  perform t_igual('año siguiente: traslado', t_valor(p, 'traslado', '37'), 700);
  perform t_igual('año siguiente: total sin cambio', (p ->> 'saldo_final')::numeric, 5700);
  perform t_reversa(14, e, '2027-02-01');
  perform t_reversa(14, e2, '2027-02-01');
  j := t_flujo(14, '2027-01-01', '2027-12-31');
  perform t_igual('reversa del cierre tampoco es resultado', (j ->> 'utilidad')::numeric, 0);

  -- 15. Resultado abierto de años anteriores en el saldo inicial, sin cierre.
  perform t_org(15);
  perform t_asiento(15, '2025-06-01', '1110:800:0;4135:0:800');
  p := t_patrimonio(15);
  perform t_igual('saldo inicial con resultado abierto', t_valor(p, 'saldo_inicial', '36'), 800);

  -- 16. Venta a crédito de un activo: la cartera no entra al capital de trabajo.
  perform t_marcas(16);
  perform t_asiento(16, '2025-06-01', '1524:1000:0;3115:0:1000');
  perform t_asiento(16, '2026-02-01', '1355:1100:0;1524:0:1000;4245:0:100');
  j := t_flujo(16);
  perform t_igual('venta a crédito: utilidad ajustada', t_fila(j, 'operacion', 'ajuste', 'venta_activos'), -100);
  perform t_igual('venta a crédito: sin cartera', t_fila(j, 'operacion', 'variacion', '13'), 0);
  perform t_igual('venta a crédito: operación', (j ->> 'operacion')::numeric, 0);
  perform t_igual('venta a crédito: inversión', (j ->> 'inversion')::numeric, 0);

  -- 16b. Venta a crédito con depreciación acumulada: se revela como operación sin efectivo.
  perform t_marcas(21);
  perform t_asiento(21, '2025-06-01', '1524:1000:0;3115:0:1000');
  perform t_asiento(21, '2026-02-01', '1355:900:0;1592:200:0;1524:0:1000;4245:0:100');
  j := t_flujo(21);
  perform t_igual('venta a crédito con 1592: revelada', (j -> 'sin_efectivo' -> 0 ->> 'monto')::numeric, 900);

  -- 18. Deuda por activos en su propia cuenta marcada: el pago posterior es inversión.
  perform t_marcas(18);
  perform t_asiento(18, '2025-06-01', '1110:5000:0;3115:0:5000');
  insert into chart_of_accounts(account_code, organization_id, name, type) values ('233595', 18, 'Acreedores de activos', 'liability');
  insert into financial_report_account_metadata(organization_id, account_code, categoria_flujo) values (18, '233595', 'inversion');
  perform t_asiento(18, '2026-02-01', '1524:1000:0;233595:0:1000');
  j := t_flujo(18, '2026-01-01', '2026-02-28');
  perform t_igual('deuda de activos: compra sin efectivo', (j ->> 'inversion')::numeric, 0);
  perform t_asiento(18, '2026-05-01', '233595:1000:0;1110:0:1000');
  j := t_flujo(18);
  perform t_igual('deuda de activos: pago es inversión', (j ->> 'inversion')::numeric, -1000);
  perform t_igual('deuda de activos: operación', (j ->> 'operacion')::numeric, 0);

  -- 19. Marca más precisa que la política: el Contador manda sobre su propio prefijo.
  perform t_marcas(19);
  insert into chart_of_accounts(account_code, organization_id, name, type) values ('2360', 19, 'Dividendos por pagar', 'liability');
  insert into financial_report_account_metadata(organization_id, account_code, categoria_flujo) values (19, '2360', 'operacion');
  perform t_asiento(19, '2026-03-01', '2360:100:0;1110:0:100');
  j := t_flujo(19);
  perform t_igual('marca igual de precisa gana', (j ->> 'operacion')::numeric, -100);

  -- 17. Cuentas de orden no afectan nada; dos reversas no rompen el cuadre.
  perform t_marcas(17);
  perform t_asiento(17, '2026-02-01', '8105:100:0;8205:0:100');
  j := t_flujo(17);
  perform t_igual('orden: sin efecto', (j ->> 'pendiente')::numeric, 0);
end $$;

-- Cuadre con todo junto: una empresa con todos los eventos del año y su cierre.
do $$
declare j jsonb; p jsonb; r jsonb; b jsonb; i jsonb; v_ori numeric;
begin
  perform t_marcas(20);
  perform t_asiento(20, '2025-01-15', '1110:20000:0;3115:0:20000');
  perform t_asiento(20, '2025-03-15', '1435:6000:0;2205:0:6000');
  perform t_asiento(20, '2025-05-15', '1305:5950:0;4135:0:5000;2408:0:950');
  perform t_asiento(20, '2025-05-15', '6135:3000:0;1435:0:3000');
  perform t_asiento(20, '2025-12-31', '4135:5000:0;3605:0:5000', 'cierre_ejercicio');
  perform t_asiento(20, '2025-12-31', '3605:3000:0;6135:0:3000', 'cierre_ejercicio');
  -- 2026
  perform t_asiento(20, '2026-01-20', '3605:2000:0;3705:0:2000');
  perform t_asiento(20, '2026-02-01', '1110:5950:0;1305:0:5950');
  perform t_asiento(20, '2026-02-10', '2205:6000:0;1110:0:6000');
  perform t_asiento(20, '2026-03-01', '1524:4000:0;1110:0:1500;2105:0:2500');
  perform t_asiento(20, '2026-03-15', '1110:3000:0;2105:0:3000');
  perform t_asiento(20, '2026-04-01', '2105:500:0;530520:80:0;1110:0:580');
  perform t_asiento(20, '2026-05-01', '1110:2380:0;4135:0:2000;2408:0:380');
  perform t_asiento(20, '2026-05-01', '1305:4760:0;4135:0:4000;2408:0:760');
  perform t_asiento(20, '2026-05-02', '4175:1000:0;2408:190:0;1305:0:1190', 'credit_note');
  perform t_asiento(20, '2026-06-01', '516010:400:0;1592:0:400');
  perform t_asiento(20, '2026-07-01', '1110:600:0;2805:0:600');
  perform t_asiento(20, '2026-08-01', '1110:900:0;1592:200:0;1524:0:1000;4245:0:100');
  perform t_asiento(20, '2026-09-01', '3705:700:0;2360:0:700');
  perform t_asiento(20, '2026-10-01', '2360:300:0;1110:0:300');
  perform t_asiento(20, '2026-10-02', '1120:1000:0;1110:0:1000');
  perform t_asiento(20, '2026-11-01', '5205:1500:0;2505:0:1500');
  perform t_asiento(20, '2026-11-30', '2505:1500:0;1110:0:1500');
  perform t_asiento(20, '2026-12-01', '1110:2000:0;3115:0:2000');
  perform t_asiento(20, '2026-12-10', '5405:300:0;2404:0:300');
  j := t_flujo(20); p := t_patrimonio(20);
  r := fn_estado_resultado_integral(20, '2026-01-01', '2026-12-31');
  b := fn_libro_inventarios_balances(20, '2026-12-31', 4);
  i := fn_indicadores_financieros_base(20, '2026-01-01', '2026-12-31');
  perform t_igual('todo: utilidad igual en flujo y resultado', (j ->> 'utilidad')::numeric, (r ->> 'utilidad')::numeric);
  perform t_igual('todo: utilidad en patrimonio', t_valor(p, 'resultado', '36'), (r ->> 'utilidad')::numeric);
  perform t_igual('todo: utilidad neta esperada', (r ->> 'utilidad')::numeric, 2820);
  perform t_igual('todo: patrimonio con balance', (p ->> 'saldo_final')::numeric,
    (b ->> 'patrimonio')::numeric + (b ->> 'resultado_abierto')::numeric);
  perform t_igual('todo: efectivo con balance', (j ->> 'efectivo_final')::numeric,
    (select sum((f ->> 'saldo')::numeric) from jsonb_array_elements(b -> 'filas') f where f ->> 'codigo' like '11%'));
  perform t_igual('todo: ecuación contable', (b ->> 'activo')::numeric,
    (b ->> 'pasivo')::numeric + (b ->> 'patrimonio')::numeric + (b ->> 'resultado_abierto')::numeric);
  perform t_igual('todo: efectivo final', (j ->> 'efectivo_final')::numeric, 24950);
  perform t_igual('todo: pendiente cero', (j ->> 'pendiente')::numeric, 0);
  perform t_igual('todo: inversión', (j ->> 'inversion')::numeric, -600);
  perform t_igual('todo: financiación', (j ->> 'financiacion')::numeric, 4200);
  perform t_igual('todo: indicadores activo', (i ->> 'activo')::numeric, (b ->> 'activo')::numeric);
  perform t_igual('todo: indicadores ingresos netos de devolución', (i ->> 'ingresos')::numeric, 5000);
  perform t_igual('todo: mayor cuadra', (fn_libro_mayor_balances(20, '2026-01-01', '2026-12-31', 4) ->> 'debitos')::numeric,
    (fn_libro_mayor_balances(20, '2026-01-01', '2026-12-31', 4) ->> 'creditos')::numeric);
  perform t_igual('todo: líneas paginadas', jsonb_array_length(fn_libro_lineas(20, '2026-01-01', '2026-12-31', 0, 5)), 5);
  perform t_igual('todo: resumen por centro', (fn_libro_resumen(20, '2026-01-01', '2026-12-31', 'centro') -> 0 ->> 'debitos')::numeric,
    (fn_libro_mayor_balances(20, '2026-01-01', '2026-12-31', 4) ->> 'debitos')::numeric);
end $$;

-- Presupuesto: aprobados, real por prefijo, sin cierre.
do $$
declare v_b uuid; v_u uuid := gen_random_uuid(); j jsonb; f jsonb;
begin
  perform t_org(30);
  insert into auth.users values (v_u);
  insert into organization_members(organization_id, user_id, role_id) values (30, v_u, 1);
  perform t_asiento(30, '2026-02-01', '510506:900:0;1110:0:900');
  perform t_asiento(30, '2026-02-01', '1110:2000:0;4135:0:2000');
  perform t_asiento(30, '2026-02-02', '5135:50:0;1110:0:50');
  perform t_asiento(30, '2026-02-28', '3605:900:0;510506:0:900', 'cierre_ejercicio');
  insert into chart_of_accounts(account_code, organization_id, name, type) values ('5105', 30, 'Gastos de personal', 'expense');
  insert into budgets(organization_id, name, fiscal_year, status) values (30, 'Aprobado', 2026, 'approved') returning id into v_b;
  insert into budget_lines(budget_id, organization_id, account_code, period, planned_amount) values (v_b, 30, '5105', 2, 1000);
  insert into budgets(organization_id, name, fiscal_year, status) values (30, 'Borrador', 2026, 'draft') returning id into v_b;
  insert into budget_lines(budget_id, organization_id, account_code, period, planned_amount) values (v_b, 30, '5105', 2, 7777);
  perform set_config('test.uid', v_u::text, false);
  j := fn_reporte_presupuesto_vs_real(30, '2026-02-01 00:00-05', '2026-02-28 23:59:59-05');
  perform set_config('test.uid', '', false);
  select x into f from jsonb_array_elements(j -> 'detalle') x where x ->> 'cuenta' = '5105';
  perform t_igual('presupuesto: solo aprobado', (f ->> 'presupuesto')::numeric, 1000);
  perform t_igual('presupuesto: real por prefijo y sin cierre', (f ->> 'real')::numeric, 900);
  perform t_igual('presupuesto: borradores avisados', (j ->> 'borradores')::numeric, 1);
  select x into f from jsonb_array_elements(j -> 'detalle') x where x ->> 'cuenta' = '4135';
  perform t_igual('presupuesto: ingreso sin presupuesto queda', (f ->> 'real')::numeric, 2000);
  perform t_si('presupuesto: no presupuestada', (f ->> 'presupuestada')::boolean = false);
  perform fn_presupuesto_aprobar(30, v_b);
  perform t_igual('aprobar: pasa de borrador a aprobado', (select count(*) from budgets where id = v_b and status = 'approved'), 1);
  perform set_config('test.uid', v_u::text, false);
  j := fn_reporte_presupuesto_vs_real(30, '2026-02-01 00:00-05', '2026-02-28 23:59:59-05');
  perform set_config('test.uid', '', false);
  select x into f from jsonb_array_elements(j -> 'detalle') x where x ->> 'cuenta' = '5105';
  perform t_igual('aprobar: ya cuenta', (f ->> 'presupuesto')::numeric, 8777);
  perform t_si('aprobar: avisa dos en el año', (j ->> 'varios_por_anio')::boolean);
end $$;

-- Seguridad ---------------------------------------------------------------------------
create function public.t_niega(p_prueba text, p_sql text, p_estado text default '42501') returns void language plpgsql as $$
declare v_estado text;
begin
  begin
    execute p_sql;
    insert into public.t_resultados(prueba, ok, detalle) values (p_prueba, false, 'no negó');
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate;
    insert into public.t_resultados(prueba, ok, detalle) values (p_prueba, v_estado = p_estado, v_estado || ' ' || sqlerrm);
  end;
end $$;
grant all on public.t_resultados, public.t_resultados_id_seq to anon, authenticated;
grant execute on function public.t_niega(text, text, text) to anon, authenticated;

do $$
declare
  u_lector uuid := gen_random_uuid(); u_aprueba uuid := gen_random_uuid();
  u_ajeno uuid := gen_random_uuid(); u_sede uuid := gen_random_uuid(); u_nada uuid := gen_random_uuid();
  m bigint;
begin
  perform t_marcas(40); perform t_org(41);
  perform t_asiento(40, '2026-02-01', '1110:100:0;3115:0:100');
  insert into branches(id, organization_id, name) values (401, 40, 'Otra');
  insert into auth.users values (u_lector), (u_aprueba), (u_ajeno), (u_sede), (u_nada);
  insert into organization_members(organization_id, user_id, role_id) values
    (40, u_lector, 3), (40, u_aprueba, 3), (41, u_ajeno, 3), (40, u_nada, 3);
  insert into organization_members(organization_id, user_id, role_id) values (40, u_sede, 3) returning id into m;
  insert into member_branches values (m, 40);
  insert into t_permisos values (u_lector, 40, 'finance.view'), (u_aprueba, 40, 'finance.view'),
    (u_aprueba, 40, 'finance.approve'), (u_ajeno, 41, 'finance.view'), (u_ajeno, 41, 'finance.approve'),
    (u_sede, 40, 'finance.view');
  perform set_config('t.lector', u_lector::text, false);
  perform set_config('t.aprueba', u_aprueba::text, false);
  perform set_config('t.ajeno', u_ajeno::text, false);
  perform set_config('t.sede', u_sede::text, false);
  perform set_config('t.nada', u_nada::text, false);
end $$;

set role anon;
select set_config('test.role', 'anon', false), set_config('test.uid', '', false);
select t_niega('anon: flujo', $q$select fn_estado_flujos_efectivo(40, '2026-01-01', '2026-12-31')$q$);
select t_niega('anon: patrimonio', $q$select fn_estado_cambios_patrimonio(40, '2026-01-01', '2026-12-31')$q$);
select t_niega('anon: guardar', $q$select fn_estados_configuracion_guardar(40, '{"version":0}')$q$);
select t_niega('anon: interno', $q$select fn_ef_flujo_lineas(40, now(), now())$q$);
select t_niega('anon: tabla', $q$select * from financial_report_settings$q$);
reset role;

set role authenticated;
select set_config('test.role', 'authenticated', false);

select set_config('test.uid', current_setting('t.ajeno'), false);
select t_niega('ajeno: flujo', $q$select fn_estado_flujos_efectivo(40, '2026-01-01', '2026-12-31')$q$);
select t_niega('ajeno: guardar', $q$select fn_estados_configuracion_guardar(40, '{"version":0}')$q$);
select t_niega('ajeno: cuentas', $q$select fn_estados_cuentas_flujo_guardar(40, '[]')$q$);
select t_niega('ajeno: libro', $q$select fn_libro_lineas(40, '2026-01-01', '2026-12-31')$q$);

select set_config('test.uid', current_setting('t.nada'), false);
select t_niega('sin permiso: flujo', $q$select fn_estado_flujos_efectivo(40, '2026-01-01', '2026-12-31')$q$);
select t_niega('sin permiso: resultado', $q$select fn_estado_resultado_integral(40, '2026-01-01', '2026-12-31')$q$);
select t_niega('sin permiso: indicadores', $q$select fn_indicadores_financieros_base(40, '2026-01-01', '2026-12-31')$q$);

select set_config('test.uid', current_setting('t.sede'), false);
select t_niega('una sede: estado de la entidad', $q$select fn_estado_flujos_efectivo(40, '2026-01-01', '2026-12-31')$q$);

select set_config('test.uid', current_setting('t.lector'), false);
select t_igual('lector: lee', (fn_estado_flujos_efectivo(40, '2026-01-01', '2026-12-31') ->> 'financiacion')::numeric, 100);
select t_niega('lector: no guarda', $q$select fn_estados_configuracion_guardar(40, '{"version":0}')$q$);
select t_niega('lector: no aprueba presupuesto', $q$select fn_presupuesto_aprobar(40, gen_random_uuid())$q$);
select t_niega('lector: no marca', $q$select fn_estados_cuentas_flujo_guardar(40, '[]')$q$);
select t_niega('lector: no escribe directo', $q$insert into financial_report_settings(organization_id) values (40)$q$);
select t_igual('lector: ve las marcas de su org', (select count(*) from financial_report_account_metadata), 19);

select set_config('test.uid', current_setting('t.ajeno'), false);
select t_igual('ajeno: RLS no muestra marcas', (select count(*) from financial_report_account_metadata), 0);

select set_config('test.uid', current_setting('t.aprueba'), false);
select t_igual('aprueba: guarda', (fn_estados_configuracion_guardar(40, '{"version":0,"notas":{"entidad":{"texto":"Una empresa","revisada":true}}}') ->> 'version')::numeric, 1);
select t_niega('aprueba: versión vieja', $q$select fn_estados_configuracion_guardar(40, '{"version":0,"notas":{}}')$q$, '40001');
select t_niega('aprueba: nota desconocida', $q$select fn_estados_configuracion_guardar(40, '{"version":1,"notas":{"otra":{"texto":"x","revisada":true}}}')$q$, '22023');
select t_niega('aprueba: política inválida', $q$select fn_estados_configuracion_guardar(40, '{"version":1,"politicas_flujo":{"impuestos":"inversion"}}')$q$, '22023');
select t_igual('aprueba: confirma políticas', (fn_estados_configuracion_guardar(40, '{"version":1,"confirmar_politicas":true,"politicas_flujo":{"intereses_pagados":"financiacion"}}') ->> 'version')::numeric, 2);
select t_si('aprueba: queda confirmado', (fn_estado_flujos_efectivo(40, '2026-01-01', '2026-12-31') ->> 'politicas_confirmadas')::boolean);
select t_igual('aprueba: cambiar sin confirmar reabre', (fn_estados_configuracion_guardar(40, '{"version":2,"politicas_flujo":{"intereses_pagados":"operacion"}}') ->> 'version')::numeric, 3);
select t_si('aprueba: vuelve a pendiente', (fn_estado_flujos_efectivo(40, '2026-01-01', '2026-12-31') ->> 'politicas_confirmadas')::boolean = false);
select t_igual('aprueba: marca cuenta', (fn_estados_cuentas_flujo_guardar(40, '[{"account_code":"1110","clase_efectivo":"efectivo"}]') ->> 'cuentas')::numeric, 1);
select t_igual('aprueba: borra marca', (fn_estados_cuentas_flujo_guardar(40, '[{"account_code":"1110"}]') ->> 'cuentas')::numeric, 1);
select t_niega('aprueba: cuenta ajena', $q$select fn_estados_cuentas_flujo_guardar(40, '[{"account_code":"9999","categoria_flujo":"operacion"}]')$q$, '22023');
select t_niega('aprueba: equivalente sin plazo', $q$select fn_estados_cuentas_flujo_guardar(40, '[{"account_code":"12","clase_efectivo":"equivalente"}]')$q$, '23514');
reset role;
select set_config('test.role', 'service_role', false), set_config('test.uid', '', false);

-- Asesor de permisos: las funciones públicas no se abren a anon y las internas a nadie más.
select t_si('permisos: ' || p.proname,
       case when p.proname like 'fn\_ef\_%' then not has_function_privilege('authenticated', p.oid, 'execute')
            else has_function_privilege('authenticated', p.oid, 'execute') end
       and not has_function_privilege('anon', p.oid, 'execute'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (p.proname like 'fn\_ef\_%' or p.proname like 'fn\_estado%' or p.proname like 'fn\_libro\_%' or p.proname = 'fn_indicadores_financieros_base');

-- Resultado ---------------------------------------------------------------------------
\pset format aligned
select count(*) as pruebas, count(*) filter (where ok) as bien, count(*) filter (where not ok) as mal from t_resultados;
select prueba, detalle from t_resultados where not ok order by id;
do $$
begin
  if exists (select 1 from public.t_resultados where not ok) then
    raise exception 'Hay pruebas que fallan';
  end if;
end $$;
