-- Revierte cuentas, reglas y funciones de 20261023170000.
-- Antes hay que revertir 20261023170100. Si un borrador de esta corrección
-- ya se publicó, primero fn_revertir_asiento con el periodo abierto.

set lock_timeout = '15s';
set statement_timeout = '120s';

do $rb$
begin
  if to_regclass('public.journal_entries') is not null and exists (
    select 1 from public.journal_entries
    where (fact_key like 'correccion_reversion:%' or fact_key like 'correccion_reclasificacion:%')
      and posted is true
  ) then
    raise exception 'hay un comprobante de correccion publicado: reviertelo con fn_revertir_asiento antes';
  end if;
end
$rb$;

do $rb$
declare
  r record;
begin
  if to_regclass('public.correccion_flujo_funcion_respaldo') is null then
    raise exception 'falta el respaldo de funciones';
  end if;
  for r in
    select firma, definicion
    from public.correccion_flujo_funcion_respaldo
    order by case
      when firma like 'fn_propuesta_configuracion_sector%' then 1
      when firma like 'fn_clave_cuenta_configurable%' then 2
      when firma like 'fn_regla_devengo_%' then 3
      when firma like 'fn_create_journal_entry%' then 4
      when firma like 'fn_asiento_documento_por_lineas%' then 5
      when firma like 'fn_create_default_accounting_rules%' then 6
      when firma like 'fn_auto_journal_inventory_adjustment%' then 7
      when firma like 'fn_auto_journal_stock_movement%' then 8
      when firma like 'fn_stock_registrar_movimiento%' then 9
      else 20
    end, firma
  loop
    execute r.definicion;
  end loop;
end
$rb$;

drop function if exists public.fn_redondear_asiento_pesos(integer);

update public.accounting_rules ar
   set debit_account_code = r.debit_account_code,
       credit_account_code = r.credit_account_code,
       tax_account_code = r.tax_account_code,
       updated_at = now()
  from public.correccion_flujo_regla_respaldo r
 where ar.id = r.rule_id;

update public.chart_of_accounts a
   set name = r.name
  from public.correccion_flujo_nombre_respaldo r
 where a.organization_id = r.organization_id
   and a.account_code = r.account_code;

delete from public.journal_lines jl
 using public.journal_entries je
 where je.id = jl.journal_entry_id
   and jl.account_code in ('240805', '240810', '519535', '414015', '414095')
   and je.posted is false
   and (je.fact_key like 'correccion_reversion:%' or je.fact_key like 'correccion_reclasificacion:%');

delete from public.chart_of_accounts c
 where c.account_code in ('240805', '240810', '519535')
   and not exists (
     select 1
     from public.journal_lines jl
     join public.journal_entries je on je.id = jl.journal_entry_id
     where je.organization_id = c.organization_id
       and jl.account_code = c.account_code
   );

delete from public.chart_of_accounts c
 where c.account_code in ('414015', '414095')
   and exists (
     select 1 from public.correccion_flujo_cuenta_respaldo r
     where r.organization_id = c.organization_id
       and r.account_code = '4140'
   )
   and not exists (
     select 1
     from public.journal_lines jl
     join public.journal_entries je on je.id = jl.journal_entry_id
     where je.organization_id = c.organization_id
       and jl.account_code = c.account_code
   );

update public.chart_of_accounts p
   set es_movimiento = true
 where p.account_code = '2408'
   and not exists (
     select 1 from public.chart_of_accounts h
     where h.organization_id = p.organization_id
       and h.parent_code = '2408'
   );

update public.chart_of_accounts a
   set es_movimiento = r.es_movimiento
  from public.correccion_flujo_cuenta_respaldo r
 where a.organization_id = r.organization_id
   and a.account_code = r.account_code
   and not exists (
     select 1 from public.chart_of_accounts h
     where h.organization_id = a.organization_id
       and h.parent_code = a.account_code
   );

update public.configuracion_contable c
   set account_code = r.account_code
  from public.correccion_flujo_config_respaldo r
 where c.organization_id = r.organization_id
   and c.clave = r.clave
   and c.branch_id is not distinct from r.branch_id;

delete from public.puc_plantilla where codigo in ('240805', '240810', '519535');

update public.puc_plantilla
   set es_movimiento = true
 where codigo = '2408'
   and not exists (select 1 from public.puc_plantilla where padre = '2408');

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
