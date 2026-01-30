# Integración de OpenAI con el Módulo de Chat

Esta documentación describe el paso a paso para integrar OpenAI con el módulo de chat de GO Admin ERP.

## 📋 Índice

1. [Requisitos Previos](#requisitos-previos)
2. [Instalación](#instalación)
3. [Configuración](#configuración)
4. [Arquitectura](#arquitectura)
5. [Servicios Disponibles](#servicios-disponibles)
6. [API Endpoints](#api-endpoints)
7. [Uso en Componentes](#uso-en-componentes)
8. [Modos de Operación](#modos-de-operación)
9. [Costos y Límites](#costos-y-límites)
10. [Troubleshooting](#troubleshooting)

---

## 1. Requisitos Previos

### Cuenta de OpenAI
1. Crear cuenta en [platform.openai.com](https://platform.openai.com)
2. Agregar método de pago (requerido para uso de API)
3. Generar API Key en [API Keys](https://platform.openai.com/api-keys)

### Dependencias del Proyecto
- Next.js 14+
- Supabase configurado
- Node.js 18+

---

## 2. Instalación

### Paso 1: Instalar paquete de OpenAI

```bash
npm install openai
```

### Paso 2: Verificar instalación

```bash
npm list openai
```

Debe mostrar: `openai@4.x.x`

---

## 3. Configuración

### Paso 1: Variables de Entorno

Agregar al archivo `.env.local`:

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.7
```

### Paso 2: Verificar en `.env.example`

```env
# OpenAI Configuration
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.7
```

### Modelos Disponibles

| Modelo | Costo Input | Costo Output | Uso Recomendado |
|--------|-------------|--------------|-----------------|
| `gpt-4o` | $0.005/1K | $0.015/1K | Respuestas complejas |
| `gpt-4o-mini` | $0.00015/1K | $0.0006/1K | **Recomendado** - Balance costo/calidad |
| `gpt-4-turbo` | $0.01/1K | $0.03/1K | Alta precisión |
| `gpt-3.5-turbo` | $0.0005/1K | $0.0015/1K | Económico, respuestas simples |

---

## 4. Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ AIAssistantPanel│  │ MessageInput    │                  │
│  │ - Sugerencias   │  │ - Envío msgs    │                  │
│  │ - Resúmenes     │  │ - Quick replies │                  │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                            │
└───────────┼────────────────────┼────────────────────────────┘
            │                    │
            ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Routes (Next.js)                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────┐  │
│  │/api/chat/ai/    │  │/api/chat/ai/    │  │/api/chat/  │  │
│  │generate-response│  │generate-summary │  │ai/classify │  │
│  └────────┬────────┘  └────────┬────────┘  └─────┬──────┘  │
│           │                    │                  │         │
└───────────┼────────────────────┼──────────────────┼─────────┘
            │                    │                  │
            ▼                    ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   OpenAI Service                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ openaiService.ts                                     │   │
│  │ - generateResponse()                                 │   │
│  │ - generateSuggestedResponse()                        │   │
│  │ - generateConversationSummary()                      │   │
│  │ - classifyIntent()                                   │   │
│  │ - generateAutoResponse()                             │   │
│  └────────┬────────────────────────────────────────────┘   │
│           │                                                 │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                     OpenAI API                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ chat.completions.create()                            │   │
│  │ - Model: gpt-4o-mini                                 │   │
│  │ - Messages: system + history                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (Almacenamiento)                │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ ai_jobs       │  │conversation_  │  │ messages       │  │
│  │ - status      │  │summaries      │  │ - role: 'ai'   │  │
│  │ - tokens      │  │ - summary     │  │ - content      │  │
│  │ - cost        │  │ - sentiment   │  │                │  │
│  └───────────────┘  └───────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Servicios Disponibles

### Archivo: `src/lib/services/openaiService.ts`

#### `generateSuggestedResponse(context)`

Genera una respuesta sugerida para el agente.

```typescript
const response = await openaiService.generateSuggestedResponse({
  customerName: 'Juan Pérez',
  customerEmail: 'juan@email.com',
  channelType: 'whatsapp',
  conversationHistory: [
    { role: 'customer', content: 'Hola, tengo un problema', timestamp: '...' },
    { role: 'agent', content: '¡Hola! ¿En qué puedo ayudarte?', timestamp: '...' },
  ],
});

console.log(response.content); // "Entiendo tu situación..."
console.log(response.usage);   // { promptTokens: 150, completionTokens: 80, totalTokens: 230 }
```

#### `generateConversationSummary(context)`

Genera un resumen de la conversación con análisis de sentimiento.

```typescript
const summary = await openaiService.generateConversationSummary(context);

console.log(summary.summary);    // "El cliente consultó sobre..."
console.log(summary.keyPoints);  // ["Problema con factura", "Solicita reembolso"]
console.log(summary.sentiment);  // "negative"
```

#### `classifyIntent(message)`

Clasifica la intención de un mensaje del cliente.

```typescript
const result = await openaiService.classifyIntent("Quiero cancelar mi suscripción");

console.log(result.intent);        // "solicitud"
console.log(result.confidence);    // 0.95
console.log(result.suggestedTags); // ["cancelacion", "suscripcion"]
```

#### `generateAutoResponse(context, knowledgeBase?)`

Genera una respuesta automática (modo automático).

```typescript
const response = await openaiService.generateAutoResponse(context, [
  "Política de devoluciones: 30 días para productos sin usar",
  "Horario de atención: Lunes a Viernes 9am-6pm",
]);
```

---

## 6. API Endpoints

### POST `/api/chat/ai/generate-response`

Genera respuesta sugerida para una conversación.

**Request:**
```json
{
  "conversationId": "uuid",
  "organizationId": 1
}
```

**Response:**
```json
{
  "success": true,
  "response": "Texto de la respuesta sugerida...",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 80,
    "totalTokens": 230
  },
  "cost": 0.00012,
  "jobId": "uuid"
}
```

### POST `/api/chat/ai/generate-summary`

Genera resumen de conversación.

**Request:**
```json
{
  "conversationId": "uuid",
  "organizationId": 1
}
```

**Response:**
```json
{
  "success": true,
  "summary": "El cliente solicitó información sobre...",
  "keyPoints": ["Punto 1", "Punto 2"],
  "sentiment": "neutral",
  "summaryId": "uuid"
}
```

### POST `/api/chat/ai/classify-intent`

Clasifica intención de un mensaje.

**Request:**
```json
{
  "message": "Quiero hacer una devolución",
  "conversationId": "uuid",
  "organizationId": 1
}
```

**Response:**
```json
{
  "success": true,
  "intent": "solicitud",
  "confidence": 0.92,
  "suggestedTags": ["devolucion", "soporte"]
}
```

---

## 7. Uso en Componentes

### AIAssistantPanel.tsx

```tsx
import { AIAssistantPanel } from '@/components/chat/conversations/id';

<AIAssistantPanel
  summary={conversationSummary}
  activeJob={currentAIJob}
  aiMode={channel.ai_mode}
  onRequestResponse={async () => {
    const res = await fetch('/api/chat/ai/generate-response', {
      method: 'POST',
      body: JSON.stringify({ conversationId, organizationId }),
    });
    const data = await res.json();
    setSuggestedResponse(data.response);
  }}
  onSendSuggestion={(content) => handleSendMessage(content)}
/>
```

### Flujo de Uso

```
1. Usuario abre conversación
   ↓
2. Click "Generar respuesta IA"
   ↓
3. Frontend llama POST /api/chat/ai/generate-response
   ↓
4. API obtiene historial de mensajes de Supabase
   ↓
5. OpenAI genera respuesta sugerida
   ↓
6. Se guarda en ai_jobs para tracking
   ↓
7. Frontend muestra sugerencia al agente
   ↓
8. Agente puede: Enviar / Editar / Descartar
```

---

## 8. Modos de Operación

### Modo Manual (`ai_mode: 'manual'`)
- IA solo se activa cuando el agente lo solicita
- Control total del agente sobre las respuestas
- Ideal para: Casos complejos, clientes VIP

### Modo Híbrido (`ai_mode: 'hybrid'`)
- IA genera sugerencias automáticamente
- Agente revisa y aprueba antes de enviar
- Ideal para: Balance entre eficiencia y control

### Modo Automático (`ai_mode: 'auto'`)
- IA responde automáticamente a mensajes simples
- Escala a agente en casos complejos
- Ideal para: FAQs, consultas repetitivas

### Configuración por Canal

En la tabla `channels` de Supabase:

```sql
UPDATE channels 
SET ai_mode = 'hybrid' 
WHERE id = 'channel-uuid';
```

---

## 9. Costos y Límites

### Estimación de Costos

| Operación | Tokens Aprox. | Costo (gpt-4o-mini) |
|-----------|---------------|---------------------|
| Respuesta sugerida | 300 | $0.00013 |
| Resumen conversación | 500 | $0.00020 |
| Clasificación intención | 150 | $0.00006 |
| Respuesta auto (con KB) | 800 | $0.00035 |

### Ejemplo Mensual

```
1,000 conversaciones/día × 30 días = 30,000 conversaciones

Por conversación:
- 1 respuesta sugerida: $0.00013
- 1 resumen: $0.00020
Total: $0.00033/conversación

Costo mensual estimado: 30,000 × $0.00033 = $9.90 USD
```

### Límites Recomendados

```typescript
// En openaiService.ts
const LIMITS = {
  maxTokensPerRequest: 1000,
  maxRequestsPerMinute: 60,
  maxRequestsPerConversation: 10,
  maxHistoryMessages: 20,
};
```

---

## 10. Troubleshooting

### Error: "Cannot find module 'openai'"

**Solución:**
```bash
npm install openai
```

### Error: "Invalid API Key"

**Verificar:**
1. API Key correcta en `.env.local`
2. API Key activa en dashboard de OpenAI
3. Método de pago configurado

### Error: "Rate limit exceeded"

**Solución:**
- Implementar cola de solicitudes
- Usar exponential backoff
- Considerar upgrade de tier en OpenAI

### Respuestas de baja calidad

**Mejorar:**
1. Ajustar `temperature` (más bajo = más preciso)
2. Mejorar system prompt
3. Agregar base de conocimiento
4. Usar modelo más avanzado (gpt-4o)

### Costos elevados

**Optimizar:**
1. Limitar historial de mensajes
2. Usar gpt-4o-mini en lugar de gpt-4o
3. Cachear respuestas comunes
4. Implementar respuestas predefinidas para FAQs

---

## 📁 Archivos Creados

```
src/
├── lib/
│   └── services/
│       └── openaiService.ts          # Servicio principal de OpenAI
│
└── app/
    └── api/
        └── chat/
            └── ai/
                ├── generate-response/
                │   └── route.ts      # API generar respuesta
                ├── generate-summary/
                │   └── route.ts      # API generar resumen
                └── classify-intent/
                    └── route.ts      # API clasificar intención
```

---

## 🔗 Tablas de Supabase Relacionadas

### `ai_jobs`
Tracking de trabajos de IA ejecutados.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID del trabajo |
| conversation_id | uuid | Conversación relacionada |
| job_type | text | 'response' / 'summary' / 'classification' |
| status | text | 'pending' / 'processing' / 'completed' / 'failed' |
| response_text | text | Respuesta generada |
| prompt_tokens | int | Tokens de entrada |
| completion_tokens | int | Tokens de salida |
| total_cost | numeric | Costo en USD |

### `conversation_summaries`
Resúmenes generados por IA.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID del resumen |
| conversation_id | uuid | Conversación |
| summary | text | Texto del resumen |
| key_points | text[] | Puntos clave |
| sentiment | text | 'positive' / 'neutral' / 'negative' |
| generated_by | text | 'ai' / 'manual' |

---

## ✅ Checklist de Implementación

- [ ] Instalar paquete `openai`
- [ ] Configurar `OPENAI_API_KEY` en `.env.local`
- [ ] Verificar conexión con OpenAI
- [ ] Probar endpoint `/api/chat/ai/generate-response`
- [ ] Probar endpoint `/api/chat/ai/generate-summary`
- [ ] Probar endpoint `/api/chat/ai/classify-intent`
- [ ] Integrar AIAssistantPanel en página de conversación
- [ ] Configurar modo de IA en canales
- [ ] Monitorear costos en dashboard de OpenAI

---

## 🚀 Próximos Pasos

1. **Base de Conocimiento**: Integrar documentos para mejorar respuestas
2. **Fine-tuning**: Entrenar modelo con conversaciones históricas
3. **Webhooks**: Respuestas automáticas en tiempo real
4. **Analytics**: Dashboard de uso y rendimiento de IA
5. **Multi-idioma**: Soporte para otros idiomas

---

*Última actualización: Diciembre 2024*
