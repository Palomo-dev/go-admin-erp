-- Reversión de 20260914110000_go_assistant_f2_compras_y_traslados.sql
-- Solo elimina las funciones. No toca órdenes ni traslados ya creados.
drop function if exists public.assistant_create_purchase_order(integer, integer, uuid, jsonb);
drop function if exists public.assistant_create_transfer(integer, uuid, jsonb);
