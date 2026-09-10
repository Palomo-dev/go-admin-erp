# ANEXO C — Reconciliación de las fases V3 contra la realidad (BD + backend + UI) — 2026-09-08

> Propósito: los documentos V3 (`FASE-01`, `FASE-02`, `FASE-10` a `FASE-15`) declaran en su §1 "Estado actual verificado" y en sus tablas de "Archivos tocados" qué existía y qué había que crear **el 2026-08-28/09-01**. Desde entonces se aplicaron las migraciones `f1_*` a `f14_*` y se escribieron ~120 rutas y ~50 servicios, pero los documentos no se actualizaron. Este anexo compara **línea por línea** lo que cada documento V3 marca como "❌ / crear / pendiente" con lo que existe hoy, con evidencia propia (SQL de solo lectura vía MCP sobre `jgmgphmzusbluqhuqihj`, `ls`/`grep`/`sed` sobre el repo).
> Momento de verificación: **2026-09-08, 21:52 UTC (16:52 Bogotá)**, durante la Ola 1 de implementación; el agente F0-DB estaba aplicando migraciones en paralelo, por lo que en §1.3 se distingue "existía antes de hoy" de "creado hoy por F0-DB".
> Convención: `count(*)` real (no `n_live_tup`); `archivo:línea` verificado con `sed -n`; ✅ existe y opera · 🟡 existe pero sin UI/seeds/cableado · 🔴 existe y está roto · ❌ no existe · 💀 existe sin importadores.
> Documentos relacionados: `PLAN.md` §7.2 (olas de ejecución), `ANEXO-A-INVENTARIO-ACTUAL.md` §7 (mapa de bugs), `PROMPT-MAESTRO-V4.md` §2 (hipótesis H1–H6).

---

## 0. Resumen ejecutivo

1. **Todas las tablas de F1, F2, F10, F11, F12, F13 y F14 existen** (migraciones `f1_*`…`f14_*` aplicadas), con RLS activo. Los documentos V3 siguen diciendo "❌ no existe" para 30 de ellas: esa sección de cada doc está **obsoleta**, no el plan.
2. **El backend de esas fases está casi completo**: 114 `route.ts` bajo `src/app/api/crm/**` y 51 servicios en `src/lib/services/crm/` (22 560 líneas). Lo que falta es, casi siempre, **UI que los consuma y seeds que los llenen**.
3. **Las tablas de configuración están vacías** salvo `loss_reasons` (8 globales), `discovery_templates` (3), `scoring_configs` (1), `health_score_configs` (1), `sales_roles` (60). `verticals`, `objections`, `call_tags`, `onboarding_templates`, `referral_programs`, `partner_tiers`, `provider_configs`, `icp_profiles`, `territories`, `sales_targets` = **0 filas**. Sin seeds la UI aparece vacía y el usuario percibe que "no funciona". §7 lista los INSERT recomendados.
4. **La UI de configuración de F1/F2/F12/F13 SÍ existe**, pero no en las rutas que dicen los documentos V3: vive en `src/components/configuracion/panels/crm/sections/*` (8 secciones, 4 047 líneas) montadas por `CRMConfigPanel.tsx` (838 L). Los componentes que los docs V3 sitúan en `src/components/configuracion/crm/*` no existen con ese nombre.
5. **Seis componentes V3 están escritos y nadie los monta** (💀): `ObjecionesList.tsx` (492 L), `DiscoveryWizard.tsx` (666 L), `ProposalBuilderDialog.tsx` (385 L), `OnboardingChecklist.tsx` (221 L), `HoyView.tsx` (426 L), `FunnelView.tsx`. Son trabajo hecho que F9/F10/F11 deben conectar, no reescribir.
6. **Las 10 tablas "con una sola política" están bien cubiertas** (todas `FOR ALL` con `USING`; siete de ellas con `WITH CHECK` explícito) **excepto `comm_usage_logs`**, que solo tiene `SELECT`: toda escritura que no venga del service role se rechaza en silencio (y hoy `twilioService.ts` escribe con el cliente browser → C9 msg). Detalle en §2.
7. **H1, H2, H3, H5 y H6 del PROMPT-MAESTRO se confirman; H4 se confirma a medias**: `OpportunityDrawer.tsx` no tiene tabs (0 `TabsTrigger`), pero `OpportunityDetail.tsx` sí (19 `TabsTrigger`, 9 tabs). Detalle en §3.
8. **Hallazgos nuevos verificados** (§5): el inbound de WhatsApp Cloud API **no puede persistir mensajes** (inserta columnas inexistentes en `messages`); `callManagementService.createCall` viola dos restricciones (`status 'queued'`, `duration_source` NULL en columna NOT NULL); `applyAnalysis` crea tareas con `priority 'medium'` y `status 'pending'` (ambos fuera del CHECK); los conteos del PROMPT-MAESTRO estaban muy desactualizados (`messages` = 255 144, no 4 344).

---

## 1. Evidencia de base de datos

### 1.1 Conteo real de filas (`count(*)`, 2026-09-08 21:52 UTC)

| Tabla | Filas | Comentario |
|---|---|---|
| `organizations` / `organization_members` / `profiles` | 83 / 115 / 114 | |
| `customers` | **32 961** | PROMPT-MAESTRO decía ≈31 620 |
| `conversations` / `messages` | 20 466 / **255 144** | PROMPT-MAESTRO decía 4 344 mensajes (stats viejas). Por canal: `website` 255 109 · `whatsapp` **37** |
| `channels` / `channel_credentials` | 7 / 1 | |
| `opportunities` | **26** | orgs 2 (9), 125 (11), 134 (5), 120 (1). PROMPT-MAESTRO temía "0 = stats viejas": confirmado, hay datos |
| `pipelines` / `stages` | 10 / 61 | |
| `activities` / `tasks` / `notes` / `calendar_events` | 77 / 783 / 2 / 8 | |
| `opportunity_stage_history` | **0** | trigger `trg_opp_stage_history` habilitado (`tgenabled='O'`); 0 filas ⇒ ninguna oportunidad cambió de etapa desde que se creó el trigger |
| `opportunity_products` / `opportunity_spaces` | 5 / 0 | |
| `loss_reasons` | **8** (todas `is_global=true`, `organization_id NULL`) | `budget, competitor, features, lost_contact, no_decision, other, price, timing`. PROMPT-MAESTRO decía 0 |
| `discovery_templates` | **3** | org 1 "Discovery Software/SaaS", org 2 "Discovery General/Ventas", org 134 "Discovery personalizado" |
| `scoring_configs` / `health_score_configs` / `health_score_snapshots` | 1 (org 134) / 1 / 9 | |
| `sales_roles` / `sales_teams` / `sales_team_members` / `territories` | **60** / 1 / 0 / 0 | |
| `icp_profiles` / `icp_criteria` | 0 / 0 | |
| `verticals` / `objections` / `opportunity_objections` | 0 / 0 / 0 | |
| `call_tags` / `calls` / `call_recordings` / `call_transcripts` / `call_analyses` | 0 / 0 / 0 / 0 / 0 | |
| `phone_numbers` / `mobile_call_bridges` | 0 / 0 | |
| `voice_agents` / `voice_agent_calls` / `voice_agent_campaigns` | 0 / 0 / 0 | |
| `email_domains` / `email_messages` / `email_events` / `templates` / `notification_templates` | 0 / 0 / 0 / 0 / 15 | |
| `sequences` / `sequence_steps` / `sequence_enrollments` / `automation_rules` / `automation_runs` / `automations` | 0 / 0 / 0 / 0 / 0 / 1 | |
| `campaigns` / `campaign_contacts` / `segments` | 4 / **0** / 3 | `campaign_contacts` nunca escrita (msg D) |
| `documents` / `document_folders` | 0 / 0 | |
| `demo_sessions` / `roi_calculators` / `contract_signatures` / `quotations` | 0 / 0 / 0 / 5 | |
| `onboarding_templates` / `onboarding_instances` / `onboarding_steps` | 0 / 0 / 0 | |
| `partners` / `partner_tiers` / `partner_deals` / `referral_programs` / `referrals` | 0 / 0 / 0 / 0 / 0 | |
| `sales_targets` / `commissions` | 0 / **103** | |
| `provider_configs` / `comm_settings` / `comm_usage_logs` / `ai_credit_purchases` | **0** / 31 / 40 / 4 | |
| `ai_settings` / `ai_usage_logs` | 38 / 111 382 | |

Tablas que los docs V3 o el código asumen y **no existen**: `contracts`, `pipeline_templates` (es código: `pipelineTemplates.ts`), `stage_automations`, `do_not_call_list`, `ai_credits`, `commission_rules`, `commission_events`, `nps_responses`, `renewals`, `stage_agents`, `voices`, `voice_agent_tool_runs` (los tres últimos los crea F6).

### 1.2 Funciones y triggers V3 que existen (firma real)

| Función / trigger | Fase V3 que la declaraba "❌" | Evidencia |
|---|---|---|
| `fn_revenue_metrics(p_org_id integer, p_start date, p_end date)` | F14 §1 "❌" | `pg_proc` |
| `fn_pipeline_funnel(p_org_id integer)` | F14 §1 "❌" | `pg_proc` |
| `fn_cohort_retention(p_org_id integer, p_start date, p_end date)` | F14 §1 "❌" | `pg_proc` |
| `fn_customer_health(p_org_id integer, p_customer_id uuid)` | F11 §1 "❌", F14 §1 "❌" | `pg_proc`; además existe `refresh_mv_customer_health()` (residuo de la MV descartada) |
| `fn_call_quality(p_org_id integer, p_start date, p_end date, p_user_id uuid)` | F14 §1 "❌ (F4 la crea)" | `pg_proc` |
| `fn_create_commission_on_opportunity_won()` + `trg_create_commission_on_opportunity_won` | F13 (implícito) | `pg_trigger` sobre `opportunities` |
| `fn_log_stage_change()` + `trg_opp_stage_history` · `fn_sync_status_from_stage()` + `trg_sync_status_from_stage` · `trg_opportunities_closed_at` | F2 | `pg_trigger` (los tres habilitados) |
| `decrement_ai_credits(p_org_id integer, p_cost integer)` · `deduct_comm_credits(p_org_id integer, p_channel text, p_amount integer)` · `fn_reset_monthly_ai_credits()` | F0 V3 | `pg_proc`; `fn_reset_monthly_ai_credits` corre en `cron.job` 10 |
| `fn_campaign_mark_sent(p_campaign_id uuid, p_customer_id uuid)` · `fn_get_campaign_metrics(p_campaign_id uuid)` | campañas | `pg_proc` |
| `current_org_id()` | F0 V3 | existe; devuelve NULL para usuarios normales (JWT sin `organization_id`, tester F00 r1) |

### 1.3 Creado hoy por F0-DB (Ola 1, verificado a las 21:52 UTC)

Ya presente en la BD al cerrar esta reconciliación (no formaba parte de V3): tablas `outbound_jobs`, `crm_events`, `contact_consents`, `provider_pricing`, `user_comm_preferences`; RPCs `fn_enqueue_job(p_org, p_kind, p_payload, p_run_at, p_dedupe_key, p_max_attempts)`, `fn_claim_jobs(p_kinds text[], p_limit, p_worker)`, `fn_complete_job(p_job_id, p_worker, p_result)`, `fn_fail_job(p_job_id, p_worker, p_error, p_retry_after_seconds)` (con el `p_worker` que pidió el tester F00 #6), `fn_can_contact(p_org, p_customer, p_channel, p_purpose)`; trigger `trg_opp_stage_change_enqueue` sobre `opportunities`; CHECK de `activities.activity_type` ampliado a `call|email|whatsapp|sms|meeting|visit|note|system|ai_call|task`; columnas `activities.call_id/email_message_id/message_id/conversation_id` y `messages.related_opportunity_id`; bucket `crm-call-recordings`. **Todavía no**: jobs `crm-*` en `cron.job` (0), `stage_agents`, `voices`.

### 1.4 pg_cron, Storage y `vercel.json`

- `cron.job`: ids 4–10 (`mantener-datos-reales-diarios` 0 2 * * 1-6, `daily-exchange-rates-update`, `check-periodic-notifications`, `daily-task-agent`, `reschedule-overdue-tasks`, `cleanup-temporary-members`, `reset-monthly-ai-credits` 5 0 1 * *). **Ninguno CRM**. El job **4 contiene un token Bearer/JWT embebido en `command`** (757 caracteres; no se reproduce aquí). Riesgo registrado en `PLAN.md` §13 y `FASE-00` §7 (H1): rotación de la service key pendiente por el dueño.
- `storage.buckets`: 13 buckets; `crm-documents` (privado, creado 2026-09-01) **sin ninguna política en `storage.objects`** (las 44 políticas existentes cubren logos, profiles, chat-images, attachments, invoices, shipment-pod, categories, product-images, space-images, supplier-logos, organization_images). Con RLS activo y sin política, ni siquiera un miembro autenticado puede leer/subir; hoy `documents` tiene 0 filas, así que nadie lo ha notado. Lo corrige F0-DB (M3 aplica el patrón `org_{id}/` también a `crm-documents`) o, en su defecto, F9.
- `vercel.json`: 10 crons (`update-exchange-rates`, 5 de open-finance, `qr/expire-sessions`, `expire-pending-web-orders`, `reconcile-web-orders`, `expire-old-notifications`). Ninguno invoca `health/recalculate`, `renewals/sync`, `sequences/run`, `campaigns/run` ni `followup/run`, pese a que esas cinco rutas exigen `CRON_SECRET`.

---

## 2. Las 10 tablas "con una sola política" (pg_policies, `cmd`, roles, `with_check`)

| Tabla | Política | `cmd` | Roles | `USING` | `WITH CHECK` | Veredicto |
|---|---|---|---|---|---|---|
| `scoring_configs` | `org_member_all` | ALL | authenticated | `organization_id IN (om activo)` | idéntico | ✅ completa |
| `loss_reasons` | `org_member_all` **+ `loss_reasons_global_select`** | ALL + SELECT | authenticated | org activo / `is_global = true` | idéntico / – | ✅ (son 2 políticas, no 1; las 8 filas globales se leen por la segunda) |
| `verticals` | `org_member_all` | ALL | authenticated | org activo | idéntico | ✅ |
| `health_score_configs` | `org_member_all` | ALL | authenticated | org activo | idéntico | ✅ (PK = `organization_id`) |
| `health_score_snapshots` | `org_member_all` | ALL | authenticated | org activo | idéntico | ✅ |
| `opportunity_stage_history` | `org_member_all` | ALL | authenticated | org activo | idéntico | ✅ |
| `opportunity_products` | `opportunity_products_org_isolation` | ALL | **public** | `opportunity_id IN (opps de orgs del usuario)` (sin `is_active`) | NULL → Postgres reutiliza `USING` para escrituras | 🟡 funcional; sin filtro `is_active`, `TO public` |
| `opportunity_spaces` | `opportunity_spaces_org_isolation` | ALL | **public** | idéntico al anterior | NULL (idem) | 🟡 funcional; mismo matiz |
| `comm_usage_logs` | `comm_usage_logs_select` | **SELECT** | public | org del usuario (sin `is_active`) | – | 🔴 **solo lectura para usuarios**: INSERT/UPDATE solo con service role. `twilioService.ts:172` inserta con el cliente browser (`:9`) → rechazado en silencio (C9 msg). Diseño defendible (los logs los escribe el servidor), pero el código actual no lo cumple |
| `ai_credit_purchases` | `ai_credit_purchases_org_isolation` | ALL | public | org del usuario (sin `is_active`) | NULL (idem) | 🟡 funcional |

Notas: (a) cuando `WITH CHECK` es NULL en una política `FOR ALL`, Postgres aplica la expresión `USING` a INSERT/UPDATE, por lo que no hay agujero de escritura; (b) el patrón canónico (`FOR ALL TO authenticated` + `om.is_active = true` + `WITH CHECK` explícito) solo lo cumplen las siete tablas `org_member_all`; las tres `*_org_isolation` y `comm_settings`/`calendar_events` (`TO public`, sin `is_active`) conviene homogeneizarlas en una migración de higiene posterior a F0 (no bloquea); (c) `provider_configs` tiene 4 políticas (`select/insert/update/delete`) para `authenticated`: el tester F00 #3 pide **REVOKE INSERT/UPDATE/DELETE** para que las escrituras pasen solo por la RPC/route con control de admin.

---

## 3. Hipótesis H1–H6 del PROMPT-MAESTRO: confirmación con evidencia propia

| # | Hipótesis | Veredicto | Evidencia (2026-09-08) |
|---|---|---|---|
| H1 | `SoftphoneProvider`/`SoftphoneDock` solo en `/app/crm/llamadas`; el layout solo monta `MotionProvider` | ✅ **Confirmada** | `grep -rln SoftphoneProvider src` → `app/crm/llamadas/page.tsx` + los 5 archivos de `src/components/voice/`; `src/app/app/layout.tsx:17-18` = `<AuthGuard><MotionProvider>` (33 L). F0-REG/F9 lo hoistean |
| H2 | `CallButton` no se usa fuera de `src/components/voice/` | ✅ **Confirmada** | `grep -rl "\bCallButton\b" src` → solo `voice/CallButton.tsx` y el barrel `voice/index.ts` |
| H3 | El drawer llama a `/api/integrations/twilio/click-to-call`; modo por defecto `manual` | ✅ **Confirmada** | `ActivityActions.tsx:230` `useState<"click-to-call" \| "manual">("manual")`; `:272` `fetch("/api/integrations/twilio/click-to-call"`; la ruta no existe (`find src/app/api -path "*click-to-call*"` vacío); las rutas reales son `POST /api/voice/call` y `POST /api/voice/bridge/initiate` |
| H4 | Drawer y detalle sin tabs; sin `CallTranscriptViewer` ni timeline unificado | 🟡 **Parcial** | `OpportunityDrawer.tsx` (1013 L): **0** `TabsTrigger` ✅. `OpportunityDetail.tsx` (1330 L): **19** `TabsTrigger` (9 tabs, `:523-594`) ✗ → sí tiene tabs, aunque su tab Timeline mezcla `activities+tasks+notes` a mano (`:919-922`). `CallTranscriptViewer/CallTranscriptPanel/OpportunityTimeline`: 0 archivos. `timelineService.ts` (355 L) tiene 0 consumidores UI (los 25 importadores de `timelineService` que devuelve grep son del módulo `src/components/timeline/**`, que usa `src/lib/services/timelineService.ts`, otro archivo) |
| H5 | No existen `src/components/crm/{email,plantillas,secuencias,agentes}` ni las rutas `/app/crm/{agentes-ia,plantillas,secuencias,objeciones,onboarding,partners}`; `ObjecionesList.tsx` sin página | ✅ **Confirmada** | `ls -d` de las 4 carpetas y las 6 rutas → "No such file or directory"; `src/app/app/crm/` = `actividades campanas clientes equipo identidades leads llamadas oportunidades pipeline pronostico salud segmentos` (+ `page.tsx`); `ObjecionesList` → 0 importadores |
| H6 | `.env.local` sin `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_TWIML_APP_SID` | ✅ **Confirmada** | `grep -oE "^[A-Z_0-9]+=" .env.local` (solo nombres) contiene `TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MASTER_*, TWILIO_PHONE_NUMBER, TWILIO_VERIFY_SERVICE_SID, TWILIO_WEBHOOK_BASE_URL, TWILIO_WHATSAPP_NUMBER` y **no** las tres; `.env.example:91-93` sí las declara y `voiceTokenService.ts:44-46` las lee de `provider.credentials` (0 filas) → `/api/voice/token` 500. Corrección de nombres para ANEXO-B: son `TWILIO_API_KEY`/`TWILIO_API_SECRET`, no `TWILIO_API_KEY_SID`/`_SECRET` |

Complemento a la lista de "variables presentes" del PROMPT-MAESTRO: `.env.local` **sí** tiene `CRON_SECRET`, `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`, `ELEVENLABS_API_KEY/VOICE_ID/MODEL`, `GOOGLE_AI_API_KEY`, `META_WEBHOOK_VERIFY_TOKEN` y `WHATSAPP_VERIFY_TOKEN` (duplicado), `NEXT_PUBLIC_META_APP_ID`; **no** tiene `OPENAI_MODEL`, `OPENAI_REALTIME_MODEL`, `ELEVENLABS_SCRIBE_MODEL`, `GEMINI_API_KEY`, `SENDGRID_*`, `TWILIO_PUSH_CREDENTIAL_SID_*`. `.env.example` declara además `ELEVENLABS_SCRIBE_MODEL=scribe_v2` (:113), `DEEPGRAM_MODEL=nova-3` (:107; el código fija `nova-2` en `transcriptionService.ts:101,477`), `TWILIO_PUSH_CREDENTIAL_SID_IOS/ANDROID` (:98-99).

---

## 4. Reconciliación por fase V3

Formato: **Ítem del plan V3** (lo que el documento marca como ❌ / crear / pendiente) · **Estado real** · **Evidencia** · **Qué queda por hacer**.

### 4.1 FASE-01 — Estructura comercial (ICP, verticales, roles, playbooks)

| Ítem del plan V3 | Estado real | Evidencia | Qué queda por hacer |
|---|---|---|---|
| `verticals` sin `slug/color/sort_order/positioning` ("F0 los añade") | ✅ columnas existen | `information_schema`: `id, organization_id!, name!, description, is_active, created_at, slug, color, sort_order!, positioning jsonb!, metadata jsonb!` | Seeds por org (0 filas) — §7.2 |
| `sales_roles`, `icp_profiles`, `icp_criteria` "❌ no existen" | ✅ existen | `sales_roles` 60 filas; `icp_profiles` 0 (UNIQUE `(organization_id, band)`, `sla_first_contact_hours`), `icp_criteria` 0 | Seeds ICP A/B/C por org — §7.3 |
| `sales_teams`, `sales_team_members`, `territories` "❌" | ✅ existen | 1 / 0 / 0 filas; `territories(criteria jsonb)` | Datos por org (UI existe) |
| Motor de evaluación ICP "❌" | ✅ backend | `src/lib/services/crm/icpService.ts` (725 L); `POST /api/crm/icp/[id]/evaluate` (49 L); `icp`, `icp/[id]`, `icp/[id]/criteria`, `icp/[id]/criteria/[criterionId]` | Sin filas en `icp_profiles` el evaluador no tiene contra qué evaluar → seeds |
| Motor de asignación automática "❌" | ✅ backend | `assignmentService.ts` (411 L); `teams/org-members`, `teams/[id]/members/[memberId]` | Verificar que el pipeline lo invoque al crear lead (no verificado) |
| `roleService.ts` (crear) | ❌ con ese nombre | `MISS src/lib/services/crm/roleService.ts`; existe `salesStructureService.ts` (506 L) y `roles`, `roles/[id]`, `roles/job-positions` | Ajustar el doc: el servicio es `salesStructureService.ts` |
| UI `src/components/configuracion/crm/{EstructuraTab,IcpTab,IcpCriteriaEditor,RoleEditor,ScoringTab,VerticalesTab,VerticalPositioningEditor}.tsx` (crear) | ✅ **existe con otros nombres** | `src/components/configuracion/panels/crm/sections/`: `EstructuraComercialManager.tsx` (1306 L), `ICPManager.tsx` (793 L), `ScoringConfigurator.tsx` (340 L), `VerticalsManager.tsx` (305 L), montados en `CRMConfigPanel.tsx:747,759,699,675` | Ajustar rutas en el doc; dividir `EstructuraComercialManager` (1306 L > 300) cuando se toque |
| `scoring_configs` + `scoringService` + `ScoringSection` (✅ V3) | ✅ | 1 fila (org 134); `scoringService.ts` 696 L; `ScoringSection.tsx` 240 L importado por `OpportunityDrawer.tsx:21,515`; `POST/GET /api/crm/scoring/config` (231 L) | Seed de config por defecto para las otras orgs — §7.4 |
| `pipelineSeedService.ts` | ✅ | 305 L | — |
| `src/__tests__/services/icpService.test.ts` (crear) | ❌ | `MISS` | Test pendiente |
| Verticales importables (`verticales/import-template`) | ✅ | `api/crm/verticales/{route,[id],import-template}` (104/141/38 L) | — |

**Conclusión F1**: BD ✅, backend ✅, UI de configuración ✅ (en `panels/crm/sections`). Falta: seeds (`verticals`, `icp_profiles`, `scoring_configs` por org), test, y actualizar rutas del documento. **No bloquea F3–F9.**

### 4.2 FASE-02 — Pipeline profesional (gates, scoring, discovery, objeciones, closed-lost)

| Ítem del plan V3 | Estado real | Evidencia | Qué queda por hacer |
|---|---|---|---|
| `opportunities.record_type` "❌" | ✅ | columna `record_type! CHECK (lead\|deal)`; `/app/crm/leads/page.tsx` (405 L); `POST /api/crm/leads/[id]/convert` (118 L) | Añadir Leads al nav (F0-REG), acciones de contacto en la fila (F9) |
| `objections` / `opportunity_objections` "❌" | ✅ tablas, 0 filas | `objections(title!, category!, detection_signals jsonb!, recommended_response, discovery_questions jsonb!, related_case_studies[], vertical_id, is_active!, sort_order!)`; API `objections`, `objections/[id]`, `objections/opportunity/[opportunityId]`; `objectionService.ts` 279 L | Página `/app/crm/objeciones` ❌ (`MISS`); `ObjecionesList.tsx` 492 L 💀 sin importadores; `ObjecionEditor/ObjecionPanel` `MISS`; seeds catálogo — §7.5 |
| `discovery_templates` "❌" | ✅ 3 filas (orgs 1, 2, 134) | UNIQUE `(organization_id, name)`; `sections jsonb`; API `discovery/templates`, `discovery/templates/[id]`, `discovery/[opportunityId]`; `discoveryService.ts` 270 L, `discoveryTemplateService.ts` 145 L | `DiscoveryWizard.tsx` 666 L 💀 sin importadores (el drawer usa `DiscoverySection` 216 L); seeds para el resto de orgs — §7.6 |
| `opportunities.discovery_data`, columnas de seguimiento (`last_contact_at`, `contact_channel`, `contact_result`, `next_contact_at`, `recontact_at`) y closed-lost (`objection_id`, `loss_reason_value`, `competitor_name`, `competitor_price`, `missing_features[]`, `win_data`, `deal_type`, `closed_at`) "❌" | ✅ todas | schema de `opportunities` (brief); trigger `trg_opportunities_closed_at` habilitado | — |
| `StructuredLossDialog` (✅) y `LossReasonDialog` "consolidar" | 🟡 | `StructuredLossDialog.tsx` 314 L importado por `OpportunityDetail.tsx`, `OpportunityDrawer.tsx`, `KanbanBoard.tsx`; `LossReasonDialog.tsx` sigue existiendo | Consolidar (F9) |
| `loss_reasons` (✅) | ✅ 8 globales | política `loss_reasons_global_select`; `lossReasonsService.ts` 225 L (el doc cita `lossReasonService.ts` singular → `MISS`); `LossReasonsManager.tsx` 282 L en `CRMConfigPanel.tsx:687` | Corregir nombre en el doc |
| Gates: `stages.exit_criteria`, `stageGateService`, `GateWarningDialog`, `stages/[id]/gate` | 🟡 **backend sí, board vivo no** | `stageGateService.ts` 949 L; `POST /api/crm/stages/[id]/gate` 105 L; `GateWarningDialog.tsx` 92 L **solo importado por `KanbanBoard.tsx` (💀)**; el Kanban vivo `PipelineStages.tsx` no evalúa gates (audit UI B4) | F9 porta gates/`WonCloseModal`/realtime a `PipelineStages` |
| `KanbanBoard.tsx` con DnD (✅ V3) | 💀 | solo referenciado por `pipeline/index.ts` y `app/pm/tareas/page.tsx` (otro módulo); el CRM renderiza `PipelineStages.tsx` (1041 L) | F9 borra `KanbanBoard/KanbanColumn/OpportunityCard` tras portar |
| `opportunity_stage_history` + trigger (✅) | ✅ estructura, **0 filas** | `trg_opp_stage_history` habilitado; 26 oportunidades sin historial | Nada que hacer; confirma que no ha habido movimientos desde el trigger |
| `HoyView.tsx` (✅ V3) | 💀 | 426 L, 0 importadores | F9 decide si se monta en `/app/crm` (hoy `page.tsx`) o se elimina |
| Catálogo de plantillas de pipeline "❌" | ✅ | `pipelineTemplates.ts` 205 L (`sales/onboarding/renewal`), `pipeline-templates`, `pipeline-templates/[id]/import`; provisión automática en `api/modules/route.ts` (PROGRESS 2026-09) | `PipelineTemplateImporter.tsx` `MISS` (la creación vive en `PipelineHeader.tsx` 612 L) |
| `ExitGatesEditor` (config de gates) | ✅ | `sections/ExitGatesEditor.tsx` 311 L en `CRMConfigPanel.tsx:711` | — |
| `AutomationsView` "próximamente" | 🟡 sigue igual | `AutomationsView.tsx` 395 L montado en `PipelineView:180`; importa `AutomationSettings.tsx` (tabla `stage_automations` inexistente) | F8 lo reemplaza |
| Rutas `opportunities/[id]/discovery` y `opportunities/[id]/objections` (crear) | ❌ con ese path | `MISS`; equivalentes: `discovery/[opportunityId]`, `objections/opportunity/[opportunityId]` | Ajustar el doc |
| `src/__tests__/services/stageGateService.test.ts` | ❌ | `MISS` | Test pendiente |

**Conclusión F2**: BD ✅ (incluidas las 15 columnas), backend ✅, UI 🟡: leads ✅, config ✅, pero **gates/discovery/objeciones no están en la superficie que usa el vendedor** (board vivo sin gates; wizard y lista de objeciones sin montar; sin página de objeciones). Lo cierra F9 (montaje) + seeds §7.5–7.6.

### 4.3 FASE-10 — Demo, propuesta, contrato y pago

| Ítem del plan V3 | Estado real | Evidencia | Qué queda por hacer |
|---|---|---|---|
| `roi_calculators`, `contract_signatures`, `demo_sessions` "❌" | ✅ tablas, 0 filas | `roi_calculators(inputs, formula, outputs jsonb)`; `contract_signatures(provider d='documenso', signers jsonb, signed_pdf_path…)`; `demo_sessions(scheduled_at!, attendees, video_provider, checklist…)` | Seeds opcionales (`roi_calculators` por vertical) |
| Backend propuesta/contrato/demo/ROI/pago | ✅ | `proposalService.ts` 422 L, `contractService.ts` 399, `demoService.ts` 214, `roiService.ts` 287, `paymentService.ts` 273, `crmFinanceService.ts` 310; rutas `contracts`, `contracts/[id]`, `contracts/webhook`, `demos`, `demos/[id]`, `roi`, `roi/templates`, `roi/templates/[id]`, `payments/register`, `finance/[type]/[id]` | `contracts/sign` y `proposals/generate` (citadas) `MISS` → ajustar doc |
| `quotations.sections_json` (✅) | ✅ + más | `quotations` tiene `sections_json, payment_link_url, signature_id, opportunity_id` | — |
| `ProposalBuilderDialog.tsx` (✅ V3) | 💀 | `src/components/crm/propuestas/ProposalBuilderDialog.tsx` 385 L, **0 importadores** | Montar desde `QuickActionsBar`/detalle (F9/F10) |
| UI `contratos/{ContractSignDialog,PaymentLinkButton}`, `demo/{DemoChecklist,DemoScheduler}`, `propuestas/{ProposalGenerator,RoiCalculator}` (crear) | ❌ | `MISS` (6 archivos) | F10 |
| Cal.com / Daily.co / Documenso "❌" | ❌ | solo placeholders `CALCOM_API_KEY`, `DAILY_API_KEY`, `DOCUMENSO_API_KEY`; `provider_configs.category` admite `esign\|calendar\|video` (0 filas) | F10 (Documenso) y D1 Nivel 2 (Cal.com) |
| Envío de propuesta por email | 🟡 | depende de `ComposeEmailDialog` (F7) y adjuntos `documents` | F7 primero |

**Conclusión F10**: BD ✅, backend ✅, UI ❌ salvo un diálogo huérfano. Depende de F7 (email con adjunto) y F9 (barra de acciones).

### 4.4 FASE-11 — Post-venta (onboarding, health, renovación, expansión)

| Ítem del plan V3 | Estado real | Evidencia | Qué queda por hacer |
|---|---|---|---|
| `onboarding_templates/instances/steps` "❌" | ✅ tablas, 0 filas | UNIQUE `(organization_id, name)`; `steps jsonb`, `default_duration_days` | Seeds §7.7 |
| `fn_customer_health` "❌" | ✅ | `fn_customer_health(p_org_id integer, p_customer_id uuid)`; queda `refresh_mv_customer_health()` residual | Borrar la función residual (higiene) |
| `health_score_configs` / `snapshots` (✅) | ✅ 1 / 9 filas | PK `organization_id`; `GET /api/crm/health/[customerId]`, `POST /api/crm/health/recalculate` (cron) | **Nadie programa `health/recalculate`** (`vercel.json` y `cron.job` sin CRM) → F0-JOBS (`maintenance`) o pg_cron |
| `renewals/sync` (✅) | ✅ ruta | `POST /api/crm/renewals/sync` 106 L (cron) | Idem: sin scheduler |
| `pipelines.pipeline_type` "verificar" | ✅ | 10 pipelines; plantillas onboarding/renewal por `pipelineTemplates.ts` | — |
| `onboardingService` 880 L, `renewalService` 645, `expansionService` 342, `healthScoreService` 987 | ✅ | rutas `onboarding/templates`, `onboarding/instances`, `onboarding/instances/[id]`, `onboarding/instances/[id]/steps/[stepId]` | — |
| `SaludView` + `ClientHealthCard` | ✅ | `health/SaludView.tsx`, `ClientHealthCard.tsx` importado por `clientes/[id]/page.tsx`; `/app/crm/salud/page.tsx` 23 L | — |
| `OnboardingChecklist.tsx` | 💀 | `postventa/OnboardingChecklist.tsx` 221 L, 0 importadores | Montar en el pipeline de onboarding (F11) |
| `HealthGauge/HealthTrend/HealthAlerts` (crear) | ❌ | `MISS` | F11 |
| Secuencias de renovación | ❌ | dependen del motor F8 (`sequences` 0 filas) | F8 |

**Conclusión F11**: BD ✅, backend ✅, UI parcial (salud ✅, onboarding checklist 💀). Faltan seeds y **scheduler** (F0-JOBS ya crea la cola; añadir kinds `health_recalculate` y `renewals_sync` al job diario).

### 4.5 FASE-12 — Referidos y partners

| Ítem del plan V3 | Estado real | Evidencia | Qué queda por hacer |
|---|---|---|---|
| `referrals` "verificar"; `partners`, `partner_tiers`, `partner_deals`, `referral_programs` "❌" | ✅ las 5 tablas, 0 filas | UNIQUE `partner_tiers(organization_id, name)`, `referral_programs(organization_id, name)`; `referral_programs(reward_type!, reward_amount!, reward_to!)`; `partners(email!, tier_id, commission_rate d=10)` | Seeds §7.8 |
| Backend | ✅ | `partnerService.ts` 390 L, `referralsService.ts` 291 L; rutas `partners`, `partners/[id]`, `partners/[id]/deals`, `partners/tiers`, `partners/tiers/[id]`, `referrals`, `referrals/[id]`, `referrals/programs`, `referrals/programs/[id]` | — |
| `/app/crm/partners`, `/app/crm/referidos` (crear) | ❌ | `MISS` | F12 |
| `partners/{PartnerList,PartnerEditor,TierEditor,PartnerDealList}`, `referidos/{ReferralList,ReferralProgramEditor}` (crear) | ❌ | `MISS` (6 archivos) | F12 |
| Config del programa | ✅ | `sections/ReferralsProgramCard.tsx` 351 L en `CRMConfigPanel.tsx:735` | — |

**Conclusión F12**: BD ✅, backend ✅, UI solo la tarjeta de configuración. Fase de UI + seeds; no bloquea nada.

### 4.6 FASE-13 — Equipo, cuotas, comisiones, dashboard de vendedor

| Ítem del plan V3 | Estado real | Evidencia | Qué queda por hacer |
|---|---|---|---|
| `sales_targets` "❌ única tabla nueva" | ✅ tabla, 0 filas | `sales_targets(user_id!, period!, period_start!, period_end!, target_amount!, target_currency d='USD', target_type d='revenue', achieved_amount)` | UI de cuotas |
| `sales_roles/teams/territories` "F1 los crea" | ✅ | ver §4.1; UI `equipo/tabs/{EquiposTab,TerritoriosTab,AsignarTab,PerformanceTab}` + `dialogs/{MemberDialog,TeamDialog,TerritoryDialog,DeleteConfirmDialog}` (15 archivos, 1698 L) montados en `/app/crm/equipo` | — |
| `commissions` (✅ 100+) | ✅ 103 filas | trigger `trg_create_commission_on_opportunity_won`; `commissionService.ts` 670 L; rutas `commissions/[id]/pay`, `commissions/[id]/reject`, `commissions/bulk-pay`; `salesTargetService.ts` 343 L; `sales-targets`, `sales-targets/[id]`, `sales-targets/progress` | — |
| `/app/finanzas/comisiones` "mejorar" | 🟡 | `page.tsx` 95 L + `components/finanzas/comisiones/{ComisionesFilters,Header,List,Stats}.tsx`; `ComisionesSummary/Toolbar/ClawbackDialog` `MISS` | F13 |
| `CommissionRatesPanel.tsx` (crear) | ✅ con otro nombre | `sections/CommissionsPanel.tsx` 359 L en `CRMConfigPanel.tsx:723` | Ajustar doc |
| `commissions`, `targets`, `seller-dashboard` API (crear) | 🟡 | `commissions/*` ✅ (3 rutas), `sales-targets/*` ✅ (3); `seller-dashboard` `MISS`; `sellerDashboardService.ts` `MISS` | F13 |
| Widgets en `/app/inicio` (`CommissionsWidget`, `MyPipelineWidget`, `QuotaProgressWidget`, `SellerLeaderboardWidget`) y `QuotaEditor/QuotaHistory` en miembros | ❌ | `MISS` (6 archivos) | F13; **`src/app/app/inicio/page.tsx`, `DashboardKPIs.tsx`, `KpiDetailDialog.tsx` son WIP del dueño (regla 7): no tocar sin coordinación** |
| Métricas de llamadas por vendedor (PLAN §7: "añade métricas de F4") | ✅ RPC lista | `fn_call_quality(p_org_id, p_start, p_end, p_user_id)`; `GET /api/crm/call-quality` | Consumir en el dashboard cuando existan llamadas |

**Conclusión F13**: BD ✅, backend ✅ salvo `seller-dashboard`, UI parcial (equipo ✅, comisiones 🟡, cuotas/widgets ❌).

### 4.7 FASE-14 — Revenue OS

| Ítem del plan V3 | Estado real | Evidencia | Qué queda por hacer |
|---|---|---|---|
| `fn_revenue_metrics`, `fn_pipeline_funnel`, `fn_cohort_retention`, `fn_customer_health`, `fn_call_quality` "❌" | ✅ las 5 | §1.2 | — |
| Prerrequisitos de esquema (`opportunities.closed_at`…) | ✅ | trigger `trg_opportunities_closed_at` | — |
| Backend | ✅ | `revenueOsService.ts` 404 L, `commercialMetricsService.ts` 678 L; rutas `revenue/{metrics,funnel,cohorts,kpis,dashboard}` | `revenue-os/route.ts` (citada) `MISS` → ajustar doc |
| `forecastService.ts`, `forecastRealTimeService.ts` "✅ existen" | ❌ **falso** | `MISS` ambos; el pronóstico vive en `components/crm/pronostico/{ForecastDashboard,ForecastChart,ForecastByStage,ForecastFilters,GoalProgress}.tsx` (700 L) y `pipeline/Forecast*.tsx` | Corregir doc |
| `components/crm/revenueos/*` (8 archivos, crear) | ❌ | `MISS`; existen `metricas/{MetricasView,FunnelView}.tsx` (720 L): `MetricasView` importado por `inicio/sections/CrmSection.tsx`; `FunnelView` 💀 | F14 |
| `/app/reportes` (✅) | ✅ | `src/app/app/reportes/page.tsx` 311 L; `components/crm/reportes/*` (10 archivos, 1694 L) | — |

**Conclusión F14**: BD ✅ (5 RPC), backend ✅, UI parcial (métricas básicas en inicio y reportes; sin dashboard Revenue OS). No bloquea.

### 4.8 FASE-15 — Motion y cross-platform

| Ítem del plan V3 | Estado real | Evidencia | Qué queda por hacer |
|---|---|---|---|
| `motion` "❌ instalar en F0" | ✅ | `package.json:83` `"motion": "^13.1.1"`; `MotionProvider` en `layout.tsx:18`; `src/lib/motion/variants.ts` 66 L | `useMotionPref.ts` `MISS` |
| `platformCapabilities.ts`, `nativeBridge.ts` (crear) | ❌ | `MISS` | F5/F15 |
| Capacitor permisos | 🔴 | `mobile/android/app/src/main/AndroidManifest.xml` solo `INTERNET`; `mobile/templates/Info.plist` sin `NSMicrophoneUsageDescription` (audit UI, corrección del orquestador) | F0-REG/F5 (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, plist) |
| Electron permisos | 🟡 | sin `setPermissionRequestHandler` (`electron/src/main/index.ts:52`) | F0-REG/F15 |
| Tests E2E cross-platform | ❌ | — | F15 |

---

## 5. Hallazgos nuevos verificados en esta ronda (no estaban en los audits del 2026-09-08 am)

| Id | Hallazgo | Evidencia | Severidad | Fase |
|---|---|---|---|---|
| SCH-21 | **El inbound de WhatsApp Cloud API no puede persistir mensajes**: `processIncomingMessage` inserta `sender_type, sender_id, external_id, status` (columnas inexistentes) y `role: 'user'` (CHECK `customer\|agent\|ai\|system`), sin `direction`, `channel_id` ni `content` (NOT NULL) → error 42703/23502 en cada mensaje entrante | `whatsappCloudService.ts:413-423`; columnas reales de `messages`: `id, organization_id!, conversation_id!, channel_id!, direction!, role!, sender_customer_id, sender_member_id, content_type!, content!, payload, external_message_id, is_read, read_at, metadata, created_at, branch_id, related_opportunity_id`. Los 37 mensajes `whatsapp` existentes entraron por otro path (bandeja/Evolution). Corrige la afirmación "A2 funciona" del audit de mensajería | 🔴 | F16 (F0-SEC si toca el webhook) |
| SCH-22 | `processStatusUpdate` busca por `external_id` (columna inexistente; la real es `external_message_id`) → los estados `sent/delivered/read` nunca se aplican | `whatsappCloudService.ts:437` | 🟠 | F16 |
| SCH-23 | `callManagementService.createCall` inserta `status: data.status ?? 'queued'` (fuera del CHECK) y `duration_source: data.duration_source ?? null` (columna NOT NULL) → ninguna llamada creada por este servicio puede insertarse aunque `mode` sea válido | `callManagementService.ts:307,322`; CHECK `calls.status`; `duration_source! CHECK (provider\|estimated\|manual)` | 🔴 | F0-SEC (`enums.ts`) / F3 |
| SCH-24 | `applyAnalysis` crea tareas con `priority: task.priority ?? 'medium'` y `status: 'pending'`; el CHECK de `tasks` es `priority IN (low\|med\|high\|critical)` y `status IN (open\|in_progress\|done\|canceled)` → 23514 al aplicar cualquier análisis con tareas sugeridas | `callAnalysisService.ts:691-692`; `pg_constraint` de `tasks` | 🔴 | F4 |
| SEC-27 | `comm_usage_logs` solo admite `SELECT` para usuarios; `twilioService.ts` escribe con el cliente browser → el log de uso/costo de SMS/WA se pierde en silencio | §2; `twilioService.ts:9,172` | 🟠 | F0-SEC (`getServiceClient`) |
| SEC-28 | `crm-documents` sin políticas en `storage.objects` (bucket privado inutilizable para miembros) | §1.4 | 🟠 | F0-DB (M3) / F9 |
| SEC-29 | `cron.job` 4 con token en `command` | §1.4 | 🔴 (fuera de CRM) | dueño: rotar service key; F0-DB reescribe el job leyendo Vault |
| WIRE-51 | `provider_configs` con 4 políticas de escritura para `authenticated` → cualquier miembro puede insertar/alterar credenciales de la org sin pasar por el control de admin del PUT | §2; tester F00 #3 | 🟠 | F0-DB (REVOKE) |
| WIRE-52 | Seis componentes V3 terminados sin importadores: `ObjecionesList` (492 L), `DiscoveryWizard` (666), `ProposalBuilderDialog` (385), `OnboardingChecklist` (221), `HoyView` (426), `FunnelView` | `grep -rl` sin resultados fuera del propio archivo | 🟡 | F9 / F10 / F11 / F14 |
| WIRE-53 | Cinco rutas cron (`health/recalculate`, `renewals/sync`, `sequences/run`, `voice-agents/campaigns/run`, `followup/run`) sin ningún scheduler | `vercel.json` (10 crons no CRM); `cron.job` sin `crm-*` | 🟠 | F0-JOBS (kinds en el job de mantenimiento) |
| DOC-01 | Rutas de archivos erróneas en los docs V3: `configuracion/crm/*` → `configuracion/panels/crm/sections/*`; `lossReasonService.ts` → `lossReasonsService.ts`; `roleService.ts` → `salesStructureService.ts`; `forecastService.ts`/`forecastRealTimeService.ts` no existen; `contracts/sign`, `proposals/generate`, `revenue-os`, `opportunities/[id]/{discovery,objections}` no existen con ese path | §4 | ⚪ | Cabeceras "Estado V4" añadidas hoy en cada doc |
| DOC-02 | Conteos del PROMPT-MAESTRO desactualizados: `messages` 255 144 (no 4 344), `customers` 32 961, `loss_reasons` 8 (no 0), `discovery_templates` 3, `scoring_configs` 1, `opportunities` 26, `stages` 61, `pipelines` 10 | §1.1 | ⚪ | Este anexo |

---

## 6. Conclusión: qué fases V3 están implementadas en BD/backend pero sin UI o sin seeds

| Fase V3 | BD | Backend | UI | Seeds | Diagnóstico | Acción V4 |
|---|---|---|---|---|---|---|
| F1 Estructura comercial | ✅ | ✅ | ✅ config (`panels/crm/sections`) · ✅ equipo | ❌ `verticals`, `icp_profiles`, `scoring_configs` (solo org 134) | "Hecha" pero vacía → parece que no funciona | Seeds §7.2–7.4; corregir doc |
| F2 Pipeline profesional | ✅ | ✅ | 🟡 leads ✅, config ✅; gates/discovery/objeciones fuera del board vivo; sin `/objeciones` | ❌ `objections`; `discovery_templates` solo 3 orgs | Backend completo; el vendedor no lo ve | F9 monta; seeds §7.5–7.6 |
| F10 Propuesta/contrato/pago | ✅ | ✅ | ❌ (1 diálogo 💀) | opcional | Espera F7/F9 | Ola 5 |
| F11 Post-venta | ✅ (+ `fn_customer_health`) | ✅ | 🟡 salud ✅; checklist 💀 | ❌ `onboarding_templates` | Sin scheduler para recalcular/renovar | F0-JOBS kinds; seeds §7.7 |
| F12 Referidos/partners | ✅ | ✅ | ❌ (solo tarjeta de config) | ❌ `partner_tiers`, `referral_programs` | Solo UI + seeds | Ola 5; seeds §7.8 |
| F13 Equipo/comisiones | ✅ | 🟡 falta `seller-dashboard` | 🟡 equipo ✅, comisiones parcial, cuotas ❌ | — (`sales_targets` se llena por UI) | | Ola 5 |
| F14 Revenue OS | ✅ (5 RPC) | ✅ | 🟡 métricas básicas; sin dashboard | — | | Ola 5 |
| F15 Motion/cross-platform | n/a | n/a | 🟡 `motion` ✅; permisos ❌ | — | Permisos móviles los absorbe F0-REG/F5 | Ola 5 |

Regla derivada para el PLAN: **F1, F2, F10–F14 no se "reimplementan"; se reconcilian** (seeds + montaje de UI existente + páginas faltantes), y por eso van a la Ola 5 detrás de F9 (que aporta la barra de acciones y el timeline donde esa UI se engancha).

---

## 7. Seeds faltantes: INSERT recomendados (los aplica el agente DB en una fase posterior; **no ejecutar aquí**)

Principios: idempotentes (`ON CONFLICT` donde hay UNIQUE, `WHERE NOT EXISTS` donde no); alcance = organizaciones con el módulo CRM activo (`organization_modules` / o, provisionalmente, las que tienen pipelines: `SELECT DISTINCT organization_id FROM pipelines`); nunca `organization_id = 1` fijo (guardrail V3); textos en español neutro; el DB agent puede envolverlos en una migración `crm_v4_f0x_seeds_config` con `SECURITY DEFINER` para reutilizarla al activar el módulo (`api/modules/route.ts` ya provisiona pipelines).

### 7.1 Alcance común

```sql
-- Orgs objetivo (provisional): las que ya tienen un pipeline. Sustituir por organization_modules cuando el DB agent lo confirme.
CREATE TEMP TABLE _orgs AS SELECT DISTINCT organization_id AS id FROM pipelines;
```

### 7.2 `verticals` (0 filas; sin UNIQUE → `NOT EXISTS` por `(organization_id, slug)`)

```sql
INSERT INTO verticals (organization_id, name, slug, color, sort_order, description, positioning, metadata)
SELECT o.id, v.name, v.slug, v.color, v.sort_order, v.description, '{}'::jsonb, '{}'::jsonb
FROM _orgs o
CROSS JOIN (VALUES
  ('Restaurantes y bares','restaurantes','#f97316',10,'Operación de mesas, delivery y caja'),
  ('Retail y comercio','retail','#3b82f6',20,'Punto de venta, inventario y fidelización'),
  ('Hotelería y turismo','hoteleria','#8b5cf6',30,'Reservas, PMS y housekeeping'),
  ('Servicios profesionales','servicios','#10b981',40,'Proyectos, horas y facturación'),
  ('Salud y bienestar','salud','#ec4899',50,'Agenda, historias y recordatorios'),
  ('Educación','educacion','#eab308',60,'Matrículas, cobros y comunicación'),
  ('Software / SaaS','saas','#06b6d4',70,'Suscripciones, onboarding y renovación'),
  ('Otros','otros','#6b7280',99,'Vertical genérica')
) AS v(name, slug, color, sort_order, description)
WHERE NOT EXISTS (SELECT 1 FROM verticals x WHERE x.organization_id = o.id AND x.slug = v.slug);
```

### 7.3 `icp_profiles` (0 filas; UNIQUE `(organization_id, band)`)

```sql
INSERT INTO icp_profiles (organization_id, name, band, description, priority, color, sla_first_contact_hours)
SELECT o.id, p.name, p.band, p.description, p.priority, p.color, p.sla
FROM _orgs o
CROSS JOIN (VALUES
  ('ICP A — encaje ideal','A','Cumple tamaño, presupuesto, urgencia y decisor identificado',10,'#16a34a',4),
  ('ICP B — encaje bueno','B','Cumple la mayoría de criterios; requiere calificación adicional',50,'#f59e0b',24),
  ('ICP C — encaje bajo','C','Fuera del perfil objetivo; solo si hay capacidad',90,'#ef4444',72)
) AS p(name, band, description, priority, color, sla)
ON CONFLICT (organization_id, band) DO NOTHING;

-- Criterios base (icp_criteria: verificar columnas exactas antes de aplicar; el doc F1 §2.2 define el schema jsonb)
```

### 7.4 `scoring_configs` y `health_score_configs` (1 fila cada una; la config por defecto debe copiarse del schema canónico de F1 §2.2 / F11 §2.2)

```sql
-- scoring_configs: sin UNIQUE → NOT EXISTS por organization_id. Tomar como plantilla la fila de org 134 (verificar con SELECT config FROM scoring_configs WHERE organization_id = 134).
INSERT INTO scoring_configs (organization_id, config, is_active)
SELECT o.id, (SELECT config FROM scoring_configs WHERE organization_id = 134 LIMIT 1), true
FROM _orgs o
WHERE NOT EXISTS (SELECT 1 FROM scoring_configs s WHERE s.organization_id = o.id);

-- health_score_configs: PK organization_id → ON CONFLICT. Copiar la única fila existente como plantilla.
INSERT INTO health_score_configs (organization_id, config, refresh_interval_hours, is_active)
SELECT o.id, (SELECT config FROM health_score_configs LIMIT 1), 24, true
FROM _orgs o
ON CONFLICT (organization_id) DO NOTHING;
```

### 7.5 `objections` (0 filas; sin UNIQUE → `NOT EXISTS` por `(organization_id, title)`)

```sql
INSERT INTO objections (organization_id, title, category, detection_signals, recommended_response, discovery_questions, sort_order)
SELECT o.id, x.title, x.category, x.signals::jsonb, x.response, x.questions::jsonb, x.sort_order
FROM _orgs o
CROSS JOIN (VALUES
  ('Es muy caro','precio','["caro","precio","presupuesto","costoso"]','Reencuadrar en valor: costo por día vs. ahorro/ingreso; ofrecer plan escalonado.','["¿Con qué lo comparas?","¿Qué presupuesto tienen asignado?"]',10),
  ('Ya tenemos un proveedor','competencia','["ya tenemos","usamos","proveedor actual"]','Preguntar qué funciona y qué no; posicionar diferenciador; proponer piloto paralelo.','["¿Qué te gustaría que hiciera mejor tu sistema actual?"]',20),
  ('No es el momento','timing','["más adelante","el otro año","ahora no"]','Cuantificar el costo de esperar; fijar fecha de recontacto con hito concreto.','["¿Qué tendría que pasar para que sea el momento?"]',30),
  ('Tengo que consultarlo','decisor','["consultar","mi socio","el gerente"]','Identificar al decisor y ofrecer una demo conjunta.','["¿Quién más participa en la decisión?","¿Qué le preocuparía a esa persona?"]',40),
  ('Le faltan funcionalidades','funcionalidad','["no tiene","falta","no hace"]','Aclarar el caso de uso real; registrar en missing_features; ofrecer alternativa o roadmap.','["¿Cómo resuelves eso hoy?","¿Es bloqueante o deseable?"]',50),
  ('No confío / no los conozco','confianza','["no los conozco","referencias","garantía"]','Casos de éxito del mismo vertical; garantía o piloto; referencias.','["¿Qué te daría tranquilidad para avanzar?"]',60),
  ('Es complicado de implementar','implementación','["complicado","migrar","capacitar"]','Explicar onboarding acompañado (F11); mostrar importación de datos.','["¿Cuántas personas lo usarían?","¿Qué datos habría que migrar?"]',70)
) AS x(title, category, signals, response, questions, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM objections ob WHERE ob.organization_id = o.id AND ob.title = x.title);
```

### 7.6 `discovery_templates` (3 filas; UNIQUE `(organization_id, name)`)

```sql
-- Copiar la plantilla "Discovery General/Ventas" (org 2) a todas las orgs sin plantilla activa.
INSERT INTO discovery_templates (organization_id, name, sections, is_active)
SELECT o.id, 'Discovery General/Ventas', (SELECT sections FROM discovery_templates WHERE organization_id = 2 AND name = 'Discovery General/Ventas' LIMIT 1), true
FROM _orgs o
WHERE NOT EXISTS (SELECT 1 FROM discovery_templates d WHERE d.organization_id = o.id AND d.is_active)
ON CONFLICT (organization_id, name) DO NOTHING;
```

### 7.7 `onboarding_templates` (0 filas; UNIQUE `(organization_id, name)`)

```sql
INSERT INTO onboarding_templates (organization_id, name, default_duration_days, steps)
SELECT o.id, 'Onboarding estándar 30 días', 30, '[
  {"key":"kickoff","title":"Kickoff y objetivos","day":0,"owner":"vendor"},
  {"key":"config","title":"Configuración inicial","day":2,"owner":"cs"},
  {"key":"import","title":"Importación de datos","day":5,"owner":"cs"},
  {"key":"training","title":"Capacitación del equipo","day":7,"owner":"cs"},
  {"key":"assisted","title":"Uso asistido","day":10,"owner":"cs"},
  {"key":"review14","title":"Revisión día 14","day":14,"owner":"vendor"},
  {"key":"br30","title":"Business review día 30","day":30,"owner":"vendor"}
]'::jsonb
FROM _orgs o
ON CONFLICT (organization_id, name) DO NOTHING;
```

### 7.8 `partner_tiers` y `referral_programs` (0 filas; UNIQUE `(organization_id, name)` en ambas)

```sql
INSERT INTO partner_tiers (organization_id, name, min_deals, min_revenue, commission_rate, benefits)
SELECT o.id, t.name, t.min_deals, t.min_revenue, t.rate, t.benefits::jsonb
FROM _orgs o
CROSS JOIN (VALUES
  ('Registrado',0,0,10.00,'["Material comercial","Registro de deals"]'),
  ('Plata',3,5000,15.00,'["Co-marketing","Soporte prioritario"]'),
  ('Oro',10,25000,20.00,'["Leads compartidos","Gerente de canal"]')
) AS t(name, min_deals, min_revenue, rate, benefits)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO referral_programs (organization_id, name, description, reward_type, reward_amount, reward_to, is_active)
SELECT o.id, 'Referidos de clientes', 'El cliente que refiere recibe un descuento cuando el referido se convierte en cliente', 'discount', 10, 'referrer', true
FROM _orgs o
ON CONFLICT (organization_id, name) DO NOTHING;
-- Verificar antes: CHECKs de reward_type / reward_to (no se leyeron en esta ronda).
```

### 7.9 `call_tags` (0 filas; UNIQUE `(organization_id, name)`) — la usa F4 (auto-tags)

```sql
INSERT INTO call_tags (organization_id, name, color, category, is_auto, rules)
SELECT o.id, t.name, t.color, t.category, t.is_auto, t.rules::jsonb
FROM _orgs o
CROSS JOIN (VALUES
  ('Interesado','#16a34a','outcome',true,'{"sentiment":"positive"}'),
  ('Objeción de precio','#f59e0b','objection',true,'{"objection_category":"precio"}'),
  ('Competencia mencionada','#8b5cf6','signal',true,'{"has_competitors":true}'),
  ('Decisor identificado','#0ea5e9','signal',true,'{"decision_maker_identified":true}'),
  ('Sin respuesta','#6b7280','outcome',false,'{}'),
  ('Buzón de voz','#6b7280','outcome',false,'{}'),
  ('Seguimiento requerido','#ef4444','next_step',true,'{"has_next_steps":true}')
) AS t(name, color, category, is_auto, rules)
ON CONFLICT (organization_id, name) DO NOTHING;
```

### 7.10 `provider_configs` (0 filas; UNIQUE `(organization_id, category, provider)`)

Lo cubre **F0 M9** (`202609_crm_v4_f00_seed_provider_configs`: 14 filas por org, 434 filas para 31 orgs según el tester F00 r1). No duplicar aquí; solo recordar que debe correr **después** del REVOKE de escritura para `authenticated` (tester #3) y con `credentials = '{}'` (la clave vive en Vault).

### 7.11 Verificación post-seed (debe devolver > 0 en todas)

```sql
SELECT 'verticals' t, count(*) FROM verticals
UNION ALL SELECT 'icp_profiles', count(*) FROM icp_profiles
UNION ALL SELECT 'scoring_configs', count(*) FROM scoring_configs
UNION ALL SELECT 'health_score_configs', count(*) FROM health_score_configs
UNION ALL SELECT 'objections', count(*) FROM objections
UNION ALL SELECT 'discovery_templates', count(*) FROM discovery_templates
UNION ALL SELECT 'onboarding_templates', count(*) FROM onboarding_templates
UNION ALL SELECT 'partner_tiers', count(*) FROM partner_tiers
UNION ALL SELECT 'referral_programs', count(*) FROM referral_programs
UNION ALL SELECT 'call_tags', count(*) FROM call_tags
UNION ALL SELECT 'provider_configs', count(*) FROM provider_configs;
-- y: ninguna fila con organization_id = 1 salvo que la org 1 tenga pipelines.
```

---

## 8. Pendiente de verificar (no se afirma nada al respecto)

- Columnas exactas de `icp_criteria` y CHECKs de `referral_programs.reward_type/reward_to` (seeds §7.3 y §7.8 marcados "verificar antes").
- Si `assignmentService` se invoca al crear un lead (no se buscó el call site).
- Contenido de `organization_modules` para reemplazar el alcance provisional de `_orgs` (§7.1).
- Conteo de políticas de `voice_agent_campaigns`/`voice_agent_calls` (el brief dice 4/4; no se re-verificó).
- Cuántas de las 114 rutas `api/crm/**` usan `getServerOrgContext` (el guardrail #5 de F0-SEC lo cubrirá).
- Estado de `src/lib/jobs/**`, `src/lib/security/webhookSignatures.ts`, `src/lib/supabase/server-service.ts` y `src/lib/crm/enums.ts`: existen en el árbol (creados hoy por SEC/JOBS) pero no se revisaron aquí; los reportan sus builders.

---

## 9. Método (para reproducir)

```sql
-- conteos reales
select t.tbl, (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.'||t.tbl,false,true,'')))[1]::text::bigint
from (values ('loss_reasons'),('verticals'),…) t(tbl) where exists (select 1 from information_schema.tables where table_schema='public' and table_name=t.tbl);
-- políticas
select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename in (…) order by 1,3;
-- funciones
select proname, pg_get_function_identity_arguments(oid) from pg_proc where pronamespace='public'::regnamespace and proname in (…);
-- cron / buckets / storage
select jobid, jobname, schedule, active from cron.job; select name, public from storage.buckets; select policyname, cmd from pg_policies where schemaname='storage';
```

```bash
find src/app/api/crm -name route.ts | sed 's#src/app/api/crm/##; s#/route.ts##' | sort   # 114 rutas
wc -l src/lib/services/crm/*.ts                                                        # 51 archivos, 22 560 L
grep -oE '`src/[^`]+\.(ts|tsx)`' docs/crm-revenue-os/FASE-1X-*.md | tr -d '`' | sort -u | while read p; do test -e "$p" && echo OK $p || echo MISS $p; done
grep -rl "\bObjecionesList\b" src | grep -v ObjecionesList.tsx                          # vacío = sin importadores
```

---

## 10. Inventario verificado de backend por fase V3 (para no reescribir lo que ya existe)

`find src/app/api/crm -name route.ts` → **114 rutas**; `wc -l src/lib/services/crm/*.ts` → **51 archivos, 22 560 líneas**. Agrupación por la fase V3 que las declaró (las de F0/F3–F9/F16 se documentan en sus FASE-XX V4 y no se repiten aquí).

| Fase V3 | Rutas `src/app/api/crm/**` (existentes) | Servicios `src/lib/services/crm/` (líneas) |
|---|---|---|
| F1 | `icp`, `icp/[id]`, `icp/[id]/criteria`, `icp/[id]/criteria/[criterionId]`, `icp/[id]/evaluate`, `roles`, `roles/[id]`, `roles/job-positions`, `teams`, `teams/[id]`, `teams/[id]/members`, `teams/[id]/members/[memberId]`, `teams/org-members`, `territories`, `territories/[id]`, `verticales`, `verticales/[id]`, `verticales/import-template`, `scoring/config` | `icpService` 725 · `assignmentService` 411 · `salesStructureService` 506 · `verticalsService` 440 · `scoringService` 696 · `pipelineSeedService` 305 |
| F2 | `leads`, `leads/[id]/convert`, `objections`, `objections/[id]`, `objections/opportunity/[opportunityId]`, `discovery/templates`, `discovery/templates/[id]`, `discovery/[opportunityId]`, `stages/[id]/gate`, `pipeline-templates`, `pipeline-templates/[id]/import` | `stageGateService` 949 · `objectionService` 279 · `discoveryService` 270 · `discoveryTemplateService` 145 · `lossReasonsService` 225 · `leadCaptureService` 214 · `pipelineTemplates` 205 · `followupService` 369 |
| F10 | `contracts`, `contracts/[id]`, `contracts/webhook`, `demos`, `demos/[id]`, `roi`, `roi/templates`, `roi/templates/[id]`, `payments/register`, `finance/[type]/[id]` | `proposalService` 422 · `contractService` 399 · `demoService` 214 · `roiService` 287 · `paymentService` 273 · `crmFinanceService` 310 |
| F11 | `onboarding/templates`, `onboarding/instances`, `onboarding/instances/[id]`, `onboarding/instances/[id]/steps/[stepId]`, `health/[customerId]`, `health/recalculate`, `renewals/sync` | `onboardingService` 880 · `renewalService` 645 · `expansionService` 342 · `healthScoreService` 987 |
| F12 | `partners`, `partners/[id]`, `partners/[id]/deals`, `partners/tiers`, `partners/tiers/[id]`, `referrals`, `referrals/[id]`, `referrals/programs`, `referrals/programs/[id]` | `partnerService` 390 · `referralsService` 291 |
| F13 | `commissions/[id]/pay`, `commissions/[id]/reject`, `commissions/bulk-pay`, `sales-targets`, `sales-targets/[id]`, `sales-targets/progress`, `call-quality` | `commissionService` 670 · `salesTargetService` 343 · `commercialMetricsService` 678 |
| F14 | `revenue/metrics`, `revenue/funnel`, `revenue/cohorts`, `revenue/kpis`, `revenue/dashboard` | `revenueOsService` 404 |
| Enlaces con otros módulos (V3) | — | `crmIntegrations` 270 · `inventoryCrmLink` 168 · `pmsCrmLink` 170 · `posCrmLink` 207 · `index.ts` 377 |

Lectura: 58 de las 114 rutas y 30 de los 51 servicios pertenecen a fases V3 "conservadas". Por eso la Ola 5 es de **montaje y seeds**, no de construcción: cada componente nuevo de F10–F14 debe consumir estas rutas (con `getServerOrgContext` ya aplicado por F0-SEC) en vez de crear servicios paralelos.

### 10.1 UI V3 existente que la Ola 5 debe reutilizar (con tamaño real)

| Carpeta `src/components/crm/` | Archivos / líneas | Estado |
|---|---|---|
| `equipo/` | 15 / 1 698 (`EquipoPage`, `EquipoSidebar`, `useEquipoData`, `tabs/{Asignar,Equipos,Performance,Territorios}Tab`, `dialogs/{Member,Team,Territory,DeleteConfirm}Dialog`) | ✅ montado en `/app/crm/equipo` |
| `configuracion/panels/crm/sections/` (fuera de `crm/`) | 8 / 4 047 (`EstructuraComercialManager` 1 306, `ICPManager` 793, `CommissionsPanel` 359, `ReferralsProgramCard` 351, `ScoringConfigurator` 340, `ExitGatesEditor` 311, `VerticalsManager` 305, `LossReasonsManager` 282) | ✅ montado en `CRMConfigPanel.tsx` (838 L); 2 archivos > 300 L a dividir cuando se toquen |
| `health/` | 2 / 963 (`SaludView`, `ClientHealthCard`) | ✅ |
| `pronostico/` | 6 / 700 (`ForecastDashboard`, `ForecastChart`, `ForecastByStage`, `ForecastFilters`, `GoalProgress`) | ✅ `/app/crm/pronostico` |
| `reportes/` | 10 / 1 694 | ✅ (`ReportesPage` importado por 7 páginas de otros módulos) |
| `metricas/` | 2 / 720 (`MetricasView` ✅ en `inicio/sections/CrmSection.tsx`; `FunnelView` 💀) | 🟡 |
| `objeciones/`, `discovery/`, `propuestas/`, `postventa/`, `hoy/` | 1 archivo cada una: 492, 666, 385, 221, 426 L | 💀 sin importadores (WIRE-52) |
| `dashboard/` | 10 / 2 162 (`CRMKPICards`, `CRMFunnelChart`, `CRMQuickNav`…) | ✅ `/app/crm` |
| `segmentos/`, `campanas/`, `identidades/`, `actividades/` | 8 / 1 487 · 8 / 1 523 · 9 / 1 637 · 11 / 2 238 | ✅ montados (campañas con envío no real: WIRE-34) |
| `pipeline/` | 59 / 17 565 | ✅ vivo (`PipelineStages`, `OpportunityDrawer`, `PipelineHeader`…) + 💀 (`KanbanBoard/KanbanColumn/OpportunityCard`, `AutomationSettings`, `EmailNotifications.ts/.tsx`) |
| `oportunidades/` | 17 / 6 848 (`OpportunityDetail` 1 330, `StructuredLossDialog` 314, `ScoringSection` 240…) | ✅ |
