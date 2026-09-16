-- ============================================================
-- ROLLBACK de 20260909050212_crm_v4_f00_35_advisors_r4_trigger_functions
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve EXECUTE (default PUBLIC) a las 4 funciones de trigger y quita el
-- search_path fijo de fn_opportunities_set_closed_at (su lógica no cambió, así
-- que basta RESET).
-- ============================================================

begin;
grant execute on function public.fn_update_customer_channel_identity() to public;
grant execute on function public.fn_sync_status_from_stage() to public;
grant execute on function public.fn_create_commission_on_opportunity_won() to public;
grant execute on function public.fn_auto_journal_commission() to public;
alter function public.fn_opportunities_set_closed_at() reset search_path;
grant execute on function public.fn_opportunities_set_closed_at() to public;
commit;
