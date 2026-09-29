-- Reversión de 20260929160200_inv_b6a_3_variantes_escritura.sql
-- Revertir antes 20260929160400 (`fn_variantes_como_actor` llama a estas).
-- Los cambios que ya hicieron en el catálogo y en `variant_data` no se deshacen
-- (cada producto modificado dejó su fila en `products_audit_log`).

drop function if exists public.fn_variante_tipo_guardar(integer, integer, jsonb);
drop function if exists public.fn_variantes_fusionar_tipos(integer, integer[], integer);
drop function if exists public.fn_variante_valor_guardar(integer, integer, jsonb);
drop function if exists public.fn_variantes_fusionar_valores(integer, integer[], integer);
