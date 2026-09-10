# FASE 06 — Agente IA multicanal con propósito por etapa: voz clonada (ElevenLabs) + cerebro OpenAI/Gemini + email + WhatsApp + herramientas

> Fecha: 2026-09-08 · Estado: **reescrito V4** (sustituye la V3 completa)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj` · Vercel iad1 (Next.js) + Railway (ws-server)
> Depende de: F0 (cola `outbound_jobs`, outbox `crm_events`, pg_cron + `/api/crm/jobs/run`, seguridad ws-server, fixes de schema `activities`/`tasks`/`customers.timezone`/`purpose_type`, Dockerfile con lockfile y `crm/**`, borrado de código muerto), F3 (telefonía: `calls`, números, grabación, `/api/voice/status`), F4 (transcripción + análisis: job `analyze`), F7 (email: `sendEmail`, plantillas, "Redactar con IA"), F16 (WhatsApp: envío vía `messages` + `trg_channel_dispatch`, plantillas HSM, ventana 24h), F9 (timeline: `TimelineEntryCard`)
> Bloquea: F8 (acción `start_ai_agent` y step `ai_call` usan el dispatcher de esta fase), F11 (renovación/NPS por agente)
> Esfuerzo: **XL** · Valor: **muy alto** (es la pieza que el dueño pidió literalmente: "agente IA que llame, escriba email y WhatsApp y haga lo que la org configure por etapa")

---

## 0. Objetivo y alcance

Al terminar esta fase, con una org de prueba, se puede verificar que:

1. En `/app/crm/agentes-ia` el admin crea un agente desde el catálogo de propósitos (p. ej. "Vender producto X" o "Agendar reunión"), elige **su propia voz clonada** (IVC ElevenLabs, con consentimiento grabado) o una de catálogo, la escucha en preview, define canales `['whatsapp','voice','email']`, herramientas permitidas y guardarraíles, y lo prueba en el **simulador de chat** sin gastar minutos.
2. Desde `StageConfigDialog` (tab "Agente IA") se asigna ese agente a una etapa con `trigger_on='enter'` y `delay_minutes=30`: al mover una oportunidad a esa etapa, el runner de F8 encola `outbound_jobs` kind `agent_orchestration` y el agente ejecuta la orquestación (WhatsApp → si no responde en N horas, llamada → email de cierre) respetando horario del cliente, DNC (`fn_can_contact`), créditos y `max_attempts`.
3. La llamada saliente usa Twilio ConversationRelay con `ttsProvider="ElevenLabs"` y la voz clonada, STT Deepgram `nova-3-general`, cerebro OpenAI (`gpt-5.6-terra`) o Gemini (`gemini-3.8-flash`) según `voice_agents.llm_provider`, con **tool loop correcto** (fix C-13), interrupciones, buzón (AMD) y transferencia a humano real (`end` con `handoffData` → `<Dial>` al vendedor).
4. Cada turno queda en `voice_agent_calls.conversation_log`; al colgar se encola `analyze` (F4) y se crea la `activity` tipo `ai_call` con resultado estructurado (`goal_schema` cumplido, `outcome`, `next_step`), visible en el timeline (F9) con transcripción, herramientas aplicadas y costo.
5. Las herramientas (`move_opportunity_stage` con gate, `create_task`, `book_meeting` con `calendar_events` + ICS + WhatsApp utility, `send_payment_link`, `log_objection`, etc.) quedan registradas en `voice_agent_tool_runs` y se aplican según política `auto|suggest` del agente.
6. `AIAgentDialog` desde `QuickActionsBar` (F9) lanza el agente "ahora" o "programado" sobre una oportunidad concreta; `voice-agents/[id]/dispatch` acepta también listas de clientes (campañas, fix C-1).
7. El motor secundario `elevenlabs_agent` (ElevenAgents con Twilio nativo) funciona para la misma definición de agente: `POST /v1/convai/twilio/outbound-call`, tools webhook a `/api/crm/agent-tools/*`, `post_call_transcription` → mismo pipeline de actividad/análisis.
8. Costos por minuto se debitan de forma atómica (voz: `deduct_comm_credits`; LLM/TTS: `decrement_ai_credits`) ANTES de cada proveedor y se ven en el dashboard de uso.

**No incluye:** softphone humano (F3), llamadas desde celular (F5), transcripción de grabaciones humanas (F4), editor de plantillas de email (F7), plantillas HSM/aprobación Meta (F16), builder de secuencias (F8), `openai_realtime` y `gemini_live` en producción (quedan documentados como experimentales en §6.4), sincronización Google Calendar/Cal.com (Nivel 2 de D1, fase posterior).

---

## 1. Estado actual verificado

Hechos de `audit-ai-automations.md`, `audit-telephony.md` y el schema live.
Tabla revisada el **2026-09-09** tras la ronda 1 del builder (ver seccion 13).

> **Correccion de diagnostico (ronda 3, 2026-09-09).** Dos garantias que la ronda 2 declaro
> por escrito **no eran ciertas**, y quedan rectificadas aqui:
>
> 1. **«una fila inmutable por reserva»** (`voice_agent_call_attempts`) **era falsa**: la tabla
>    tenia `INSERT/UPDATE/DELETE` para `anon` y `authenticated`, con sus politicas, asi que
>    cualquier miembro autenticado podia vaciarla desde el navegador y **poner el tope diario a
>    cero**. El arreglo estrella de la ronda 2 se apoyaba en una tabla que el propio inquilino
>    escribia.
> 2. **La guarda de pertenencia se aplico a una sola de las dos funciones que escriben.**
>    `fn_log_consent_opt_out` validaba que el CLIENTE fuera de `p_org`, pero no que el LLAMANTE
>    lo fuera: un miembro de cualquier organizacion marcaba `opted_out` y `do_not_call = true` a
>    los clientes de cualquier otra, en los cuatro canales (rompia tambien F7 y F16).
>
> Las dos las cerro el orquestador en `crm_v4_f06_05_consent_membership_y_libro_inmutable` y se
> han **verificado en vivo** en la ronda 3 (`42501` en los tres verbos de escritura del libro y
> en la llamada entre inquilinos; `SELECT` intacto).
>
> **Y el gemelo que nadie habia mirado:** `voice_agent_tool_runs` —la auditoria de lo que hizo
> el agente en la llamada, incluida la baja voluntaria— tenia exactamente el mismo agujero, asi
> que el inquilino podia **borrar la prueba de que el cliente pidio la baja**. Cerrado en
> `crm_v4_f06_06_tool_runs_audit_inmutable` (seccion 15.2).
>
> Desde la ronda 3 la suite de la fase comprueba los **privilegios reales de la base** (bloque
> `L`, contra `pg_proc`/`pg_class`/`pg_policies`/`pg_indexes` y con sondas HTTP con la clave
> publica): si una migracion futura vuelve a conceder `anon` o a dejar un libro escribible, la
> suite se pone roja.

> **Correccion de diagnostico (2026-09-09).** La version anterior de esta tabla culpaba a
> `customers.timezone` de romper el despachador. Es **falso**: `customers.timezone` existe
> (`text NOT NULL DEFAULT 'America/Bogota'`, la creo F0). La columna que realmente mataba la
> fase era **`customers.do_not_call`**, que el despachador seleccionaba y que **no existia**
> en la base: PostgREST devolvia `42703`, el codigo no desestructuraba `error` y el fallo se
> reportaba como "Cliente no encontrado", asi que quedaba invisible y `calls_initiated` era 0
> siempre. `do_not_call` no aparecia en ninguna de las 1073 lineas de este documento.
> Corregido en la ronda 1 por dos vias a la vez: la migracion
> `crm_v4_f06_01_do_not_call_column_and_consent_gate` crea la columna real
> (`boolean NOT NULL DEFAULT false`, respetada por `fn_can_contact(...,'voice')`), y el
> despachador dejo de leerla directamente: la baja voluntaria pasa **solo** por
> `fn_can_contact`, fail-closed.

> **Correccion de diagnostico (ronda 2, 2026-09-09).** El tope diario que la ronda 1
> declaraba "cuenta TODO intento" **no lo contaba**: se medía por
> `voice_agent_calls.claimed_at`, y tanto el reintento tras un fallo del proveedor
> (`voiceAgentService.ts`, rama `catch` de `dialClaimedCall`) como el rechazo por franja
> horaria del cliente ponen esa marca a `NULL`, con lo que el intento desaparecía del
> conteo. Medido por el tester: 3 filas producían **15 marcaciones reales contadas como 3**;
> con `retry_policy.max_attempts` acotado a 5, el techo efectivo era **250 marcaciones/día
> contra un tope declarado de 50**. Corregido con la migración
> `crm_v4_f06_04_attempt_ledger_and_dispatch_guardrails`, que añade el libro
> `voice_agent_call_attempts` (una fila inmutable por reserva, escrita por la propia RPC de
> claim) y hace que el conteo vaya contra él. Además el "día" del tope pasa a calcularse en
> la zona horaria de la organización (`startOfDayIso`), no en UTC.
>
> **Correccion de diagnostico (ronda 2).** Dos afirmaciones del informe de la ronda 1 eran
> incorrectas y quedan rectificadas aquí: (a) `ws-server.Dockerfile` **no necesitaba cambio**
> — su línea `COPY src/lib/ ./src/lib/` ya copia toda la carpeta de librerías, así que los
> módulos nuevos entran en la imagen sin tocar nada; (b) las tres RPC de F6 **no** estaban
> concedidas solo a `authenticated`/`service_role`: se crearon con el privilegio por defecto
> del esquema `public` y quedaron ejecutables por `anon`. Lo revocó el orquestador por
> migración. Regla que se aplica desde esta ronda: **toda función `SECURITY DEFINER` lleva su
> `REVOKE` en la misma migración que la crea** (así se hizo con las dos de la ronda 2).

| Componente / archivo:línea | Estado | Qué está mal |
|---|---|---|
| `src/app/api/crm/voice-agents/route.ts`, `[id]/route.ts` | ✅ | CRUD org-scoped con `getServerOrgContext`. Acepta `engine`, `purpose_type`, `allowed_tools` (:50,:51,:64) pero no valida contra los CHECK |
| `src/app/api/crm/voice-agents/campaigns/route.ts`, `[id]`, `run/route.ts` | 🟡 | CRUD ok; `run` con `CRON_SECRET` fail-closed (:28-42) pero **nunca programado** (ni vercel.json ni pg_cron) |
| `src/app/api/crm/voice-agent-calls/route.ts` | ✅ | Listado org-scoped |
| `src/lib/services/crm/voiceAgentService.ts` (reescrito) | ✅ r1 | **Corregido.** La lectura de `customers` ya no pide `do_not_call` (`select('id, phone, timezone')`) y desestructura `error`, que se propaga con su SQLSTATE (`VoiceAgentDbError`). `do_not_call_list` eliminada: la baja voluntaria pasa por `canCallCustomer` → `fn_can_contact` fail-closed. `hasAICredits`/`ai_settings` eliminados: se reserva credito con `deduct_comm_credits` ANTES del proveedor y se reembolsa si el proveedor falla |
| `voiceAgentService.ts` topes de marcacion | ✅ r1 | Tope diario que cuenta **todo intento** (`countAttempts` por `claimed_at`, sin filtrar por estado), tope **por hora** (`max_calls_per_hour`), **parada de emergencia** (`emergency_stop`) y corte automatico tras 5 fallos seguidos (`FAILURE_STREAK_TO_STOP`) |
| `voiceAgentService.ts` concurrencia | ✅ r1 | La fila se reserva con `fn_claim_voice_agent_calls` (`FOR UPDATE SKIP LOCKED`) **antes** de marcar |
| `voiceAgentService.ts` statusCallback | ✅ r1 | Apunta a `/api/voice/ai-agent/status?callId=…` (ruta NUEVA), que verifica firma, correlaciona por `callId` o `provider_call_sid` y cierra `voice_agent_calls` **y** `calls` |
| `voiceAgentService.ts` insert en `calls` | ✅ r1 | Columnas reales y los 8 NOT NULL cubiertos (`organization_id, provider, direction, mode='ai_agent', from_number, to_number, status, started_at`). `voice_agent_calls.call_id` recibe el **UUID de `calls`**; el CallSid va en la columna NUEVA `voice_agent_calls.provider_call_sid` |
| `voiceAgentService.ts` URL TwiML | ✅ | `getWebhookBaseUrl()` normaliza con `new URL(raw).origin`: no hay doble prefijo (afirmacion anterior **FALSA**) |
| `voiceAgentService.ts` `PurposeType` | ✅ r1 | Derivado de `VOICE_AGENT_PURPOSES` (`src/lib/crm/enums.ts`), identico al CHECK: incluye `sell_product` y `book_meeting` y ya no declara `follow_up`/`survey`. `createVoiceAgent` deja de mandar `?? null` a columnas NOT NULL |
| `src/lib/services/crm/voiceAgentTools.ts` (reescrito) | ✅ r1 | Importado por `conversationRelayHandler` (`executeCrmTool`). Ya no importa `stageGateService` (que arrastraba el cliente de **navegador**). 11 tools con la forma anidada de `chat.completions`: `get_customer_context`, `move_opportunity_stage`, `update_opportunity_field` (allow-list de columnas), `create_task`, `book_meeting`, `schedule_callback`, `log_objection`, `send_payment_link`, `log_consent_opt_out`, `transfer_to_human`, `end_call`. `activities` con `activity_type='ai_call'` y columnas reales (`notes`, `metadata`); `tasks` con `related_to_id` y `status='open'`. Cada ejecucion queda en `voice_agent_tool_runs` |
| `voiceAgentTools.moveOpportunityStage` | ✅ r1 | **Ya no miente.** Si la etapa destino es terminal (`is_won`/`is_lost`) devuelve `success:false` con el motivo y crea una tarea para que una persona confirme el cierre; la oportunidad **no** queda en "Ganada" y abierta para siempre |
| `src/app/api/voice/twiml/ai-agent/route.ts` (reescrito) | ✅ r1 | Carga la configuracion completa con `buildRuntimeConfig` (`select('*')` sobre `voice_agents` + `stage_agents` + `voices` + `comm_settings`). Emite `<Say>` con el aviso de grabacion (no desactivable) y registra `call_consents`, y un `<ConversationRelay>` con `ttsProvider`, `voice`, `welcomeGreeting`, `transcriptionProvider`, `speechModel`, `interruptible`, `dtmfDetection`, `language`/`ttsLanguage`. Idempotente por `provider_call_sid` |
| `ai-agent/route.ts` firma | ✅ | Verifica SIEMPRE con `verifyTwilioWebhook` antes de tocar la base. Afirmacion anterior **FALSA**: comprobado en vivo, `POST → 403` |
| `ai-agent/route.ts` scope de org | ✅ | El `UPDATE` filtra por `id + organization_id + voice_agent_id`. Afirmacion anterior **FALSA** |
| `src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts` | ✅ r1 (cambio aditivo) | `handleSetup` lee `claims.agentId` / `customParameters.agentId` y construye la sesion con `buildRuntimeConfig`: prompt del agente + objetivo de la ETAPA + guardarrailes obligatorios, saludo del `first_message` (saliente, no "gracias por llamar"), modelo/temperatura/`max_turns`/`max_duration_seconds` del agente, tools del CRM y `conversation_log` persistido al colgar. El prompt de recepcionista de hotel queda **solo** como respaldo del flujo entrante sin agente |
| `conversationRelayHandler` tool loop | ✅ r1 (C-13 cerrado) | `ConversationMessage` declara `tool_calls`, `mapToOpenAIMessages` los conserva y el mensaje `assistant` que precede a los `role:'tool'` los lleva |
| `conversationRelayHandler` modelo y limites | ✅ r1 | `session.runtime.model`, `session.runtime.temperature`, `maxTurns` y `maxDurationSeconds` del agente; corte cortes al alcanzar el limite |
| `conversationRelayHandler.ts:410-414` | 🟡 C-16 | Debita `deduct_comm_credits(voice)` por minuto pero nunca `ai_settings` → dos libros que no cuadran |
| `conversationRelayHandler.findOrgByNumber` | ✅ | Sin fallback "primera org activa": devuelve `null`. Afirmacion anterior **FALSA** |
| `conversationRelayHandler.ts:191-195, 459, 465` | 🟡 C-14 | `.single()` en lookups multi-fila |
| `voiceAgent/voiceAgentTools.ts:28-138` | 🟡 | 7 tools PMS (`check_availability`, `create_reservation`, …, `transfer_to_agent` que devuelve JSON y **nunca transfiere**) |
| `voiceAgent/realtimeSession.ts`, `elevenLabsTTS.ts`, `deepgramSTT.ts`, `voiceAgent/voiceAgentService.ts` | ✅ | Ya **borrados** del repo (`git status`: `D`) |
| `ws-server.ts` autenticacion del upgrade | ✅ | Token HMAC (`?st=`) + `X-Twilio-Signature` verificados en el handshake, y de nuevo en `setup`. Afirmacion anterior **FALSA** |
| `ws-server.Dockerfile:6-7,:23-24` | 🔴 C-17/C23 | `npm install` sin lockfile; copia solo `integrations/twilio/` + `commCreditsService` → cualquier import de `crm/**`, `zod` o `resend` crashea en Railway. F0 lo corrige; esta fase depende de ello |
| `src/app/api/integrations/twilio/voice/incoming/route.ts:111,:129-140` | 🔴 | `language="en-US"` (C-11) y fallback "primera org activa" (C-G). El agente **entrante** se re-cablea en §4.3 |
| Tablas `voice_agents`, `voice_agent_calls`, `voice_agent_campaigns` | ✅ r1 | RLS `org_member` con 4 politicas cada una. `voice_agent_calls.status` ampliado a `pending|queued|in_progress|completed|failed|transferred|no_answer|voicemail|canceled|skipped` y con `provider_call_sid`, `attempts`, `stage_agent_id`, `claimed_at`, `locked_by`, `consent_given`, `last_error_code`. `voice_agent_campaigns` con `max_calls_per_hour`, `emergency_stop`, `stopped_reason`, `stopped_at`, `consecutive_failures`. `voice_agents` con `identity_disclosure` y `voice_ref_id` |
| `voice_agents.purpose_type` CHECK | ✅ | Ya tiene los 10 valores, incluidos `sell_product` y `book_meeting`. Afirmacion anterior **FALSA** |
| `stage_agents`, `voices`, `voice_agent_tool_runs` | ✅ r1 NUEVAS | Creadas con `organization_id`, FKs, CHECKs y RLS `org_member` (4 politicas reales cada una) |
| `voice_agent_templates` | ❌ | Sigue sin existir. No era imprescindible: el catalogo de objetivos vive en `stage_agents.objective` + `OBJECTIVE_PLAYBOOKS` |
| `customers.timezone` | ✅ | **Si existe** (`text NOT NULL DEFAULT 'America/Bogota'`). La afirmacion anterior era falsa |
| `customers.do_not_call` | ✅ r1 NUEVA | `boolean NOT NULL DEFAULT false`, con indice parcial y respetada por `fn_can_contact(...,'voice')`. **Esta era la columna que rompia la fase**, no `timezone` |
| `activities.activity_type` CHECK | ✅ | Ya incluye `ai_call`. Afirmacion anterior **FALSA** |
| Créditos IA: `aiCreditsService.consumeAICredits` :209-234 | 🟡 C-10 | Read-modify-write no atómico; usar RPC `decrement_ai_credits(p_org_id, p_cost)` |
| UI de agentes | ✅ r1 | `/app/crm/agentes-ia` (`src/app/app/crm/agentes-ia/page.tsx`) con `AgentesIaPage`, `AgentEditorDialog` (Proposito/Guion/Voz/Herramientas), `VoicesPanel` y `AgentCampaignsPanel`. Pendiente: activar la entrada del menu en `src/config/crmNav.ts` (archivo compartido, seccion 13) |
| Configuracion por ETAPA del embudo | ✅ r1 | Pestana "Agente IA" dentro del `StageConfigDialog` existente (`StageAgentTab.tsx`), API `/api/crm/stage-agents`, servicio `stageAgentService.ts` y llegada al prompt real via `agentRuntime.buildRuntimeConfig` |
| `stageGateService.evaluateStageGate(opportunityId, stageId)` | ⚠️ | Firma real de 2 argumentos y el modulo evalua el cliente de **navegador** de Supabase al importarse. Por eso `voiceAgentTools.ts` **ya no lo importa** (regla 4 del proyecto). Reutilizable solo desde codigo de cliente hasta que se migre |
| `calendar_events` (organization_id, title, start_at!, end_at!, timezone, assigned_to uuid, customer_id uuid, event_type, status CHECK `confirmed|tentative|cancelled`, metadata) | ✅ | Base para `book_meeting` Nivel 1 |
| `objections` / `opportunity_objections` (`detected_by` text!, `resolved`) + `objectionService.ts` | ✅ | Base para `log_objection` |
| `products` (id integer, organization_id, name, sku, description, product_type) | ✅ | Base para `sell_product`. Precio se toma de `opportunity_products.unit_price` o de la lista de precios que use el módulo POS (verificar en F10) |
| Edge Function `ai-auto-response` + `trigger_ai_auto_response` (AFTER INSERT ON messages, solo `inbound`+`customer`, respeta `channels.ai_mode` y `ai_settings.is_active`) | ✅ | Motor vivo de auto-respuesta del chat; se extiende con prompt del agente (§4.4 `ai_whatsapp`) |

---

## 2. Arquitectura y flujo

### 2.1 Diagrama de secuencia: llamada saliente por ConversationRelay

```
UI (AIAgentDialog / StageConfigDialog)        Next.js API (Vercel)                 Cola/Cron (F0)            Twilio                 ws-server (Railway)              LLM / ElevenLabs           BD
─────────────────────────────────────         ─────────────────────                ─────────────             ──────                 ───────────────────              ───────────────────        ──
│ POST voice-agents/{id}/dispatch  ──────────▶│ valida org, DNC, créditos                                                                                                             │
│ {opportunityId, when:'now'}                 │ INSERT outbound_jobs(kind='agent_orchestration') ─────────────────────────────────────────────────────────────────────────────────▶│
│                                             │◀── 202 {jobId}                                                                                                                       │
│                                                                              pg_cron 1 min → POST /api/crm/jobs/run (Bearer CRON_SECRET)                                           │
│                                             │◀────────────────────────────── fn_claim_jobs(ARRAY['agent_orchestration'], 25, worker)  (RPC de F0)                                │
│                                             │ agentOrchestrator.step(): canal actual = 'voice' (WhatsApp ya intentado)                                                             │
│                                             │ INSERT voice_agent_calls(status='queued') + calls(mode='ai_agent', status='dialing') ─────────────────────────────────────────────▶│
│                                             │ token = issueWsSessionToken(callId, orgId)  (wsAuth.ts de F0, HMAC-SHA256 WS_SESSION_SECRET, exp 15 min)                          │
│                                             │ calls.create({to, from, url: /api/voice/twiml/ai-agent?agentId&callId, ──────────────────▶│                                          │
│                                             │   statusCallback: /api/voice/status, machineDetection:'DetectMessageEnd', asyncAmd:true})   │ marca al cliente                        │
│                                             │◀──── POST /api/voice/twiml/ai-agent (X-Twilio-Signature) ────────────────────────────────── │                                          │
│                                             │ carga voice_agents + voices → TwiML <Connect action=…/relay/after><ConversationRelay …>    │                                          │
│                                             │──── TwiML ──────────────────────────────────────────────────────────────────────────────▶│                                          │
│                                                                                                                                         │── WSS upgrade (X-Twilio-Signature) ────▶│ valida firma (F0)
│                                                                                                                                         │── setup{customParameters{agentId,callId,token}} ▶│ valida HMAC, carga contexto ──────▶│
│                                                                                                                                         │◀── text{token:first_message,last:true}  │ (welcomeGreeting ya lo dijo Twilio)   │
│                                                                                                                                         │── prompt{voicePrompt,last:true} ──────▶│── stream chat + tools ──▶│            │
│                                                                                                                                         │◀── text{token:"Claro, ",last:false} …   │◀── deltas / tool_calls ──│            │
│                                                                                                                                         │                                         │ executeTool → voice_agent_tool_runs ─▶│
│                                                                                                                                         │◀── text{…,last:true}                    │ conversation_log += turno ───────────▶│
│                                                                                                                                         │◀── end{handoffData:{reason:'transfer'}} (si transfer_to_human)                       │
│                                             │◀── POST /api/voice/relay/after (SessionStatus, HandoffData) ────────────────────────────│                                          │
│                                             │──── TwiML <Dial callerId><Number>{vendedor}</Number></Dial> o <Hangup/> ───────────────▶│                                          │
│                                             │◀── POST /api/voice/status (completed, CallDuration, AnsweredBy) ────────────────────────│                                          │
│                                             │ UPDATE calls/voice_agent_calls; trg_calls_completed_activity (F0/F3) crea activity 'ai_call'                                       ▶│
│                                             │ INSERT call_transcripts desde conversation_log + outbound_jobs(kind='analyze', {call_id, transcript_id}) (F4) → call_analyses       ▶│
│                                             │   → enriquece activity + goal_result + aplica acciones auto|suggest                                                                  │
│◀── realtime activities (F9 timeline: AiCallEntry con transcripción, resultado, tools, costo)                                                                                      │
```

### 2.2 Máquina de estados de `voice_agent_calls.status`

```
queued ──(dispatcher: calls.create ok)──▶ dialing ──(status ringing/in-progress)──▶ in_progress ──(hangup)──▶ completed
  │                                         │                                          │
  │ (DNC / fuera de horario / sin créditos) │ (busy | no-answer | failed | canceled)   ├──(transfer_to_human)──▶ transferred
  ▼                                         ▼                                          │
skipped                                  no_answer / failed / canceled                 └──(AnsweredBy machine_*)──▶ voicemail
                                            │
                                            └──(retry_policy: attempts < max)──▶ queued (run_at = now + delay)
```

Estados terminales: `completed | transferred | voicemail | no_answer | failed | canceled | skipped`. Solo `completed` y `transferred` disparan `analyze`.

### 2.3 Orquestación multicanal (`channels` + `channel_order`)

```
stage_agents.trigger_on='enter' (evento crm_events.event_type='opportunity.stage_changed', producido por trg_opp_stage_change_enqueue de F0; consumido por el runner de F8)
   └─ delay_minutes → outbound_jobs kind='agent_orchestration' {agentId, opportunityId, step:0}   (kind añadido al CHECK de F0 en §3.1)
        step 0: 'whatsapp'  → fn_can_contact(customer,'whatsapp','utility')? → job 'ai_whatsapp' (HSM de apertura si fuera de ventana; texto libre si dentro)
                              → espera config.wait_hours (p.ej. 6h) escuchando crm_events 'whatsapp.inbound' (exit: cliente respondió → sigue la conversación IA en el chat, no se llama)
        step 1: 'voice'     → dentro de business_hours del agente ∩ horario del cliente (customers.timezone)? → job 'ai_call'
                              → outcome ∈ {goal_met, callback, not_interested} termina; {no_answer, voicemail} → reintento por retry_policy hasta max_attempts
        step 2: 'email'     → job 'ai_draft_email' (policy 'auto' envía por F7; 'suggest' deja borrador para aprobación)
   fin: activity 'system' "Orquestación del agente X finalizada: resumen" + notify_user al vendedor (fn_create_org_notification)
```

Cada paso es un `outbound_jobs` con `dedupe_key = agent:{agentId}:opp:{oppId}:step:{n}:attempt:{k}`, de modo que el runner es idempotente.

### 2.4 Catálogo de propósitos (seed `voice_agent_templates`)

Prompt base compartido (≤40 líneas). Las variables se resuelven server-side en `agentContextBuilder.renderPrompt()` con escape de texto plano; nunca se interpola HTML.

```text
Eres {{agent.name}}, asistente virtual de {{org.name}}. Hablas español neutro, con frases cortas (máximo 2 oraciones por turno) porque estás en una llamada telefónica.
IDENTIFICACIÓN OBLIGATORIA: en tu primera intervención di que eres un asistente virtual de {{org.name}} y que la llamada puede ser grabada. Si te preguntan si eres una IA, responde que sí.
PROPÓSITO: {{purpose.description}}
DATOS QUE DEBES OBTENER (goal_schema): {{goal_schema.fields_as_list}}
CRITERIO DE ÉXITO: {{success_criteria}}
CONTEXTO DEL CLIENTE: nombre {{contact.first_name}}, empresa {{customer.company_name}}, etapa actual "{{stage.name}}", oportunidad "{{opportunity.name}}" por {{opportunity.amount_formatted}}. Último contacto: {{last_activity.summary|sin contacto previo}}. Última llamada: {{last_call.summary|ninguna}}. Objeciones previas: {{objections.list|ninguna}}.
PRODUCTO/OFERTA: {{offer.summary|no aplica}}
CONOCIMIENTO (FAQ y objeciones con respuesta sugerida): {{knowledge.faq}} {{knowledge.objections}}
HERRAMIENTAS: usa las herramientas disponibles cuando corresponda; no inventes datos que una herramienta puede consultar. Antes de agendar, confirma fecha, hora y zona horaria en voz alta.
REGLAS (guardarraíles):
- No prometas descuentos, precios ni condiciones que no estén en la oferta. Si el cliente pide algo fuera de tu alcance, ofrece transferir a un asesor humano.
- No hables de la competencia ni la critiques. No des asesoría legal, contable ni médica.
- Si el cliente pide hablar con una persona, o muestra enojo dos turnos seguidos, llama a transfer_to_human.
- Si el cliente pide no ser contactado, llama a log_consent_opt_out y despídete.
- Si detectas buzón de voz, di el mensaje corto {{voicemail_message}} y llama a end_call.
- Nunca pidas ni repitas números de tarjeta, contraseñas ni documentos. Para pagos usa send_payment_link.
- Frases prohibidas: {{guardrails.forbidden_phrases}}.
CIERRE: resume en una frase lo acordado, confirma el siguiente paso y despídete. Luego llama a end_call con outcome y next_step.
```

| `purpose_type` | Objetivo | `first_message` (plantilla) | Tools permitidas por defecto | `goal_schema` (campos) | `success_criteria` | Canal sugerido |
|---|---|---|---|---|---|---|
| `qualify_lead` | Calificar BANT/GOC en ≤4 min | "Hola {{contact.first_name}}, soy el asistente virtual de {{org.name}}; te llamo por tu interés en {{opportunity.name}}. ¿Tienes dos minutos?" | `get_customer_context`, `update_opportunity_field`, `log_objection`, `create_task`, `schedule_callback`, `transfer_to_human`, `end_call` | `budget_range`, `authority` (bool), `need` (text), `timeline` (enum ≤30d/≤90d/>90d), `icp_fit_notes` | `≥3 de 4 campos BANT` + `timeline ≠ null` | whatsapp → voice |
| `confirm_demo` | Confirmar asistencia a demo agendada, reagendar si no | "Hola {{contact.first_name}}, soy el asistente virtual de {{org.name}}. Te llamo para confirmar tu demo del {{meeting.start_local}}." | `get_customer_context`, `book_meeting`, `create_task`, `send_followup_message`, `transfer_to_human`, `end_call` | `confirmed` (bool), `new_slot` (datetime?), `attendees` (int) | `confirmed=true` o `new_slot` reservado | whatsapp → voice |
| `book_meeting` | Agendar reunión con el vendedor | "Hola {{contact.first_name}}, soy el asistente virtual de {{org.name}}. {{user.first_name}} quiere reunirse contigo para {{opportunity.name}}; ¿te propongo un par de horarios?" | `get_customer_context`, `book_meeting`, `schedule_callback`, `send_followup_message`, `transfer_to_human`, `end_call` | `slot` (datetime), `duration_min`, `channel` (video/presencial/llamada), `attendee_email` | `calendar_events` creado con `status='confirmed'` + ICS enviado | whatsapp (lista interactiva de slots) → voice |
| `follow_up_proposal` | Resolver dudas de la cotización, detectar objeción, mover a negociación | "Hola {{contact.first_name}}, soy el asistente virtual de {{org.name}}. Te enviamos la propuesta de {{quote.total|la cotización}} y quería saber si tienes dudas." | `get_customer_context`, `log_objection`, `move_opportunity_stage`, `create_task`, `send_followup_message`, `transfer_to_human`, `end_call` | `proposal_read` (bool), `objection_category`, `decision_date`, `decision_maker_present` | objeción registrada o `move_opportunity_stage` a "Negociación" aprobado por gate | email → voice → whatsapp |
| `sell_product` | Presentar producto X (precio/beneficios desde `products` + `offer`), manejar objeciones, cerrar con link de pago o pasar a humano | "Hola {{contact.first_name}}, soy el asistente virtual de {{org.name}}. Te llamo por {{offer.product_name}}: {{offer.hook}}. ¿Te cuento en un minuto?" | `get_customer_context`, `log_objection`, `send_payment_link`, `book_meeting`, `create_task`, `move_opportunity_stage`, `transfer_to_human`, `end_call` | `interest_level` (enum), `objection_category`, `quantity`, `payment_link_sent` (bool), `close_requested` (bool) | `payment_link_sent=true` o `book_meeting` o transferencia con `interest_level=high` | whatsapp → voice → email |
| `collect_payment` | Cobro amable de factura vencida con link de pago | "Hola {{contact.first_name}}, soy el asistente virtual de {{org.name}}. Te contacto por la factura {{invoice.number}} por {{invoice.total_formatted}} vencida el {{invoice.due_date}}." | `get_customer_context`, `send_payment_link`, `schedule_callback`, `create_task`, `transfer_to_human`, `end_call` | `promise_to_pay_date`, `dispute_reason`, `payment_link_sent` | link enviado o `promise_to_pay_date` registrado | whatsapp → voice → email |
| `reactivate_cold` | Reactivar oportunidad sin contacto >N días | "Hola {{contact.first_name}}, soy el asistente virtual de {{org.name}}. Hace un tiempo hablamos de {{opportunity.name}}; ¿sigue siendo un tema para ti?" | `get_customer_context`, `update_opportunity_field`, `log_objection`, `book_meeting`, `schedule_callback`, `log_consent_opt_out`, `end_call` | `still_relevant` (bool), `blocker`, `recontact_at` | `still_relevant=true` + siguiente paso agendado, o `recontact_at`/opt-out registrado | email → whatsapp → voice |
| `nps_survey` | Encuesta NPS 0-10 + comentario | "Hola {{contact.first_name}}, soy el asistente virtual de {{org.name}}. Solo te tomará 30 segundos: del 0 al 10, ¿qué tanto nos recomendarías?" | `get_customer_context`, `update_opportunity_field`, `create_task`, `end_call` | `nps_score` (0-10), `comment`, `wants_callback` | `nps_score ≠ null` | whatsapp → voice |
| `renewal_reminder` | Recordar renovación y capturar intención | "Hola {{contact.first_name}}, soy el asistente virtual de {{org.name}}. Tu contrato de {{opportunity.name}} vence el {{opportunity.expected_close_date}}." | `get_customer_context`, `book_meeting`, `send_payment_link`, `log_objection`, `move_opportunity_stage`, `transfer_to_human`, `end_call` | `renew_intent` (enum), `churn_reason`, `wants_upgrade` | `renew_intent` registrado y etapa movida | email → whatsapp → voice |
| `custom` | Definido por la org | libre | allow-list explícita | definido en UI | definido en UI | definido en UI |

Guardarraíles comunes obligatorios (no editables por la org, se inyectan siempre): identificación como asistente virtual, aviso de grabación, `max_turns` (default 24), `max_duration_seconds` (default 420), no llamar fuera de `business_hours` ∩ horario permitido de la org (D9), `max_attempts` por orquestación (default 3), transferir si el cliente lo pide, opt-out inmediato.

---

## 3. Base de datos

### 3.1 Migraciones (vía MCP `apply_migration`; prohibido crear `.sql` en el repo)

Prerrequisitos aplicados en F0: `customers.timezone`, `activities` (CHECK ampliado + `call_id`), `tasks` (`related_to_id/related_to_type`), `voice_agents.purpose_type` CHECK con `sell_product|book_meeting`, `outbound_jobs` (kinds `email|whatsapp|sms|ai_call|sequence_step|automation|transcribe|analyze|recording_cleanup|campaign_batch|crm_event|maintenance|noop`) + `fn_enqueue_job(p_org, p_kind, p_payload, p_run_at, p_dedupe_key, …)` + `fn_claim_jobs(p_kinds text[], p_limit, p_worker)`, `crm_events(event_type, entity_type, entity_id, payload, status)`, `contact_consents` + `fn_can_contact(p_customer_id uuid, p_channel text, p_purpose text DEFAULT 'utility')` (firma final acordada en F16), `user_comm_preferences`, `wsAuth.ts` (`issueWsSessionToken/verifyWsSessionToken`, `WS_SESSION_SECRET`). En F3: `trg_calls_completed_activity` (mapea `mode='ai_agent'` → `activity_type='ai_call'`).

#### `202609_crm_v4_f06_agentes_ia_columnas`

```sql
-- Nuevos kinds de cola para esta fase (extiende el CHECK de F0) y el cron que los drena
ALTER TABLE public.outbound_jobs DROP CONSTRAINT IF EXISTS outbound_jobs_kind_check;
ALTER TABLE public.outbound_jobs ADD CONSTRAINT outbound_jobs_kind_check CHECK (kind IN (
  'email','whatsapp','sms','ai_call','sequence_step','automation','transcribe','analyze','recording_cleanup','campaign_batch',
  'crm_event','maintenance','noop','agent_orchestration','ai_whatsapp','ai_draft_email','time_events'));
SELECT cron.unschedule('crm-jobs-every-minute');
SELECT cron.schedule('crm-jobs-every-minute', '* * * * *',
  $$SELECT fn_crm_cron_post(ARRAY['email','whatsapp','sms','ai_call','sequence_step','automation','transcribe','analyze','crm_event','noop','agent_orchestration','ai_whatsapp','ai_draft_email'])$$);

-- voice_agents: de "agente de voz" a "agente IA multicanal"
ALTER TABLE public.voice_agents
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT ARRAY['voice'],
  ADD COLUMN IF NOT EXISTS channel_order text[] NOT NULL DEFAULT ARRAY['voice'],
  ADD COLUMN IF NOT EXISTS product_id integer REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offer jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS knowledge jsonb NOT NULL DEFAULT '{"faq":[],"objections":[],"pricing":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS goal_schema jsonb NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
  ADD COLUMN IF NOT EXISTS success_criteria text,
  ADD COLUMN IF NOT EXISTS handoff_rules jsonb NOT NULL DEFAULT '{"on_request":true,"on_anger_turns":2,"to":"owner"}'::jsonb,
  ADD COLUMN IF NOT EXISTS identity_disclosure boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS action_policy text NOT NULL DEFAULT 'suggest',
  ADD COLUMN IF NOT EXISTS voice_ref_id uuid,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS external_agent_id text,          -- ElevenAgents agent_id
  ADD COLUMN IF NOT EXISTS voicemail_message text,
  ADD COLUMN IF NOT EXISTS orchestration jsonb NOT NULL DEFAULT '{"wait_hours_between_channels":6,"max_attempts":3}'::jsonb;

ALTER TABLE public.voice_agents DROP CONSTRAINT IF EXISTS voice_agents_channels_check;
ALTER TABLE public.voice_agents ADD CONSTRAINT voice_agents_channels_check
  CHECK (channels <@ ARRAY['voice','email','whatsapp']::text[] AND cardinality(channels) >= 1);
ALTER TABLE public.voice_agents DROP CONSTRAINT IF EXISTS voice_agents_action_policy_check;
ALTER TABLE public.voice_agents ADD CONSTRAINT voice_agents_action_policy_check
  CHECK (action_policy IN ('auto','suggest'));
-- identity_disclosure no puede desactivarse (D9): CHECK duro
ALTER TABLE public.voice_agents DROP CONSTRAINT IF EXISTS voice_agents_identity_check;
ALTER TABLE public.voice_agents ADD CONSTRAINT voice_agents_identity_check CHECK (identity_disclosure = true);

-- defaults V4 (los antiguos eran gpt-4o-mini / es-CO / google)
ALTER TABLE public.voice_agents
  ALTER COLUMN language SET DEFAULT 'es-MX',
  ALTER COLUMN voice_provider SET DEFAULT 'elevenlabs',
  ALTER COLUMN stt_provider SET DEFAULT 'deepgram',
  ALTER COLUMN llm_provider SET DEFAULT 'openai',
  ALTER COLUMN llm_model SET DEFAULT 'gpt-5.6-terra',
  ALTER COLUMN max_turns SET DEFAULT 24,
  ALTER COLUMN max_duration_seconds SET DEFAULT 420;

-- voice_agent_calls: estados completos + enlaces a F4 y costo
ALTER TABLE public.voice_agent_calls
  ADD COLUMN IF NOT EXISTS transcript_id uuid REFERENCES public.call_transcripts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS analysis_id uuid REFERENCES public.call_analyses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recording_id uuid REFERENCES public.call_recordings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_amount numeric(10,4),
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS handoff_to_user_id uuid,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'voice',
  ADD COLUMN IF NOT EXISTS engine text,
  ADD COLUMN IF NOT EXISTS external_conversation_id text,   -- ElevenAgents conversation_id
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS goal_result jsonb,
  ADD COLUMN IF NOT EXISTS answered_by text,
  ADD COLUMN IF NOT EXISTS job_id uuid;
ALTER TABLE public.voice_agent_calls DROP CONSTRAINT IF EXISTS voice_agent_calls_status_check;
ALTER TABLE public.voice_agent_calls ADD CONSTRAINT voice_agent_calls_status_check CHECK (status IN (
  'queued','dialing','in_progress','completed','transferred','voicemail','no_answer','failed','canceled','skipped','pending'));
ALTER TABLE public.voice_agent_calls DROP CONSTRAINT IF EXISTS voice_agent_calls_channel_check;
ALTER TABLE public.voice_agent_calls ADD CONSTRAINT voice_agent_calls_channel_check CHECK (channel IN ('voice','whatsapp','email'));
CREATE INDEX IF NOT EXISTS idx_vac_org_status_sched ON public.voice_agent_calls (organization_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_vac_opportunity ON public.voice_agent_calls (opportunity_id) WHERE opportunity_id IS NOT NULL;
```

#### `202609_crm_v4_f06_voices_stage_agents_tool_runs`

```sql
CREATE TABLE IF NOT EXISTS public.voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'elevenlabs' CHECK (provider IN ('elevenlabs','polly','google')),
  provider_voice_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'cloned' CHECK (kind IN ('cloned','catalog')),
  owner_user_id uuid,                                  -- dueño de la voz clonada (solo voz propia, D9)
  consent_recorded_at timestamptz,
  consent_path text,                                   -- Storage crm-documents: org_{id}/voices/{voice}/consent.webm
  sample_path text,
  consent_text text,
  language text NOT NULL DEFAULT 'es',
  model_id text NOT NULL DEFAULT 'eleven_flash_v2_5',
  settings jsonb NOT NULL DEFAULT '{"speed":1.0,"stability":0.5,"similarity_boost":0.75}'::jsonb,
  requires_verification boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voices_cloned_needs_consent CHECK (kind <> 'cloned' OR (owner_user_id IS NOT NULL AND consent_recorded_at IS NOT NULL)),
  UNIQUE (organization_id, provider, provider_voice_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_voices_default ON public.voices (organization_id) WHERE is_default;
ALTER TABLE public.voice_agents ADD CONSTRAINT voice_agents_voice_ref_fk
  FOREIGN KEY (voice_ref_id) REFERENCES public.voices(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.stage_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  voice_agent_id uuid NOT NULL REFERENCES public.voice_agents(id) ON DELETE CASCADE,
  trigger_on text NOT NULL DEFAULT 'enter' CHECK (trigger_on IN ('enter','sla_breach','no_response_days','manual')),
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  channel_order text[] NOT NULL DEFAULT ARRAY['whatsapp','voice','email'],
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,           -- {no_response_days:3, wait_hours_between_channels:6, only_if:{...DSL F8}}
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, voice_agent_id, trigger_on)
);
CREATE INDEX IF NOT EXISTS idx_stage_agents_stage ON public.stage_agents (stage_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.voice_agent_tool_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  voice_agent_call_id uuid NOT NULL REFERENCES public.voice_agent_calls(id) ON DELETE CASCADE,
  tool text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  status text NOT NULL DEFAULT 'executed' CHECK (status IN ('executed','suggested','applied','rejected','failed')),
  applied_at timestamptz,
  applied_by uuid,
  turn_index integer,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vatr_call ON public.voice_agent_tool_runs (voice_agent_call_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vatr_suggested ON public.voice_agent_tool_runs (organization_id, status) WHERE status = 'suggested';

CREATE TABLE IF NOT EXISTS public.voice_agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer REFERENCES public.organizations(id) ON DELETE CASCADE,   -- NULL = global
  key text NOT NULL,
  purpose_type text NOT NULL,
  name text NOT NULL,
  description text,
  system_prompt text NOT NULL,
  first_message text NOT NULL,
  allowed_tools text[] NOT NULL DEFAULT '{}',
  goal_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_criteria text,
  channel_order text[] NOT NULL DEFAULT ARRAY['whatsapp','voice','email'],
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vat_global_key ON public.voice_agent_templates (key) WHERE organization_id IS NULL;
```

#### `202609_crm_v4_f06_rls`

```sql
-- Patrón idéntico a calls_select/insert/update/delete (verificado en pg_policies)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['voices','stage_agents','voice_agent_tool_runs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true)) WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))', t||'_delete', t);
  END LOOP;
END $$;

-- voice_agent_templates: globales legibles por todos los autenticados; propias por org
ALTER TABLE public.voice_agent_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vat_select ON public.voice_agent_templates;
CREATE POLICY vat_select ON public.voice_agent_templates FOR SELECT USING (
  organization_id IS NULL OR organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS vat_write ON public.voice_agent_templates;
CREATE POLICY vat_write ON public.voice_agent_templates FOR ALL USING (
  organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))
  WITH CHECK (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
```

#### `202609_crm_v4_f06_rpc`

```sql
-- Reserva atómica de un slot de reunión (evita doble booking del vendedor)
CREATE OR REPLACE FUNCTION public.fn_book_meeting_slot(
  p_org_id integer, p_assigned_to uuid, p_customer_id uuid, p_title text,
  p_start timestamptz, p_end timestamptz, p_timezone text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('book:'||p_assigned_to::text));
  IF EXISTS (SELECT 1 FROM calendar_events WHERE organization_id = p_org_id AND assigned_to = p_assigned_to
             AND status <> 'cancelled' AND tstzrange(start_at, end_at) && tstzrange(p_start, p_end)) THEN
    RAISE EXCEPTION 'SLOT_TAKEN' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO calendar_events (organization_id, title, start_at, end_at, timezone, assigned_to, customer_id,
    event_type, status, metadata, created_by)
  VALUES (p_org_id, p_title, p_start, p_end, p_timezone, p_assigned_to, p_customer_id,
    'meeting', 'confirmed', p_metadata || jsonb_build_object('booked_by','ai_agent'), p_assigned_to)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_book_meeting_slot(integer,uuid,uuid,text,timestamptz,timestamptz,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_book_meeting_slot(integer,uuid,uuid,text,timestamptz,timestamptz,text,jsonb) TO service_role;

-- Disponibilidad: slots libres de un vendedor en los próximos N días (business_hours del agente)
CREATE OR REPLACE FUNCTION public.fn_agent_free_slots(
  p_org_id integer, p_assigned_to uuid, p_from timestamptz, p_to timestamptz,
  p_tz text, p_start_hour int, p_end_hour int, p_slot_min int DEFAULT 30, p_limit int DEFAULT 6)
RETURNS TABLE (slot_start timestamptz, slot_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT gs AS slot_start, gs + make_interval(mins => p_slot_min) AS slot_end
             FROM generate_series(p_from, p_to, make_interval(mins => p_slot_min)) gs)
  SELECT slot_start, slot_end FROM s
  WHERE extract(isodow FROM slot_start AT TIME ZONE p_tz) BETWEEN 1 AND 5
    AND extract(hour FROM slot_start AT TIME ZONE p_tz) >= p_start_hour
    AND extract(hour FROM slot_end AT TIME ZONE p_tz) <= p_end_hour
    AND slot_start > now() + interval '2 hours'
    AND NOT EXISTS (SELECT 1 FROM calendar_events e WHERE e.organization_id = p_org_id AND e.assigned_to = p_assigned_to
                    AND e.status <> 'cancelled' AND tstzrange(e.start_at, e.end_at) && tstzrange(s.slot_start, s.slot_end))
  ORDER BY slot_start LIMIT p_limit;
$$;
```

`stage_agents` no necesita trigger propio: el runner de eventos de F8 (`automationEngine.evaluateRules`) consulta `stage_agents` para `opportunity.stage_changed` (`trigger_on='enter'`), `sla.breached` y `no_response.N_days` y encola `agent_orchestration` (ver §4.4).

### 3.2 Seeds

`voice_agent_templates` con `organization_id NULL` para las 9 filas del catálogo §2.4 (`key = purpose_type`, excepto `custom`), con `system_prompt` = prompt base + bloque específico del propósito, `first_message`, `allowed_tools`, `goal_schema` (JSON Schema estricto: `additionalProperties:false`, todos los campos `required` con `null` permitido, compatible con structured outputs de OpenAI y con el subset de Gemini), `success_criteria` y `channel_order`. Se insertan `ON CONFLICT (key) WHERE organization_id IS NULL DO UPDATE` para poder versionarlos. No se crean agentes por org por defecto: el usuario elige del catálogo (evita agentes "ejemplo" que alguien active por error).

`provider_pricing` (D6) recibe las filas: `twilio.conversation_relay_min=0.07`, `twilio.voice_co_mobile_min=0.0377`, `twilio.amd_call=0.0075`, `elevenlabs.tts_flash_1k_chars=0.05`, `elevenlabs.agents_min=0.08`, `openai.gpt-5.6-terra_in_1m=2`, `openai.gpt-5.6-terra_out_1m=12`, `openai.gpt-5.6-luna_in_1m=0.20`, `openai.gpt-5.6-luna_out_1m=1.20`, `gemini.gemini-3.8-flash_in_1m=0.75`, `gemini.gemini-3.8-flash_out_1m=3.75`.

### 3.3 Verificación post-migración

```sql
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('voices','stage_agents','voice_agent_tool_runs','voice_agent_templates');
-- 4 filas, todas true
SELECT count(*) FROM pg_policies WHERE tablename IN ('voices','stage_agents','voice_agent_tool_runs');   -- 12
SELECT count(*) FROM voice_agent_templates WHERE organization_id IS NULL;                                 -- 9
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='voice_agent_calls_status_check';       -- incluye 'voicemail','no_answer','skipped'
SELECT column_name FROM information_schema.columns WHERE table_name='voice_agents' AND column_name IN ('channels','offer','knowledge','goal_schema','action_policy','voice_ref_id'); -- 6
SELECT proname FROM pg_proc WHERE proname IN ('fn_book_meeting_slot','fn_agent_free_slots');             -- 2
INSERT INTO voice_agents (organization_id,name,slug,purpose_type,system_prompt,first_message,identity_disclosure) VALUES (1,'x','x','custom','p','f',false);
-- debe fallar con voice_agents_identity_check
```

### 3.4 Impacto en tablas existentes

- `voice_agent_campaigns`: se mantiene para campañas masivas; `target_config.customer_ids` pasa a `uuid[]` y `target_source='pipeline_stage'` se reemplaza en la práctica por `stage_agents` (la campaña queda para listas/segmentos).
- `comm_settings.voice_agent_config` y `voice_agent_enabled`: dejan de definir el prompt (era el recepcionista PMS). `voice_agent_enabled` pasa a ser solo el interruptor global de la org; el agente entrante se resuelve por `phone_numbers.metadata.inbound_agent_id` (NUEVO campo jsonb, sin migración adicional) y ya no por `comm_settings.phone_number`.
- `calls`: se usa con `mode='ai_agent'`, `voice_agent_id`, `provider='twilio'`, `from_number/to_number` obligatorios (fix C4).
- `activities`: nueva `activity_type='ai_call'` (CHECK ampliado en F0) + `channel` (`voice_ai` para llamadas, según el mapeo de F4; `whatsapp|email` para pasos de texto del agente) + `metadata{voice_agent_call_id, transcript_id, analysis_id, tool_runs:[...], cost_amount, outcome, goal_result}`.
- `messages`: los mensajes del agente por WhatsApp entran con `role='ai'`, `direction='outbound'`, `content`, `related_opportunity_id` (F0) y `metadata{voice_agent_id, voice_agent_call_id}`.

---

## 4. Backend

### 4.1 Endpoints

| Método | Ruta | Auth | Body / query | Respuesta | Errores | Idempotencia |
|---|---|---|---|---|---|---|
| GET | `/api/crm/voice-agents` | sesión | `?purpose_type&channel&is_active` | `{data: VoiceAgent[] (+usage_30d, cost_30d)}` | 401 | — |
| POST | `/api/crm/voice-agents` | sesión (admin) | `VoiceAgentInput` (zod `voiceAgentInputSchema`: valida CHECKs, `allowed_tools ⊆ TOOL_REGISTRY`, `channels`, `goal_schema` JSON Schema válido) | 201 `{data}` | 400 zod, 403 no admin | slug único por org |
| GET/PATCH/DELETE | `/api/crm/voice-agents/[id]` | sesión | PATCH parcial (mismo zod `.partial()`) | `{data}` | 404 | — |
| POST | `/api/crm/voice-agents/[id]/test` | sesión | `{messages: {role,content}[], opportunityId?, customerId?}` | `{reply, tool_calls_simulated[], goal_progress, tokens, cost}` | 402 sin créditos IA | — (debita `decrement_ai_credits` con costo luna/terra real) |
| POST | `/api/crm/voice-agents/[id]/dispatch` | sesión | `{opportunityId?: uuid, customerIds?: uuid[], when: 'now'|ISO, channelOrder?: string[], campaignId?}` | 202 `{jobIds[]}` | 400 sin destino, 403 DNC, 402 créditos, 409 ya hay orquestación activa para esa opp | `dedupe_key agent:{id}:opp:{id}:step:0:attempt:1`. F9 lo referencia como `voice-agents/[id]/call`: es este mismo endpoint (F9 debe usar `dispatch`) |
| POST | `/api/crm/voice-agents/[id]/call-me` | sesión | `{phone?: e164}` (default `user_comm_preferences.mobile_phone_e164`) | 202 `{voiceAgentCallId}` | 400 sin teléfono | — (prueba real con créditos) |
| GET | `/api/crm/voice-agents/[id]/history` | sesión | `?status&from&to&limit&cursor` | `{data: VoiceAgentCall[] (+tool_runs, activity_id)}` | — | — |
| GET/POST | `/api/crm/stage-agents` | sesión (admin) | `?stageId` / `StageAgentInput` | `{data}` | 409 duplicado | UNIQUE |
| PATCH/DELETE | `/api/crm/stage-agents/[id]` | sesión (admin) | parcial | `{data}` | 404 | — |
| GET | `/api/crm/voices` | sesión | `?include_catalog=true` | `{data: {mine: Voice[], catalog: {voice_id,name,labels}[]}}` (catálogo = `GET /v1/voices` cacheado 1h) | 502 ElevenLabs | — |
| POST | `/api/crm/voices/clone` | sesión | multipart `{name, sample (audio/webm|wav ≤10MB), consent (audio), consent_text}` | 201 `{data: Voice}` | 400 <30s audio, 403 sin consentimiento, 402 plan ElevenLabs | `UNIQUE(org,provider,provider_voice_id)` |
| POST | `/api/crm/voices/[id]/preview` | sesión | `{text (≤300 chars), model_id?, settings?}` | `audio/mpeg` stream | 402 créditos IA | — |
| PATCH/DELETE | `/api/crm/voices/[id]` | sesión | `{name?, is_default?, settings?}` | `{data}` | — | DELETE también `DELETE /v1/voices/{voice_id}` |
| POST | `/api/crm/voice-agents/campaigns/[id]/run` | sesión (admin) | `{}` | 202 `{enqueued}` | 409 estado | materializa `voice_agent_calls(queued)` + jobs `ai_call` (fix C-1: clientes por `customers.timezone` real, DNC vía `fn_can_contact`) |
| POST | `/api/voice/twiml/ai-agent` | firma Twilio (fail-closed) | query `agentId, callId, token` | TwiML | 403 firma/token, 200 TwiML de error hablado | — |
| POST | `/api/voice/relay/after` | firma Twilio | form `CallSid, SessionStatus, HandoffData, ErrorCode` | TwiML `<Dial>` o `<Hangup/>` | 403 | — |
| POST | `/api/crm/agent-tools/[tool]` | header `X-Agent-Tools-Secret` (HMAC por org) + `agent_id` en body | `{conversation_id, agent_id, dynamic_variables{org_id, voice_agent_call_id}, ...args}` | `{result}` | 401, 403 tool no permitida | `voice_agent_tool_runs` |
| POST | `/api/webhooks/elevenlabs/post-call` | `ElevenLabs-Signature` (`client.webhooks.constructEvent`) | `post_call_transcription` payload | 200 | 401 | `external_conversation_id` único |
| GET | `/api/crm/ai-usage` | sesión | `?from&to&group_by=agent|day` | `{minutes, calls, messages, cost_by_component}` | — | — |

Todos los endpoints de sesión usan `getServerOrgContext()` (`src/lib/utils/orgContext.ts:24`); "admin" = rol con permiso `crm.automations.manage` (F0 define el permiso; hasta entonces `role_id` de admin/owner).

### 4.2 Servicios (firmas TS)

| Archivo | Exporta | Responsabilidad |
|---|---|---|
| `src/lib/services/crm/voiceAgentService.ts` (reescribir, ≤400 L) | `getVoiceAgents(orgId, sb, filters)`, `getVoiceAgent(orgId, id, sb)`, `createVoiceAgent(orgId, input, sb, userId)`, `updateVoiceAgent(orgId, id, input, sb)`, `deleteVoiceAgent`, `voiceAgentInputSchema` (zod), `PURPOSE_TYPES`, `createFromTemplate(orgId, templateKey, overrides, sb)` | CRUD + validación. Se ELIMINA `runCampaignQueue` (:644-892) de aquí |
| `src/lib/services/crm/agentDispatcher.ts` (NUEVO) | `dispatchAgent(sb, orgId, {agentId, opportunityId?, customerIds?, when, channelOrder?, source}): Promise<{jobIds}>`, `enqueueCampaign(sb, orgId, campaignId)`, `canContact(sb, orgId, customerId, channel)`, `nextAllowedTime(agent, customerTz): Date` | Encola `outbound_jobs`; valida DNC, horario, créditos, concurrencia (`comm_settings.voice_max_concurrent_calls`) |
| `src/lib/services/crm/agentOrchestrator.ts` (NUEVO) | `handleOrchestrationJob(sb, job)`, `onCustomerReplied(sb, orgId, opportunityId, channel)`, `finishOrchestration(sb, orchestration, reason)` | Máquina de pasos §2.3; escribe activity `system` de cierre |
| `src/lib/services/crm/agentContextBuilder.ts` (NUEVO) | `buildAgentContext(sb, orgId, {agentId, opportunityId?, customerId?}): Promise<AgentContext>`, `renderPrompt(template, ctx): string`, `contextToDynamicVariables(ctx): Record<string,string>` | Carga org, agente, voz, cliente, oportunidad, etapa + siguientes etapas + `exit_criteria`, productos de la oportunidad (`opportunity_products` + `products`), último análisis (`call_analyses`), objeciones, tareas abiertas, `quotations` (F10) e `invoices` vencidas; compacta a ≤2.5k tokens |
| `src/lib/services/crm/agentTools/index.ts` (NUEVO; sustituye `crm/voiceAgentTools.ts`) | `TOOL_REGISTRY: Record<ToolName, ToolDef>`, `toOpenAITools(names)`, `toGeminiTools(names)`, `toElevenLabsToolConfigs(names, orgId)`, `executeTool(sb, ctx: ToolCtx, name, args): Promise<ToolResult>` | Allow-list + validación zod de args + registro en `voice_agent_tool_runs` + política `auto|suggest` |
| `src/lib/services/crm/agentTools/{getCustomerContext,moveOpportunityStage,createTask,bookMeeting,sendFollowupMessage,sendPaymentLink,logObjection,updateOpportunityField,transferToHuman,endCall,scheduleCallback,logConsentOptOut}.ts` | `run(sb, ctx, args)` | Un archivo por tool (≤120 L) |
| `src/lib/services/crm/agentSimulator.ts` (NUEVO) | `simulateTurn(sb, orgId, {agentId, messages, opportunityId?}): Promise<SimResult>` | Mismo cerebro (`llmAdapters`) con tools en modo `dry_run` (no escriben BD, devuelven "haría X") |
| `src/lib/services/crm/voiceService.ts` (NUEVO) | `listVoices(sb, orgId)`, `cloneVoice(sb, orgId, userId, {name, sample, consent, consentText})`, `previewVoice(sb, orgId, voiceId, text)`, `deleteVoice`, `resolveVoiceForAgent(agent, voice): {crVoice: string, elevenVoiceId: string}` | ElevenLabs IVC + Storage + formato `{voice_id}-flash_v2_5-{speed}_{stability}_{similarity}` |
| `src/lib/services/crm/agentCostService.ts` (NUEVO) | `estimateCallCost(engine, minutes, llmModel)`, `recordCallCost(sb, vacId, breakdown)`, `reserveCredits(sb, orgId, {voiceMinutes, aiCredits})`, `settleCredits(...)` | D6: reserva antes del proveedor, ajuste al final; escribe `comm_usage_logs` + `ai_usage_logs` |
| `src/lib/services/integrations/elevenlabs/elevenAgentsService.ts` (NUEVO) | `syncAgent(sb, orgId, agent, voice): Promise<{agentId}>`, `importPhoneNumber(sb, orgId, e164)`, `outboundCall(sb, orgId, {agentId, phoneNumberId, to, dynamicVariables, overrides})`, `submitBatch(...)`, `parsePostCall(payload)` | Motor secundario |
| `src/lib/services/integrations/twilio/voiceAgent/relaySession.ts` (reescribe `conversationRelayHandler.ts`) | `handleConversationRelayConnection(ws, req)`, `class RelaySession { setup(), onPrompt(), onInterrupt(), onDtmf(), end(handoff?) }` | Handler agent-aware (§4.5) |
| `.../voiceAgent/llmAdapters/{openai,gemini}.ts` | `interface LLMAdapter { streamTurn(input: TurnInput, onToken, onToolCall): Promise<TurnResult> }` | Streaming por frases + tool loop correcto |
| `.../voiceAgent/guardrails.ts` | `checkInbound(text, agent)`, `checkOutbound(text, agent)`, `shouldHandoff(session)`, `limits(session)` | max_turns, max_duration, frases prohibidas, enojo |
| `.../voiceAgent/wsAuth.ts` (creado en F0) | `issueWsSessionToken(callId, orgId): string`, `verifyWsSessionToken(token): {callId, orgId} \| null` | HMAC-SHA256 `WS_SESSION_SECRET`, exp 15 min; esta fase añade one-time use (`voice_agent_calls.metadata.token_used_at`) |
| `src/lib/services/crm/jobs/handlers/{aiCall,aiWhatsapp,aiDraftEmail,agentOrchestration}.ts` | `handle(sb, job): Promise<JobResult>` | Registrados en el runner de F0 |

Se ELIMINAN (coordinado con F0): `voiceAgent/voiceAgentTools.ts` (PMS), `voiceAgentPrompts.ts`, `realtimeSession.ts`, `elevenLabsTTS.ts`, `deepgramSTT.ts`, `voiceAgent/voiceAgentService.ts` (Media Streams), `crm/voiceAgentTools.ts`, `api/integrations/twilio/voice/media-stream`.

### 4.3 Webhooks y callbacks de proveedor

| Origen | Ruta | Verificación | Payload relevante | Mapeo a BD |
|---|---|---|---|---|
| Twilio → TwiML inicial | `/api/voice/twiml/ai-agent` | `validateRequest(authToken de la (sub)cuenta correcta, X-Twilio-Signature, url canónica, params)` fail-closed (fix C-E) + `verifyWsSessionToken(token)` + `voice_agent_calls` filtrado por `organization_id` del token (fix C-F) | `CallSid, From, To, AnsweredBy` (si `asyncAmd:false`) | `voice_agent_calls.status='in_progress'`, `calls.provider_call_sid`, `answered_by` |
| Twilio → status | `/api/voice/status` (F3; NO `bridge/status`, fix C-9) | firma | `CallStatus, CallDuration, AnsweredBy, MachineDetectionDuration, SequenceNumber` | `calls.status` (mapeo F3 `applyStatusEvent`), `voice_agent_calls.status` según §2.2; `AnsweredBy ∈ machine_end_*` → `voicemail`; `trg_calls_completed_activity` (F3) crea activity `ai_call`; si completed/transferred y `duration ≥ 20s`: INSERT `call_transcripts(provider='conversation_relay', status='completed', full_text)` + segments desde `conversation_log` (sin STT extra) y `fn_enqueue_job(org,'analyze',{call_id, transcript_id, organization_id}, now(), 'analyze:{transcript_id}')` (contrato de F4); `emitCrmEvent('call.completed')` |
| Twilio → AMD async | `/api/voice/amd` (NUEVO, `asyncAmdStatusCallback`) | firma | `AnsweredBy, CallSid` | si `machine_start|machine_end_*` y `retry_policy.voicemail.action='leave_message'`: `calls(sid).update({twiml: <Say voice="{{voz}}">{{voicemail_message}}</Say><Hangup/>})`; si `hangup`: `calls(sid).update({status:'completed'})` |
| Twilio → Connect action | `/api/voice/relay/after` | firma | `SessionStatus, HandoffData (JSON string), SessionDuration, ErrorCode` | `HandoffData.reason='transfer'` → TwiML `<Dial callerId="{{caller_id}}" record="record-from-answer-dual" timeout="25"><Number statusCallback="/api/voice/status">{{handoff_phone}}</Number></Dial>` con `handoff_phone` = `user_comm_preferences.mobile_phone_e164` del owner (o `handoff_rules.phone`); `voice_agent_calls.status='transferred'`, `handoff_to_user_id`; si no hay número: `<Say>` disculpa + `<Hangup/>` + task urgente |
| Twilio → WSS upgrade | `wss://{WS_SERVER_URL}/conversation-relay` | `X-Twilio-Signature` sobre la URL del WS (F0) + `token` en `setup.customParameters` | `setup{callSid, from, to, direction, customParameters{agentId, callId, token}}` | sesión en memoria + `voice_agent_calls.started_at` |
| Twilio → entrante | `/api/integrations/twilio/voice/incoming` (F3 lo re-cablea) | firma | `To` | `phone_numbers.e164 = To` → `metadata.inbound_agent_id` → si hay agente activo con `channels ∋ 'voice'`: crear `voice_agent_calls` + `calls(direction inbound, mode ai_agent)` y responder el mismo TwiML CR de §4.5 (idioma `es-MX`, fix C-11). Sin fallback a "primera org" (fix C-G) |
| ElevenLabs → tools | `/api/crm/agent-tools/[tool]` | header `X-Agent-Tools-Secret` = HMAC(orgId, `AGENT_TOOLS_SECRET`) configurado en `request_headers` del tool | `dynamic_variables.voice_agent_call_id` | `executeTool` (mismo registry) |
| ElevenLabs → post-call | `/api/webhooks/elevenlabs/post-call` | `client.webhooks.constructEvent(rawBody, header 'ElevenLabs-Signature', ELEVENLABS_WEBHOOK_SECRET)` | `data{conversation_id, agent_id, status, transcript[], metadata{call_duration_secs}, analysis{transcript_summary, data_collection_results, call_successful}}` | `voice_agent_calls` por `external_conversation_id`; `call_transcripts` (provider `elevenlabs_agent`) + segments desde `transcript[]`; `goal_result` desde `data_collection_results`; `status completed`; `fn_enqueue_job(org,'analyze',{call_id, transcript_id, organization_id}, now(), 'analyze:{transcript_id}')` (F4, sin re-transcribir) |
| ElevenLabs → post_call_audio | mismo endpoint | idem | MP3 base64 | `call_recordings` en `crm-call-recordings/org_{id}/{yyyy}/{mm}/{callId}.mp3` (F3) |

### 4.4 Jobs de la cola (`outbound_jobs`, F0)

| `kind` | payload | Handler | Reintentos |
|---|---|---|---|
| `agent_orchestration` (NUEVO kind) | `{agent_id, opportunity_id?, customer_id, stage_agent_id?, step, attempt, channel_order[], source:'stage'|'manual'|'campaign'}` | `agentOrchestration.handle` → decide canal y encola el job específico con `fn_enqueue_job`; se re-encola a sí mismo con `run_at = now + wait_hours` para evaluar respuesta | `max_attempts=1` por paso; el reintento es lógico (nuevo job con `attempt+1`) |
| `ai_call` (kind de F0) | `{voice_agent_call_id}` (contrato fijado en F0 §4.4) | `aiCall.handle`: revalida DNC/horario/créditos, `reserveCredits`, `calls.create(...)`, marca `dialing` | `max_attempts=3` (F0); Twilio 429/5xx → `fn_fail_job(retryable)`; `no_answer/busy` → `retry_policy` (nuevo job) |
| `ai_whatsapp` (NUEVO kind) | `{voice_agent_call_id, opening:true|false}` | `aiWhatsapp.handle`: dentro de ventana 24h → genera primer mensaje con el LLM (luna) y lo inserta en `messages` (`metadata.source='agent'`; F16 despacha); fuera de ventana → plantilla HSM `agente_apertura_{purpose}` (utility; F16 debe añadirla a su catálogo de plantillas seed junto a `confirmacion_reunion`, `seguimiento_propuesta`, `recordatorio_pago`) con variables del contexto; marca `conversations.metadata.ai_agent = {voice_agent_id, voice_agent_call_id, until}` para que `ai-auto-response` use el prompt del agente | 131049 → no reintentar 24h |
| `ai_draft_email` (NUEVO kind) | `{voice_agent_call_id, policy:'auto'|'suggest'}` | `aiDraftEmail.handle`: `gpt-5.6-luna` (structured output `{subject, blocks_json}`) con contexto → `policy='auto'`: `sendEmail` F7; `'suggest'`: `email_messages(status='pending', metadata.draft=true)` + notificación al vendedor | 3 |
| `analyze` (kind de F4) | `{call_id, transcript_id, organization_id}` | F4 `analyzeJob`; al terminar, hook `onAiCallAnalyzed` de esta fase (registrado en `runPostAnalysisActions` de F4): rellena `goal_result` con structured output contra `goal_schema`, aplica `suggested_*` según `action_policy` y actualiza la activity | F4 |

### 4.5 Snippets clave

**TwiML de `/api/voice/twiml/ai-agent` (ConversationRelay, nombres exactos de docs-twilio-voice.md):**

```ts
const cr = resolveVoiceForAgent(agent, voice); // {crVoice:'NYC9WEgkq1u4jiqBseQ9-flash_v2_5-1.0_0.5_0.75'}
const hints = [org.name, ...products.map(p => p.name)].slice(0, 20).join(', ');
const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect action="${base}/api/voice/relay/after">
    <ConversationRelay url="${WS_SERVER_URL}/conversation-relay"
      language="${agent.language /* es-MX */}"
      ttsProvider="ElevenLabs" voice="${xml(cr.crVoice)}"
      transcriptionProvider="Deepgram" speechModel="nova-3-general"
      welcomeGreeting="${xml(renderPrompt(agent.first_message, ctx))}"
      welcomeGreetingInterruptible="none"
      interruptible="any" interruptSensitivity="medium"
      dtmfDetection="true" reportInputDuringAgentSpeech="none"
      hints="${xml(hints)}" elevenlabsTextNormalization="on">
      <Parameter name="agentId" value="${agent.id}"/>
      <Parameter name="callId" value="${vac.id}"/>
      <Parameter name="token" value="${issueWsSessionToken(vac.id, orgId)}"/>
    </ConversationRelay>
  </Connect>
</Response>`;
```

`es-MX` no tiene voz ElevenLabs por defecto en CR: `voice` es **obligatorio** (docs-twilio-voice). `welcomeGreeting` ya incluye la identificación como asistente virtual + aviso de grabación, por eso no es interrumpible.

**Mensajes WS (Twilio → app / app → Twilio):**

```ts
// setup → validar y cargar
case 'setup': {
  const { agentId, callId, token } = msg.customParameters ?? {};
  const claims = verifyWsSessionToken(token);                       // {callId, orgId} | null  (wsAuth.ts, F0)
  if (!claims || claims.callId !== callId || await tokenAlreadyUsed(sb, callId)) return ws.close(4401, 'bad token');
  const ctx = await buildAgentContext(sb, claims.orgId, { agentId, voiceAgentCallId: callId });
  session = new RelaySession(ws, ctx, msg.callSid);
  await session.setup();                                          // no envía texto: welcomeGreeting ya sonó
  break; }
case 'prompt': if (msg.last) await session.onPrompt(msg.voicePrompt, msg.lang); break;
case 'interrupt': session.onInterrupt(msg.utteranceUntilInterrupt, msg.durationUntilInterruptMs); break;
case 'dtmf': session.onDtmf(msg.digit); break;
case 'error': session.log('twilio_error', msg); break;
// app → Twilio
ws.send(JSON.stringify({ type: 'text', token: 'Claro, ', last: false, interruptible: true }));
ws.send(JSON.stringify({ type: 'text', token: 'te cuento.', last: true }));
ws.send(JSON.stringify({ type: 'end', handoffData: JSON.stringify({ reason: 'transfer', voiceAgentCallId, toUserId }) }));
```

**Adaptador OpenAI con tool loop correcto (fix C-13; Responses API, docs-openai):**

```ts
// llmAdapters/openai.ts
export const openaiAdapter: LLMAdapter = {
  async streamTurn(input, onToken, onToolCall) {
    const client = new OpenAI({ apiKey: input.apiKey });               // key del registry por org (fix C-18)
    let items: ResponseInputItem[] = input.history;                    // incluye function_call + function_call_output previos
    for (let hop = 0; hop < 3; hop++) {                                // máximo 3 saltos de tools por turno
      const stream = await client.responses.create({
        model: input.model, instructions: input.systemPrompt, input: items,
        tools: toOpenAITools(input.allowedTools), tool_choice: 'auto',
        temperature: input.temperature, max_output_tokens: 220, store: false, stream: true,
        reasoning: input.model.endsWith('luna') ? { effort: 'none' } : undefined,
      });
      const calls: FunctionCall[] = []; let text = '';
      for await (const ev of stream) {
        if (ev.type === 'response.output_text.delta') { text += ev.delta; onToken(ev.delta); }
        if (ev.type === 'response.output_item.done' && ev.item.type === 'function_call') calls.push(ev.item);
      }
      if (calls.length === 0) return { text, items };
      items = [...items, ...calls];                                       // el item function_call VA en el historial
      for (const c of calls) {
        const result = await onToolCall(c.name, JSON.parse(c.arguments));  // executeTool
        items.push({ type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(result) });
      }
    }
    return { text: '', items };
  },
};
```

El streaming se corta por frase (`.`, `?`, `!`, `,` seguidos de espacio) → `text{last:false}`; al cerrar la respuesta → `text{last:true}`. En `interrupt`, se descarta el resto del buffer y se guarda en el log solo `utteranceUntilInterrupt`.

**Adaptador Gemini (Interactions API, docs-gemini):**

```ts
// llmAdapters/gemini.ts
const ai = new GoogleGenAI({ apiKey });
const interaction = await ai.interactions.create({
  model: input.model /* gemini-3.8-flash */,
  system_instruction: input.systemPrompt,
  input: input.history,                                      // [{role, content:[{type:'text',text}]}, function_call/function_result]
  tools: toGeminiTools(input.allowedTools),                  // [{type:'function', name, description, parameters}]
  tool_choice: { mode: 'auto' },
  generation_config: { temperature: input.temperature, max_output_tokens: 220 },
});
for (const step of interaction.steps ?? []) {
  if (step.type === 'function_call') { const r = await onToolCall(step.name, step.arguments); /* push function_result y repetir */ }
}
onToken(interaction.output_text);                            // Gemini se envía en 1–2 frases (sin streaming de tokens en Interactions v1)
```

**Structured output del resultado (post-llamada, `goal_schema`) con `gpt-5.6-luna`:**

```ts
const res = await client.responses.parse({
  model: 'gpt-5.6-luna', reasoning: { effort: 'none' }, store: false,
  input: [{ role: 'user', content: `Transcripción:\n${transcript}\n\nExtrae los campos.` }],
  text: { format: { type: 'json_schema', name: 'goal_result', schema: agent.goal_schema, strict: true } },
});
const goal = res.output_parsed;   // → voice_agent_calls.goal_result; refusal → item type 'refusal' → goal_result null
```

**Llamada saliente (`aiCall.handle`) con AMD asíncrono y status correcto (fix C-9, C4):**

```ts
const call = await twilio.calls.create({
  to: customer.phone_e164, from: callerId.e164,
  url: `${base}/api/voice/twiml/ai-agent?agentId=${agent.id}&callId=${vac.id}&token=${token}`,
  statusCallback: `${base}/api/voice/status`, statusCallbackMethod: 'POST',
  statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  machineDetection: 'DetectMessageEnd', machineDetectionTimeout: 20,
  asyncAmd: true, asyncAmdStatusCallback: `${base}/api/voice/amd`,
  record: settings.voice_recording_enabled, recordingChannels: 'dual',
  recordingStatusCallback: `${base}/api/voice/recording`, recordingStatusCallbackEvent: ['completed', 'absent'],
  timeout: settings.voice_ring_timeout_seconds ?? 25, timeLimit: agent.max_duration_seconds + 60,
});
await sb.from('calls').insert({ organization_id: orgId, provider: 'twilio', provider_call_sid: call.sid, direction: 'outbound',
  mode: 'ai_agent', from_number: callerId.e164, to_number: customer.phone_e164, customer_id, opportunity_id,
  voice_agent_id: agent.id, status: 'dialing', started_at: new Date().toISOString(), recording_enabled: !!settings.voice_recording_enabled,
  consent_given: true, cost_currency: 'USD', metadata: { voice_agent_call_id: vac.id }, duration_source: 'provider' });
```

Nota: `asyncAmd` consume 1 de los 4 forks de audio de la llamada; con ConversationRelay (que no usa Media Streams) no hay conflicto.

**ElevenAgents: crear/sincronizar agente y llamada saliente (docs-elevenlabs):**

```ts
const client = new ElevenLabsClient({ apiKey });
const created = await client.conversationalAi.agents.create({           // POST /v1/convai/agents/create
  name: `${org.id}-${agent.slug}`,
  conversation_config: {
    agent: { first_message: '{{first_message}}', language: 'es',
      prompt: { prompt: renderPromptWithDynamicVars(agent), llm: 'gpt-5.6-terra', temperature: agent.temperature,
        tool_ids: toolIds, built_in_tools: { end_call: {}, transfer_to_number: { transfers: [{ phone_number: handoffPhone, condition: 'cliente pide humano' }] } } } },
    tts: { voice_id: voice.provider_voice_id, model_id: 'eleven_flash_v2_5' },
    asr: { provider: 'scribe_realtime', quality: 'high' },
    turn: { turn_timeout: 7 },
    conversation: { max_duration_seconds: agent.max_duration_seconds },
  },
});
// tool webhook (una vez por org+tool): POST /v1/convai/tools
await client.conversationalAi.tools.create({ tool_config: { type: 'webhook', name: 'book_meeting', description: TOOL_REGISTRY.book_meeting.description,
  api_schema: { url: `${base}/api/crm/agent-tools/book_meeting`, method: 'POST', request_body_schema: TOOL_REGISTRY.book_meeting.parameters,
    request_headers: { 'X-Agent-Tools-Secret': hmacForOrg(orgId) } }, response_timeout_secs: 20, dynamic_variables: { dynamic_variable_placeholders: {} } } });
// número Twilio importado: POST /v1/convai/phone-numbers {phone_number, label, sid, token, provider:'twilio', agent_id}
// llamada: POST /v1/convai/twilio/outbound-call
const r = await client.conversationalAi.twilio.outboundCall({ agent_id: agent.external_agent_id, agent_phone_number_id: phoneNumberId,
  to_number: customer.phone_e164, conversation_initiation_client_data: { dynamic_variables: contextToDynamicVariables(ctx) } });
// r → {success, conversation_id, callSid} → voice_agent_calls.external_conversation_id
```

Campañas masivas con este motor: `POST /v1/convai/batch-calling/submit {call_name, agent_id, agent_phone_number_id, recipients[{phone_number, id, dynamic_variables}], scheduled_time_unix}`.

**Voz clonada IVC + preview:**

```ts
const voice = await client.voices.ivc.create({                            // POST /v1/voices/add (multipart)
  name: `${user.first_name} ${user.last_name} (${org.name})`, files: [sampleFile],
  remove_background_noise: true, description: `IVC ${userId} org ${orgId}`, labels: JSON.stringify({ org: String(orgId), user: userId }) });
// voice → { voice_id, requires_verification }
const audio = await client.textToSpeech.stream(voice.voice_id, { text, modelId: 'eleven_flash_v2_5', outputFormat: 'mp3_22050_32',
  languageCode: 'es', voiceSettings: { stability: 0.5, similarityBoost: 0.75, speed: 1.0, useSpeakerBoost: true } });
```

**Tool `book_meeting` (contrato y efecto):**

```ts
export const bookMeetingDef: ToolDef = {
  name: 'book_meeting', description: 'Reserva una reunión con el vendedor en un horario confirmado por el cliente.',
  parameters: { type: 'object', additionalProperties: false, required: ['start_iso', 'duration_min', 'channel', 'attendee_email'],
    properties: { start_iso: { type: 'string', description: 'Inicio ISO 8601 con offset, confirmado en voz alta' },
      duration_min: { type: 'integer', enum: [15, 30, 45, 60] }, channel: { type: 'string', enum: ['video', 'phone', 'in_person'] },
      attendee_email: { type: ['string', 'null'] } } },
  async run(sb, ctx, a) {
    const eventId = await sb.rpc('fn_book_meeting_slot', { p_org_id: ctx.orgId, p_assigned_to: ctx.ownerUserId, p_customer_id: ctx.customerId,
      p_title: `Reunión: ${ctx.opportunity?.name ?? ctx.customer.display_name}`, p_start: a.start_iso, p_end: addMinutes(a.start_iso, a.duration_min),
      p_timezone: ctx.customer.timezone, p_metadata: { opportunity_id: ctx.opportunityId, channel: a.channel, voice_agent_call_id: ctx.vacId } });
    if (eventId.error?.message?.includes('SLOT_TAKEN')) return { ok: false, reason: 'slot_taken', alternatives: await freeSlots(sb, ctx, 3) };
    await sb.rpc('fn_enqueue_job', { p_org: ctx.orgId, p_kind: 'email', p_payload: { kind: 'meeting_invite', calendar_event_id: eventId.data, ics: true }, p_run_at: new Date().toISOString(), p_dedupe_key: `meeting_invite:${eventId.data}` });        // F7 (adjunto .ics vía attachments)
    await sb.rpc('fn_enqueue_job', { p_org: ctx.orgId, p_kind: 'whatsapp', p_payload: { template: 'confirmacion_reunion', calendar_event_id: eventId.data }, p_run_at: new Date().toISOString(), p_dedupe_key: `meeting_wa:${eventId.data}` });  // F16 utility HSM
    return { ok: true, calendar_event_id: eventId.data, start_local: fmtLocal(a.start_iso, ctx.customer.timezone) };
  } };
```

Antes de proponer, el agente llama a `get_customer_context` que incluye `available_slots` (de `fn_agent_free_slots` con `business_hours` del vendedor: `user_comm_preferences.business_hours` o el del agente).

### 4.6 Contrato de herramientas (`TOOL_REGISTRY`)

Todas org-scoped por `ctx` (nunca por argumento), validadas con zod antes de ejecutar, registradas en `voice_agent_tool_runs` (`status='executed'` para consultas; `'suggested'` si `action_policy='suggest'` y la tool es mutante; `'applied'` cuando el humano aprueba). En modo `suggest`, la tool devuelve `{ok:true, deferred:true}` y el agente le dice al cliente "lo dejo registrado para que {{user.first_name}} lo confirme".

| Tool | Parámetros (JSON Schema, `additionalProperties:false`) | Efecto en BD | Mutante |
|---|---|---|---|
| `get_customer_context` | `{}` | lee; devuelve resumen compacto (cliente, oportunidad, etapa + `next_stages`, productos, cotización, facturas vencidas, `available_slots`, objeciones) | no |
| `move_opportunity_stage` | `{target_stage_name: string, reason: string}` (nombre, no id: el LLM ve nombres) | resuelve `stage_id` dentro del `pipeline_id` de la opp; `evaluateStageGate(sb, orgId, {opportunityId, targetStageId})`; si `allowed` → `opportunities.update({stage_id})` (dispara `fn_log_stage_change` + `crm_events` F8); si no → `{ok:false, missing[]}` | sí |
| `create_task` | `{title, due_in_hours: int, priority: 'low'|'med'|'high', assign_to: 'owner'|'me'}` | `tasks.insert({organization_id, title, due_date, priority, status:'open', assigned_to, related_to_id: opportunityId, related_to_type:'opportunity', customer_id, created_by: null, type:'followup'})` (fix C-3) | sí |
| `book_meeting` | ver §4.5 | `fn_book_meeting_slot` + jobs email ICS + WhatsApp utility | sí |
| `send_followup_message` | `{channel: 'whatsapp'|'email'|'sms', intent: string, include_payment_link: bool}` | genera texto con luna y encola `outbound_jobs` del canal (F7/F16/SMS); respeta `fn_can_contact` y ventana 24h (fuera → HSM) | sí |
| `send_payment_link` | `{invoice_id?: uuid, amount?: number, description?: string, channel: 'whatsapp'|'email'|'sms'}` | usa `paymentService` (Stripe Payment Link / Wompi link existentes en `integrations/stripe`, `integrations/wompi`) por org; guarda en `activities.metadata.payment_link_url`; envía por canal | sí |
| `log_objection` | `{category: enum(objections.category de la org), notes: string}` | `opportunity_objections.insert({objection_id (match por category/title), detected_by:'ai_agent', notes})` + `opportunities.objection_id` | sí (auto siempre, es registro) |
| `update_opportunity_field` | `{field: enum ALLOWED_FIELDS, value}` con `ALLOWED_FIELDS = ['next_contact_at','recontact_at','contact_result','temperature','expected_close_date','discovery_data.*','win_data.*']` | `opportunities.update` solo en allow-list; `discovery_data` con merge JSON | sí |
| `transfer_to_human` | `{reason: string}` | `voice_agent_calls.status='transferred'`, `handoff_to_user_id`; el handler envía `end{handoffData}` | sí (auto siempre) |
| `end_call` | `{outcome: enum('goal_met','callback','not_interested','no_decision','wrong_number','voicemail'), next_step: string, summary: string}` | `voice_agent_calls.outcome`, `goal_result.partial`; handler envía última frase + `end` | sí (auto siempre) |
| `schedule_callback` | `{at_iso: string}` | `opportunities.next_contact_at` + `tasks` de llamada al vendedor + re-encola orquestación `run_at=at_iso` | sí |
| `log_consent_opt_out` | `{channel: 'voice'|'whatsapp'|'email'|'all'}` | `contact_consents(status='opted_out', source:'ai_agent', evidence{vacId, turn})` (F0) | sí (auto siempre) |

### 4.7 Variables de entorno

| Variable | Dónde | Uso |
|---|---|---|
| `WS_SERVER_URL` (existe) | Vercel | `wss://go-admin-erp-production.up.railway.app` sin path |
| `WS_SESSION_SECRET` (creada en F0) | Vercel + Railway | HMAC del token por sesión en `<Parameter>` (`wsAuth.ts`) |
| `AGENT_TOOLS_SECRET` (NUEVA) | Vercel | HMAC por org para `/api/crm/agent-tools/*` |
| `ELEVENLABS_API_KEY` (existe), `ELEVENLABS_WEBHOOK_SECRET` (NUEVA) | Vercel + Railway | fallback global; por org en `provider_configs(category='tts'|'voice')` cifrado |
| `OPENAI_API_KEY`, `GEMINI_API_KEY` (existen) | Railway también | fallback del registry; `OPENAI_REALTIME_MODEL` y `OPENAI_CHAT_MODEL` se **eliminan** |
| `TWILIO_MASTER_AUTH_TOKEN`, `TWILIO_WEBHOOK_BASE_URL` (existen; F0 fija semántica = origin) | Vercel + Railway | firma de webhooks/upgrade |
| `CRON_SECRET` (existe) | Vercel | runner de jobs |
| `SUPABASE_SERVICE_ROLE_KEY` (existe) | Railway | ws-server escribe con service role pero SIEMPRE filtrando por `organization_id` del token |

### 4.8 Dependencias npm

`@elevenlabs/elevenlabs-js@^2.67.0` (NUEVA), `openai@^6.15` (mantener 6.x mientras Railway sea Node 20; `responses.create/parse` disponibles), `@google/genai@^2.21.0` (subir desde ^2.20), `twilio@^6.1` (F0, Node ≥20), `ws@^8.19` (existe), `zod@^3.25` (existe), `ics@^3.8` (NUEVA, generación ICS para `book_meeting`; F7 la comparte). Dockerfile del ws-server (F0) debe copiar `src/lib/services/crm/**`, `src/lib/services/integrations/elevenlabs/**`, `package.json` + `package-lock.json` y usar `npm ci --omit=dev`.

### 4.9 Estructura del ws-server

```
ws-server.ts                                   upgrade: valida X-Twilio-Signature (F0) → handleConversationRelayConnection
src/lib/services/integrations/twilio/voiceAgent/
  relaySession.ts        RelaySession: setup/onPrompt/onInterrupt/onDtmf/end; log de turnos → voice_agent_calls.conversation_log (append por turno, JSONB)
  wsAuth.ts              (F0) issueWsSessionToken / verifyWsSessionToken (HMAC-SHA256, exp 15 min); esta fase añade one-time por callId
  guardrails.ts          límites, frases prohibidas (regex normalizado sin acentos), detector de enojo (2 turnos con sentimiento negativo por heurística de léxico + LLM luna opcional)
  llmAdapters/openai.ts  Responses API streaming + tool loop
  llmAdapters/gemini.ts  Interactions API + function calling
  llmAdapters/index.ts   getAdapter(agent.llm_provider) + credenciales del registry por org (providerRegistry.resolve(orgId,'llm'))
  tools/                 re-exporta src/lib/services/crm/agentTools (mismo código en Next y Railway)
```

Cada sesión guarda en memoria `history` (items del LLM) y en BD solo el log legible (`{role, text, at, tool?}`) cada turno; al `end` o `close` → `endSession()` liquida créditos (`settleCredits`), cierra `voice_agent_calls` si Twilio no llamó al status (defensa) y encola `analyze` si `duration ≥ 20s`.

---

## 5. UI

### 5.1 Rutas

| Ruta | Archivo | Propósito |
|---|---|---|
| `/app/crm/agentes-ia` | `src/app/app/crm/agentes-ia/page.tsx` | Lista + dashboard de uso/costos + botón "Nuevo agente" |
| `/app/crm/agentes-ia/nuevo` | `src/app/app/crm/agentes-ia/nuevo/page.tsx` | Wizard 3 pasos: propósito (catálogo) → producto/objetivo → voz; crea y redirige al editor |
| `/app/crm/agentes-ia/[id]` | `src/app/app/crm/agentes-ia/[id]/page.tsx` | Editor con tabs |
| `/app/crm/agentes-ia/voces` | `src/app/app/crm/agentes-ia/voces/page.tsx` | Mis voces (clonar, preview, default) |
| `/app/configuracion?modulo=crm` tab IA | (D5, F0/F3) | Proveedores, modelos, presupuesto, política `auto|suggest` por defecto |

Entrada de nav: `src/components/app-layout/…` grupo CRM → "Agentes IA" (icono `Bot`), junto a Llamadas/Leads (F3/F9).

### 5.2 Componentes (todos ≤300 líneas; `src/components/crm/agentes-ia/`)

| Archivo | Props | Estado/hooks | Servicios |
|---|---|---|---|
| `AgentList.tsx` | `{agents: VoiceAgentRow[], onSelect}` | filtro por propósito/canal/estado; `useMemo` | `GET /api/crm/voice-agents` |
| `AgentUsageDashboard.tsx` | `{range}` | 4 KPI tiles (minutos, llamadas, mensajes, costo) + sparkline por día | `GET /api/crm/ai-usage` |
| `AgentEditor.tsx` | `{agentId}` | `Tabs` controladas por `?tab=`; formulario `react-hook-form` + zod compartido con la API; autosave con `debounce 800ms` y toast | PATCH `/api/crm/voice-agents/[id]` |
| `tabs/PurposeTab.tsx` | `{form}` | catálogo (cards con `purpose_type`, descripción, canal sugerido), objetivo (`success_criteria`), `goal_schema` editor tipo "campos a capturar" (nombre, tipo, obligatorio) que serializa a JSON Schema estricto, selector `product_id` (Command con búsqueda en `products`) + `offer` (precio, gancho, beneficios ×3) | `GET voice-agent-templates`, `GET /api/products?q=` |
| `tabs/ScriptTab.tsx` | `{form}` | `system_prompt` (textarea con insertador de variables `{{…}}` y contador de tokens estimado), `first_message`, `voicemail_message`, `knowledge` (FAQ lista + objeciones con respuesta sugerida, importar desde `objections` de la org) | — |
| `tabs/VoiceTab.tsx` | `{form}` | "Mis voces clonadas" (radio cards con botón ▶ preview), catálogo ElevenLabs (lista virtualizada, filtro por idioma `es`), sliders `speed 0.7–1.2`, `stability`, `similarity_boost`, preview con `first_message` renderizado | `GET /api/crm/voices`, `POST /api/crm/voices/[id]/preview` |
| `tabs/ChannelsTab.tsx` | `{form}` | `channels` (toggles), `channel_order` (lista reordenable con teclado), `orchestration.wait_hours_between_channels`, `max_attempts`, `business_hours` (días + rango + tz), `retry_policy` (no_answer/busy/voicemail) | — |
| `tabs/ToolsTab.tsx` | `{form}` | checklist de `TOOL_REGISTRY` con explicación en lenguaje llano y badge "modifica datos"; `action_policy` (auto/suggest) con explicación; `update_opportunity_field` muestra la allow-list | — |
| `tabs/GuardrailsTab.tsx` | `{form}` | `max_turns`, `max_duration_seconds`, frases prohibidas (chips), `handoff_rules` (a quién transferir: owner/usuario/número; cuándo), `identity_disclosure` (switch bloqueado en ON con tooltip legal) | — |
| `tabs/TestTab.tsx` | `{agentId}` | `AgentSimulator` (chat con burbujas, tool calls como tarjetas "haría: crear tarea…", `goal_progress` barra) + "Llámame a mí" (`POST call-me`, muestra estado en vivo por realtime en `voice_agent_calls`) | `POST test`, `POST call-me` |
| `tabs/HistoryTab.tsx` | `{agentId}` | tabla paginada (fecha, cliente, canal, estado, outcome, duración, costo, tools) → `AgentCallDetailSheet` | `GET history` |
| `AgentCallDetailSheet.tsx` | `{voiceAgentCallId}` | `Sheet` con `CallPlayer` (F3) + transcripción por turnos (`conversation_log` o `call_transcript_segments`), resultado (`goal_result` como pares clave/valor), tool runs con botones Aplicar/Rechazar cuando `status='suggested'`, costo desglosado | `PATCH /api/crm/voice-agents/tool-runs/[id]` (NUEVO: `{action:'apply'|'reject'}`) |
| `AIAgentDialog.tsx` (`src/components/crm/shared/`) | `{opportunityId, customerId, open, onOpenChange}` | selector de agente (solo `is_active`), resumen del guion (`first_message` + propósito + canales), "Lanzar ahora" / "Programar" (DateTimePicker en tz del cliente), aviso de DNC/horario/créditos antes de confirmar | `POST dispatch` |
| `StageAgentPanel.tsx` (tab "Agente IA" en `StageConfigDialog.tsx`) | `{stageId}` | lista de `stage_agents` de la etapa + formulario (agente, `trigger_on`, `delay_minutes`, `channel_order`, `max_attempts`, `config.no_response_days`) | `GET/POST /api/crm/stage-agents` |
| `VoiceCloneDialog.tsx` | `{open, onDone}` | pasos: 1) guion sugerido (60–90 s) + grabador (`MediaRecorder`, `audio/webm;codecs=opus`, medidor de nivel, mínimo 30 s, ideal 90 s); 2) consentimiento: lee en voz alta y graba el texto legal "Yo, {{nombre}}, autorizo a {{org}} a clonar mi voz…" + checkbox; 3) subir → progreso → preview | `POST /api/crm/voices/clone` |
| `AiCallEntry.tsx` (`src/components/crm/timeline/`, F9) | `{entry: TimelineEntry}` | tarjeta compacta: icono Bot, "Agente {{name}} llamó (3:12) · Resultado: reunión agendada", chips de tools aplicadas, botón "Ver conversación" → `AgentCallDetailSheet` | — |

`StageConfigDialog.tsx` (288 L hoy, sin tabs) pasa a `Tabs`: General (formulario actual) | Criterios de salida (F2) | Automatización (F8) | Agente IA (esta fase). Se divide en `StageConfigDialog.tsx` (shell ≤150 L) + `StageGeneralForm.tsx`.

### 5.3 Flujos de usuario

**A. Crear "Vendedor de Plan Premium" con mi voz**
1. CRM → Agentes IA → "Nuevo agente" → card "Vender producto" → Siguiente.
2. Producto: buscar "Plan Premium" → precio y gancho se precargan desde `products` (+ `offer.hook` editable) → objetivo: "enviar link de pago o agendar demo" → Siguiente.
3. Voz: "Clonar mi voz" → `VoiceCloneDialog` (graba guion 90 s, graba consentimiento, sube) → aparece "Mi voz (Juan)" seleccionada → ▶ preview del `first_message` → Crear.
4. Editor: tab Herramientas: marcar `send_payment_link`, `book_meeting`, `log_objection`; política "Sugerir (yo apruebo)". Tab Canales: WhatsApp → Voz → Email, esperar 6 h. Guardar (autosave).
5. Tab Pruebas: chat "no me interesa, es caro" → el agente responde con la objeción de la biblioteca y sugiere `log_objection(category:'precio')` → "Llámame a mí" → suena mi celular, hablo 1 min → aparece en Historial con transcripción y costo.

**B. Asignar por etapa**
1. Pipeline → engranaje de la etapa "Propuesta" → tab "Agente IA" → "Añadir": agente "Seguimiento de propuesta", `al entrar`, `esperar 30 min`, orden WhatsApp → Voz → Email, `máx 3 intentos` → Guardar.
2. Mover una oportunidad a "Propuesta": en 30 min llega WhatsApp al cliente; si responde, la conversación sigue en la bandeja con el prompt del agente (badge "IA · Seguimiento de propuesta"); si no responde en 6 h y es horario hábil del cliente, llama; al terminar, aparece `AiCallEntry` en el timeline con "Objeción: precio · Tarea sugerida: enviar comparativo".

**C. Lanzar manual desde la oportunidad**
`QuickActionsBar` → Llamar ▾ → "Agente IA" → `AIAgentDialog` → elegir agente → ver guion → "Lanzar ahora" → toast "Encolado; te avisaré al terminar" → notificación (`fn_create_org_notification`) al finalizar con el resumen.

### 5.4 Wireframes ASCII

```
┌─ /app/crm/agentes-ia ─────────────────────────────────────────────────────────────────┐
│ Agentes IA                                     [Mis voces]  [+ Nuevo agente]           │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                                     │
│ │ 312 min  │ │ 87 llam. │ │ 140 msgs │ │ $41.20   │  ▁▂▃▅▆▇ últimos 30 días              │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                                     │
│ Filtro: [Propósito ▾] [Canal ▾] [Estado ▾]                                              │
│ Nombre                     Propósito         Canales       Etapas   Uso 30d   Estado    │
│ ● Vendedor Plan Premium    Vender producto   WA·Voz·Email  2        120 min   Activo    │
│ ● Agendador de demos       Agendar reunión   WA·Voz        1         64 min   Activo    │
│ ○ Cobranza amable          Cobrar            WA·Voz·Email  0          0 min   Borrador  │
└───────────────────────────────────────────────────────────────────────────────────────┘

┌─ Editor: Vendedor Plan Premium ───────────────────────────────────────────────────────┐
│ [Propósito] [Guion] [Voz] [Canales] [Herramientas] [Guardarraíles] [Pruebas] [Historial] │
│ ── Voz ──                                                                              │
│ Mis voces:  (●) Juan Pérez · clonada · consentimiento 2026-09-08  [▶ Escuchar]           │
│             ( ) Catálogo ElevenLabs: [Buscar…] es-MX Andrea, es-US Mateo…              │
│ Velocidad [====●====] 1.0   Estabilidad [===●=====] 0.5   Similitud [======●==] 0.75   │
│ Preview: "Hola Laura, soy el asistente virtual de Acme…"  [▶ Reproducir]  ≈ 0.4 créditos│
└───────────────────────────────────────────────────────────────────────────────────────┘

┌─ Pruebas ─────────────────────────────────────────────────────────────────────────────┐
│ Contexto: [Oportunidad: Acme – Plan Premium ▾]     Objetivo: ▓▓▓▓░░░░ 2/5 campos       │
│ 🤖 Hola Laura, soy el asistente virtual de Acme; te llamo por el Plan Premium…          │
│ 🧑 está muy caro                                                                        │
│ 🤖 Entiendo. Comparado con lo que pagas hoy, el plan incluye…  ┌ haría: log_objection ┐ │
│                                                                 │ category: precio     │ │
│ [Escribe como el cliente…                              ] [Enviar]                        │
│ ─────────────────────────────────  [📞 Llámame a mí (+57 300…)]  ≈ $0.12/min            │
└───────────────────────────────────────────────────────────────────────────────────────┘

┌─ StageConfigDialog › Agente IA ───────────────────────────────────────────────────────┐
│ Etapa: Propuesta                                                                       │
│ ┌ Seguimiento de propuesta ─ al entrar · espera 30 min · WA→Voz→Email · máx 3 ─ [✎][🗑] │
│ [+ Asignar agente]  Agente [▾]  Cuándo [al entrar ▾]  Espera [30] min  Intentos [3]     │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.5 Estados vacíos, carga y error
- Sin agentes: ilustración + "Crea tu primer agente desde una plantilla" + 3 cards sugeridas (Agendar reunión, Vender producto, Seguimiento de propuesta).
- Sin voces: "Aún no tienes una voz clonada. Graba 90 segundos y tu agente hablará con tu voz" + botón; explica el consentimiento.
- Sin créditos (402): banner en Pruebas/Dispatch con enlace a Créditos.
- Preview fallando (502 ElevenLabs): toast "No pudimos generar el audio; reintenta" + fallback a voz Polly.Mia-Neural en el TwiML si la voz está `requires_verification=true`.
- Historial: skeleton de 6 filas; error → `Alert` con "Reintentar".

### 5.6 Accesibilidad
- Todas las tabs con `role="tablist"`, foco y flechas; sliders con `aria-valuetext` ("velocidad 1.0"); grabador con `aria-live="polite"` para "grabando 00:32".
- Simulador: región `aria-live` para respuestas del agente; tool cards con `aria-label="Acción sugerida: crear tarea"`.
- Botones ▶ preview con `aria-pressed` y texto alternativo; nunca solo icono.
- Contraste AA en badges de estado (usar variants `success/warning` de `badge`).

### 5.7 Motion (sobrio, `motion/react`)
- Aparición de burbujas del simulador: `initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}` 150 ms.
- Indicador "en llamada" en `call-me`: pulso `scale [1,1.06,1]` 1.5 s, respeta `prefers-reduced-motion` (MotionProvider ya lo hace).
- Tabs: sin transiciones de contenido (evita layout shift); `AnimatePresence` solo en `Sheet`.

### 5.8 Responsive / cross-platform
- Editor en ≤768 px: tabs en `ScrollArea` horizontal; formularios a una columna.
- `VoiceCloneDialog` requiere `MediaRecorder` + micrófono: en Capacitor (F15) se necesita `RECORD_AUDIO` / `NSMicrophoneUsageDescription`; en Electron funciona; si no hay permiso, ofrecer subir archivo `.m4a/.wav`.
- "Llámame a mí" es PSTN: funciona en cualquier plataforma.

---

## 6. Integración con proveedores

### 6.1 Twilio ConversationRelay
- Requiere aceptar el AI/ML Addendum en Console; `wss://` obligatorio; `$0.07/min` + minutos de voz (CO móvil `$0.0377/min`) + AMD `$0.0075/llamada`.
- Atributos usados: `url, language, ttsProvider, voice, transcriptionProvider, speechModel, welcomeGreeting, welcomeGreetingInterruptible, interruptible, interruptSensitivity, dtmfDetection, reportInputDuringAgentSpeech, hints, elevenlabsTextNormalization`; hijos `<Parameter>`. Action de `<Connect>` recibe `SessionId, SessionStatus, SessionDuration, HandoffData, ErrorCode`.
- Voz ElevenLabs en CR: `voice="{voiceId}-{model}-{speed}_{stability}_{similarity}"`, modelo `flash_v2_5`. **Gotcha:** verificar en el entorno de prueba que CR resuelve un `voice_id` de voz clonada de la cuenta propia (las voces IVC son privadas de la cuenta ElevenLabs). Si CR solo acepta voces de la biblioteca compartida, el fallback es: (a) usar `engine='elevenlabs_agent'` para voz clonada, o (b) compartir la voz en la Voice Library. Se decide en el spike del PR-1 (§12) y se documenta en `ANEXO-B`.
- STT: `Deepgram nova-3-general` con `hints` → keyterms (nombres de producto/org mejoran el reconocimiento).
- `es-CO` no existe: `language="es-MX"` (o `es-US`); `<Say>` de fallback con `Polly.Mia-Neural`.

### 6.2 ElevenLabs
- SDK `@elevenlabs/elevenlabs-js@2.67.0` (`elevenlabs` deprecado); header `xi-api-key`; plan mínimo **Starter** para IVC; PVC desde Creator (3 slots) documentado como opción manual (30–180 min de audio + captcha de verificación; no automatizado en esta fase).
- TTS: `eleven_flash_v2_5` (≈75 ms, 32 idiomas, 0.5 crédito/char; `$0.05/1k chars` PAYG). `eleven_turbo_v2_5/v2` deprecados. Preview: `POST /v1/text-to-speech/{voice_id}` con `output_format=mp3_22050_32`.
- IVC: `POST /v1/voices/add` multipart (`name, files[], remove_background_noise, description, labels`) → `{voice_id, requires_verification}`. Regla D9: **solo la propia voz del usuario**; `voices.owner_user_id = auth.uid()` obligatorio y consentimiento grabado (`consent_path`). Borrar: `DELETE /v1/voices/{voice_id}`.
- ElevenAgents: `POST /v1/convai/agents/create` (`tts.model_id` debe ser `eleven_flash_v2_5` porque el default `eleven_flash_v2` es solo inglés; `agent.language 'es'`), tools `POST /v1/convai/tools` (webhook con `request_headers`), `POST /v1/convai/phone-numbers` (`provider:'twilio'`, `sid`, `token` de la (sub)cuenta), `POST /v1/convai/twilio/outbound-call`, `POST /v1/convai/batch-calling/submit`. Webhooks `post_call_transcription`, `post_call_audio`, `call_initiation_failure`, verificación `client.webhooks.constructEvent(rawBody, header, secret)` sobre body crudo. Precio `$0.08/min` (LLM y Twilio aparte); concurrencia por plan (Creator 10).
- Límites: concurrencia TTS Flash por plan (Starter 6); rate limits no publicados → reintentos con backoff en preview.

### 6.3 OpenAI / Gemini
- OpenAI `gpt-5.6-terra` (conversación; `$2/$12` por 1M, cached `$0.20`) por defecto; `gpt-5.6-luna` (`$0.20/$1.20`, `reasoning.effort:'none'`) para simulador, borradores de email/WhatsApp, `goal_result`, voicemail. Responses API con `store:false`, `instructions` para el system prompt (aprovecha prompt caching ≥1024 tokens), tools `{type:'function', name, description, parameters}` con `strict:true`. Node 20 → `openai@6.x` (7.x exige Node 22).
- Gemini `gemini-3.8-flash` (`$0.75/$3.75` promo hasta 2026-12-31; presupuestar `$1.50/$7.50`) vía `@google/genai@2.21` Interactions API (`client.interactions.create`, `tools`, `tool_choice`, `response_format` JSON con schema subset). Sin streaming de tokens en Interactions v1 → se envía por frases completas; latencia percibida ligeramente mayor (documentado en la comparativa).

### 6.4 Comparativa de motores

| Motor | Latencia voz-a-voz | Calidad de voz | Costo aprox. USD/min (CO móvil) | Control | Esfuerzo | Estado |
|---|---|---|---|---|---|---|
| `conversation_relay` (primario) | ~600–900 ms (Deepgram + LLM streaming + Flash) | ElevenLabs Flash (clonada) | 0.07 CR + 0.0377 PSTN + ~0.01 LLM terra + 0.0075/llamada AMD ≈ **0.12** | total (prompt, tools, guardrails, logs en nuestro WS) | medio (reescribir handler) | GA |
| `elevenlabs_agent` (secundario) | ~500–800 ms (stack integrado) | ElevenLabs (clonada, cuenta propia) | 0.08 Agents + 0.0377 PSTN + LLM pass-through ~0.01 ≈ **0.13** | medio (tools por webhook, prompt sincronizado, análisis propio de EL) | bajo-medio | GA |
| `openai_realtime` (experimental) | ~400 ms | voces OpenAI (no clonadas; `marin/cedar`, optimizadas inglés) | ≈0.10 realtime-2.1 + 0.0377 ≈ 0.14 | alto | alto (SIP Connector `sip:$PROJECT_ID@sip.api.openai.com` + Twilio Elastic SIP Trunking; webhook `realtime.call.incoming`) | fuera del path crítico |
| `gemini_live` (experimental) | ~500 ms | voces Gemini (no clonadas) | ≈0.023 audio + 0.0377 | alto | muy alto (sin Twilio nativo; puente Media Streams mulaw 8k ↔ PCM 16k/24k a mano; Preview) | fuera del path crítico |

Cuándo usar cada uno: CR cuando se quiere control fino, logs por turno y política `suggest`; ElevenAgents cuando la voz clonada no resuelva en CR o para campañas batch grandes con concurrencia de ElevenLabs; los experimentales solo con feature flag `provider_configs.settings.experimental=true`.

### 6.5 Meta WhatsApp (vía F16)
El agente nunca llama a Graph API directamente: inserta en `messages` (shape vivo, `metadata.source='agent'`, `related_opportunity_id`) y F16 despacha (`trg_channel_dispatch` → Edge `channel-dispatch`); `trg_messages_crm_activity` (F16) crea la activity `whatsapp`. Fuera de ventana 24h usa plantillas HSM `utility` de apertura (`agente_apertura_{purpose}`, creadas/aprobadas en F16) y las existentes `confirmacion_reunion`, `seguimiento_propuesta`, `recordatorio_pago`; dentro de ventana, texto libre o `interactive list` con slots para `book_meeting`. Rate: 1 msg/6 s por wa_id, error `131049` → no reintentar 24 h. Requisito para F16: emitir `emitCrmEvent('whatsapp.inbound')` en el webhook entrante (lo consumen la orquestación §2.3 y F8).

---

## 7. Multi-tenant y seguridad

Checklist por endpoint (cierra: C-E, C-F, C-G/C11, C-13 (robustez), C-14, C-18, C22, C-1, C-9, C4, IDOR de tools):

- [ ] `voice-agents/*`, `stage-agents/*`, `voices/*`, `ai-usage`: `getServerOrgContext()`; toda query con `.eq('organization_id', ctx.organizationId)`; `voice_ref_id` y `product_id` validados como de la misma org (query previa); `stage_id` validado vía `stages → pipelines.organization_id`.
- [ ] `dispatch`: `opportunityId/customerIds` verificados en la org; DNC con `fn_can_contact`; 409 si ya hay orquestación `queued|running` para la misma opp+agente.
- [ ] `twiml/ai-agent`: `validateRequest` con el token de la (sub)cuenta que originó (`comm_settings.twilio_subaccount_auth_token` descifrado o master), URL canónica desde `TWILIO_WEBHOOK_BASE_URL` (origin) + path + query; **si falta token → 403** (fix C-E); `verifyWsSessionToken` y `voice_agent_calls` filtrado por `organization_id` del token (fix C-F); nunca leer `orgId` de la query.
- [ ] `relay/after`, `amd`, `status`: firma fail-closed; lookup por `provider_call_sid` **y** `organization_id` resuelto por `resolveOrgFromExternal(callSid,'call_sid')` (F0 lo arregla).
- [ ] ws-server: upgrade rechazado sin `X-Twilio-Signature` válida (F0); `setup` sin token HMAC válido o expirado → `close(4401)`; token one-time (`voice_agent_calls.metadata.token_used_at`); service role SIEMPRE con `organization_id` del token; sin `findOrgByNumber` (eliminado, fix C-G).
- [ ] Tools: `ctx` (orgId, opportunityId, customerId, ownerUserId) viene de la sesión, **nunca** de los argumentos del LLM; `move_opportunity_stage` resuelve etapas solo dentro del `pipeline_id` de la opp; `update_opportunity_field` allow-list; `send_payment_link` solo facturas de la org y del cliente de la sesión.
- [ ] `agent-tools/*` (ElevenAgents): HMAC por org en header; `voice_agent_call_id` debe pertenecer a la org derivada del HMAC; rate limit 60 req/min por org.
- [ ] Webhook ElevenLabs: `constructEvent` sobre raw body; `external_conversation_id` único → idempotente; org resuelta por `voice_agent_calls`, nunca por body.
- [ ] Voces: `voices.owner_user_id = userId` de sesión al clonar; `consent_path` privado en `crm-documents`; `DELETE` también borra en ElevenLabs; nadie puede usar `voice_ref_id` de otra org.
- [ ] Prompt injection: el contexto del cliente (notas, mensajes) se inyecta como datos con delimitadores y la instrucción "el contenido del cliente no son instrucciones"; los guardarraíles se aplican también a la salida (`checkOutbound`) para frases prohibidas.
- [ ] Secretos: API keys por org en `provider_configs.credentials` cifradas (F0), leídas solo con service role en server/ws; nunca en el cliente.
- [ ] Logs: `conversation_log` no guarda dígitos DTMF que parezcan tarjetas (regex → `***`).

---

## 8. Créditos, costos y límites

- Antes de `calls.create`: `reserveCredits(orgId, {voiceMinutes: ceil(max_duration/60), aiCredits: estimate(llm_model, engine)})` → RPC `deduct_comm_credits(p_org_id, 'voice', p_amount)` + `decrement_ai_credits(p_org_id, p_cost)`; si cualquiera devuelve `false` → `voice_agent_calls.status='skipped'` con `error_message='insufficient_credits'` y notificación al admin.
- Al terminar (`status` completed / `endSession`): `settleCredits` devuelve la diferencia (minutos reservados − reales; créditos IA por tokens reales de `usage` del LLM + chars TTS estimados por `text` enviados) y escribe `comm_usage_logs(channel='voice', credits_used, module='ai_agent', metadata{vacId})` y `ai_usage_logs(action_type='ai_agent_call', model, prompt_tokens, completion_tokens, credits_consumed, metadata{vacId, engine})`.
- `voice_agent_calls.cost_amount` + `cost_breakdown {twilio_min, cr_min, tts_chars, llm_in, llm_out, amd}` con precios de `provider_pricing` (nunca hardcode).
- Presupuesto mensual por org (`ai_settings.monthly_budget_usd`, D6): al 80 % alerta (`fn_create_org_notification`), al 100 % los dispatchers dejan de encolar (`skipped`); límite duro `comm_settings.voice_max_concurrent_calls` (default 3) y `max_calls_per_day` por agente (`orchestration.max_calls_per_day`, default 100).
- Simulador y preview de voz debitan créditos IA reales (luna ≈ 1 crédito/turno; preview ≈ 0.4 créditos/300 chars) para evitar abuso.
- Estimación mostrada en UI: ConversationRelay ≈ `$0.12/min`, ElevenAgents ≈ `$0.13/min`; WhatsApp del agente: utility ≈ `$0.0008` (no verificado) + LLM `< $0.001`; email: `$0` (dentro del plan Resend) + LLM.

---

## 9. Pruebas

### 9.1 Unitarias (`src/lib/services/__tests__/`)
- `agentTools.registry.test.ts`: cada tool valida args con zod; tool fuera de allow-list → `{ok:false, error:'not_allowed'}`; `suggest` no escribe.
- `moveOpportunityStage.test.ts`: gate rechaza → no update; nombre de etapa de otro pipeline → `unknown_stage`.
- `llmAdapters.openai.test.ts` (mock `responses.create`): historial con `function_call` + `function_call_output` bien formado; máximo 3 hops; streaming por frases produce `last:false/true` correctos.
- `guardrails.test.ts` (extiende `src/__tests__/guardrails.test.ts`): frases prohibidas normalizadas; `max_turns` → `end`; 2 turnos de enojo → handoff.
- `wsAuth.test.ts` (F0, extender): token reutilizado (one-time) u otro `callId` → inválido.
- `agentOrchestrator.test.ts`: orden `['whatsapp','voice','email']`, `wait_hours`, exit al responder, `max_attempts`, `dedupe_key` estable.
- `voiceService.test.ts`: `resolveVoiceForAgent` → `"{id}-flash_v2_5-1.0_0.5_0.75"`; sin voz → fallback Polly.
- `agentCostService.test.ts`: reserva/liquidación con `provider_pricing` mock.

### 9.2 Integración (mocks con payloads reales)
- `twiml/ai-agent`: firma válida + token válido → TwiML con `ttsProvider="ElevenLabs"`, `voice`, `welcomeGreeting`; token de otra org → 403; agente inactivo → `<Say>` + `<Hangup/>`.
- `relay/after` con `HandoffData='{"reason":"transfer"}'` → `<Dial><Number>` al owner; sin número → `<Hangup/>` + task.
- `/api/voice/status` con `CallStatus=completed, AnsweredBy=machine_end_beep` → `voicemail` y reintento programado; `completed` humano → activity `ai_call` + job `analyze`.
- Webhook ElevenLabs `post_call_transcription` (payload de docs) con firma válida → transcript + `goal_result`; firma inválida → 401; repetido → 200 sin duplicar.
- ws-server: `setup` sin token → cierre 4401; `prompt` → `text` streaming (mock LLM); `interrupt` → se corta; `dtmf` con 16 dígitos → enmascarado.

### 9.3 E2E manual (org de prueba, número Twilio CO, cuenta ElevenLabs Starter)
1. Clonar mi voz (90 s) → preview suena como yo → `voices` con `consent_path`.
2. Crear "Agendador de demos" desde catálogo, tools `book_meeting`, política `auto`.
3. "Llámame a mí": acepto una hora propuesta → `calendar_events` creado, ICS en mi email, WhatsApp de confirmación, `AiCallEntry` en timeline con transcripción.
4. Asignar a etapa "Demo" con `enter` + 5 min; mover una oportunidad → WhatsApp de apertura; no responder → llamada tras `wait_hours` (poner 0.1 h en prueba) → email de cierre.
5. Decir "quiero hablar con una persona" → transferencia a mi celular; `status='transferred'`.
6. Dejar que entre a buzón → `voicemail`, mensaje corto reproducido, reintento en `retry_policy.voicemail.delay`.
7. Poner créditos en 0 → dispatch responde 402 y jobs quedan `skipped`.
8. Cambiar `llm_provider='gemini'` y repetir 3.
9. Cambiar `engine='elevenlabs_agent'` y repetir 3 (agente sincronizado, post-call webhook recibido).

### 9.4 Dry-run: 5 escenarios con transcripts esperados (simulador)
1. **Confirma demo**: "sí, ahí estaré" → `update_opportunity_field(contact_result:'confirmed')` + `end_call(goal_met)`.
2. **Pide otra fecha**: "¿puede ser el jueves?" → `get_customer_context` (slots) → propone 2 → "el jueves a las 10" → `book_meeting(start_iso jueves 10:00 tz cliente)` → confirma en voz alta.
3. **Objeción precio (sell_product)**: "está caro" → respuesta desde `knowledge.objections['precio']` → `log_objection(precio)` → ofrece link de pago o demo → `send_payment_link` si acepta.
4. **Pide humano**: turno 1 "quiero hablar con alguien" → `transfer_to_human` inmediato, sin insistir.
5. **Opt-out**: "no me llamen más" → `log_consent_opt_out(all)` → despedida → `end_call(not_interested)`.

### 9.5 Casos borde (≥10)
1. Tool falla (RPC error) → el agente dice que lo dejará anotado y crea `create_task` de respaldo. 2. Gate rechaza el movimiento → registra intención en `tool_runs(status='failed', result.missing)`. 3. Cliente cuelga en el saludo → `completed` con `duration<10s`, sin `analyze`. 4. `max_duration` alcanzado → despedida + `end`. 5. Dos dispatch simultáneos → 409 por `dedupe_key`. 6. Timezone nulo → default `America/Bogota`. 7. Voz `requires_verification=true` → fallback Polly + aviso en UI. 8. WS cae a mitad → Twilio cierra; `endSession` por `close` liquida y `status` de Twilio cierra la fila. 9. Cliente responde WhatsApp mientras la llamada está `queued` → orquestador cancela la llamada (`canceled`). 10. Token reutilizado (replay) → 4401. 11. `hints` > 20 términos → truncar. 12. Número del cliente sin E.164 → `formatE164` con `+57`; inválido → `failed` sin intentar. 13. Rate limit OpenAI 429 → reintento 1× y frase de relleno "un momento". 14. AMD `unknown` → tratar como humano.

---

## 10. Definition of Done

- [x] Migraciones aplicadas via MCP (`crm_v4_f06_01..09`, mas la del orquestador `crm_v4_f06_05_consent_membership_y_libro_inmutable`); verificacion post-migracion ejecutada dentro de `begin; … rollback;`; **0 archivos `.sql` en el repo**. Toda funcion con elevacion lleva su REVOKE y su comprobacion de pertenencia en la misma migracion (r3: verificado en vivo para las dos que escriben).
- [ ] `voice_agent_templates` con 9 plantillas globales; crear agente desde plantilla. **NO hecho en r1**: sustituido por `stage_agents.objective` + `OBJECTIVE_PLAYBOOKS` (11 guiones), que es lo que el dueno pidio.
- [x] `twiml/ai-agent` emite `ttsProvider` + `voice` (del catalogo `voices`, incluida la clonada) + `welcomeGreeting` + `transcriptionProvider`/`speechModel`; firma fail-closed verificada en vivo (`POST → 403`). ⚠️ El renderizado real de la voz en ElevenLabs **NO VERIFICADO**: la clave del entorno es el marcador de ejemplo (401).
- [x] ws-server agent-aware: lee `agentId` de los claims y de `customParameters`, valida HMAC, usa `system_prompt/first_message/llm_model/temperature/max_turns/max_duration_seconds/allowed_tools/guardrails` del agente; C-13 cerrado. El recepcionista PMS **no** se elimina: queda como respaldo del flujo entrante sin agente. `max_tokens` sale de `guardrails.max_response_tokens` desde la ronda 2 (`resolveMaxResponseTokens`, acotado 60..600).
- [x] Tool loop con OpenAI valido (historial con `tool_calls`); 11 tools contra el schema real (C-2, C-3, C-4 cerrados) y registradas en `voice_agent_tool_runs`. **Gemini como cerebro NO implementado** en r1 (`llm_provider` se lee pero solo hay adaptador OpenAI).
- [ ] `book_meeting` crea `calendar_events` (hecho, con validacion de fecha futura y duracion 15–180 min) **pero sin comprobacion de doble booking, sin ICS y sin WhatsApp utility**: pendiente para r2.
- [x] Llamada saliente: `statusCallback` a `/api/voice/ai-agent/status` (C-9 cerrado), `calls` insertado con columnas validas y los 8 NOT NULL (C4 cerrado), `machineDetection` con mapeo a `voicemail`, reintentos por `retry_policy`, DNC via `fn_can_contact`, horario del cliente por `customers.timezone` **fail-closed** (C-1 cerrado). ⚠️ No probado contra Twilio real.
- [ ] Al terminar: `conversation_log` y `duration_seconds` persistidos y `voice_agent_calls` cerrado (hecho); `action_policy` respetada (hecho). **Pendiente**: job `analyze` NO encolado y `goal_result` con structured output NO implementado. El handler `ai_call` **si** esta registrado (r1, orquestador) y desde la ronda 2 existe el productor; la activity `ai_call` de cierre la crea el trigger de F3 sobre `calls`.
- [ ] Orquestacion multicanal. En r1 solo el canal **voz**: `stage_agents` guarda `trigger_on` (`enter`/`sla_breach`/`no_response_days`/`manual`) y el dispatch manual funciona (`/api/crm/voice-agents/[id]/dispatch`). El productor automatico por cambio de etapa **esta hecho** desde la ronda 2 (`voiceAgent/stageAgentTrigger.ts`, registrado en `jobs/handlers/index.ts`) y desde la ronda 3 tiene pruebas de comportamiento (K1–K8), no de texto. ⚠️ NO VERIFICADO de punta a punta: drenar la cola esta prohibido en el encargo.
- [ ] Motor `elevenlabs_agent`: **NO implementado** en r1. Sigue siendo solo una etiqueta de la union TS. Declarado como pendiente, no como hecho.
- [x] Voz clonada, capa de datos y camino de llamada: tabla `voices` con `kind='cloned'`, `consent_recorded_at` y CHECK `voices_cloned_requires_consent` (verificado: el INSERT sin consentimiento es rechazado); UI de registro con casilla de consentimiento; `resolveVoice` emite `ttsProvider`/`voice` en el TwiML; cliente REST de ElevenLabs con IVC (`POST /v1/voices/add`). ⚠️ **NO VERIFICADO en vivo**: sin clave real no hay grabacion, ni clonado, ni preview.
- [ ] Creditos: **reserva atomica ANTES del proveedor y reembolso al fallar: hecho** (`deduct_comm_credits`). Pendiente: liquidacion fina al colgar sigue en `endSession` (si el proceso muere no se ajusta), `cost_amount` por llamada, presupuesto mensual con corte y dashboard de uso.
- [ ] UI: **hecho** lista de agentes, editor con 4 pestanas (Proposito/Guion/Voz/Herramientas), panel de voces, panel de campanas con parada de emergencia, y **tab "Agente IA" en `StageDialog`**, que es el dialogo que abre de verdad el engranaje del tablero (r2: en r1 estaba montado en el huerfano `StageConfigDialog`, inalcanzable; r3: retirado de ahi para que haya un solo montaje); estados vacios y de error. **Pendiente**: wizard, simulador, "llamame a mi", historial con detalle, `AIAgentDialog` en el pipeline y `AiCallEntry` en el timeline (F9).
- [ ] Codigo muerto: los 4 archivos de la V3 ya estaban borrados. **No verificado** el despliegue del ws-server en Railway. El Dockerfile **no necesita cambio**: `ws-server.Dockerfile:35` es `COPY src/lib/ ./src/lib/` (rectificacion de la ronda 2; la ronda 1 afirmo lo contrario y era falso).
- [x] `tsc --noEmit`: **219 errores** (linea base 230); **0 en archivos de F6**. `npx jest` (r3): suite de la fase **96/96**, suite de correo sin regresion (225 verdes), y las unicas suites rojas son ajenas (`website/sectionContract` y las de `timeline` de F9). La suite comprueba ahora **privilegios reales de la base** (bloque L) y el **comportamiento** del productor (bloque K). E2E contra Twilio real **NO ejecutado**.

Métricas de éxito (30 días tras despliegue): ≥90 % de llamadas del agente con `activity` y transcripción; latencia media de respuesta (fin de habla del cliente → primer token de audio) < 1.2 s; tasa de transferencias no solicitadas < 5 %; costo real/min dentro de ±15 % de la estimación; 0 incidentes cross-tenant.

---

## 11. Riesgos y decisiones

| Decisión / riesgo | Por qué así y no de otra forma |
|---|---|
| ConversationRelay como primario y no ElevenAgents | Control total del prompt, tools, política `suggest`, logs por turno y créditos propios; ElevenAgents duplica "cerebro" fuera de nuestra BD. ElevenAgents queda como secundario por su calidad/latencia y para batch |
| Twilio para el audio en vez de OpenAI Realtime SIP | Realtime no permite voz clonada; SIP Connector + Elastic SIP Trunking añade infraestructura; `gpt-4o-realtime-preview` ya está apagado |
| Voz clonada IVC (no PVC) | IVC funciona con 1–2 min y es instantánea; PVC exige 30+ min, verificación y horas de fine-tuning; se documenta como mejora manual |
| Riesgo: CR no resuelve voces privadas IVC | Spike en PR-1; fallback `elevenlabs_agent` o compartir voz; nunca bloquea el resto de la fase |
| `goal_schema` como JSON Schema estricto | Sirve igual para structured outputs de OpenAI, `response_format` de Gemini y `data_collection` de ElevenAgents |
| Mantener tabla `voice_agents` (no renombrar a `ai_agents`) | Evita romper FKs (`calls.voice_agent_id`, `voice_agent_calls`) y el CRUD existente; el nombre en UI es "Agentes IA" |
| Política `suggest` por defecto | El dueño pidió que el agente "haga lo que la org configure"; empezar en modo sugerencia evita movimientos de etapa o pagos erróneos hasta ganar confianza |
| Tools por nombre de etapa (no id) | El LLM ve nombres; se resuelve server-side dentro del pipeline de la opp, eliminando alucinación de ids (C-6 en F4) |
| Orquestación como jobs encadenados y no como secuencia de F8 | El agente necesita reaccionar a respuestas del cliente en horas, no días; F8 puede igualmente invocar `start_ai_agent` como acción |
| Riesgo legal (Habeas Data, grabación, voz de terceros) | `identity_disclosure` CHECK duro; aviso de grabación en `welcomeGreeting`; `contact_consents` + `fn_can_contact`; `voices.owner_user_id` = usuario que graba |
| Riesgo de costo desbocado | reserva previa, presupuesto mensual con corte, `max_concurrent`, `max_calls_per_day`, `max_attempts` |
| Riesgo de latencia con Gemini sin streaming | Se envía por frases; se mide en E2E; si >1.5 s, Gemini queda solo para texto (WhatsApp/email) |

---

## 12. Archivos tocados y orden de PRs (≤400 líneas cada uno)

> **Lo realmente tocado** esta al final: seccion 13 (ronda 1), 14 (ronda 2) y **15 (ronda 3)**.
> Lo que sigue es el plan original de 12 PRs, que se conserva como hoja de ruta y **no**
> describe el estado real del codigo.
>
> **Archivos tocados en la ronda 3 (2026-09-09):**
>
> | Archivo | Cambio |
> |---|---|
> | `src/lib/services/crm/voiceAgentService.ts` | R3-5 presupuesto unico (`getAgentCaps`, `dayRoom`/`hourRoom`), R3-6 pre-filtro por agente + tolerancia a `23505`, R3-9 reutilizacion de la fila `pending` |
> | `src/lib/services/integrations/twilio/voiceAgent/voiceAgentTools.ts` | gemelo de F-NEW-8: `getBusinessInfo` deja de descartar el `error` |
> | `src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts` | R3-7: el sello de conciliacion depende de que el cobro no falle |
> | `src/components/crm/pipeline/StageConfigDialog.tsx` | R3-8: se retira la pestaña «Agente IA» duplicada del dialogo huerfano |
> | `src/lib/services/crm/__tests__/f6Adversarial.test.ts` | 69 → 96 casos: bloque K (comportamiento del productor), K bis (presupuesto unico), L (privilegios reales) y M (menores); `I6` reescrito y `J7` ampliado a los 11 archivos de la fase |
>
> **Archivos compartidos: NINGUNO tocado en la ronda 3.** Los dos de la ronda 2
> (`src/lib/jobs/handlers/index.ts` y `src/components/crm/pipeline/KanbanBoardV2.tsx`) quedan
> como estaban.

**PR-1 (spike + BD):** migraciones §3.1 vía MCP (4), seeds `voice_agent_templates` (`src/lib/services/crm/agentTemplates.seed.ts` NUEVO) y `provider_pricing`; spike documentado de voz IVC en CR en `ANEXO-B-PROVEEDORES-Y-APIS.md` (modificar). Verificación §3.3.

**PR-2 (registry de tools):** `src/lib/services/crm/agentTools/index.ts` + 12 archivos de tools (crear); tests `agentTools.registry.test.ts`, `moveOpportunityStage.test.ts`; eliminar `src/lib/services/crm/voiceAgentTools.ts`.

**PR-3 (contexto, voz, costos):** `agentContextBuilder.ts`, `voiceService.ts`, `agentCostService.ts`, `src/lib/services/integrations/elevenlabs/elevenLabsClient.ts` (crear); `voiceService.test.ts`, `agentCostService.test.ts`; dependencia `@elevenlabs/elevenlabs-js`.

**PR-4 (ws-server):** `relaySession.ts`, `guardrails.ts`, `llmAdapters/{openai,gemini,index}.ts` (crear); `wsAuth.ts` (F0, modificar: one-time use); `ws-server.ts` (modificar: pasa `req` al handler); eliminar `conversationRelayHandler.ts`, `voiceAgent/voiceAgentTools.ts`, `voiceAgentPrompts.ts`, `realtimeSession.ts`, `elevenLabsTTS.ts`, `deepgramSTT.ts`, `voiceAgent/voiceAgentService.ts`, `src/app/api/integrations/twilio/voice/media-stream/route.ts`; tests `llmAdapters.openai.test.ts`, `wsAuth.test.ts` (extender), `guardrails.test.ts` (extender).

**PR-5 (TwiML + callbacks):** `src/app/api/voice/twiml/ai-agent/route.ts` (reescribir), `src/app/api/voice/relay/after/route.ts`, `src/app/api/voice/amd/route.ts` (crear), `src/app/api/voice/status/route.ts` (modificar: rama `mode='ai_agent'`), `src/app/api/integrations/twilio/voice/incoming/route.ts` (modificar: agente entrante por `phone_numbers`).

**PR-6 (dispatcher + jobs):** `agentDispatcher.ts`, `agentOrchestrator.ts`, `src/lib/services/crm/jobs/handlers/{aiCall,aiWhatsapp,aiDraftEmail,agentOrchestration}.ts` (crear) y registro en el runner de F0; `src/lib/services/crm/voiceAgentService.ts` (reescribir sin `runCampaignQueue`); `src/app/api/crm/voice-agents/campaigns/run/route.ts` (modificar: encola en vez de llamar); tests `agentOrchestrator.test.ts`.

**PR-7 (API):** `src/app/api/crm/voice-agents/[id]/{test,dispatch,call-me,history}/route.ts`, `src/app/api/crm/voice-agents/tool-runs/[id]/route.ts`, `src/app/api/crm/stage-agents/route.ts` + `[id]`, `src/app/api/crm/voices/route.ts` + `clone` + `[id]` + `[id]/preview`, `src/app/api/crm/ai-usage/route.ts` (crear); `src/app/api/crm/voice-agents/route.ts` + `[id]` (modificar: zod); `agentSimulator.ts` (crear).

**PR-8 (ElevenAgents):** `src/lib/services/integrations/elevenlabs/elevenAgentsService.ts`, `src/app/api/crm/agent-tools/[tool]/route.ts`, `src/app/api/webhooks/elevenlabs/post-call/route.ts` (crear); tests de webhook.

**PR-9 (UI lista/editor):** `src/app/app/crm/agentes-ia/{page,nuevo/page,[id]/page,voces/page}.tsx`, `src/components/crm/agentes-ia/{AgentList,AgentUsageDashboard,AgentEditor}.tsx`, `tabs/{PurposeTab,ScriptTab,VoiceTab,ChannelsTab}.tsx`, nav (modificar).

**PR-10 (UI tools/pruebas/historial/voz):** `tabs/{ToolsTab,GuardrailsTab,TestTab,HistoryTab}.tsx`, `AgentCallDetailSheet.tsx`, `VoiceCloneDialog.tsx`, `AgentSimulator.tsx`.

**PR-11 (integración pipeline/timeline):** `src/components/crm/shared/AIAgentDialog.tsx`, `src/components/crm/agentes-ia/StageAgentPanel.tsx` (crear); `src/components/crm/pipeline/StageConfigDialog.tsx` (modificar: tabs) + `StageGeneralForm.tsx` (crear); `src/components/crm/timeline/AiCallEntry.tsx` (crear, F9 lo monta); `QuickActionsBar` (F9, modificar: opción "Agente IA").

**PR-12 (E2E + docs):** ejecución §9.3, ajustes, `PROGRESS.md` (modificar) con costos reales medidos y decisión final del spike de voz.

---

## 13. Registro de implementación — ronda 1 (2026-09-09)

Punto de partida: informe `TEST-F6-r1.md`, **2,0 / 10**, veredicto «la fase no se ha empezado».
Esta ronda construye el camino completo de la llamada y la configuración por etapa del embudo.

### 13.1 Migraciones aplicadas (MCP `apply_migration`, proyecto `jgmgphmzusbluqhuqihj`)

| Migración | Qué hace |
|---|---|
| `crm_v4_f06_01_do_not_call_column_and_consent_gate` | `customers.do_not_call boolean NOT NULL DEFAULT false` + índice parcial + backfill desde `metadata->>'do_not_call'` y desde `contact_consents`. `fn_can_contact` pasa a mirar también la columna para el canal `voice`. Nueva RPC `fn_log_consent_opt_out(p_org, p_customer, p_channel, p_source, p_evidence)` (SECURITY DEFINER, `search_path=public`) que escribe `contact_consents` + `metadata` + la columna en una sola operación |
| `crm_v4_f06_02_stage_agents_voices_tool_runs` | Tablas NUEVAS `voices`, `stage_agents` y `voice_agent_tool_runs`, las tres con `organization_id integer NOT NULL`, FKs, CHECKs e **RLS con 4 políticas reales** por `organization_members`. `voices` incluye el CHECK `voices_cloned_requires_consent` (una voz clonada exige `consent_recorded_at`) y un índice único parcial de «una voz por defecto por organización» |
| `crm_v4_f06_03_dispatcher_guardrails_and_claim` | `voice_agent_calls`: `provider_call_sid` (único), `attempts`, `stage_agent_id`, `claimed_at`, `locked_by`, `consent_given`, `last_error_code`, y CHECK de `status` ampliado a 10 valores. `voice_agent_campaigns`: `max_calls_per_hour` (1–500), `emergency_stop`, `stopped_reason`, `stopped_at`, `consecutive_failures`. `voice_agents`: `identity_disclosure`, `voice_ref_id`. RPCs `fn_claim_voice_agent_calls(p_org, p_campaign, p_limit, p_worker)` con `FOR UPDATE SKIP LOCKED` y `fn_stop_voice_campaign(p_org, p_campaign, p_reason)` |

Verificación ejecutada dentro de `begin; … rollback;` (todo revertido, 0 filas residuales):
`fn_can_contact` pasa de `true` a `false` tras el opt-out, `customers.do_not_call` queda en `true`,
`contact_consents.status='opted_out'`, el insert en `calls` con el payload exacto del despachador
funciona, el claim entrega 3 y luego 2 de 5 filas (nunca la misma dos veces), `attempts=1` y
`claimed_at` no nulo en las 5, `fn_stop_voice_campaign` deja `emergency_stop=true` / `status=paused`,
y una voz `cloned` sin consentimiento es **rechazada por el CHECK**.
No se creó ningún archivo `.sql` en el repositorio.

### 13.2 Archivos creados

- `src/lib/services/crm/stageAgentService.ts` — configuración del agente por etapa: CRUD, validación de pertenencia de la etapa a la organización (vía `pipelines.organization_id`, porque `stages` no tiene `organization_id`), 11 objetivos con etiqueta y guion, herramientas por defecto por objetivo y `resolveStageAgentContext()`.
- `src/lib/services/crm/voiceAgent/agentRuntime.ts` — el puente entre la configuración y la llamada: `buildRuntimeConfig`, `mandatoryGuardrails`, `buildSystemPrompt`, `buildGreeting`, `resolveVoice`, `crVoiceModelSuffix`, `twilioLanguage`, `persistConversation`.
- `src/lib/services/crm/voiceAgent/callStatusMap.ts` — traducción de `CallStatus` de Twilio a los CHECK reales de `voice_agent_calls` y `calls` (módulo puro, compartido con las pruebas).
- `src/lib/services/crm/voiceCatalogService.ts` — catálogo de voces (`voices`), voz por defecto e importación desde ElevenLabs.
- `src/lib/services/integrations/elevenlabs/voiceCloneClient.ts` — cliente REST (`xi-api-key`), `listVoices`, `ping`, `createInstantClone` (IVC) y detección de claves marcador.
- `src/app/api/voice/ai-agent/status/route.ts` — webhook de cierre de la llamada del agente (firma fail-closed, organización resuelta desde la fila persistida).
- `src/app/api/voice/agent-campaigns/run/route.ts` — cron canónico del despachador, bajo un prefijo que el middleware **ya** exime.
- `src/lib/services/crm/voiceAgentCron.ts` — lógica compartida del cron (`runCampaignsForAllOrgs`, `runCampaignsForOrg`); un `route.ts` de Next no puede exportar nada más que sus handlers.
- `src/app/api/crm/stage-agents/route.ts` — GET/POST/DELETE de la configuración por etapa (org de sesión, escritura solo para administradores).
- `src/app/api/crm/voices/route.ts` — GET/POST/PATCH/DELETE del catálogo de voces.
- `src/app/api/crm/voice-agents/[id]/dispatch/route.ts` — lanzar una llamada del agente para una oportunidad o cliente.
- `src/app/app/crm/agentes-ia/page.tsx` y `src/components/crm/agentes/{AgentesIaPage,AgentEditorDialog,VoicesPanel,AgentCampaignsPanel}.tsx` — UI de agentes IA.
- `src/components/crm/pipeline/StageAgentTab.tsx` — pestaña «Agente IA» del diálogo de etapa.
- `src/lib/services/crm/__tests__/f6VoiceAgent.test.ts` — 24 pruebas propias.

### 13.3 Archivos modificados

- `src/lib/services/crm/voiceAgentService.ts` — reescrito (despachador, topes, claim, créditos, consentimiento, `calls`, correlación, reintentos, `dispatchAgentCall`).
- `src/lib/services/crm/voiceAgentTools.ts` — reescrito (11 tools del CRM, sin cliente de navegador, con `voice_agent_tool_runs`).
- `src/app/api/voice/twiml/ai-agent/route.ts` — reescrito (configuración completa, consentimiento, `<ConversationRelay>` con voz y STT, idempotencia).
- `src/app/api/crm/voice-agents/campaigns/run/route.ts` — alias del cron, ahora con `verifyCronSecret`.
- `src/app/api/crm/voice-agents/route.ts` — pasa `identity_disclosure`, `voice_ref_id` y `created_by`.
- `src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts` — **cambio aditivo** sobre un archivo de F3: `tool_calls` en el historial, delegación al runtime del CRM cuando llega `agentId`, límites del agente y persistencia de la conversación.
- `src/components/crm/pipeline/StageConfigDialog.tsx` — pestañas «Etapa» / «Agente IA».
- `src/lib/services/crm/__tests__/f6Adversarial.test.ts` — suite del tester: 58 casos (55 heredados + 3 nuevos), todos verdes; cada defecto corregido conserva su escenario y sus datos y pasa a afirmar lo correcto, con el prefijo `[CORREGIDO r1]`.

### 13.4 Desviaciones respecto al plan

1. **La columna de «no llamar» existe y aun así el despachador no la lee.** Se creó `customers.do_not_call` (lo exige el cumplimiento y permite consultarla e indexarla), pero el código no la lee directamente: la única puerta es `fn_can_contact(...,'voice')`, que mira la columna, el flag histórico de `metadata` y `contact_consents`. Así no hay dos fuentes de verdad y F7/F16 siguen usando el mismo RPC sin cambios.
2. **El cron cambió de ruta en vez de cambiar el middleware.** `src/middleware.ts` es archivo compartido. En lugar de pedir una exención nueva, el cron canónico vive en `/api/voice/agent-campaigns/run`, bajo un prefijo ya exento. La exención y los topes de marcación aterrizan así en el mismo cambio, que era el riesgo 6 del informe del tester.
3. **El recepcionista de hotel no se borra.** Sigue atendiendo el flujo entrante genérico (sin `agentId`), que es de F3. El agente del CRM toma el control solo cuando la llamada trae agente.
4. **`voice_agent_templates` no se creó.** El catálogo de propósitos que pidió el dueño vive en `stage_agents.objective` (11 valores) con su guion en `OBJECTIVE_PLAYBOOKS`, que es lo que de verdad cambia el comportamiento de la llamada.
5. **`products` no tiene columna de precio** (verificado contra el esquema): el precio del guion se escribe en `stage_agents.offer.price`.
6. **`stages` no tiene `organization_id`**: `stage_agents` lleva el suyo y la pertenencia se valida contra `pipelines.organization_id`.

### 13.5 Lo que NO se pudo hacer y por qué

- **Nada de ElevenLabs se ejecutó contra el proveedor real.** La `ELEVENLABS_API_KEY` de este entorno es el marcador literal de `.env.example` y la API responde `401`. Todo lo relativo a clonar la voz, listar las voces del workspace y el renderizado real del TTS está marcado `⚠️ NO VERIFICADO` en el código y en este documento.
- **Nada se probó contra Twilio real.** `calls.create`, `machineDetection` y la aceptación del TwiML por ConversationRelay están escritos con los nombres de parámetro de la documentación verificada, pero no ejecutados.
- **El ws-server no se levantó.** El handler se comprobó con pruebas unitarias y aserciones sobre el fuente, no con un WebSocket real ni con una llamada a OpenAI.
- **Motor `elevenlabs_agent` y cerebro Gemini**: no implementados. Siguen siendo etiquetas.
- **Registro del kind `ai_call` en la cola**: `src/lib/jobs/handlers/index.ts` es archivo compartido; ver 13.6.

### 13.6 Integración pendiente (archivos compartidos que el builder no puede editar)

1. `src/config/crmNav.ts` — activar la entrada del menú: `{ key: 'agentes-ia', …, enabled: true }`. La página ya existe y responde (307 a login sin sesión, que es lo correcto).
2. `src/lib/jobs/handlers/index.ts` — registrar el handler del kind `ai_call` para que la orquestación por etapa se dispare desde la cola.
3. `vercel.json` o `pg_cron` — programar `POST /api/voice/agent-campaigns/run` con `Authorization: Bearer ${CRON_SECRET}`. **Cada 5 minutos, no cada minuto**: los topes ya son reales, pero no hay motivo para consultar más a menudo.
4. `ws-server.Dockerfile` — el handler importa ahora `src/lib/services/crm/**` (runtime del agente y herramientas). Sin esa carpeta en la imagen, el ws-server no arranca en Railway.
5. `src/__tests__/guardrails.test.ts` — la única entrada obsoleta que queda en la allow-list (`app/api/crm/sequences/run/route.ts`) es de F8, que borró esa ruta. No es de F6.

---

## 14. Registro de implementación — ronda 2 (2026-09-09)

Cierra los cuatro ALTOS y los cinco MEDIOS de `TEST-F6-r2.md` (6,0 / 10). El hallazgo
CRÍTICO (`EXECUTE` para `anon` en tres RPC) lo cerró el orquestador por migración antes de
esta ronda; aquí se verifica y se adopta la regla que lo evita en adelante.

### 14.1 Migración aplicada (MCP `apply_migration`, proyecto `jgmgphmzusbluqhuqihj`)

`crm_v4_f06_04_attempt_ledger_and_dispatch_guardrails`

1. **Tabla `voice_agent_call_attempts`** — el libro de intentos: `organization_id integer NOT
   NULL REFERENCES organizations(id)`, `voice_agent_call_id`, `voice_agent_id`, `campaign_id`,
   `customer_id`, `attempt_no`, `source` (`campaign|manual|job`), `worker`, `attempted_at`.
   RLS activada con **4 políticas reales** (`select/insert/update/delete` por
   `organization_members` activo, el mismo patrón que `voices`). Índices por
   `(campaign_id, attempted_at)`, `(organization_id, voice_agent_id, attempted_at)`,
   `(organization_id, customer_id, attempted_at)` y `(voice_agent_call_id)`.
2. **`voice_agent_calls`** — `credits_reserved integer NOT NULL DEFAULT 0` y
   `credits_settled_at timestamptz`: permiten conciliar la reserva de crédito al colgar y
   evitar el doble cobro.
3. **`voice_agents`** — `max_calls_per_day` (DEFAULT 50) y `max_calls_per_hour` (DEFAULT 20),
   ambos con CHECK 1..500: son los topes del camino de despacho puntual, que no tiene campaña.
4. **`fn_claim_voice_agent_calls`** reescrita: además de reservar con `FOR UPDATE SKIP LOCKED`,
   **escribe una fila en el libro por cada llamada reclamada**. El tope deja de depender de una
   columna que el reintento anula.
5. **`fn_claim_voice_agent_call_one(p_org, p_call, p_worker)`** (nueva): reserva atómica de una
   llamada suelta, con la misma semántica y el mismo registro de intento. Sustituye al `UPDATE`
   condicional del despacho puntual, que no dejaba rastro.
6. **`REVOKE` en la misma migración** para las dos funciones: `REVOKE ALL … FROM public, anon,
   authenticated` + `GRANT EXECUTE … TO service_role`.

Verificación contra la base real (una transacción `begin; … rollback;`):

| comprobación | resultado |
|---|---|
| claim de 3 filas → libro | 3 filas en `voice_agent_call_attempts` |
| se anula `claimed_at` (como hace el reintento) y se vuelve a reclamar | claim 3, **libro 6**, `claimed_at` no nulo solo en **3** |
| `fn_claim_voice_agent_calls` con organización ajena | **0 filas** |
| `fn_claim_voice_agent_call_one` sobre una fila `pending` | 1 fila, `source='manual'` en el libro |
| la misma llamada, repetida | **0 filas** (no se marca dos veces) |
| `pg_policies` sobre `voice_agent_call_attempts` | **4** · `relrowsecurity = true` |
| `proacl` de las dos funciones | `{postgres, service_role}` — sin `anon`, sin `authenticated` |
| PostgREST con la clave anónima sobre ambas | **401 · `42501 permission denied`** (medido en vivo) |

Conteos posteriores: `voice_agent_call_attempts 0`, `voice_agents 0`, `voice_agent_calls 0`,
`voice_agent_campaigns 0`, `voices 0`, `stage_agents 0`, `calls 11` (las preexistentes).

### 14.2 Los cuatro ALTOS

| Hallazgo | Qué se hizo |
|---|---|
| **F-NEW-2** · el tope no cuenta todo intento | `countAttempts` cuenta `voice_agent_call_attempts` por `attempted_at`; el libro lo escribe la RPC de reserva, así que ni el reintento ni la franja horaria pueden borrar un intento. El día se calcula con `startOfDayIso(zona)` (F-NEW-12). El caso `B5` se reescribió: el doble ya no lleva su propio contador, modela la semántica real (la RPC entrega hasta `p_limit` y escribe en el libro; el servicio pone el tope) y comprueba además que por `claimed_at` se verían menos marcaciones que las reales. |
| **F-NEW-3** · la pestaña de la etapa era inalcanzable | `StageAgentTab` se monta ahora en `StageDialog`, que es el diálogo que abre el engranaje «Configurar etapa» de `KanbanColumnV2`. `KanbanBoardV2` le pasa `stageId={stageDialog.stage?.id}` (dos puntos de render). `StageConfigDialog` queda con una nota que explica que sigue huérfano. El caso `F7` ya no comprueba que un archivo *contenga* el nombre de la pestaña: comprueba la cadena completa engranaje → `KanbanBoardV2` → `StageDialog` → `StageAgentTab`, y que `PipelineView` monta ese tablero. |
| **F-NEW-4** · nadie encolaba `ai_call` | Nuevo productor `src/lib/services/crm/voiceAgent/stageAgentTrigger.ts`: listener de `opportunity.stage_changed` en el despachador de eventos que lee `stage_agents` con `trigger_on='enter'`, comprueba que la oportunidad siga abierta y con cliente, y hace `enqueueJob({kind:'ai_call'})` con `dedupe_key = ai_call:stage_enter:{stage_agent_id}:{opportunity_id}`. No marca: el único camino de marcación sigue siendo `dispatchAgentCall`, con todas sus barreras. |
| **F-NEW-5** · camino de marcación sin ningún tope | `dispatchAgentCall` aplica ahora: canal habilitado (`comm_settings.voice_agent_enabled`/`is_active`), agente activo, deduplicación (si ya hay llamada `pending|queued|in_progress` para ese agente y cliente devuelve esa, no crea otra), tope diario y horario del agente contra el libro, tope de intentos por cliente y día (2), concurrencia (`voice_max_concurrent_calls`) y franja horaria del agente. La ruta `POST /api/crm/voice-agents/[id]/dispatch` exige `requireOrgAdmin` y traduce `VoiceDispatchBlocked` a 429 (topes) o 409. La reserva usa `fn_claim_voice_agent_call_one`. |

### 14.3 Los cinco MEDIOS y los menores

- **F-NEW-6 · cobro duplicado**: el despachador anota `credits_reserved` en la fila; `endSession`
  cobra `max(0, minutos − reserva)` y marca `credits_settled_at` (un cierre duplicado no vuelve a
  cobrar). Si la llamada nunca llega a hablar (`no_answer|failed|canceled`),
  `/api/voice/ai-agent/status` devuelve la reserva con importe negativo, una sola vez.
- **F-NEW-7 · consentimiento desactivable**: `MANDATORY_TOOLS = ['log_consent_opt_out','end_call']`
  vive en `voiceAgentTools.ts`; `buildRuntimeConfig` las une SIEMPRE a `allowedTools`, vengan de la
  etapa o del agente; la casilla de `AgentEditorDialog` está marcada, `disabled` y etiquetada
  «Obligatoria por ley».
- **F-NEW-8 · errores tragados**: cerradas las 3 lecturas de `agentRuntime` (cliente, organización,
  `comm_settings`) y las 4 de `conversationRelayHandler` (+ el `insert` de `comm_usage_logs`). El
  mensaje al cliente cuando falla la lectura de `comm_settings` ya no miente sobre la causa.
- **F-NEW-9 · suite en rojo**: `H3` pasa a afirmar lo correcto — el kind `ai_call` está registrado,
  con importación perezosa, **y** existe el productor.
- **F-NEW-10 · no se podía clonar una voz**: nuevo `cloneVoiceFromSample()` en
  `voiceCatalogService` (primer llamador real de `createInstantClone`), nueva ruta
  `POST /api/crm/voices/clone` (multipart, org de sesión, `requireOrgAdmin`, 1..5 muestras de
  ≤10 MB, consentimiento obligatorio) y bloque «Clonar mi voz» en `VoicesPanel`.
  **⚠️ NO VERIFICADO en vivo**: la clave de ElevenLabs sigue siendo el marcador y devuelve 401.
- **F-NEW-11**: el despachador comprueba `comm_settings.voice_agent_enabled` y `voice_agents.is_active`
  antes de marcar; con el canal apagado no se paga el minuto de Twilio para colgar después.
- **F-NEW-12**: `startOfDayIso(zona)` sustituye a `setUTCHours(0,0,0,0)`.
- **F-NEW-13**: `/api/voice/ai-agent/status` responde `<Response/>` con `Content-Type: text/xml`
  (es también la `action` de `<Connect>`, donde Twilio espera TwiML).
- **F-NEW-14**: `max_tokens` sale de `voice_agents.guardrails.max_response_tokens`
  (`resolveMaxResponseTokens`, acotado 60..600, por defecto 200).

### 14.4 Archivos de la ronda 2

**Creados**

- `src/lib/services/crm/voiceAgent/stageAgentTrigger.ts` — productor de `ai_call` al entrar en la etapa.
- `src/app/api/crm/voices/clone/route.ts` — clonado instantáneo de voz (IVC).

**Modificados**

- `src/lib/services/crm/voiceAgentService.ts` — libro de intentos, `startOfDayIso`, barreras del
  despacho puntual, `VoiceDispatchBlocked`, `getOrgVoiceSettings`, `isAgentActive`,
  `credits_reserved`.
- `src/lib/services/crm/voiceAgent/agentRuntime.ts` — herramientas obligatorias, lecturas con
  error comprobado, `maxResponseTokens`.
- `src/lib/services/crm/voiceAgentTools.ts` — `MANDATORY_TOOLS`.
- `src/lib/services/crm/voiceCatalogService.ts` — `cloneVoiceFromSample`.
- `src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts` — conciliación de
  créditos, lecturas con error comprobado, `max_tokens` del agente.
- `src/app/api/voice/ai-agent/status/route.ts` — devolución de la reserva y respuesta TwiML.
- `src/app/api/crm/voice-agents/[id]/dispatch/route.ts` — `requireOrgAdmin`, 429/409.
- `src/components/crm/pipeline/StageDialog.tsx` — pestaña «Agente IA» en el diálogo que sí se abre.
- `src/components/crm/pipeline/StageConfigDialog.tsx` — nota de que sigue huérfano.
- `src/components/crm/agentes/AgentEditorDialog.tsx` — herramientas obligatorias bloqueadas.
- `src/components/crm/agentes/VoicesPanel.tsx` — subida de muestras y clonado.
- `src/lib/services/crm/__tests__/f6Adversarial.test.ts` — B4, B5, C4, F7 y H3 reescritos; 11 casos
  nuevos (bloque J).

**Modificados fuera de la propiedad del agente (mínimos, por indicación explícita del orquestador)**

- `src/lib/jobs/handlers/index.ts` (archivo compartido) — dos líneas: `import` y llamada de
  `registerStageAgentAiCallListener()`. Sin ellas el productor no se registra y el disparo por
  etapa no ocurre.
- `src/components/crm/pipeline/KanbanBoardV2.tsx` (propiedad de F9) — se añade `stageId={…}` en los
  dos puntos donde ya se renderizaba `<StageDialog>`. Sin ello la pestaña del dueño no se puede abrir.

### 14.5 Pruebas

```
npx jest src/lib/services/crm/__tests__/f6Adversarial.test.ts   # 69/69 verde (58 -> 69)
npx jest src/lib/services/crm/__tests__/f6VoiceAgent.test.ts    # 24/24 verde
npx jest                                                        # 1336 verdes; solo website/sectionContract en rojo (ajena)
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit          # 219 errores, 0 en archivos de F6
```

### 14.6 Lo que sigue sin verificarse

- **⚠️ NO VERIFICADO — ElevenLabs.** Clave marcador, 401. El clonado (`POST /v1/voices/add`) está
  escrito y expuesto, pero **no se ha ejecutado** contra el proveedor.
- **⚠️ NO VERIFICADO — Twilio.** Ninguna llamada real; todo con dobles.
- **⚠️ NO VERIFICADO — ws-server.** No se levantó el contenedor. `ws-server.Dockerfile` **no
  necesita cambios** (rectificación de la ronda 1): `COPY src/lib/ ./src/lib/` ya incluye los
  módulos nuevos.
- **⚠️ NO VERIFICADO — el disparo por etapa de punta a punta.** El listener está registrado y
  probado por unidad, pero **no se drenó la cola** (prohibido en el encargo), así que no se ha
  visto un job `ai_call` recorrer el camino completo en vivo.


---

## 15. Registro de implementación — ronda 3 (2026-09-09)

Punto de partida: `TEST-F6-r3.md`, **8,5 / 10**. Listón 9,5. El tester verificó en vivo las
ocho declaraciones de la ronda 2 y las dio por ciertas; lo que quedaba eran dos hallazgos ALTOS
de base de datos (ya cerrados por el orquestador antes de esta ronda) y **la calidad de las
pruebas de la propia fase**.

### 15.1 Corrección de diagnóstico: dos garantías que la ronda 2 declaró y no eran ciertas

> **(a) «una fila inmutable por reserva» (informe r2 §2.1) era FALSA.** La tabla
> `voice_agent_call_attempts` tenía `INSERT/UPDATE/DELETE` para `anon` y `authenticated`, con
> sus políticas: cualquier miembro autenticado podía borrar sus filas desde el navegador y
> poner el tope diario a cero. El tope arreglado en la ronda 2 se apoyaba en una tabla que el
> propio inquilino escribía. Cerrado por el orquestador en
> `crm_v4_f06_05_consent_membership_y_libro_inmutable`; verificado hoy contra la base
> (`INSERT`, `UPDATE` y `DELETE` → `42501` con un JWT de miembro activo; `SELECT` sigue
> funcionando para la interfaz).
>
> **(b) La guarda de pertenencia se pidió para las DOS funciones que escriben y llegó a una.**
> `fn_log_consent_opt_out` comprobaba que el CLIENTE perteneciera a `p_org`, pero no que el
> LLAMANTE perteneciera: un miembro de cualquier organización marcaba `opted_out` y
> `do_not_call = true` a los clientes de cualquier otra, en los cuatro canales. Cerrado por el
> orquestador en la misma migración; verificado hoy en vivo: con el JWT de un miembro de la
> organización 57, `fn_log_consent_opt_out(120, …)` → **excepción `42501` «no pertenece a la
> organizacion 120»**, mientras que sobre su propia organización la función sigue entrando.

### 15.2 El gemelo que faltaba (pasada explícita de gemelos)

La misma clase de defecto de (a) estaba **en la tabla de al lado y nadie la había mirado**:

- **`voice_agent_tool_runs`** —la auditoría de lo que hizo el agente IA durante la llamada,
  incluida la ejecución de `log_consent_opt_out`, que es obligación legal (Ley 1581)— tenía
  `INSERT/UPDATE/DELETE` para `anon` y `authenticated` y sus tres políticas. El inquilino podía
  **borrar la prueba de que el cliente pidió la baja**. Cerrado en
  `crm_v4_f06_06_tool_runs_audit_inmutable`. La escribe solo `recordToolRun`
  (`voiceAgentTools.ts:72`) con el cliente de servicio (`conversationRelayHandler.ts:498`), así
  que la revocación no rompe ningún camino; la interfaz la sigue leyendo (timeline).
  Verificado en vivo: `INSERT`/`DELETE` → `42501`, `SELECT` → permitido.

- **`getBusinessInfo`** (`integrations/twilio/voiceAgent/voiceAgentTools.ts:358`) descartaba el
  `error` de su lectura y, si la base fallaba, le decía al cliente **en mitad de la llamada**
  que «no hay información del negocio» — el mismo mensaje que mentía sobre la causa que ya se
  corrigió en `conversationRelayHandler` en la ronda 2. La ronda 2 auditó tres archivos
  escogidos a mano; este era el cuarto. Corregido, y el caso `J7` ahora barre **los once
  archivos de la fase**, no una lista elegida.

Gemelos buscados y **no** encontrados: `setUTCHours(0,0,0,0)` fuera de comentarios (0),
lecturas sin `error` en los otros diez archivos de F6 (0), y un tercer punto de marcación
fuera de `dispatchAgentCall` / `runCampaignQueue` (0). Gemelos encontrados **fuera de F6** y
elevados al orquestador sin tocarlos: ver §15.6.

### 15.3 R3-5 · Los dos topes pasan a compartir un único presupuesto

`voice_agents.max_calls_per_day/hour` es ahora el **saldo único** del agente. Antes la campaña
contaba por `campaign_id` y el despacho puntual por `voice_agent_id`, así que **se sumaban**:
50 + 50 = 100 marcaciones al día con un tope declarado de 50.

- `getAgentCaps()` (`voiceAgentService.ts`, sustituye a `isAgentActive`) lee estado **y**
  presupuesto del agente.
- `runCampaignQueue` cuenta **dos** saldos —el de la campaña y el del agente— y manda el menor
  (`dayRoom` / `hourRoom`). El hueco para encolar objetivos usa también el menor.
- `dispatchAgentCall` ya contaba por agente; `countAgentAttempts` ve las filas de campaña
  porque las dos RPC de reserva graban `voice_agent_id` en el libro (verificado en `pg_proc`).

### 15.4 Calidad de las pruebas (lo que realmente pedía el tester)

La suite pasa de **69 a 96 casos**. Lo importante no es el número:

- **El productor por etapa tenía solo aserciones de texto** (`H3`, cinco `toContain`). Ahora el
  bloque **K1–K8 invoca `stageAgentAiCallListener` de verdad** con un doble de Supabase, y deja
  correr el `enqueueJob` real hasta los argumentos de `fn_enqueue_job`. **Demostración de que
  el cambio importa:** con el campo del payload renombrado (`to_stage_id` → `stage_id`) y el
  error de base tragado, **`H3` sigue en VERDE y seis casos de K se ponen en ROJO**.
- **La suite no comprobaba privilegios en ningún punto.** El bloque **L** consulta el catálogo
  real (`fn_f6_privilege_snapshot`, `crm_v4_f06_05_privilege_snapshot_for_tests`: SECURITY
  **INVOKER**, solo lectura de catálogo, concedida solo a `service_role`) y prueba el efecto
  por HTTP con la clave pública del navegador. `L2` demuestra que la red **muerde**: alimenta
  una foto sintética con los fallos reales de r2 y r3 y comprueba que salen todos por su
  nombre. Si la base no está disponible, los casos salen **SKIPPED visibles** con un aviso, no
  verdes: la sonda es síncrona precisamente para poder decidir eso en recolección.
- **`I6` era teatro**: declaraba un objeto literal con nombres de políticas y luego hacía
  `expect(policies).toHaveLength(4)` **sobre ese mismo literal**. Pasaba aunque la base no
  tuviera ni una política. Sustituido por la comprobación real en `L`.

### 15.5 Menores cerrados

| # | Qué | Dónde |
|---|---|---|
| R3-6 | Deduplicación del despacho puntual, atómica en la **base** | índice único parcial `voice_agent_calls_una_viva_por_cliente` (`crm_v4_f06_08`). El pre-filtro de la campaña pasa a ser por agente (antes por campaña, que no cubría el índice) y una carrera `23505` ya no tumba el lote: se reintenta fila a fila **sin tragarse** ningún otro error |
| R3-7 | El cobro al colgar era fail-**open** | `conversationRelayHandler.ts`: si `deduct_comm_credits` falla, `credits_settled_at` **no** se sella y la llamada sigue siendo reconciliable |
| R3-8 | La pestaña «Agente IA» montada en dos diálogos | retirada del huérfano `StageConfigDialog.tsx`; el caso `F7` comprueba ahora que el único montaje sea `StageDialog.tsx` |
| R3-9 | La fila `pending` de `dial_now:false` no la reclamaba nadie | `dispatchAgentCall` **reutiliza** esa fila en vez de crear otra; `queued`/`in_progress` siguen deduplicando igual |

### 15.6 Gemelos FUERA de F6 — para el orquestador (no los toqué)

La pasada de gemelos sobre `pg_proc` encontró tres funciones `SECURITY DEFINER` con `p_org`,
ejecutables con sesión y **sin** contrastar la pertenencia del llamante. No son de esta fase y
no las he modificado:

| Función | Riesgo |
|---|---|
| `fn_create_customer_credit` | **ESCRIBE** crédito de cliente. `proacl` incluye `=X` (PUBLIC) y `anon`. Escritura financiera entre inquilinos, alcanzable sin sesión |
| `fn_list_customer_credits` | Lee los créditos de **cualquier** organización. PUBLIC + `anon` |
| `fn_pause_sequences_on_reply` | Escribe sobre secuencias de cualquier organización. `anon=X` |
| `fn_can_contact` | Solo lee, pero permite comprobar clientes de otra organización (fuga menor). Es de F0 y F6 depende de ella |

`contact_consents` tiene además `DELETE`/`UPDATE` para `authenticated`: un inquilino puede
borrar una baja voluntaria ya registrada. No es tabla de F6, pero sostiene la garantía de
consentimiento de esta fase.

### 15.7 Migraciones de la ronda 3 (todas por MCP, cero archivos `.sql`)

| Versión | Nombre | Qué |
|---|---|---|
| 20260909182204 | `crm_v4_f06_05_privilege_snapshot_for_tests` | foto de privilegios para la suite (SECURITY INVOKER, solo `service_role`) |
| 20260909183951 | `crm_v4_f06_06_tool_runs_audit_inmutable` | gemelo de R3-2: auditoría del agente inmutable para el inquilino |
| 20260909184551 | `crm_v4_f06_07_privilege_snapshot_incluye_tool_runs` | la foto cubre el gemelo |
| 20260909184837 | `crm_v4_f06_08_dedupe_atomico_despacho_puntual` | índice único parcial (R3-6) |
| 20260909185302 | `crm_v4_f06_09_privilege_snapshot_incluye_indices` | la foto cubre el índice |

*(El nombre `..._05_...` se repite con la migración del orquestador
`crm_v4_f06_05_consent_membership_y_libro_inmutable`; las versiones son distintas y el orden de
aplicación es el correcto. Sin efecto, se anota para que no despiste.)*

### 15.8 Pruebas de la ronda 3

| Comando | Resultado |
|---|---|
| `npx jest src/lib/services/crm/__tests__/f6Adversarial.test.ts` | **96 / 96** (69 → 96) con la API de datos en pie. Si PostgREST no responde, el bloque `L` sale **SKIPPED visible** (`89 passed, 7 skipped`) con aviso: no es un verde |
| `npx jest src/lib/services/crm/__tests__/f6VoiceAgent.test.ts` | 24 / 24 |
| `npx jest src/lib/services/crm/email` | **13 suites, 225 verdes, 1 skip** — idéntico a la línea base: sin regresión |
| `npx jest` (completa) | 82 suites verdes · rojas: `website/sectionContract` y las de `timeline` de F9, **ambas ajenas** |
| `npx tsc --noEmit` | **219** errores (línea base 230; r2/r3 midieron 219). **0 en archivos de F6** |
| `.sql` en el repo | ninguno |

### 15.9 Lo que sigue SIN verificarse (⚠️ NO VERIFICADO)

Sin cambios respecto a la ronda 2, y se repite para que no se lea como resuelto:

- **⚠️ NO VERIFICADO: ElevenLabs.** La clave sigue siendo el marcador de ejemplo (`len=23`,
  prefijo `your-ele`) y devuelve **401**. Ni TTS, ni `/v1/voices`, ni `/v1/voices/add`, ni el
  clonado. Todo lo que dependa de la voz clonada está escrito y tipado, **no ejecutado**.
- **⚠️ NO VERIFICADO: la credencial de ElevenLabs del lado de Twilio**, imprescindible para que
  ConversationRelay use una voz clonada. Nadie la provisiona.
- **⚠️ NO VERIFICADO: Twilio.** `calls.create`, `machineDetection`, `record` y la aceptación del
  TwiML: escritos con los nombres de `docs-twilio-voice.md`, ejecutados solo contra dobles.
- **⚠️ NO VERIFICADO: el ws-server** no se levantó ni se compiló su imagen.
- **⚠️ NO VERIFICADO: el disparo por etapa de punta a punta.** Drenar la cola está prohibido en
  el encargo. Sí está probado el comportamiento del productor (K1–K8) y el registro real en el
  despachador de eventos.
- **`send_payment_link`** sigue sin pasarela y **`book_meeting`** sigue sin comprobar doble
  reserva ni enviar ICS/WhatsApp.
