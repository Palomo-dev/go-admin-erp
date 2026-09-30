# PR #253: Correcciones del agente de voz

## Cambios

### 1. WS_PUBLIC_URL con error claro
- Lee `WS_PUBLIC_URL` (Vercel) con `WS_SERVER_URL` como alias
- Si falta, lanza error claro: nunca cae silenciosamente a localhost
- Archivo: `src/app/api/voice/twiml/ai-agent/route.ts`

### 2. Barrido de llamadas atascadas
- Detecta llamadas en dialing/ringing por más de 10 minutos
- Ejecuta en cada status callback y al iniciar una nueva llamada
- Marca como failed con outcome `stuck_timeout`
- Libera concurrencia fantasma, previene bloqueo de `canDial`
- Archivos: `src/app/api/voice/ai-agent/status/route.ts`, `voiceAgentService.ts`, `stalledCallsSweeper.ts`

### 3. Script SQL de mantenimiento
**Ubicación**: `supabase/scripts/fix_voice_agent_issues.sql`
- Cierra llamadas atascadas actuales (dialing → failed)
- Configura `voice_caller_id = '+18506003708'` donde esté NULL
- Solo para orgs que usan el agente de voz
- **NO ejecutar sin autorización**

---

## SQL para Juan

```sql
BEGIN;

-- Cerrar llamadas atascadas
UPDATE calls
SET status = 'failed', ended_at = COALESCE(updated_at, created_at), updated_at = NOW()
WHERE status = 'dialing' AND created_at < NOW() - INTERVAL '10 minutes' AND ended_at IS NULL;

-- Configurar voice_caller_id
UPDATE comm_settings
SET voice_caller_id = '+18506003708', updated_at = NOW()
WHERE voice_caller_id IS NULL
  AND organization_id IN (
    SELECT DISTINCT organization_id FROM voice_agent_calls
    UNION SELECT DISTINCT organization_id FROM voice_agents
  );

COMMIT;
```

Verificar después: `SELECT COUNT(*) FROM calls WHERE status = 'dialing' AND created_at < NOW() - INTERVAL '10 minutes';` debe ser 0.
