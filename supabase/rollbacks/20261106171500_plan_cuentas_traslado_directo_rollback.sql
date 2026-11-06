-- Reversión de 20261106171500_plan_cuentas_traslado_directo.
-- Esta migración solo reemplaza fn_plan_crear_auxiliar. La versión anterior tenía el error que
-- esta corrige, así que no se restaura: para quitar la función usa el rollback de 20261106170000.
select 1;
