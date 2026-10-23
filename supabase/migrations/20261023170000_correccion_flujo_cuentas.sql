-- Flujo contable: compras contra proveedores, IVA en subcuentas, ingreso
-- por sector, saldo inicial y redondeo a pesos.
-- No publica asientos y no toca los datos de la organización 149.
-- Los borradores históricos van en 20261023170100.
-- El saldo inicial de inventario contra 3105 no se crea aquí: espera el conteo real.
-- Reversión: supabase/rollbacks/20261023170000_correccion_flujo_cuentas_rollback.sql

set lock_timeout = '15s';
set statement_timeout = '120s';

create table if not exists public.correccion_flujo_funcion_respaldo (
  firma text primary key,
  definicion text not null
);

insert into public.correccion_flujo_funcion_respaldo (firma, definicion)
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and p.proname in (
    'fn_propuesta_configuracion_sector',
    'fn_regla_devengo_compra',
    'fn_regla_devengo_venta',
    'fn_auto_journal_inventory_adjustment',
    'fn_auto_journal_stock_movement',
    'fn_create_default_accounting_rules',
    'fn_create_journal_entry',
    'fn_asiento_documento_por_lineas',
    'fn_stock_registrar_movimiento',
    'fn_clave_cuenta_configurable'
  )
on conflict (firma) do nothing;

revoke all on public.correccion_flujo_funcion_respaldo from public, anon, authenticated;

create table if not exists public.correccion_flujo_regla_respaldo (
  rule_id uuid primary key,
  organization_id integer not null,
  debit_account_code text,
  credit_account_code text,
  tax_account_code text
);

create table if not exists public.correccion_flujo_config_respaldo (
  id bigint generated always as identity primary key,
  organization_id integer not null,
  branch_id integer,
  clave text not null,
  account_code text not null
);

create unique index if not exists correccion_flujo_config_respaldo_uk
  on public.correccion_flujo_config_respaldo (organization_id, clave, coalesce(branch_id, 0));

create table if not exists public.correccion_flujo_nombre_respaldo (
  organization_id integer not null,
  account_code text not null,
  name text not null,
  primary key (organization_id, account_code)
);

revoke all on public.correccion_flujo_regla_respaldo from public, anon, authenticated;
revoke all on public.correccion_flujo_config_respaldo from public, anon, authenticated;
revoke all on public.correccion_flujo_nombre_respaldo from public, anon, authenticated;

create table if not exists public.correccion_flujo_cuenta_respaldo (
  organization_id integer not null,
  account_code text not null,
  es_movimiento boolean,
  primary key (organization_id, account_code)
);

revoke all on public.correccion_flujo_cuenta_respaldo from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Claves nuevas. Los valores de hoy siguen siendo el defecto.
-- ---------------------------------------------------------------------------

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
    'manifiesto_por_pagar', 'manifiesto_transporte',
    'saldo_inicial', 'impuesto_consumo', 'redondeo', 'compra_servicio'
  ));

insert into public.puc_plantilla (
  codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
  requiere_tercero, requiere_centro_costo, centro_costo_modo
) values
  ('240805', 'IVA generado', 'liability', '2408',
   'IVA generado en ventas. Se acredita y no se debita en el devengo.',
   'credito', true, false, false, 'no_aplica'),
  ('240810', 'IVA descontable', 'liability', '2408',
   'IVA descontable de compras.',
   'debito', true, false, false, 'no_aplica'),
  ('519535', 'Combustibles y lubricantes', 'expense', '5195',
   'Combustibles y lubricantes.',
   'debito', true, false, true, 'obligatorio')
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      es_movimiento = excluded.es_movimiento,
      naturaleza = excluded.naturaleza;

update public.puc_plantilla
   set es_movimiento = false
 where codigo = '2408';

insert into public.chart_of_accounts (
  account_code, organization_id, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo
)
select '240805', c.organization_id, 'IVA generado', c.type, '2408', true,
       'IVA generado en ventas. Se acredita y no se debita en el devengo.',
       'credito', true, false, false, 'no_aplica'
from public.chart_of_accounts c
where c.account_code = '2408'
  and c.organization_id <> 149
  and not exists (
    select 1 from public.chart_of_accounts x
    where x.organization_id = c.organization_id and x.account_code = '240805'
  );

insert into public.chart_of_accounts (
  account_code, organization_id, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo
)
select '240810', c.organization_id, 'IVA descontable', c.type, '2408', true,
       'IVA descontable de compras.',
       'debito', true, false, false, 'no_aplica'
from public.chart_of_accounts c
where c.account_code = '2408'
  and c.organization_id <> 149
  and not exists (
    select 1 from public.chart_of_accounts x
    where x.organization_id = c.organization_id and x.account_code = '240810'
  );

insert into public.chart_of_accounts (
  account_code, organization_id, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo
)
select '519535', c.organization_id, 'Combustibles y lubricantes', c.type, '5195', true,
       'Combustibles y lubricantes.',
       'debito', true,
       coalesce(c.requiere_tercero, false),
       coalesce(c.requiere_centro_costo, true),
       coalesce(c.centro_costo_modo, 'obligatorio')
from public.chart_of_accounts c
where c.account_code = '519545'
  and c.organization_id <> 149
  and not exists (
    select 1 from public.chart_of_accounts x
    where x.organization_id = c.organization_id and x.account_code = '519535'
  );

-- El restaurante no tiene 414015. Al crearla, 4140 deja de ser de movimiento
-- y el ingreso de servicios pasa a 414095. El hotel sigue usando 4140.
insert into public.correccion_flujo_cuenta_respaldo (organization_id, account_code, es_movimiento)
select c.organization_id, c.account_code, c.es_movimiento
from public.chart_of_accounts c
join public.organizations o on o.id = c.organization_id
where c.account_code = '4140'
  and o.type_id = 1
  and c.organization_id <> 149
on conflict (organization_id, account_code) do nothing;

insert into public.chart_of_accounts (
  account_code, organization_id, name, type, parent_code, is_active, description,
  naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo
)
select v.codigo, c.organization_id, v.nombre, coalesce(c.type, 'income'), '4140', true,
       v.descripcion, 'credito', true, false, false, 'opcional'
from public.chart_of_accounts c
join public.organizations o on o.id = c.organization_id
cross join (
  values
    ('414015', 'Restaurantes', 'Ingreso de restaurante.'),
    ('414095', 'Otros', 'Otros ingresos de hoteles y restaurantes.')
) as v(codigo, nombre, descripcion)
where c.account_code = '4140'
  and o.type_id = 1
  and c.organization_id <> 149
  and not exists (
    select 1 from public.chart_of_accounts x
    where x.organization_id = c.organization_id and x.account_code = v.codigo
  );

update public.chart_of_accounts p
   set es_movimiento = false
 where p.account_code = '4140'
   and p.organization_id <> 149
   and exists (
     select 1 from public.organizations o
     where o.id = p.organization_id and o.type_id = 1
   )
   and exists (
     select 1 from public.chart_of_accounts h
     where h.organization_id = p.organization_id
       and h.parent_code = '4140'
   );

insert into public.correccion_flujo_nombre_respaldo (organization_id, account_code, name)
select c.organization_id, c.account_code, c.name
from public.chart_of_accounts c
where c.organization_id <> 149
  and (
    (c.account_code = '4235' and c.name is distinct from 'Servicios')
    or (c.account_code = '519545' and c.name ilike 'combustible%')
  )
on conflict (organization_id, account_code) do nothing;

update public.chart_of_accounts c
   set name = 'Servicios'
 where c.account_code = '4235'
   and c.organization_id <> 149
   and c.name is distinct from 'Servicios';

update public.chart_of_accounts p
   set es_movimiento = false
 where p.account_code = '2408'
   and p.organization_id <> 149
   and exists (
     select 1 from public.chart_of_accounts h
     where h.organization_id = p.organization_id
       and h.parent_code = '2408'
   );

update public.chart_of_accounts c
   set name = 'Taxis y buses'
 where c.account_code = '519545'
   and c.organization_id <> 149
   and c.name ilike 'combustible%'
   and not exists (
     select 1
     from public.journal_lines jl
     join public.journal_entries je on je.id = jl.journal_entry_id
     where je.organization_id = c.organization_id
       and jl.account_code = '519545'
   );

-- ---------------------------------------------------------------------------
-- Reglas y configuración. La 149 no se reescribe.
-- ---------------------------------------------------------------------------

insert into public.correccion_flujo_regla_respaldo (
  rule_id, organization_id, debit_account_code, credit_account_code, tax_account_code
)
select ar.id, ar.organization_id, ar.debit_account_code, ar.credit_account_code, ar.tax_account_code
from public.accounting_rules ar
where ar.organization_id <> 149
  and ar.is_active
  and (
    ar.tax_account_code in ('2405', '2408')
    or (ar.credit_account_code = '2105' and ar.source_type in ('purchase', 'purchase_order', 'accounts_payable'))
    or (ar.debit_account_code = '2105' and ar.source_type = 'purchase_payment')
    or (
      ar.source_type = 'sale'
      and ar.credit_account_code in ('4105', '4110', '4115', '4135', '414005', '414015', '414095')
    )
  )
on conflict (rule_id) do nothing;

update public.accounting_rules ar
   set tax_account_code = case
         when ar.source_type in ('purchase', 'purchase_order', 'accounts_payable') then '240810'
         else '240805'
       end,
       updated_at = now()
  from public.correccion_flujo_regla_respaldo r
 where ar.id = r.rule_id
   and ar.organization_id <> 149
   and r.tax_account_code in ('2405', '2408')
   and exists (
     select 1 from public.chart_of_accounts c
     where c.organization_id = ar.organization_id
       and c.account_code = case
         when ar.source_type in ('purchase', 'purchase_order', 'accounts_payable') then '240810'
         else '240805'
       end
       and coalesce(c.is_active, true)
       and c.es_movimiento is distinct from false
   );

update public.accounting_rules ar
   set credit_account_code = case when o.type_id in (4, 6) then '2335' else '2205' end,
       updated_at = now()
  from public.organizations o
 where ar.organization_id = o.id
   and ar.organization_id <> 149
   and ar.is_active
   and ar.credit_account_code = '2105'
   and ar.source_type in ('purchase', 'purchase_order', 'accounts_payable')
   and exists (
     select 1 from public.chart_of_accounts c
     where c.organization_id = o.id
       and c.account_code = case when o.type_id in (4, 6) then '2335' else '2205' end
       and coalesce(c.is_active, true)
       and c.es_movimiento is distinct from false
   );

update public.accounting_rules ar
   set debit_account_code = case when o.type_id in (4, 6) then '2335' else '2205' end,
       updated_at = now()
  from public.organizations o
 where ar.organization_id = o.id
   and ar.organization_id <> 149
   and ar.is_active
   and ar.debit_account_code = '2105'
   and ar.source_type = 'purchase_payment'
   and exists (
     select 1 from public.chart_of_accounts c
     where c.organization_id = o.id
       and c.account_code = case when o.type_id in (4, 6) then '2335' else '2205' end
       and coalesce(c.is_active, true)
       and c.es_movimiento is distinct from false
   );

update public.accounting_rules ar
   set credit_account_code = case
         when o.type_id = 1 then '414015'
         when o.type_id = 2 and exists (
           select 1 from public.chart_of_accounts c
           where c.organization_id = o.id and c.account_code = '4140'
             and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
         ) then '4140'
         when o.type_id = 2 then '414005'
         else '4135'
       end,
       updated_at = now()
  from public.organizations o
 where ar.organization_id = o.id
   and ar.organization_id <> 149
   and ar.is_active
   and ar.source_type = 'sale'
   and coalesce(o.type_id, 3) in (1, 2, 3)
   and ar.credit_account_code in ('4105', '4110', '4115', '4135', '414005', '414015', '414095')
   and ar.credit_account_code is distinct from case
         when o.type_id = 1 then '414015'
         when o.type_id = 2 and exists (
           select 1 from public.chart_of_accounts c
           where c.organization_id = o.id and c.account_code = '4140'
             and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
         ) then '4140'
         when o.type_id = 2 then '414005'
         else '4135'
       end
   and exists (
     select 1 from public.chart_of_accounts c
     where c.organization_id = o.id
       and c.account_code = case
         when o.type_id = 1 then '414015'
         when o.type_id = 2 and exists (
           select 1 from public.chart_of_accounts h
           where h.organization_id = o.id and h.account_code = '4140'
             and coalesce(h.is_active, true) and h.es_movimiento is distinct from false
         ) then '4140'
         when o.type_id = 2 then '414005'
         else '4135'
       end
       and coalesce(c.is_active, true)
       and c.es_movimiento is distinct from false
   );

insert into public.correccion_flujo_config_respaldo (organization_id, branch_id, clave, account_code)
select c.organization_id, c.branch_id, c.clave, c.account_code
from public.configuracion_contable c
join public.organizations o on o.id = c.organization_id
where c.organization_id <> 149
  and (
    (c.clave = 'iva_generado' and c.account_code in ('2405', '2408'))
    or (c.clave = 'iva_descontable' and c.account_code in ('2405', '2408'))
    or (c.clave = 'proveedores' and c.account_code = '2105')
    or (o.type_id = 2 and c.clave in ('ventas_productos', 'ventas_servicios')
        and c.account_code in ('4105', '4110', '4115', '4135', '414005', '414015', '414095'))
    or (o.type_id = 1 and c.clave = 'ventas_productos'
        and c.account_code in ('4105', '4110', '4115', '4135'))
    or (o.type_id = 1 and c.clave = 'ventas_servicios' and c.account_code = '4140')
  )
  and not exists (
    select 1
    from public.correccion_flujo_config_respaldo r
    where r.organization_id = c.organization_id
      and r.clave = c.clave
      and r.branch_id is not distinct from c.branch_id
  );

update public.configuracion_contable c
   set account_code = '240805'
  from public.correccion_flujo_config_respaldo r
 where c.organization_id = r.organization_id
   and c.clave = r.clave
   and c.branch_id is not distinct from r.branch_id
   and r.clave = 'iva_generado'
   and r.account_code in ('2405', '2408');

update public.configuracion_contable c
   set account_code = '240810'
  from public.correccion_flujo_config_respaldo r
 where c.organization_id = r.organization_id
   and c.clave = r.clave
   and c.branch_id is not distinct from r.branch_id
   and r.clave = 'iva_descontable'
   and r.account_code in ('2405', '2408');

update public.configuracion_contable c
   set account_code = case when o.type_id in (4, 6) then '2335' else '2205' end
  from public.correccion_flujo_config_respaldo r
  join public.organizations o on o.id = r.organization_id
 where c.organization_id = r.organization_id
   and c.clave = r.clave
   and c.branch_id is not distinct from r.branch_id
   and r.clave = 'proveedores'
   and r.account_code = '2105';

update public.configuracion_contable c
   set account_code = case
         when exists (
           select 1 from public.chart_of_accounts a
           where a.organization_id = c.organization_id and a.account_code = '4140'
             and coalesce(a.is_active, true) and a.es_movimiento is distinct from false
         ) then '4140'
         else '414005'
       end
  from public.correccion_flujo_config_respaldo r
  join public.organizations o on o.id = r.organization_id
 where c.organization_id = r.organization_id
   and c.clave = r.clave
   and c.branch_id is not distinct from r.branch_id
   and o.type_id = 2
   and r.clave in ('ventas_productos', 'ventas_servicios');

update public.configuracion_contable c
   set account_code = '414015'
  from public.correccion_flujo_config_respaldo r
  join public.organizations o on o.id = r.organization_id
 where c.organization_id = r.organization_id
   and c.clave = r.clave
   and c.branch_id is not distinct from r.branch_id
   and o.type_id = 1
   and r.clave = 'ventas_productos'
   and exists (
     select 1 from public.chart_of_accounts a
     where a.organization_id = c.organization_id and a.account_code = '414015'
       and coalesce(a.is_active, true) and a.es_movimiento is distinct from false
   );

update public.configuracion_contable c
   set account_code = '414095'
  from public.correccion_flujo_config_respaldo r
  join public.organizations o on o.id = r.organization_id
 where c.organization_id = r.organization_id
   and c.clave = r.clave
   and c.branch_id is not distinct from r.branch_id
   and o.type_id = 1
   and r.clave = 'ventas_servicios'
   and r.account_code = '4140'
   and exists (
     select 1 from public.chart_of_accounts a
     where a.organization_id = c.organization_id and a.account_code = '414095'
       and coalesce(a.is_active, true) and a.es_movimiento is distinct from false
   );

-- ---------------------------------------------------------------------------
-- Propuesta por sector
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
        when 2 then '4140'
        when 4 then '4155'
        when 6 then '4145'
        when 7 then '4235'
        else '4135'
      end
      when 'ventas_servicios' then case p_type_id
        when 1 then '414095'
        when 2 then '4140'
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
    ('iva_generado', '240805'),
    ('iva_descontable', '240810'),
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
    ('manifiesto_transporte', '2335'),
    ('saldo_inicial', '3105'),
    ('impuesto_consumo', '2495'),
    ('redondeo', '4295'),
    ('compra_servicio', '2335')
  ) as v(clave, defecto);
$fn$;

revoke all on function public.fn_propuesta_configuracion_sector(integer) from public, anon, authenticated;
grant execute on function public.fn_propuesta_configuracion_sector(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Devengo: la compra acredita proveedores y el IVA de venta no se debita
-- ---------------------------------------------------------------------------

create or replace function public.fn_regla_devengo_compra(p_organization_id integer)
returns table (debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_payable text;
  v_debit text;
  v_credit text;
  v_tax text;
  v_use boolean;
  v_type integer;
  v_destino text;
begin
  select r.debit_account_code into v_payable
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'purchase_payment'
    and r.is_active = true
  order by r.priority
  limit 1;

  select r.debit_account_code,
         coalesce(v_payable, r.credit_account_code),
         r.tax_account_code,
         r.use_tax_from_document
    into v_debit, v_credit, v_tax, v_use
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'purchase'
    and r.is_active = true
    and coalesce(r.event_type, 'created') = 'created'
  order by
    (r.credit_account_code = v_payable) desc nulls last,
    (r.conditions->>'is_credit' = 'true') desc nulls last,
    r.priority
  limit 1;

  if v_debit is null then
    return;
  end if;

  if p_organization_id is distinct from 149 then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    if v_credit = '2105' or (v_type in (4, 6) and v_credit in ('2105', '2205')) then
      if v_type in (4, 6) then
        v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'compra_servicio'), '2335');
      else
        v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'), '2205');
      end if;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_credit := v_destino;
      elsif v_credit = '2105' then
        v_credit := case when v_type in (4, 6) then '2335' else '2205' end;
      end if;
    end if;

    if v_tax in ('2405', '2408') then
      v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'iva_descontable'), '240810');
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_tax := v_destino;
      end if;
    end if;
  end if;

  return query select v_debit, v_credit, v_tax, v_use;
end;
$fn$;

revoke all on function public.fn_regla_devengo_compra(integer) from public, anon, authenticated;
grant execute on function public.fn_regla_devengo_compra(integer) to service_role;

create or replace function public.fn_regla_devengo_venta(p_organization_id integer)
returns table (debit_account_code text, credit_account_code text, tax_account_code text, use_tax_from_document boolean)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_recv text;
  v_debit text;
  v_credit text;
  v_tax text;
  v_use boolean;
  v_type integer;
  v_destino text;
begin
  select r.credit_account_code into v_recv
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'sale_payment'
    and r.is_active = true
  order by r.priority
  limit 1;

  select coalesce(v_recv, r.debit_account_code),
         r.credit_account_code,
         r.tax_account_code,
         r.use_tax_from_document
    into v_debit, v_credit, v_tax, v_use
  from public.accounting_rules r
  where r.organization_id = p_organization_id
    and r.source_type = 'sale'
    and r.is_active = true
    and coalesce(r.event_type, 'created') = 'created'
    and r.credit_account_code like '4%'
  order by
    (r.debit_account_code = v_recv) desc nulls last,
    (r.conditions->>'is_credit' = 'true') desc nulls last,
    r.priority
  limit 1;

  if v_credit is null and v_debit is null then
    return;
  end if;

  if p_organization_id is distinct from 149 then
    select o.type_id into v_type from public.organizations o where o.id = p_organization_id;
    if coalesce(v_type, 3) in (1, 2, 3)
       and v_credit in ('4105', '4110', '4115', '4135', '4140', '414005', '414015', '414095') then
      v_destino := public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos');
      if v_destino is null then
        v_destino := case
          when v_type = 1 then '414015'
          when v_type = 2 and exists (
            select 1 from public.chart_of_accounts c
            where c.organization_id = p_organization_id and c.account_code = '4140'
              and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
          ) then '4140'
          when v_type = 2 then '414005'
          else '4135'
        end;
      end if;
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_credit := v_destino;
      end if;
    end if;

    if v_tax in ('2405', '2408') then
      v_destino := coalesce(public.fn_cuenta_por_clave(p_organization_id, null, 'iva_generado'), '240805');
      if exists (
        select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id and c.account_code = v_destino
          and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
      ) then
        v_tax := v_destino;
      end if;
    end if;
  end if;

  return query select v_debit, v_credit, v_tax, v_use;
end;
$fn$;

revoke all on function public.fn_regla_devengo_venta(integer) from public, anon, authenticated;
grant execute on function public.fn_regla_devengo_venta(integer) to service_role;

comment on function public.fn_regla_devengo_venta(integer) is
  'Devengo de venta: débito a clientes, crédito al ingreso del sector e IVA generado al crédito en 240805.';

-- ---------------------------------------------------------------------------
-- Ajuste: saldo inicial, conteo y compra sin orden
-- ---------------------------------------------------------------------------

create or replace function public.fn_auto_journal_inventory_adjustment()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_rule record;
  v_neto numeric;
  v_amount numeric;
  v_event_type text;
  v_existing_entry integer;
  v_debit_account text;
  v_credit_account text;
  v_description text;
  v_nprod integer;
  v_prod integer;
  v_explicita boolean;
  v_razon text;
begin
  if new.status is distinct from 'posted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce(sum(case when sm.direction = 'in' then 1 else -1 end * abs(sm.qty)
                      * coalesce(nullif(sm.unit_cost, 0),
                                 (select sl.avg_cost from stock_levels sl
                                   where sl.product_id = sm.product_id and sl.branch_id = sm.branch_id
                                     and sl.lot_id is not distinct from sm.lot_id
                                   order by sl.id limit 1), 0)), 0),
         count(distinct sm.product_id),
         min(sm.product_id)
    into v_neto, v_nprod, v_prod
    from stock_movements sm
   where sm.source = 'adjustment'
     and sm.source_id = new.id::text
     and sm.organization_id = new.organization_id;

  v_amount := round(abs(v_neto), 2);
  if v_amount <= 0 then
    return new;
  end if;
  v_event_type := case when v_neto > 0 then 'gain' else 'loss' end;

  select je.id into v_existing_entry
    from journal_entries je
   where je.source = 'inventory_adjustment'
     and je.source_id = new.id::text
     and je.organization_id = new.organization_id
   limit 1;
  if v_existing_entry is not null then
    return new;
  end if;

  select * into v_rule
    from accounting_rules
   where organization_id = new.organization_id
     and source_type = 'inventory_adjustment'
     and event_type = v_event_type
     and is_active = true
   order by priority
   limit 1;

  v_credit_account := public.fn_cuenta_inventario_producto(
    new.organization_id,
    new.branch_id,
    case when v_nprod = 1 then v_prod else null end
  );

  v_razon := lower(btrim(coalesce(new.reason, '')));
  if v_event_type = 'gain' then
    v_debit_account := v_credit_account;
    if v_razon in ('initial_setup', 'saldo_inicial') then
      v_credit_account := coalesce(
        public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'saldo_inicial'),
        '3105'
      );
    elsif v_razon in ('compra_sin_orden', 'compra sin orden') then
      v_credit_account := coalesce(
        public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'proveedores'),
        '2205'
      );
    else
      if v_razon in ('physical_count', 'audit') then
        v_credit_account := '4250';
      else
        v_credit_account := coalesce(v_rule.credit_account_code, '4250');
      end if;
      if left(coalesce(v_credit_account, ''), 1) = '6' then
        v_credit_account := coalesce(
          public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']),
          '4250'
        );
      end if;
    end if;
  else
    v_explicita := v_rule.debit_account_code is not null
      and v_rule.debit_account_code not in ('5150', '6105', '519595', '5315')
      and left(v_rule.debit_account_code, 1) <> '6'
      and coalesce(new.motivo_ajuste, '') = ''
      and lower(coalesce(new.reason, '')) not in ('robo', 'siniestro', 'theft', 'consumo_interno', 'consumo interno');
    if v_explicita then
      v_debit_account := v_rule.debit_account_code;
    else
      v_debit_account := public.fn_debito_salida_inventario(
        new.organization_id, new.branch_id, new.motivo_ajuste, new.reason
      );
    end if;
    if left(coalesce(v_debit_account, ''), 1) = '6' then
      perform public.fn_log_journal_failure(
        new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
        'inventory_adjustment', new.id::text, 'inventory_adjustment:' || new.id::text,
        v_debit_account, v_credit_account, v_amount,
        'salida_clase_6', 'Un faltante o un consumo interno no debita la clase 6');
      return new;
    end if;
  end if;

  if v_debit_account is null or v_credit_account is null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.posted_at, now()),
      'inventory_adjustment', new.id::text, null, v_debit_account, v_credit_account, v_amount,
      'no_rule', 'Sin cuenta de inventario o de gasto para el ajuste');
    return new;
  end if;

  v_description := 'Ajuste de inventario ' || coalesce(new.code, new.id::text)
    || ' - ' || coalesce(new.motivo_ajuste, new.reason, 'N/A')
    || coalesce(' - ' || nullif(new.notes, ''), '');

  perform public.fn_create_journal_entry(
    p_organization_id => new.organization_id,
    p_branch_id => new.branch_id,
    p_entry_date => coalesce(new.posted_at, new.updated_at, now()),
    p_memo => v_description,
    p_source => 'inventory_adjustment',
    p_source_id => new.id::text,
    p_debit_account => v_debit_account,
    p_credit_account => v_credit_account,
    p_amount => v_amount,
    p_fact_key => 'inventory_adjustment:' || new.id::text
  );
  return new;
end;
$fn$;

revoke all on function public.fn_auto_journal_inventory_adjustment() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- P4: un documento con asiento propio no se vuelve a contabilizar por el movimiento
-- ---------------------------------------------------------------------------

create or replace function public.fn_auto_journal_stock_movement()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_amount numeric;
  v_unit_cost numeric;
  v_description text;
  v_product_name text;
  v_debit_account text;
  v_credit_account text;
  v_debito_base text;
  v_credito_base text;
  v_evento text;
  v_fallo text;
  v_fact_key text;
  v_apertura text;
begin
  -- Compras (las contabiliza la factura) y traslados no son ajustes.
  -- La apertura sí se contabiliza: inventario contra patrimonio, no contra costos.
  if new.source in ('purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
                    'transfer', 'transfer_out', 'transfer_in') then
    return new;
  end if;

  -- P4: la devolución, la nota crédito, la anulación y la producción ya tienen asiento.
  if new.source in ('return', 'credit_note', 'invoice_void', 'production') then
    return new;
  end if;

  -- El documento de ajuste contabiliza el hecho. El masivo trae source_id nulo.
  if new.source = 'adjustment' and new.source_id ~ '^[0-9]{1,9}$' and exists (
    select 1
      from public.inventory_adjustments ia
     where ia.id = new.source_id::integer
       and ia.organization_id = new.organization_id
  ) then
    return new;
  end if;

  if new.direction not in ('out', 'in') then
    return new;
  end if;

  v_unit_cost := coalesce(new.unit_cost, 0);
  if v_unit_cost = 0 then
    select sl.avg_cost
      into v_unit_cost
      from public.stock_levels sl
     where sl.product_id = new.product_id
       and sl.branch_id = new.branch_id
     limit 1;
  end if;

  v_amount := abs(new.qty) * coalesce(v_unit_cost, 0);
  if v_amount <= 0 then
    return new;
  end if;

  v_fact_key := 'stock_movement:' || new.id::text;

  if exists (
    select 1
      from public.journal_entries je
     where je.organization_id = new.organization_id
       and (
         je.fact_key = v_fact_key
         or (je.source = 'stock_movements' and je.source_id = new.id::text)
       )
  ) then
    return new;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito_base, v_credito_base, v_evento
    from public.fn_cuentas_movimiento_stock(new.organization_id, new.source, new.direction) c;

  if new.source = 'adjustment'
     and new.source_id is null
     and coalesce(new.note, '') ilike 'Ajuste masivo%' then
    v_evento := 'opening';
    v_apertura := coalesce(
      public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'saldo_inicial'),
      '3105'
    );
    if new.direction = 'out' then
      v_credito_base := case
        when left(coalesce(v_credito_base, ''), 1) = '1' then v_credito_base
        else coalesce(public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'inventario'), '1435')
      end;
      v_debito_base := v_apertura;
    else
      v_debito_base := case
        when left(coalesce(v_debito_base, ''), 1) = '1' then v_debito_base
        else coalesce(public.fn_cuenta_por_clave(new.organization_id, new.branch_id, 'inventario'), '1435')
      end;
      v_credito_base := v_apertura;
    end if;
  end if;

  if v_debito_base is null or v_credito_base is null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debito_base, v_credito_base, v_amount,
      'no_rule', 'Sin cuentas para el movimiento ' || coalesce(new.source, '') || ' ' || coalesce(new.direction, ''));
    return new;
  end if;

  select r.cuenta, r.fallo
    into v_debit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'debito', v_debito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credito_base, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select r.cuenta, r.fallo
    into v_credit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      new.organization_id, new.branch_id, 'stock_movements', 'credito', v_credito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
      'cuenta_no_configurada', v_fallo);
    return new;
  end if;

  select p.name
    into v_product_name
    from public.products p
   where p.id = new.product_id
   limit 1;

  v_description := case v_evento
    when 'opening' then 'Apertura de inventario - '
    when 'sale' then 'Costo de venta - '
    when 'return' then 'Devolución de inventario - '
    when 'loss' then 'Ajuste de inventario (pérdida) - '
    when 'purchase' then 'Compra de inventario - '
    else 'Ajuste de inventario (ganancia) - '
  end || coalesce(v_product_name, 'Prod:' || new.product_id);

  -- entrada_clase_6: una entrada distinta de la devolución no acredita costos.
  if new.direction = 'in'
     and v_evento is distinct from 'return'
     and left(coalesce(v_credit_account, ''), 1) = '6' then
    v_credit_account := coalesce(
      public.fn_primera_cuenta_detalle(new.organization_id, array['4250', '4295', '4210']),
      v_credit_account
    );
    if left(coalesce(v_credit_account, ''), 1) = '6' then
      perform public.fn_log_journal_failure(
        new.organization_id, new.branch_id, coalesce(new.created_at, now()),
        'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
        'entrada_clase_6', 'Una entrada que no es devolución no acredita la clase 6');
      return new;
    end if;
  end if;

  begin
    perform public.fn_create_journal_entry(
      new.organization_id,
      new.branch_id,
      coalesce(new.created_at, now()),
      v_description,
      'stock_movements',
      new.id::text,
      v_debit_account,
      v_credit_account,
      v_amount,
      null::text,
      0,
      null::uuid,
      false,
      v_fact_key
    );
  exception
    when unique_violation then
      return new;
  end;

  return new;
end;
$fn$;

revoke all on function public.fn_auto_journal_stock_movement() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Redondeo a pesos y parches de funciones vivas
-- ---------------------------------------------------------------------------

create or replace function public.fn_redondear_asiento_pesos(p_entry_id integer)
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $fn$
declare
  v_org integer;
  v_diff numeric;
  v_line integer;
  v_cuenta text;
begin
  select organization_id into v_org from public.journal_entries where id = p_entry_id;
  if v_org is null then
    return;
  end if;

  update public.journal_lines
     set debit = round(coalesce(debit, 0), 0),
         credit = round(coalesce(credit, 0), 0),
         debit_base = case when debit_base is null then debit_base else round(debit_base, 0) end,
         credit_base = case when credit_base is null then credit_base else round(credit_base, 0) end
   where journal_entry_id = p_entry_id;

  select coalesce(sum(debit), 0) - coalesce(sum(credit), 0)
    into v_diff
  from public.journal_lines
  where journal_entry_id = p_entry_id;

  if v_diff = 0 then
    return;
  end if;

  if v_diff > 0 then
    select id into v_line
    from public.journal_lines
    where journal_entry_id = p_entry_id and credit > 0
    order by credit desc, id
    limit 1;
    if v_line is not null then
      update public.journal_lines
         set credit = credit + v_diff,
             credit_base = case when credit_base is null then credit_base else credit_base + v_diff end
       where id = v_line;
      return;
    end if;
  else
    select id into v_line
    from public.journal_lines
    where journal_entry_id = p_entry_id and debit > 0
    order by debit desc, id
    limit 1;
    if v_line is not null then
      update public.journal_lines
         set debit = debit + abs(v_diff),
             debit_base = case when debit_base is null then debit_base else debit_base + abs(v_diff) end
       where id = v_line;
      return;
    end if;
  end if;

  select c.account_code into v_cuenta
  from public.configuracion_contable c
  join public.chart_of_accounts a
    on a.organization_id = c.organization_id and a.account_code = c.account_code
  where c.organization_id = v_org
    and c.clave = 'redondeo'
    and c.branch_id is null
    and coalesce(a.is_active, true)
    and a.es_movimiento is distinct from false
  limit 1;
  v_cuenta := coalesce(v_cuenta, '4295');

  if v_diff > 0 then
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base
    )
    values (p_entry_id, v_cuenta, 'Redondeo a pesos', 0, v_diff, v_org, 0, v_diff);
  else
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit,
      organization_id, debit_base, credit_base
    )
    values (p_entry_id, v_cuenta, 'Redondeo a pesos', abs(v_diff), 0, v_org, abs(v_diff), 0);
  end if;
end;
$fn$;

revoke all on function public.fn_redondear_asiento_pesos(integer) from public, anon, authenticated;
grant execute on function public.fn_redondear_asiento_pesos(integer) to service_role;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_create_journal_entry(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text, uuid, text)'::regprocedure);
  v_viejo text := $old$      'cuenta_no_es_de_movimiento', 'La cuenta es de titulo y no recibe asientos');
    return null;
  end if;

  begin
    insert into journal_entries ($old$;
  v_nuevo text := $new$      'cuenta_no_es_de_movimiento', 'La cuenta es de titulo y no recibe asientos');
    return null;
  end if;

  -- redondeo_pesos: el total y el impuesto quedan en pesos y la diferencia va a la otra línea.
  p_amount := round(p_amount, 0);
  p_tax_amount := round(coalesce(p_tax_amount, 0), 0);
  if p_tax_amount < 0 then
    p_tax_amount := 0;
  end if;
  if p_tax_amount > p_amount then
    p_tax_amount := p_amount;
  end if;
  if p_amount <= 0 then
    perform fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
      p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
      'amount_invalid', 'El importe redondeado a pesos quedo en cero');
    return null;
  end if;

  begin
    insert into journal_entries ($new$;
begin
  if position('redondeo_pesos' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de redondeo en fn_create_journal_entry';
    end if;
    v_def := replace(v_def, v_viejo, v_nuevo);
    execute v_def;
  end if;
end
$patch$;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_asiento_documento_por_lineas(uuid, text, text)'::regprocedure);
  v_viejo text := E'end loop;\n  return v_entry_id;\nend;';
  v_nuevo text := E'end loop;\n  perform public.fn_redondear_asiento_pesos(v_entry_id);\n  return v_entry_id;\nend;';
begin
  if position('fn_redondear_asiento_pesos' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_asiento_documento_por_lineas';
    end if;
    v_def := replace(v_def, v_viejo, v_nuevo);
    execute v_def;
  end if;
end
$patch$;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_clave_cuenta_configurable(text, text, text)'::regprocedure);
  v_viejo text := 'when p_lado = ''impuesto'' and s.code in (''2408'', ''2405'') then';
  v_nuevo text := 'when s.code = ''240810'' then ''iva_descontable''' || chr(10)
    || '    when s.code = ''240805'' then ''iva_generado''' || chr(10)
    || '    when p_lado = ''impuesto'' and s.code in (''2408'', ''2405'') then';
begin
  if position('240810' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_clave_cuenta_configurable';
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end
$patch$;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_stock_registrar_movimiento(integer, integer, integer, integer, text, numeric, numeric, text, text)'::regprocedure);
  v_viejo text := 'perform public.fn_inventario_exigir_permiso(p_org, array[''ajustar'']);';
  v_nuevo text := v_viejo || chr(10)
    || '  if p_direccion = ''in'' and lower(coalesce(v_motivo, '''')) in (''compra_sin_orden'', ''compra sin orden'') then' || chr(10)
    || '    raise exception ''compra_sin_orden_va_en_factura'' using errcode = ''22023'';' || chr(10)
    || '  end if;';
begin
  if position('compra_sin_orden_va_en_factura' in v_def) = 0 then
    if position(v_viejo in v_def) = 0 then
      raise exception 'no se encontro el ancla de fn_stock_registrar_movimiento';
    end if;
    execute replace(v_def, v_viejo, v_nuevo);
  end if;
end
$patch$;

do $patch$
declare
  v_def text := pg_get_functiondef('public.fn_create_default_accounting_rules(integer, text)'::regprocedure);
begin
  if position('240805' in v_def) = 0 then
    v_def := replace(v_def, 'v_inv, ''1110'', ''2408''', 'v_inv, ''2205'', ''240810''');
    v_def := replace(v_def, 'v_inv, ''2205'', ''2408''', 'v_inv, ''2205'', ''240810''');
    v_def := replace(v_def, '''1305'', v_prod, ''2408''', '''1305'', v_prod, ''240805''');
    v_def := replace(v_def, '''1105'', v_prod, ''2408''', '''1105'', v_prod, ''240805''');
    v_def := replace(v_def, '''4175'', ''1305'', ''2408''', '''4175'', ''1305'', ''240805''');
    v_def := replace(
      v_def,
      'v_noshow := case when v_type = 2 then ''414005'' when v_type = 1 then ''414015'' else ''4235'' end;',
      'v_noshow := case when v_type = 2 then v_serv when v_type = 1 then v_prod else ''4235'' end;'
    );
    v_def := replace(v_def, '''1305'', ''414015''', '''1305'', v_prod');
    v_def := replace(v_def, '''1305'', ''414005''', '''1305'', v_serv');
    if position('240805' in v_def) = 0 or position('240810' in v_def) = 0 then
      raise exception 'no se pudo actualizar fn_create_default_accounting_rules';
    end if;
    execute v_def;
  end if;
end
$patch$;
