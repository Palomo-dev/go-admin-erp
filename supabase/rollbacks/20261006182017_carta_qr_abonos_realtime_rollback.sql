-- Rollback de 20261006182017_carta_qr_abonos_realtime: saca la tabla de la publicación.
do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_online_payments') then
    alter publication supabase_realtime drop table public.table_online_payments;
  end if;
end $$;
