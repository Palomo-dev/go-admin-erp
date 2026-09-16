-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f04_r3_unique_objection_and_tag_relations`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 51b0e2e7c9a5f5fa063cec41dad89827). No reformatear.
-- FASE-04 ronda 3 (tester r2, "Cobertura no probada / riesgos pendientes"):
-- `opportunity_objections` y `call_tag_relations` se escriben con SELECT-then-INSERT,
-- que no es atomico: dos `applyAnalysis`/`applyAutoTags` concurrentes sobre la misma
-- oportunidad/llamada duplicaban filas. Ademas `callAnalysisService.applyAnalysis`
-- usa `upsert(..., { onConflict: 'opportunity_id,objection_id' })`, que sin este
-- indice falla en runtime con 42P10.
-- Ambas tablas estan a 0 filas (verificado antes de aplicar), asi que no hay
-- deduplicacion previa que hacer. Solo indices: no cambia RLS ni columnas.

CREATE UNIQUE INDEX IF NOT EXISTS opportunity_objections_opp_objection_uidx
  ON public.opportunity_objections (opportunity_id, objection_id);

CREATE UNIQUE INDEX IF NOT EXISTS call_tag_relations_call_tag_uidx
  ON public.call_tag_relations (call_id, tag_id);