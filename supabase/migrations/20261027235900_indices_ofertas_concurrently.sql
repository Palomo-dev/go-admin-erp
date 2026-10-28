-- Índices parciales para el conteo de ofertas y la consulta de descuentos por producto. SIN APLICAR.
--
-- ORDEN DE APLICACIÓN: este archivo va PRIMERO, FUERA de transacción (sin begin/commit: CREATE INDEX
-- CONCURRENTLY no puede ir dentro de un bloque de transacción; correr cada sentencia suelta, p. ej.
-- psql con autocommit, NO por execute_sql, que envuelve en transacción). Después se aplica
-- 20261027240000_rls_mis_orgs_ofertas.sql, cuyos CREATE INDEX IF NOT EXISTS quedan como no-op.
-- (El número 235900 es anterior a 240000 a propósito.)
--
-- CONCURRENTLY no bloquea escrituras (POS sigue vendiendo). Si falla a mitad, deja un índice INVALID:
-- revisar pg_index.indisvalid, hacer DROP INDEX CONCURRENTLY IF EXISTS y repetir.
-- Tamaños (2026-10-27): product_prices 38 MB total / 19 MB heap (~254 k filas, ~61 k vigentes);
-- sale_items 4,7 MB / 3,2 MB (~17 k filas).

create index concurrently if not exists idx_product_prices_ofertas_vigentes
  on public.product_prices (product_id)
  where effective_to is null and compare_price > 0;

create index concurrently if not exists idx_sale_items_product_con_descuento
  on public.sale_items (product_id)
  where discount_amount > 0;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261027235900', 'indices_ofertas_concurrently', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
