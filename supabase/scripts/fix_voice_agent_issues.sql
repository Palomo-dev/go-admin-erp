-- Script SQL para corrección de problemas del agente de voz
-- 
-- PR #253: fix(voz) Correcciones del agente de voz (WS_PUBLIC_URL, llamadas atascadas)
-- Ubicación: supabase/scripts/fix_voice_agent_issues.sql
-- 
-- Este script es IDEMPOTENTE y debe ejecutarlo Juan manualmente en producción.
-- NO lo ejecutes sin autorización explícita de Juan.
--
-- Cambios:
-- 1. Cierra llamadas atascadas en 'dialing' por más de 10 minutos
-- 2. Configura voice_caller_id donde esté vacío (solo orgs que usan el agente)

BEGIN;

-- Parte 1: Cerrar llamadas atascadas en 'dialing'
-- Estas son las 5 llamadas del diagnóstico D-17 que nunca recibieron
-- el status callback de Twilio.
UPDATE calls
SET 
  status = 'failed',
  ended_at = COALESCE(updated_at, created_at),
  updated_at = NOW()
WHERE 
  status = 'dialing'
  AND created_at < NOW() - INTERVAL '10 minutes'
  AND ended_at IS NULL;

-- Parte 2: Configurar voice_caller_id en comm_settings
-- Solo para organizaciones que tienen el agente de voz configurado
-- (tienen filas en voice_agent_calls o voice_agents)
UPDATE comm_settings
SET 
  voice_caller_id = '+18506003708',
  updated_at = NOW()
WHERE 
  voice_caller_id IS NULL
  AND organization_id IN (
    -- Organizaciones que han usado el agente de voz
    SELECT DISTINCT organization_id 
    FROM voice_agent_calls
    UNION
    -- Organizaciones que tienen agentes configurados
    SELECT DISTINCT organization_id
    FROM voice_agents
  );

-- Verificar resultados
DO $$ 
DECLARE
  calls_fixed INTEGER;
  settings_fixed INTEGER;
BEGIN
  SELECT COUNT(*) INTO calls_fixed
  FROM calls
  WHERE status = 'failed'
    AND updated_at > NOW() - INTERVAL '1 minute'
    AND created_at < NOW() - INTERVAL '10 minutes';
    
  SELECT COUNT(*) INTO settings_fixed
  FROM comm_settings
  WHERE voice_caller_id = '+18506003708'
    AND updated_at > NOW() - INTERVAL '1 minute';
    
  RAISE NOTICE 'Llamadas cerradas: %', calls_fixed;
  RAISE NOTICE 'Configuraciones actualizadas: %', settings_fixed;
END $$;

COMMIT;

-- Verificación post-ejecución (ejecutar manualmente después del COMMIT):
-- SELECT COUNT(*) FROM calls WHERE status = 'dialing' AND created_at < NOW() - INTERVAL '10 minutes';
-- SELECT organization_id, voice_caller_id FROM comm_settings WHERE organization_id IN (SELECT DISTINCT organization_id FROM voice_agent_calls) ORDER BY organization_id;
