# Mejora del motor de IA conversacional del módulo Chat/CRM
### Diagnóstico del código + Prompt de implementación listo para Claude Code
**Proyecto:** Go Admin ERP · **Supabase:** `jgmgphmzusbluqhuqihj` · **Fecha:** 2026-09-09

---

## PARTE 1 — Diagnóstico (lo que encontré en el código, la UI y la BD)

### 1.1 Arquitectura real (no la que parece)

Hay **dos motores de IA distintos** y el que realmente le responde a los clientes **no es el de Next.js**:

| Camino | Quién lo dispara | Dónde vive | ¿Se usa? |
|---|---|---|---|
| **Edge Function `ai-auto-response`** (v69, 1.011 líneas) | Trigger `trg_ai_auto_response` en `messages` → `trigger_ai_auto_response()` → `net.http_post` (pg_net) | Supabase Edge Functions | **SÍ — este es el que habla con los clientes** |
| `POST /api/chat/ai/auto-response` | Nadie | `src/app/api/chat/ai/auto-response/route.ts` | **NO — código muerto** |
| `POST /api/chat/ai/generate-response` | Nadie | `src/app/api/chat/ai/generate-response/route.ts` | **NO** |
| `POST /api/chat/ai/classify-intent` | Nadie | `src/app/api/chat/ai/classify-intent/route.ts` | **NO** |
| `POST /api/chat/ai/generate-summary` | Nadie | `src/app/api/chat/ai/generate-summary/route.ts` | **NO** |
| `POST /api/chat/ai/lab-test` | `aiLabService.ts:267` | **NO EXISTE EL ARCHIVO** | **404 — el Laboratorio está roto** |

Consecuencia directa: cualquier mejora que se haga solo en `src/app/api/chat/ai/**` o en `src/lib/services/openaiService.ts` **no cambia absolutamente nada** en lo que el cliente recibe. Y al revés: hoy la calidad del bot depende de un archivo de 55 KB que no está versionado dentro del repo de la misma forma que el resto.

### 1.2 La bandeja (`/crm/bandeja` → `src/app/app/chat/bandeja/page.tsx`) no tiene IA

Revisado `page.tsx` (25 KB), `ChatView.tsx` (28 KB), `ChatInput.tsx` (14 KB): **cero llamadas a endpoints de IA**. No hay "sugerir respuesta", ni resumen, ni intención, ni sentimiento, ni panel de fragmentos. `AIAssistantPanel.tsx` y `QuickRepliesPanel.tsx` existen en `src/components/chat/conversations/id/` pero **la bandeja no los monta** (son de la vista antigua `/chat/conversaciones/[id]`).

Lo único de respuestas rápidas en la bandeja es `ChatInput.tsx`: menú con `/` que filtra por título/atajo en cliente, sin variables, sin categorías, y con un bug de contador:
```ts
// ChatInput.tsx:134 — si usage_count viene undefined, NaN || 1 => reescribe a 1
.update({ usage_count: (qr as any).usage_count + 1 || 1 })
```
Además `quick_replies_usage` **nunca se escribe** (0 filas) y `conversationDetailService.useQuickReply()` tiene un fallback sin sentido: `.update({ usage_count: supabase.rpc('usage_count') })`.

### 1.3 Los fragmentos de conocimiento: RAG montado pero desconectado

- Existe `pgvector`, existe la tabla `knowledge_embeddings` y existe la función:
  `search_knowledge_fragments(p_organization_id, p_query_embedding vector, p_limit, p_similarity_threshold)`
- **Esa función no se llama desde ningún lado del código.**
- **No existe ningún generador de embeddings** en todo el repo (`knowledgeService.ts` solo lee/borra embeddings; encola `job_type='generate_embeddings'` pero no hay worker que lo procese; no hay ruta API que llame a `text-embedding-*`).
- La Edge Function trae fragmentos **sin ninguna relevancia**:
```ts
const { data: knowledgeFragments } = await supabase
  .from('knowledge_fragments')
  .select('title, content, tags')
  .eq('organization_id', organizationId)
  .eq('is_active', true)
  .limit(10);          // <-- primeros 10 arbitrarios, sin orden, sin búsqueda
```
  Y los inyecta **al final del prompt**, después de ~4.000 tokens de instrucciones de e-commerce, en un bloque plano `REFERENCIA:` mezclado con las quick replies. Ignora `priority`, `tags`, `usage_count` y `ai_settings.max_fragments_context`.
- No se escribe `ai_jobs.fragments_used` (0 de 2.364 jobs), ni se incrementa `knowledge_fragments.usage_count`, ni hay citación de fuentes.

**Datos reales en producción hoy:** `knowledge_sources = 0`, `knowledge_fragments = 0`, `knowledge_embeddings = 0`, `quick_replies = 1`. O sea: además de estar desconectado, **está vacío**. Sin contenido cargado, ninguna mejora de RAG se va a notar.

### 1.4 `/crm/ia` (`/app/chat/ia/configuracion`): la mayoría de los ajustes no hacen nada

La tabla `ai_settings` tiene 22 columnas y 38 organizaciones. Lo que realmente consume la Edge Function es **solo 4 campos**: `model`, `temperature`, `max_tokens`, `system_rules`.

| Campo en la UI | ¿Lo usa el bot? | Evidencia |
|---|---|---|
| `model` | Sí (pero se pisa: si hay imagen fuerza `gpt-4o`) | `ef:index.ts` `const model = hasImage ? 'gpt-4o' : (settings.model \|\| 'gpt-4o-mini')` |
| `temperature`, `max_tokens` | Sí | idem |
| `system_rules` | Sí, pero como prefijo que luego queda sepultado por ~4.000 tokens de reglas hardcodeadas | idem |
| `provider` (openai/anthropic/google) | **No.** La Edge Function instancia `new OpenAI(...)` siempre. Elegir Anthropic o Google no hace nada | `ef:index.ts:18` |
| `tone` | **No** | `TONE_PROMPTS` solo existe en `openaiService.ts`, que no se ejecuta |
| `language` | **No** | idem |
| `fallback_message` | Casi no: solo si OpenAI devuelve vacío | `ef:index.ts` |
| `confidence_threshold` | **No.** `ai_jobs.confidence_score` está NULL en los 2.364 jobs | BD |
| `max_fragments_context` | **No** (hardcoded `.limit(10)`) | `ef:index.ts` |
| `auto_response_enabled` | **No** (el trigger solo mira `is_active` y `channels.ai_mode`) | `trigger_ai_auto_response()` |
| `auto_response_delay_seconds` | **No** (responde instantáneo, sin debounce) | idem |
| `is_active` | Solo en el trigger, **no** dentro de la Edge Function | idem |

Además el catálogo de modelos de la UI está **desactualizado y desalineado**:
- `aiSettingsService.ts` → `AI_PROVIDERS` ofrece `gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo`, `o1`, `claude-3-opus/sonnet/haiku`, `gemini-pro`.
- `providerRegistry.ts` (el módulo nuevo, F0) ya usa `gpt-5.6-luna` / `gpt-5.6-terra` / `gemini-3.8-flash`.
- El default de la columna en BD es `'gpt-4-turbo-preview'`.
- La tabla de precios de `openaiService.calculateCost()` no conoce ninguno de los modelos actuales → cae siempre al precio de `gpt-4o-mini`.
- 29 orgs en `gpt-4o`, 9 en `gpt-4o-mini`. **35 de 38 orgs tienen `system_rules` vacío** → todas responden con el mismo prompt genérico de tienda.
- `max_tokens` llega hasta 16.000 en BD mientras la UI limita a 4.000.

### 1.5 El prompt del bot está cableado a un solo vertical

El `systemPrompt` de la Edge Function (líneas ~722-830) es **100 % retail/e-commerce**: catálogo, tarjetas de producto, `[PEDIDO_LISTO]`, `[DATOS_CLIENTE:...]`, métodos de entrega, checkout. Go Admin es multi-tenant con PMS (hoteles), gym, parking, transporte, restaurante… **A un hotel o un gimnasio el bot le habla de "tarjetas de producto" y "finalizar el pedido"**. Nada lee el vertical de la organización.

La búsqueda de productos usa un stemmer español artesanal + corrector de typos + regex de marcas hardcodeadas (`samsung|lg|mabe|haceb|hisense|...`) dentro de la Edge Function. Frágil e imposible de personalizar por tenant.

### 1.6 Fiabilidad, costos y seguridad

1. **Seguridad crítica:** `ai-auto-response` tiene `verify_jwt: false`, recibe `organizationId` **por body** y consulta la conversación **sin filtrar por organización**:
   ```ts
   .from('conversations').select(...).eq('id', conversationId).single()   // sin .eq('organization_id', ...)
   ```
   Luego inserta el mensaje con el `organizationId` del body. Cualquiera que conozca la URL puede inyectar mensajes, quemar créditos ajenos y cruzar tenants. Mismo patrón en `chat-widget` conviene revisar.
2. **Doble cobro de créditos:** el trigger `trg_consume_ai_credits_on_message` descuenta 1 crédito por cada `messages.role='ai'` insertado **y además** las rutas Next.js llaman `consumeAICredits()`. Cuando esas rutas se conecten, se cobrará doble.
3. **`deduct_ai_credits()` está rota:** inserta en `ai_usage_logs(credits_used, ...)` — columna que no existe (es `credits_consumed`) y omite `action_type` que es NOT NULL. Falla siempre, pero el `EXCEPTION WHEN OTHERS THEN RETURN TRUE` **devuelve éxito sin descontar**. Es una bomba de tiempo: hay que borrarla o arreglarla (el camino bueno es `decrement_ai_credits`, que sí es atómico con `FOR UPDATE`).
4. **La Edge Function no valida créditos ni `is_active`.** Si el trigger cambia o alguien la llama directo, responde gratis e ilimitado.
5. **Sin idempotencia ni debounce:** el trigger dispara en *cada* mensaje entrante. Si el cliente manda 3 mensajes en 5 segundos → 3 llamadas concurrentes → 3 respuestas de IA pisándose. `auto_response_delay_seconds` existe y no se usa.
6. **Sin reintentos ni trazabilidad de errores:** `net.http_post` es fire-and-forget. `ai_jobs` solo se escribe **cuando todo sale bien** → los fallos son invisibles. `total_cost` está NULL en los 2.364 jobs (la Edge Function ni lo calcula).
7. **`channels.ai_mode`:** el enum es `ai_only | hybrid | manual`, pero la Edge Function compara con `'disabled'` (valor inexistente) → guardia muerta. `hybrid` no tiene lógica diferenciada: no hay escalamiento a humano, ni pausa cuando un agente entra a la conversación, ni horario laboral (`business_hours` existe y no se usa). Los 7 canales activos están todos en `hybrid`.
8. **Ciclo de aprendizaje inexistente:** `ai_training_feedback`, `message_reactions` y `conversation_summaries` están en 0 filas y nada las escribe.

### 1.7 Resumen de la BD (contado, no estimado)

```
conversations 20.498 | messages 255.425 | ai_jobs 2.364 | channels 7 (5 website + 2 whatsapp, todos hybrid)
ai_settings 38 (29 gpt-4o, 9 gpt-4o-mini · 35 sin system_rules)
knowledge_sources 0 | knowledge_fragments 0 | knowledge_embeddings 0
quick_replies 1 | quick_replies_usage 0
conversation_summaries 0 | ai_training_feedback 0 | message_reactions 0
ai_jobs con fragments_used: 0 · con confidence_score: 0 · con total_cost: 0
pgvector: sí · pg_net: sí
```

---

## PARTE 2 — PROMPT PARA CLAUDE CODE (copiar desde aquí)

> Pégalo tal cual en Claude Code dentro del repo `go-admin-erp`. Está escrito para ejecutarse por fases; puedes pedirle solo la Fase 1, o todas.

---

**CONTEXTO DEL PROYECTO**

Trabajas en `go-admin-erp`: Next.js 14 (App Router) + TypeScript + Supabase (Postgres multi-tenant con RLS por `organization_id`) + Supabase Edge Functions (Deno). Proyecto Supabase: `jgmgphmzusbluqhuqihj`. Tienes MCP de Supabase disponible: úsalo para inspeccionar esquema, aplicar migraciones y desplegar Edge Functions. Todo el producto y el código están en español.

Vas a mejorar el **motor de IA conversacional del módulo Chat/CRM**: la bandeja de entrada (`/app/chat/bandeja`, que el usuario llama `/crm/bandeja`) y la configuración de IA (`/app/chat/ia/*`, que el usuario llama `/crm/ia`).

**ESTADO ACTUAL VERIFICADO (no lo asumas, ya está comprobado — pero verifica antes de editar):**

1. Quien realmente responde a los clientes es la **Edge Function `ai-auto-response`** (v69, ~1.011 líneas, `supabase/functions/ai-auto-response/index.ts`), disparada por el trigger `trg_ai_auto_response` sobre `messages` → `trigger_ai_auto_response()` → `net.http_post` con pg_net.
2. Las rutas `src/app/api/chat/ai/{auto-response,generate-response,classify-intent,generate-summary}/route.ts` **no las llama nadie**. `src/app/api/chat/ai/lab-test/route.ts` **no existe** aunque `aiLabService.ts:267` la invoca (404).
3. La bandeja (`src/app/app/chat/bandeja/page.tsx`, `src/components/chat/inbox/*`) **no tiene ninguna función de IA**.
4. `search_knowledge_fragments(p_organization_id, p_query_embedding vector, p_limit, p_similarity_threshold)` existe en Postgres con pgvector y **no se llama desde ningún archivo**. **No existe ningún código que genere embeddings.**
5. La Edge Function carga fragmentos con `.limit(10)` sin relevancia y quick replies con `.limit(20)`, y los pega al final del prompt en un bloque `REFERENCIA:`.
6. De `ai_settings` solo se usan `model`, `temperature`, `max_tokens`, `system_rules`. Se ignoran `provider`, `tone`, `language`, `confidence_threshold`, `max_fragments_context`, `auto_response_enabled`, `auto_response_delay_seconds`, `fallback_message` (casi), `is_active` (solo el trigger).
7. `AI_PROVIDERS` en `src/lib/services/aiSettingsService.ts` está desactualizado (gpt-4-turbo, o1, claude-3-*, gemini-pro) y desalineado con `src/lib/services/providerRegistry.ts` (que ya usa `gpt-5.6-luna`, `gpt-5.6-terra`, `gemini-3.8-flash`).
8. El `systemPrompt` de la Edge Function está cableado a retail (catálogo, tarjetas, `[PEDIDO_LISTO]`, checkout). Go Admin también sirve hoteles, gimnasios, parking, transporte y restaurantes.
9. Bugs y riesgos confirmados: la Edge Function no filtra `conversations` por `organization_id` y confía en el `organizationId` del body con `verify_jwt:false`; doble descuento de créditos (trigger `trg_consume_ai_credits_on_message` + `consumeAICredits()` en las rutas); `deduct_ai_credits()` inserta en la columna inexistente `credits_used` y devuelve TRUE por su `EXCEPTION WHEN OTHERS`; la Edge Function compara `ai_mode === 'disabled'` cuando el enum es `ai_only|hybrid|manual`; no hay debounce/idempotencia ni registro de fallos en `ai_jobs`.
10. Producción: 0 fragmentos, 0 fuentes, 0 embeddings, 1 quick reply, 0 resúmenes, 0 feedback; 2.364 ai_jobs sin `fragments_used`, sin `confidence_score`, sin `total_cost`.

**OBJETIVO DE NEGOCIO**

Que la IA que responde a clientes dé respuestas notablemente mejores, que use de verdad el conocimiento y las respuestas rápidas que cada organización configura, que la configuración de `/crm/ia` tenga efecto real, y que el agente humano tenga un copiloto útil dentro de la bandeja.

**REGLAS DE TRABAJO**

- No rompas nada en producción: cada fase debe poder desplegarse sola y ser reversible. Usa feature flags en `ai_settings.metadata` o columnas nuevas con default conservador.
- Todo el código y la UI en español (mensajes, labels, comentarios).
- Multi-tenant estricto: **toda** consulta filtra por `organization_id`; nunca confíes en un `organizationId` que venga del body sin validarlo contra la fila real.
- Migraciones SQL en `supabase/migrations/` con nombre `YYYYMMDDHHMMSS_descripcion.sql`, idempotentes (`if not exists`, `create or replace`).
- Antes de tocar un archivo, léelo completo. Antes de crear una tabla o función, inspecciona el esquema con el MCP de Supabase.
- Tests con Jest (`jest.config.js` ya existe) para toda la lógica pura nueva (selección de contexto, ranking, plantillas, parsers).
- Al terminar cada fase: `npx tsc --noEmit` sin errores nuevos y `npm run lint` limpio en los archivos tocados.
- Documenta cada fase en `docs/` con un ADR corto (decisión, alternativas, consecuencias).
- **No inventes nombres de modelos.** Antes de escribir cualquier catálogo de modelos, pregúntame o léelo de `provider_pricing` / `providerRegistry.ts` / variables de entorno.

---

### FASE 0 — Correcciones críticas (hacer primero, sin refactor)

**0.1 Seguridad de la Edge Function `ai-auto-response`**
- Deriva SIEMPRE `organization_id` de la fila `conversations` leída por `conversationId`, y **descarta** el valor del body (o si viene, exige coincidencia y responde 403 si no).
- Filtra todas las consultas siguientes por ese `organization_id` derivado.
- Añade autenticación de invocación: la función solo debe aceptar llamadas del trigger. Implementa un header `x-internal-secret` con un secreto en `Deno.env` (`AI_INTERNAL_SECRET`) y actualiza `trigger_ai_auto_response()` para enviarlo en `headers`. Rechaza con 401 cualquier llamada sin el secreto.
- Aplica la misma revisión a `chat-widget` (verify_jwt:false) y documenta hallazgos.

**0.2 Créditos**
- Elimina el doble cobro: decide **una sola** fuente de verdad. Recomendación: quitar el descuento del trigger `trg_consume_ai_credits_on_message` y cobrar explícitamente en el punto de generación (Edge Function + rutas API) vía `decrement_ai_credits` (atómico, `FOR UPDATE`), registrando `ai_usage_logs` con `action_type`, `model`, `credits_before/after`, `cost_amount`.
- `DROP FUNCTION deduct_ai_credits(integer, integer)` (rota y peligrosa) o corrígela para usar `credits_consumed` + `action_type` y **quita** el `EXCEPTION WHEN OTHERS THEN RETURN TRUE`.
- La Edge Function debe verificar antes de llamar al LLM: `ai_settings.is_active`, `ai_settings.auto_response_enabled` y créditos > 0. Si no hay créditos: no llamar al modelo, registrar `ai_jobs` con `status='skipped'` y `error_code='no_credits'`, y no responder (o responder `fallback_message` según flag).

**0.3 `ai_mode`**
- Corrige la comparación muerta `ai_mode === 'disabled'`. Semántica correcta:
  - `manual` → no responder nunca.
  - `ai_only` → responder siempre.
  - `hybrid` → responder solo si (a) no hay agente humano activo en la conversación en los últimos N minutos (`messages.role='agent'`), y (b) está fuera de `business_hours` o el canal está sin agente disponible — hazlo configurable en `ai_settings`.

**0.4 Idempotencia y debounce**
- Añade `ai_jobs` como candado: antes de generar, inserta `ai_jobs(status='running', trigger_message_id, conversation_id)` con un índice único parcial sobre `(conversation_id, trigger_message_id)` para que dos invocaciones concurrentes no generen dos respuestas.
- Implementa `auto_response_delay_seconds`: no respondas al mensaje N si llegó otro mensaje del cliente después; agrupa los mensajes del cliente dentro de la ventana y responde una sola vez al conjunto.
- Registra SIEMPRE el job, también en fallo: `status='failed'`, `error_code`, `error_message`. Añade reintento con backoff (máx. 2) para errores 5xx/timeout del proveedor.

**0.5 Arreglar lo roto de respuestas rápidas**
- `ChatInput.tsx:134`: reemplaza el `update` por la RPC existente `increment_quick_reply_usage(reply_id)` (ya existe en la BD) y registra `quick_replies_usage(quick_reply_id, member_id, conversation_id)`.
- `conversationDetailService.useQuickReply()`: elimina el fallback inválido `supabase.rpc('usage_count')`.
- Crea la ruta faltante `src/app/api/chat/ai/lab-test/route.ts` o elimina la llamada del laboratorio; no dejes un 404 vivo.

**Criterios de aceptación Fase 0:** una llamada directa a la Edge Function sin el secreto devuelve 401; una llamada con `organizationId` que no corresponde a la conversación devuelve 403; enviar 3 mensajes seguidos produce **una** respuesta; un fallo del proveedor deja una fila `ai_jobs` con `status='failed'`; los créditos bajan exactamente 1 vez por respuesta.

---

### FASE 1 — Núcleo compartido de IA conversacional (`src/lib/ai/chat/`)

Hoy la lógica buena vive en Deno y la lógica pobre en Next.js. Unifícalas.

Crea un módulo **isomorfo** (sin dependencias de Next ni de Deno; recibe el cliente Supabase y el cliente LLM por inyección) en `src/lib/ai/chat/`:

```
src/lib/ai/chat/
  types.ts                 // AIChatContext, AIChatResult, ContextBlock, RetrievedFragment...
  loadSettings.ts          // lee ai_settings + channel + vertical de la org, con defaults tipados
  contextBuilder.ts        // orquesta los "proveedores de contexto"
  providers/
    knowledgeProvider.ts   // RAG: fragmentos relevantes
    quickRepliesProvider.ts// respuestas rápidas relevantes
    catalogProvider.ts     // productos/categorías (solo vertical retail)
    ordersProvider.ts      // pedidos del cliente
    customerProvider.ts    // ficha del cliente, historial, etiquetas
    verticalProvider.ts    // datos propios de hotel/gym/parking/transporte
  promptBuilder.ts         // ensambla el system prompt por secciones y presupuesto de tokens
  llm/
    index.ts               // fachada: chat(messages, settings) -> {content, usage, model}
    openai.ts  anthropic.ts  google.ts
  postProcess.ts           // parseo de etiquetas [PEDIDO_LISTO], [DATOS_CLIENTE:...], citaciones
  telemetry.ts             // escritura de ai_jobs + ai_usage_logs + costo
```

Requisitos:
- `promptBuilder` debe construir el prompt por **secciones con prioridad y presupuesto de tokens**, no por concatenación ciega. Orden obligatorio, de mayor a menor prioridad:
  1. Identidad + reglas del tenant (`system_rules`), 2. tono + idioma (`tone`, `language`), 3. **conocimiento recuperado (fragmentos) con sus IDs para citación**, 4. respuestas rápidas relevantes, 5. datos operativos del vertical (catálogo, pedidos, disponibilidad), 6. formato de salida, 7. reglas anti-alucinación.
  - Hoy los fragmentos van **al final** y quedan sepultados: ese es el motivo principal de que "no los use". Súbelos.
- Calcula el presupuesto: si el contexto excede `max_tokens_context` (nuevo campo), recorta primero historial antiguo, luego catálogo, **nunca** los fragmentos top-k ni `system_rules`.
- Historial: en vez de mandar los últimos 20 mensajes crudos, usa ventana + resumen incremental (ver Fase 4).
- La Edge Function `ai-auto-response` y las rutas `/api/chat/ai/*` deben pasar a ser **cascarones delgados** que llaman a este núcleo. Como Deno no puede importar de `src/`, define el núcleo en `supabase/functions/_shared/ai-chat/` y **genera** la copia para Next (o publica el núcleo como paquete local y compílalo a ambos targets con un script `npm run build:ai-core`). Elige la estrategia, documéntala en un ADR y automatiza la sincronización con un test que falle si divergen.

**Criterio de aceptación:** cambiar una regla de prompt en un solo archivo cambia el comportamiento tanto del bot de clientes como del copiloto de la bandeja.

---

### FASE 2 — RAG real: que los fragmentos SÍ se usen

**2.1 Pipeline de embeddings (no existe, créalo)**
- Ruta `POST /api/chat/knowledge/embeddings` (y función interna reutilizable) que:
  - toma fragmentos sin embedding o con `content_hash` cambiado,
  - trocea contenidos largos (chunking ~500-800 tokens con solapamiento),
  - llama al modelo de embeddings (configúralo por env, p.ej. `OPENAI_EMBEDDING_MODEL`; **no hardcodees**; la columna `knowledge_embeddings.model` tiene default `text-embedding-ada-002`, actualízalo),
  - hace upsert en `knowledge_embeddings` y guarda `content_hash` en `knowledge_fragments`.
- Dispara la indexación automáticamente al crear/editar/importar fragmentos (`knowledgeService.createFragment/updateFragment/importFragments`) y desde el botón "Reindexar" en `/app/chat/conocimiento`.
- Procesa los `ai_jobs` con `job_type='generate_embeddings'` (hoy se encolan y nadie los consume) desde `/api/cron` o un worker.
- Verifica que exista un índice vectorial (`ivfflat`/`hnsw`) sobre `knowledge_embeddings.embedding`; créalo si falta.

**2.2 Recuperación híbrida**
- `knowledgeProvider` debe combinar:
  - **búsqueda semántica** vía `search_knowledge_fragments(org, embedding, limit := ai_settings.max_fragments_context, threshold := ai_settings.confidence_threshold)`,
  - **búsqueda léxica** por `tags` y full-text español sobre `title`/`content` (crea índice `to_tsvector('spanish', ...)`),
  - fusión por *reciprocal rank fusion* + desempate por `priority` y `usage_count`.
- El embedding de la consulta debe construirse con el **mensaje actual del cliente + resumen corto del hilo**, no solo la última línea.
- Si el mejor score < `confidence_threshold`: no inventes. El prompt debe instruir a pedir aclaración o escalar, y se registra `ai_jobs.confidence_score` con ese score.

**2.3 Trazabilidad y aprendizaje**
- Escribe `ai_jobs.fragments_used` (array de UUIDs) y `ai_jobs.confidence_score` en cada respuesta.
- Incrementa `knowledge_fragments.usage_count`; suma `positive_feedback`/`negative_feedback` desde el feedback del agente (Fase 4).
- En la bandeja, el mensaje de IA debe poder mostrar "fuentes usadas" (chips con el título del fragmento, enlace a `/app/chat/conocimiento/fragmentos/[id]`).

**2.4 Contenido inicial (bloqueante para que se note la mejora)**
Hoy hay **0 fragmentos y 0 fuentes en toda la plataforma**. Sin contenido, la mejora es invisible. Implementa:
- Un **seeder de plantillas de conocimiento por vertical** (retail, hotel, gym, parking, restaurante, transporte, servicios): 15-25 fragmentos base cada uno — horarios, políticas de envío/devolución, garantías, métodos de pago, preguntas frecuentes, política de cancelación… con `{{variables}}` que se rellenen desde `organizations`/`organization_settings`.
- Un **generador asistido**: botón "Generar base de conocimiento inicial" en `/app/chat/conocimiento` que proponga fragmentos a partir de los datos que ya tiene la org (categorías, métodos de pago, checkout config, horarios) y de las últimas 200 conversaciones cerradas, para que el admin solo revise y apruebe.
- Un **detector de vacíos**: job semanal que agrupa preguntas de clientes que la IA respondió con baja confianza y sugiere crear fragmentos.

**Criterio de aceptación:** con 10 fragmentos cargados, una pregunta cuya respuesta esté en un fragmento debe responderse citando ese fragmento, con `ai_jobs.fragments_used` poblado; una pregunta fuera del conocimiento debe responder con la ruta de baja confianza, no inventar.

---

### FASE 3 — Respuestas rápidas realmente integradas

**3.1 Modelo de datos** (migración): añade a `quick_replies` → `category text`, `channel_types text[]`, `variables jsonb`, `language text`, `is_ai_usable boolean default true`, `embedding` (o una tabla `quick_reply_embeddings` análoga a la de fragmentos).

**3.2 Para la IA**
- `quickRepliesProvider` selecciona por relevancia semántica + `channel_types`, limitado por un nuevo `ai_settings.max_quick_replies_context` (default 3), no `.limit(20)` ciego.
- Preséntalas al modelo como **respuestas canónicas de la marca**: "Si la consulta encaja con una de estas, responde usando ESTE texto (puedes adaptar el saludo, no el contenido)". Hoy van en un `REFERENCIA:` plano indistinguible del conocimiento.
- Interpola variables (`{{cliente.nombre}}`, `{{empresa.nombre}}`, `{{pedido.numero}}`) antes de inyectarlas.
- Registra en `quick_replies_usage` también cuando las usa la IA (`member_id` nulo + `used_by='ai'`).

**3.3 Para el agente en la bandeja**
- Menú `/` mejorado en `ChatInput.tsx`: navegación con teclado, previsualización, agrupación por categoría, búsqueda difusa, e interpolación de variables al insertar.
- Nuevo panel lateral en la bandeja: **"Respuestas sugeridas"** que muestra las 3 quick replies más relevantes para el último mensaje del cliente (misma búsqueda semántica), con insertar en 1 clic.
- Arregla el contador (`increment_quick_reply_usage`) y muestra analíticas de uso en `/app/chat/configuracion/respuestas-rapidas`.

---

### FASE 4 — Copiloto de IA dentro de `/crm/bandeja`

La bandeja hoy no tiene IA. Añade un panel lateral `AICopilotPanel` en `src/components/chat/inbox/` montado desde `bandeja/page.tsx` y `ChatView.tsx`:

1. **Sugerir respuesta** — llama al núcleo de la Fase 1 con el mismo contexto que usaría el bot; devuelve 2-3 variantes (formal / breve / empática) editables, con las fuentes citadas. Nunca envía sola: el agente edita y envía.
2. **Resumen del hilo** — persiste en `conversation_summaries` (hoy 0 filas), se regenera incrementalmente cada N mensajes y **se reutiliza como historial comprimido** en el prompt del bot.
3. **Intención + sentimiento + prioridad** — reactiva `classify-intent` conectándolo de verdad: aplica etiquetas (`conversation_tags`) y prioridad, y muestra un badge en la lista de conversaciones.
4. **Datos del cliente** — extrae y propone (no aplica sin confirmar) nombre/teléfono/dirección detectados; hoy la Edge Function los escribe directo en `customers` con regex, lo que es riesgoso. Cámbialo a propuesta + confirmación del agente, o marca los cambios en `metadata` para auditoría.
5. **Traducción / reescritura de tono** del borrador del agente.
6. **Feedback** — 👍/👎 sobre cada mensaje de la IA que escriba `ai_training_feedback` y `message_reactions` (hoy en 0), con campo "cómo debió responder" que alimente el detector de vacíos de la Fase 2.4.
7. **Escalamiento** — botón "tomar la conversación" que pause la IA para ese hilo (`conversations.metadata.ai_paused_until`), y regla automática: si el cliente muestra frustración o pide un humano dos veces, la IA se pausa sola y notifica al equipo.

Cada acción del copiloto consume créditos de forma explícita y queda en `ai_jobs` con su `job_type` (`suggestion`, `summary`, `intent`, `rewrite`).

---

### FASE 5 — Que `/crm/ia` mande de verdad

**5.1 Honrar todos los campos existentes** — `tone`, `language`, `fallback_message`, `confidence_threshold`, `max_fragments_context`, `auto_response_enabled`, `auto_response_delay_seconds`, `is_active`, `provider`. Cada uno debe tener un efecto observable y un test que lo demuestre.

**5.2 Multi-proveedor real** — implementa `llm/anthropic.ts` y `llm/google.ts` detrás de la fachada, resolviendo credenciales con `providerCredentials.server.ts` / `providerRegistry.ts` (categoría `llm`) y con fallback a env. Si un proveedor no está configurado para la org, la UI debe **deshabilitarlo con explicación**, no dejar elegirlo para que luego no haga nada.

**5.3 Catálogo de modelos** — reemplaza el `AI_PROVIDERS` hardcodeado de `aiSettingsService.ts` por un catálogo servido desde backend, alimentado por `provider_pricing` + `providerRegistry.defaultSettings()`. Debe traer por modelo: nombre, contexto máximo, soporte de visión, costo entrada/salida real, y estado (recomendado / económico / legacy). **Pregúntame qué modelos exponer antes de fijar la lista** — no copies los que están hoy (gpt-4-turbo, o1, claude-3-*, gemini-pro están obsoletos) ni asumas los de `providerRegistry`. Elimina la tabla de precios muerta de `openaiService.calculateCost()` y calcula el costo desde `provider_pricing`, escribiendo `ai_jobs.total_cost` y `ai_usage_logs.cost_amount`.

**5.4 Configuración por canal y por vertical**
- Permite override de `system_rules`, `tone` y modelo **por canal** (WhatsApp ≠ widget web): tabla `channel_ai_settings` o columna `channels.ai_overrides jsonb`.
- Añade `ai_settings.vertical` (o léelo de la organización) y sustituye el prompt cableado de retail por **plantillas de prompt por vertical** en `src/lib/ai/chat/prompts/{retail,hotel,gym,parking,restaurante,transporte,servicios}.ts`. El bloque de catálogo/checkout/`[PEDIDO_LISTO]` solo se inyecta en retail.
- Editor de `system_rules` con plantillas por vertical y **vista previa del prompt final ensamblado** (con conteo de tokens por sección). Hoy 35 de 38 orgs tienen `system_rules` vacío: hay que empujarlas con plantillas.

**5.5 Laboratorio (`/app/chat/ia/laboratorio`) funcional** — crea `/api/chat/ai/lab-test` sobre el núcleo, y que muestre: prompt final, fragmentos recuperados con score, quick replies elegidas, tokens por sección, costo estimado y respuesta. Añade **comparación A/B** de dos configuraciones sobre el mismo mensaje.

**5.6 Evaluación continua** — un set de casos dorados (`docs/ai-eval/casos.jsonl`) por vertical y un script `npm run ai:eval` que corra el núcleo contra ellos y reporte precisión de recuperación, tasa de alucinación (respuestas sin fragmento de respaldo) y costo medio. Ejecútalo antes de cada cambio de prompt.

---

### FASE 6 — Observabilidad

- Dashboard en `/app/chat/ia/trabajos`: jobs por estado, latencia p50/p95, costo por día/modelo/organización, tasa de escalamiento a humano, % de respuestas con fragmento de respaldo, top fragmentos usados, top consultas sin respuesta.
- Alertas: pico de `ai_jobs.status='failed'`, créditos por agotarse, latencia > umbral.
- Sentry ya está integrado (`sentry.server.config.ts`): captura los errores del LLM con `job_id` y `organization_id` como tags.

---

### ORDEN DE EJECUCIÓN SUGERIDO

`Fase 0` (crítico, 1 sprint) → `Fase 1` (núcleo) → `Fase 2` (RAG + contenido inicial) → `Fase 3` (quick replies) → `Fase 5.1-5.3` (config efectiva) → `Fase 4` (copiloto) → `Fase 5.4-5.6` → `Fase 6`.

**Empieza por la Fase 0 y para al terminarla.** Muéstrame el diff, los resultados de `tsc` y los tests, y espera mi visto bueno antes de seguir con la Fase 1.

---

### ANTES DE EMPEZAR, PREGÚNTAME

1. ¿Qué modelos exactos quieres exponer en el selector de `/crm/ia` (OpenAI / Anthropic / Google) y cuál debe ser el default por plan?
2. ¿La respuesta automática al cliente sigue siendo enteramente autónoma, o quieres modo "borrador" donde la IA propone y un agente aprueba en canales sensibles?
3. ¿La Edge Function se mantiene como runtime del bot, o migramos todo a rutas Next.js (con la latencia extra) para tener un solo despliegue?
4. ¿Confirmas que puedo tocar el trigger `trg_consume_ai_credits_on_message` para eliminar el doble cobro?

