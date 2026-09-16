-- ============================================================
-- ROLLBACK de 20260909042724_crm_v4_f00_23_activities_call_id_unique
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita el UNIQUE y recrea el índice no único que f00_11 había creado.
-- ============================================================

begin;
drop index if exists public.activities_call_id_uidx;
create index if not exists activities_call_id_idx on public.activities(call_id) where call_id is not null;
commit;
