-- ============================================================
-- ROLLBACK de 20260909042156_crm_v4_f00_18_refund_ai_credits
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Elimina refund_ai_credits (creada en esta migración). refundAiCredits (aiCostService) vuelve al camino anterior (decrement negativo) solo si se revierte también el TS.
-- ============================================================

begin;
drop function if exists public.refund_ai_credits(integer, integer);
commit;
