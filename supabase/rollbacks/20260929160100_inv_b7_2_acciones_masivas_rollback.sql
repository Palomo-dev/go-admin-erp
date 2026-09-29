-- Rollback de 20260929160100_inv_b7_2_acciones_masivas.sql
-- Quita las RPC masivas del catálogo. La interfaz anterior (bulkService.ts con
-- escrituras directas) vuelve con el commit anterior al de B7; los cambios de
-- precio, costo, estado y categoría ya hechos por estas RPC no se deshacen.

drop function if exists public.fn_productos_categoria_masiva(integer, integer[], integer);
drop function if exists public.fn_productos_estado_masivo(integer, integer[], text);
drop function if exists public.fn_productos_int_con_variantes(integer, integer[]);
drop function if exists public.fn_productos_precio_masivo(integer, integer[], text, text, jsonb);
drop function if exists public.fn_productos_int_redondear(numeric, text, numeric, integer, text);
drop function if exists public.fn_productos_masivo_alcance(integer, integer[]);
