-- Revierte el asiento del sobrante (20261023190000).
--
-- Orden: primero el rollback 20261023190100 (deja los borradores como estaban)
-- y después este. Si un borrador de esta tanda ya se publicó, posted is true
-- no se reescribe: hay que correr fn_revertir_asiento sobre ese asiento y
-- dejar el borrador como está.
--
-- Devuelve las funciones al respaldo sobrante_funcion_respaldo y quita la
-- clave ingresos_diversos. Las tablas de respaldo se conservan.

do $datos$
declare
  r record;
begin
  if to_regclass('public.sobrante_linea_respaldo') is null then
    return;
  end if;
  if exists (
    select 1
    from public.journal_entries je
    join public.sobrante_linea_respaldo s on s.journal_entry_id = je.id
    where je.posted is true
  ) then
    raise exception 'sobrante_borrador_publicado: posted is true, primero fn_revertir_asiento';
  end if;

  delete from public.journal_lines jl
  using public.sobrante_linea_respaldo s
  where jl.journal_entry_id = s.journal_entry_id;

  insert into public.journal_lines (
    journal_entry_id, account_code, description, debit, credit,
    organization_id, debit_base, credit_base, cost_center_id
  )
  select s.journal_entry_id, s.account_code, s.description, s.debit, s.credit,
         s.organization_id, s.debit_base, s.credit_base, s.cost_center_id
  from public.sobrante_linea_respaldo s;
end
$datos$;

do $restaurar$
declare
  r record;
begin
  if to_regclass('public.sobrante_funcion_respaldo') is null then
    raise exception 'falta sobrante_funcion_respaldo';
  end if;
  for r in
    select definicion
    from public.sobrante_funcion_respaldo
    where migracion = '20261023190000'
    order by case
      when firma like 'fn_auto_journal_stock_movement%' then 1
      when firma like 'fn_auto_journal_inventory_adjustment%' then 2
      when firma like 'fn_cuentas_movimiento_stock%' then 3
      else 4
    end
  loop
    execute r.definicion;
  end loop;
end
$restaurar$;

drop function if exists public.fn_sobrante_borradores();
drop function if exists public.fn_corregir_conteo(integer, integer, integer, text);
drop function if exists public.fn_conteo_del_mes(integer, integer, integer);
drop function if exists public.fn_cuenta_configurada(integer, integer, text, text);
drop function if exists public.fn_inventario_auxiliar_1435(integer, integer);

delete from public.configuracion_contable where clave = 'ingresos_diversos';

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
