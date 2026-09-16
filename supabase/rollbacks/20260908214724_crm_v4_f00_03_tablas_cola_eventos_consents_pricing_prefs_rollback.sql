-- ============================================================
-- ROLLBACK de 20260908214724_crm_v4_f00_03_tablas_cola_eventos_consents_pricing_prefs
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Elimina las 5 tablas creadas por M3 y fn_unit_cost. CASCADE porque otras
-- migraciones posteriores (F5/F6/F8) cuelgan FKs, vistas y funciones de estas
-- tablas: sus rollbacks deben ejecutarse ANTES que este.
--
-- SOBRE LOS DATOS: destruye la cola (outbound_jobs), el outbox (crm_events), los
-- consentimientos (contact_consents), el catálogo de precios y las preferencias
-- de usuario con TODO su contenido. No es recuperable sin backup.
-- ============================================================

begin;
drop function if exists public.fn_unit_cost(text, text, date);
drop table if exists public.user_comm_preferences cascade;
drop table if exists public.provider_pricing cascade;
drop table if exists public.contact_consents cascade;
drop table if exists public.crm_events cascade;
drop table if exists public.outbound_jobs cascade;
commit;
