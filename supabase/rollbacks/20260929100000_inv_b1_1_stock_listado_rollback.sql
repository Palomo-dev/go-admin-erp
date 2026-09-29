-- Reversión de 20260929100000_inv_b1_1_stock_listado.sql
-- Función nueva de solo lectura: se elimina. No toca datos.

drop function if exists public.fn_stock_listado(integer, jsonb, integer, integer);
