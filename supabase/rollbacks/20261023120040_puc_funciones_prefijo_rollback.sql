-- Restaura las funciones que 20261023120040 reemplazó, desde el respaldo.
-- No borra fn_saldos_jerarquicos ni fn_cuenta_por_clave: eso lo hace
-- 20261023120100_puc_consolidacion_prefijo_movimiento_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

do $rb$
declare
  r record;
begin
  if to_regclass('public.puc_consolidacion_funciones') is null then
    return;
  end if;
  for r in
    select definicion
    from public.puc_consolidacion_funciones
    where firma like any (array[
      'fn_create_default_chart_of_accounts(%',
      'fn_propuesta_configuracion_sector(%',
      'fn_clave_cuenta_configurable(%',
      'fn_asiento_movimiento_caja(%',
      'fn_auto_journal_bank(%',
      'fn_traslado_int_asiento(%',
      'fn_create_branch_subaccounts(%'
    ])
  loop
    execute r.definicion;
  end loop;
end
$rb$;
