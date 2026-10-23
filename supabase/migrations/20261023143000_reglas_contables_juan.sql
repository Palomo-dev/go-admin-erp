-- Reglas de faltante, consumo interno y manifiesto (22 oct 2026).
-- Cuentas, reglas y la resolución de la cuenta. Los asientos quedan en
-- 20261023143050 y los borradores, sin publicar, en 20261023143100.
-- Reversión: supabase/rollbacks/20261023143000_reglas_contables_juan_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

-- ---------------------------------------------------------------------------
-- Respaldo de las funciones que esta migración reemplaza
-- ---------------------------------------------------------------------------

create table if not exists public.regla_contable_funciones (
  firma text primary key,
  definicion text not null
);

insert into public.regla_contable_funciones (firma, definicion)
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'fn_cuentas_movimiento_stock',
    'fn_auto_journal_inventory_adjustment',
    'fn_auto_journal_manifest',
    'fn_ajuste_guardar',
    'fn_stock_registrar_movimiento',
    'fn_ajuste_detalle',
    'fn_create_default_accounting_rules',
    'fn_propuesta_configuracion_sector'
  )
on conflict (firma) do nothing;

revoke all on public.regla_contable_funciones from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columnas y cuentas configurables
-- ---------------------------------------------------------------------------

alter table public.inventory_adjustments
  add column if not exists motivo_ajuste text;

alter table public.inventory_adjustments
  drop constraint if exists inventory_adjustments_motivo_ajuste_chk;

alter table public.inventory_adjustments
  add constraint inventory_adjustments_motivo_ajuste_chk
  check (motivo_ajuste is null or motivo_ajuste in ('robo', 'siniestro'));

comment on column public.inventory_adjustments.motivo_ajuste is
  'Robo o siniestro: el faltante debita 5315. Vacío: debita la cuenta de faltante (519595).';

alter table public.dispatch_manifests
  add column if not exists pagado_contado boolean not null default false;

comment on column public.dispatch_manifests.pagado_contado is
  'Si es verdadero al completar, el manifiesto acredita caja. Si no, acredita proveedores o costos por pagar y el pago va en un egreso aparte.';

alter table public.configuracion_contable
  drop constraint if exists configuracion_contable_clave_chk;

alter table public.configuracion_contable
  add constraint configuracion_contable_clave_chk check (clave in (
    'caja', 'bancos', 'clientes', 'proveedores',
    'ventas_productos', 'ventas_servicios', 'devoluciones', 'descuentos',
    'costo_ventas', 'inventario',
    'iva_generado', 'iva_descontable', 'retefuente', 'reteiva', 'reteica',
    'propinas', 'comisiones', 'anticipos',
    'nomina', 'nomina_por_pagar', 'nomina_aportes',
    'faltante_inventario', 'gastos_extraordinarios', 'consumo_interno',
    'manifiesto_por_pagar', 'manifiesto_transporte'
  ));

insert into public.puc_plantilla (
  codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
  requiere_tercero, requiere_centro_costo, centro_costo_modo
) values (
  '5315', 'Gastos extraordinarios', 'expense', '53',
  'Robo y siniestro de inventario.', 'debito', true,
  false, true, 'obligatorio'
)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      es_movimiento = excluded.es_movimiento,
      naturaleza = excluded.naturaleza;

-- nivel y clase se generan a partir del código. No se escriben.
insert into public.chart_of_accounts (
  account_code, organization_id, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo,
  centro_costo_modo
)
select '5315', o.id, 'Gastos extraordinarios', 'expense', '53', true,
       'Robo y siniestro de inventario.',
       'debito', true, false, true, 'obligatorio'
from public.organizations o
where exists (
  select 1 from public.chart_of_accounts c
  where c.organization_id = o.id and c.account_code = '53'
)
and not exists (
  select 1 from public.chart_of_accounts c
  where c.organization_id = o.id and c.account_code = '5315'
);

insert into public.chart_of_accounts (
  account_code, organization_id, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo,
  centro_costo_modo
)
select '519595', o.id, 'Faltantes', 'expense', '5195', true,
       'Faltantes de inventario y consumo interno.',
       'debito', true, false, true, 'obligatorio'
from public.organizations o
where exists (
  select 1 from public.chart_of_accounts c
  where c.organization_id = o.id and c.account_code = '5195'
)
and not exists (
  select 1 from public.chart_of_accounts c
  where c.organization_id = o.id and c.account_code = '519595'
);

-- ---------------------------------------------------------------------------
-- Reglas vigentes: solo los defaults viejos. Una regla ya editada se queda.
-- ---------------------------------------------------------------------------

create table if not exists public.regla_contable_respaldo (
  rule_id uuid primary key,
  organization_id integer not null,
  debit_account_code text,
  credit_account_code text,
  name text,
  description text
);

insert into public.regla_contable_respaldo (
  rule_id, organization_id, debit_account_code, credit_account_code, name, description
)
select ar.id, ar.organization_id, ar.debit_account_code, ar.credit_account_code, ar.name, ar.description
from public.accounting_rules ar
where ar.is_active
  and (
    (ar.source_type in ('inventory', 'inventory_adjustment') and ar.event_type = 'loss'
      and ar.debit_account_code in ('5150', '6105'))
    or (ar.source_type = 'inventory' and ar.event_type = 'adjusted' and left(ar.debit_account_code, 1) = '6')
    or (ar.source_type = 'expense' and ar.event_type = 'created' and left(ar.debit_account_code, 1) = '6')
    or (ar.source_type = 'manifest' and ar.event_type = 'created' and ar.credit_account_code in ('1105', '1110'))
  )
on conflict (rule_id) do nothing;

revoke all on public.regla_contable_respaldo from public, anon, authenticated;

create table if not exists public.regla_contable_aviso (
  organization_id integer primary key,
  tiene_gasto boolean not null,
  tiene_manifiesto boolean not null,
  journal_entry_id integer,
  monto numeric not null default 0,
  nota text,
  created_at timestamptz not null default now()
);

comment on table public.regla_contable_aviso is
  'Organizaciones a avisar por la corrección de reglas. Sin nombres: solo el id, el borrador y el monto.';

revoke all on public.regla_contable_aviso from public, anon, authenticated;

insert into public.regla_contable_aviso (organization_id, tiene_gasto, tiene_manifiesto)
select o.id,
  exists (
    select 1 from public.accounting_rules ar
    where ar.organization_id = o.id and ar.is_active
      and ar.source_type = 'expense' and ar.event_type = 'created'
      and left(ar.debit_account_code, 1) = '6'
  ),
  exists (
    select 1 from public.accounting_rules ar
    where ar.organization_id = o.id and ar.is_active
      and ar.source_type = 'manifest' and ar.event_type = 'created'
      and ar.credit_account_code in ('1105', '1110')
  )
from public.organizations o
where exists (
  select 1 from public.regla_contable_respaldo r
  where r.organization_id = o.id
    and r.rule_id in (
      select ar.id from public.accounting_rules ar
      where ar.organization_id = o.id
        and (
          (ar.source_type = 'expense' and left(ar.debit_account_code, 1) = '6')
          or (ar.source_type = 'manifest' and ar.credit_account_code in ('1105', '1110'))
        )
    )
)
on conflict (organization_id) do nothing;

update public.accounting_rules ar
set debit_account_code = '519595',
    description = 'Faltante de inventario. El robo y el siniestro debitan 5315.',
    updated_at = now()
from public.regla_contable_respaldo r
where ar.id = r.rule_id
  and ar.source_type in ('inventory', 'inventory_adjustment')
  and ar.event_type = 'loss'
  and ar.debit_account_code in ('5150', '6105');

update public.accounting_rules ar
set debit_account_code = '519595',
    name = 'Salida de inventario',
    description = 'Salida que no es venta: gasto contra inventario. El costo de ventas solo sale de una venta o factura.',
    updated_at = now()
from public.regla_contable_respaldo r
where ar.id = r.rule_id
  and ar.source_type = 'inventory'
  and ar.event_type = 'adjusted'
  and left(r.debit_account_code, 1) = '6';

update public.accounting_rules ar
set debit_account_code = '519595',
    name = 'Consumo interno',
    description = 'Gasto del concepto contra inventario. No es costo de ventas.',
    updated_at = now()
from public.regla_contable_respaldo r
where ar.id = r.rule_id
  and ar.source_type = 'expense'
  and ar.event_type = 'created'
  and left(r.debit_account_code, 1) = '6';

update public.accounting_rules ar
set credit_account_code = case when o.type_id = 6 then '2335' else '2205' end,
    description = 'Inventario contra proveedores, o contra costos por pagar si la organización es de transporte. La caja solo si el manifiesto es de contado.',
    updated_at = now()
from public.regla_contable_respaldo r
join public.organizations o on o.id = r.organization_id
where ar.id = r.rule_id
  and ar.source_type = 'manifest'
  and ar.event_type = 'created'
  and r.credit_account_code in ('1105', '1110');

-- ---------------------------------------------------------------------------
-- Cuentas que usa el asiento
-- ---------------------------------------------------------------------------

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
    ('nomina_aportes', '2370'),
    ('faltante_inventario', '519595'),
    ('gastos_extraordinarios', '5315'),
    ('consumo_interno', '519595'),
    ('manifiesto_por_pagar', '2205'),
    ('manifiesto_transporte', '2335')
  ) as v(clave, defecto);
$fn$;

create or replace function public.fn_cuenta_inventario_producto(
  p_organization_id integer,
  p_branch_id integer,
  p_product_id integer
) returns text
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

  if p_product_id is not null then
    v_cuenta := public.fn_cuenta_catalogo_linea(p_organization_id, p_product_id, 'inventario', null);
    if v_cuenta is not null and exists (
      select 1 from public.chart_of_accounts c
      where c.organization_id = p_organization_id
        and c.account_code = v_cuenta
        and coalesce(c.is_active, true)
        and c.es_movimiento is distinct from false
    ) then
      return v_cuenta;
    end if;
  end if;

  v_cuenta := public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'inventario');
  if v_cuenta is not null then
    return v_cuenta;
  end if;

  select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
  v_cuenta := case when v_type = 1 then '1405' else '1435' end;
  if exists (
    select 1 from public.chart_of_accounts c
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

create or replace function public.fn_debito_salida_inventario(
  p_organization_id integer,
  p_branch_id integer,
  p_motivo text,
  p_razon text
) returns text
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_motivo text := lower(btrim(coalesce(p_motivo, '')));
  v_razon text := lower(btrim(coalesce(p_razon, '')));
  v_clave text;
  v_defecto text;
  v_cuenta text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  if v_motivo in ('robo', 'siniestro') or v_razon in ('robo', 'siniestro', 'theft') then
    v_clave := 'gastos_extraordinarios';
    v_defecto := '5315';
  elsif v_razon in ('consumo_interno', 'consumo interno') then
    v_clave := 'consumo_interno';
    v_defecto := '519595';
  else
    v_clave := 'faltante_inventario';
    v_defecto := '519595';
  end if;

  v_cuenta := public.fn_cuenta_por_clave(p_organization_id, p_branch_id, v_clave);
  if v_cuenta is null or left(v_cuenta, 1) = '6' then
    v_cuenta := v_defecto;
  end if;
  if left(coalesce(v_cuenta, ''), 1) = '6' then
    v_cuenta := v_defecto;
  end if;
  return v_cuenta;
end;
$fn$;

create or replace function public.fn_cuentas_manifiesto(
  p_organization_id integer,
  p_branch_id integer,
  p_pagado_contado boolean,
  out debito text,
  out credito text
)
returns record
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select o.type_id into v_type from public.organizations o where o.id = p_organization_id;

  debito := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'inventario'),
    case when v_type = 1 then '1405' else '1435' end
  );

  if coalesce(p_pagado_contado, false) then
    credito := coalesce(public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'caja'), '1105');
  elsif v_type = 6 then
    credito := coalesce(
      public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'manifiesto_transporte'),
      '2335'
    );
  else
    credito := coalesce(
      public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'manifiesto_por_pagar'),
      '2205'
    );
  end if;

  if not coalesce(p_pagado_contado, false) and left(coalesce(credito, ''), 2) = '11' then
    credito := case when v_type = 6 then '2335' else '2205' end;
  end if;
end;
$fn$;

revoke all on function public.fn_cuenta_inventario_producto(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_cuenta_inventario_producto(integer, integer, integer) to service_role;
grant execute on function public.fn_debito_salida_inventario(integer, integer, text, text) to service_role;
grant execute on function public.fn_cuentas_manifiesto(integer, integer, boolean) to service_role;
