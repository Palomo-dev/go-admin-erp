-- Realtime: fuera de la publicación las tablas que reciben escrituras en lote y
-- que nadie necesita escuchar (diagnóstico 2026-11-25, ver commit).
--
-- 2026-11-25 13:15–13:22 y 13:51–13:55 (hora Colombia): un cambio masivo de
-- precios (`fn_productos_precio_masivo`, ~730 llamadas de hasta 1.000
-- productos) escribió cientos de miles de filas en product_prices y products.
-- Realtime decodifica TODO cambio de una tabla publicada y cuenta el evento
-- contra el límite del proyecto aunque nadie lo escuche: saltó
-- «MessagePerSecondRateLimitReached» y `realtime.list_changes` se canceló por
-- tiempo (57014), con lo que se pierden en esos minutos también los eventos que
-- sí importan (pedidos web, impresión, cocina, chat).
--
--   - product_prices, product_costs: solo las escuchaba el catálogo de
--     productos, sin filtro. Las escrituras masivas (precio masivo, importación)
--     ya marcan products.updated_at, y el catálogo escucha `products` filtrado
--     por organización: basta con eso.
--   - widget_sessions: ~12.700 UPDATE y ningún suscriptor (verificado en ERP,
--     tienda, vendedores y super con `git grep postgres_changes`).
--   - member_notices: los avisos del miembro se leen por sondeo
--     (useNotificacionesHeader); además tenía replica identity FULL.
--
-- Rollback: supabase/rollbacks/20261126160659_realtime_sin_tablas_masivas_rollback.sql
do $$
declare
  t text;
begin
  foreach t in array array['product_prices', 'product_costs', 'widget_sessions', 'member_notices'] loop
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
