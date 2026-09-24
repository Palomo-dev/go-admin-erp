-- Rollback de 20260924081336_listados_facturas_venta_y_cartera.sql
-- Solo lectura: no hay datos que restaurar.
drop function if exists public.fn_cxc_listado(integer, jsonb, text, integer, integer);
drop function if exists public.fn_facturas_venta_listado(integer, jsonb, text, integer, integer);
