# PR #253: Correcciones del agente de voz

## Contexto

Este PR corrige 2 problemas críticos del agente de voz y agrega un script SQL de mantenimiento:

1. **WS_PUBLIC_URL no reconocida**: El código leía solo `WS_SERVER_URL`, pero en Vercel está `WS_PUBLIC_URL`
2. **Llamadas atascadas en 'dialing'**: Hay 5 llamadas en producción que nunca se cerraron

**NOTA**: Las correcciones de `book_meeting` (D-04) y AMD/contestadores (D-07) ya están en `main` (commit 8ad9d7fc), con otra implementación más completa que incluye Ley 2300, RNE y política de datos.

---

## Cambios implementados

### 1. WS_PUBLIC_URL con error claro ✅

**Problema**: Si faltaba `WS_SERVER_URL`, el código caía silenciosamente a `wss://localhost:8080` en producción.

**Solución**:
- Lee primero `WS_PUBLIC_URL` (nombre correcto en Vercel)
- Acepta `WS_SERVER_URL` como alias por compatibilidad
- Si falta, lanza error claro y registra en logs
- Nunca cae silenciosamente a localhost

**Archivo**: `src/app/api/voice/twiml/ai-agent/route.ts`

```typescript
const wsHost = process.env.WS_PUBLIC_URL || process.env.WS_SERVER_URL;
if (!wsHost) {
  console.error('[AI Agent TwiML] WS_PUBLIC_URL/WS_SERVER_URL no configurado');
  throw new Error('WS_PUBLIC_URL no configurado');
}
```

---

### 2. Timeout para llamadas atascadas ✅

**Problema**: 5 llamadas en 'dialing' desde septiembre nunca se cerraron (D-17).

**Solución**:
- Detecta llamadas en 'dialing' o 'ringing' por más de 5 minutos
- Cuando llega un status terminal de Twilio, fuerza el cierre
- Registra en logs las llamadas atascadas detectadas

**Archivo**: `src/app/api/voice/ai-agent/status/route.ts`

```typescript
const DIALING_TIMEOUT_MS = 5 * 60 * 1000;
const isStalled = 
  (vac.status === 'dialing' || vac.status === 'ringing') &&
  vac.started_at &&
  Date.now() - new Date(vac.started_at).getTime() > DIALING_TIMEOUT_MS;
```

---

### 3. Script SQL de mantenimiento ✅

**Ubicación**: `supabase/scripts/fix_voice_agent_issues.sql`

**Qué hace**:
1. Cierra las 5 llamadas atascadas en 'dialing' (status → 'failed')
2. Configura `voice_caller_id = '+18506003708'` en `comm_settings` donde esté NULL, **solo** para organizaciones que:
   - Han usado el agente de voz (tienen filas en `voice_agent_calls`), O
   - Tienen agentes configurados (tienen filas en `voice_agents`)

**IMPORTANTE**:
- Es idempotente (se puede ejecutar múltiples veces sin duplicar)
- Usa transacción (BEGIN/COMMIT)
- Incluye verificación de resultados con RAISE NOTICE
- NO se ejecuta automáticamente
- Requiere autorización explícita de Juan

---

## Cómo probar

### 1. WS_PUBLIC_URL
```bash
# Verificar que la variable existe en Vercel
# Hacer una llamada de prueba (CON AUTORIZACIÓN, solo a números internos)
# Revisar logs: debe conectar al ws-server de Railway
# Si falta la variable, debe fallar con error claro
```

### 2. Llamadas atascadas
```sql
-- Antes de aplicar el script:
SELECT id, status, created_at, started_at, ended_at 
FROM calls 
WHERE status = 'dialing' 
  AND created_at < NOW() - INTERVAL '10 minutes';

-- Debe mostrar 5 filas de sep 12-17

-- Después de ejecutar el script:
-- Debe mostrar 0 filas
```

### 3. voice_caller_id
```sql
-- Verificar qué orgs se actualizarían (DRY RUN):
SELECT cs.organization_id, cs.voice_caller_id
FROM comm_settings cs
WHERE cs.voice_caller_id IS NULL
  AND cs.organization_id IN (
    SELECT DISTINCT organization_id FROM voice_agent_calls
    UNION
    SELECT DISTINCT organization_id FROM voice_agents
  );

-- Después de ejecutar el script:
-- Debe mostrar voice_caller_id = '+18506003708'
```

---

## Pasos para Juan

### 1. Verificar variables en Vercel
- ✅ `WS_PUBLIC_URL` apunta a Railway: `wss://...`
- ✅ `WS_SERVER_URL` (opcional) como alias

### 2. Ejecutar el script SQL
```bash
# En el dashboard de Supabase, ejecutar:
cat supabase/scripts/fix_voice_agent_issues.sql

# Revisar el RAISE NOTICE:
# - Llamadas cerradas: 5
# - Configuraciones actualizadas: X (depende de cuántas orgs usan el agente)
```

### 3. Verificar que no hay llamadas atascadas
```sql
SELECT COUNT(*) 
FROM calls 
WHERE status = 'dialing' 
  AND created_at < NOW() - INTERVAL '10 minutes';
-- Debe ser 0
```

### 4. Primera llamada de prueba
- **Con autorización explícita**
- **Desde número autorizado**
- **Solo a número de prueba interno**
- Verificar en logs: conexión WebSocket exitosa
- Verificar: no queda en 'dialing'

---

## Notas

- ✅ NO toca variables reales de Vercel/Railway
- ✅ NO ejecuta migraciones automáticas
- ✅ NO modifica lógica de book_meeting ni AMD (ya están en main)
- ✅ Script SQL es idempotente y manual
- ✅ Retrocompatible
- ⚠️ Este PR es más pequeño que el original: solo WebSocket y llamadas atascadas
- ⚠️ Las funcionalidades de book_meeting y AMD vienen de commit 8ad9d7fc en master

---

## Diff resumido

```
Archivos modificados:
- src/app/api/voice/twiml/ai-agent/route.ts (WS_PUBLIC_URL + error claro)
- src/app/api/voice/ai-agent/status/route.ts (timeout para dialing)

Archivos nuevos:
- supabase/scripts/fix_voice_agent_issues.sql (script de mantenimiento)
- docs/voz/PR_253_ALCANCE.md (esta documentación)
```

Total: ~40 líneas de código + script SQL + docs
