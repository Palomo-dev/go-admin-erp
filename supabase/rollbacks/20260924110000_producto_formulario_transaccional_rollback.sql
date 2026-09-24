-- Rollback de 20260924110000_producto_formulario_transaccional.sql
-- No restaura datos: los productos guardados con fn_producto_guardar se quedan.
-- Las internas que usa viven en 20260924100000 y se revierten con su propio rollback.

drop function if exists public.fn_producto_guardar(integer, jsonb);
drop function if exists public.fn_producto_para_formulario(integer, integer);
