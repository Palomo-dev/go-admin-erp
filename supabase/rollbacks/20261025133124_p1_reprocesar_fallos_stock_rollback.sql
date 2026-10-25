-- Rollback de 20261025133124_p1_reprocesar_fallos_stock: funciones nuevas, no había definición previa.
drop function if exists public.fn_reprocesar_fallos_stock(integer, integer, bigint);
drop function if exists public.fn_reprocesar_fallos_stock_desde(integer, timestamp with time zone, integer, bigint);
drop function if exists public.fn_asiento_stock_movement(public.stock_movements);
