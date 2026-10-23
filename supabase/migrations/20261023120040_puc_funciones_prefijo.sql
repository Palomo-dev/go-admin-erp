-- Funciones del plan nuevo y de los asientos que ya no llevan el código fijo.
-- No altera chart_of_accounts: no toma candado exclusivo de esa tabla.
-- Reversión: supabase/rollbacks/20261023120040_puc_funciones_prefijo_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

-- ---------------------------------------------------------------------------
-- Saldos que suben por el prefijo, no por parent_code
-- ---------------------------------------------------------------------------

create or replace function public.fn_saldos_jerarquicos(
  p_organization_id integer,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_branch_id integer default null
)
returns table (
  codigo text,
  nombre text,
  nivel text,
  naturaleza text,
  saldo_propio numeric,
  saldo_total numeric,
  debitos numeric,
  creditos numeric,
  presentacion text
)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  return query
  with cuentas as (
    select
      c.account_code,
      c.name,
      c.naturaleza as nat,
      coalesce(c.presentacion_niif, public.fn_puc_presentacion_defecto(c.account_code)) as pres,
      public.fn_puc_codigo_normalizado(c.account_code) as norm
    from public.chart_of_accounts c
    where c.organization_id = p_organization_id
      and coalesce(c.is_active, true)
  ),
  mov as (
    select
      jl.account_code,
      public.fn_puc_codigo_normalizado(jl.account_code) as norm,
      sum(jl.debit) as debito,
      sum(jl.credit) as credito
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where jl.organization_id = p_organization_id
      and je.organization_id = p_organization_id
      and je.posted is true
      and (p_desde is null or je.entry_date >= p_desde)
      and (p_hasta is null or je.entry_date <= p_hasta)
      and (p_branch_id is null or je.branch_id = p_branch_id)
    group by jl.account_code
  )
  select
    c.account_code,
    c.name,
    case length(c.norm)
      when 1 then 'clase'
      when 2 then 'grupo'
      when 4 then 'cuenta'
      when 6 then 'subcuenta'
      when 8 then 'auxiliar'
      else 'subauxiliar'
    end,
    c.nat,
    coalesce(m.debito, 0) - coalesce(m.credito, 0),
    coalesce(t.debito, 0) - coalesce(t.credito, 0),
    coalesce(t.debito, 0),
    coalesce(t.credito, 0),
    c.pres
  from cuentas c
  left join mov m on m.account_code = c.account_code
  left join lateral (
    select sum(m2.debito) as debito, sum(m2.credito) as credito
    from mov m2
    where m2.norm = c.norm or m2.norm like c.norm || '%'
  ) t on true
  order by c.account_code;
end;
$fn$;

comment on function public.fn_saldos_jerarquicos(integer, timestamptz, timestamptz, integer) is
  'Saldo propio y saldo de todo el prefijo. El total de un informe sale de las hojas, no de esta suma.';

revoke all on function public.fn_saldos_jerarquicos(integer, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.fn_saldos_jerarquicos(integer, timestamptz, timestamptz, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Plan de una organización nueva
-- ---------------------------------------------------------------------------

create or replace function public.fn_create_default_chart_of_accounts(org_id integer, country_code text)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(org_id);
  if country_code is null then
    null;
  end if;
  if exists (select 1 from public.chart_of_accounts where organization_id = org_id) then
    return;
  end if;

  -- El padre tiene que existir antes que el hijo: el disparador lo exige.
  for v_codigo in
    select p.codigo
    from public.puc_plantilla p
    order by length(p.codigo), p.codigo
  loop
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active, description,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo,
      centro_costo_modo, presentacion_niif
    )
    select
      org_id, p.codigo, p.nombre, p.tipo, p.padre, true, p.descripcion,
      p.naturaleza, p.es_movimiento, p.requiere_tercero, p.requiere_centro_costo,
      p.centro_costo_modo, p.presentacion_niif
    from public.puc_plantilla p
    where p.codigo = v_codigo;
  end loop;
end;
$fn$;

revoke all on function public.fn_create_default_chart_of_accounts(integer, text) from public, anon;
grant execute on function public.fn_create_default_chart_of_accounts(integer, text) to authenticated, service_role;

create or replace function public.fn_propuesta_configuracion_sector(p_type_id integer)
returns table(clave text, account_code text)
language sql
immutable
set search_path to public, pg_temp
as $fn$
  select v.clave,
    case v.clave
      when 'ventas_productos' then case p_type_id
        when 1 then '414015'
        when 2 then '414015'
        when 4 then '4155'
        when 6 then '4145'
        when 7 then '4235'
        else '4135'
      end
      when 'ventas_servicios' then case p_type_id
        when 1 then '414095'
        when 2 then '414005'
        else '4235'
      end
      when 'costo_ventas' then case when p_type_id in (1, 2) then '6140' else '6135' end
      when 'inventario' then case when p_type_id = 1 then '1405' else '1435' end
      else v.defecto
    end
  from (values
    ('caja', '1105'),
    ('bancos', '1110'),
    ('clientes', '1305'),
    ('proveedores', '2205'),
    ('ventas_productos', '4135'),
    ('ventas_servicios', '4235'),
    ('devoluciones', '4175'),
    ('descuentos', '4175'),
    ('costo_ventas', '6135'),
    ('inventario', '1435'),
    ('iva_generado', '2408'),
    ('iva_descontable', '2408'),
    ('retefuente', '2365'),
    ('reteiva', '2367'),
    ('reteica', '2368'),
    ('propinas', '5105'),
    ('comisiones', '529505'),
    ('anticipos', '2805'),
    ('nomina', '5105'),
    ('nomina_por_pagar', '2505'),
    ('nomina_aportes', '2370')
  ) as v(clave, defecto);
$fn$;

create or replace function public.fn_clave_cuenta_configurable(p_source text, p_lado text, p_codigo text)
returns text
language sql
immutable
set search_path to public, pg_temp
as $fn$
  select case
    when s.code is null then null
    when p_lado = 'impuesto' and s.code in ('2408', '2405') then
      case
        when s.origen = any (array['purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'])
          then 'iva_descontable'
        else 'iva_generado'
      end
    when p_lado = 'descuento' and s.code = '4175' then 'descuentos'
    when s.code = '1105' then 'caja'
    when s.code = '1110' then 'bancos'
    when s.code = '1305' and s.origen <> all (array[
      'loan', 'loans', 'employee_loans', 'installment', 'installments', 'loan_installments', 'ap_installments'
    ]) then 'clientes'
    when s.code in ('2105', '2205') then 'proveedores'
    when s.code in ('1405', '1435') then 'inventario'
    when s.code in ('6105', '6135', '6140') then 'costo_ventas'
    when s.code = '2365' then 'retefuente'
    when s.code = '2367' then 'reteiva'
    when s.code = '2368' then 'reteica'
    when s.code = '2805' then 'anticipos'
    when s.code in ('5235', '529505') then 'comisiones'
    when s.code = '5105' and s.origen = any (array['tip', 'tips']) then 'propinas'
    when s.code = '5105' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina'
    when s.code = '2505' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_por_pagar'
    when s.code = '2370' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_aportes'
    when s.code in ('4175', '4705') then 'devoluciones'
    when p_lado = 'debito' and s.code in ('4105', '4135', '4110', '414015', '4145', '4235', '4115', '4140', '414005', '414095', '4155') then 'devoluciones'
    when s.code in ('4105', '4135', '4110', '414015', '4145') then 'ventas_productos'
    when s.code in ('4235', '4115', '4140', '414005', '414095', '4155') then 'ventas_servicios'
    else null
  end
  from (
    select nullif(btrim(p_codigo), '') as code, coalesce(btrim(p_source), '') as origen
  ) s;
$fn$;

create or replace function public.fn_cuenta_por_clave(
  p_organization_id integer,
  p_branch_id integer,
  p_clave text
)
returns text
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_cuenta text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select c.account_code
    into v_cuenta
  from public.configuracion_contable c
  where c.organization_id = p_organization_id
    and c.clave = p_clave
    and (c.branch_id = p_branch_id or c.branch_id is null)
    and nullif(btrim(c.account_code), '') is not null
  order by c.branch_id nulls last
  limit 1;

  if v_cuenta is null then
    select o.type_id into v_type
    from public.organizations o
    where o.id = p_organization_id;
    select s.account_code into v_cuenta
    from public.fn_propuesta_configuracion_sector(v_type) s
    where s.clave = p_clave;
  end if;

  if v_cuenta is null then
    return null;
  end if;

  if exists (
    select 1
    from public.chart_of_accounts c
    where c.organization_id = p_organization_id
      and c.account_code = v_cuenta
      and coalesce(c.is_active, true)
      and c.es_movimiento is distinct from false
  ) then
    return v_cuenta;
  end if;
  return null;
end;
$fn$;

revoke all on function public.fn_cuenta_por_clave(integer, integer, text) from public, anon;
grant execute on function public.fn_cuenta_por_clave(integer, integer, text) to authenticated, service_role;

create or replace function public.fn_asiento_movimiento_caja(
  p_organization_id integer,
  p_tipo text,
  p_concept_code text
)
returns table(accion text, debito text, credito text)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_tipo text := case when p_tipo in ('in', 'deposit', 'income') then 'in' else 'out' end;
  v_clave text := coalesce(p_concept_code, '');
  v_caja text;
  v_contra text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_clave = 'cambioEfectivo' then
    accion := 'omitir';
    debito := null;
    credito := null;
    return next;
    return;
  end if;

  v_caja := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, null, 'caja'),
    public.fn_primera_cuenta_detalle(p_organization_id, array['1105'])
  );

  if v_tipo = 'out' then
    v_contra := case v_clave
      when 'pagoProveedor' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['2205', '2105']))
      when 'prestamoEmpleado' then public.fn_primera_cuenta_detalle(p_organization_id, array['1365'])
      when 'retiroConsignacion' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      when 'retiroEfectivo' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      else public.fn_primera_cuenta_detalle(p_organization_id, array['5195', '5135', '5305', '5105'])
    end;
    if v_contra is not null and left(v_contra, 1) = '4' then
      v_contra := null;
    end if;
    if v_caja is null or v_contra is null then
      accion := 'sin_cuenta';
      debito := v_contra;
      credito := v_caja;
      return next;
      return;
    end if;
    accion := 'asiento';
    debito := v_contra;
    credito := v_caja;
    return next;
    return;
  end if;

  v_contra := case v_clave
    when 'ventaContadoEspecial' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['4135', '414015', '4145', '4235', '4105']))
    when 'fondoAdicional' then public.fn_primera_cuenta_detalle(p_organization_id, array['3105', '3115', '3605'])
    when 'prestamoInterno' then public.fn_primera_cuenta_detalle(p_organization_id, array['2380', '2305', '2195'])
    when 'devolucionRecibida' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['2205', '2105']))
    else public.fn_primera_cuenta_detalle(p_organization_id, array['4250', '4295', '4210'])
  end;
  if v_clave is distinct from 'ventaContadoEspecial' and v_contra is not null and left(v_contra, 4) = '4105' then
    v_contra := null;
  end if;
  if v_caja is null or v_contra is null then
    accion := 'sin_cuenta';
    debito := v_caja;
    credito := v_contra;
    return next;
    return;
  end if;
  accion := 'asiento';
  debito := v_caja;
  credito := v_contra;
  return next;
end;
$fn$;

create or replace function public.fn_auto_journal_bank()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_default_branch integer;
  v_banco text;
  v_debito text;
  v_credito text;
  v_fallo text;
  v_importe numeric := abs(coalesce(new.amount, 0));
  v_es_entrada boolean;
begin
  if new.organization_id is not null then
    perform public.fn_assert_acceso_org(new.organization_id);
  end if;
  if v_importe <= 0 then
    return new;
  end if;

  select branch_id, nullif(btrim(account_code), '')
    into v_branch_id, v_banco
  from public.bank_accounts
  where id = new.bank_account_id
    and organization_id = new.organization_id;

  select min(id) into v_default_branch from public.branches where organization_id = new.organization_id;
  v_branch_id := coalesce(v_branch_id, v_default_branch);

  if v_banco is null or public.fn_es_cuenta_de_titulo(new.organization_id, v_banco) then
    v_banco := coalesce(
      public.fn_cuenta_por_clave(new.organization_id, v_branch_id, 'bancos'),
      public.fn_primera_cuenta_detalle(new.organization_id, array['1110', '1105'])
    );
  end if;

  if nullif(btrim(new.cuenta_contable), '') is not null then
    v_es_entrada := case
      when new.transaction_type in ('deposit', 'interest') then true
      when new.transaction_type in ('withdrawal', 'fee') then false
      else coalesce(new.amount, 0) >= 0
    end;
    select a.debito, a.credito, a.fallo
      into v_debito, v_credito, v_fallo
    from public.fn_asiento_tesoreria_elegido(
      new.organization_id,
      case when v_es_entrada then 'in' else 'out' end,
      new.cuenta_contable,
      v_banco
    ) a;

    if v_fallo is not null or v_debito is null or v_credito is null then
      perform public.fn_log_journal_failure(
        new.organization_id, v_branch_id, coalesce(new.trans_date, new.created_at, now()),
        'bank_transactions', new.id::text, 'bank:' || new.id::text,
        v_debito, v_credito, v_importe,
        'sin_cuenta', coalesce(v_fallo, 'Elige una cuenta de movimiento'));
      return new;
    end if;

    v_entry_id := public.fn_create_journal_entry(
      p_organization_id := new.organization_id,
      p_branch_id := v_branch_id,
      p_entry_date := coalesce(new.trans_date, new.created_at, now()),
      p_memo := 'Trans. Bancaria - ' || coalesce(new.description, new.transaction_type),
      p_source := 'bank_transactions',
      p_source_id := new.id::text,
      p_debit_account := v_debito,
      p_credit_account := v_credito,
      p_amount := v_importe,
      p_fact_key := 'bank:' || new.id::text,
      p_cost_center_id := case when new.distribucion_id is not null then null else coalesce(new.centro_costo_id, public.fn_centro_defecto(new.organization_id, v_branch_id)) end,
      p_cuenta_sin_centro := v_banco
    );
    return new;
  end if;

  if new.amount < 0 then
    v_debito := public.fn_primera_cuenta_detalle(new.organization_id, array['5305', '5195', '5135']);
    v_credito := v_banco;
  else
    v_debito := v_banco;
    v_credito := public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']);
  end if;

  if v_debito is null or v_credito is null
     or left(v_debito, 1) = '4'
     or left(v_credito, 1) = '5' then
    perform public.fn_log_journal_failure(
      new.organization_id, v_branch_id, coalesce(new.trans_date, new.created_at, now()),
      'bank_transactions', new.id::text, 'bank:' || new.id::text,
      v_debito, v_credito, v_importe,
      'sin_cuenta', 'El ajuste de banco no usa 5105 ni 4105 y no encontró cuenta de detalle');
    return new;
  end if;

  v_entry_id := public.fn_create_journal_entry(
    p_organization_id := new.organization_id,
    p_branch_id := v_branch_id,
    p_entry_date := coalesce(new.trans_date, new.created_at, now()),
    p_memo := 'Trans. Bancaria - ' || coalesce(new.description, new.transaction_type),
    p_source := 'bank_transactions',
    p_source_id := new.id::text,
    p_debit_account := v_debito,
    p_credit_account := v_credito,
    p_amount := v_importe,
    p_fact_key := 'bank:' || new.id::text
  );

  return new;
end;
$fn$;

create or replace function public.fn_traslado_int_asiento(
  p_org integer,
  p_transfer integer,
  p_code text,
  p_origen integer,
  p_destino integer,
  p_monto numeric,
  p_source_id text
)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_base text;
  v_origen text;
  v_destino text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if coalesce(p_monto, 0) <= 0 then
    return;
  end if;
  if exists (
    select 1 from public.journal_entries je
    where je.organization_id = p_org
      and je.source = 'inventory_transfer'
      and je.source_id = p_source_id
  ) then
    return;
  end if;

  select o.type_id into v_type from public.organizations o where o.id = p_org;
  v_base := coalesce(
    public.fn_cuenta_por_clave(p_org, null, 'inventario'),
    case when v_type = 1 then '1405' else '1435' end
  );

  select m.sub_account_code into v_origen
  from public.branch_account_mappings m
  where m.organization_id = p_org and m.branch_id = p_origen and m.base_account_code = v_base
  limit 1;
  select m.sub_account_code into v_destino
  from public.branch_account_mappings m
  where m.organization_id = p_org and m.branch_id = p_destino and m.base_account_code = v_base
  limit 1;

  if v_origen is null or v_destino is null then
    select m.sub_account_code into v_origen
    from public.branch_account_mappings m
    where m.organization_id = p_org and m.branch_id = p_origen
      and m.base_account_code in ('1435', '1405')
    order by case m.base_account_code when v_base then 0 else 1 end
    limit 1;
    select m.sub_account_code into v_destino
    from public.branch_account_mappings m
    where m.organization_id = p_org and m.branch_id = p_destino
      and m.base_account_code in ('1435', '1405')
    order by case m.base_account_code when v_base then 0 else 1 end
    limit 1;
  end if;

  if v_origen is null or v_destino is null or v_origen = v_destino then
    return;
  end if;
  perform public.fn_create_journal_entry(
    p_org, p_destino, now(),
    'Traslado de inventario ' || coalesce(p_code, 'TR-' || p_transfer),
    'inventory_transfer', p_source_id,
    v_destino, v_origen, round(p_monto, 2));
end;
$fn$;

create or replace function public.fn_create_branch_subaccounts()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $fn$
declare
  v_preferida text;
  v_legado text;
  v_base text;
  v_nombre text;
  v_tipo text;
  v_nat text;
  v_seq integer;
  v_sub text;
  v_aux text;
  v_type integer;
begin
  select o.type_id into v_type from public.organizations o where o.id = new.organization_id;

  for v_preferida, v_legado in
    select *
    from (
      select *
      from (values
        (case when v_type = 1 then '1405' else '1435' end, case when v_type = 1 then '1435' else '1405' end),
        (case when v_type in (1, 2) then '6140' else '6135' end, '6105')
      ) as t(preferida, legado)
    ) pares
  loop
    v_base := null;
    if exists (
      select 1 from public.chart_of_accounts
      where organization_id = new.organization_id
        and account_code = v_preferida
        and coalesce(is_active, true)
    ) then
      v_base := v_preferida;
    elsif exists (
      select 1 from public.chart_of_accounts
      where organization_id = new.organization_id
        and account_code = v_legado
        and coalesce(is_active, true)
    ) then
      v_base := v_legado;
    else
      continue;
    end if;

    select name, type, naturaleza
      into v_nombre, v_tipo, v_nat
    from public.chart_of_accounts
    where organization_id = new.organization_id
      and account_code = v_base;

    v_sub := v_base || '05';
    insert into public.chart_of_accounts (
      account_code, organization_id, name, type, parent_code, is_active, description,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
    ) values (
      v_sub, new.organization_id,
      v_nombre || ' por sede',
      v_tipo, v_base, true,
      'Subcuenta de sedes. El movimiento va al auxiliar.',
      v_nat, false, false,
      left(v_base, 1) in ('5', '6', '7')
    )
    on conflict (organization_id, account_code) do nothing;

    select coalesce(max(n), 0) + 1 into v_seq
    from (
      select case
        when sub_account_code ~ '^[0-9]{8}$' then right(sub_account_code, 2)::int
        when split_part(sub_account_code, '-', 2) ~ '^[0-9]+$' then split_part(sub_account_code, '-', 2)::int
        else 0
      end as n
      from public.branch_account_mappings
      where organization_id = new.organization_id
        and base_account_code in (v_base, v_preferida, v_legado)
      union all
      select right(account_code, 2)::int
      from public.chart_of_accounts
      where organization_id = new.organization_id
        and account_code ~ ('^' || v_sub || '[0-9]{2}$')
    ) s;

    if v_seq > 99 then
      raise exception 'codigo_puc_invalido: no hay auxiliar libre bajo %', v_sub;
    end if;

    v_aux := v_sub || lpad(v_seq::text, 2, '0');
    insert into public.chart_of_accounts (
      account_code, organization_id, name, type, parent_code, is_active, description,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo
    ) values (
      v_aux, new.organization_id,
      v_nombre || ' - ' || new.name,
      v_tipo, v_sub, true,
      'Auxiliar de la sede ' || new.name,
      v_nat, true, false,
      left(v_base, 1) in ('5', '6', '7')
    )
    on conflict (organization_id, account_code) do nothing;

    insert into public.branch_account_mappings (
      organization_id, branch_id, base_account_code, sub_account_code
    ) values (
      new.organization_id, new.id, v_base, v_aux
    )
    on conflict (organization_id, branch_id, base_account_code) do nothing;
  end loop;
  return new;
end;
$fn$;

