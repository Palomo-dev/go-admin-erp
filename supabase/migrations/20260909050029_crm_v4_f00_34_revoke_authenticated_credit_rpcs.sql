-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_34_revoke_authenticated_credit_rpcs`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 6e0f35229e2cda60e0870d90516b1067). No reformatear.
-- F0 r4 · Tarea 3: cierre del hallazgo H de la ronda 3.
-- decrement_ai_credits y deduct_comm_credits son SECURITY DEFINER, aceptan un
-- p_org_id ARBITRARIO y admiten importes negativos: expuestas por PostgREST a
-- `authenticated`, cualquier usuario con sesión podía mover el saldo de OTRA
-- organización (y regalarse créditos con p_cost negativo).
-- En la r3 no se pudo revocar porque src/app/api/ai-assistant/transcribe/route.ts
-- las llamaba con el cliente de sesión (ctx.supabase). Ya está corregido: esa
-- ruta usa getServiceClient(). Verificados TODOS los llamantes del repo, los 10
-- usan cliente service_role:
--   ai-assistant/transcribe/route.ts:85 getServiceClient()
--   lib/services/aiCreditsService.ts:214 (factory local con SUPABASE_SERVICE_ROLE_KEY)
--   lib/services/crm/aiCostService.ts:82,141,212 resolveClient() -> getServiceClient()
--   lib/services/crm/callCreditsService.ts:66 <- api/voice/twiml/outbound/route.ts:84 getServiceClient()
--   lib/services/crm/whatsapp/campaignService.ts:71,111 y outboundService.ts:186 (param `service` = getServiceClient())
--   lib/services/integrations/twilio/twilioService.ts:152 getServiceClient()
--   lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts:429 getServiceSupabase()
-- refund_ai_credits ya quedó solo para service_role en la r3 (mig. 18/19); se
-- repite el REVOKE por idempotencia.
REVOKE EXECUTE ON FUNCTION public.decrement_ai_credits(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_comm_credits(integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_ai_credits(integer, integer)  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.decrement_ai_credits(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_comm_credits(integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_credits(integer, integer)  TO service_role;