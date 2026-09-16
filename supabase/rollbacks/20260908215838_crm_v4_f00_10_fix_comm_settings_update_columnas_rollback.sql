-- ============================================================
-- ROLLBACK de 20260908215838_crm_v4_f00_10_fix_comm_settings_update_columnas
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve el GRANT UPDATE a nivel de tabla (estado previo a la corrección).
--
-- SOBRE LOS DATOS: no toca datos. Reabre la escritura del token de Twilio a authenticated (estado inseguro anterior).
-- ============================================================

begin;
grant update on public.comm_settings to authenticated;
commit;
