-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_04_seed_provider_pricing`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 d511fdeea3726ca9aca4b07ee77074f0). No reformatear.
-- Seed provider_pricing (brief D8 + docs-*.md). verified=true solo si el precio aparece en docs-twilio-voice/messaging, docs-elevenlabs, docs-openai, docs-gemini, docs-resend.
INSERT INTO public.provider_pricing (provider, sku, unit, unit_cost_usd, verified, source_url, notes) VALUES
 ('twilio','voice_out_co_mobile','minute',0.0377,true,'https://www.twilio.com/en-us/voice/pricing/co','Colombia móvil saliente (docs-twilio-voice)'),
 ('twilio','voice_out_co_landline','minute',0.0700,true,'https://www.twilio.com/en-us/voice/pricing/co','Colombia fijo saliente (docs-twilio-voice)'),
 ('twilio','voice_in_local_co','minute',0.0945,true,'https://www.twilio.com/en-us/voice/pricing/co','entrante número local CO (docs-twilio-voice)'),
 ('twilio','voice_sdk_client','minute',0.0040,true,'https://www.twilio.com/en-us/voice/pricing','Voice JS SDK por minuto (docs-twilio-voice)'),
 ('twilio','recording','minute',0.0025,true,'https://www.twilio.com/en-us/voice/pricing','grabación (docs-twilio-voice)'),
 ('twilio','recording_storage','minute',0.0005,true,'https://www.twilio.com/en-us/voice/pricing','almacenamiento por minuto/mes (docs-twilio-voice)'),
 ('twilio','conversation_relay','minute',0.0700,true,'https://www.twilio.com/en-us/voice/pricing','ConversationRelay, adicional a minutos de voz (docs-twilio-voice)'),
 ('twilio','phone_number_local_co','month',14.0000,true,'https://www.twilio.com/en-us/phone-numbers/pricing/co','número local CO (docs-twilio-voice)'),
 ('twilio','sms_out_co','message',0.0592,true,'https://www.twilio.com/en-us/sms/pricing/co','SMS Colombia por segmento (docs-twilio-messaging)'),
 ('twilio','whatsapp_fee','message',0.0050,true,'https://www.twilio.com/en-us/messaging/channels/whatsapp/pricing','fee Twilio por mensaje WA, in+out (docs-twilio-messaging)'),
 ('twilio','amd','call',0.0075,true,'https://www.twilio.com/en-us/voice/pricing','Answering Machine Detection (docs-twilio-voice)'),
 ('elevenlabs','scribe','hour',0.2200,true,'https://elevenlabs.io/pricing/api','Scribe v2 STT (docs-elevenlabs)'),
 ('elevenlabs','tts_flash','char_1k',0.0500,true,'https://elevenlabs.io/pricing/api','TTS flash v2.5 / v3 conversational (docs-elevenlabs)'),
 ('elevenlabs','tts_multilingual','char_1k',0.1000,true,'https://elevenlabs.io/pricing/api','TTS multilingual_v2 / v3 (docs-elevenlabs)'),
 ('elevenlabs','agents','minute',0.0800,true,'https://elevenlabs.io/pricing','ElevenAgents overage (docs-elevenlabs)'),
 ('google','gemini_2_5_flash_audio_in','token_1m_in',1.0000,true,'https://ai.google.dev/gemini-api/docs/pricing','audio nativo (docs-gemini)'),
 ('google','gemini_3_8_flash_in','token_1m_in',0.7500,true,'https://ai.google.dev/gemini-api/docs/pricing','promo hasta 31-dic-2026, luego 1.50 (docs-gemini)'),
 ('google','gemini_3_8_flash_out','token_1m_out',3.7500,true,'https://ai.google.dev/gemini-api/docs/pricing','promo hasta 31-dic-2026, luego 7.50 (docs-gemini)'),
 ('openai','gpt_5_6_luna_in','token_1m_in',0.2000,true,'https://openai.com/api/pricing','docs-openai'),
 ('openai','gpt_5_6_luna_out','token_1m_out',1.2000,true,'https://openai.com/api/pricing','docs-openai'),
 ('openai','gpt_5_6_terra_in','token_1m_in',2.0000,true,'https://openai.com/api/pricing','docs-openai'),
 ('openai','gpt_5_6_terra_out','token_1m_out',12.0000,true,'https://openai.com/api/pricing','docs-openai'),
 ('openai','gpt_transcribe','minute',0.0045,true,'https://openai.com/api/pricing','STT sin diarización (docs-openai)'),
 ('openai','realtime_2_1','minute',0.1000,false,'https://openai.com/api/pricing','estimado in+out; docs-openai solo documenta realtime-2.1-mini'),
 ('resend','pro_50k','email_1k',0.4000,true,'https://resend.com/pricing','Resend Pro $20/50k (docs-resend)'),
 ('meta','wa_marketing_co','message',0.0125,false,'https://developers.facebook.com/docs/whatsapp/pricing','terceros, NO verificado'),
 ('meta','wa_utility_co','message',0.0008,false,'https://developers.facebook.com/docs/whatsapp/pricing','terceros, NO verificado'),
 ('meta','wa_marketing_mx','message',0.0305,false,'https://developers.facebook.com/docs/whatsapp/pricing','terceros, NO verificado'),
 ('meta','wa_utility_mx','message',0.0085,false,'https://developers.facebook.com/docs/whatsapp/pricing','terceros, NO verificado')
ON CONFLICT (provider, sku, valid_from) DO UPDATE
  SET unit_cost_usd = EXCLUDED.unit_cost_usd, verified = EXCLUDED.verified, source_url = EXCLUDED.source_url, notes = EXCLUDED.notes;