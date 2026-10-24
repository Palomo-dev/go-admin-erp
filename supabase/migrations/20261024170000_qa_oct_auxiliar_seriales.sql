-- QA 23-24 oct 2026.
-- Auxiliar de inventario por sede (143501NN), recepción de compra a ese
-- auxiliar, seriales por cantidad sin patrón, serial en la factura, saldos
-- por centro de costo, cuentas con movimiento y tercero con nombre sin NIT.
-- Los asientos ya generados se reubican y la foto anterior queda en
-- qa_oct_* para poder devolverla. El costo de venta (6135 de una salida)
-- y el IVA de ventas no se tocan.

-- ---------------------------------------------------------------------------
-- Foto reversible. La segunda pasada no pisa la foto original.
-- ---------------------------------------------------------------------------

create table if not exists public.qa_oct_linea_cuenta_anterior (
  journal_line_id integer primary key,
  account_code text not null,
  motivo text not null,
  aplicado_en timestamptz not null default now()
);

create table if not exists public.qa_oct_mapeo_cuenta_anterior (
  id uuid primary key,
  organization_id integer not null,
  branch_id integer not null,
  base_account_code text not null,
  sub_account_code text not null
);

create table if not exists public.qa_oct_cuenta_movimiento_anterior (
  organization_id integer not null,
  account_code text not null,
  es_movimiento boolean,
  primary key (organization_id, account_code)
);

create table if not exists public.qa_oct_cuenta_previa (
  organization_id integer not null,
  account_code text not null,
  primary key (organization_id, account_code)
);

create table if not exists public.qa_oct_factura_serial_anterior (
  invoice_item_id uuid primary key,
  serial_ids integer[],
  serial_numbers text[],
  aplicado_en timestamptz not null default now()
);

alter table public.qa_oct_linea_cuenta_anterior enable row level security;
alter table public.qa_oct_mapeo_cuenta_anterior enable row level security;
alter table public.qa_oct_cuenta_movimiento_anterior enable row level security;
alter table public.qa_oct_cuenta_previa enable row level security;
alter table public.qa_oct_factura_serial_anterior enable row level security;

revoke all on table public.qa_oct_linea_cuenta_anterior from public, anon, authenticated;
revoke all on table public.qa_oct_mapeo_cuenta_anterior from public, anon, authenticated;
revoke all on table public.qa_oct_cuenta_movimiento_anterior from public, anon, authenticated;
revoke all on table public.qa_oct_cuenta_previa from public, anon, authenticated;
revoke all on table public.qa_oct_factura_serial_anterior from public, anon, authenticated;

insert into public.qa_oct_cuenta_previa (organization_id, account_code)
select c.organization_id, c.account_code
from public.chart_of_accounts c
where c.account_code like '1435%'
   or c.account_code in ('240810', '2205')
on conflict do nothing;

insert into public.qa_oct_cuenta_movimiento_anterior (organization_id, account_code, es_movimiento)
select c.organization_id, c.account_code, c.es_movimiento
from public.chart_of_accounts c
where c.account_code in ('1435', '143501')
on conflict do nothing;

insert into public.qa_oct_mapeo_cuenta_anterior (id, organization_id, branch_id, base_account_code, sub_account_code)
select m.id, m.organization_id, m.branch_id, m.base_account_code, m.sub_account_code
from public.branch_account_mappings m
where m.base_account_code in ('1405', '1435')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Crea 143501 y el auxiliar de 8 dígitos de la sede. No renumera uno ya asignado.
-- ---------------------------------------------------------------------------

create or replace function public.fn_asegurar_auxiliar_1435(p_org integer, p_branch integer)
returns text
language plpgsql
volatile
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_codigo text;
  v_sufijo text;
  v_nombre text;
  v_rn integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_org is null or p_branch is null then
    return null;
  end if;
  if not exists (
    select 1 from public.branches b
    where b.id = p_branch and b.organization_id = p_org
  ) then
    return null;
  end if;

  select m.sub_account_code into v_codigo
  from public.branch_account_mappings m
  where m.organization_id = p_org
    and m.branch_id = p_branch
    and m.base_account_code in ('1435', '1405')
    and m.sub_account_code ~ '^143501[0-9]{2}$'
    and exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = p_org and c.account_code = m.sub_account_code
    )
  order by case when m.base_account_code = '1435' then 0 else 1 end
  limit 1;

  if v_codigo is null then
    select o.rn into v_rn
    from (
      select b.id, row_number() over (order by b.is_main desc nulls last, b.id) as rn
      from public.branches b
      where b.organization_id = p_org
    ) o
    where o.id = p_branch;

    select lpad(n::text, 2, '0') into v_sufijo
    from generate_series(1, 99) as n
    where not exists (
      select 1
      from public.branch_account_mappings m
      where m.organization_id = p_org
        and m.branch_id <> p_branch
        and m.sub_account_code = '143501' || lpad(n::text, 2, '0')
    )
    order by case when n = coalesce(v_rn, 1) then 0 else 1 end, n
    limit 1;

    if v_sufijo is null then
      return null;
    end if;
    v_codigo := '143501' || v_sufijo;
  end if;

  select left(b.name, 70) into v_nombre
  from public.branches b
  where b.id = p_branch;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values
    (p_org, '1', 'Activo', 'asset', null, 'debito', false, 'no_aplica')
  on conflict (organization_id, account_code) do nothing;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values
    (p_org, '14', 'Inventarios', 'asset', '1', 'debito', false, 'no_aplica')
  on conflict (organization_id, account_code) do nothing;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values
    (p_org, '1435', 'Mercancías no fabricadas por la empresa', 'asset', '14', 'debito', false, 'no_aplica')
  on conflict (organization_id, account_code) do nothing;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values
    (p_org, '143501', 'Inventario por sede', 'asset', '1435', 'debito', false, 'no_aplica')
  on conflict (organization_id, account_code) do nothing;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  ) values (
    p_org, v_codigo, 'Inventario ' || coalesce(nullif(btrim(v_nombre), ''), v_codigo),
    'asset', '143501', 'debito', true, 'no_aplica'
  )
  on conflict (organization_id, account_code) do update
    set es_movimiento = true,
        parent_code = '143501'
  where public.chart_of_accounts.parent_code is distinct from '143501'
     or public.chart_of_accounts.es_movimiento is distinct from true;

  insert into public.branch_account_mappings (organization_id, branch_id, base_account_code, sub_account_code)
  values
    (p_org, p_branch, '1435', v_codigo),
    (p_org, p_branch, '1405', v_codigo)
  on conflict (organization_id, branch_id, base_account_code) do update
    set sub_account_code = excluded.sub_account_code
  where public.branch_account_mappings.sub_account_code !~ '^143501[0-9]{2}$';

  return v_codigo;
end;
$fn$;

revoke all on function public.fn_asegurar_auxiliar_1435(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_asegurar_auxiliar_1435(integer, integer) to service_role;

create or replace function public.fn_inventario_auxiliar_1435(p_org integer, p_branch integer)
returns text
language plpgsql
volatile
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_branch integer := p_branch;
begin
  if p_org is null then
    return null;
  end if;
  if v_branch is null then
    select b.id into v_branch
    from public.branches b
    where b.organization_id = p_org
      and coalesce(b.is_active, true)
    order by b.is_main desc nulls last, b.id
    limit 1;
  end if;
  if v_branch is null then
    return null;
  end if;
  return public.fn_asegurar_auxiliar_1435(p_org, v_branch);
end;
$fn$;

revoke all on function public.fn_inventario_auxiliar_1435(integer, integer) from public, anon;
grant execute on function public.fn_inventario_auxiliar_1435(integer, integer) to authenticated, service_role;

create or replace function public.fn_sede_auxiliar_1435()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
begin
  if coalesce(new.is_active, true) then
    perform public.fn_asegurar_auxiliar_1435(new.organization_id, new.id);
  end if;
  return new;
end;
$fn$;

revoke all on function public.fn_sede_auxiliar_1435() from public, anon;
grant execute on function public.fn_sede_auxiliar_1435() to authenticated, service_role;

drop trigger if exists trg_sede_auxiliar_1435 on public.branches;
create trigger trg_sede_auxiliar_1435
  after insert or update of is_active on public.branches
  for each row
  when (coalesce(new.is_active, true))
  execute function public.fn_sede_auxiliar_1435();

-- La sede resuelve 1405, 1435 suelta y 143505 al auxiliar de la sucursal.
do $parche$
declare
  v_oid oid;
  v_def text;
  v_viejo text := $v$  if v_sub is not null then
    cuenta := v_sub;
  end if;
end;$v$;
  v_nuevo text := $n$  if v_sub is not null then
    cuenta := v_sub;
  end if;

  if cuenta is not null
     and p_branch_id is not null
     and cuenta !~ '^143501[0-9]{2}$'
     and (
       cuenta in ('1405', '1435')
       or cuenta like '1405%'
       or cuenta ~ '^143505'
     ) then
    v_sub := public.fn_asegurar_auxiliar_1435(p_organization_id, p_branch_id);
    if v_sub is not null then
      cuenta := v_sub;
    end if;
  end if;
end;$n$;
begin
  select p.oid into strict v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_cuenta_configurada_de_sede';
  v_def := pg_get_functiondef(v_oid);
  if position('fn_asegurar_auxiliar_1435(p_organization_id, p_branch_id)' in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'qa_oct: no esta el cierre de fn_cuenta_configurada_de_sede';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$parche$;

-- La carga inicial usa el auxiliar de 8 dígitos aunque la cuenta configurada sea 1435 suelta.
do $parche$
declare
  v_oid oid;
  v_def text;
  v_viejo text := $v$  if debito is null or left(debito, 4) <> '1435' then
    debito := public.fn_inventario_auxiliar_1435(p_org, p_branch);
  end if;
  if debito is null or left(debito, 4) <> '1435' then
    debito := null;
  end if;$v$;
  v_nuevo text := $n$  if debito is null or debito !~ '^143501[0-9]{2}$' then
    debito := public.fn_inventario_auxiliar_1435(p_org, p_branch);
  end if;
  if debito is null or left(debito, 4) <> '1435' then
    debito := null;
  end if;$n$;
begin
  select p.oid into strict v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_carga_inicial_cuentas';
  v_def := pg_get_functiondef(v_oid);
  if position('debito !~ ''^143501[0-9]{2}$''' in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'qa_oct: no esta el tramo de fn_carga_inicial_cuentas';
  end if;
  v_def := replace(v_def, v_viejo, v_nuevo);
  v_def := replace(v_def, 'STABLE SECURITY DEFINER', 'VOLATILE SECURITY DEFINER');
  execute v_def;
end;
$parche$;

-- Recepción: débito al auxiliar de la sede, IVA a 240810, crédito a 2205
-- cuando la regla apunta a inventario, gasto o un pasivo que no es proveedor.
do $parche$
declare
  v_oid oid;
  v_def text;
  v_declare text := $v$  v_debito text;
  v_credito text;
begin$v$;
  v_declare_nuevo text := $n$  v_debito text;
  v_credito text;
  v_aux text;
  v_impuesto text;
begin$n$;
  v_cuerpo text := $v$  v_credito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.credit_account_code
  );

  if public.fn_documento_tiene_cuenta_propia(new.organization_id, new.id, 'compra') then$v$;
  v_cuerpo_nuevo text := $n$  v_credito := public.fn_cuenta_movimiento_o_detalle(
    new.organization_id, new.branch_id, v_rule.credit_account_code
  );

  v_aux := public.fn_asegurar_auxiliar_1435(new.organization_id, new.branch_id);
  if v_aux is not null and (
       v_debito is null
       or v_debito in ('1405', '1435', '6135')
       or v_debito like '1405%'
       or v_debito like '1435%'
       or left(v_debito, 1) = '6'
     ) then
    v_debito := v_aux;
  end if;

  if v_credito is null
     or v_credito in ('2105', '1405', '1435', '6135')
     or v_credito like '1405%'
     or v_credito like '1435%'
     or left(v_credito, 1) = '6' then
    v_credito := coalesce(
      public.fn_puc_cuenta_para_asiento(new.organization_id, '2205', 'Proveedores nacionales'),
      v_credito
    );
  end if;

  v_impuesto := nullif(btrim(v_rule.tax_account_code), '');
  if v_impuesto is null or v_impuesto in ('2405', '2408') or v_impuesto like '2405%' then
    if exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = new.organization_id and c.account_code = '240810'
    ) then
      v_impuesto := '240810';
    elsif exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = new.organization_id and c.account_code = '2408'
    ) then
      insert into public.chart_of_accounts (
        organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
      ) values (
        new.organization_id, '240810', 'IVA descontable', 'liability', '2408', 'debito', true, 'no_aplica'
      ) on conflict (organization_id, account_code) do nothing;
      v_impuesto := '240810';
    end if;
  end if;

  if public.fn_documento_tiene_cuenta_propia(new.organization_id, new.id, 'compra') then$n$;
begin
  select p.oid into strict v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_auto_journal_purchase';
  v_def := pg_get_functiondef(v_oid);
  if position('v_aux := public.fn_asegurar_auxiliar_1435' in v_def) > 0 then
    return;
  end if;
  if position(v_declare in v_def) = 0 or position(v_cuerpo in v_def) = 0
     or position('p_tax_account := v_rule.tax_account_code' in v_def) = 0 then
    raise exception 'qa_oct: no esta el tramo de fn_auto_journal_purchase';
  end if;
  v_def := replace(v_def, v_declare, v_declare_nuevo);
  v_def := replace(v_def, v_cuerpo, v_cuerpo_nuevo);
  v_def := replace(v_def, 'p_tax_account := v_rule.tax_account_code', 'p_tax_account := v_impuesto');
  execute v_def;
end;
$parche$;

-- «Cuántos» sin patrón: se usa el SKU, o SER, y se guarda para la próxima vez.
do $parche$
declare
  v_oid oid;
  v_def text;
  v_viejo text := $v$    v_patron := nullif(btrim(coalesce(v_p.serial_pattern, '')), '');
    if v_patron is null then
      raise exception 'patron_requerido' using errcode = '22023';
    end if;$v$;
  v_nuevo text := $n$    v_patron := nullif(btrim(coalesce(v_p.serial_pattern, '')), '');
    if v_patron is null then
      v_patron := case
        when nullif(btrim(coalesce(v_p.sku, '')), '') is null then 'SER-{SEQ}'
        else regexp_replace(upper(btrim(v_p.sku)), '[^A-Z0-9]+', '-', 'g') || '-{SEQ}'
      end;
      update public.products
         set serial_pattern = v_patron
       where id = p_product_id
         and organization_id = p_organization_id
         and nullif(btrim(coalesce(serial_pattern, '')), '') is null;
    end if;$n$;
begin
  select p.oid into strict v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_producto_generar_seriales';
  v_def := pg_get_functiondef(v_oid);
  if position('SER-{SEQ}' in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'qa_oct: no esta el tramo de fn_producto_generar_seriales';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$parche$;

-- Un tercero con nombre y sin NIT no bloquea el asiento.
do $parche$
declare
  v_oid oid;
  v_def text;
  v_viejo text := $v$  select t.nit into v_nit from public.fn_tercero_de_documento(v_tipo, p_id) t;
  if v_nit is not null then
    return null;
  end if;$v$;
  v_nuevo text := $n$  select t.nit, t.nombre into v_nit, v_nombre from public.fn_tercero_de_documento(v_tipo, p_id) t;
  if v_nit is not null or nullif(btrim(v_nombre), '') is not null then
    return null;
  end if;$n$;
begin
  select p.oid into strict v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_bloqueo_tercero_documento';
  v_def := pg_get_functiondef(v_oid);
  if position('v_nit is not null or nullif(btrim(v_nombre), '''') is not null' in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'qa_oct: no esta el tramo de fn_bloqueo_tercero_documento';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$parche$;

do $parche$
declare
  v_oid oid;
  v_def text;
  v_viejo text := 'and v_nit is null then';
  v_nuevo text := 'and v_nit is null and nullif(btrim(v_nombre), '''') is null then';
begin
  select p.oid into strict v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_armar_asiento_documento';
  v_def := pg_get_functiondef(v_oid);
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'qa_oct: no esta el tramo de fn_armar_asiento_documento';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$parche$;

do $parche$
declare
  v_oid oid;
  v_def text;
  v_viejo text := $v$    if coalesce(v_exige.requiere_tercero, false) and v_nit is null then
      raise exception 'TERCERO_REQUERIDO: la cuenta % exige el NIT o la cédula del tercero', v_cuenta$v$;
  v_nuevo text := $n$    if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_linea->>'tercero_nombre'), '') is null then
      raise exception 'TERCERO_REQUERIDO: la cuenta % exige el nombre del tercero', v_cuenta$n$;
begin
  select p.oid into strict v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_asiento_manual_crear';
  v_def := pg_get_functiondef(v_oid);
  if position('tercero_nombre' in v_def) > 0 and position('exige el nombre del tercero' in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'qa_oct: no esta el tramo de fn_asiento_manual_crear';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$parche$;

-- Sobrecarga: el estado de resultados filtra por centro. La de tres argumentos sigue igual.
create or replace function public.fn_saldos_cuentas(
  p_organization_id integer,
  p_desde timestamp with time zone,
  p_hasta timestamp with time zone,
  p_cost_center_id uuid
)
returns table(account_code text, debito numeric, credito numeric)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_sucursales integer[];
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if v_uid is not null then
    select coalesce(array_agg(b.id), '{}'::integer[])
      into v_sucursales
      from public.branches b
     where b.organization_id = p_organization_id
       and public.app_branch_access(b.id);
  end if;

  return query
  select jl.account_code::text,
         coalesce(sum(jl.debit), 0),
         coalesce(sum(jl.credit), 0)
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
   where je.organization_id = p_organization_id
     and je.posted
     and (p_desde is null or je.entry_date >= p_desde)
     and (p_hasta is null or je.entry_date <= p_hasta)
     and (p_cost_center_id is null or jl.cost_center_id = p_cost_center_id)
     and (
       v_uid is null
       or je.branch_id is null
       or je.branch_id = any (v_sucursales)
     )
   group by jl.account_code;
end;
$fn$;

revoke all on function public.fn_saldos_cuentas(integer, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.fn_saldos_cuentas(integer, timestamptz, timestamptz, uuid) to authenticated, service_role;

create or replace function public.fn_puc_cuentas_con_lineas(p_organization_id integer)
returns table(account_code text)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  return query
  select distinct jl.account_code::text
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.organization_id = p_organization_id;
end;
$fn$;

revoke all on function public.fn_puc_cuentas_con_lineas(integer) from public, anon;
grant execute on function public.fn_puc_cuentas_con_lineas(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill de cuentas y de líneas. El costo de venta 6135 no se mueve.
-- ---------------------------------------------------------------------------

do $backfill$
declare
  r record;
  v_cuenta text;
  v_prev text;
begin
  v_prev := current_setting('app.contabilidad_mantenimiento', true);
  perform set_config('app.contabilidad_mantenimiento', 'on', true);

  create temp table qa_aux (
    organization_id integer not null,
    branch_id integer primary key,
    cuenta text
  ) on commit drop;

  for r in
    select b.organization_id, b.id as branch_id
    from public.branches b
    where coalesce(b.is_active, true)
       or exists (select 1 from public.journal_entries je where je.branch_id = b.id)
  loop
    v_cuenta := public.fn_asegurar_auxiliar_1435(r.organization_id, r.branch_id);
    insert into qa_aux (organization_id, branch_id, cuenta)
    values (r.organization_id, r.branch_id, v_cuenta)
    on conflict (branch_id) do update set cuenta = excluded.cuenta;
  end loop;

  create temp table qa_destino on commit drop as
  select
    jl.id as journal_line_id,
    jl.account_code,
    je.organization_id,
    coalesce(je.branch_id, (
      select b.id
      from public.branches b
      where b.organization_id = je.organization_id
      order by b.is_main desc nulls last, b.id
      limit 1
    )) as branch_id
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where (
      jl.account_code in ('1405', '1435')
      or jl.account_code like '1405-%'
      or jl.account_code ~ '^1405[0-9]'
      or jl.account_code ~ '^143505'
    )
    and jl.account_code !~ '^143501[0-9]{2}$';

  insert into public.qa_oct_linea_cuenta_anterior (journal_line_id, account_code, motivo)
  select d.journal_line_id, d.account_code, 'inventario_sede'
  from qa_destino d
  join qa_aux a on a.branch_id = d.branch_id
  where a.cuenta is not null
    and a.cuenta is distinct from d.account_code
  on conflict (journal_line_id) do nothing;

  update public.journal_lines jl
     set account_code = a.cuenta
    from public.qa_oct_linea_cuenta_anterior q
    join qa_destino d on d.journal_line_id = q.journal_line_id
    join qa_aux a on a.branch_id = d.branch_id
   where jl.id = q.journal_line_id
     and q.motivo = 'inventario_sede'
     and a.cuenta is not null;

  -- Una recepción que debitó el costo (6135, 6105 o 6140) pasa al auxiliar.
  -- El costo de venta de una salida no entra: su origen no es la compra.
  insert into public.qa_oct_linea_cuenta_anterior (journal_line_id, account_code, motivo)
  select jl.id, jl.account_code, 'compra_en_costo'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join qa_aux a on a.branch_id = coalesce(je.branch_id, (
    select b.id from public.branches b
    where b.organization_id = je.organization_id
    order by b.is_main desc nulls last, b.id
    limit 1
  ))
  where je.source in ('invoice_purchase', 'purchase_orders', 'accounts_payable')
    and jl.debit > 0
    and (
      jl.account_code in ('6135', '6105', '6140')
      or jl.account_code ~ '^(6135|6105|6140)[0-9]'
      or jl.account_code ~ '^(6135|6105|6140)-'
    )
    and a.cuenta is not null
    and a.cuenta is distinct from jl.account_code
  on conflict (journal_line_id) do nothing;

  update public.journal_lines jl
     set account_code = a.cuenta
    from public.qa_oct_linea_cuenta_anterior q
    join public.journal_lines origen on origen.id = q.journal_line_id
    join public.journal_entries je on je.id = origen.journal_entry_id
    join qa_aux a on a.branch_id = coalesce(je.branch_id, (
      select b.id from public.branches b
      where b.organization_id = je.organization_id
      order by b.is_main desc nulls last, b.id
      limit 1
    ))
   where jl.id = q.journal_line_id
     and q.motivo = 'compra_en_costo'
     and a.cuenta is not null;

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, naturaleza, es_movimiento, centro_costo_modo
  )
  select distinct je.organization_id, '240810', 'IVA descontable', 'liability', '2408', 'debito', true, 'no_aplica'
  from public.journal_entries je
  join public.journal_lines jl on jl.journal_entry_id = je.id
  where je.source = 'invoice_purchase'
    and jl.debit > 0
    and (jl.account_code in ('2405', '2408') or jl.account_code like '2405%')
    and exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = je.organization_id and c.account_code = '2408'
    )
  on conflict (organization_id, account_code) do nothing;

  insert into public.qa_oct_linea_cuenta_anterior (journal_line_id, account_code, motivo)
  select jl.id, jl.account_code, 'iva_compra'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.source = 'invoice_purchase'
    and jl.debit > 0
    and (jl.account_code in ('2405', '2408') or jl.account_code like '2405%')
    and jl.account_code is distinct from '240810'
    and exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = je.organization_id and c.account_code = '240810'
    )
  on conflict (journal_line_id) do nothing;

  update public.journal_lines jl
     set account_code = '240810'
    from public.qa_oct_linea_cuenta_anterior q
    join public.journal_lines origen on origen.id = q.journal_line_id
    join public.journal_entries je on je.id = origen.journal_entry_id
   where jl.id = q.journal_line_id
     and q.motivo = 'iva_compra'
     and exists (
       select 1 from public.chart_of_accounts c
       where c.organization_id = je.organization_id and c.account_code = '240810'
     );

  create temp table qa_proveedor (organization_id integer primary key, cuenta text) on commit drop;
  for r in
    select distinct je.organization_id
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id = je.id
    where je.source = 'invoice_purchase'
      and jl.credit > 0
      and jl.account_code = '2105'
  loop
    v_cuenta := public.fn_puc_cuenta_para_asiento(r.organization_id, '2205', 'Proveedores nacionales');
    insert into qa_proveedor (organization_id, cuenta) values (r.organization_id, v_cuenta)
    on conflict (organization_id) do update set cuenta = excluded.cuenta;
  end loop;

  insert into public.qa_oct_linea_cuenta_anterior (journal_line_id, account_code, motivo)
  select jl.id, jl.account_code, 'proveedor_compra'
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  join qa_proveedor p on p.organization_id = je.organization_id
  where je.source = 'invoice_purchase'
    and jl.credit > 0
    and jl.account_code = '2105'
    and p.cuenta is not null
    and p.cuenta is distinct from jl.account_code
  on conflict (journal_line_id) do nothing;

  update public.journal_lines jl
     set account_code = p.cuenta
    from public.qa_oct_linea_cuenta_anterior q
    join public.journal_lines origen on origen.id = q.journal_line_id
    join public.journal_entries je on je.id = origen.journal_entry_id
    join qa_proveedor p on p.organization_id = je.organization_id
   where jl.id = q.journal_line_id
     and q.motivo = 'proveedor_compra'
     and p.cuenta is not null;

  perform set_config('app.contabilidad_mantenimiento', coalesce(v_prev, ''), true);
end;
$backfill$;

-- ---------------------------------------------------------------------------
-- La factura de venta copia el serial vendido si la línea llegó vacía.
-- ---------------------------------------------------------------------------

create or replace function public.fn_factura_linea_copiar_serial()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_factura uuid;
  v_sale uuid;
  v_org integer;
  v_ids integer[];
  v_textos text[];
begin
  if coalesce(cardinality(new.serial_numbers), 0) > 0 then
    return new;
  end if;

  v_factura := coalesce(
    new.invoice_sales_id,
    case when new.invoice_type = 'sale' then new.invoice_id else null end
  );
  if v_factura is null then
    return new;
  end if;

  select s.sale_id, s.organization_id into v_sale, v_org
  from public.invoice_sales s
  where s.id = v_factura;
  if v_org is null then
    return new;
  end if;

  v_ids := new.serial_ids;
  if coalesce(cardinality(v_ids), 0) = 0 and v_sale is not null and new.product_id is not null then
    select si.serial_ids into v_ids
    from public.sale_items si
    where si.sale_id = v_sale
      and si.product_id = new.product_id
      and coalesce(cardinality(si.serial_ids), 0) > 0
      and not exists (
        select 1
        from public.invoice_items ii
        cross join lateral unnest(coalesce(ii.serial_ids, '{}'::integer[])) as usado(id)
        where ii.invoice_sales_id = v_factura
          and ii.id is distinct from new.id
          and usado.id = any (si.serial_ids)
      )
    order by si.id
    limit 1;
  end if;

  -- La venta a veces deja el serial solo en serial_numbers.sale_id.
  if coalesce(cardinality(v_ids), 0) = 0 and v_sale is not null and new.product_id is not null then
    select coalesce(array_agg(q.id order by q.id), '{}'::integer[])
      into v_ids
    from (
      select sn.id
      from public.serial_numbers sn
      where sn.organization_id = v_org
        and sn.sale_id = v_sale::text
        and sn.product_id = new.product_id
        and nullif(btrim(sn.serial), '') is not null
        and not exists (
          select 1
          from public.invoice_items ii
          cross join lateral unnest(coalesce(ii.serial_ids, '{}'::integer[])) as usado(id)
          where ii.invoice_sales_id = v_factura
            and ii.id is distinct from new.id
            and usado.id = sn.id
        )
      order by sn.id
      limit greatest(coalesce(trunc(new.qty)::integer, 1), 1)
    ) q;
  end if;

  if coalesce(cardinality(v_ids), 0) = 0 then
    return new;
  end if;

  select coalesce(array_agg(sn.serial order by sn.id), '{}'::text[])
    into v_textos
  from public.serial_numbers sn
  where sn.id = any (v_ids)
    and sn.organization_id = v_org;

  if coalesce(cardinality(v_textos), 0) = 0 then
    return new;
  end if;

  new.serial_ids := v_ids;
  new.serial_numbers := v_textos;
  return new;
end;
$fn$;

revoke all on function public.fn_factura_linea_copiar_serial() from public, anon;
grant execute on function public.fn_factura_linea_copiar_serial() to authenticated, service_role;

drop trigger if exists trg_factura_linea_copiar_serial on public.invoice_items;
create trigger trg_factura_linea_copiar_serial
  before insert on public.invoice_items
  for each row
  execute function public.fn_factura_linea_copiar_serial();

do $seriales$
declare
  r record;
  v_ids integer[];
  v_textos text[];
begin
  create temp table qa_usados (
    invoice_id uuid not null,
    serial_id integer not null,
    primary key (invoice_id, serial_id)
  ) on commit drop;

  insert into qa_usados (invoice_id, serial_id)
  select ii.invoice_sales_id, u.id
  from public.invoice_items ii
  cross join lateral unnest(ii.serial_ids) as u(id)
  where ii.invoice_type = 'sale'
    and ii.invoice_sales_id is not null
    and coalesce(cardinality(ii.serial_ids), 0) > 0
  on conflict do nothing;

  for r in
    select ii.id, ii.invoice_sales_id, ii.product_id, ii.serial_ids, s.sale_id, s.organization_id
    from public.invoice_items ii
    join public.invoice_sales s on s.id = ii.invoice_sales_id
    where ii.invoice_type = 'sale'
      and coalesce(cardinality(ii.serial_numbers), 0) = 0
    order by ii.invoice_sales_id, ii.id
  loop
    v_ids := r.serial_ids;
    if coalesce(cardinality(v_ids), 0) = 0 and r.sale_id is not null and r.product_id is not null then
      select si.serial_ids into v_ids
      from public.sale_items si
      where si.sale_id = r.sale_id
        and si.product_id = r.product_id
        and coalesce(cardinality(si.serial_ids), 0) > 0
        and not exists (
          select 1
          from unnest(si.serial_ids) as usado(id)
          join qa_usados x on x.invoice_id = r.invoice_sales_id and x.serial_id = usado.id
        )
      order by si.id
      limit 1;
    end if;

    if coalesce(cardinality(v_ids), 0) = 0 and r.sale_id is not null and r.product_id is not null then
      select coalesce(array_agg(q.id order by q.id), '{}'::integer[])
        into v_ids
      from (
        select sn.id
        from public.serial_numbers sn
        where sn.organization_id = r.organization_id
          and sn.sale_id = r.sale_id::text
          and sn.product_id = r.product_id
          and nullif(btrim(sn.serial), '') is not null
          and not exists (
            select 1 from qa_usados x
            where x.invoice_id = r.invoice_sales_id and x.serial_id = sn.id
          )
        order by sn.id
        limit greatest(coalesce((
          select trunc(ii.qty)::integer from public.invoice_items ii where ii.id = r.id
        ), 1), 1)
      ) q;
    end if;

    if coalesce(cardinality(v_ids), 0) = 0 then
      continue;
    end if;

    select coalesce(array_agg(sn.serial order by sn.id), '{}'::text[])
      into v_textos
    from public.serial_numbers sn
    where sn.id = any (v_ids)
      and sn.organization_id = r.organization_id;

    if coalesce(cardinality(v_textos), 0) = 0 then
      continue;
    end if;

    insert into public.qa_oct_factura_serial_anterior (invoice_item_id, serial_ids, serial_numbers)
    values (r.id, r.serial_ids, '{}'::text[])
    on conflict (invoice_item_id) do nothing;

    update public.invoice_items
       set serial_ids = v_ids,
           serial_numbers = v_textos
     where id = r.id
       and coalesce(cardinality(serial_numbers), 0) = 0;

    insert into qa_usados (invoice_id, serial_id)
    select r.invoice_sales_id, u.id
    from unnest(v_ids) as u(id)
    on conflict do nothing;
  end loop;
end;
$seriales$;
