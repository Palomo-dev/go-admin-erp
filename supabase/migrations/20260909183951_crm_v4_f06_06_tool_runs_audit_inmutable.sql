-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_06_tool_runs_audit_inmutable`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 0150371890da831cfa8b2a6da569174e). No reformatear.
-- FASE 06 · ronda 3 · GEMELO de R3-2 encontrado en la pasada de gemelos.
--
-- `voice_agent_call_attempts` se cerró (el inquilino ya no puede resetear su
-- tope). Su gemelo estaba en la tabla de al lado: `voice_agent_tool_runs`, el
-- registro de lo que hizo el agente IA durante la llamada —incluida la
-- ejecución de `log_consent_opt_out`, que es una obligación legal (Ley 1581)—
-- tenía INSERT/UPDATE/DELETE para `anon` y `authenticated`, con sus políticas.
-- Es decir: el inquilino podía BORRAR la prueba de que el cliente pidió la baja.
--
-- Quién escribe de verdad: solo `recordToolRun` en
-- src/lib/services/crm/voiceAgentTools.ts, y siempre con el cliente de servicio
-- (conversationRelayHandler.ts:498 `supabase: getServiceSupabase()`). Ningún
-- camino de navegador escribe aquí, así que la revocación no rompe nada.
--
-- Se conserva SELECT bajo RLS: la interfaz lo lee en el timeline (AiCallEntry).

DROP POLICY IF EXISTS vatr_insert ON public.voice_agent_tool_runs;
DROP POLICY IF EXISTS vatr_update ON public.voice_agent_tool_runs;
DROP POLICY IF EXISTS vatr_delete ON public.voice_agent_tool_runs;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.voice_agent_tool_runs FROM anon, authenticated;

COMMENT ON TABLE public.voice_agent_tool_runs IS
  'Auditoría inmutable de las herramientas ejecutadas por el agente IA. Solo la escribe el rol de servicio; el inquilino solo puede LEERLA (F6/r3, gemelo de R3-2).';