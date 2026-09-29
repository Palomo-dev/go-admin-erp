-- Reversión de 20260929022000_inv_b6_importar_catalogo.sql.
--
-- Retira las RPC de importación de categorías y proveedores. No deshace lo
-- importado: las categorías y los proveedores creados o actualizados con ellas
-- se quedan (son datos de los usuarios). Tras revertir, las pantallas de
-- importación vuelven a necesitar la versión anterior del código.

drop function if exists public.fn_proveedores_importar(integer, jsonb, boolean, integer[]);
drop function if exists public.fn_categorias_importar(integer, jsonb, boolean);
drop function if exists public.fn_proveedor_int_documento(text);
