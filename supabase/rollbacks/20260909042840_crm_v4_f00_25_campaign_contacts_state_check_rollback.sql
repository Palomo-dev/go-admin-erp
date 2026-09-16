-- ============================================================
-- ROLLBACK de 20260909042840_crm_v4_f00_25_campaign_contacts_state_check
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve el CHECK de campaign_contacts.state a los 5 valores previos.
--
-- SOBRE LOS DATOS: no toca datos, pero si hay filas con los 6 estados nuevos (queued/opened/clicked/replied/bounced/skipped) el ADD CONSTRAINT falla: normalizarlas antes.
-- ============================================================

begin;
alter table public.campaign_contacts drop constraint if exists campaign_contacts_state_check;
alter table public.campaign_contacts add constraint campaign_contacts_state_check
  check (state = any (array['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text]));
commit;
