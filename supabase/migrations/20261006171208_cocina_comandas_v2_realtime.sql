-- Aplicada el 2026-10-06 con apply_migration (versión 20261006171208).
-- Parte 3 de 3 de cocina_comandas_v2: kitchen_ticket_items entra en supabase_realtime.
-- El cuerpo bajo la línea de guiones es el texto exacto aplicado (md5 9d9f973204a5a3c4ecdbf5dd19c27ba5).
-- ------------------------------------------------------------------------
set lock_timeout = '10s';

-- 5. Realtime ---------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kitchen_ticket_items') then
    alter publication supabase_realtime add table public.kitchen_ticket_items;
  end if;
end $$;
