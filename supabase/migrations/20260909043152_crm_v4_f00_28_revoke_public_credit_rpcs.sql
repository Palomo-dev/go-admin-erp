-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_28_revoke_public_credit_rpcs`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 ddf9c34dfad12aeb1f99965a118a06c1). No reformatear.
-- Corrección de crm_v4_f00_27. El REVOKE a `anon` quitó el grant explícito, pero
-- la ACL conservaba `=X/postgres` (EXECUTE a PUBLIC, el default de CREATE FUNCTION),
-- así que has_function_privilege('anon', …, 'EXECUTE') seguía devolviendo true.
-- Hay que revocar a PUBLIC y re-conceder explícitamente a quien sí debe llamarlas.
--   authenticated: lo necesita src/app/api/ai-assistant/transcribe/route.ts:79
--     (usa ctx.supabase = getServerUserClient). Ver petición a REG/SEC en el informe.
--   service_role: el resto de los llamantes.

REVOKE ALL ON FUNCTION public.decrement_ai_credits(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_ai_credits(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.decrement_ai_credits(integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.deduct_comm_credits(integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_comm_credits(integer, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_comm_credits(integer, text, integer) TO authenticated, service_role;
