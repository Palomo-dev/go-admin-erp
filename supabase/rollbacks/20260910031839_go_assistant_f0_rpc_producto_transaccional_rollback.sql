-- Reversión de 20260910031839_go_assistant_f0_rpc_producto_transaccional.sql
-- Solo elimina las funciones. No toca productos ni precios ya creados.
-- Ojo: `assistant_bulk_load_products` (20260914140000) las invoca; revertir esa antes.
drop function if exists public.assistant_create_product(integer, jsonb);
drop function if exists public.assistant_set_product_price(integer, integer, numeric);
