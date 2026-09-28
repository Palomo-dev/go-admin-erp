-- Rollback de 20260924190000_ajuste_masivo_stock_por_kardex.sql
--
-- Quita las tres funciones del ajuste masivo por kardex. No revierte datos: los
-- stock_movements de ajuste y sus asientos que se hayan creado siguen en el
-- kardex y en la contabilidad (son hechos contables; se corrigen con otro
-- ajuste, no borrándolos). Tras revertir, la interfaz de acciones masivas
-- fallará al ajustar stock hasta revertir también el commit del frontend.
drop function if exists public.fn_productos_ajuste_masivo_stock(integer, integer[], integer, text, numeric, text, boolean);
drop function if exists public.fn_productos_stock_masivo_alcance(integer, integer[]);
drop function if exists public.fn_productos_int_expandir_variantes(integer, integer[]);
