-- Rollback de 20261023143000_reglas_contables_juan.sql
--
-- Orden: 20261023143100 (borradores), 20261023143080 (parches del
-- ajuste), 20261023143050 (asientos) y al final este archivo. Este script
-- también borra los borradores y restaura las funciones, por si los otros
-- ya no están.
--
-- Restaura las reglas desde regla_contable_respaldo y el cuerpo de las
-- funciones desde regla_contable_funciones (la foto tomada antes de
-- reemplazarlas). Quita motivo_ajuste y pagado_contado.
-- Borra 5315 y 519595 solo donde no quedaron líneas. Si un comprobante
-- publicado —o su contra-asiento— las usa, la cuenta se queda.
-- No borra filas de schema_migrations.
--
-- Si un comprobante regla_contable está publicado, se detiene. Antes:
--   select public.fn_revertir_asiento(id, 'regla_contable', 'regla-contable');

set lock_timeout = '8s';
set statement_timeout = '40s';

do $rb$
begin
  if to_regclass('public.journal_entries') is not null
     and exists (
       select 1
       from public.journal_entries
       where fact_key like 'regla_contable:%'
         and posted is true
     ) then
    raise exception 'hay comprobantes de reclasificación publicados: reviértelos con fn_revertir_asiento antes de este rollback';
  end if;
end
$rb$;

delete from public.journal_lines jl
using public.journal_entries je
where jl.journal_entry_id = je.id
  and je.fact_key like 'regla_contable:%'
  and je.posted is not true;

delete from public.journal_entries
where fact_key like 'regla_contable:%'
  and posted is not true;

do $rb$
begin
  if to_regclass('public.regla_contable_respaldo') is null then
    return;
  end if;
  update public.accounting_rules ar
     set debit_account_code = r.debit_account_code,
         credit_account_code = r.credit_account_code,
         name = r.name,
         description = r.description
  from public.regla_contable_respaldo r
  where ar.id = r.rule_id;
end
$rb$;

do $rb$
declare
  r record;
begin
  if to_regclass('public.regla_contable_funciones') is null then
    return;
  end if;
  for r in
    select definicion
    from public.regla_contable_funciones
    order by firma
  loop
    execute r.definicion;
  end loop;
end
$rb$;

alter table public.inventory_adjustments
  drop constraint if exists inventory_adjustments_motivo_ajuste_chk;

alter table public.inventory_adjustments
  drop column if exists motivo_ajuste;

alter table public.dispatch_manifests
  drop column if exists pagado_contado;

delete from public.chart_of_accounts c
where c.account_code in ('5315', '519595')
  and not exists (
    select 1
    from public.journal_lines jl
    where jl.organization_id = c.organization_id
      and jl.account_code = c.account_code
  );

delete from public.puc_plantilla
where codigo = '5315';

do $rb$
begin
  if to_regclass('public.configuracion_contable') is null then
    return;
  end if;
  if exists (
    select 1
    from public.configuracion_contable
    where clave in (
      'faltante_inventario', 'gastos_extraordinarios', 'consumo_interno',
      'manifiesto_por_pagar', 'manifiesto_transporte'
    )
  ) then
    raise notice 'quedan claves nuevas en configuracion_contable; no se restaura el check';
    return;
  end if;

  alter table public.configuracion_contable
    drop constraint if exists configuracion_contable_clave_chk;

  alter table public.configuracion_contable
    add constraint configuracion_contable_clave_chk check (clave in (
      'caja', 'bancos', 'clientes', 'proveedores',
      'ventas_productos', 'ventas_servicios', 'devoluciones', 'descuentos',
      'costo_ventas', 'inventario',
      'iva_generado', 'iva_descontable', 'retefuente', 'reteiva', 'reteica',
      'propinas', 'comisiones', 'anticipos',
      'nomina', 'nomina_por_pagar', 'nomina_aportes'
    ));
end
$rb$;

drop function if exists public.fn_cuenta_inventario_producto(integer, integer, integer);
drop function if exists public.fn_debito_salida_inventario(integer, integer, text, text);
drop function if exists public.fn_cuentas_manifiesto(integer, integer, boolean);
drop function if exists public.fn_regla_contable_reclasificar();

drop table if exists public.regla_contable_aviso;
drop table if exists public.regla_contable_respaldo;
drop table if exists public.regla_contable_funciones;
