# Prompts del Agente de Voz: Versionado y Prospección

**Fecha**: 2026-09-29  
**Contexto**: Especificación del agente de voz v1 + guiones de apertura v1  
**Estado**: Implementado, NO aplicado en producción

## Resumen

Implementación del sistema de prompts versionados para el agente de voz de GO Admin, con tres variantes:

1. **Encuesta de satisfacción (Pedro actual)**: Conservado sin cambios como referencia
2. **Prospección de leads nuevos (variante A)**: Para prospectos que nunca han usado GO Admin
3. **Prospección de clientes existentes (variante B)**: Para seguimiento, renovación y activación

## Estructura creada

```
src/lib/services/crm/voiceAgent/prompts/
├── templates.ts              # Plantillas de prompts y utilidades
├── index.ts                  # Exportaciones públicas
├── README.md                 # Documentación del módulo
└── __tests__/
    └── templates.test.ts     # Tests unitarios
```

## Características principales

### 1. Versionado de prompts

Los prompts ahora están versionados en el código fuente, no solo en la base de datos. Esto permite:

- Trazabilidad de cambios mediante git
- Revisión de código antes de desplegar
- Facilidad para revertir cambios
- Documentación clara de las variantes

### 2. Bloque común reutilizable

Las dos variantes de prospección comparten un bloque común con:

- Reglas que nunca rompe el agente
- Textos de autorización (Ley 1581)
- Precios en formato estándar (US$ 30)
- Preguntas de cumplimiento
- Cierre con reunión
- Lista de herramientas permitidas

### 3. Variante A: Leads nuevos

**Objetivo**: Calificar en 2-3 preguntas y agendar reunión de 30 minutos por Meet.

**Proceso**:
1. Apertura con aviso de IA y grabación
2. Calificación (sistema actual, cantidad de locales, necesidad de hardware)
3. Propuesta de valor (caja, inventario y cuentas integrados)
4. Oferta de horarios (check_availability)
5. Autorización de datos
6. Confirmación de reunión

**Nota**: No se menciona facturación electrónica; el asesor confirma el alcance en la cita.

**Objeciones manejadas**:
- "No tengo tiempo"
- "Ya tengo un sistema"
- "Mándame información por WhatsApp"
- "¿Cuánto cuesta?"
- "No me interesa"

### 4. Variante B: Clientes existentes

**Objetivo**: Ayudar al cliente según el motivo y agendar si es necesario.

**Motivos de llamada**:

1. **seguimiento_propuesta**: Propuesta enviada hace 3+ días sin respuesta
   - Variables: plan_propuesto, fecha_propuesta, vendedor

2. **renovacion**: Suscripción que vence en 7-30 días
   - Variables: plan_actual, fecha_vencimiento

3. **activacion**: Prueba de 15 días con poco uso o que vence pronto
   - Variables: dias_restantes, modulo_sin_usar

**Reglas especiales**:
- No vende planes nuevos por teléfono
- No habla de facturas ni cobros
- Baja solo para llamadas comerciales (scope="marketing_voice")

### 5. Utilidades incluidas

```typescript
// Rellenar variables en plantillas
fillPromptVariables(template, variables)

// Generar frase de origen del dato
getOrigenDatoFrase(source)

// Validar variables requeridas
validatePromptVariables(variables, required)
```

## Reglas de estilo cumplidas

Según especificación R-02:

- ✅ Español de Colombia (es-CO)
- ✅ Tuteo (nunca "usted")
- ✅ "GO Admin" sin guion
- ✅ Sin signos de exclamación iniciales ("¡")
- ✅ Precios en COP: "$99.000", "$189.000", "$990.000" mensuales
- ✅ Prueba gratis: Pro 15 días, Business/Ultimate 30 días, sin tarjeta
- ✅ Sin promesas de facturación electrónica
- ✅ Frases cortas y verbos simples
- ✅ Tono amable y tranquilo

## Textos legales incluidos

Según `guiones_apertura_v1.md`:

- **AVISO_GRABACION_POLLY**: Para llamadas humanas (NO usar con el agente IA)
- **AVISO_AGENTE_IA_CON_GRABACION**: Para el welcomeGreeting del agente
- **RESPUESTAS_GRABACION**: Según decisión del usuario sobre grabar
- **RESPUESTA_ERES_ROBOT**: Cuando preguntan si es un robot

## Migración SQL creada (NO aplicada)

Archivo: `supabase/migrations/20260929220858_agente_voz_prospeccion.sql`

**Qué hace**:
1. Verifica que el agente de Pedro (encuesta) existe y NO lo modifica
2. Crea dos agentes nuevos de prospección (leads y clientes)
3. Configura concurrencia máxima de 2 llamadas simultáneas
4. Los crea en estado `is_active = false` para activación manual

**Qué NO hace**:
- NO modifica el agente actual de Pedro (id: c194ab52-8089-422d-b625-1b56f47ba146)
- NO activa los agentes automáticamente
- NO cambia ninguna configuración de campaña existente

**Rollback**: `supabase/rollbacks/20260929220858_agente_voz_prospeccion_rollback.sql`

## Herramientas permitidas (según CA-29)

```typescript
[
  'get_customer_context',
  'check_availability',      // Nueva: consulta disponibilidad en Google Calendar
  'book_meeting',            // Corregida: crea evento con Meet e invita al prospecto
  'update_opportunity',      // Nueva: mueve a "Reunión Agendada" y asigna vendedor
  'log_call_activity',       // Nueva: registra resultado de la llamada
  'mark_do_not_call',        // Renombrada: baja en todos los canales
  'request_callback',        // Renombrada: programa rellamada o crea tarea para humano
  'end_call'
]
```

**Apagadas en el piloto**:
- `send_payment_link`
- `transfer_to_human`
- `update_opportunity_field` (libre)
- `move_opportunity_stage` (libre)

## Próximos pasos

1. **Juan revisa y aprueba este PR**
2. Implementar las herramientas faltantes:
   - `check_availability` con Google FreeBusy
   - `book_meeting` corregido con Google Meet
   - `update_opportunity` con reparto de vendedores
   - `log_call_activity` unificado
3. Aplicar la migración SQL en producción
4. Activar manualmente los agentes cuando estén listos:
   ```sql
   UPDATE voice_agents 
   SET is_active = true 
   WHERE slug IN ('pedro-prospeccion-leads', 'pedro-prospeccion-clientes');
   ```

## Referencias

- Especificación: `/workspace/uploads/especificacion_agente_goadmin_v1_54a0.md`
- Guiones legales: `/workspace/uploads/guiones_apertura_v1_efc0.md`
- Diagnóstico: `/workspace/uploads/agente_voz_diagnostico_af40.md`
- Código: `src/lib/services/crm/voiceAgent/prompts/`

## Notas de seguridad

- El repositorio es público: ningún texto contiene nombres de clientes
- Los textos legales están listos para copiar tal cual
- La grabación solo empieza con "sí" explícito (el silencio NO cuenta)
- El agente se identifica como IA en los primeros 15 segundos
- "No me llamen" activa baja inmediata en todos los canales
