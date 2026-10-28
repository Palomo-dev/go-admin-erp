-- Rollback de 20261027235900. FUERA de transacción (DROP INDEX CONCURRENTLY no admite begin).
-- Orden: primero el rollback de 20261027240000, luego este.
drop index concurrently if exists public.idx_product_prices_ofertas_vigentes;
drop index concurrently if exists public.idx_sale_items_product_con_descuento;

delete from supabase_migrations.schema_migrations where version = '20261027235900';
