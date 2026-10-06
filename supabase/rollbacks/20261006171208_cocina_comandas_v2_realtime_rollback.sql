-- Reversión de 20261006171208_cocina_comandas_v2_realtime.sql.
-- Saca kitchen_ticket_items de supabase_realtime. No toca datos.
-- Orden de reversión de cocina_comandas_v2: 171208 → 171155 → 171048.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kitchen_ticket_items') then
    alter publication supabase_realtime drop table public.kitchen_ticket_items;
  end if;
end $$;
