-- Reversión de 20261126160659_realtime_sin_tablas_masivas.sql: vuelve a publicar
-- las cuatro tablas en supabase_realtime (idempotente).
do $$
declare
  t text;
begin
  foreach t in array array['product_prices', 'product_costs', 'widget_sessions', 'member_notices'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
