# PROMPT MAESTRO — CRM Revenue OS v4 (GoAdmin ERP)

> **Cómo usar este prompt:** pégalo completo como primer mensaje de la sesión del agente
> (Claude Code / Devin / Cursor) con acceso al repo `go-admin-erp` y al MCP de Supabase.
> Si vas a ejecutar por rondas, invócalo con `/loop @.devin/workflows/loop.md`.
> El bloque §2 (Estado real verificado) es **hallazgo de auditoría del 2026-09-08**, no
> suposición: úsalo como línea base y **vuelve a verificarlo** antes de escribir nada.

---

## 1. Rol y encargo

Eres el arquitecto técnico principal del módulo **CRM de GoAdmin ERP** (Next.js 15.5.7
App Router + React 19 + TypeScript 5.8 + Supabase/Postgres 15 multi-tenant + Tailwind +
shadcn/Radix + Capacitor + Electron).

**Tu encargo tiene dos entregables, en este orden:**

**(A) Auditoría de reconciliación.** Un documento
`docs/crm-revenue-os/ANEXO-C-RECONCILIACION-2026-09.md` que compare, línea por línea, lo
que el plan actual (`docs/crm-revenue-os/PLAN.md` + `FASE-00..15` + `ANEXO-A` + `ANEXO-B`)
declara pendiente **contra lo que realmente existe hoy** en la base de datos, el backend y
la UI. Cada afirmación debe llevar evidencia: nombre de tabla + conteo real de políticas y
filas, ruta de archivo + número de línea, o resultado de un `grep`. Prohibido escribir
"existe" o "falta" sin evidencia citada.

**(B) Plan maestro v4 reescrito.** Sustituye `docs/crm-revenue-os/PLAN.md` y los
documentos de fase por un plan **basado en el estado real**, no en el estado de agosto.
El objetivo del plan es que el CRM pase de "todo construido pero nada conectado" a
"flujo comercial completo funcionando end-to-end en producción".

> **Regla que ordena todo el trabajo:** el problema del CRM hoy **no es que falte código**.
> Es que el código existe, está desconectado, sin configurar y sin UI que lo invoque.
> Un plan que proponga "crear la tabla `calls`" o "crear `/api/voice/token`" es un plan
> equivocado: ambos ya existen. El plan v4 debe ser un plan de **cableado, configuración,
> UI y verificación**, no de scaffolding.

---

## 2. Estado real verificado (auditoría 2026-09-08) — punto de partida

### 2.1 Base de datos — Supabase `jgmgphmzusbluqhuqihj` ("Go Admin ERP", Postgres 15.8.1, us-west-1)

**~1.521 migraciones aplicadas.** Las migraciones `f0_*` a `f14_*` del plan **ya se
ejecutaron todas**, entre ellas:

```
f0_create_provider_configs · f0_create_current_org_id_fn · f0_add_templates_metadata_verticals_columns
f0_drop_stages_display_order · f0_rls_policies_for_six_tables · f0_stages_prob_int_final
f1_create_sales_roles_teams_territories · f1_create_icp_profiles_criteria · f1_add_columns_and_backfill_lifecycle
f2_opportunities_columns_and_closed_at · f2_objections_and_opportunity_objections · f2_discovery_templates
f2_fn_sync_status_from_stage · f2_activities_channel_outcome
f3_create_calls_table · f3_call_recordings_consents_phone_numbers · f3_comm_settings_voice_columns
f4_transcripts_and_segments · f4_call_analyses · f4_call_tags_and_relations · f4_fn_call_quality_and_indexes
f5_mobile_call_bridges_and_calls_columns · f6_voice_agents_and_campaigns
f7_email_domains_messages_events · f8_sequences_and_automation_rules · f9_documents_and_folders
f10_roi_contracts_demos_quotations_columns · f11_onboarding_and_fn_customer_health
f12_referrals_and_partners · f13_sales_targets · f14_revenue_metrics_function · f14_pipeline_funnel_and_cohort
```

**Consecuencia directa:** la sección "3.2 Lo que NO existe" del `PLAN.md` actual está
**obsoleta**. Todas estas tablas existen hoy con RLS activo y políticas:

`calls` (4 pols) · `call_recordings` (4) · `call_transcripts` (4) · `call_transcript_segments` (3) ·
`call_analyses` (4) · `call_tags` (4) · `call_tag_relations` (3) · `call_consents` (2) ·
`phone_numbers` (4) · `mobile_call_bridges` (3) · `voice_agents` (4) · `voice_agent_calls` (4) ·
`voice_agent_campaigns` (4) · `sequences` (4) · `sequence_steps` (4) · `sequence_enrollments` (4) ·
`sequence_step_runs` (3) · `automation_rules` (4) · `automation_runs` (3) · `email_domains` (4) ·
`email_messages` (4) · `email_events` (2) · `documents` (4) · `document_folders` (4) ·
`icp_profiles` (4) · `icp_criteria` (4) · `sales_roles` (4) · `sales_teams` (4) ·
`sales_team_members` (4) · `sales_targets` (4) · `territories` (4) · `objections` (4) ·
`opportunity_objections` (4) · `discovery_templates` (4) · `demo_sessions` (3) ·
`roi_calculators` (4) · `contract_signatures` (3) · `onboarding_templates` (4) ·
`onboarding_instances` (3) · `onboarding_steps` (3) · `partners` (4) · `partner_tiers` (4) ·
`partner_deals` (3) · `referral_programs` (4) · `referrals` (3) · `provider_configs` (4)

**Zonas de sospecha que DEBES verificar antes de dar nada por bueno:**

1. **Tablas con una sola política** — el bug G13 del plan viejo puede estar resuelto solo
   a medias. Verifica qué comandos cubre esa única política (`SELECT`/`INSERT`/`UPDATE`/
   `DELETE` o `ALL`) en: `scoring_configs`, `loss_reasons`, `verticals`,
   `health_score_configs`, `health_score_snapshots`, `opportunity_stage_history`,
   `opportunity_products`, `opportunity_spaces`, `comm_usage_logs`, `ai_credit_purchases`.
   Consulta sugerida:
   ```sql
   select tablename, policyname, cmd, roles, qual, with_check
   from pg_policies
   where schemaname='public'
     and tablename in ('scoring_configs','loss_reasons','verticals','health_score_configs',
                       'health_score_snapshots','opportunity_stage_history',
                       'opportunity_products','opportunity_spaces','comm_usage_logs')
   order by tablename, cmd;
   ```
2. **Tablas de configuración vacías** — `loss_reasons`, `verticals`, `scoring_configs`,
   `objections`, `discovery_templates`, `call_tags`, `onboarding_templates`,
   `referral_programs`, `partner_tiers`, `provider_configs`, `comm_settings` reportan
   **0 filas**. Sin seeds, la funcionalidad existe pero la UI aparece vacía y el usuario
   percibe que "no funciona". **Verifica con `count(*)` real**, no con `n_live_tup`
   (las estadísticas del planner pueden estar desactualizadas: `opportunities`, `stages`
   y `pipelines` reportan 0 y eso probablemente sea stats viejas — confírmalo).
3. **Tablas con datos reales**: `conversations` ≈ 20.456 · `messages` ≈ 4.344 ·
   `tasks` ≈ 783 · `ai_jobs` ≈ 2.180 · `ai_usage_logs` ≈ 2.172 · `ai_settings` = 38.
   El omnicanal ya está vivo; el CRM debe **enchufarse a eso**, no crear un canal paralelo.
4. Corre `get_advisors` (security y performance) del MCP de Supabase y trata cada
   hallazgo como parte del alcance.

### 2.2 Backend — existe casi todo

**Telefonía (`src/app/api/voice/`) — completo:**
```
token/route.ts · call/route.ts · status/route.ts · recording/route.ts · recording/[id]/stream/route.ts
twiml/outbound · twiml/inbound · twiml/agent-leg · twiml/customer-leg · twiml/ai-agent
bridge/initiate · bridge/status
```

**CRM (`src/app/api/crm/`) — ~120 rutas ya escritas**, incluyendo:
`calls`, `calls/[id]/{transcribe,transcript,analyze,analysis/apply,tags}`, `call-tags`,
`call-quality`, `phone-numbers`, `voice-agents/**`, `voice-agents/campaigns/run`,
`voice-agent-calls`, `sequences/**`, `sequences/run`, `automation-rules/**`,
`automation-runs`, `documents/**`, `transcribe`, `revenue/{metrics,funnel,cohorts,kpis,dashboard}`,
`icp/**`, `teams/**`, `territories/**`, `roles/**`, `objections/**`, `discovery/**`,
`onboarding/**`, `partners/**`, `referrals/**`, `roi/**`, `contracts/**`, `demos/**`,
`finance/[type]/[id]`, `sales-targets/**`, `commissions/**`, `leads/**`,
`pipeline-templates/[id]/import`, `scoring/config`, `stages/[id]/gate`, `timeline/[type]/[id]`.

**Servicios (`src/lib/services/crm/`) — 50 archivos**, entre ellos
`callManagementService`, `callAnalysisService`, `transcriptionService`,
`recordingStorageService`, `consentService`, `mobileBridgeService`, `voiceAgentService`,
`voiceAgentTools`, `voiceTokenService`, `emailService`, `sequenceService`,
`automationService`, `documentService`, `stageGateService`, `scoringService`,
`icpService`, `healthScoreService`, `revenueOsService`, `crmFinanceService`,
`onboardingService`, `renewalService`, `expansionService`, `partnerService`,
`referralsService`, `commissionService`, `pipelineTemplates`, `pipelineSeedService`.

**Motor de voz (`src/lib/services/integrations/twilio/voiceAgent/`):**
`conversationRelayHandler.ts`, `realtimeSession.ts`, `elevenLabsTTS.ts`, `deepgramSTT.ts`,
`voiceAgentPrompts.ts`, `voiceAgentTools.ts`, `voiceAgentService.ts` + `ws-server.ts` en la
raíz (script `npm run ws:dev`).

### 2.3 UI — aquí está el hueco real

**Existe** `src/components/voice/`: `SoftphoneProvider.tsx` (12 KB),
`SoftphoneDock.tsx` (12,7 KB), `CallButton.tsx`, `CallPlayer.tsx`, `CallsTable.tsx`,
`IncomingCallToast.tsx`.

**Los 6 hallazgos que explican por qué "no funciona":**

| # | Hallazgo | Evidencia |
|---|---|---|
| **H1** | `SoftphoneProvider` y `SoftphoneDock` se montan **únicamente** en `/app/crm/llamadas/page.tsx`. El layout de la app (`src/app/app/layout.tsx`) solo monta `MotionProvider`. ⇒ desde el pipeline o el detalle de la oportunidad **no hay softphone**. | `grep -rn "SoftphoneProvider" src` devuelve solo `llamadas/page.tsx`; `src/app/app/layout.tsx:18` monta solo `MotionProvider` |
| **H2** | `CallButton` **no se usa en ningún archivo** fuera de `src/components/voice/`. Es código muerto. | `grep -rn "CallButton" src --include=*.tsx` sin resultados externos |
| **H3** | El drawer llama a `/api/integrations/twilio/click-to-call`, un endpoint **distinto** del stack `/api/voice/*`; su modo por defecto es `"manual"`. ⇒ no crea fila en `calls`, no graba, no dispara transcripción ni análisis. | `src/components/crm/pipeline/drawer/ActivityActions.tsx:230,272` |
| **H4** | `OpportunityDrawer.tsx` (45 KB) y `OpportunityDetail.tsx` (67 KB) no tienen sistema de tabs; no existe `CallTranscriptViewer`, ni timeline unificado llamada→grabación→transcripción→análisis→actividad. | `grep -n "TabsTrigger" OpportunityDrawer.tsx` sin resultados |
| **H5** | **No existen** `src/components/crm/{email,plantillas,secuencias,agentes}`. Faltan las rutas `/app/crm/{agentes-ia,plantillas,secuencias,objeciones,onboarding,partners}`. `ObjecionesList.tsx` existe pero **sin página que lo renderice**. | `ls src/app/app/crm` → solo `actividades campanas clientes equipo identidades leads llamadas oportunidades pipeline pronostico salud segmentos` |
| **H6** | `.env.local` **no tiene** `TWILIO_API_KEY`, `TWILIO_API_SECRET` ni `TWILIO_TWIML_APP_SID`. Sin ellos `/api/voice/token` **no puede firmar el AccessToken** ⇒ el softphone WebRTC no puede funcionar aunque estuviera montado. | `grep -oE "^[A-Z_0-9]+=" .env.local` |

**Variables SÍ presentes en `.env.local`:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_VERIFY_SERVICE_SID`,
`TWILIO_WEBHOOK_BASE_URL`, `TWILIO_MASTER_*`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`,
`ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`, `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`,
`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`,
`GOOGLE_AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WS_SERVER_URL`, `WS_PORT`,
`META_APP_ID/SECRET`, `WHATSAPP_VERIFY_TOKEN`, `NEXT_PUBLIC_WHATSAPP_CONFIG_ID`,
`EVOLUTION_API_URL/KEY`, `POSTHOG_KEY`, `CALCOM_API_KEY`, `DAILY_API_KEY`,
`DOCUMENSO_API_KEY`, `APOLLO_API_KEY`.

**Variables FALTANTES** (además de las tres de H6): `TWILIO_PUSH_CREDENTIAL_SID_IOS/ANDROID`,
`OPENAI_MODEL`, `OPENAI_REALTIME_MODEL`, `ELEVENLABS_SCRIBE_MODEL`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `GOOGLE_APPLICATION_CREDENTIALS`,
`SENDGRID_API_KEY`.

### 2.4 Deuda técnica visible

En la raíz hay `errors.txt` (14 KB), `tsc_out.txt` (146 KB), `tsc_phase4.txt`,
`tsc_phase4_v2.txt` (179 KB), `build_output.txt` — indicios de errores de TypeScript sin
resolver. **Ábrelos, clasifícalos y decide** qué entra al alcance (los que tocan CRM/voz
entran sí o sí). Corre `npx tsc --noEmit`, `npm run lint` y `npm test` y parte de números
reales, no de estos archivos que pueden estar viejos.

---

## 3. Lo que el dueño quiere que el CRM haga (requisitos funcionales)

### R1 — Llamar desde la plataforma
Desde el **Kanban del pipeline**, desde el **drawer de la oportunidad** y desde el
**detalle de la oportunidad**, un botón "Llamar" debe abrir un softphone WebRTC real
(Twilio Voice JS SDK) sin salir de la pantalla. Estados visibles: marcando, timbrando,
en curso con cronómetro, mute, hold, teclado DTMF, transferencia, colgar. El dock debe
sobrevivir a la navegación entre páginas (no se corta la llamada al cambiar de ruta).

### R2 — Llamar desde el celular personal
El mismo botón, en modo "puente", debe hacer que Twilio llame primero al móvil del
vendedor y, al contestar, conecte con el cliente grabando ambas patas. El vendedor habla
desde su teléfono como siempre y el CRM igual obtiene número, duración, grabación,
transcripción y análisis. Debe funcionar también iniciando desde la app Capacitor.

### R3 — Grabación + transcripción automática
Toda llamada (web o puente, entrante o saliente) se graba con aviso de consentimiento
obligatorio, se transcribe automáticamente **con diarización** (agente vs cliente) en
español colombiano, y el resultado queda persistido y consultable.

### R4 — Historial en la oportunidad
La transcripción, el resumen, el sentimiento, las etiquetas, la objeción detectada, la
calificación de la llamada y los próximos pasos deben aparecer **en las actividades
recientes de la oportunidad**, con reproductor de audio sincronizado con el texto. El
seguimiento comercial se hace desde ahí.

### R5 — Correos personalizados desde la plataforma
Envío de email desde la oportunidad y desde el cliente, con:
- editor visual por **bloques/widgets** (arrastrar: encabezado, texto, imagen, botón CTA,
  producto, cotización, testimonio, separador, firma, footer legal),
- modo **HTML crudo** para quien lo prefiera,
- variables de personalización (`{{cliente.nombre}}`, `{{oportunidad.monto}}`,
  `{{vendedor.firma}}`…) con vista previa real,
- plantillas guardadas y reutilizables por organización,
- envío individual y **masivo** (por segmento, por etapa, por lista seleccionada),
- tracking de aperturas/clics/rebotes/bajas y registro en la ficha del cliente.

### R6 — WhatsApp individual y masivo
Mismo tratamiento: envío individual desde la oportunidad y campañas masivas con
plantillas aprobadas, respetando la ventana de 24 h y el opt-out. Debe reutilizar el
omnicanal existente (`conversations`/`messages`, WhatsApp Cloud API, Twilio, Evolution/Baileys),
no crear un canal paralelo.

### R7 — Agente IA de voz con propósito por etapa
El dueño de la organización configura, **por etapa del pipeline**, qué debe lograr el
agente cuando llama: calificar un lead, agendar una demo o reunión, confirmar asistencia,
recuperar una oportunidad fría, hacer seguimiento de propuesta, cobrar una factura
vencida, encuestar satisfacción post-venta, pedir un referido, o vender un producto
concreto. El agente conversa, y mediante *tools* mueve la oportunidad de etapa, crea
tareas, agenda en el calendario, registra la objeción y deja la transcripción. Con **voz
personalizada** (clonada o seleccionada) por organización y por agente.

### R8 — Automatización por etapa
Al entrar/salir de una etapa, al cumplirse un SLA, o al detectarse una señal en una
llamada, se disparan acciones multicanal encadenadas (llamada del agente IA, email,
WhatsApp, SMS, tarea) con esperas configurables (día 0, 1, 3, 5, 7, 10, 14, 30).

### R9 — Integraciones exigidas
**OpenAI, Gemini, Twilio, Resend, ElevenLabs.** Todas resueltas por **registry
configurable por organización** (`provider_configs`), nunca por `if (provider === 'x')`
disperso. Cada organización debe poder usar sus propias credenciales.

### R10 — UI/UX profesional
El resultado debe verse y sentirse como un producto comercial serio, no como un panel
administrativo. Estados de carga, vacío, error y éxito diseñados; animaciones sobrias con
`motion` (`m` + `LazyMotion`); accesible por teclado; responsive; consistente en Web, PWA,
Electron y Capacitor.

---

## 4. Reglas innegociables (heredadas del proyecto — respétalas todas)

1. **Cero hardcode de organización.** Toda tabla lleva `organization_id` + RLS. Ningún
   `organizationId = 1`, ni default silencioso. En webhooks, el `organization_id` se
   resuelve **solo** desde el número/`CallSid`/`MessageSid` ya persistido.
2. **Todo configurable por organización**: etapas, criterios de salida, scoring, ICP,
   objeciones, plantillas, secuencias, voces, propósitos del agente IA, health score,
   comisiones. **Datos, no código.**
3. **Reutilizar antes de crear.** Si ya existe tabla, servicio, endpoint o componente que
   cubre el concepto, se extiende. Cero tablas dobles. Cero endpoints duplicados.
4. **Migraciones solo por el MCP de Supabase** (`apply_migration`). **Prohibido crear
   archivos `.sql` en el repo.**
5. **Tipos de FK verificados:** `organizations.id` y `branches.id` son `integer`; el resto
   del CRM es `uuid`. Toda tabla nueva: `organization_id integer REFERENCES organizations(id)`.
6. **RLS con política real**, no solo `ENABLE`. Activar RLS sin políticas = denegar todo.
7. **Frontera de plataforma:** el CRM nunca lee `organizations`, `subscriptions`, `plans`,
   `sellers*`, `payout*`. Los vendedores de una organización son sus **miembros**
   (`organization_members.user_id` → `profiles.id`); `salesperson_id`/`payee_id` apuntan a
   `users.id`, nunca a `sellers`.
8. **Cero tablas financieras nuevas.** Se reusan `invoice_sales` (tiene `opportunity_id`),
   `quotations`, `payments`, `accounts_receivable`, `commissions`,
   `vendor_commission_rates`, `credit_notes`, `journal_entries`, `accounting_rules`.
9. **Métricas por función SQL (RPC)**, no vistas materializadas (heredan RLS y siempre
   están frescas).
10. **Consentimiento y compliance primero:** aviso de grabación obligatorio y no
    desactivable, `call_consents`, opt-out de email/SMS/WhatsApp, Habeas Data
    (Ley 1581 de 2012, Colombia), retención de audio configurable por organización.
11. **Honestidad técnica.** Lo que la plataforma no permite (leer el call log en Android
    sin ser dialer por defecto; grabar llamadas celulares en iOS) se documenta como
    imposible y se resuelve con arquitectura alternativa real, no con humo.
12. **Sin páginas duplicadas.** Antes de crear una ruta, verifica que no exista ya el
    equivalente en otro módulo (`/app/configuracion`, `/app/finanzas/comisiones`,
    `/app/finanzas/cuentas-por-cobrar`, `/app/inicio`, `/app/chat/bandeja`).

---

## 5. Referencia técnica verificada (2026-09-08) — úsala, y re-verifícala antes de codificar

> Estos datos se confirmaron contra documentación oficial en la fecha indicada. **Vuelve a
> comprobarlos** con `WebFetch` sobre la URL citada antes de fijarlos en código: los
> proveedores cambian nombres de modelo con frecuencia.

### Twilio
- **AccessToken + VoiceGrant** (SDK Node `twilio` v5): requiere `TWILIO_ACCOUNT_SID`,
  `TWILIO_API_KEY` (SK…), `TWILIO_API_SECRET` y `outgoingApplicationSid` (TwiML App SID).
  `incomingAllow: true` para recibir. TTL máximo **24 h**. `identity`: máx. 121 caracteres,
  alfanuméricos y `_`. → https://www.twilio.com/docs/iam/access-tokens
- **Device**: eventos `registered`, `incoming`, `error`, `tokenWillExpire`, `destroyed`.
  `device.connect({ params })` con máx. 800 bytes de params. Errores frecuentes:
  **31005** (WebSocket cerrado), **31201** (fallo `getUserMedia` pese a permiso),
  **31208** (usuario negó el micrófono), **31202/31205** (JWT inválido/expirado),
  **53000** (señalización). Requiere HTTPS y permiso de micrófono.
  → https://www.twilio.com/docs/voice/sdks/javascript/twiliodevice ·
  https://www.twilio.com/docs/voice/sdks/error-codes
- **Grabación dual**: `<Dial record="record-from-answer-dual" recordingStatusCallback="…"
  recordingStatusCallbackEvent="in-progress completed" trim="trim-silence">`.
  El callback recibe `RecordingSid`, `RecordingUrl`, `RecordingStatus`,
  `RecordingDuration`, `RecordingChannels`, `RecordingStartTime`, `RecordingSource=DialVerb`.
  La descarga del media exige **HTTP Basic Auth** (API Key+Secret). Twilio **no publica TTL**
  para la `RecordingUrl` → nunca la expongas al navegador; sírvela por
  `/api/voice/recording/[id]/stream` (que ya existe) o por Supabase Storage firmado.
  → https://www.twilio.com/docs/voice/twiml/dial · https://www.twilio.com/docs/voice/api/recording
- **StatusCallback**: eventos `initiated`, `ringing`, `answered`, `completed`; parámetros
  `CallSid`, `ParentCallSid`, `CallStatus`, `CallDuration`, `From`, `To`, `Direction`,
  `AnsweredBy` (si AMD). **Valida SIEMPRE `X-Twilio-Signature`** con
  `twilio.validateRequest(authToken, signature, url, params)` incluyendo *todos* los
  parámetros recibidos. → https://www.twilio.com/docs/usage/webhooks/webhooks-security
- **Click-to-call de 2 patas**: `client.calls.create` hacia el móvil del agente; el TwiML
  de esa llamada devuelve `<Dial>` hacia el cliente. La segunda pata es *child call* con
  `ParentCallSid` apuntando a la primera. → https://support.twilio.com/hc/en-us/articles/223180488
- **ConversationRelay**: **GA desde 2025-05-14**, HIPAA eligible.
  `<Connect action="…"><ConversationRelay url="wss://…" welcomeGreeting="…" language="…"
  ttsProvider="ElevenLabs" voice="…" transcriptionProvider="Google|Deepgram"
  interruptible="any" dtmfDetection="true" />`. Mensajes WS entrantes: `setup`, `prompt`,
  `dtmf`, `interrupt`, `error`; salientes: `text`, `play`, `sendDigits`, `language`, `end`.
  **ElevenLabs es el ttsProvider por defecto** (modelo Flash 2.5).
  ⚠️ **La tabla de voces por defecto lista `es-ES` y `es-US`, no `es-CO` ni `es-MX`** —
  valida el locale con una llamada de prueba antes de prometer español colombiano.
  → https://www.twilio.com/docs/voice/twiml/connect/conversationrelay ·
  https://www.twilio.com/docs/voice/conversationrelay/websocket-messages ·
  https://www.twilio.com/docs/voice/conversationrelay/voice-configuration
- **WhatsApp por Twilio**: plantillas con `contentSid` + `contentVariables` (JSON
  stringificado, hasta 100 pares); nunca junto con `Body`/`MediaUrl`. Ventana de 24 h;
  fuera de ella, error **63016**. Categorías Meta: Authentication / Utility / Marketing;
  desde **julio 2025** las Utility dentro de ventana activa no tienen cargo de Meta.
  → https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder ·
  https://www.twilio.com/docs/whatsapp/key-concepts
- **Móvil**: hay SDK oficial iOS, Android y **React Native (beta pública)**.
  **No existe plugin oficial de Capacitor.** Alternativas comunitarias no soportadas:
  `@capgo/capacitor-twilio-voice`, `capacitor-twiliovoicesdk`.
  ⇒ **Plan C siempre disponible: el modo puente de R2, que no necesita SDK nativo.**
  → https://www.twilio.com/docs/voice/sdks
- **Precios Colombia**: saliente a fijo **$0,0700/min**, a móvil **$0,0377/min**; entrante
  local **$0,0945/min**; número local **$14,00/mes**; grabación **$0,0025/min**;
  almacenamiento **$0,0005/min/mes**; WhatsApp fee Twilio **$0,005/mensaje**;
  ConversationRelay **≈$0,07/min** (+STT/TTS). → https://www.twilio.com/en-us/voice/pricing/co

### OpenAI
- **Realtime API: GA.** Modelo vigente **`gpt-realtime-2.1`** (y `gpt-realtime-2.1-mini`);
  especializados `gpt-realtime-translate` y `gpt-live-transcribe`. Transportes: **WebRTC,
  WebSocket y SIP**. Formatos `audio/pcm` (24 kHz) y `audio/pcmu` (μ-law/g711).
  Function calling en vivo: `session.update` con `session.tools` → `response.done` con
  `function_call` → `conversation.item.create` tipo `function_call_output` con el mismo
  `call_id` → `response.create`.
  → https://developers.openai.com/api/docs/guides/realtime
- **SIP nativo**: apuntar el trunk a `sip:$PROJECT_ID@sip.api.openai.com;transport=tls`,
  webhook `realtime.call.incoming`, y `POST /v1/realtime/calls/$CALL_ID/accept`.
  **Evalúalo como alternativa a ConversationRelay** — puede simplificar el `ws-server.ts`.
  → https://developers.openai.com/api/docs/guides/realtime-sip
- **Transcripción**: `gpt-transcribe` (general), **`gpt-4o-transcribe-diarize`
  (con diarización, `response_format=diarized_json`, devuelve `speaker`/`start`/`end`)**,
  `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `whisper-1` (legacy).
  **Límite 25 MB por archivo** — para llamadas largas hay que trocear o usar ElevenLabs.
  `timestamp_granularities[]` solo en `whisper-1`.
  → https://developers.openai.com/api/docs/guides/speech-to-text
- **Texto**: `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` — todos con
  ~1,05 M tokens de contexto y Structured Outputs (JSON Schema vía Responses API o
  `response_format: {type:"json_schema"}`).
  → https://developers.openai.com/api/docs/models · .../guides/structured-outputs
- **Precios**: Sol $5/$30 por 1M in/out · Terra $2/$12 · Luna $0,20/$1,20 ·
  Realtime-2.1 audio $32/$64 por 1M (mini $10/$20) · `gpt-transcribe` $0,0045/min ·
  `gpt-live-transcribe` $0,017/min. → https://openai.com/api/pricing/

### Google Gemini
- **Modelos vigentes**: `gemini-3.8-flash` (1.048.576 tokens de entrada / 65.536 de salida,
  Structured Outputs soportado, entrada texto+imagen+video+audio+PDF), `gemini-3.7-flash`,
  `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`,
  `gemini-3.1-pro` (preview). Especializado: **`gemini-3.5-transcribe`** (STT de baja
  latencia con detección de idioma por enunciado).
  → https://ai.google.dev/gemini-api/docs/models
- **Audio nativo**: Gemini acepta audio directo, transcribe **y hace diarización** pedida
  por prompt ("identify Speaker 1, Speaker 2"). Hasta **9,5 horas por prompt** a 32
  tokens/segundo, 13+ formatos. ⇒ **es la ruta más barata para analizar llamadas largas**
  sin trocear. → https://ai.google.dev/gemini-api/docs/audio
- **Live API: Preview** (no GA). PCM 16-bit 16 kHz in / 24 kHz out, WebSocket, barge-in,
  function calling, 70+ idiomas. Los nombres exactos de modelo Live **no están confirmados**
  — verifícalos en https://ai.google.dev/gemini-api/docs/live antes de usarlos.
- **Precios**: `gemini-3.8-flash` $0,75/$3,75 por 1M in/out (tarifa vigente hasta
  2026-12-31); `gemini-3.5-flash-lite` $0,30/$2,50; Batch API con 50 % de descuento.
  → https://ai.google.dev/gemini-api/docs/pricing
- El repo ya tiene `@google/genai@^2.20.0`. **Verifica la firma real del SDK** contra el
  README del paquete npm instalado: la documentación mostró `client.interactions.create`,
  que difiere de `models.generateContent` — no asumas ninguna de las dos.

### ElevenLabs
- **Scribe (STT)**: `scribe_v2` (batch, 90+ idiomas, timestamps por palabra, **diarización
  hasta 32 hablantes**, detección de 65 tipos de entidad, keyterm prompting) y
  `scribe_v2_realtime` (~150 ms, streaming, VAD). `scribe_v1` deprecado.
  `POST /v1/speech-to-text` con `model_id`, `file`, `diarize=true`, `num_speakers`,
  `language_code`, `timestamps_granularity`, `keyterms`.
  ⚠️ La doc oficial se contradice en el tamaño máximo (**3 GB** en capabilities vs **5 GB**
  en API reference) — mide con un archivo real. Duración hasta 10 h (1 h en multicanal).
  → https://elevenlabs.io/docs/capabilities/speech-to-text ·
  https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- **TTS**: `eleven_v3` (70+ idiomas, máx. expresividad, 5.000 chars),
  `eleven_v3_conversational` (~280 ms, tags de audio),
  `eleven_flash_v2_5` (**~75 ms**, 32 idiomas, 40.000 chars, 50 % más barato) —
  **flash es el correcto para llamadas en tiempo real**; `eleven_multilingual_v2` (29
  idiomas, 10.000 chars) para audio pregrabado de calidad. `turbo_v2*` deprecados.
  → https://elevenlabs.io/docs/overview/models
- **Clonación de voz**: **IVC** = mínimo 1 min (recomendado 1–2 min) de audio limpio,
  MP3 ≥128 kbps, −23 a −18 dBFS RMS, pico −3 dB; API `POST /v1/voices/add` (`name`,
  `files`, `remove_background_noise`) → devuelve `voice_id` y `requires_verification`.
  **PVC** = mínimo 30 min (recomendado 2 h+), un solo hablante, y **solo se permite clonar
  tu propia voz con verificación** — no hay endpoint público confirmado, es flujo de
  dashboard. ⇒ **Para R7 usa IVC + consentimiento firmado registrado en BD.**
  → https://elevenlabs.io/docs/api-reference/voices/ivc/create
- **Agents Platform**: `POST /v1/convai/agents/create` con `conversation_config`,
  `platform_settings`, `workflow`. Tools: *client tools* (ejecutan en el navegador),
  *webhook tools* (servidor), *code tools*, *MCP tools*, tools de sistema (transferencia).
  Integración nativa con Twilio: se importa el número al dashboard de ElevenLabs y la
  plataforma configura el webhook sola; llamadas salientes desde el dashboard (**el
  endpoint REST exacto de outbound no está confirmado** — verifícalo).
  Precio: **$0,080/min** incluidos, $0,003/min adicionales, $0,003/mensaje de texto;
  **el LLM se cobra aparte "at cost"**; 95 % de descuento en silencios >10 s.
  → https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration ·
  https://elevenlabs.io/pricing/agents

### Resend
Verifica tú mismo (no alcancé a auditarlo en profundidad): API de **dominios**
(multi-tenant: un dominio verificado por organización), **envío individual y batch**,
**broadcasts/audiences** para masivos, **webhooks firmados con Svix** (`RESEND_WEBHOOK_SECRET`
ya está en `.env.local`), idempotencia, y **React Email** (`react-email@^6.9.3` y
`resend@^6.25.0` ya instalados). Documenta límites de tasa y el flujo de verificación DNS
(SPF/DKIM/DMARC) que la organización debe completar. → https://resend.com/docs

---

## 6. Fases sugeridas del plan v4 (ajústalas si la auditoría lo justifica, pero respeta el orden lógico)

| Fase | Nombre | Objetivo central |
|---|---|---|
| **F0** | Reconciliación y arranque en frío | Auditoría §A + corregir RLS incompletas + seeds de configuración + variables de entorno + provisión de Twilio (API Key, TwiML App, número por org) + dominio Resend + limpiar TS errors del CRM |
| **F1** | Softphone global cableado | `SoftphoneProvider` en el layout de `/app`, dock persistente entre rutas, `CallButton` en tarjeta Kanban, drawer y detalle; unificar en `/api/voice/*` y **retirar** `/api/integrations/twilio/click-to-call` |
| **F2** | Llamada desde el celular (modo puente) | `mobile_call_bridges` cableado end-to-end, selector web/puente en el mismo botón, y funcionamiento desde Capacitor |
| **F3** | Grabación → transcripción → análisis | Consentimiento, `recordingStatusCallback` firmado, almacenamiento propio, transcripción con diarización, análisis IA, y **aplicación de acciones** (tarea, etiqueta, objeción, cambio de etapa sugerido) |
| **F4** | Timeline 360 de la oportunidad | Tabs en drawer y detalle; `CallTranscriptViewer` con audio sincronizado; actividades recientes unificadas (llamada, email, WhatsApp, tarea, documento, cotización, pago) |
| **F5** | Email profesional | Editor por bloques + modo HTML + variables + preview + plantillas por organización + envío individual y masivo + webhooks de tracking + supresiones |
| **F6** | WhatsApp individual y masivo | Reutilizar omnicanal, plantillas aprobadas, ventana 24 h, opt-out, campañas por segmento con control de ritmo |
| **F7** | Agente IA de voz con propósito | Catálogo de propósitos por etapa, editor de agente (voz, prompt, tools, guardarraíles), campañas de marcación, y ejecución con ConversationRelay y/o OpenAI SIP — decidiendo con criterios explícitos |
| **F8** | Automatizaciones y secuencias por etapa | Constructor visual, disparadores por evento/SLA/señal de llamada, pasos multicanal con esperas, y migración del motor `automations` viejo a `automation_rules` |
| **F9** | Costos, créditos, compliance y observabilidad | Presupuesto por organización, `comm_usage_logs`/`ai_usage_logs`, límites duros, retención de audio, Habeas Data, Sentry, alertas |
| **F10** | UX, Motion y cross-platform | Estados de carga/vacío/error, accesibilidad, animaciones, y verificación en Web, PWA, Electron y Capacitor |
| **F11** | QA end-to-end y Definition of Done global | Recorrido completo con una organización de prueba distinta de GoAdmin |

---

## 7. Formato exigido para CADA documento de fase

Cada `FASE-NN-*.md` debe traer, sin excepción y sin secciones vacías:

1. **Objetivo en una frase** y **por qué esta fase existe** (qué duele hoy sin ella).
2. **Precondiciones verificables** — qué debe estar hecho y cómo comprobarlo (comando o
   consulta SQL concreta).
3. **Base de datos**
   - Tablas/columnas afectadas con su **estado real actual** (existe / falta / incompleta).
   - **SQL exacto** de cada migración que falte, listo para `apply_migration`, con nombre
     de migración propuesto y **política RLS completa** para cada comando.
   - Índices y su justificación (qué consulta aceleran).
   - Seeds necesarios, con los datos concretos (no "seed de ejemplo").
4. **Backend**
   - Tabla `ruta | método | estado actual (existe/falta/hay que arreglar) | qué cambia`.
   - **Contrato de cada endpoint**: request, response, códigos de error, validación de
     `organization_id`, verificación de firma de webhook, idempotencia.
   - Servicios que se crean o modifican, con firma de las funciones públicas.
   - Manejo de reintentos, colas y fallos de proveedor.
5. **UI**
   - Tabla `archivo | nuevo o modificado | responsabilidad | props principales`.
   - Rutas de página nuevas con su `page.tsx` y dónde se enlazan en la navegación.
   - **Descripción del flujo de pantalla** paso a paso: qué ve el usuario, qué hace, qué
     pasa después. Incluye los estados de carga, vacío, error y éxito.
   - Diagrama del árbol de componentes cuando haya más de 3 niveles.
6. **Configuración**: variables de entorno nuevas, pasos en la consola del proveedor,
   registros DNS, webhooks a registrar. Con instrucciones ejecutables, no genéricas.
7. **Pruebas**: unitarias, de integración y el guion manual paso a paso para probarlo en
   producción con datos reales.
8. **Definition of Done**: lista de comprobación binaria (✅/❌), verificable por un
   tercero sin leer el código.
9. **Riesgos de esta fase y su mitigación.**
10. **Estimación de costo operativo** (llamadas, IA, email) para 100 llamadas y 1.000
    emails al mes, con las tarifas de §5.

---

## 8. Decisiones de arquitectura que debes tomar y justificar por escrito

No las resuelvas por inercia: compara opciones, elige, y escribe el porqué en el plan.

1. **Motor del agente de voz**: Twilio ConversationRelay + OpenAI Realtime + ElevenLabs
   (el repo ya tiene `conversationRelayHandler.ts` y `ws-server.ts`) **vs.** OpenAI
   Realtime por SIP directo **vs.** ElevenLabs Agents con integración Twilio nativa.
   Considera: soporte real de español colombiano, latencia, control de tools, costo por
   minuto, y quién opera el WebSocket (Vercel no sostiene WS largos → ¿Railway?).
2. **Motor de transcripción**: ElevenLabs `scribe_v2` (diarización 32 hablantes) **vs.**
   OpenAI `gpt-4o-transcribe-diarize` (límite 25 MB) **vs.** Gemini audio nativo (9,5 h,
   diarización por prompt, el más barato). Propón una cascada con fallback y el criterio
   de selección por duración/idioma/costo, resuelto por `provider_configs`.
3. **Dónde vive el WebSocket** del agente de voz en producción, dado que la app está en
   Vercel. Hay `ws-server.Dockerfile` y `railway.toml` en el repo — decide y documenta.
4. **Almacenamiento de grabaciones**: Twilio Storage + proxy firmado **vs.** copia a
   Supabase Storage con URL firmada. Considera costo, retención configurable por
   organización y borrado por Habeas Data.
5. **WhatsApp masivo**: Meta Cloud API directa **vs.** Twilio Content API **vs.**
   Evolution/Baileys (QR). Considera riesgo de bloqueo, costo, plantillas y trazabilidad.
   Recuerda que las tres ya están integradas en el repo.
6. **Editor de email**: constructor propio por bloques **vs.** integrar un editor
   existente. Debe producir HTML compatible con Outlook/Gmail y guardar el JSON de bloques
   para reedición.
7. **Capacitor y llamadas**: plugin nativo propio, plugin comunitario, o **solo modo
   puente**. Recuerda que no hay plugin oficial de Capacitor y que el modo puente siempre
   funciona.

---

## 9. Método de trabajo

1. **Verifica antes de escribir.** Cada afirmación del plan v4 debe estar respaldada por
   una consulta al MCP de Supabase, un `grep`/`cat` sobre el repo, o un `WebFetch` a la
   documentación oficial con la URL citada. **Si no lo verificaste, no lo escribes.**
2. **Lee la documentación oficial de cada integración** antes de especificar su fase.
   Cita la URL junto a cada dato de API, modelo o precio, con la fecha de consulta.
3. **No borres los documentos viejos**: muévelos a
   `docs/crm-revenue-os/_archivo-v3/` para conservar la trazabilidad, y deja en `PLAN.md`
   una nota de qué cambió y por qué.
4. **Trabaja en español**, en Markdown, con tablas y bloques de código. Tono directo y
   técnico; sin relleno, sin "próximamente", sin secciones vacías.
5. **Marca explícitamente lo que no pudiste confirmar** con `⚠️ NO VERIFICADO:` en lugar
   de rellenarlo con suposiciones. Un hueco declarado vale más que un dato inventado.
6. **Actualiza `PROGRESS.md`** al final de cada ronda según el formato de
   `.devin/workflows/loop.md` (tabla de fases + historial de rondas con calificaciones).
7. **Antes de dar por cerrada la fase de planeación**, corre una pasada de verificación
   cruzada: toma cada tabla, ruta y componente citado en el plan v4 y confirma contra
   Supabase y contra el repo que el nombre existe y está bien escrito. Reporta las
   correcciones.

---

## 10. Criterio de aceptación del plan v4

El plan está terminado cuando alguien que **no participó** en escribirlo puede:

1. Leer `PLAN.md` y entender en 10 minutos qué está hecho, qué falta y en qué orden.
2. Tomar cualquier `FASE-NN.md` y ejecutarla completa **sin preguntar nada**: tiene el SQL,
   los contratos de API, los archivos de UI con sus responsabilidades, los pasos de
   configuración del proveedor y el guion de pruebas.
3. Verificar el Definition of Done de esa fase **sin leer el código fuente**.
4. Confirmar que ninguna afirmación del plan contradice el estado real de la base de datos
   ni del repositorio.

Y el CRM estará terminado cuando, con una organización de prueba distinta de GoAdmin:

1. Un lead entra al Kanban con su origen, ICP calculado y vendedor asignado.
2. El vendedor pulsa **Llamar** en la tarjeta del Kanban y habla desde el navegador; al
   colgar existen grabación, transcripción diarizada, resumen, etiquetas, objeción
   detectada, calificación y una tarea creada con fecha — todo visible en las actividades
   recientes de esa oportunidad.
3. El mismo vendedor, desde su celular personal en modo puente, obtiene **exactamente los
   mismos artefactos**.
4. Un agente IA de voz con propósito "agendar demo", con la voz de la organización, llama
   solo, conversa en español, agenda y mueve la oportunidad de etapa mediante una tool.
5. Al mover la oportunidad a "Demo realizada" se disparan automáticamente un email
   personalizado con el editor de bloques, un WhatsApp con plantilla aprobada y una tarea
   de seguimiento a 48 h.
6. Se puede enviar una campaña de email y otra de WhatsApp a un segmento, con tracking de
   aperturas/clics/entregas y opt-out funcionando.
7. Todo lo anterior funciona en Web, PWA, Electron y Capacitor.
8. `npx tsc --noEmit`, `npm run lint` y `npm test` salen limpios; cero `organizationId = 1`;
   cero archivos `.sql` en el repo; cero fugas entre organizaciones verificadas con una
   prueba automatizada.
9. Los costos de cada llamada, transcripción, análisis, email y WhatsApp quedan registrados
   y descontados de los créditos de la organización, con límite duro configurable.

---

## 11. Primer paso — empieza por aquí, en este orden

1. Lee `docs/crm-revenue-os/PLAN.md`, `PROGRESS.md`, `ANEXO-A`, `ANEXO-B` y los 16
   documentos de fase. **No los tomes como verdad**: son el punto de partida a auditar.
2. Consulta el MCP de Supabase: `list_tables`, las políticas RLS de las tablas de §2.1,
   `count(*)` real de las tablas de configuración, y `get_advisors` (security + performance).
3. Recorre el repo: `src/app/app/crm/**`, `src/components/crm/**`, `src/components/voice/**`,
   `src/lib/services/crm/**`, `src/lib/services/integrations/twilio/**`,
   `src/app/api/{voice,crm,email,webhooks}/**`, `ws-server.ts`, `src/app/app/layout.tsx`.
4. Corre `npx tsc --noEmit`, `npm run lint` y `npm test`; clasifica los errores.
5. Confirma o refuta cada uno de los **6 hallazgos H1–H6** de §2.3 con evidencia propia.
6. Escribe `ANEXO-C-RECONCILIACION-2026-09.md`.
7. **Preséntame la reconciliación y espera mi visto bueno antes de reescribir el plan.**
   No reescribas `PLAN.md` hasta que yo confirme la auditoría.
