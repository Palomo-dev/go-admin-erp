-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_24_seed_pricing_gemini_3_8_audio_in`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 be4ad57f13e555ae9479a4fe754010c9). No reformatear.
-- P15 (F3/F4). Auditoría de los SKU que usa el código contra provider_pricing:
--   callCreditsService.ts:13,106,107 -> twilio: voice_out_co_mobile,
--     voice_out_co_landline, voice_in_local_co, voice_sdk_client, recording   [OK]
--   transcriptionService.ts:189,193,198 -> google/gemini_2_5_flash_audio_in,
--     openai/gpt_transcribe, elevenlabs/scribe                                 [OK]
--   callAnalysisService.ts:459-460 -> google/gemini_3_8_flash_in|out,
--     openai/gpt_5_6_luna_in|out                                              [OK]
--   whatsapp/costs.ts:28,38 y campaignEvents.ts:55 -> twilio/whatsapp_fee,
--     meta/wa_{marketing,utility}_{co,mx}                                     [OK]
--   aiDraftService.ts:113 -> openai/gpt_5_6_luna_in                           [OK]
-- Los 29 SKU sembrados en crm_v4_f00_04 cubren todo lo anterior. El único que
-- falta es el de audio de Gemini 3.8 Flash, que pidió F4.
--
-- docs-gemini.md (scratchpad) da 0.75/3.75 por 1M texto in/out para
-- gemini-3.8-flash (promo hasta 31-dic-2026) pero deja el "Audio in" SIN PUBLICAR
-- ("?"). Se siembra como ESTIMACIÓN con verified=false, alineada con el audio-in
-- de gemini-2.5-flash ($1.00/1M), que es lo que hoy usa transcriptionService.ts:189
-- como aproximación. Debe re-verificarse cuando Google publique la tarifa.

INSERT INTO public.provider_pricing (provider, sku, unit, unit_cost_usd, currency, valid_from, verified, source_url, notes)
VALUES (
  'google', 'gemini_3_8_flash_audio_in', 'token_1m_in', 1.000000, 'USD', CURRENT_DATE, false,
  'https://ai.google.dev/gemini-api/docs/pricing',
  'ESTIMADO: Google no publica el precio de audio-in de gemini-3.8-flash (docs-gemini.md deja "?"). Se usa la tarifa de audio-in de gemini-2.5-flash ($1.00/1M). Re-verificar. 32 tokens/s de audio.'
)
ON CONFLICT (provider, sku, valid_from) DO NOTHING;
