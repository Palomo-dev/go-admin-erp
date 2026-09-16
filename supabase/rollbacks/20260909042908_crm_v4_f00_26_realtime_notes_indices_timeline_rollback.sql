-- ============================================================
-- ROLLBACK de 20260909042908_crm_v4_f00_26_realtime_notes_indices_timeline
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita los 3 índices del timeline y saca notes de la publicación realtime.
-- ============================================================

begin;
drop index if exists public.email_messages_org_related_created_idx;
drop index if exists public.notes_org_related_created_idx;
drop index if exists public.tasks_org_related_created_idx;
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes') then
    alter publication supabase_realtime drop table public.notes;
  end if;
end $$;
commit;
