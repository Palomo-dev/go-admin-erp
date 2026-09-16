-- ============================================================
-- ROLLBACK de 20260909042807_crm_v4_f00_24_seed_pricing_gemini_3_8_audio_in
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Retira la fila estimada de gemini_3_8_flash_audio_in (la sembró esta migración con valid_from = fecha de aplicación, 2026-09-09).
--
-- SOBRE LOS DATOS: es un seed: este rollback no restaura datos, los retira.
-- ============================================================

begin;
delete from public.provider_pricing where provider = 'google' and sku = 'gemini_3_8_flash_audio_in' and valid_from = date '2026-09-09';
commit;
