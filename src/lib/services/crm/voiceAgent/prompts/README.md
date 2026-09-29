# Voice Agent Prompt Templates

Plantillas de prompts versionadas para los agentes de voz de GO Admin.

## Propósito

Este módulo centraliza y versiona los prompts del sistema para distintos tipos de llamadas:

- **Encuesta de satisfacción**: Prompt actual de "Pedro" (org 125) para clientes actuales
- **Prospección de leads nuevos** (variante A): Para llamadas a prospectos que nunca han usado GO Admin
- **Prospección de clientes existentes** (variante B): Para seguimiento de propuestas, renovaciones y activación

## Estructura

```
src/lib/services/crm/voiceAgent/prompts/
├── templates.ts      # Plantillas de prompts y utilidades
├── index.ts          # Exportaciones públicas del módulo
└── README.md         # Esta documentación
```

## Uso

### Ejemplo básico

```typescript
import {
  PROMPT_PROSPECCION_LEADS_NUEVOS,
  FIRST_MESSAGE_PROSPECCION_LEADS_NUEVOS,
  fillPromptVariables,
  getOrigenDatoFrase
} from '@/lib/services/crm/voiceAgent/prompts';

// Preparar variables
const variables = {
  negocio: 'Tienda de Calzado La Elegancia',
  ciudad: 'Bogotá',
  sector: 'retail',
  whatsapp_goadmin: '311 319 5711',
  origen_dato_frase: getOrigenDatoFrase('business_public_listing')
};

// Llenar el prompt
const systemPrompt = fillPromptVariables(PROMPT_PROSPECCION_LEADS_NUEVOS, variables);
const firstMessage = fillPromptVariables(FIRST_MESSAGE_PROSPECCION_LEADS_NUEVOS, variables);
```

### Variables requeridas por variante

#### Variante A (leads nuevos)
- `negocio`: Nombre del negocio del prospecto
- `whatsapp_goadmin`: Número de WhatsApp de GO Admin (ej: "311 319 5711")
- `origen_dato_frase`: Frase que explica de dónde salió el número
- `ciudad`: Ciudad del negocio (opcional)
- `sector`: Sector o industria (opcional)

#### Variante B (clientes existentes)
- `motivo`: "seguimiento_propuesta" | "renovacion" | "activacion"
- `nombre_contacto`: Nombre del contacto en la organización
- `negocio`: Nombre del negocio
- `whatsapp_goadmin`: Número de WhatsApp de GO Admin
- `origen_dato_frase`: Frase que explica de dónde salió el número

Variables adicionales según el motivo:
- **seguimiento_propuesta**: `plan_propuesto`, `fecha_propuesta`, `vendedor`
- **renovacion**: `plan_actual`, `fecha_vencimiento`
- **activacion**: `dias_restantes`, `modulo_sin_usar`

### Utilidades

#### `fillPromptVariables(template, variables)`

Reemplaza las variables `{{variable}}` en un prompt con los valores proporcionados.

```typescript
const prompt = fillPromptVariables(template, {
  negocio: 'Mi Negocio',
  ciudad: 'Medellín'
});
```

#### `getOrigenDatoFrase(source)`

Genera la frase adecuada según la fuente del dato en el CRM:

```typescript
const frase = getOrigenDatoFrase('web_form');
// → "Te registraste en la página de GO Admin"
```

Fuentes soportadas:
- `web_form` / `app_registration`: Registro en web o app
- `business_public_listing` / `osm`: Directorio público
- `rues` / `camara_comercio`: Registro de Cámara de Comercio
- `referral`: Referido por un cliente
- `customer_account`: Número registrado en la cuenta

#### `validatePromptVariables(variables, required)`

Valida que todas las variables requeridas estén presentes. Lanza un error si falta alguna.

```typescript
validatePromptVariables(variables, ['negocio', 'whatsapp_goadmin']);
```

## Reglas de estilo

Todos los prompts siguen estas reglas (especificación R-02):

- **Idioma**: Español de Colombia (`es-CO`)
- **Tratamiento**: Tuteo (nunca "usted")
- **Marca**: "GO Admin" (sin guion, sin espacio)
- **Signos**: Sin signos de exclamación inicial ("¡")
- **Precios**: En COP con punto separador de miles: "$99.000" (Pro), "$189.000" (Business), "$990.000" (Ultimate) mensuales
- **Naturalidad**: Frases cortas, verbos simples, tono amable y tranquilo

## Avisos legales

El módulo incluye los textos legales exactos según `guiones_apertura_v1.md`:

- `AVISO_GRABACION_POLLY`: Para llamadas humanas (Amazon Polly)
- `AVISO_AGENTE_IA_CON_GRABACION`: Para llamadas del agente IA
- `RESPUESTAS_GRABACION`: Respuestas según la decisión sobre la grabación
- `RESPUESTA_ERES_ROBOT`: Respuesta cuando preguntan si es un robot

## Migración a producción

Las plantillas de este módulo están listas para usar, pero **NO deben aplicarse directamente a producción sin autorización**.

El SQL para crear el agente de prospección está en:
```
supabase/migrations/YYYYMMDDHHMMSS_agente_voz_prospeccion.sql
```

Este SQL:
1. NO modifica el agente actual de "Pedro" (org 125, id: c194ab52-...)
2. Crea dos nuevos agentes para prospección con concurrencia 2
3. Los crea en estado `is_active = false` para que Juan los active manualmente

## Referencias

- Especificación: `/workspace/uploads/especificacion_agente_goadmin_v1_54a0.md`
- Guiones legales: `/workspace/uploads/guiones_apertura_v1_efc0.md`
- Diagnóstico: `/workspace/uploads/agente_voz_diagnostico_af40.md`
- Fecha de versionado: 2026-09-29
