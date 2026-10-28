-- Índices parciales para el conteo de ofertas y la consulta de descuentos por producto. SIN APLICAR.
--
-- CÓMO APLICAR (único método válido):
--   psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261027235900_indices_ofertas_concurrently.sql
--   por conexión directa a la base o por el pooler en MODO SESIÓN (puerto 5432).
-- NO SIRVEN: apply_migration, execute_sql, supabase db push, psql -c, ni el pooler en modo
-- transacción (puerto 6543). Todos ellos envuelven en transacción o agrupan sentencias, y
-- CREATE INDEX CONCURRENTLY no puede ir dentro de un bloque de transacción.
--
-- ORDEN: este archivo va PRIMERO; después 20261027240000_rls_mis_orgs_ofertas.sql, cuyos
-- CREATE INDEX IF NOT EXISTS quedan como no-op. (El número 235900 es anterior a 240000 a propósito.)
--
-- CONCURRENTLY no bloquea escrituras (POS sigue vendiendo). Si un índice queda INVALID (falla a
-- mitad), el bloque final lanza excepción y NO registra la migración. Arreglo:
--   drop index concurrently if exists public.<indice>;   -- y repetir el psql -f de arriba.
-- Ojo: IF NOT EXISTS no recrea un índice INVALID ya existente; hay que borrarlo primero.
-- Tamaños (2026-10-27): product_prices 38 MB total / 19 MB heap (~254 k filas, ~61 k vigentes);
-- sale_items 4,7 MB / 3,2 MB (~17 k filas).

create index concurrently if not exists idx_product_prices_ofertas_vigentes
  on public.product_prices (product_id)
  where effective_to is null and compare_price > 0;

create index concurrently if not exists idx_sale_items_product_con_descuento
  on public.sale_items (product_id)
  where discount_amount > 0;

-- Registro de la migración SOLO si ambos índices existen y son válidos.
do $$
declare
  v_idx text;
  v_valid boolean;
begin
  foreach v_idx in array array['idx_product_prices_ofertas_vigentes',
                               'idx_sale_items_product_con_descuento']
  loop
    select i.indisvalid into v_valid
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_index i on i.indexrelid = c.oid
     where n.nspname = 'public' and c.relname = v_idx;

    if not found then
      raise exception 'Índice % no existe; migración 20261027235900 NO registrada', v_idx;
    elsif not v_valid then
      raise exception 'Índice % está INVALID; hacer DROP INDEX CONCURRENTLY public.% y repetir', v_idx, v_idx;
    end if;
  end loop;

  insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
  values ('20261027235900', 'indices_ofertas_concurrently', array[]::text[], 'p1_apply_executor')
  on conflict (version) do nothing;
end
$$;
