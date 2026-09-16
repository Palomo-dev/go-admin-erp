-- Reversión de 20260914140000_go_assistant_f2_carga_masiva_productos.sql
-- Solo elimina la función. No toca productos, ajustes ni precios ya creados.
drop function if exists public.assistant_bulk_load_products(integer, integer, uuid, jsonb, integer);
