-- Reversión de 20260923223000_catalogo_productos_por_lotes.
-- El catálogo vuelve a get_catalogo_productos + carga desde el navegador
-- (revertir también el commit de CatalogoProductos.tsx).
drop function if exists public.catalogo_productos_lote(integer, integer, integer, text, integer, text, text, integer[]);
