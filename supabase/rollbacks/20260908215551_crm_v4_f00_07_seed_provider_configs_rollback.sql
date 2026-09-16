-- ============================================================
-- ROLLBACK de 20260908215551_crm_v4_f00_07_seed_provider_configs
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita trigger y funciones de siembra. Las 12 filas por organización que
-- sembró el backfill se conservan (ver datos).
--
-- SOBRE LOS DATOS: este rollback restaura la estructura, no los datos: NO borra las filas
-- sembradas en provider_configs porque desde que existen son configuración
-- editable por cada organización (settings, is_active, credentials en Vault) y
-- no hay marca que distinga una fila sembrada intacta de una editada. Retirarlas
-- para una organización concreta se hace a mano por (organization_id, category, provider).
-- ============================================================

begin;
drop trigger if exists trg_seed_provider_configs_on_org on public.organizations;
drop function if exists public.fn_seed_provider_configs_on_org();
drop function if exists public.fn_seed_provider_configs(integer);
commit;
