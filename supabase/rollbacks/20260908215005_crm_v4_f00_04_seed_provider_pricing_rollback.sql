-- ============================================================
-- ROLLBACK de 20260908215005_crm_v4_f00_04_seed_provider_pricing
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Retira las 29 filas sembradas por (provider, sku). Solo las de valid_from de la
-- siembra original (2026-09-08); las revisiones posteriores (valid_from distinto)
-- no se tocan.
--
-- SOBRE LOS DATOS: es un seed: este rollback restaura la estructura (vacía el catálogo
-- sembrado), no los datos. Si alguien editó un precio sembrado (ON CONFLICT DO
-- UPDATE de una re-aplicación), esa edición también se pierde. fn_unit_cost
-- devolverá NULL para esos SKU y el cobro real en USD quedará en 0.
-- ============================================================

begin;
delete from public.provider_pricing
 where valid_from = date '2026-09-08'
   and (provider, sku) in (
    ('twilio','voice_out_co_mobile'),('twilio','voice_out_co_landline'),('twilio','voice_in_local_co'),
    ('twilio','voice_sdk_client'),('twilio','recording'),('twilio','recording_storage'),
    ('twilio','conversation_relay'),('twilio','phone_number_local_co'),('twilio','sms_out_co'),
    ('twilio','whatsapp_fee'),('twilio','amd'),
    ('elevenlabs','scribe'),('elevenlabs','tts_flash'),('elevenlabs','tts_multilingual'),('elevenlabs','agents'),
    ('google','gemini_2_5_flash_audio_in'),('google','gemini_3_8_flash_in'),('google','gemini_3_8_flash_out'),
    ('openai','gpt_5_6_luna_in'),('openai','gpt_5_6_luna_out'),('openai','gpt_5_6_terra_in'),('openai','gpt_5_6_terra_out'),
    ('openai','gpt_transcribe'),('openai','realtime_2_1'),
    ('resend','pro_50k'),
    ('meta','wa_marketing_co'),('meta','wa_utility_co'),('meta','wa_marketing_mx'),('meta','wa_utility_mx'));
commit;
