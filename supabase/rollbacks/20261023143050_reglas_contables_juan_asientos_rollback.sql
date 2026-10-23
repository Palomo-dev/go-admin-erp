-- Rollback de 20261023143050_reglas_contables_juan_asientos.sql
--
-- Devuelve el cuerpo de las funciones de asiento a la foto tomada en
-- regla_contable_funciones, antes de reemplazarlas. No toca las reglas,
-- las cuentas ni motivo_ajuste: eso lo revierte 20261023143000, y va después.
-- No borra borradores: eso lo revierte 20261023143100, y va antes.
-- Los privilegios se conservan: create or replace no los cambia.

set lock_timeout = '8s';
set statement_timeout = '40s';

do $rb$
declare
  r record;
begin
  if to_regclass('public.regla_contable_funciones') is null then
    raise exception 'falta regla_contable_funciones: no hay foto para restaurar los asientos';
  end if;

  for r in
    select definicion
    from public.regla_contable_funciones
    where firma not like 'fn_propuesta_configuracion_sector%'
    order by firma
  loop
    execute r.definicion;
  end loop;
end
$rb$;

drop function if exists public.fn_regla_contable_reclasificar();
