-- Aplicada el 2026-10-06 18:20:17 UTC con apply_migration (versión 20261006182017).
-- Carta QR en la mesa · 6 — los abonos en línea en Realtime.
--
-- POS › Mesas se suscribe a `table_online_payments` (filtrando organization_id) para recargar el
-- saldo de la cuenta cuando entra un abono de la Carta QR; sin la tabla en la publicación, el
-- cajero solo ve el saldo nuevo al recargar. Aditiva: solo añade la tabla a supabase_realtime.
-- Realtime respeta la RLS de lectura de la tabla (miembros con acceso a la sede); anon no lee.
--
-- ENSAYO (2026-10-06, execute_sql, bloque `do` deshecho con `raise exception`):
--   ENSAYO_OK antes=0 despues=1 anon_lee=42501
--   Antes de aplicar (2026-10-06): RLS activa, una sola política (SELECT, authenticated,
--   miembro activo + app_branch_access); en un bloque deshecho, un usuario de otra organización
--   ve 0 abonos de la sesión, un miembro la ve y anon recibe 42501.

set lock_timeout = '10s';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_online_payments') then
    alter publication supabase_realtime add table public.table_online_payments;
  end if;
end $$;
