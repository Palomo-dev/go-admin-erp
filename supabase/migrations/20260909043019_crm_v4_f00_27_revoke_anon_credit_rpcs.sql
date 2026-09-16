-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_27_revoke_anon_credit_rpcs`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 80f664329938530c0a38fa638c123d2c). No reformatear.
-- P19 (advisors). get_advisors(security) señala:
--   anon_security_definer_function_executable / authenticated_..._executable
--   sobre public.decrement_ai_credits(integer,integer) y
--   public.deduct_comm_credits(integer,text,integer).
-- Ambas son SECURITY DEFINER que MUEVEN SALDO y aceptan p_org_id arbitrario:
-- cualquiera podía debitar (o, con importe negativo, abonar) créditos de
-- cualquier organización vía /rest/v1/rpc/.
--
-- Se revoca `anon` (rol sin sesión): NINGUNA ruta del repo las llama sin sesión
-- (verificado con grep: aiCostService.ts, aiCreditsService.ts, callCreditsService.ts,
-- campaignService.ts, outboundService.ts, twilioService.ts y
-- conversationRelayHandler.ts usan service role, y transcribe/route.ts usa el
-- cliente de sesión = rol `authenticated`). Riesgo de regresión: nulo.
--
-- NO se revoca `authenticated` en esta ronda porque
-- src/app/api/ai-assistant/transcribe/route.ts:79 llama a decrement_ai_credits
-- con `ctx.supabase` (getServerUserClient -> rol authenticated) y la revocación
-- rompería esa ruta en producción. Queda pedido a REG/SEC en el informe.

REVOKE EXECUTE ON FUNCTION public.decrement_ai_credits(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_comm_credits(integer, text, integer) FROM anon;
