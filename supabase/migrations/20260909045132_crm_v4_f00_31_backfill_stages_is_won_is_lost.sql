-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_31_backfill_stages_is_won_is_lost`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 d1529615bac7f439708562b834dc5ead). No reformatear.
-- F0 r4 · Tarea 2b: backfill de stages.is_won/is_lost en TODAS las orgs.
--
-- Heurística: SOLO por nombre normalizado (minúsculas + sin tildes + trim).
-- La probabilidad NO se usa como criterio, y los datos reales explican por qué:
--   * de las 13 etapas con probability=0, solo 7 son etapas de pérdida por
--     nombre; entre las otras 6 están "Contacto Inicial" y "Reunión Agendada"
--     de la org 2 (intermedias) y —sobre todo— la etapa "Ganado" de la org 2
--     (pipeline 4462350e), que tiene probability=0. Usar prob=0 => is_lost
--     marcaría como perdedora la etapa de cierre GANADO.
--   * de las 10 etapas con probability=100, dos no se llaman "Ganado"
--     ("Business Review 30d" org 134, "Contrato/pago" org 135) y ya tenían
--     is_won=true puesto a mano: por eso el backfill NUNCA borra un flag
--     existente, solo rellena los que están a false.
-- Etapas ambiguas (sin coincidencia de nombre) se dejan intactas a propósito.
--
-- Idempotente: al segundo pase las filas ya tienen el flag y el WHERE no las
-- selecciona. No se borra ni se pone a false ningún flag.

-- Etapas de cierre GANADO
UPDATE stages s
   SET is_won = true
 WHERE COALESCE(s.is_won,  false) = false
   AND COALESCE(s.is_lost, false) = false
   AND btrim(lower(translate(s.name,
        'áéíóúÁÉÍÓÚàèìòùäëïöüÄËÏÖÜñÑ','aeiouAEIOUaeiouaeiouAEIOUnN')))
       ~ '^(ganad[oa]|won|cerrad[oa] ?ganad[oa]|closed[ _-]?won|venta ganada)$';

-- Etapas de cierre PERDIDO
UPDATE stages s
   SET is_lost = true
 WHERE COALESCE(s.is_lost, false) = false
   AND COALESCE(s.is_won,  false) = false
   AND btrim(lower(translate(s.name,
        'áéíóúÁÉÍÓÚàèìòùäëïöüÄËÏÖÜñÑ','aeiouAEIOUaeiouaeiouAEIOUnN')))
       ~ '^(perdid[oa]|lost|cerrad[oa] ?perdid[oa]|closed[ _-]?lost|cancelad[oa]|anulad[oa]|descartad[oa])$';

COMMENT ON COLUMN public.stages.is_won IS
  'Etapa de cierre GANADO. Fuente de verdad del cierre (fn_sync_status_from_stage y opportunityStageService.changeStage). stages.probability es solo forecast, NO decide won/lost.';
COMMENT ON COLUMN public.stages.is_lost IS
  'Etapa de cierre PERDIDO. Fuente de verdad del cierre (fn_sync_status_from_stage y opportunityStageService.changeStage). stages.probability es solo forecast, NO decide won/lost.';