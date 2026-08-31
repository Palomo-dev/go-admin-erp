# GoAdmin Revenue OS — Plan maestro del CRM comercial completo

> Fecha: 2026-08-31
> Proyecto Supabase: `jgmgphmzusbluqhuqihj` (378 tablas live verificadas)
> Documentos previos que este plan **continúa** (no reemplaza):
> - `docs/crm-sistema-comercial/ANALISIS-Y-RECOMENDACIONES.md` (diagnóstico V1)
> - `docs/crm-sistema-comercial/PLAN-V2-IMPLEMENTACION-COMERCIAL.md` (plan V2 — Fases 0–5, parcialmente ejecutado)
>
> Este documento (V3 / **Revenue OS**) añade lo que V2 no cubría: **telefonía real, grabación,
> transcripción, análisis IA de llamadas, agentes de voz IA, email propio, motor de
> automatizaciones multicanal, ficha 360° completa, partners/referidos, dashboards de vendedor
> y capa de animación Motion**, y cierra los 30 puntos del método comercial profesional.

---

## 0. Principios innegociables

1. **Cero hardcode, cero datos de otras organizaciones.** Toda tabla nueva lleva `organization_id` + RLS. El CRM de la organización A jamás ve datos de B. GoAdmin es una organización más usando su propio producto.
2. **Todo configurable por organización.** ICP, verticales, etapas, criterios de salida, scoring, razones de pérdida, plantillas, secuencias, voces del agente IA, health score, comisiones: **datos, no código**.
3. **Reutilizar antes de crear.** Ya existen: Kanban DnD + realtime, etapas CRUD, oportunidades con líneas, actividades/tareas/notas polimórficas, cotizaciones con PDF/email, `conversations`/`messages` omnicanal, `automations`, `templates`, `campaigns`, `segments`, `ai_settings`/`ai_credits`, ConversationRelay parcial. Cada feature se monta encima.
4. **Migraciones solo vía MCP de Supabase** (`apply_migration`). Prohibido crear archivos `.sql` en el repo (regla del proyecto).
5. **Honestidad técnica.** Lo que la plataforma no permite (grabar llamadas nativas de iOS, leer call log en Google Play) se documenta como imposible y se resuelve con una arquitectura alternativa real, no con humo.
6. **Frontera de plataforma.** El CRM nunca lee `organizations`, `subscriptions`, `plans`, `sellers*`, `payout*`. Eso vive en `go-admin-super`.
7. **Métricas se calculan** (RPC / materialized views), no se almacenan pre-agregadas.
8. **Consentimiento y compliance primero.** Aviso de grabación obligatorio; opt-out de SMS/WhatsApp/email; Habeas Data; retención configurable de audio.

---

## 1. Mapeo de los 30 puntos del método comercial → fase que los implementa

| # | Punto del método | Dónde se implementa | Capa principal |
|---|---|---|---|
| 1 | Estructura comercial en 7 áreas (Marketing, SDR, AE, Preventa, Onboarding, CS, Partners) | **F1** | BD (`sales_roles`, `sales_teams`) + UI config |
| 2 | No vender "un ERP": posicionamiento por resultado | **F1** | BD (`verticals.positioning`) + playbooks |
| 3 | Definir el ICP (A/B/C) con criterios | **F1** | BD (`icp_profiles`, `icp_criteria`) + motor de fit |
| 4 | Verticales comerciales con landing/demo/script/objeciones/ROI | **F1** | BD (`verticals` extendida, `templates.kind`) + UI |
| 5 | Pipeline de 10 etapas con probabilidad | **F2** | BD (`stages` seed) + UI Kanban |
| 6 | Framework GOC + score 0–100 y bandas | **F2** | `scoring_configs` + `scoringService` (ya existe, se completa) |
| 7 | Discovery antes de demo (wizard de preguntas) | **F2** | BD (`opportunities.discovery_data`, `discovery_templates`) + UI wizard |
| 8 | Demo de 25–40 min guiada por el problema | **F10** | `demo_scripts` (templates) + UI checklist en oportunidad |
| 9 | Biblioteca de demos por vertical | **F10** | `templates.kind='demo_script'` + UI |
| 10 | Propuesta el mismo día | **F10** | `quotations.sections_json` + `proposalService` (ya existe, se completa) |
| 11 | Nunca enviar solo el precio (narrativa de valor + ROI) | **F10** | ROI calculator + secciones narrativas |
| 12 | Pipeline con probabilidades → luego datos históricos | **F2** + **F14** | `opportunity_stage_history` + RPC de conversión real |
| 13 | Regla de oro: no avanzar sin cumplir criterios | **F2** | `stages.exit_criteria` + `stageGateService` (ya existe, se endurece) |
| 14 | Seguimiento automático (día 0,1,3,5,7,10,14,30) | **F8** | Motor de secuencias multicanal |
| 15 | Sistema de seguimiento (último/próximo contacto, canal, resultado, objeción, temperatura) | **F2** + **F4** | Columnas en `opportunities` + auto-relleno desde llamadas |
| 16 | Biblioteca de objeciones | **F2** | `objections` + `templates.kind='objection'` + UI en drawer |
| 17 | Closed Lost obligatorio y estructurado | **F2** | `loss_reasons` (existe) + columnas de competidor/precio/features |
| 18 | Onboarding separado de ventas (handoff) | **F11** | Pipeline `pipeline_type='onboarding'` + ficha de handoff |
| 19 | Onboarding día 0–30 | **F11** | `onboarding_templates` + tareas automáticas |
| 20 | Customer Success con Health Score | **F11** | `health_score_configs`/`snapshots` (existen, se completan) |
| 21 | Renovación 120/90/60/30/15/7 días | **F11** | `renewalService` (existe) + pipeline `renewal` |
| 22 | Expansión (upsell/cross-sell) en pipeline separado | **F11** | `pipeline_type='expansion'` + señales |
| 23 | Programa de referidos | **F12** | `referral_programs`, `referrals` |
| 24 | Programa de partners con niveles | **F12** | `partners`, `partner_tiers`, `partner_deals` |
| 25 | Equipo comercial (Sales Manager, SDR, AE, Onboarding, CS) | **F13** | `sales_roles` + asignación + territorios |
| 26 | Comisión por SQL/demo/venta cobrada, no por cita | **F13** | `vendor_commission_rates` (existe) + `commission_events` |
| 27 | Dashboard por vendedor (actividad, conversión, revenue, calidad) | **F13** | RPC + UI dashboard |
| 28 | KPI Revenue (MRR, ARR, CAC, LTV, churn, win rate, ciclo, ARPA) | **F14** | RPC `fn_revenue_metrics` + UI |
| 29 | Matemática comercial inversa (cuántos SQL para N clientes) | **F14** | Calculadora de capacidad + `sales_targets` |
| 30 | Automatización end-to-end Ads → Landing → CRM → … → Expansión | **F8** + **F1** | Motor de automatizaciones + captura de leads |
| 31 | IA comercial (scoring, resumen de llamadas, email/WhatsApp, forecast, coaching, next action) | **F4** + **F6** + **F8** | Análisis IA de llamadas + agente de voz + generación de contenido |
| 32 | Entidades separadas (Lead→Contacto→Empresa→Oportunidad→…→Expansión) | **F0** + **F9** | Modelo de datos canónico + ficha 360° |
| 33 | Arquitectura del proceso completo | Todas | — |

**Adicionales técnicos pedidos explícitamente por el dueño** (no están en los 30 puntos pero son obligatorios):

| Requisito | Fase |
|---|---|
| Llamar desde el CRM (Web, PWA, Capacitor, Electron) | **F3** |
| Grabar las llamadas | **F3** |
| Transcribir automáticamente | **F4** |
| Calificar la llamada, etiquetarla, crear actividades pendientes y mover etapa automáticamente | **F4** |
| Si llamo desde el celular personal, capturar número + duración + transcripción | **F5** |
| Agente IA con propósito que llame y mueva la oportunidad de etapa | **F6** |
| Crear y personalizar correos | **F7** |
| Automatizar tareas por etapa (llamada, correo, WhatsApp, SMS) | **F8** |
| Detalle de cliente / oportunidad / drawer: ver y subir TODO (actividades, tareas, oportunidades, acciones, documentos, productos) | **F9** |
| Motion (motion.dev) para animaciones | **F15** |
| Funciona en PWA + Capacitor + Electron + Web | **F3** y **F15** |

---

## 2. Arquitectura objetivo

### 2.1 Flujo comercial completo

```
   MARKETING (Meta/Google/TikTok Lead Ads, landing, widget web)
        │  webhook → leadCaptureService → opportunity(record_type='lead')
        ▼
   LEAD SCORING (ICP fit + GOC) ──► asignación automática (round-robin / territorio)
        ▼
   SDR: secuencia multicanal automática (WhatsApp → llamada → email → SMS)
        │  cada toque queda registrado: canal, resultado, objeción, temperatura
        ▼
   CALIFICADO (gate: 10 campos obligatorios + score ≥ umbral)
        ▼
   DISCOVERY (wizard configurable; IA resume la llamada y rellena el wizard)
        ▼
   DEMO (script por vertical; grabación + transcripción + calificación IA)
        ▼
   PROPUESTA (quotation con narrativa + ROI + PDF + Payment Link)
        ▼
   NEGOCIACIÓN (biblioteca de objeciones; IA clasifica la objeción desde la llamada)
        ▼
   CONTRATO/PAGO (firma electrónica + Stripe)
        ├── WON → factura + onboarding + renovación programada + pedir referido
        └── LOST → razón estructurada + competidor + precio + features + fecha recontacto
        ▼
   ONBOARDING (pipeline propio día 0–30)
        ▼
   CUSTOMER SUCCESS (health score → alertas)
        ├── RENOVACIÓN (hitos 120/90/60/30/15/7)
        ├── EXPANSIÓN (pipeline propio: upsell/cross-sell/sede/usuarios/módulo)
        └── REFERIDOS / PARTNERS
        ▼
   REVENUE OS: MRR, ARR, CAC, LTV, churn, win rate, ciclo, ARPA, capacity math
```

### 2.2 Arquitectura de telefonía (la decisión más importante)

```
┌──────────────── CLIENTES (4 entornos) ─────────────────┐
│  Web / PWA / Electron  →  @twilio/voice-sdk (WebRTC)   │
│  Capacitor iOS/Android →  plugin nativo Twilio Voice   │
│                            (fallback: modo puente)     │
└───────────────────────────┬────────────────────────────┘
                            │ AccessToken + VoiceGrant
                            ▼
        /api/voice/token  ·  /api/voice/twiml  ·  /api/voice/status
                            │
                            ▼
                    ┌───────────────┐
                    │    TWILIO     │  ← número por organización (comm_settings)
                    │  Programmable │
                    │     Voice     │
                    └───┬───────┬───┘
        record="true"   │       │  <Connect><ConversationRelay>
        dual-channel    │       │
                        ▼       ▼
              RecordingStatusCallback   ws-server.ts (agente IA de voz)
                        │                    │
                        ▼                    ▼
              /api/voice/recording     OpenAI Realtime / GPT + ElevenLabs TTS
                        │                    │  tools → mover etapa, crear tarea
                        ▼                    ▼
              transcriptionService      opportunities / activities / tasks
              (ElevenLabs Scribe v2 |
               OpenAI gpt-4o-transcribe-diarize |
               Google Chirp 3)
                        │
                        ▼
              callAnalysisService (Gemini 2.5 / GPT)
                → resumen, sentimiento, etiquetas, objeción,
                  score de la llamada, próximos pasos detectados,
                  sugerencia de cambio de etapa
                        │
                        ▼
              calls · call_transcripts · call_analyses · activities · tasks
```

**Llamada desde el celular personal — la verdad técnica:**

| Lo que se pidió | Realidad | Solución adoptada |
|---|---|---|
| Leer el call log del móvil | ❌ Google Play rechaza `READ_CALL_LOG` salvo que la app sea el dialer por defecto. iOS no expone el número de llamadas celulares. | **Click-to-call de dos patas** (F5) |
| Grabar la llamada del móvil | ❌ Android bloquea `VOICE_CALL` a apps no-sistema desde API 29. iOS lo prohíbe por diseño. | **Twilio graba ambas patas** |
| Tomar la duración | ⚠️ iOS `CXCallObserver` sí da duración pero no número; Android sí pero requiere permiso rechazable. | **Twilio `CallDuration` del StatusCallback** |

**Cómo funciona el click-to-call de dos patas** (única vía real, legal y multiplataforma):
1. El vendedor pulsa "Llamar" en el CRM (o marca desde su móvil el número Twilio de la org).
2. Twilio **llama primero al móvil personal** del vendedor (`to: agent_phone`, `from: org_twilio_number`).
3. Al contestar, el TwiML hace `<Dial record="true">` hacia el cliente y reproduce el aviso de grabación.
4. Twilio devuelve `CallSid`, `From`, `To`, `CallDuration`, `RecordingUrl` → el CRM tiene todo.
5. Se transcribe, se analiza, se califica, se etiqueta, se crean tareas y se sugiere/aplica el cambio de etapa.

Resultado: el vendedor habla desde su celular como siempre, y el CRM **igual** obtiene número, duración, grabación, transcripción y análisis. Complemento opcional en F5: modo "conferencia inversa" y registro manual con subida de audio.

### 2.3 Decisiones de proveedor (por función)

| Función | Proveedor elegido | Alternativa configurable | Por qué |
|---|---|---|---|
| Telefonía PSTN + WebRTC | **Twilio** (ya integrado, `twilio@5.12.1`) | — | Único que cubre Web/PWA/Electron/Capacitor/PSTN con un backend |
| Grabación | **Twilio Recording** dual-channel | — | Dual-channel por defecto → diarización gratis |
| STT / transcripción | **ElevenLabs Scribe v2** (`$0.22/h`, diarización 32 hablantes, `spa`) | OpenAI `gpt-4o-transcribe-diarize` ($0.006/min) · Google Chirp 3 ($0.003/min batch) | Mejor precisión en español + roles agent/customer |
| TTS voz humana | **ElevenLabs** `eleven_v3_conversational` (calidad) / `eleven_flash_v2_5` (~75 ms) | OpenAI `gpt-4o-mini-tts` · Gemini TTS | Voces clonadas y naturales |
| Agente de voz IA | **Twilio ConversationRelay + OpenAI Realtime + ElevenLabs TTS** (ya hay base) | ElevenLabs Agents (integración Twilio nativa) | Control total + reutiliza `conversationRelayHandler.ts` |
| Análisis de llamada | **Gemini 2.5 Flash** (barato, contexto grande) | GPT-4o / gpt-5 | Resumen + sentimiento + extracción de next steps |
| Imagen / video | **Google Imagen 4 / Veo 3** | OpenAI (DALL·E ya integrado) | Ya hay `generate-image` con DALL·E |
| Email | **Resend + React Email** | SendGrid (ya integrado, se mantiene como fallback) | DX, idempotencia, webhooks Svix, API key por dominio → multi-tenant real |
| WhatsApp | **Meta Cloud API directa** (ya integrada) | Twilio WhatsApp · Baileys QR (ya integrado) | Sin markup de $0.005/msg |
| SMS | **Twilio Programmable Messaging** (ya integrado) | — | Messaging Services + opt-out automático |
| Animaciones | **`motion` (motion/react)** | — | Sucesor de Framer Motion; `m` + `LazyMotion` = 4.6 KB |
| Agendamiento | **Cal.com API v2** | Google Calendar API | Embeddable con marca de la org |
| Video demo | **Daily.co** (grabación + transcripción) | Google Meet API · Zoom | UX embebida y transcripción incluida |
| Firma electrónica | **Documenso** (self-host / API) | DocuSign · Dropbox Sign | Open source, multi-tenant friendly |
| Enriquecimiento B2B | **Apollo.io** | People Data Labs | Clearbit ya no existe standalone |
| Analítica de producto | **PostHog** (1M eventos gratis) | — | Alimenta el health score con uso real |
| Lead Ads | **Meta `leadgen` webhook + Google Ads Lead Form + TikTok** | — | Alimenta el pipeline sin trabajo manual |
| Pagos para cerrar | **Stripe Payment Links / Checkout** (ya integrado) | Wompi/Bold (ya integrados) | Cierre en un clic |

Todos los proveedores se resuelven por **registry configurable por organización** (`provider_configs`), nunca por `if (provider === 'twilio')` disperso en el código.

---

## 3. Estado real hoy (verificado, no supuesto)

### 3.1 Lo que YA funciona

| Área | Estado |
|---|---|
| Kanban pipeline con DnD + realtime | ✅ `KanbanBoard.tsx` (`@hello-pangea/dnd`) |
| Etapas configurables + `exit_criteria` + `is_won`/`is_lost` + `sla_days` | ✅ BD + `StageManager.tsx` + `GateWarningDialog.tsx` |
| Oportunidades con productos/espacios/conceptos | ✅ `opportunity_products`, `opportunity_spaces`, `opportunity_custom_lines` |
| Scoring GOC | ✅ `scoring_configs` + `scoringService` + `ScoringSection.tsx` |
| Razones de pérdida estructuradas | ✅ `loss_reasons` + `StructuredLossDialog.tsx` |
| Histórico de etapas | ✅ `opportunity_stage_history` + trigger |
| Health score | ✅ `health_score_configs`/`_snapshots` + `SaludView.tsx` |
| Página "Hoy" | ✅ `/app/crm/hoy` + `followupService` |
| Propuestas | ✅ `quotations.opportunity_id` + `sections_json` + `ProposalBuilderDialog.tsx` |
| Onboarding / renovaciones / expansión / referidos (servicios) | 🟡 Servicios existen; UI mínima |
| Métricas comerciales | 🟡 `commercialMetricsService` + `/app/crm/metricas` |
| Omnicanal (conversations/messages) | ✅ WhatsApp Cloud + Twilio SMS/WA + Baileys QR |
| IA en conversaciones | ✅ `/api/chat/ai/*` (respuesta, resumen, intención, auto-respuesta) |
| IA comercial | 🟡 `/api/crm/ia/next-action`, `/api/crm/ia/discovery-summary` (sin validación multi-tenant) |
| Transcripción de audio | 🟡 `/api/ai-assistant/transcribe` (Whisper, sin org, sin persistencia) |
| Agente de voz IA entrante | 🟡 `ConversationRelay` + `conversationRelayHandler.ts` + `ws-server.ts` |
| ElevenLabs TTS / Deepgram STT | 🟡 Código escrito, **desconectado** del flujo activo |
| Créditos de IA y comunicación | ✅ `ai_settings`/`ai_credits*`, `comm_settings`/`comm_usage_logs` |

### 3.2 Lo que NO existe (huecos verificados)

**Base de datos — tablas que faltan:**
`calls`, `call_recordings`, `call_transcripts`, `call_analyses`, `call_tags`, `voice_agents`, `voice_agent_calls`, `sequences`, `sequence_steps`, `sequence_enrollments`, `sequence_step_runs`, `documents`, `icp_profiles`, `icp_criteria`, `sales_roles`, `sales_teams`, `territories`, `objections`, `discovery_templates`, `demo_scripts`, `partners`, `partner_tiers`, `partner_deals`, `referral_programs`, `referrals`, `onboarding_templates`, `sales_targets`, `commission_events`, `provider_configs`, `email_domains`, `email_messages`, `email_events`, `roi_calculators`, `contract_signatures`, `call_consents`.

**Columnas que faltan:**
`opportunities`: `record_type`, `last_contact_at`, `contact_channel`, `contact_result`, `objection_id`, `loss_reason_value`, `competitor_name`, `competitor_price`, `missing_features`, `recontact_at`, `discovery_data`, `icp_band`, `icp_fit_score`, `deal_type`, `owner_role`, `sequence_id`.
`templates`: `metadata` jsonb.
`verticals`: `slug`, `color`, `sort_order`, `positioning`, `metadata`.
`customers`: `lifecycle_stage`, `company_size`, `branches_count`, `current_software`.
`stages`: eliminar `display_order` (duplicado de `position`).

**Backend que falta:**
Llamadas salientes (click-to-call), token de Voice SDK, TwiML app, recording callback, transcripción persistente, análisis de llamada, agente de voz saliente con propósito, motor de secuencias multicanal, Resend, editor de plantillas, subida de documentos polimórfica, RPCs de revenue, captura de Lead Ads.

**UI que falta:**
Dialer/softphone, historial de llamadas con player + transcripción, tab Documentos, editor visual de emails, editor visual de automatizaciones por etapa, panel de agentes IA de voz, biblioteca de objeciones, wizard de discovery, dashboards de vendedor, partners/referidos, `/app/crm/configuracion`, `/app/crm/leads`, `/app/crm/llamadas`, `/app/crm/conversaciones` (índice). **Cero animaciones Motion** (no está instalado).

### 3.3 Bugs verificados que bloquean calidad

| # | Bug | Archivo | Severidad |
|---|---|---|---|
| G1 | `callService.ts` usa `SUPABASE_SERVICE_ROLE_KEY` en cliente compartido y **hardcodea `organizationId: 1`** | `src/lib/services/callService.ts:270,292` | 🔴 crítico (fuga cross-tenant) |
| G2 | `callService.ts` consulta tabla inexistente `user_profiles` | `src/lib/services/callService.ts:262` | 🔴 crítico |
| G3 | `/api/crm/ia/*` no valida que la oportunidad sea de la org del usuario | `src/app/api/crm/ia/*/route.ts` | 🔴 crítico |
| G4 | `/api/ai-assistant/transcribe` sin auth, sin org, sin límite de tamaño, sin créditos | `src/app/api/ai-assistant/transcribe/route.ts` | 🔴 alto |
| G5 | Webhooks legacy `/api/webhooks/{voip,sms,email}/twilio` responden "desactivado" pero `docs/VOIP_SETUP.md` los documenta como activos | 3 routes | 🟠 medio |
| G6 | `.env.example` no declara ninguna variable de Twilio/OpenAI/ElevenLabs/Deepgram/SendGrid/service-role | `.env.example` | 🟠 medio |
| G7 | `stages` tiene `position` **y** `display_order` (deriva de datos) | BD | 🟠 medio |
| G8 | `/app/crm/configuracion` linkeado en `CRMQuickNav.tsx:112` pero la ruta no existe | UI | 🟡 bajo |
| G9 | `/app/crm/clientes/[id]` es una vista pobre que ignora la ficha 360° de `/app/clientes/[id]` | UI | 🟠 medio |
| G10 | `AutomationsView.tsx` anuncia "configuración avanzada por etapa próximamente" | UI | 🟠 medio |
| G11 | `elevenLabsTTS.ts`, `deepgramSTT.ts`, `realtimeSession.ts` son código muerto no cableado | 3 archivos | 🟡 bajo |
| G12 | `verticals` en BD no tiene `slug`/`color`/`sort_order` que el plan V2 especificaba | BD | 🟡 bajo |

---

## 4. Las 16 fases

| Fase | Nombre | Documento | Esfuerzo | Valor | Depende de |
|---|---|---|---|---|---|
| **F0** | Fundaciones, higiene y registry de proveedores | `FASE-00-FUNDACIONES.md` | S | 🔴 Crítico | — |
| **F1** | Estructura comercial: ICP, verticales, roles, playbooks | `FASE-01-ESTRUCTURA-COMERCIAL.md` | M | Alto | F0 |
| **F2** | Pipeline profesional: gates, scoring, discovery, objeciones, closed-lost | `FASE-02-PIPELINE-PROFESIONAL.md` | M | Muy alto | F0, F1 |
| **F3** | Telefonía en el CRM: softphone multiplataforma + grabación | `FASE-03-TELEFONIA-CRM.md` | L | Muy alto | F0 |
| **F4** | Transcripción, análisis IA y calificación automática de llamadas | `FASE-04-TRANSCRIPCION-ANALISIS-IA.md` | L | Muy alto | F3 |
| **F5** | Llamadas desde el celular personal (click-to-call de 2 patas) | `FASE-05-LLAMADAS-MOVIL-PERSONAL.md` | M | Alto | F3, F4 |
| **F6** | Agente de IA de voz con propósito | `FASE-06-AGENTE-IA-VOZ.md` | L | Alto | F3, F4 |
| **F7** | Email propio: Resend, React Email y editor de plantillas | `FASE-07-EMAIL-Y-PLANTILLAS.md` | M | Alto | F0 |
| **F8** | Motor de automatizaciones y secuencias multicanal por etapa | `FASE-08-AUTOMATIZACIONES-SECUENCIAS.md` | L | Muy alto | F2, F3, F7 |
| **F9** | Ficha 360°: cliente, oportunidad y drawer con TODO | `FASE-09-FICHA-360.md` | L | Muy alto | F2, F4 |
| **F10** | Demo, propuesta, contrato y pago | `FASE-10-PROPUESTA-CONTRATO-PAGO.md` | M | Alto | F2, F7, F9 |
| **F11** | Post-venta: onboarding, activación, health, renovación, expansión | `FASE-11-POSTVENTA.md` | M | Alto | F2, F8 |
| **F12** | Referidos y partners | `FASE-12-REFERIDOS-PARTNERS.md` | M | Medio | F11 |
| **F13** | Equipo, cuotas, comisiones y dashboard de vendedor | `FASE-13-EQUIPO-COMISIONES.md` | M | Alto | F2, F14 |
| **F14** | Revenue OS: métricas, forecast y matemática comercial | `FASE-14-REVENUE-OS.md` | M | Alto | F2, F11 |
| **F15** | Motion UX + cross-platform (PWA / Capacitor / Electron) | `FASE-15-MOTION-CROSS-PLATFORM.md` | M | Medio-alto | F0 |

Esfuerzo: S = 1–3 días · M = 1 semana · L = 2 semanas.

### 4.1 Orden de ejecución recomendado

```
Semana 1     F0  (higiene + registry + Motion instalado + env vars)
Semana 2     F1  ·  F2            (paralelizables: config vs pipeline)
Semanas 3-4  F3                   (telefonía — la pieza más pesada)
Semana 5     F4                   (transcripción + análisis IA)
Semana 6     F5  ·  F7            (paralelizables: móvil vs email)
Semanas 7-8  F6  ·  F8            (agente IA voz vs motor de secuencias)
Semanas 9-10 F9                   (ficha 360°)
Semana 11    F10 ·  F15           (propuesta/contrato vs Motion UX)
Semana 12    F11
Semana 13    F12 ·  F13
Semana 14    F14
```

Regla de corte: **no se inicia una fase con la anterior sin calificación ≥ 9.5 en producción.**

### 4.2 Agrupación en las 4 fases macro del método

| Fase macro del método | Fases técnicas |
|---|---|
| **FASE 1 — Fundamentos** (semana 1–2) | F0, F1, F2 |
| **FASE 2 — Máquina comercial** (semana 3–8) | F3, F4, F5, F6, F7, F8 |
| **FASE 3 — Customer Success** (semana 9–12) | F9, F10, F11 |
| **FASE 4 — Escalamiento** (semana 13+) | F12, F13, F14, F15 |

---

## 5. Resumen de impacto por capa

### 5.1 Base de datos

| Fase | Tablas nuevas | Columnas nuevas | Otros |
|---|---|---|---|
| F0 | `provider_configs` | `templates.metadata`, `verticals.slug/color/sort_order`, `stages` drop `display_order` | RLS helper `current_org_id()` |
| F1 | `icp_profiles`, `icp_criteria`, `sales_roles`, `sales_teams`, `sales_team_members`, `territories` | `verticals.positioning/metadata`, `customers.company_size/branches_count/current_software/lifecycle_stage`, `opportunities.icp_band/icp_fit_score` | Seeds de ICP A/B/C y 6 verticales |
| F2 | `objections`, `discovery_templates`, `opportunity_objections` | `opportunities.record_type/last_contact_at/contact_channel/contact_result/objection_id/loss_reason_value/competitor_name/competitor_price/missing_features/recontact_at/discovery_data` | Seed pipeline 10 etapas + `exit_criteria` |
| F3 | `calls`, `call_recordings`, `call_consents`, `phone_numbers` | `comm_settings.voice_*` | RLS + índices + trigger `calls`→`activities` |
| F4 | `call_transcripts`, `call_transcript_segments`, `call_analyses`, `call_tags`, `call_tag_relations` | — | `mv_call_quality` |
| F5 | `mobile_call_bridges` | `calls.bridge_mode/agent_leg_sid/customer_leg_sid` | — |
| F6 | `voice_agents`, `voice_agent_calls`, `voice_agent_runs`, `voice_agent_tools` | `calls.voice_agent_id` | — |
| F7 | `email_domains`, `email_messages`, `email_events`, `email_blocks` | `templates` extendida (kind/metadata/blocks_json) | — |
| F8 | `sequences`, `sequence_steps`, `sequence_enrollments`, `sequence_step_runs`, `automation_rules`, `automation_runs` | `opportunities.sequence_id`, `stages.automation_rule_ids` | Cron + `pg_cron` opcional |
| F9 | `documents`, `document_folders` | `activities.channel/outcome/duration_seconds` | Storage bucket `crm-documents` |
| F10 | `roi_calculators`, `contract_signatures`, `demo_sessions` | `quotations.payment_link_url/signature_id` | — |
| F11 | `onboarding_templates`, `onboarding_instances`, `onboarding_steps` | `opportunities.deal_type` | `mv_customer_health` completada |
| F12 | `partners`, `partner_tiers`, `partner_deals`, `referral_programs`, `referrals` | — | — |
| F13 | `sales_targets`, `commission_events` | `vendor_commission_rates.commission_type/notes/created_by` | RPC `fn_seller_dashboard` |
| F14 | — | — | RPC `fn_revenue_metrics`, `fn_funnel_real`, `fn_capacity_math`, `mv_crm_revenue` |
| F15 | — | — | — |

### 5.2 Backend (rutas API nuevas)

```
/api/voice/token                    F3   POST  AccessToken + VoiceGrant por usuario/org
/api/voice/twiml/outbound           F3   POST  TwiML de llamada saliente (con record)
/api/voice/twiml/inbound            F3   POST  TwiML de llamada entrante
/api/voice/twiml/agent-leg          F5   POST  TwiML de la pata del agente (click-to-call)
/api/voice/call                     F3   POST  Iniciar llamada (browser o bridge móvil)
/api/voice/call/[id]                F3   GET/PATCH  Estado, mute, hold, transferir, colgar
/api/voice/status                   F3   POST  StatusCallback de Twilio
/api/voice/recording                F3   POST  RecordingStatusCallback
/api/voice/recording/[id]/stream    F3   GET   Proxy firmado del audio (nunca URL Twilio directa)
/api/crm/calls                      F3   GET   Historial con filtros
/api/crm/calls/[id]/transcribe      F4   POST  Forzar/reintentar transcripción
/api/crm/calls/[id]/analyze         F4   POST  Forzar/reintentar análisis
/api/crm/calls/[id]/apply-actions   F4   POST  Aplicar acciones sugeridas (tareas, etapa)
/api/crm/calls/manual               F5   POST  Registrar llamada manual + subir audio
/api/voice/agents                   F6   CRUD  Agentes IA de voz
/api/voice/agents/[id]/dispatch     F6   POST  Encolar llamadas con propósito
/api/voice/relay                    F6   WS    ConversationRelay (ws-server.ts)
/api/email/send                     F7   POST  Envío vía Resend con idempotencia
/api/email/webhook                  F7   POST  Webhook Resend (Svix)
/api/email/domains                  F7   CRUD  Dominios por organización
/api/email/preview                  F7   POST  Render de plantilla a HTML
/api/crm/sequences                  F8   CRUD  Secuencias
/api/crm/sequences/[id]/enroll      F8   POST  Inscribir oportunidad/cliente
/api/crm/sequences/run              F8   POST  Cron: ejecutar pasos vencidos
/api/crm/automations/rules          F8   CRUD  Reglas por etapa
/api/crm/automations/execute        F8   POST  Ejecutar regla (evento)
/api/crm/documents                  F9   CRUD  Documentos polimórficos + upload
/api/crm/leads/capture              F8   POST  Webhook genérico de Lead Ads
/api/crm/leads/capture/meta         F8   GET/POST  Meta leadgen
/api/crm/leads/capture/google       F8   POST  Google Ads Lead Form
/api/crm/contracts/sign             F10  POST  Enviar a firma
/api/crm/contracts/webhook          F10  POST  Webhook de firma
/api/crm/roi                        F10  POST  Calculadora de ROI
/api/crm/onboarding/instantiate     F11  POST  Crear instancia desde plantilla
/api/crm/partners                   F12  CRUD
/api/crm/referrals                  F12  CRUD
/api/crm/targets                    F13  CRUD  Cuotas
/api/crm/dashboard/seller           F13  GET   Dashboard de vendedor
/api/crm/revenue/metrics            F14  GET   MRR/ARR/CAC/LTV/churn/win-rate/ciclo/ARPA
/api/crm/revenue/capacity           F14  POST  Matemática comercial inversa
```

### 5.3 UI (rutas nuevas)

```
/app/crm/configuracion              F0   Hub que deep-linkea a /app/configuracion?modulo=crm
/app/crm/leads                      F2   Bandeja de leads (record_type='lead')
/app/crm/llamadas                   F3   Historial + player + transcripción + análisis
/app/crm/agentes-ia                 F6   Panel de agentes de voz IA + campañas
/app/crm/plantillas                 F7   Editor de plantillas email/WA/SMS
/app/crm/secuencias                 F8   Editor de secuencias multicanal
/app/crm/objeciones                 F2   Biblioteca de objeciones
/app/crm/onboarding                 F11  Kanban de onboarding
/app/crm/partners                   F12  Partners y referidos
/app/crm/equipo                     F13  Equipo, cuotas, comisiones
/app/crm/revenue                    F14  Dashboard Revenue OS
/app/crm/conversaciones             F9   Índice omnicanal (reusa /app/chat/bandeja)
```

Componentes globales nuevos de mayor impacto: `SoftphoneProvider` + `SoftphoneDock` (F3, montado en el layout de la app), `CallTranscriptViewer` (F4), `DocumentsTab` (F9), `EmailTemplateEditor` (F7), `SequenceBuilder` (F8), `MotionPrimitives` (F15).

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Costos de IA/telefonía se disparan | Todo pasa por `comm_usage_logs`/`ai_usage_logs` + créditos por org (ya existe); límites duros por organización y por usuario; presupuesto mensual configurable |
| Grabar sin consentimiento = delito en Colombia | Aviso `<Say>` obligatorio no desactivable + `call_consents` + bloqueo de grabación si la org no lo habilita |
| Fuga cross-tenant en webhooks (service-role) | Resolver `organization_id` **solo** desde el número/`CallSid` persistido; nunca default `1`; test automatizado que falla si aparece un default |
| ConversationRelay + ElevenLabs en español tiene limitaciones documentadas | Doble camino: ConversationRelay nativo (rápido) y ElevenLabs Agents (calidad); seleccionable por org en `voice_agents.engine` |
| Capacitor sin SDK Twilio oficial | Plan A: plugin propio envolviendo SDK nativo. Plan B: `@capgo/capacitor-twilio-voice`. Plan C (siempre disponible): modo bridge de F5, que no necesita SDK |
| Motion agregado a listas grandes degrada performance | `m` + `LazyMotion`, `whileInView once`, virtualización ya presente (`react-virtuoso`), prohibido animar layout en Kanban con >100 tarjetas |
| Alcance se infla | Ninguna fase arranca sin la anterior en ≥9.5; cada fase tiene Definition of Done verificable |
| Doble motor de automatización (`automations` viejo vs `automation_rules` nuevo) | F8 migra `automations` a `automation_rules` y elimina el viejo; no coexisten |

---

## 7. Definition of Done global

El CRM se considera completo cuando, **con datos de una organización de prueba distinta a GoAdmin**:

1. Un anuncio de Meta genera un lead en el Kanban con `source='meta_ads'`, ICP calculado y SDR asignado automáticamente.
2. El SDR pulsa "Llamar" en el drawer y habla desde el navegador; al colgar existe grabación, transcripción diarizada, resumen, etiquetas, calificación de la llamada, y una tarea creada automáticamente con fecha.
3. El mismo SDR, desde su celular personal, hace la llamada vía click-to-call y obtiene exactamente los mismos artefactos.
4. Un agente IA de voz con propósito "confirmar asistencia a demo" llama solo, conversa, y mueve la oportunidad de etapa vía tool.
5. Al mover la oportunidad a "Demo realizada" se disparan automáticamente: email con React Email personalizado de la organización, WhatsApp con plantilla aprobada, y tarea de seguimiento a 48 h.
6. La oportunidad no puede pasar a "Propuesta enviada" sin cotización vinculada (gate).
7. Ganar la oportunidad genera factura, instancia de onboarding, renovación programada y tarea de pedir referido.
8. El dashboard de vendedor muestra actividad, conversión por etapa, revenue y calidad; el Revenue OS muestra MRR/ARR/CAC/LTV/churn/win-rate/ciclo/ARPA y la matemática inversa de capacidad.
9. Todo lo anterior funciona en Web, PWA, Electron y Capacitor (llamadas con SDK o con bridge).
10. `npm run lint`, `tsc --noEmit` y `npm test` limpios; cero referencias a `organizationId = 1`; cero archivos `.sql` en el repo.

---

## 8. Índice de documentos

| Documento | Contenido |
|---|---|
| `PLAN.md` | Este documento — resumen de las 16 fases |
| `ANEXO-A-INVENTARIO-ACTUAL.md` | Inventario verificado de UI / BD / backend existente |
| `ANEXO-B-PROVEEDORES-Y-APIS.md` | Documentación condensada de Twilio, ElevenLabs, OpenAI, Google, Resend, WhatsApp, SMS, Motion e integraciones extra |
| `FASE-00-FUNDACIONES.md` … `FASE-15-MOTION-CROSS-PLATFORM.md` | Una fase por documento: objetivo, BD (SQL exacto vía MCP), backend (rutas y servicios que se crean/modifican), UI (componentes que se crean/modifican con ruta real), pruebas, Definition of Done |

El seguimiento de estado, rondas y calificaciones vive en `PROGRESS.md` (raíz), gestionado por el comando `/loop`.
