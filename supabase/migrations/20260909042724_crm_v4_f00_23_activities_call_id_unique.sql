-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_23_activities_call_id_unique`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 944b9aecfe108ff63876b1bfe67c530a). No reformatear.
-- P14 (F3): una sola actividad por llamada. `callActivitySync` depende de esa
-- unicidad para no duplicar la actividad de la llamada.
-- Verificado antes de crearlo:
--   SELECT count(*), count(DISTINCT call_id) FROM activities WHERE call_id IS NOT NULL;  -> 0, 0
-- Sin duplicados, así que el índice UNIQUE se puede crear sin riesgo.

CREATE UNIQUE INDEX IF NOT EXISTS activities_call_id_uidx
  ON public.activities (call_id)
  WHERE call_id IS NOT NULL;

COMMENT ON INDEX public.activities_call_id_uidx IS
  'Una sola activity por call (callActivitySync). Sustituye a activities_call_id_idx, que era el mismo índice sin UNIQUE.';

-- El índice no único queda cubierto por el UNIQUE (mismas columnas y predicado):
-- se elimina para no duplicar escrituras ni disparar el advisor duplicate_index.
DROP INDEX IF EXISTS public.activities_call_id_idx;
