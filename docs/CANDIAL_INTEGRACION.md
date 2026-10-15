# Integración de canDial — Validación previa a marcación

**Autor:** Cloud Agent  
**Fecha:** 2026-09-30  
**Ticket:** GO-validacion-candial  

## 📋 Resumen

Este documento explica cómo integrar la función `canDial` en el agente de voz de GO Admin para cumplir con la Ley 2300 de 2023 de Colombia.

La función `canDial` implementa las validaciones V0-V10 requeridas antes de marcar cualquier llamada:

- **V0**: Condiciones legales previas (política publicada, registro CRC/RNE)
- **V1**: Horario legal (L-V 7-19, Sáb 8-15, nunca domingos ni festivos)
- **V2**: Horario interno del piloto (L-V 8-12 y 14-18, sin sábados)
- **V3**: Lista interna de no llamar (do_not_call)
- **V4**: Registro de Números Excluidos (RNE) de la CRC (mismo día calendario)
- **V5**: Bloqueo del lead al canal humano
- **V5b**: Un solo canal por ventana de 7 días (WhatsApp, email, llamada humana)
- **V6**: Frecuencia (1/día, 3 en 14 días, 7 días después de conversación, 2/mes)
- **V7**: Tope de gasto (US$120 piloto, US$8 diario)
- **V8**: Concurrencia (máx 2 simultáneas, 20s entre marcaciones)
- **V9**: Caller ID válido (604)
- **V10**: Interruptor de emergencia

## 🔧 Archivos creados

1. **`src/lib/services/crm/holidays/colombia2026_2027.ts`**
   - Festivos de Colombia 2026-2027 según Ley 51 de 1983 y Ley 2578 de 2026
   - Función `isHolidayInTz(date, timezone)` para validar

2. **`src/lib/services/crm/dialValidation.ts`**
   - Función principal `canDial(context, supabase, now?)`
   - Implementa las 11 validaciones (V0-V10)
   - Devuelve `{ allowed, code, reason?, next_allowed_at? }`
   - **FAIL-CLOSED**: Si no puede comprobar algo, NO se llama

3. **`src/lib/services/crm/voiceAgentServiceWithDialValidation.ts`**
   - Wrappers que integran canDial sin modificar voiceAgentService.ts
   - `dispatchAgentCallWithValidation` - para despacho manual
   - `validateCampaignCall` - para el cron de campañas
   - `shouldDialCampaignCall` - decisión de marcar/reprogramar/skip
   - `logRejectedAttempt` - registra rechazos para auditoría

4. **`src/lib/services/crm/callRecordingRetention.ts`**
   - `cleanExpiredRecordings` - borra audio >90 días
   - `cleanExpiredTranscripts` - borra transcripciones >180 días
   - `runRetentionCleanup` - ejecuta ambas

5. **`supabase/migrations/20260930000000_voice_agent_dial_validation_v1.sql`**
   - Tabla `holidays_co` con festivos 2026-2027
   - Tabla `internal_test_numbers` para números de prueba
   - Columnas en `voice_agent_call_attempts`: `answered`, `rejection_code`, `rejection_reason`
   - Vista `v_voice_pilot_spend` para seguimiento del gasto
   - Funciones `is_colombian_holiday(date)` y `get_last_dial_attempt(org_id, mode)`
   - Índices para optimizar consultas

6. **`supabase/rollbacks/20260930000000_voice_agent_dial_validation_v1.sql`**
   - Rollback completo de la migración

7. **`src/lib/services/crm/__tests__/dialValidation.test.ts`**
   - Tests exhaustivos (CA-30 a CA-37)
   - Cobertura de horarios legales, festivos, frecuencia, RNE, etc.

## 🚀 Cómo integrar

### Paso 1: Aplicar la migración

**IMPORTANTE: Juan debe revisar y aplicar manualmente**

```bash
# En producción (con servicio de rol)
psql postgresql://... < supabase/migrations/20260930000000_voice_agent_dial_validation_v1.sql
```

La migración crea:
- Tabla de festivos con datos 2026-2027
- Estructura para números de prueba
- Columnas de auditoría
- Vista de gasto
- Índices de rendimiento

### Paso 2: Configurar metadata legal (V0)

⚠️ **IMPORTANTE**: Las fechas y números a continuación son **placeholders**. NO llenarlos hasta que:
- La política de privacidad esté publicada oficialmente
- Twilio confirme el registro ante la CRC del número 8308

En `comm_settings.metadata` de la organización piloto:

```json
{
  "privacy_policy_published_at": "<FECHA_REAL_DE_PUBLICACION>",
  "crc_rne_registered_at": "<FECHA_CONFIRMADA_POR_TWILIO>",
  "crc_8308_number_registered_at": "<FECHA_CONFIRMADA_POR_TWILIO>",
  "internal_test_numbers": ["<NUMERO_DE_PRUEBA_1>", "<NUMERO_DE_PRUEBA_2>"]
}
```

Mientras falte alguna fecha, solo se permite llamar a números de `internal_test_numbers`.

### Paso 3: Cargar consulta del RNE (V4)

⚠️ **Requisito legal (Regla L11, actualizado 2026-09-30)**:
- La **CRC actualiza la lista del RNE a las 2:00 AM** (America/Bogota) cada día
- La consulta debe ser del **MISMO DÍA CALENDARIO** (America/Bogota) **Y DESPUÉS de las 3:00 AM**
- Consultas de la noche anterior **NO son válidas**
- No se puede llamar entre las 0:00 AM y 2:59 AM (ventana de actualización del RNE)

Para cada cliente que se vaya a llamar, agregar en `customers.metadata`:

```json
{
  "rne_status": "no_excluido",
  "rne_checked_at": "<TIMESTAMP_DEL_DIA_ACTUAL_DESPUES_DE_LAS_3AM>",
  "rne_receipt": "<ID_RADICADO_O_REFERENCIA_ARCHIVO_CRC>",
  "rne_batch_id": "<ID_LOTE_OPCIONAL>"
}
```

**Campos obligatorios**:
- `rne_status`: `'no_excluido'` o `'excluido'`
- `rne_checked_at`: Timestamp de la consulta (mismo día >= 3:00 AM)
- `rne_receipt`: **Comprobante** - ID de radicado de la CRC, nombre del archivo CSV de respuesta, o referencia única de la consulta

**Campos opcionales**:
- `rne_batch_id`: ID del lote si se consulta en bloque

**Flujo diario**:
1. **Esperar hasta las 3:00 AM** (hora Colombia) o después
2. Consultar el RNE de la CRC para todos los números del lote
3. Guardar para cada cliente:
   - `rne_checked_at`: timestamp actual (>= 3:00 AM)
   - `rne_receipt`: ID de radicado o nombre del archivo CSV recibido
   - `rne_batch_id`: ID del lote (si aplica)
4. Solo entonces ejecutar el lote de marcación

Si `rne_checked_at` no es del día de hoy, es anterior a las 3:00 AM, **o falta `rne_receipt`**, `canDial` **deniega** la llamada (código: `rne_not_checked_today`, fail-closed).

**Carga masiva del RNE** (para implementación futura):
- La API de la CRC admite hasta **10,000 números por consulta**
- Formato: CSV de máximo **3 MB**
- Se puede automatizar con un cron que corra diariamente a las 3:00 AM
- Guardar el comprobante (ID de radicado o nombre del archivo CSV) en `rne_receipt`

### Paso 4: Integrar en el despacho manual

En las rutas API o botones de "llamar ahora", reemplazar:

```typescript
// ANTES
import { dispatchAgentCall } from '@/lib/services/crm/voiceAgentService';
const result = await dispatchAgentCall(orgId, supabase, input);

// DESPUÉS
import { dispatchAgentCallWithValidation } from '@/lib/services/crm/voiceAgentServiceWithDialValidation';
const result = await dispatchAgentCallWithValidation(orgId, supabase, input);
```

El resultado incluye `validation` con el detalle de qué pasó:

```typescript
if (!result.dialed) {
  console.log(`No se marcó: ${result.reason}`);
  console.log(`Código: ${result.validation?.code}`);
  if (result.validation?.next_allowed_at) {
    console.log(`Próximo intento: ${result.validation.next_allowed_at}`);
  }
}
```

### Paso 5: Integrar en el cron de campañas

En `voiceAgentCron.ts` o `runCampaignQueue`, ANTES de llamar a `dialClaimedCall`:

```typescript
import { shouldDialCampaignCall } from '@/lib/services/crm/voiceAgentServiceWithDialValidation';

// Dentro del loop de llamadas reclamadas (claimed)
for (const vac of claimed) {
  // 1. Validar primero
  const decision = await shouldDialCampaignCall({
    orgId,
    customerId: vac.customer_id!,
    customerPhone: customer.phone!,
    customerTimezone: customer.timezone,
    voiceAgentId: campaign.voice_agent_id,
    campaignId: campaign.id,
    supabase,
  });

  // 2. Actuar según la decisión
  if (!decision.shouldDial) {
    if (decision.action === 'reschedule') {
      // Reprogramar para más tarde
      await supabase
        .from('voice_agent_calls')
        .update({
          status: 'pending',
          claimed_at: null,
          locked_by: null,
          scheduled_at: decision.rescheduleTo?.toISOString() || 
            new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', vac.id);
      
      result.calls_skipped++;
      continue;
    } else if (decision.action === 'skip') {
      // Liberar y marcar como skipped
      await releaseCall(supabase, vac.id, 'skipped', decision.validation.reason || '', decision.validation.code);
      result.calls_skipped++;
      continue;
    }
  }

  // 3. Solo si se permite, llamar a dialClaimedCall
  try {
    const dialed = await dialClaimedCall({ /* ... parámetros ... */ });
    // ... resto del código ...
  } catch (err) {
    // ... manejo de errores ...
  }
}
```

### Paso 6: Programar limpieza de retención

Agregar un cron diario que ejecute:

```typescript
import { runRetentionCleanup } from '@/lib/services/crm/callRecordingRetention';

// Una vez al día (ej: 3:00 AM)
const result = await runRetentionCleanup(supabase);
console.log(`Limpieza: ${result.recordings.deleted} grabaciones, ${result.transcripts.deleted} transcripciones`);
if (result.recordings.errors.length > 0) {
  console.error('Errores en grabaciones:', result.recordings.errors);
}
if (result.transcripts.errors.length > 0) {
  console.error('Errores en transcripciones:', result.transcripts.errors);
}
```

## 📊 Auditoría (CA-37)

Consulta diaria para verificar cumplimiento:

```sql
-- Llamadas fuera de horario
SELECT COUNT(*) as fuera_de_horario
FROM calls c
JOIN voice_agents va ON c.voice_agent_id = va.id
WHERE c.mode = 'ai_agent'
  AND c.started_at >= CURRENT_DATE
  AND (
    EXTRACT(DOW FROM c.started_at AT TIME ZONE 'America/Bogota') = 0  -- Domingo
    OR EXTRACT(HOUR FROM c.started_at AT TIME ZONE 'America/Bogota') NOT BETWEEN 7 AND 18
    OR EXISTS (
      SELECT 1 FROM holidays_co h 
      WHERE h.holiday_date = (c.started_at AT TIME ZONE 'America/Bogota')::DATE
    )
  );

-- Llamadas a números excluidos del RNE
SELECT COUNT(*) as rne_violations
FROM calls c
JOIN customers cu ON c.customer_id = cu.id
WHERE c.mode = 'ai_agent'
  AND c.started_at >= CURRENT_DATE
  AND cu.metadata->>'rne_status' = 'excluido';

-- Llamadas a leads del canal humano
SELECT COUNT(*) as canal_humano_violations
FROM calls c
JOIN opportunities o ON c.opportunity_id = o.id
WHERE c.mode = 'ai_agent'
  AND c.started_at >= CURRENT_DATE
  AND o.tags @> ARRAY['canal_humano'];

-- Clientes con RNE no consultado HOY después de las 3:00 AM (para el próximo lote)
SELECT cu.id, 
       cu.phone, 
       cu.metadata->>'rne_checked_at' as ultima_consulta,
       ((cu.metadata->>'rne_checked_at')::timestamptz AT TIME ZONE 'America/Bogota')::date as fecha_consulta,
       EXTRACT(HOUR FROM (cu.metadata->>'rne_checked_at')::timestamptz AT TIME ZONE 'America/Bogota') as hora_consulta,
       cu.metadata->>'rne_receipt' as comprobante
FROM customers cu
WHERE cu.metadata->>'rne_status' = 'no_excluido'
  AND (
    -- Fecha no es de hoy
    ((cu.metadata->>'rne_checked_at')::timestamptz AT TIME ZONE 'America/Bogota')::date < (now() AT TIME ZONE 'America/Bogota')::date
    -- O fecha es de hoy pero hora < 3:00 AM
    OR (
      ((cu.metadata->>'rne_checked_at')::timestamptz AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
      AND EXTRACT(HOUR FROM (cu.metadata->>'rne_checked_at')::timestamptz AT TIME ZONE 'America/Bogota') < 3
    )
    -- O falta el comprobante
    OR cu.metadata->>'rne_receipt' IS NULL
  );
```

**Criterio de aceptación CA-37**: En todo el piloto, las 3 primeras consultas deben devolver **0**. La cuarta muestra los clientes que requieren consulta RNE antes del próximo lote.

## 🧪 Tests

Ejecutar los tests:

```bash
# Tests específicos de canDial
npm test dialValidation.test.ts

# Tests con diferentes zonas horarias
TZ=UTC npm test dialValidation.test.ts
TZ=America/Bogota npm test dialValidation.test.ts
```

Los tests cubren todos los criterios CA-30 a CA-37:
- CA-30: Horarios legales (L-V, sábado, domingos, festivos, márgenes)
- CA-31: RNE (excluido, sin consulta, mismo día después de 3:00 AM, ventana de actualización)
- CA-32: Bloqueo al canal humano
- CA-32b: Un solo canal por ventana de 7 días
- CA-33: Frecuencia (1/día, 3 en 14 días, 7 días después de conversación)
- CA-34: Topes de gasto y créditos
- CA-35: Barrera legal (V0)
- CA-36: Fail-closed (errores de BD)
- CA-37: Auditoría de cumplimiento

## ⚙️ Configuración por organización

### Horario legal (obligatorio, no configurable)
- L-V: 7:00-19:00
- Sábado: 8:00-15:00
- Nunca domingos ni festivos

### Horario interno del piloto (configurable en `voice_agents.business_hours`)
- L-V: 8:00-12:00 y 14:00-18:00
- Sin sábados

Para cambiar el horario interno:

```typescript
await supabase
  .from('voice_agents')
  .update({
    business_hours: {
      timezone: 'America/Bogota',
      weekday: [
        { start: 8, end: 12 },
        { start: 14, end: 18 },
      ],
      saturday: null,
    },
  })
  .eq('id', agentId);
```

### Topes de gasto

Los topes están hardcodeados en `dialValidation.ts`:
- Tope total: US$120
- Tope diario: US$8
- Alertas: US$80 y US$108

Para cambiar, modificar las constantes en el archivo.

## 🔄 Mantenimiento anual

**Cada noviembre**, agregar los festivos del año siguiente:

```sql
INSERT INTO public.holidays_co (holiday_date, name, year, type) VALUES
  -- Calcular festivos del año siguiente según Ley 51 de 1983
  ('2028-01-01', 'Año Nuevo', 2028, 'fixed'),
  -- ... resto de festivos
ON CONFLICT (holiday_date) DO NOTHING;
```

También actualizar `src/lib/services/crm/holidays/colombia2026_2027.ts` y renombrarlo a `colombia2026_2028.ts`.

## 📝 Notas finales

- Esta implementación es **fail-closed**: ante cualquier duda, NO se llama.
- Todos los rechazos quedan registrados en `voice_agent_call_attempts` con `rejection_code` y `rejection_reason`.
- La función es **idempotente**: se puede llamar múltiples veces sin efectos secundarios.
- Los festivos están verificados contra festivos.com.co y calendariodecolombia.com (27-sep-2026).
- La Ley 2578 de 2026 (Chiquinquirá) tiene una demanda ante la Corte; mientras siga vigente, se respeta.

## 🐛 Troubleshooting

### "No se marca ninguna llamada"

1. Verificar `comm_settings.metadata` tiene las 3 fechas legales (V0)
2. Verificar `comm_settings.voice_agent_enabled = true` (V10)
3. Verificar campaña `status = 'running'` y `emergency_stop = false` (V10)
4. Verificar `voice_agents.is_active = true` (V10)
5. Revisar logs de `voice_agent_call_attempts` para ver códigos de rechazo

### "Rechaza llamadas en horario válido"

1. Verificar zona horaria en `customers.timezone` (debe ser `America/Bogota`)
2. Verificar que no sea festivo: `SELECT * FROM holidays_co WHERE holiday_date = '2026-XX-XX';`
3. Verificar horario interno en `voice_agents.business_hours`

### "Rechaza por RNE_NOT_CHECKED_TODAY"

1. Cargar consulta del RNE en `customers.metadata`:
   ```json
   {
     "rne_status": "no_excluido",
     "rne_checked_at": "<TIMESTAMP_DEL_DIA_ACTUAL_DESPUES_DE_LAS_3AM>",
     "rne_receipt": "<ID_RADICADO_O_ARCHIVO_CSV>",
     "rne_batch_id": "<ID_LOTE>"
   }
   ```
2. La consulta debe ser del **mismo día calendario** (America/Bogota) **Y después de las 3:00 AM**
3. **Debe existir el comprobante** (`rne_receipt`): ID de radicado o referencia al archivo de respuesta
4. La CRC actualiza el RNE a las 2:00 AM; consultar después de las 3:00 AM
5. Consultas de la noche anterior (antes de medianoche) NO son válidas

### "Rechaza por FREQUENCY_LIMIT"

Es correcto. Revisar las reglas de frecuencia (V6):
- Máximo 1 intento al día
- Máximo 3 intentos sin respuesta en 14 días
- 7 días después de conversación contestada
- Máximo 2 contactos al mes

Si la regla no aplica, verificar datos en `voice_agent_call_attempts` y `calls`.
