-- ============================================================
-- ROLLBACK de 20260909182204_crm_v4_f06_05_privilege_snapshot_for_tests
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Elimina fn_f6_privilege_snapshot (f06_07 y f06_09 la redefinen: sus rollbacks van antes; si se revierte todo, basta este DROP).
-- ============================================================

begin;
drop function if exists public.fn_f6_privilege_snapshot();
commit;
