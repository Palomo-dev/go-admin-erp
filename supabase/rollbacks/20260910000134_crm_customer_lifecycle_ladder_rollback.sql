-- ============================================================
-- ROLLBACK de 20260910000134_crm_customer_lifecycle_ladder
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita el trigger y la función de la escalera de ciclo de vida.
--
-- SOBRE LOS DATOS: no revierte las promociones de customers.lifecycle_stage ya hechas por el trigger (no hay forma de distinguirlas de las manuales).
-- ============================================================

begin;
drop trigger if exists trg_sync_customer_lifecycle on public.opportunities;
drop function if exists public.fn_sync_customer_lifecycle();
commit;
