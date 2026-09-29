# GO-voz: Validación previa canDial — Ley 2300 de 2023

## 📋 Resumen

Implementación de la función `canDial` para validar ANTES de cada marcación del agente de voz, cumpliendo con la **Ley 2300 de 2023** de Colombia ("Ley Dejen de Fregar") y las políticas internas del piloto.

**Estado de integración**: ⚠️ `canDial` está implementado pero **NO está conectado** al flujo de despacho real (`voiceAgentService.ts` no fue modificado). Se crearon wrappers independientes en `voiceAgentServiceWithDialValidation.ts` para evitar conflictos con trabajo paralelo.

---

## ✅ Validaciones implementadas (V0-V10 + V5b)

### V0: Portal Legal (Barrera de entrada)
- Verifica `comm_settings.metadata`:
  - `privacy_policy_published_at`: Política de privacidad publicada
  - `crc_rne_registered_at`: Registro ante CRC del RNE
  - `crc_8308_number_registered_at`: Número 8308 registrado ante CRC
- Si falta alguna, solo permite `internal_test_numbers`

### V1: Horario Legal (Ley 2300 + Ley Emiliani + Ley 2578/2026)
- **Lunes a Viernes**: 07:00-19:00
- **Sábado**: 08:00-15:00  
- **Domingos**: Bloqueados
- **Festivos**: 19 festivos colombianos 2026-2027 (incluye Día de Chiquinquirá)
- **Margen pre-cierre**: 15 minutos (la llamada debe poder terminar antes del cierre)
- **Timezone**: America/Bogota (UTC-5)

### V2: Horario Interno del Piloto
- **Lunes a Viernes**: 08:00-12:00 y 14:00-18:00
- **Sábados**: Bloqueados para el agente IA
- **Margen pre-cierre**: 15 minutos (11:55 y 17:55)
- Configurable en `voice_agent_campaigns.business_hours`

### V3: Lista Interna de No Llamar
- Consulta RPC `fn_can_contact`:
  - `customers.do_not_call`
  - `contact_consents` (opt-outs)
  - Bloqueos manuales

### V4: Registro de Números Excluidos (RNE) de la CRC
⚠️ **Regla estricta**: La consulta del RNE debe ser del **MISMO DÍA CALENDARIO** (en America/Bogota).

- Requiere `customers.metadata.rne_status = 'no_excluido'`
- Requiere `customers.metadata.rne_checked_at` del día actual
- Si no es del mismo día: **DENIEGA** (fail-closed)

### V5: Bloqueo al Canal Humano
- Si `opportunities.tags` contiene `'canal_humano'` (vigente 30 días): bloquea al agente IA
- Solo aplica a despachos con `voiceAgentId`

### V5b: Un Solo Canal por Ventana de 7 Días ⭐ NUEVO
Si el cliente fue contactado en los últimos 7 días por:
- **Llamada humana** (`activities.activity_type = 'call'`)
- **WhatsApp** (`activities.activity_type = 'whatsapp'`)
- **Email** (`activities.activity_type = 'email'`)
- **Mensajería** (`messages.direction = 'outbound'`)

→ El agente de voz **NO puede llamar** (código `CHANNEL_WINDOW`)

**Fail-closed**: Si no puede verificar las tablas de actividad, deniega.

### V6: Frecuencia
- **Máximo 1 intento al día** por titular (cuenta todos los números)
- **Máximo 3 intentos sin respuesta** en 14 días
- **Mínimo 7 días** después de una conversación (>30s)
- **Máximo 2 contactos exitosos al mes**

### V7: Topes de Gasto
- **Piloto total**: US$120
- **Límite diario**: US$8
- **Alertas**: US$80 y US$108
- Vista `v_voice_pilot_spend` para monitoreo

### V8: Concurrencia y Ritmo
- **Máximo 2 llamadas simultáneas**
- **Mínimo 20 segundos entre marcaciones**

### V9: Caller ID
- Requiere número 604 válido en `comm_settings.voice_caller_id`

### V10: Interruptor de Emergencia
- `comm_settings.voice_agent_enabled = true`
- `voice_agent_campaigns.status = 'running'`
- `voice_agents.is_active = true`

---

## 🔧 Archivos creados/modificados

### Nuevos
1. `src/lib/services/crm/holidays/colombia2026_2027.ts` — Festivos colombianos 2026-2027
2. `src/lib/services/crm/dialValidation.ts` — Función `canDial` y validaciones V0-V10 + V5b
3. `src/lib/services/crm/voiceAgentServiceWithDialValidation.ts` — Wrappers para integrar sin modificar el servicio original
4. `src/lib/services/crm/__tests__/dialValidation.test.ts` — Tests exhaustivos (CA-30 a CA-37)
5. `supabase/migrations/20260930000000_voice_agent_dial_validation_v1.sql` — Schema
6. `supabase/rollbacks/20260930000000_voice_agent_dial_validation_v1.sql` — Rollback limpio
7. `docs/CANDIAL_INTEGRACION.md` — Manual completo de integración

### Extendidos
- `src/lib/services/crm/callRecordingRetention.ts` — Agregada limpieza de transcripciones (180 días)

---

## 🧪 Testing

```bash
# Tests unitarios
npm test dialValidation.test.ts

# Tests con diferentes timezones
TZ=UTC npm test dialValidation.test.ts
TZ=America/Bogota npm test dialValidation.test.ts
```

**Cobertura**:
- ✅ CA-30: Horarios legales (bordes, festivos, sábado, domingos, márgenes)
- ✅ CA-31: RNE (excluido, sin consulta, no es del mismo día)
- ✅ CA-32: Bloqueo al canal humano
- ✅ CA-32b: Un solo canal por ventana de 7 días (WhatsApp, email, llamadas)
- ✅ CA-33: Frecuencia (1/día, 3/14días, 7 días post-conversación, 2/mes)
- ✅ CA-34: Topes de gasto y créditos
- ✅ CA-35: Barrera legal (V0)
- ✅ CA-36: Fail-closed (errores de BD)
- ✅ CA-37: Auditoría y reportes

---

## 📋 Pasos manuales pendientes para Juan

### 1. Aplicar migración SQL

⚠️ **Juan debe aplicar la migración** (no aplicar directamente contra producción sin probar en staging):

```bash
# En staging/desarrollo PRIMERO
# Juan aplica la migración usando el proceso estándar del proyecto
```

**Crea**:
- Tabla `holidays_co` (festivos 2026-2027)
- Tabla `internal_test_numbers`
- Columnas en `voice_agent_call_attempts`: `answered`, `rejection_code`, `rejection_reason`
- Vista `v_voice_pilot_spend`
- Funciones: `is_colombian_holiday()`, `get_last_dial_attempt()`

### 2. Configurar metadata legal (V0)

⚠️ **IMPORTANTE**: Los valores a continuación son **placeholders**. NO llenarlos hasta que:
- La política de privacidad esté publicada oficialmente
- Twilio confirme el registro ante la CRC

En `comm_settings.metadata` de la organización piloto:

```json
{
  "privacy_policy_published_at": "<FECHA_REAL_DE_PUBLICACION>",
  "crc_rne_registered_at": "<FECHA_CONFIRMADA_POR_TWILIO>",
  "crc_8308_number_registered_at": "<FECHA_CONFIRMADA_POR_TWILIO>",
  "internal_test_numbers": ["<NUMERO_DE_PRUEBA_1>", "<NUMERO_DE_PRUEBA_2>"]
}
```

Mientras falten estas fechas, solo se permite llamar a números de `internal_test_numbers`.

### 3. Proceso diario de RNE

⚠️ **Requisito legal crítico**: El RNE debe consultarse el **mismo día calendario** del lote.

**Flujo**:
1. Antes de cada lote, consultar el RNE de la CRC para todos los números
2. Actualizar `customers.metadata.rne_checked_at` al timestamp actual
3. Solo entonces ejecutar el lote de marcación

```json
{
  "rne_status": "no_excluido",
  "rne_checked_at": "<TIMESTAMP_DEL_DIA_ACTUAL>"
}
```

### 4. Monitoreo diario

```sql
-- Consultas del RNE que NO son de hoy (bloquean marcación)
SELECT cu.id, cu.phone, cu.metadata->>'rne_checked_at' as ultima_consulta
FROM customers cu
WHERE cu.metadata->>'rne_status' = 'no_excluido'
  AND (cu.metadata->>'rne_checked_at')::date < CURRENT_DATE AT TIME ZONE 'America/Bogota';

-- Gasto acumulado del piloto
SELECT * FROM v_voice_pilot_spend;

-- Rechazos por código
SELECT rejection_code, COUNT(*) 
FROM voice_agent_call_attempts 
WHERE rejection_code IS NOT NULL 
GROUP BY rejection_code;
```

---

## 🔌 Integración futura

### ⚠️ Estado actual: NO conectado

`canDial` está implementado pero **NO está integrado** en el flujo de despacho real. Se crearon wrappers en `voiceAgentServiceWithDialValidation.ts` que NO modifican `voiceAgentService.ts` para evitar conflictos con:
- Trabajo de otro agente en `book_meeting` y `AnsweredBy`
- Commits recientes de Juan en `main`

### ✅ Checklist de integración

- [ ] **Esperar merge del PR de book_meeting/AnsweredBy**
- [ ] **Conectar `dispatchAgentCallWithValidation` en el dispatcher de campañas**
  - En `src/lib/services/crm/voiceAgentService.ts` (o en el módulo que dispara las llamadas de campaña)
  - Reemplazar llamadas directas a `dispatchAgentCall` con `dispatchAgentCallWithValidation`
- [ ] **Validar en staging con números de prueba**
- [ ] **Activar en producción gradualmente** (primero con `internal_test_numbers`)

---

## 🎯 Criterios de Aceptación

- ✅ **CA-30**: Horario legal L-V 7-19, Sáb 8-15, nunca domingos ni festivos
- ✅ **CA-31**: RNE del mismo día calendario (America/Bogota)
- ✅ **CA-32**: Bloqueo al canal humano
- ✅ **CA-32b**: Un solo canal por ventana de 7 días
- ✅ **CA-33**: Frecuencia (1/día, 3/14días, 7 días post-conversación, 2/mes)
- ✅ **CA-34**: Topes de gasto (US$120 total, US$8 diario)
- ✅ **CA-35**: Portal legal (V0)
- ✅ **CA-36**: Fail-closed (deniega si no puede verificar)
- ✅ **CA-37**: Auditoría completa

---

## 📚 Documentación

Ver `docs/CANDIAL_INTEGRACION.md` para:
- Arquitectura detallada de cada validación
- Guía paso a paso de integración
- Troubleshooting y casos comunes
- Queries de monitoreo y auditoría

---

## ⚠️ Notas importantes

1. **NO aplicar migración directamente en producción** sin probar en staging
2. **NO llenar fechas de metadata legal** hasta que estén oficialmente publicadas/confirmadas
3. **Consulta diaria del RNE** es obligatoria (mismo día calendario)
4. **Fail-closed**: Si algo no se puede verificar, SE DENIEGA la llamada
5. **canDial NO está conectado todavía** — requiere paso manual de integración post-merge
6. **Retención**: Audio 90 días, transcripciones 180 días
7. **Timezone siempre America/Bogota** para cálculos de horarios

---

**Revisores**: @santycano @Palomo-dev  
**Base**: `main`  
**Target**: `main`
