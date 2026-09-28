-- Rollback de 20260924150000_importar_productos_lote.sql
-- Elimina la RPC de importación por lotes y su normalizador. No toca datos:
-- los productos, categorías, proveedores y movimientos que se importaron con
-- ella se quedan (son datos del cliente, no estructura).

drop function if exists public.fn_importar_productos_lote(integer, integer, text, jsonb, jsonb);
drop function if exists public.fn_import_normalizar(text);
