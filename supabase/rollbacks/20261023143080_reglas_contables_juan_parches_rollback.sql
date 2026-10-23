-- Rollback de 20261023143080_reglas_contables_juan_parches.sql
--
-- Restaura el borrador del ajuste, el detalle, la salida de stock y las
-- reglas por defecto de una organización nueva. No revierte los asientos
-- automáticos: eso es 20261023143050, y va después.
-- No borra borradores de reclasificación: eso es 20261023143100, y va antes.

set lock_timeout = '8s';
set statement_timeout = '40s';

do $rb$
declare
  r record;
begin
  if to_regclass('public.regla_contable_funciones') is null then
    raise exception 'falta regla_contable_funciones: no hay foto para restaurar los parches';
  end if;

  for r in
    select definicion
    from public.regla_contable_funciones
    where firma like 'fn_ajuste_guardar%'
       or firma like 'fn_ajuste_detalle%'
       or firma like 'fn_stock_registrar_movimiento%'
       or firma like 'fn_create_default_accounting_rules%'
    order by firma
  loop
    execute r.definicion;
  end loop;
end
$rb$;

drop function if exists public.fn_regla_contable_reclasificar();
