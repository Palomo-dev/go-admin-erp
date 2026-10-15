-- =====================================================================================
-- Rollback: Agentes de voz de prospección (variantes A y B)
-- Fecha: 2026-09-29
-- =====================================================================================
--
-- Este rollback revierte la migración 20260929220858_agente_voz_prospeccion.sql
--
-- IMPORTANTE: Solo aplica si se ejecutó la migración y se necesita revertir.
-- NO afecta al agente de Pedro (encuesta de satisfacción).
-- =====================================================================================

-- ─── Eliminar agentes de prospección ────────────────────────────────────────────

-- Eliminar agente de prospección para leads nuevos
DELETE FROM voice_agents
WHERE organization_id = 125
  AND slug = 'pedro-prospeccion-leads';

-- Eliminar agente de prospección para clientes existentes
DELETE FROM voice_agents
WHERE organization_id = 125
  AND slug = 'pedro-prospeccion-clientes';

-- ─── Revertir configuración de concurrencia (opcional) ──────────────────────────

-- Solo si se quiere revertir a la concurrencia anterior (5)
-- NOTA: Verificar con Juan si se debe revertir o mantener en 2
-- 
-- UPDATE comm_settings
-- SET 
--   voice_max_concurrent_calls = 5,
--   updated_at = now()
-- WHERE organization_id = 125;

-- ─── Verificación ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  agent_count int;
  pedro_exists boolean;
BEGIN
  -- Contar agentes de prospección que deberían haberse eliminado
  SELECT COUNT(*) INTO agent_count
  FROM voice_agents
  WHERE organization_id = 125
    AND slug IN ('pedro-prospeccion-leads', 'pedro-prospeccion-clientes');
  
  -- Verificar que Pedro (encuesta) sigue existiendo
  SELECT EXISTS (
    SELECT 1 FROM voice_agents 
    WHERE id = 'c194ab52-8089-422d-b625-1b56f47ba146'
      AND organization_id = 125
      AND name = 'Pedro, asistente comercial'
  ) INTO pedro_exists;
  
  IF agent_count > 0 THEN
    RAISE WARNING 'Rollback incompleto: % agente(s) de prospección aún existen', agent_count;
  ELSE
    RAISE NOTICE '✓ Rollback completado: agentes de prospección eliminados';
  END IF;
  
  IF NOT pedro_exists THEN
    RAISE EXCEPTION 'ERROR CRÍTICO: El agente de Pedro (encuesta) fue eliminado. Restaurar desde backup inmediatamente.';
  ELSE
    RAISE NOTICE '✓ Agente de Pedro (encuesta) preservado correctamente';
  END IF;
END $$;
