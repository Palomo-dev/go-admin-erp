-- Reversión de PENDIENTE_tienda_favoritos.sql (favoritos de la tienda).
--
-- ADVERTENCIA: no restaura datos. Borra las dos tablas con su contenido. Los favoritos que venían
-- de customers.metadata.favorites siguen allí (la migración no los borró) y la tienda vuelve a
-- leerlos de respaldo; los que se guardaron DESPUÉS de aplicar la migración (solo en la tabla) y
-- las listas compartidas se pierden. Si hace falta conservarlos, copiarlos antes a metadata:
--
--   update public.customers c
--      set metadata = jsonb_set(coalesce(c.metadata, '{}'::jsonb), '{favorites}',
--            (select coalesce(jsonb_agg(distinct f.product_id), '[]'::jsonb)
--               from public.store_favorites f where f.customer_id = c.id))
--    where exists (select 1 from public.store_favorites f where f.customer_id = c.id);

-- Las políticas y los índices se van con las tablas.
drop table if exists public.store_favorite_lists;
drop table if exists public.store_favorites;

