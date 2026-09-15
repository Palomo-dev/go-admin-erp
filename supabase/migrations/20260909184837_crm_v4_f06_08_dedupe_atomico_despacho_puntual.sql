-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f06_08_dedupe_atomico_despacho_puntual`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 1cb638a6059874bfde8e3e6b953d0790). No reformatear.
-- FASE 06 · ronda 3 · R3-6
-- La deduplicación del despacho puntual (`dispatchAgentCall`) era una consulta
-- seguida de un INSERT, sin atomicidad: dos POST simultáneos del mismo
-- administrador podían crear dos filas vivas para el mismo cliente y, por tanto,
-- dos llamadas. La barrera pasa a la base, que es donde no hay carrera.
--
-- Índice PARCIAL: solo restringe las filas VIVAS. Las terminadas
-- (completed/failed/no_answer/…) no entran, así que se puede volver a llamar al
-- mismo cliente mañana sin chocar con el historial.

CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_calls_una_viva_por_cliente
  ON public.voice_agent_calls (organization_id, voice_agent_id, customer_id)
  WHERE status IN ('pending', 'queued', 'in_progress');

COMMENT ON INDEX public.voice_agent_calls_una_viva_por_cliente IS
  'F6/R3-6: una sola llamada viva por (organización, agente, cliente). Hace atómica la deduplicación de dispatchAgentCall, que antes era consulta+insert.';