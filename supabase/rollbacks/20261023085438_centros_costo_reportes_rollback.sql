-- Revierte 20261023085438_centros_costo_reportes.
-- Quita los dos reportes por centro. No toca journal_lines ni centros.
-- La prueba 60/40 de esa migración borró su propia fila; aquí no hay datos que restaurar.
-- Entre la migración de distribución y esta, fn_repartir_monto tenía EXECUTE para PUBLIC
-- (el privilegio por defecto al crearla). Esta migración se lo quitó. Se lo devuelve.

drop function if exists public.fn_estado_resultados_centro(bigint, timestamptz, timestamptz, uuid, boolean);
drop function if exists public.fn_comparativo_centros(bigint, timestamptz, timestamptz, uuid[]);

grant execute on function public.fn_repartir_monto(integer, integer, text, uuid, uuid, numeric, numeric, numeric, numeric) to public;
