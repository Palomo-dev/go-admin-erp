-- ============================================================
-- ROLLBACK de 20260909042123_crm_v4_f00_17_usage_logs_cost_amount
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita cost_amount de ambas tablas (f00_39 de F0-REG crea funciones que la leen: revertirla antes).
--
-- SOBRE LOS DATOS: restaura la estructura, no los datos: el costo real en USD escrito en
-- cost_amount desde el 2026-09-09 se pierde (el backfill desde metadata fue 0 filas,
-- pero aiCostService y la Edge Function escriben la columna desde entonces).
-- ============================================================

begin;
alter table public.comm_usage_logs drop column if exists cost_amount;
alter table public.ai_usage_logs   drop column if exists cost_amount;
commit;
