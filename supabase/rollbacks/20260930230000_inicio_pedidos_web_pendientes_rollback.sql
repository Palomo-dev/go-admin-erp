-- Rollback de 20260930230000_inicio_pedidos_web_pendientes: quita la función.
-- Revertir antes 20260930230100_inicio_series_diarias (fn_inicio_tienda_web la
-- llama). No toca datos.

drop function if exists public.fn_inicio_pedidos_web_pendientes(integer, integer, integer);
