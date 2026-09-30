-- Reversión de 20260930170100_inicio_ventas_periodo_y_tienda_web.sql.
-- Solo quita las dos funciones nuevas; `fn_inicio_ventas_rango` no se tocó.
-- Revertir ANTES 20260930170200 (fn_inicio_modulos_resumen llama a
-- fn_inicio_ventas_periodo).

drop function if exists public.fn_inicio_tienda_web(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer);
drop function if exists public.fn_inicio_ventas_periodo(integer, timestamptz, timestamptz, timestamptz, timestamptz, integer);
