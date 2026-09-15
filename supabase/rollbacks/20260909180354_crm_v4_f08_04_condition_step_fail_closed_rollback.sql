-- ============================================================
-- ROLLBACK de 20260909180354_crm_v4_f08_04_condition_step_fail_closed
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita los dos CHECK de pasos de condición. El UPDATE de continue_on_error no se revierte (0 filas afectadas al aplicar).
--
-- SOBRE LOS DATOS: no toca datos.
-- ============================================================

begin;
alter table public.sequence_steps drop constraint if exists sequence_steps_condition_no_continue_chk;
alter table public.sequence_steps drop constraint if exists sequence_steps_condition_required_chk;
commit;
