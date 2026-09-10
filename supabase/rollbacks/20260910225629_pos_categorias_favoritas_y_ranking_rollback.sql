-- ============================================================
-- ROLLBACK de 20260910230000_pos_categorias_favoritas_y_ranking.sql
-- ============================================================
-- Elimina la RPC y la tabla de favoritos de categorías. Es seguro: la tabla
-- solo guarda qué categorías marcó cada organización como favoritas; no hay
-- datos de negocio que se pierdan más allá de esas marcas.
-- ============================================================

begin;

set local lock_timeout = '3s';

drop function if exists public.pos_category_ranking(integer);
drop table if exists public.category_favorites;

commit;
