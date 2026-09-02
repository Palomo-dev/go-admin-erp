# ANEXO A — Inventario verificado del CRM actual (UI · BD · Backend)

> Fecha de verificación: 2026-08-31
> Método: exploración directa del repo + consulta a las 378 tablas live de Supabase `jgmgphmzusbluqhuqihj`.
> Todo lo que aquí aparece fue **verificado en código o en BD**. Lo que no se encontró se marca como ❌.

---

## 1. Base de datos — estado real

### 1.0 Tipos de llaves primarias — LEER ANTES DE ESCRIBIR CUALQUIER MIGRACIÓN

> Verificado por `information_schema` el 2026-09-01. Esta tabla es la causa raíz de los
> errores de FK detectados por QA en F1. **No es `bigint`: `organizations.id` es `integer`.**

| Tabla | PK | Tipo real | FK que debe usarse |
|---|---|---|---|
| `organizations` | `id` | **`integer`** | `organization_id integer REFERENCES organizations(id)` |
| `branches` | `id` | **`integer`** | `branch_id integer REFERENCES branches(id)` |
| `journal_entries` | `id` | **`integer`** | `journal_entry_id integer` |
| `organization_members` | `id` | **`bigint`** | casi nunca se referencia por `id`; usa `user_id uuid` |
| `auth.users` / `profiles` | `id` | `uuid` | `user_id uuid REFERENCES auth.users(id)` |
| `customers` | `id` | `uuid` | `customer_id uuid REFERENCES customers(id)` |
| `opportunities` | `id` | `uuid` | `opportunity_id uuid` |
| `pipelines`, `stages` | `id` | `uuid` | `stage_id uuid`, `pipeline_id uuid` |
| `quotations`, `invoice_sales`, `payments`, `accounts_receivable` | `id` | `uuid` | `*_id uuid` |
| `commissions`, `vendor_commission_rates` | `id` | `uuid` | `*_id uuid` |
| `templates`, `notification_templates`, `automations`, `campaigns` | `id` | `uuid` | `*_id uuid` |
| `tasks`, `activities`, `loss_reasons`, `scoring_configs`, `verticals` | `id` | `uuid` | `*_id uuid` |

**Regla derivada, obligatoria para toda tabla nueva del CRM:**

```sql
-- ✅ CORRECTO
organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
branch_id      integer     NULL REFERENCES branches(id)
user_id        uuid        NULL REFERENCES auth.users(id)
id             uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY

-- ❌ INCORRECTO (falla la migración)
organization_id bigint REFERENCES organizations(id)   -- tipo incompatible
organization_id uuid   REFERENCES organizations(id)   -- tipo incompatible
```

Columnas ya verificadas que confirman el patrón: `opportunities.organization_id = integer`,
`commissions.organization_id = integer`, `commissions.payee_id = uuid`,
`opportunities.salesperson_id = uuid`, `commissions.source_id = text` (polimórfico).

### 1.0-bis RLS activo con CERO políticas — bug crítico no documentado antes

> Verificado con `pg_class.relrowsecurity` + `pg_policies` el 2026-09-01.

En PostgreSQL, `ENABLE ROW LEVEL SECURITY` sin ninguna política equivale a **denegar todo**
para roles no privilegiados. Estas tablas tienen RLS activo y **0 políticas**, por lo que
son inaccesibles desde el cliente `authenticated`:

| Tabla | RLS | Políticas | Filas | Consecuencia real |
|---|---|---|---|---|
| `scoring_configs` | ✅ on | **0** | 0 | El scoring GOC **no puede leerse ni escribirse** desde la app |
| `loss_reasons` | ✅ on | **0** | 8 | Las 8 razones de pérdida **no se pueden listar** |
| `verticals` | ✅ on | **0** | 0 | Verticales **inaccesibles** |
| `health_score_configs` | ✅ on | **0** | — | Health score **no configurable** |
| `health_score_snapshots` | ✅ on | **0** | — | Snapshots **no legibles** |
| `opportunity_stage_history` | ✅ on | **0** | — | Histórico de etapas **no legible** |

**Esto invalida 6 filas de la tabla "Lo que YA funciona" del `PLAN.md` §3.1.** Esas features
solo funcionan hoy si el código usa `service_role` (lo que a su vez es una fuga cross-tenant).
Corregir estas 6 políticas es **prerrequisito de F1, F2, F11 y F14** y se hace en **F0**.

Política canónica a aplicar vía MCP (`apply_migration`) en las 6 tablas:

```sql
CREATE POLICY org_member_all ON <tabla>
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND is_active = true
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND is_active = true
  ));
```

Nota: `health_score_configs` tiene `organization_id` como PK (no hay columna `id`), y
`opportunity_stage_history` sí tiene `organization_id`, así que la misma política aplica.

### 1.0-ter Datos reales (no supuestos) — conteos verificados

| Tabla | Filas | Implicación para el plan |
|---|---|---|
| `customers` | 31 620 | `person` 31 402 · `company` 218 · **`partner` 0** → F12 no tiene datos de partners |
| `commissions` | 103 | **todas `status='accrued'`**; `source_type`: `invoice_sale` 100, `invoice_purchase` 2, `sale` 1 |
| `opportunities` | 25 | `open` 22 · `lost` 2 · `won` 1 → dataset mínimo, no sirve para probar cohortes |
| `notification_templates` | 15 | **este es el sistema de plantillas realmente en uso** |
| `templates` | **0** | vacío → F7/F11 no tienen datos que migrar; el conflicto de `CHECK` sobre `channel` es teórico |
| `loss_reasons` | 8 | hay datos, pero RLS los bloquea (ver §1.0-bis) |
| `scoring_configs` | **0** | "Scoring GOC ✅" del PLAN es **falso**: no hay ninguna config |
| `verticals` | **0** | vacío |
| `automations` | 1 | el motor existente casi no se usa |

Consecuencias directas:
- `commissions` **nunca ha tenido** un registro `paid`/`cancelled`. Añadir `rejected`/`clawed_back` es diseño nuevo, no migración de datos.
- `commissions.source_type` **no incluye `opportunity`**; para F10/F13 se usa `invoice_sale` y se llega a la oportunidad vía `invoice_sales.opportunity_id`.
- No existe ningún `customer_type='partner'`: F12 arranca de cero.

### 1.0-quater Vínculos polimórficos y columnas que NO existen — errores frecuentes

> Verificado el 2026-09-01. Cada fila de esta tabla corresponde a un error real que
> estaba escrito en los documentos de fase y que habría hecho fallar la migración
> o devuelto resultados vacíos en silencio.

| Suposición equivocada | Realidad verificada |
|---|---|
| `payments.invoice_id` | ❌ **no existe**. El vínculo es `payments.source='invoice_sales'` + `payments.source_id` |
| `payments.customer_id` | ❌ **no existe**. Se llega al cliente vía `invoice_sales.customer_id` |
| `payments.source_id` es uuid | ❌ es **`text`** → `p.source_id = i.id::text` |
| `payments.source = 'invoice_sale'` | ❌ el valor real es **`'invoice_sales'`** (plural). 590 pagos, $72 551 163 |
| `payments.status = 'paid'` | ❌ para facturas es **`'completed'`**. `'paid'`/`'failed'` son de `web_order` |
| `payments.metadata` | ❌ **no existe**. Usar `reference` (text) para idempotencia y `processor_response` (jsonb) para el payload |
| `commissions.amount` | ❌ **no existe**. El importe es **`commission_amount`**; `base_amount` es la base de cálculo |
| `commissions.source_type = 'invoice_sales'` | ❌ aquí es **`'invoice_sale'`** (singular). Ojo: opuesto a `payments.source` |
| `commissions.invoice_id` / `opportunity_id` | ❌ no existen. Es polimórfico: `source_type` + `source_id` (text) |
| `opportunities.closed_at` | ❌ **no existe** → la crea **F2**. `expected_close_date` (date) es la fecha *esperada*, no la real |
| `customers.lifecycle_stage` | ❌ **no existe** → la crea **F1** + backfill obligatorio |
| `organization_members.role` | ❌ **no existe**. Es **`role_id integer`** → FK a `roles(id)` |
| `quotations.payment_link_url` / `signature_id` | ❌ no existen → las crea **F10** |
| `templates.metadata` | ❌ no existe → la crea **F0** |
| `user_profiles` | ❌ **la tabla no existe**. La real es `profiles` (bug G2 en `callService.ts:262`) |
| `referrals` | ❌ **la tabla no existe**. `referralsService.ts` usa `organization_preferences.settings` + `customers.metadata` |
| `automation_rules` | ❌ **no existe**. Solo existe `automations` (1 fila) |
| `provider_configs`, `sales_targets`, `documents`, `calls` | ❌ no existen |

**Modelo RBAC real (no inventar roles nuevos):**

| Tabla | Columnas verificadas | Uso |
|---|---|---|
| `roles` | `id integer, name varchar, description text, is_system boolean, created_at` | **1** Super Admin · **2** Admin de organización · **3** Cliente · **4** Empleado · **5** Manager |
| `role_permissions` | — | Permisos granulares por rol (ya existe) |
| `organization_members` | `id bigint, organization_id integer, user_id uuid, is_super_admin boolean, is_active boolean, role_id integer, job_position_id uuid, is_temporary boolean` | Membresía + rol de acceso |
| `job_positions` | — | Cargo (HRM). **Distinto** del rol de acceso |

Los roles comerciales (SDR, AE, CS, Preventa…) **no** son roles de acceso: van en
`sales_roles` (F1) o `job_positions` (HRM), nunca en `roles`.

**Política RLS canónica en producción** (copiada literal de `commissions`, usarla igual en toda tabla nueva):

```sql
organization_id IN (
  SELECT om.organization_id FROM organization_members om
   WHERE om.user_id = auth.uid() AND om.is_active = true
)
```

**Índices faltantes detectados** (`payments` tiene **solo** el índice de su PK con 1 050 filas):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_org_reference
  ON payments (organization_id, reference) WHERE reference IS NOT NULL;   -- idempotencia
CREATE INDEX IF NOT EXISTS idx_payments_org_source
  ON payments (organization_id, source, source_id);                        -- JOIN de F14
```

### 1.1 Tablas del núcleo CRM que YA existen

| Tabla | Columnas relevantes (verificadas) |
|---|---|
| `pipelines` | `id, organization_id, name, is_default, goal_amount, goal_period, goal_currency, pipeline_type, created_at, updated_at` |
| `stages` | `id, pipeline_id, name, position, probability, color, description, sla_days, exit_criteria (jsonb), is_won, is_lost, display_order ⚠️duplicado, created_at, updated_at` |
| `opportunities` | `id, organization_id, pipeline_id, stage_id, customer_id, name, amount, currency, expected_close_date, status, loss_reason, created_by, salesperson_id, commission_rate, commission_type, metadata, source, vertical_id, next_contact_at, billing_cycle_months, parent_opportunity_id, score_total, score_data, temperature, created_at, updated_at` |
| `opportunity_products` | 8 columnas |
| `opportunity_custom_lines` | 8 columnas |
| `opportunity_spaces` | 11 columnas |
| `opportunity_stage_history` | `id, opportunity_id, organization_id, from_stage_id, to_stage_id, changed_by, changed_at` |
| `activities` | `id, organization_id, activity_type, user_id, notes, related_type, related_id, occurred_at, metadata (jsonb), created_at, updated_at` |
| `tasks` | 30 columnas — `related_to_id/related_to_type`, `customer_id`, `parent_task_id`, `project_id`, `milestone_id`, `goal_id`, `type`, `remind_*`, `estimated_hours`, `actual_hours`, `tags[]` |
| `notes` | `id, organization_id, user_id, body, related_type, related_id, is_pinned, created_at, updated_at` |
| `verticals` | `id, organization_id, name, description, is_active, created_at` ⚠️ **falta `slug`, `color`, `sort_order`** |
| `loss_reasons` | `id, organization_id, code, label, is_active, is_global, sort_order, created_at` |
| `scoring_configs` | `id, organization_id, config (jsonb), is_active, created_at` |
| `vendor_commission_rates` | `id, organization_id, salesperson_id, rate, valid_from, valid_to, created_at` |
| `health_score_configs` | `organization_id (PK), config (jsonb), refresh_interval_hours, is_active, updated_at` |
| `health_score_snapshots` | `id, organization_id, customer_id, score, band, indicators (jsonb), created_at` |
| `quotations` | 24 columnas — incluye `opportunity_id`, `sections_json`, `converted_invoice_id`, `salesperson_id` |
| `quotation_items` | 12 columnas |
| `templates` | `id, organization_id, name, channel, body_html, subject, variables[], description, is_active, kind, created_by, created_at, updated_at` ⚠️ **falta `metadata` jsonb** |
| `campaigns` | `id, organization_id, name, channel, status, scheduled_at, template_id, segment_id, content, statistics (jsonb), created_by` |
| `campaign_contacts` | `id, campaign_id, customer_id, state, sent_at, opened_at, clicked_at, replied_at, bounced_at, metadata` |
| `segments` | `id, organization_id, name, filter_json, is_dynamic, customer_count, last_run_at, created_by` |
| `automations` | `id, organization_id, name, trigger_json, actions_json, active, description, last_run_at, executions_count, created_by` |
| `customers` | 38 columnas — `full_name`, `first_name`, `last_name`, `company_name`, `trade_name`, `customer_type`, `parent_customer_id`, `roles[]`, `tags[]`, `preferences`, `health_score`, `health_score_updated_at`, campos fiscales DIAN |
| `customer_channel_identities`, `customer_company_links`, `customer_addresses`, `customer_roles` | Existen |

### 1.2 Tablas de comunicación / IA que YA existen

| Tabla | Columnas relevantes |
|---|---|
| `conversations` | `id, organization_id, channel_id, customer_id, status, priority, assigned_member_id, last_message_at, last_agent_message_at, first_response_time_seconds, avg_response_time_seconds, message_count, unread_count, metadata` |
| `messages` | `id, organization_id, conversation_id, channel_id, direction, role, sender_customer_id, sender_member_id, content_type, content, payload (jsonb), external_message_id, is_read, read_at, metadata` |
| `message_events`, `message_attachments`, `message_reactions` | Existen |
| `conversation_notes`, `conversation_summaries`, `conversation_tags`, `conversation_tag_relations`, `conversation_assignments`, `conversation_status_history`, `conversation_participants` | Existen |
| `channels` | `id, organization_id, type, name, status, public_key, ai_mode, business_hours, auto_close_inactive_hours, integration_connection_id` |
| `channel_credentials` | `id, channel_id, provider, credentials (jsonb), is_valid, last_validated_at, connection_method` |
| `comm_settings` | `id, organization_id, sms_remaining, whatsapp_remaining, voice_minutes_remaining, twilio_subaccount_sid, twilio_subaccount_auth_token, phone_number, whatsapp_number, voice_agent_enabled, voice_agent_config (jsonb), is_active, credits_reset_at` |
| `comm_usage_logs` | `id, organization_id, channel, credits_used, twilio_message_sid, recipient, status, direction, module, metadata` |
| `ai_settings` | `id, organization_id, provider, model, temperature, max_tokens, system_rules, tone, language, fallback_message, auto_response_enabled, auto_response_delay_seconds, confidence_threshold, max_fragments_context, is_active, credits_remaining, credits_reset_at, purchased_credits, purchased_credits_expires_at, last_rollover_amount` |
| `ai_jobs` | `id, organization_id, conversation_id, trigger_message_id, job_type, status, result_message_id, response_text, confidence_score, fragments_used[], prompt_tokens, completion_tokens, total_cost, error_code, error_message, metadata, started_at, completed_at` |
| `ai_usage_logs` | `id, organization_id, user_id, action_type, model, prompt_tokens, completion_tokens, total_tokens, credits_consumed, credits_before, credits_after, metadata` |
| `ai_agent_runs`, `ai_agent_suggestions` | Existen (uso contable, no CRM) |
| `ai_credit_purchases`, `ai_training_feedback` | Existen |
| `knowledge_sources`, `knowledge_fragments`, `knowledge_embeddings` | Existen (RAG) |
| `quick_replies`, `quick_replies_usage` | Existen |
| `notification_channels`, `notification_templates`, `notifications`, `user_notification_preferences`, `device_push_tokens`, `web_push_subscriptions` | Existen |
| `event_catalog`, `event_triggers`, `custom_events`, `webhook_endpoints`, `alert_rules` | Existen |
| `integration_providers`, `integration_connections`, `integration_credentials`, `integration_events`, `integration_jobs`, `integration_webhooks`, `integration_connectors`, `integration_object_mappings` | Existen |
| `whatsapp_qr_sessions` | Existe (Baileys) |
| `commissions`, `seller_commissions`, `sellers`, `seller_referrals` | Existen — ⚠️ `seller*` son de **plataforma** (go-admin-super), el CRM NO las toca |

### 1.3 Tablas que NO existen (huecos de BD)

**Telefonía y voz:**
`calls` · `call_recordings` · `call_transcripts` · `call_transcript_segments` · `call_analyses` · `call_tags` · `call_tag_relations` · `call_consents` · `phone_numbers` · `mobile_call_bridges` · `voice_agents` · `voice_agent_calls` · `voice_agent_runs` · `voice_agent_tools`

**Automatización:**
`sequences` · `sequence_steps` · `sequence_enrollments` · `sequence_step_runs` · `automation_rules` · `automation_runs`

**Comercial:**
`icp_profiles` · `icp_criteria` · `sales_roles` · `sales_teams` · `sales_team_members` · `territories` · `objections` · `opportunity_objections` · `discovery_templates` · `demo_scripts` · `roi_calculators` · `sales_targets`

> ⛔ **`commission_events` y `commission_rules` no faltan: están PROHIBIDAS.** No se
> crean nunca. Serían tablas dobles de `commissions` (103 filas reales, con `status`,
> `accrued_at`, `paid_at`, `metadata`) y `vendor_commission_rates` (tasas, con
> `metadata` para tiered/split). Tampoco se crean `crm_payments` ni `crm_commissions`.

**Post-venta y canal:**
`onboarding_templates` · `onboarding_instances` · `onboarding_steps` · `partners` · `partner_tiers` · `partner_deals` · `referral_programs` · `referrals`

**Contenido y documentos:**
`documents` · `document_folders` · `email_domains` · `email_messages` · `email_events` · `email_blocks` · `contract_signatures` · `demo_sessions` · `provider_configs`

### 1.4 Columnas que faltan en tablas existentes

```
opportunities:  record_type, last_contact_at, contact_channel, contact_result,
                objection_id, loss_reason_value, competitor_name, competitor_price,
                missing_features[], recontact_at, discovery_data (jsonb),
                icp_band, icp_fit_score, deal_type, owner_role, sequence_id
templates:      metadata (jsonb), blocks_json (jsonb)
verticals:      slug, color, sort_order, positioning (jsonb), metadata (jsonb)
customers:      lifecycle_stage, company_size, branches_count, current_software
stages:         (eliminar display_order — duplica position)
activities:     channel, outcome, duration_seconds
comm_settings:  voice_twiml_app_sid, voice_recording_enabled, voice_recording_retention_days,
                voice_consent_message, voice_caller_id
quotations:     payment_link_url, signature_id
```

---

## 2. UI — estado real

### 2.1 Rutas existentes de `/app/crm`

| URL | Archivo | Qué hace |
|---|---|---|
| `/app/crm` | `src/app/app/crm/page.tsx` | `ModuleRootRedirect` → primera página activa del módulo (no hay dashboard propio) |
| `/app/crm/actividades` | `src/app/app/crm/actividades/page.tsx` | Listado, filtros, stats, paginación, CRUD |
| `/app/crm/actividades/[id]` | `.../actividades/[id]/page.tsx` | `ActividadDetalle` |
| `/app/crm/campanas` (+ `/nuevo`, `/[id]`) | `.../campanas/**` | Campañas CRUD |
| `/app/crm/clientes` | `.../clientes/page.tsx` | **Reusa** `src/app/app/clientes/page.tsx` |
| `/app/crm/clientes/[id]` | `.../clientes/[id]/page.tsx` | ⚠️ Vista **pobre**: datos básicos + `CustomerFoliosSection`. No reusa la ficha 360° |
| `/app/crm/conversaciones/[id]` | `.../conversaciones/[id]/page.tsx` | Timeline, panel cliente, notas, quick replies, asistente IA |
| `/app/crm/conversaciones/[id]/archivos` | idem | Archivos de conversación |
| `/app/crm/conversaciones/nueva` | idem | Crear conversación |
| `/app/crm/hoy` | `.../hoy/page.tsx` | `HoyView`: Vencidos / Estancadas / Sin contacto + acciones |
| `/app/crm/identidades` | `.../identidades/page.tsx` | Identidades + duplicados |
| `/app/crm/metricas` | `.../metricas/page.tsx` | `MetricasView` / `FunnelView` |
| `/app/crm/oportunidades` (+ `/nuevo`, `/[id]`, `/[id]/editar`) | `.../oportunidades/**` | Tabla, form, detalle |
| `/app/crm/pipeline` (+ `/edit-opportunity`) | `.../pipeline/**` | `PipelineView` (5 tabs) |
| `/app/crm/pronostico` | `.../pronostico/page.tsx` | Forecast |
| `/app/crm/reportes` | `.../reportes/page.tsx` | Atención / Ventas / Marketing + CSV |
| `/app/crm/salud` | `.../salud/page.tsx` | Health score |
| `/app/crm/segmentos` (+ `/nuevo`, `/[id]`) | `.../segmentos/**` | Segmentos |

**Rutas linkeadas que NO existen:**
- `/app/crm/configuracion` ← linkeada en `src/components/crm/dashboard/CRMQuickNav.tsx:112` — debe apuntar a `/app/configuracion?modulo=crm` (ya centralizado)
- `/app/crm/conversaciones` (índice) ← no existe `page.tsx`; la bandeja real está en `/app/chat/bandeja`

### 2.2 Componentes por área (`src/components/crm/`)

| Carpeta | Archivos |
|---|---|
| `actividades/` | `types.ts` (`ActivityType = call\|email\|meeting\|note\|visit\|whatsapp\|system`), `ActividadForm.tsx`, `ActividadesPage.tsx`, `ActividadesTable.tsx`, `ActividadesFiltros.tsx`, `ActividadesStats.tsx`, `ActividadesPagination.tsx`, `ActividadesService.ts`, `id/ActividadDetalle.tsx` |
| `campanas/` | `CampanasPage.tsx`, `CampanaNuevaPage.tsx`, `CampanaDetallePage.tsx`, `CampanasService.ts`, `types.ts` |
| `clientes/` | `CustomerFoliosSection.tsx` |
| `configuracion/` | `ConfiguracionHub.tsx` (huérfano) |
| `customers/` | `CustomersList.tsx` (huérfano) |
| `dashboard/` | `CRMQuickNav.tsx`, `CRMKPICards.tsx`, `CRMDashboardService.ts`, `CRMActivityChart.tsx`, `CRMChannelsChart.tsx`, `CRMFunnelChart.tsx`, `CRMTopLists.tsx`, `CRMFilters.tsx`, `types.ts` |
| `health/` | `SaludView.tsx`, `ClientHealthCard.tsx` |
| `hoy/` | `HoyView.tsx` |
| `identidades/` | `IdentidadesPage.tsx`, `IdentidadesTable.tsx`, `IdentidadesFiltros.tsx`, `IdentidadesStats.tsx`, `IdentidadesPagination.tsx`, `DuplicadosPanel.tsx`, `IdentidadesService.ts`, `types.ts` |
| `metricas/` | `MetricasView.tsx`, `FunnelView.tsx` |
| `oportunidades/` | `OpportunityDetail.tsx`, `OpportunityForm.tsx`, `OpportunitiesTable.tsx`, `OpportunitiesFilters.tsx`, `OpportunitiesStats.tsx`, `ScoringSection.tsx`, `CustomerSearchSelect.tsx`, `ProductSearchSelect.tsx`, `SpaceSearchSelect.tsx`, `PipelineSearchSelect.tsx`, `LossReasonDialog.tsx`, `StructuredLossDialog.tsx`, `ImportLeadsCsv.tsx`, `opportunitiesService.ts`, `types.ts` |
| `pipeline/` | `PipelineView.tsx`, `KanbanBoard.tsx`, `KanbanColumn.tsx`, `KanbanSummary.tsx`, `OpportunityCard.tsx`, `OpportunityDrawer.tsx`, `StageManager.tsx`, `StageDialog.tsx`, `StageConfigDialog.tsx`, `DeleteStageDialog.tsx`, `ColorInput.tsx`, `WonCloseModal.tsx`, `GateWarningDialog.tsx`, `AutomationsView.tsx`, `OpportunityAutomations.tsx`, `EmailNotifications.tsx`, `ForecastView.tsx`, `MonthlyForecastView.tsx`, `ForecastChart.tsx`, `ForecastByStageChart.tsx`, `ForecastSidebar.tsx`, `WeightedFunnelChart.tsx`, `GoalCompletionWidget.tsx`, `ClientsView.tsx`, `CustomerList.tsx`, `CustomerCard.tsx`, `CustomerSummary.tsx`, `CustomerDashboard.tsx`, `TableView.tsx`, `PipelineHeader.tsx`, `PipelineInitializer.tsx`, `PipelineStages.tsx`, `ScoreBadge.tsx`, `TemperatureDot.tsx`, `ThemeToggle.tsx` |
| `postventa/` | `OnboardingChecklist.tsx` |
| `propuestas/` | `ProposalBuilderDialog.tsx` |

### 2.3 Ficha de cliente — qué muestra hoy

**`/app/clientes/[id]`** (`src/app/app/clientes/[id]/page.tsx:147-189`) — la buena:

| Tab | Componente | Contenido |
|---|---|---|
| Resumen | `ResumenTab.tsx` | KPIs compras, estadías, gasto total, pedidos web, reservas futuras, saldo de folios, historial reciente |
| Información | `InfoTab.tsx` | Datos personales/empresariales, dirección, municipio, empresas vinculadas, datos fiscales, roles, etiquetas, metadatos, preferencias |
| Oportunidades | `OportunidadesTab.tsx` | Tarjetas + lista con stage/pipeline |
| Timeline | `TimelineTab.tsx` | Ventas, reservas, actividades, pedidos web |
| Cuentas por cobrar | `CuentasTab.tsx` | Folios PMS + tabla CxC paginada |
| Notas y archivos | `NotasArchivosTab.tsx` | Notas con `RichTextEditor`, pin/unpin. **Archivos = "próximamente"** ❌ |
| Contactos | `CompanyContactsManager` | Solo si `customer_type='company'` |

Sidebar: `TareasSidebar.tsx`.

**Faltan en la ficha de cliente:** documentos reales, llamadas con grabación/transcripción, emails enviados, conversaciones WhatsApp/SMS unificadas, productos comprados, health score inline, secuencias activas, suscripción/renovación, referidos, tab de partners.

### 2.4 Detalle y drawer de oportunidad — qué muestra hoy

**`OpportunityDetail.tsx`** (`src/components/crm/oportunidades/OpportunityDetail.tsx:608-643`) — tabs:
1. Productos (n) · 2. Espacios (n) · 3. Conceptos (n) · 4. Actividades (n) · 5. Tareas (n) · 6. Notas (n) · 7. Timeline · 8. Analítica

Además: funnel visual de etapas, valor total/ponderado, probabilidad, fecha de cierre, `ScoringSection`, info del cliente, acciones Ganar/Perder/Editar/Duplicar/Eliminar, `StructuredLossDialog`.

**`OpportunityDrawer.tsx`** (`src/components/crm/pipeline/OpportunityDrawer.tsx`) — `Sheet` lateral vertical (sin tabs): encabezado, `ScoringSection`, info del cliente, productos/espacios/conceptos, actividades/tareas/notas, botones de llamada/WhatsApp/email.

**Faltan en ambos:** ❌ tab **Documentos** · ❌ **Llamadas** con player + transcripción + análisis · ❌ **Emails** enviados/abiertos · ❌ **Conversaciones** WhatsApp/SMS · ❌ **Discovery** wizard · ❌ **Objeciones** · ❌ **Cotizaciones/propuestas** vinculadas · ❌ **Secuencia activa** y próximos pasos · ❌ **Competidores** · ❌ **Sugerencia IA de próxima acción** · ❌ subida de archivos.

### 2.5 Pipeline — cómo funciona hoy

- `PipelineView.tsx`: tabs Kanban · Tabla · Pronóstico · Clientes · Automatización.
- `KanbanBoard.tsx`: `@hello-pangea/dnd`; carga pipeline default o el primero; siembra etapas con `pipelineSeedService`; suscripción realtime con toggle; columnas coloreadas por tipo de etapa; `KanbanSummary` con totales.
- Cambio de etapa (`handleDragEnd`, ~líneas 285-410): actualización optimista → si destino es `is_won` abre `WonCloseModal` → persiste con `kanbanService.updateOpportunityStage` → `handleStageChangeAutomation`.
- `OpportunityAutomations.tsx`: crea tareas según etapa destino, actualiza `status`, envía email de cambio de etapa, registra actividad `system`.
- `AutomationsView.tsx`: 5 switches (crear tareas, notificaciones, actualizar estado, registro de actividad, recordatorios) persistidos en `automations`. **Sección "Automatizaciones por etapa" dice "próximamente"** ❌. No hay editor de workflow ni condicionales.

### 2.6 Animaciones

- `grep "framer-motion|motion/react|motion-dom"` en `src/` → **0 resultados**.
- `package.json` → **no** contiene `motion` ni `framer-motion`.
- Hoy: solo transiciones CSS/Tailwind (`transition`, `hover:`, `animate-spin`).

---

## 3. Backend — estado real

### 3.1 Rutas API del CRM

| Endpoint | Archivo | Estado |
|---|---|---|
| `POST/GET /api/crm/followup/run` | `src/app/api/crm/followup/run/route.ts` | ✅ Cron protegido por `CRON_SECRET` |
| `POST/GET /api/crm/health/recalculate` | `src/app/api/crm/health/recalculate/route.ts` | ✅ Cron |
| `POST /api/crm/ia/discovery-summary` | `src/app/api/crm/ia/discovery-summary/route.ts` | ⚠️ **No valida org** |
| `POST /api/crm/ia/next-action` | `src/app/api/crm/ia/next-action/route.ts` | ⚠️ **No valida org** |
| `POST/GET /api/crm/renewals/sync` | `src/app/api/crm/renewals/sync/route.ts` | ✅ Cron |

### 3.2 Rutas API de IA

| Endpoint | Modelo | Multi-tenant |
|---|---|---|
| `POST /api/ai-assistant/chat` | `OPENAI_MODEL` \| `gpt-4o-mini` | ❌ |
| `POST /api/ai-assistant/dynamic-options` | — | ✅ |
| `POST /api/ai-assistant/execute-action` | — | ⚠️ parcial |
| `POST /api/ai-assistant/generate-image` | `dall-e-3` | ✅ + créditos |
| `POST /api/ai-assistant/improve-text` | `gpt-4o-mini` | ⚠️ parcial |
| `POST /api/ai-assistant/pm-assist` / `pm-planner` | `gpt-4o-mini` | ⚠️ parcial |
| `POST /api/ai-assistant/reportes` | `reportAgentService` | ❌ |
| `POST /api/ai-assistant/seo-keywords` | `gpt-4o-mini` | ⚠️ parcial |
| `POST /api/ai-assistant/suggestions` | — | ❌ |
| `POST /api/ai-assistant/transcribe` | `whisper-1` | ❌ **sin auth, sin org, sin persistencia** |
| `POST /api/chat/ai/generate-response` | `gpt-4o-mini` | ✅ |
| `POST /api/chat/ai/generate-summary` | `gpt-4o-mini` | ✅ |
| `POST /api/chat/ai/classify-intent` | `gpt-4o-mini` | ✅ |
| `POST /api/chat/ai/auto-response` | `gpt-4o-mini` | ✅ |

### 3.3 Rutas API de Twilio

| Endpoint | Archivo | Estado |
|---|---|---|
| `POST /api/integrations/twilio/voice/incoming` | `.../voice/incoming/route.ts` | ✅ Devuelve TwiML `<ConversationRelay>` → `ws-server.ts` |
| `GET /api/integrations/twilio/voice/media-stream` | `.../voice/media-stream/route.ts` | 🗑️ **410 deprecado** |
| `POST /api/integrations/twilio/send-sms` | `.../send-sms/route.ts` | ✅ |
| `POST /api/integrations/twilio/send-whatsapp` | `.../send-whatsapp/route.ts` | ✅ |
| `POST /api/integrations/twilio/verify/send` · `/check` | `.../verify/**` | ✅ |
| `POST /api/integrations/twilio/incoming-message` | `.../incoming-message/route.ts` | ✅ Valida firma |
| `POST /api/integrations/twilio/status-callback` | `.../status-callback/route.ts` | ✅ |
| `GET /api/integrations/twilio/usage` · `/credits` | idem | ✅ |
| `POST /api/webhooks/voip/twilio` | `src/app/api/webhooks/voip/twilio/route.ts` | 🗑️ **desactivado** (responde TwiML "webhook desactivado") |
| `POST /api/webhooks/sms/twilio` · `/email/twilio` | idem | 🗑️ **desactivados** |

**❌ NO existe:** llamada saliente (`client.calls.create`), `/api/voice/token` (AccessToken + VoiceGrant), TwiML de outbound, `RecordingStatusCallback`, historial de llamadas.

### 3.4 Rutas API de mensajería y email

| Endpoint | Estado |
|---|---|
| `POST /api/integrations/sendgrid/send` · `/webhook` · `/bounces` · `/stats` · `/templates` · `/health-check` | ✅ completo vía fetch (sin SDK) |
| `GET/POST /api/integrations/whatsapp/webhook` | ✅ Meta Cloud API |
| `POST /api/integrations/whatsapp/send` | ✅ text/image/document/template |
| `POST /api/integrations/whatsapp/validate` · `GET /templates` | ⚠️ sin auth de sesión |

**❌ NO existe:** Resend (el string "resend" del repo es re-envío de correos de verificación de auth, no la API).

### 3.5 Servicios existentes

**CRM** (`src/lib/services/crm/`): `index.ts`, `followupEngineService.ts`, `healthScoreService.ts`, `leadCaptureService.ts`, `followupService.ts`, `scoringService.ts`, `proposalService.ts`, `renewalService.ts`, `onboardingService.ts`, `expansionService.ts`, `referralsService.ts`, `commercialMetricsService.ts`, `commissionService.ts`, `verticalsService.ts`, `pipelineSeedService.ts`, `stageGateService.ts`, `lossReasonService.ts`.

**Genéricos:** `activityService.ts`, `callService.ts`, `kanbanService.ts`, `forecastService.ts`, `forecastRealTimeService.ts`, `realtimeService.ts`, `conversationsService.ts`, `channelsService.ts`, `cotizacionesService.ts`, `pdfService.ts`, `currencyService.ts`.

**IA:** `openaiService.ts`, `aiAssistantService.ts`, `aiActionsService.ts`, `aiCreditsService.ts`, `aiSettingsService.ts`, `aiJobsService.ts`, `aiLabService.ts`, `reportes/reportAgentService.ts`.

**Telefonía/mensajería:** `integrations/twilio/{index,twilioService,twilioSubaccounts,twilioVerifyService,twilioWebhook,twilioConfig,twilioTypes}.ts`, `integrations/twilio/voiceAgent/{conversationRelayHandler,realtimeSession,voiceAgentService,voiceAgentPrompts,voiceAgentTools,deepgramSTT,elevenLabsTTS,index}.ts`, `smsService.ts`, `twilioEmailService.ts`, `commCreditsService.ts`, `commNotificationService.ts`, `integrations/sendgrid/sendgridService.ts`, `integrations/whatsapp/whatsappQrService.ts` + cloud.

### 3.6 Voice Agent — estado detallado

| Archivo | Bytes | Estado |
|---|---|---|
| `voiceAgent/conversationRelayHandler.ts` | 16 519 | ✅ **Activo** — WS handler de ConversationRelay (STT/TTS de Twilio + OpenAI Chat Completions con function calling) |
| `voiceAgent/voiceAgentTools.ts` | 12 802 | ✅ Tools del agente |
| `voiceAgent/voiceAgentService.ts` | 7 765 | 🟡 Orquestador con Media Stream (no es el flujo activo) |
| `voiceAgent/realtimeSession.ts` | 6 149 | 🟡 OpenAI Realtime API — **escrito pero no cableado** |
| `voiceAgent/voiceAgentPrompts.ts` | 4 813 | ✅ |
| `voiceAgent/deepgramSTT.ts` | 3 617 | 🟡 **escrito pero no cableado** |
| `voiceAgent/elevenLabsTTS.ts` | 2 926 | 🟡 **escrito pero no cableado** |

`ws-server.ts` (raíz) levanta el WebSocket `/conversation-relay`. Script de prueba: `npm run ws:test` → `scripts/test-conversation-relay.ts`.

**Solo funciona para llamadas ENTRANTES.** No hay agente saliente, ni cola de llamadas con propósito, ni persistencia de la conversación de voz.

### 3.7 `callService.ts` — bugs críticos

`src/lib/services/callService.ts`:
- Línea 8: crea cliente Supabase a nivel de módulo con `SUPABASE_SERVICE_ROLE_KEY` → **bypass total de RLS**.
- Línea 262: consulta `user_profiles` → **tabla que no existe** (la real es `profiles`).
- Línea 270: `return 1` → **organización 1 hardcodeada**.
- Línea 292: `organizationId: 1` en `twilioToCallEvent` → **fuga cross-tenant**.
- Guarda todo en `activities.metadata` jsonb; **no existe tabla `calls`**, por lo que no se puede filtrar/agregar/reportar sobre llamadas de forma eficiente.

### 3.8 Variables de entorno

**En `.env.example`:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `SENDGRID_WEBHOOK_VERIFICATION_KEY`, `GOOGLE_ADS_*`, `TRIPADVISOR_API_KEY`, `DIAN_PROVIDER`, `VERIFIK_TOKEN`, `CORESOFT_API_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SELLERS_URL`, `EVOLUTION_API_URL/KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `VAPID_*`.

**Usadas por el código pero AUSENTES del example:**
`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MAX_TOKENS`, `OPENAI_TEMPERATURE`, `OPENAI_REALTIME_MODEL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_WEBHOOK_BASE_URL`, `WS_SERVER_URL`, `WS_PORT`, `SUPABASE_SERVICE_ROLE_KEY`, `SENDGRID_API_KEY`, `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`.

**A añadir en fases nuevas:**
`TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_PUSH_CREDENTIAL_SID_IOS`, `TWILIO_PUSH_CREDENTIAL_SID_ANDROID`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `GOOGLE_AI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `ELEVENLABS_SCRIBE_MODEL`, `POSTHOG_*`, `CALCOM_API_KEY`, `DAILY_API_KEY`, `DOCUMENSO_API_KEY`, `APOLLO_API_KEY`.

---

## 4. Cross-platform

### 4.1 Electron
- `electron/src/main/index.ts`, `electron/src/preload/index.ts`, `electron/package.json`.
- Wrapper de la web + agente de impresión. Expone impresoras, cajón monedero, autostart, updates, deep links `goadmin://`.
- ❌ Sin telefonía nativa ni gestión de permisos de micrófono.

### 4.2 Capacitor
- `mobile/capacitor.config.ts` carga URL remota `https://app.goadmin.io`.
- Plugins: biometría, Bluetooth LE, cámara, geolocalización, push, NFC, share.
- ❌ Sin plugin de voz/llamadas. Sin `CallKit`. Sin uso de `Capacitor.isNativePlatform` en el scope del CRM.

### 4.3 PWA
- `public/sw.js`: cacheo offline, navegación network-first, push notifications, notification click.
- ❌ Sin WebRTC/Twilio Client, sin manejo de `tel:`.

### 4.4 Dependencias relevantes de `package.json`

| Presente | Ausente (a instalar) |
|---|---|
| `twilio@^5.12.1` (SDK servidor) | `@twilio/voice-sdk` (browser) |
| `openai@^6.15.0` | `motion` |
| `@whiskeysockets/baileys@^7.0.0-rc14` | `resend`, `react-email` |
| `@hello-pangea/dnd`, `@dnd-kit/*`, `react-dnd` (3 librerías DnD ⚠️) | `@google/genai` (Gemini) |
| `ws@^8.19.0`, `tsx` | `svix` (o usar `resend.webhooks.verify`) |
| `puppeteer@^24.15.0` (tests E2E) | — |
| `recharts`, `chart.js`, `react-chartjs-2` (3 librerías de charts ⚠️) | — |
| `sonner`, `react-hot-toast` (2 librerías de toast ⚠️) | — |

---

## 5. Lista consolidada de bugs a corregir

| # | Bug | Archivo:línea | Severidad | Fase |
|---|---|---|---|---|
| G1 | `organizationId: 1` hardcodeado + service-role global | `src/lib/services/callService.ts:8,270,292` | 🔴 crítico | F0/F3 |
| G2 | Tabla inexistente `user_profiles` | `src/lib/services/callService.ts:262` | 🔴 crítico | F0/F3 |
| G3 | `/api/crm/ia/*` sin validación de organización | `src/app/api/crm/ia/{discovery-summary,next-action}/route.ts` | 🔴 crítico | F0 |
| G4 | `/api/ai-assistant/transcribe` sin auth/org/límite/créditos | `src/app/api/ai-assistant/transcribe/route.ts` | 🔴 alto | F0/F4 |
| G5 | Webhooks legacy desactivados pero documentados como activos | `src/app/api/webhooks/{voip,sms,email}/twilio/route.ts` + `docs/VOIP_SETUP.md` | 🟠 medio | F0 |
| G6 | `.env.example` incompleto (23 variables faltantes) | `.env.example` | 🟠 medio | F0 |
| G7 | `stages.display_order` duplica `stages.position` | BD + `src/components/crm/reportes/ReportesService.ts` | 🟠 medio | F0 |
| G8 | `CRMQuickNav.tsx:112` linkea a `/app/crm/configuracion` que no existe — debe apuntar a `/app/configuracion?modulo=crm` | `src/components/crm/dashboard/CRMQuickNav.tsx:112` | 🟡 bajo | F0 |
| G9 | `/app/crm/clientes/[id]` ignora la ficha 360° | `src/app/app/crm/clientes/[id]/page.tsx` | 🟠 medio | F9 |
| G10 | Automatizaciones por etapa "próximamente" | `src/components/crm/pipeline/AutomationsView.tsx` | 🟠 medio | F8 |
| G11 | `elevenLabsTTS.ts` / `deepgramSTT.ts` / `realtimeSession.ts` código muerto | 3 archivos en `voiceAgent/` | 🟡 bajo | F4/F6 |
| G12 | `verticals` sin `slug`/`color`/`sort_order` | BD | 🟡 bajo | F0/F1 |
| G13 | 3 librerías de DnD, 3 de charts, 2 de toast coexistiendo | `package.json` | 🟡 bajo | F15 |
| G14 | `ConfiguracionHub.tsx` y `CustomersList.tsx` huérfanos | `src/components/crm/{configuracion,customers}/` | 🟡 bajo | F0 |
| G15 | `/api/integrations/whatsapp/{validate,templates}` sin auth de sesión | 2 routes | 🟠 medio | F0 |
