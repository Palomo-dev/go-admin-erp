-- Configuración contable por organización y, si se quiere, por sede.
--
-- Los disparadores siguen llamando a fn_create_journal_entry. Ahí, si la
-- organización guardó una cuenta para la clave (caja, ventas, IVA…), se usa
-- esa. Si no hay fila, el asiento queda con el código de la regla: las
-- organizaciones que ya existen no cambian de cuentas.
--
-- Una fila cuya cuenta no está en el plan, o no es de movimiento, no publica
-- el asiento: queda en journal_entry_failures con motivo cuenta_no_configurada.
--
-- No inserta filas para las organizaciones que ya existen. Una organización
-- nueva recibe la propuesta de su sector al crearse, y solo para las cuentas
-- que ya estén en su plan. La propuesta para las actuales está en
-- supabase/propuestas y no se ejecuta aquí.
--
-- Depende de fn_puc_cuenta_de_sede y de chart_of_accounts.es_movimiento, ya
-- aplicados en la base. set local vale solo para esta transacción.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

do $dep$
begin
  if to_regprocedure('public.fn_puc_cuenta_de_sede(integer,integer,text)') is null then
    raise exception 'Falta fn_puc_cuenta_de_sede. La configuración contable se apoya en la jerarquía PUC ya aplicada.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chart_of_accounts'
      and column_name = 'es_movimiento'
  ) then
    raise exception 'Falta chart_of_accounts.es_movimiento.';
  end if;
end
$dep$;

create table if not exists public.configuracion_contable (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations (id) on delete cascade,
  branch_id integer references public.branches (id) on delete cascade,
  clave text not null,
  account_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint configuracion_contable_clave_chk check (clave in (
    'caja', 'bancos', 'clientes', 'proveedores',
    'ventas_productos', 'ventas_servicios', 'devoluciones', 'descuentos',
    'costo_ventas', 'inventario',
    'iva_generado', 'iva_descontable', 'retefuente', 'reteiva', 'reteica',
    'propinas', 'comisiones', 'anticipos',
    'nomina', 'nomina_por_pagar', 'nomina_aportes'
  ))
);

alter table public.configuracion_contable drop constraint if exists configuracion_contable_unica;
alter table public.configuracion_contable
  add constraint configuracion_contable_unica
  unique nulls not distinct (organization_id, branch_id, clave);

alter table public.configuracion_contable drop constraint if exists configuracion_contable_plan_fkey;
alter table public.configuracion_contable
  add constraint configuracion_contable_plan_fkey
  foreign key (organization_id, account_code)
  references public.chart_of_accounts (organization_id, account_code)
  on update cascade
  on delete restrict;

comment on table public.configuracion_contable is
  'Cuenta por defecto de cada concepto. branch_id nulo es el valor de la organización; una sede reemplaza solo las claves que tenga.';

create or replace function public.fn_configuracion_contable_validar()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $fn$
begin
  if new.branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = new.branch_id and b.organization_id = new.organization_id
  ) then
    raise exception 'La sede no pertenece a la organización'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = new.organization_id
      and c.account_code = new.account_code
      and c.es_movimiento is distinct from false
  ) then
    raise exception 'La cuenta % no es de movimiento en el plan de la organización', new.account_code
      using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists trg_configuracion_contable_validar on public.configuracion_contable;
create trigger trg_configuracion_contable_validar
  before insert or update on public.configuracion_contable
  for each row execute function public.fn_configuracion_contable_validar();

alter table public.configuracion_contable enable row level security;

drop policy if exists "Los miembros gestionan la configuracion contable de su organizacion"
  on public.configuracion_contable;
create policy "Los miembros gestionan la configuracion contable de su organizacion"
  on public.configuracion_contable
  for all
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = auth.uid() and om.is_active = true
    )
  )
  with check (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.user_id = auth.uid() and om.is_active = true
    )
  );

revoke all on table public.configuracion_contable from public, anon;
grant select, insert, update, delete on table public.configuracion_contable to authenticated;
grant all on table public.configuracion_contable to service_role;

revoke all on function public.fn_configuracion_contable_validar() from public, anon;
grant execute on function public.fn_configuracion_contable_validar() to authenticated, service_role;

-- La clave sale del código y del origen. Sin clave, el asiento no se toca.
-- 5105 solo cambia en propina y nómina: el mismo código también es un gasto.
create or replace function public.fn_clave_cuenta_configurable(
  p_source text,
  p_lado text,
  p_codigo text
) returns text
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
    when s.code = '5235' then 'comisiones'
    when s.code = '5105' and s.origen = any (array['tip', 'tips']) then 'propinas'
    when s.code = '5105' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina'
    when s.code = '2505' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_por_pagar'
    when s.code = '2370' and s.origen = any (array['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']) then 'nomina_aportes'
    when s.code = '4175' then 'devoluciones'
    when p_lado = 'debito' and s.code in ('4105', '4135', '4110', '4235', '4115', '4140', '4155') then 'devoluciones'
    when s.code in ('4105', '4135', '4110') then 'ventas_productos'
    when s.code in ('4235', '4115', '4140', '4155') then 'ventas_servicios'
    else null
  end
  from (
    select nullif(btrim(p_codigo), '') as code, coalesce(btrim(p_source), '') as origen
  ) s;
$fn$;

create or replace function public.fn_nombre_clave_contable(p_clave text)
returns text
language sql
immutable
set search_path to public, pg_temp
as $fn$
  select case p_clave
    when 'caja' then 'Caja'
    when 'bancos' then 'Bancos'
    when 'clientes' then 'Clientes'
    when 'proveedores' then 'Proveedores'
    when 'ventas_productos' then 'Ventas de productos'
    when 'ventas_servicios' then 'Ventas de servicios'
    when 'devoluciones' then 'Devoluciones'
    when 'descuentos' then 'Descuentos'
    when 'costo_ventas' then 'Costo de ventas'
    when 'inventario' then 'Inventario'
    when 'iva_generado' then 'IVA generado'
    when 'iva_descontable' then 'IVA descontable'
    when 'retefuente' then 'ReteFuente'
    when 'reteiva' then 'ReteIVA'
    when 'reteica' then 'ReteICA'
    when 'propinas' then 'Propinas'
    when 'comisiones' then 'Comisiones'
    when 'anticipos' then 'Anticipos'
    when 'nomina' then 'Nómina'
    when 'nomina_por_pagar' then 'Nómina por pagar'
    when 'nomina_aportes' then 'Aportes de nómina'
    else p_clave
  end;
$fn$;

-- Misma tabla que propuestaPorSector en src/lib/finanzas/configuracionContable.ts.
create or replace function public.fn_propuesta_configuracion_sector(p_type_id integer)
returns table (clave text, account_code text)
language sql
immutable
set search_path to public, pg_temp
as $fn$
  select v.clave,
    case v.clave
      when 'ventas_productos' then case p_type_id
        when 1 then '4110'
        when 2 then '4110'
        when 4 then '4155'
        when 7 then '4235'
        else '4135'
      end
      when 'ventas_servicios' then case p_type_id
        when 1 then '4140'
        when 2 then '4115'
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
    ('comisiones', '5235'),
    ('anticipos', '2805'),
    ('nomina', '5105'),
    ('nomina_por_pagar', '2505'),
    ('nomina_aportes', '2370')
  ) as v(clave, defecto);
$fn$;

create or replace function public.fn_resolver_cuenta_configurada(
  p_organization_id integer,
  p_branch_id integer,
  p_source text,
  p_lado text,
  p_codigo text,
  out cuenta text,
  out fallo text
)
language plpgsql
volatile
set search_path to public, pg_temp
as $fn$
declare
  v_clave text;
  v_nombre text;
  v_conf text;
begin
  cuenta := nullif(btrim(p_codigo), '');
  fallo := null;
  v_clave := public.fn_clave_cuenta_configurable(p_source, p_lado, cuenta);
  if v_clave is null or cuenta is null then
    return;
  end if;

  select c.account_code into v_conf
  from public.configuracion_contable c
  where c.organization_id = p_organization_id
    and c.clave = v_clave
    and (c.branch_id = p_branch_id or c.branch_id is null)
  order by c.branch_id nulls last
  limit 1;

  if v_conf is null then
    return;
  end if;

  v_nombre := public.fn_nombre_clave_contable(v_clave);

  if not exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id and account_code = v_conf
  ) then
    fallo := 'La cuenta configurada ' || v_conf || ' (' || v_nombre || ') no está en el plan contable';
    cuenta := v_conf;
    return;
  end if;

  if exists (
    select 1 from public.chart_of_accounts
    where organization_id = p_organization_id
      and account_code = v_conf
      and es_movimiento is false
  ) then
    fallo := 'La cuenta configurada ' || v_conf || ' (' || v_nombre || ') no es de movimiento';
    cuenta := v_conf;
    return;
  end if;

  cuenta := v_conf;
end;
$fn$;

create or replace function public.fn_aplicar_configuracion_contable(
  p_organization_id integer,
  p_branch_id integer,
  p_source text,
  p_debit_account text,
  p_credit_account text,
  p_tax_account text
) returns table (debito text, credito text, impuesto text, fallo text)
language plpgsql
volatile
set search_path to public, pg_temp
as $fn$
declare
  v_debito text;
  v_credito text;
  v_impuesto text;
  v_fallo text;
begin
  select r.cuenta, r.fallo into v_debito, v_fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, p_branch_id, p_source, 'debito', p_debit_account
  ) r;

  if v_fallo is not null then
    debito := v_debito;
    credito := nullif(btrim(p_credit_account), '');
    impuesto := nullif(btrim(p_tax_account), '');
    fallo := v_fallo;
    return next;
    return;
  end if;

  select r.cuenta, r.fallo into v_credito, v_fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, p_branch_id, p_source, 'credito', p_credit_account
  ) r;

  if v_fallo is not null then
    debito := v_debito;
    credito := v_credito;
    impuesto := nullif(btrim(p_tax_account), '');
    fallo := v_fallo;
    return next;
    return;
  end if;

  select r.cuenta, r.fallo into v_impuesto, v_fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, p_branch_id, p_source, 'impuesto', p_tax_account
  ) r;

  if v_fallo is not null then
    debito := v_debito;
    credito := v_credito;
    impuesto := v_impuesto;
    fallo := v_fallo;
    return next;
    return;
  end if;

  if v_debito is not null and v_credito is not null and v_debito = v_credito then
    debito := v_debito;
    credito := v_credito;
    impuesto := v_impuesto;
    fallo := 'Las cuentas configuradas de débito y crédito quedaron iguales (' || v_debito || ')';
    return next;
    return;
  end if;

  debito := v_debito;
  credito := v_credito;
  impuesto := v_impuesto;
  fallo := null;
  return next;
end;
$fn$;

revoke all on function public.fn_clave_cuenta_configurable(text, text, text) from public, anon, authenticated;
revoke all on function public.fn_nombre_clave_contable(text) from public, anon, authenticated;
revoke all on function public.fn_propuesta_configuracion_sector(integer) from public, anon, authenticated;
revoke all on function public.fn_resolver_cuenta_configurada(integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_aplicar_configuracion_contable(integer, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_clave_cuenta_configurable(text, text, text) to service_role;
grant execute on function public.fn_nombre_clave_contable(text) to service_role;
grant execute on function public.fn_propuesta_configuracion_sector(integer) to service_role;
grant execute on function public.fn_resolver_cuenta_configurada(integer, integer, text, text, text) to service_role;
grant execute on function public.fn_aplicar_configuracion_contable(integer, integer, text, text, text, text) to service_role;

create or replace function public.fn_sembrar_configuracion_contable(p_org integer)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_tipo integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if exists (
    select 1 from public.configuracion_contable where organization_id = p_org
  ) then
    return;
  end if;

  select o.type_id into v_tipo from public.organizations o where o.id = p_org;

  insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
  select p_org, null, p.clave, p.account_code
  from public.fn_propuesta_configuracion_sector(v_tipo) p
  join public.chart_of_accounts c
    on c.organization_id = p_org
   and c.account_code = p.account_code
   and c.es_movimiento is distinct from false
  on conflict (organization_id, branch_id, clave) do nothing;
end;
$fn$;

revoke all on function public.fn_sembrar_configuracion_contable(integer) from public, anon, authenticated;
grant execute on function public.fn_sembrar_configuracion_contable(integer) to service_role;

create or replace function public.trg_fn_sembrar_configuracion_contable()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
begin
  perform public.fn_sembrar_configuracion_contable(new.id);
  return new;
end;
$fn$;

revoke all on function public.trg_fn_sembrar_configuracion_contable() from public, anon;
grant execute on function public.trg_fn_sembrar_configuracion_contable() to authenticated, service_role;

drop trigger if exists tr_zz_configuracion_contable on public.organizations;
create trigger tr_zz_configuracion_contable
  after insert on public.organizations
  for each row execute function public.trg_fn_sembrar_configuracion_contable();

-- El asiento de siempre. La configuración entra después de resolver la sede
-- y antes de la cuenta auxiliar de sede. Sin filas, los códigos no cambian.
create or replace function public.fn_create_journal_entry(
  p_organization_id integer,
  p_branch_id integer,
  p_entry_date timestamp with time zone,
  p_memo text,
  p_source text,
  p_source_id text,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_tax_account text default null,
  p_tax_amount numeric default 0,
  p_created_by uuid default null,
  p_tax_is_credit boolean default false,
  p_fact_key text default null
) returns integer
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_cfg record;
begin
  if p_fact_key is not null then
    select id into v_entry_id
    from journal_entries
    where organization_id = p_organization_id and fact_key = p_fact_key
    limit 1;

    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'amount_invalid', 'Importe nulo o no positivo');
    return null;
  end if;

  if p_debit_account is null or p_credit_account is null then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'account_null', 'La regla contable no trae cuenta de debito o de credito');
    return null;
  end if;

  if p_debit_account = p_credit_account then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'same_account', 'Debito y credito sobre la misma cuenta ' || p_debit_account);
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_debit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'debit_account_missing', 'La cuenta de debito ' || p_debit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_credit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'credit_account_missing', 'La cuenta de credito ' || p_credit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if p_tax_account is not null and p_tax_amount > 0 and not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_tax_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'tax_account_missing', 'La cuenta de impuesto ' || p_tax_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not fn_is_period_open(p_organization_id, p_entry_date::date) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'period_closed', 'Periodo contable cerrado para la fecha ' || p_entry_date::date);
    return null;
  end if;

  if p_branch_id is null or p_branch_id = 0 or not exists (
    select 1 from branches where id = p_branch_id and organization_id = p_organization_id
  ) then
    select id into v_branch_id
    from branches
    where organization_id = p_organization_id and is_main = true and is_active = true
    limit 1;

    if v_branch_id is null then
      select min(id) into v_branch_id from branches where organization_id = p_organization_id;
    end if;
  else
    v_branch_id := p_branch_id;
  end if;

  select * into v_cfg
  from public.fn_aplicar_configuracion_contable(
    p_organization_id, v_branch_id, p_source,
    p_debit_account, p_credit_account, p_tax_account
  );

  if v_cfg.fallo is not null then
    perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, v_cfg.debito, v_cfg.credito, p_amount,
      'cuenta_no_configurada', v_cfg.fallo);
    return null;
  end if;

  p_debit_account := v_cfg.debito;
  p_credit_account := v_cfg.credito;
  p_tax_account := v_cfg.impuesto;

  p_debit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_debit_account);
  p_credit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_credit_account);
  if p_tax_account is not null then
    p_tax_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_tax_account);
  end if;

  if exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id
      and account_code in (p_debit_account, p_credit_account)
      and es_movimiento is false
  ) or (
    p_tax_account is not null and coalesce(p_tax_amount, 0) > 0 and exists (
      select 1 from chart_of_accounts
      where organization_id = p_organization_id
        and account_code = p_tax_account
        and es_movimiento is false
    )
  ) then
    perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'cuenta_no_es_de_movimiento', 'La cuenta es de titulo y no recibe asientos');
    return null;
  end if;

  begin
    insert into journal_entries (
      organization_id, branch_id, entry_date, memo,
      source, source_id, posted, created_by, fact_key
    ) values (
      p_organization_id, v_branch_id, p_entry_date, p_memo,
      p_source, p_source_id, true, p_created_by, p_fact_key
    ) returning id into v_entry_id;
  exception when unique_violation then
    if p_fact_key is null then
      raise;
    end if;

    select id into v_entry_id
    from journal_entries
    where organization_id = p_organization_id and fact_key = p_fact_key
    limit 1;
    return v_entry_id;
  end;

  if p_tax_is_credit then
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_debit_account, p_memo, p_amount, 0);

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount);
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount - coalesce(p_tax_amount, 0));
  else
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_debit_account, p_memo, p_amount - coalesce(p_tax_amount, 0), 0);

    if p_tax_account is not null and p_tax_amount > 0 then
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0);
    end if;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount);
  end if;

  return v_entry_id;
end;
$fn$;

create or replace function public.fn_create_journal_entry_with_discount(
  p_organization_id integer,
  p_branch_id integer,
  p_entry_date timestamp with time zone,
  p_memo text,
  p_source text,
  p_source_id text,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_discount_account text,
  p_discount_amount numeric,
  p_discount_on_debit boolean,
  p_created_by uuid default null
) returns integer
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_entry_id integer;
  v_branch_id integer;
  v_cfg record;
  v_descuento text;
  v_fallo text;
begin
  if p_amount is null or p_amount <= 0 then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, null,
      p_debit_account, p_credit_account, p_amount, 'amount_invalid', 'Importe nulo o no positivo (con descuento)');
    return null;
  end if;

  if p_debit_account is null or p_credit_account is null then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, null,
      p_debit_account, p_credit_account, p_amount, 'account_null', 'La regla contable no trae cuenta de debito o de credito (con descuento)');
    return null;
  end if;

  if p_discount_amount is null or p_discount_amount <= 0 or p_discount_account is null then
    return fn_create_journal_entry(
      p_organization_id := p_organization_id,
      p_branch_id := p_branch_id,
      p_entry_date := p_entry_date,
      p_memo := p_memo,
      p_source := p_source,
      p_source_id := p_source_id,
      p_debit_account := p_debit_account,
      p_credit_account := p_credit_account,
      p_amount := p_amount,
      p_created_by := p_created_by
    );
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_debit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, null,
      p_debit_account, p_credit_account, p_amount, 'debit_account_missing',
      'La cuenta de debito ' || p_debit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_credit_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, null,
      p_debit_account, p_credit_account, p_amount, 'credit_account_missing',
      'La cuenta de credito ' || p_credit_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not exists (
    select 1 from chart_of_accounts
    where organization_id = p_organization_id and account_code = p_discount_account
  ) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, null,
      p_debit_account, p_credit_account, p_amount, 'discount_account_missing',
      'La cuenta de descuento ' || p_discount_account || ' no esta en el plan contable de la organizacion');
    return null;
  end if;

  if not fn_is_period_open(p_organization_id, p_entry_date::date) then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, null,
      p_debit_account, p_credit_account, p_amount, 'period_closed',
      'Periodo contable cerrado para la fecha ' || p_entry_date::date);
    return null;
  end if;

  if p_branch_id is null or p_branch_id = 0 or not exists (
    select 1 from branches where id = p_branch_id and organization_id = p_organization_id
  ) then
    select min(id) into v_branch_id from branches where organization_id = p_organization_id;
  else
    v_branch_id := p_branch_id;
  end if;

  select * into v_cfg
  from public.fn_aplicar_configuracion_contable(
    p_organization_id, v_branch_id, p_source,
    p_debit_account, p_credit_account, null
  );

  if v_cfg.fallo is not null then
    perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source, p_source_id, null,
      v_cfg.debito, v_cfg.credito, p_amount, 'cuenta_no_configurada', v_cfg.fallo);
    return null;
  end if;

  select r.cuenta, r.fallo into v_descuento, v_fallo
  from public.fn_resolver_cuenta_configurada(
    p_organization_id, v_branch_id, p_source, 'descuento', p_discount_account
  ) r;

  if v_fallo is not null then
    perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source, p_source_id, null,
      v_cfg.debito, v_cfg.credito, p_amount, 'cuenta_no_configurada', v_fallo);
    return null;
  end if;

  p_debit_account := v_cfg.debito;
  p_credit_account := v_cfg.credito;
  p_discount_account := v_descuento;

  insert into journal_entries (
    organization_id, branch_id, entry_date, memo,
    source, source_id, posted, created_by
  ) values (
    p_organization_id, v_branch_id, p_entry_date, p_memo,
    p_source, p_source_id, true, p_created_by
  ) returning id into v_entry_id;

  if p_discount_on_debit then
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_debit_account, p_memo, p_amount, 0);
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_discount_account, 'Descuento pronto pago - ' || p_memo, p_discount_amount, 0);
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount + p_discount_amount);
  else
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_debit_account, p_memo, p_amount + p_discount_amount, 0);
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_credit_account, p_memo, 0, p_amount);
    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (v_entry_id, p_discount_account, 'Descuento pronto pago - ' || p_memo, 0, p_discount_amount);
  end if;

  return v_entry_id;
end;
$fn$;

-- Las retenciones salen de fn_cuenta_retencion_compra. Si esa cuenta es 2365,
-- 2367 o 2368 y hay configuración, se usa la configurada. Si no hay fila, la
-- línea queda igual. Si la configurada no sirve, no se toca el asiento y el
-- fallo queda visible.
create or replace function public.fn_asiento_compra_aplicar_retenciones(
  p_entry_id integer,
  p_invoice_id uuid,
  p_credit_account text
) returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_inv record;
  v_ret numeric;
  v_linea integer;
  v_memo text;
  v_prev text;
  v_w record;
  v_descuadre numeric;
  v_cuenta text;
  v_fallo text;
begin
  if p_entry_id is null then
    return;
  end if;

  select id, organization_id, branch_id, issue_date, total into v_inv
  from invoice_purchase where id = p_invoice_id;

  select coalesce(sum(w.amount), 0) into v_ret
  from invoice_purchase_withholdings w
  where w.invoice_id = p_invoice_id and w.amount > 0;

  if v_inv.id is null or v_ret <= 0 then
    return;
  end if;

  -- Sin configuración, v_cuenta es p_credit_account y el asiento se busca igual que antes.
  select r.cuenta, r.fallo into v_cuenta, v_fallo
  from public.fn_resolver_cuenta_configurada(
    v_inv.organization_id, v_inv.branch_id, 'invoice_purchase', 'credito', p_credit_account
  ) r;

  if v_fallo is not null then
    perform fn_log_journal_failure(
      v_inv.organization_id, v_inv.branch_id, coalesce(v_inv.issue_date, now()),
      'invoice_purchase', p_invoice_id::text, 'accrual:purchase:' || p_invoice_id,
      null, p_credit_account, v_ret,
      'cuenta_no_configurada', v_fallo);
    return;
  end if;

  select jl.id, e.memo into v_linea, v_memo
  from journal_entries e
  join journal_lines jl on jl.journal_entry_id = e.id
  where e.id = p_entry_id
    and e.organization_id = v_inv.organization_id
    and e.source = 'invoice_purchase'
    and e.source_id = p_invoice_id::text
    and e.created_at = now()
    and jl.account_code = v_cuenta
    and jl.debit = 0
    and jl.credit = v_inv.total
  order by jl.id
  limit 1;

  if v_linea is null then
    return;
  end if;

  if v_ret >= v_inv.total then
    perform fn_log_journal_failure(
      v_inv.organization_id, v_inv.branch_id, coalesce(v_inv.issue_date, now()),
      'invoice_purchase', p_invoice_id::text, 'accrual:purchase:' || p_invoice_id, null, p_credit_account, v_ret,
      'withholding_exceeds_total', 'Las retenciones igualan o superan el total de la factura; el asiento queda por el total');
    return;
  end if;

  for v_w in
    select w.concept, w.amount,
           fn_cuenta_retencion_compra(v_inv.organization_id, w.tax_code, w.concept) as cuenta
    from invoice_purchase_withholdings w
    where w.invoice_id = p_invoice_id and w.amount > 0
    order by 3, w.concept, w.id
  loop
    select r.cuenta, r.fallo into v_cuenta, v_fallo
    from public.fn_resolver_cuenta_configurada(
      v_inv.organization_id, v_inv.branch_id, 'invoice_purchase', 'credito', v_w.cuenta
    ) r;

    if v_fallo is not null then
      perform fn_log_journal_failure(
        v_inv.organization_id, v_inv.branch_id, coalesce(v_inv.issue_date, now()),
        'invoice_purchase', p_invoice_id::text, 'accrual:purchase:' || p_invoice_id,
        null, p_credit_account, v_w.amount,
        'cuenta_no_configurada', v_fallo);
      return;
    end if;
  end loop;

  perform fn_asegurar_cuentas_retencion(v_inv.organization_id);

  v_prev := current_setting('app.contabilidad_mantenimiento', true);
  perform set_config('app.contabilidad_mantenimiento', 'on', true);
  update journal_lines
     set credit = v_inv.total - v_ret, updated_at = now()
   where id = v_linea;
  perform set_config('app.contabilidad_mantenimiento', coalesce(v_prev, ''), true);

  for v_w in
    select w.concept, w.amount,
           fn_cuenta_retencion_compra(v_inv.organization_id, w.tax_code, w.concept) as cuenta
    from invoice_purchase_withholdings w
    where w.invoice_id = p_invoice_id and w.amount > 0
    order by 3, w.concept, w.id
  loop
    select r.cuenta into v_cuenta
    from public.fn_resolver_cuenta_configurada(
      v_inv.organization_id, v_inv.branch_id, 'invoice_purchase', 'credito', v_w.cuenta
    ) r;

    insert into journal_lines (journal_entry_id, account_code, description, debit, credit)
    values (p_entry_id, v_cuenta, v_w.concept || ' - ' || v_memo, 0, v_w.amount);
  end loop;

  select round(coalesce(sum(debit), 0) - coalesce(sum(credit), 0), 2) into v_descuadre
  from journal_lines where journal_entry_id = p_entry_id;
  if v_descuadre <> 0 then
    raise exception 'ASIENTO_DESCUADRADO: el asiento % de la compra % queda descuadrado en %', p_entry_id, p_invoice_id, v_descuadre
      using errcode = '22023';
  end if;
end;
$fn$;

revoke all on function public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text) to service_role;

revoke all on function public.fn_create_journal_entry_with_discount(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, boolean, uuid) from public, anon, authenticated;
grant execute on function public.fn_create_journal_entry_with_discount(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, boolean, uuid) to service_role;

revoke all on function public.fn_asiento_compra_aplicar_retenciones(integer, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_asiento_compra_aplicar_retenciones(integer, uuid, text) to service_role;
