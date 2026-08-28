# Sistema Comercial GoAdmin — Análisis y Recomendaciones

> Fecha: 2026-08-22
> Proyecto: go-admin-erp (CRM) + go-admin-super (Health Core)
> Supabase: jgmgphmzusbluqhuqihj
> Objetivo: Contextualizar el proceso comercial de GoAdmin (como SaaS B2B) dentro del propio ERP, sin hardcodear, permitiendo que cada empresa configure su pipeline y procesos de venta.

---

## 1. Estado actual del CRM (go-admin-erp)

### 1.1 Tablas BD existentes (Supabase)

| Tabla | Filas | Estado | Observaciones |
|-------|-------|--------|---------------|
| `pipelines` | 0 | Estructura básica | `goal_amount`, `goal_period`, `goal_currency` ya existen |
| `stages` | 0 | Estructura básica | `position`, `probability`, `color`, `description` |
| `opportunities` | 0 | Estructura básica | `customer_id`, `salesperson_id`, `commission_rate`, `loss_reason` |
| `activities` | 0 | Estructura básica | `activity_type`, `related_type`, `related_id`, `metadata` |
| `automations` | 0 | Estructura básica | `trigger_json`, `actions_json`, `active` |
| `campaigns` | 0 | Estructura básica | `channel`, `template_id`, `segment_id`, `statistics` |
| `campaign_contacts` | 0 | Estructura básica | Tracking opens/clicks/replies/bounces |
| `segments` | 0 | Estructura básica | Segmentación dinámica |
| `notes` | 0 | Estructura básica | Notas genéricas |
| `templates` | 0 | Estructura básica | Plantillas reutilizables con `channel`, `body_html`, `variables` |
| `tasks` | 724 | Operativa | Tareas con `related_to_id`, `related_to_type`, `customer_id`, recordatorios |
| `customers` | 31.175 | Operativa | `customer_type` (person/company), `parent_customer_id`, `tags`, `metadata`, campos fiscales DIAN |
| `quotations` | — | Operativa | Cotizaciones con numeración, PDF, email, `convertToInvoice()` |
| `commissions` | — | Operativa | `commission_type`, `source_type`, `payee_type`, `payee_id`, `commission_rate`, `status`. Lo alimentan POS, facturas venta, compras |
| `organization_commission_rates` | — | Plataforma | **NO usar desde CRM** — tarifas que GoAdmin cobra a organizaciones (PayFac). Territorio del super admin |
| `subscriptions` | — | Plataforma | **NO usar desde CRM** — suscripciones de organizaciones al SaaS. Renovaciones del CRM usan `billing_cycle_months` |

**Tablas de soporte de clientes:**
- `customer_addresses` — direcciones múltiples
- `customer_company_links` — relación N:N persona-empresa
- `customer_roles` — roles de cliente
- `customer_channel_identities` — identidades omnicanal
- `customer_biometrics` — biométricos

**RPCs y materialized views existentes:**
- `fn_reporte_crm_funnel`
- `fn_reporte_crm_ranking_vendedores`
- `refresh_mv_crm_forecast`
- `refresh_mv_crm_forecast_safely`
- `safe_refresh_crm_forecast`

### 1.2 Componentes existentes

**Pipeline (Kanban):** `src/components/crm/pipeline/` — 40+ archivos con Kanban, forecast, stage manager, automatizaciones, clientes.

**Oportunidades:** `src/components/crm/oportunidades/` — CRUD completo, productos, espacios PMS, líneas personalizadas, comisiones, razones de pérdida.

**Actividades:** `src/components/crm/actividades/` — llamadas, emails, reuniones, notas, visitas, WhatsApp.

**Campañas:** `src/components/crm/campanas/` — creación, segmentación, estadísticas.

**Segmentos:** `src/components/crm/segmentos/` — filtros dinámicos.

**Identidades:** `src/components/crm/identidades/` — merge de duplicados, omnicanal.

**Dashboard CRM:** `src/components/crm/dashboard/` — KPIs, funnel, actividad, canales.

**Cotizaciones:** `src/lib/services/cotizacionesService.ts` — crear, convertir a factura, duplicar.

**Forecast:** `src/lib/services/forecastService.ts` + `forecastRealTimeService.ts`.

**Reportes CRM:** `src/lib/services/reportes/modulos/crmReports.ts`.

### 1.3 Páginas/rutas existentes

- `/app/crm` — redirect al dashboard
- `/app/crm/clientes` — lista de clientes
- `/app/crm/clientes/[id]` — detalle de cliente
- `/app/crm/oportunidades` — lista de oportunidades
- `/app/crm/oportunidades/nuevo` — nueva oportunidad
- `/app/crm/oportunidades/[id]` — detalle
- `/app/crm/oportunidades/[id]/editar` — edición
- `/app/crm/pipeline` — vista Kanban
- `/app/crm/actividades` — lista de actividades
- `/app/crm/actividades/[id]` — detalle
- `/app/crm/campanas` — campañas
- `/app/crm/campanas/nuevo` — nueva campaña
- `/app/crm/campanas/[id]` — detalle
- `/app/crm/conversaciones/*` — conversaciones
- `/app/crm/identidades` — identidades
- `/app/crm/segmentos` — segmentos
- `/app/crm/segmentos/nuevo` — nuevo segmento
- `/app/crm/segmentos/[id]` — detalle
- `/app/crm/pronostico` — forecast
- `/app/crm/reportes` — reportes

### 1.4 Lo que NO existe en el CRM

| Capacidades del proceso comercial | Estado |
|-----------------------------------|--------|
| **Leads** como entidad separada de opportunities | No existe (se mezclan en `opportunities` con stage inicial) |
| **Lead Scoring** (GOC: Go Fit, Opportunity, Capacity, Timing) | No existe |
| **ICP** (Ideal Customer Profile) configurable | No existe |
| **Verticales comerciales** (restaurante, hotel, retail, etc.) | No existe |
| **Buyer personas** | No existe |
| **Discovery** estructurado (preguntas guiadas) | No existe |
| **Demo** personalizada por vertical | No existe |
| **Propuesta comercial** estructurada (situación, problema, solución, ROI) | No existe (solo cotizaciones genéricas) |
| **Biblioteca de objeciones** | No existe |
| **Criterios de avance de etapa** (exit gates) | No existe |
| **Seguimiento automático** (secuencias día 0/1/3/5/7/14/30) | No existe |
| **Sistema de seguimiento** (último contacto, próximo contacto, canal, resultado, objeción, temperatura) | Parcial (activities) |
| **Closed Lost obligatorio** con razón, competidor, precio competidor, funcionalidad faltante, recontacto | Parcial (`loss_reason` text simple) |
| **Onboarding** post-venta | No existe |
| **Customer Success / Health Score de clientes** en CRM | No existe (el del super admin mide organizaciones, no clientes del CRM) |
| **Renovación** con timeline 120/90/60/30/15/7 días | No existe |
| **Expansion Pipeline** (cross-sell, upsell, nueva sucursal) | No existe |
| **Referidos** sistemático | No existe (solo referral program en super admin) |
| **Partners** con niveles y comisiones | No existe (solo sellers básicos en super admin) |
| **Dashboard comercial** por vendedor (actividad, conversión, revenue, calidad) | Parcial (dashboard CRM general) |
| **Métricas SaaS** (MRR, ARR, CAC, LTV, Churn, Win Rate, Sales Cycle, ARPA) | No existe |
| **IA comercial** (lead scoring, resumen llamadas, forecast, coaching, próxima acción) | No existe |
| **APIs REST** para CRM | No existe (todo es cliente-Supabase directo) |

---

## 2. Estado actual del Super Admin (go-admin-super)

### 2.1 Lo que existe

- **Health Score básico** (`OrgHealthCard.tsx`): 40pts suscripción + 25pts miembros activos + 15pts sucursales + 20pts antigüedad. Visualización con gauge.
- **Suscripciones** con Stripe: activación, cancelación, extensión de trial.
- **Planes** con precios y límites (usuarios, sucursales, trial).
- **Addons**: usuarios extra, sucursales extra, créditos IA.
- **Vendedores/Referral**: código de referral, comisiones, payout requests.
- **Auditoría** de acciones de super admins.
- **Dashboard global**: MRR, trials, alertas.

### 2.2 Lo que NO existe en el super admin (mejoras pendientes, trabajo separado del CRM)

> **Importante:** El super admin mide la salud de las ORGANIZACIONES (clientes de GoAdmin). El CRM del ERP mide la salud de los CLIENTES de cada organización. Son niveles distintos.

- Health Score de organización mejorado (uso real del ERP: ventas, inventario, POS, reportes, caída de uso, tickets soporte, NPS, integraciones activas, MRR/ARR, churn risk).
- Onboarding estructurado de organizaciones (kickoff, configuración, importación, capacitación, uso asistido, revisiones).
- Customer Success tools a nivel organización (churn prediction, renewal alerts, NPS).
- Pipeline comercial de GoAdmin como negocio (leads → demos → cierres de organizaciones).
- Gestión de renovaciones de organizaciones con timeline.
- Expansion revenue tracking a nivel organización.
- Gráficos avanzados (MRR timeline, churn rate, conversion funnel).
- Partners con niveles (Starter/Professional/Elite).
- Programa de referidos sistemático post-onboarding.

---

## 3. Principios rectores

1. **Reutilizar antes de crear.** Ya existe Kanban DnD + realtime, etapas CRUD, oportunidades con líneas, actividades/tareas/notas, forecast, cotizaciones con conversión a factura, `templates`, `automations`, `commissions`. Cada feature nueva debe montarse sobre esa maquinaria.
2. **Nada hardcodeado.** Todo configurable por organización. GoAdmin es una organización más usando su propio CRM. Lo que hoy está hardcodeado (razones de pérdida, moneda COP, sets de etapas default) migra a datos.
3. **Configuración centralizada.** Toda configuración va en `/app/configuracion?modulo=crm` (patrón existente: `configModulesRegistry.ts` → `CRMConfigPanel.tsx` → tabs internas). No se crean rutas `/app/crm/configuracion/*`. Componentes nuevos en `src/components/configuracion/panels/crm/sections/`.
4. **El dinero primero.** Un CRM que no conecta propuesta → pago es un TODO list caro. La costura pipeline↔cotización↔factura va en las primeras semanas.
5. **Contenido ≠ datos relacionales.** Buyer personas, playbooks, guiones de demo son contenido: `templates` (existente) con `channel` como tipo, nunca 5 tablas relacionales.
6. **Métricas se calculan, no se almacenan.** RPCs y materialized views (ya existen `fn_reporte_crm_funnel`, `fn_reporte_crm_ranking_vendedores`, `refresh_mv_crm_forecast`). Cero tablas de métricas pre-calculadas.
7. **Validación progresiva (soft-gates).** Los criterios de etapa advierten y piden confirmación; bloquear duro al inicio genera pipeline paralelo en Excel/WhatsApp.
8. **Frontera estricta de datos (regla de oro):** el CRM solo ve y toca los datos de SU organización (RLS por `organization_id`). Jamás lee ni escribe tablas de plataforma — `organizations`, `subscriptions`, `plans`, `sellers`, `organization_commission_rates` (PayFac), `payout*`. Toda la información agregada de las organizaciones existe únicamente en go-admin-super. GoAdmin usa el CRM exactamente igual que cualquier otra organización: consumiendo su propio producto con sus propios datos. Linter/review debe rechazar cualquier `.from('organizations')`, `.from('subscriptions')`, etc. en código CRM.

### Separación de niveles (intocable)

| Nivel | App | Mide |
|-------|-----|------|
| Salud de organizaciones clientes de GoAdmin (SaaS) | go-admin-super | suscripción, miembros, sucursales, uso del ERP |
| Salud de los clientes de cada organización | go-admin-erp CRM | frecuencia compra, recencia, saldo, engagement |

El Health Score del super admin ya existe y sigue evolucionando allá. Este plan NO lo toca ni lo duplica.

### Separación vendedores (intocable)

| Concepto | Dónde | Tablas |
|----------|-------|--------|
| Vendedores de GoAdmin como negocio | go-admin-super | `sellers`, `seller_referrals`, `seller_commissions` + payouts Stripe |
| Vendedores de cada organización | go-admin-erp | `organization_members` → `profiles`. `opportunities.salesperson_id` y `sales.salesperson_id` = `user_id` |
| Comisiones de GoAdmin | go-admin-super | `seller_commissions` |
| Comisiones de cada organización | go-admin-erp | `commissions` (existente, ledger) + `vendor_commission_rates` (nueva, FASE 1 — `salesperson_id IS NULL` = % general, `NOT NULL` = override por vendedor) |
| Tarifas de plataforma PayFac | go-admin-super | `organization_commission_rates` (NO es para comisiones de vendedores — es lo que GoAdmin cobra a organizaciones) |

---

## 4. Bugs a corregir ANTES de agregar features (FASE 0 — días 1-3)

> Sin esto, toda métrica nueva miente. No agrega features: deja el suelo firme.
> **Verificado contra código real.**

| # | Bug | Estado | Evidencia | Fix |
|---|-----|--------|-----------|-----|
| B1 | Doble escala `probability` (0–1 vs 0–100) | **REAL** | `PipelineInitializer.tsx` línea 81: `probability: 0.1` (0-1). `CRMDashboardService.ts` línea 85: `probability / 100` (asume 0-100). `StageManager.tsx` usa 0-100 | Migración normalizadora a 0–100 + corregir `PipelineInitializer.tsx` |
| B2 | Sets de etapas default contradictorios | **PARCIAL** | `PipelineInitializer.tsx` y `PipelineHeader.tsx` crean etapas. No hay 3 sets pero sí 2 fuentes | Un único `ensureDefaultPipeline()` server-side idempotente |
| B3 | Forms de oportunidad duplicados | **REAL** | `NewOpportunityModal.tsx`, `NewOpportunityForm.tsx`, `OpportunityForm.tsx`, inline en `PipelineView.tsx`, `ClientsViewRefactorizado.tsx`, `ClientsView.tsx` | Dejar UNO (`NewOpportunityForm`). Borrar duplicados |
| B4 | `markAsLost` persiste texto libre | **REAL** | `opportunitiesService.ts` línea 378: `markAsLost(id, lossReason: string)` — guarda string sin estructura ni catálogo | Catálogo `loss_reasons` + `StructuredLossDialog` |
| B5 | Join incorrecto `customers!inner(first_name,last_name)` | **FALSO** | `customers` SÍ tiene `first_name` y `last_name` (verificado en BD). El join es correcto. | No requiere fix |
| B6 | Merge de clientes hace UPDATE inválido sobre `activities` | **REAL** | `IdentidadesService.ts` línea 268: `.update({ customer_id: primaryCustomerId }).eq('customer_id', secondaryId)` en `activities` — pero `activities` NO tiene `customer_id` (verificado: la columna no existe). El update silenciosamente no hace nada | Repuntear vía `related_type='customer'` + `related_id` |
| B7 | `commissionsService.getOrgId()` lee org desde localStorage | **REAL** | `commissionsService.ts` usa `organizacionActiva`/`currentOrganizationId` de localStorage. Mismo anti-patrón en `kanbanService`/`AutomationsView` | Migrar a `useOrganization()` hook compartido |

### Limpieza de código muerto

Eliminar: `ClientsViewRefactorizado.tsx`, `EmailNotifications.{ts,tsx}` duplicados, `KanbanSummary.d.ts`/`KanbanColumn.d.ts`, `ForecastChart` duplicados (pronostico/ vs pipeline/), huérfanos `ConfiguracionHub.tsx` y `CustomersList.tsx`, traducciones de statuses inexistentes en `crmTranslations.ts`.

### Definition of Done FASE 0

- [ ] Todas las `probability` en 0–100 y el forecast pondera correcto
- [ ] Crear pipeline nuevo produce SIEMPRE las mismas etapas semilla
- [ ] Un solo path de creación de oportunidades
- [ ] `markAsLost` exige catálogo + detalle estructurado
- [ ] Merge de clientes repuntea `activities` correctamente
- [ ] `commissionsService` y servicios CRM leen org desde `useOrganization()`, no localStorage
- [ ] `npm run lint` y `tsc --noEmit` limpios
- [ ] 0 referencias a código eliminado

---

## 5. Matriz de integración total (13 conexiones)

> Responde a la pregunta "¿el flujo queda completo, todo se conecta con todo?". Cada costura se cierra en una fase concreta y en las tres capas (BD + backend + UI).

| # | Conexión | Estado hoy | Qué falta (capas) | Se cierra en |
|---|----------|-----------|-------------------|--------------|
| 1 | CRM ↔ Clientes | ✅ Bidireccional | Mantener | — |
| 2 | CRM ↔ Tareas/Actividades/Notas | ✅ Completo | + registrar `last/next_contact_at` automáticamente al crear actividad | F1 |
| 3 | CRM ↔ Cotizaciones/Propuestas | ❌ Sin vínculo | BD: `quotations.opportunity_id` · UI: selector + botón "Generar propuesta" · Backend: prefill líneas | F1/F3 |
| 4 | CRM ↔ Facturas/CxC | ❌ Won no genera nada | BD: `invoice_sales.opportunity_id` · Backend: modal cierre llama `convertToInvoice()` · UI: modal Won encadenado | F3 |
| 5 | CRM ↔ Inventario | ❌ Sin reserva | Backend (opcional por org): al ganar con productos → reservar stock / sugerir compra · UI: toggle en modal cierre | F3 |
| 6 | CRM ↔ POS/Ventas | ❌ Una vía rota | Backend: venta cerrada crea actividad `purchase` · Reporte: ventas reales vs pipeline (RPC) | F2 |
| 7 | CRM ↔ PMS/Reservas | ❌ Sin conversión | Backend: oportunidad ganada con `opportunity_spaces` → crear `reservations` · UI: acción en modal cierre | F3 |
| 8 | CRM ↔ PM/Proyectos | ❌ Sin puente | BD: `opportunities.project_id` · UI: "Crear proyecto" desde cierre | F4 |
| 9 | CRM ↔ Calendario | ❌ Actividades fuera | Backend: actividad con fecha → evento en `calendar_unified` · UI: aparece en calendario | F2 |
| 10 | CRM ↔ Chat/Conversaciones | ❌ Chat no sabe del deal | BD: `conversations.opportunity_id` · UI: badge "Deal abierto" + lead automático desde webhook | F1/F2 |
| 11 | CRM ↔ Timeline global | 🟡 Cliente sí, global no | UI: `/app/timeline` consume `activities` comerciales | F2 |
| 12 | CRM ↔ Notificaciones | 🟡 Solo cambio de etapa | Backend: nueva opp / estancada (sla_days) / tarea vencida / won / lost → `notifications` | F1-F2 |
| 13 | CRM ↔ Reportes cruzados | 🟡 Solo internos | Backend: RPCs funnel-real (stage_history × ventas × facturación) · UI: dashboard | F2/F5 |

Regla: ninguna conexión se considera "lista" hasta que sus capas BD + backend/UI están desplegadas juntas en su fase.

---

## 6. Arquitectura de la solución

### 6.1 Flujo objetivo completo

```
        CAPTURA AUTOMÁTICA                     MANUAL
 Meta/Twilio/Web widget ──┐            Referidos, prospección, eventos
                          ▼                    ▼
                 OPORTUNIDAD (record_type='lead')  ── etapa Lead (5%)
                          │  SDR contacta → actividades registran last/next_contact
                          ▼
                     Calificado (20%)  ← scoring + exit gate (soft)
                          ▼
                  Discovery realizado (30%) ← wizard (templates)
                          ▼
                      Demo realizada (45%)
                          ▼
                   Propuesta enviada (60%) ← quotation vinculada (PDF/email)
                          ▼
                      Negociación (75%)
                          ▼
                Contrato / pago pendiente (90%)
              ┌───────────┴───────────┐
              ▼                       ▼
     WON ────────────────       LOST estructurado
      │  ├→ factura / CxC           (catálogo + competidor +
      │  ├→ venta POS (opcional)     precio + features + recontacto)
      │  ├→ reserva inventario
      │  ├→ reserva PMS (si espacios)
      │  ├→ oportunidad ONBOARDING (pipeline type='onboarding')
      │  └→ programar RENOVACIÓN (billing_cycle_months → hitos genéricos)
      ▼
  CUSTOMER SUCCESS: health score → alertas → EXPANSIÓN (pipeline type='expansion')
                                          REFERIDO → programa de referidos
```

### 6.2 Reutilización de tablas existentes (sin crear nada nuevo)

| Tabla existente | Para qué se reutiliza | Cómo |
|-----------------|----------------------|------|
| `templates` | Plantillas de discovery, demo, propuesta, objeciones, playbooks, onboarding | Extender con `kind` (nueva col: `'message'`, `'buyer_persona'`, `'playbook'`, `'demo_script'`, `'objection'`, `'discovery_template'`, `'onboarding'`) + `metadata` jsonb. `body_html` = contenido, `variables` = variables dinámicas |
| `automations` | Secuencias de seguimiento (día 0, 1, 3, 5, 7, 14, 30) | `trigger_json` = `{event: 'stage_change', stage_id: X}`, `actions_json` = `[{day: 0, channel: 'whatsapp', template_id: X}, ...]` |
| `tasks` | Instancias de onboarding, followup, renovación | `related_to_type` = `'onboarding'` / `'opportunity'` / `'renewal'`, `type` = `'onboarding_step'` / `'followup'` / `'renewal'` |
| `notes` | Respuestas de discovery guardadas por oportunidad | `related_type` = `'opportunity'`, `body` = respuestas |
| `activities` | Eventos de POS, cierre ganado, cierre perdido, discovery, demo | `activity_type` = `'purchase'` / `'won'` / `'lost'` / `'discovery'` / `'demo'`, `metadata` = datos del evento |
| `opportunities` | Oportunidades de expansión, onboarding, renovación | `pipeline_type` en `pipelines`: `'sales'` / `'expansion'` / `'onboarding'` / `'renewal'`. Mismo Kanban, mismo servicios |
| `quotations` | Propuestas comerciales | `opportunity_id` + `sections_json` (narrativa de propuesta). Ya tienen numeración, PDF, email, conversión a factura |
| `commissions` | Comisiones de partners y vendedores (ledger) | `payee_type='partner'`, `commission_type='partner'` para partners. `source_type='opportunity'`, `commission_type='salesperson'` para vendedores. Hoy lo alimentan POS, facturas venta y compras; CRM añade la fuente oportunidad |
| `subscriptions` | **NO USAR desde CRM** — tabla de plataforma | Las renovaciones del CRM usan `billing_cycle_months` en deals ganados, no leen `subscriptions` |
| `stages` | Exit gates | `exit_criteria` JSONB: `{required_fields[], required_activities[], require_discovery, min_score}` |
| `organization_preferences` | Configuración simple (renewal timeline, referral program) | `settings` JSONB con keys anidadas. Health score config va en tabla propia `health_score_configs` |

### 6.3 Objetos NUEVOS (8: 6 tablas + 1 tabla config + 1 materialized view)

```sql
-- ============ EXTENSIONES A EXISTENTES ============
alter table pipelines
  add column if not exists pipeline_type text not null default 'sales';
  -- 'sales' | 'renewal' | 'expansion' | 'onboarding'

alter table stages
  add column if not exists exit_criteria jsonb not null default '{}',
  add column if not exists is_won  boolean not null default false,
  add column if not exists is_lost boolean not null default false,
  add column if not exists sla_days integer;

alter table opportunities
  add column if not exists record_type text not null default 'deal',  -- 'lead' | 'deal'
  add column if not exists source text,
  add column if not exists vertical_id uuid,
  add column if not exists score_total integer,
  add column if not exists score_data jsonb default '{}',
  add column if not exists temperature text,  -- cold|warm|hot
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_contact_at timestamptz,
  add column if not exists contact_channel text,
  add column if not exists contact_result text,
  add column if not exists objection text,
  add column if not exists loss_reason_value text,
  add column if not exists competitor_name text,
  add column if not exists competitor_price numeric(14,2),
  add column if not exists missing_features text[],
  add column if not exists recontact_at date,
  add column if not exists parent_opportunity_id uuid references opportunities(id),
  add column if not exists billing_cycle_months integer,
  add column if not exists discovery_data jsonb default '{}',
  add column if not exists demo_data jsonb default '{}';

create index if not exists idx_opps_next_contact on opportunities (organization_id, next_contact_at)
  where status = 'open';
create index if not exists idx_opps_record_type on opportunities (organization_id, record_type);

alter table quotations
  add column if not exists opportunity_id uuid references opportunities(id),
  add column if not exists sections_json jsonb;

alter table sales
  add column if not exists opportunity_id uuid references opportunities(id);

alter table invoice_sales
  add column if not exists opportunity_id uuid references opportunities(id);

alter table accounts_receivable
  add column if not exists opportunity_id uuid references opportunities(id);

alter table conversations
  add column if not exists opportunity_id uuid references opportunities(id);

alter table reservations
  add column if not exists opportunity_id uuid references opportunities(id);

alter table customers
  add column if not exists health_score integer,
  add column if not exists health_score_updated_at timestamptz,
  add column if not exists nps_score integer;

-- Extender templates existente para contenido comercial (sin tabla nueva)
alter table templates
  add column if not exists kind text not null default 'message',
      -- message|buyer_persona|playbook|demo_script|objection|discovery_template|onboarding
  add column if not exists metadata jsonb not null default '{}';

-- ============ TABLAS NUEVAS (6) ============
-- Sin prefijo "crm_" (decisión del dueño). Verificado contra 372 tablas live: sin colisiones.

-- 1. Verticales comerciales (necesita FK desde opportunities.vertical_id)
create table if not exists verticals (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references organizations(id),
  name text not null,
  slug text not null,
  description text,
  color text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (organization_id, slug)
);

-- 2. Catálogo de razones de pérdida (necesita queries + seeds globales)
create table if not exists loss_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id integer references organizations(id),  -- null = seed global
  value text not null,
  label_es text not null,
  label_en text,
  category text,
  sort_order integer default 0,
  is_active boolean default true
);

-- 3. Config de scoring (1 fila/org, JSONB — se lee entero, no se consulta por FK)
create table if not exists scoring_configs (
  organization_id integer primary key references organizations(id),
  config jsonb not null,  -- criterios GOC: [{key,label,question,type,weight,options}]
  threshold_cold integer default 30,
  threshold_warm integer default 51,
  threshold_hot integer default 71,
  updated_at timestamptz default now()
);

-- 4. Histórico de cambios de etapa (trigger automático para métricas de ciclo)
create table if not exists opportunity_stage_history (
  id bigint generated always as identity primary key,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  organization_id integer not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists idx_osh_opp on opportunity_stage_history (opportunity_id);

-- 5. Comisiones por vendedor (UNA tabla para % general Y % por vendedor)
-- salesperson_id IS NULL = % general de la organización (default para todos)
-- salesperson_id NOT NULL = override individual por vendedor
create table if not exists vendor_commission_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references organizations(id),
  salesperson_id uuid references profiles(id),          -- NULL = % GENERAL de la org
  commission_type text not null default 'percentage',   -- percentage | fixed_amount
  rate numeric(9,2) not null,
  valid_from date not null default current_date,        -- histórico sin borrar registros
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);
create unique index if not exists uq_vcr_seller
  on vendor_commission_rates (organization_id, salesperson_id, valid_from)
  where salesperson_id is not null;
create unique index if not exists uq_vcr_org_default
  on vendor_commission_rates (organization_id, valid_from)
  where salesperson_id is null;
-- ⚠️ NO confundir con organization_commission_rates: esa tabla es de plataforma
-- (tarifas que GoAdmin cobra a organizaciones). El CRM no la lee ni la escribe.

-- 6. Histórico de health scores (snapshots temporales — customers.metadata no permite histórico)
create table if not exists health_score_snapshots (
  id bigint generated always as identity primary key,
  organization_id integer not null references organizations(id),
  customer_id uuid not null references customers(id),
  score integer not null,  -- 0-100
  band text,               -- green|yellow|red (para queries rápidos)
  indicators jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists idx_hss_customer on health_score_snapshots (organization_id, customer_id, created_at desc);

-- 7. Config de health score por organización (tabla separada — tiene estructura, queries por org, lógica de cálculo)
create table if not exists health_score_configs (
  organization_id integer primary key references organizations(id),
  config jsonb not null,        -- {indicators: [{key,label,type,weight,source,threshold}], bands: {green: 70, yellow: 40, red: 0}}
  refresh_interval_hours integer default 24,
  is_active boolean default true,
  updated_at timestamptz default now()
);

-- 8. Materialized view de health de clientes (lee sales, invoice_sales, accounts_receivable, campaign_contacts)
create materialized view if not exists mv_customer_health as
select c.organization_id, c.id customer_id,
       count(s.id) filter (where s.created_at > now() - interval '90 days') purchases_90d,
       extract(day from now() - max(s.created_at)) recency_days,
       coalesce(sum(s.total), 0) ltv_total,
       avg(s.total) avg_ticket,
       (select count(*) from accounts_receivable ar
         where ar.customer_id = c.id and ar.status <> 'paid') outstanding_count
from customers c left join sales s on s.customer_id = c.id
group by c.organization_id, c.id;
-- refinar joins a sales/invoice_sales según esquema real
-- refresh horario vía pg_cron o ruta cron /api/crm/health/recalculate
create unique index if not exists idx_mvh_customer on mv_customer_health (organization_id, customer_id);

-- ============ TRIGGERS ============
create or replace function fn_log_stage_change() returns trigger as $$
begin
  if new.stage_id is distinct from old.stage_id then
    insert into opportunity_stage_history (opportunity_id, organization_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, new.organization_id, old.stage_id, new.stage_id, new.updated_by);
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_opp_stage_history
  after update on opportunities
  for each row execute function fn_log_stage_change();

-- Sincronizar status desde etapa (is_won/is_lost)
create or replace function fn_sync_status_from_stage() returns trigger as $$
begin
  if new.stage_id is distinct from old.stage_id then
    select case when s.is_won then 'won' when s.is_lost then 'lost' else 'open' end
      into new.status from stages s where s.id = new.stage_id;
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_opp_sync_status
  before update on opportunities
  for each row execute function fn_sync_status_from_stage();

-- ============ NORMALIZACIÓN PROBABILIDADES (fix B1) ============
update stages set probability = round(probability * 100) where probability between 0 and 1;
-- revisar manualmente cualquier valor ambiguo (=1) antes de ejecutar

-- ============ RLS (mismo patrón que tablas existentes) ============
-- Todas las tablas nuevas llevan RLS por organization_id
-- Ejemplo:
-- alter table verticals enable row level security;
-- create policy verticals_select on verticals for select using (organization_id = current_org_id());
-- (análogo para insert/update/delete)
-- Para tablas con seeds globales (loss_reasons):
-- using (organization_id = current_org_id() or organization_id is null)

-- ============ ESCALAS CANÓNICAS ============
-- probability = 0–100 (entero), position = entero creciente (eliminar display_order)
-- status = 'open' | 'won' | 'lost'
```

### 6.4 Convención de `stages.exit_criteria` (JSONB)

```jsonc
{
  "required_fields": ["amount", "expected_close_date"],
  "required_customer_fields": ["company_name", "phone"],
  "required_activities": [ { "type": "call", "count": 1 } ],
  "require_discovery": false,
  "min_score": 51
}
```

El validador (`stageGateService`) devuelve `{ ok, missing[] }`. En el Kanban: si `!ok` → dialog lista lo faltante y permite **avanzar igual con confirmación** (soft-gate, registra override en metadata).

### 6.5 Reglas técnicas

- **Migraciones:** vía Supabase MCP (`apply_migration`), versionadas. Cada migración incluye RLS + índices.
- **Tipos:** todo en `src/types/crm.ts` (única fuente). Eliminar duplicados. `status` canónico: `'open' | 'won' | 'lost'`.
- **Org actual:** siempre `useOrganization()`. Prohibido localStorage con claves arbitrarias y prohibido fallback `organizationId = 2`.
- **Moneda:** quitar "COP" hardcodeado; default = moneda de la organización.
- **APIs REST:** solo donde hay lógica server-side (scoring, cron, IA). CRUD simple sigue cliente→Supabase con RLS.
- **Frontera de tablas:** prohibido en código CRM cualquier `.from('organizations')`, `.from('subscriptions')`, `.from('plans')`, `.from('sellers*')`, `.from('organization_commission_rates')`, `.from('payout*')`. Linter/review deben rechazarlo. Si algún flujo necesita saber algo de plataforma, es una feature del super admin.
- **UI de configuración:** dentro de `/app/configuracion` → tab CRM (`CRMConfigPanel`), organizada en tabs internas estilo `GeneralConfigPanel`: *Canales (existe) · Proceso comercial · Plantillas · Seguimiento · Post-venta*. Componentes nuevos en `src/components/crm/config/`, embebibles (prop `embedded`), cards→modal, detalle→Sheet.

---

## 7. Plan de implementación por fases

> Orden: **higiene → esqueleto de datos → flujo vivo → dinero → post-venta → escala.**
> Regla de corte: no se inicia una fase con la anterior incompleta en producción.

### FASE 0 — Higiene de datos (días 1–3)

> Ver sección 4. Sin esto, toda métrica nueva miente.

### FASE 1 — Esqueleto comercial (semana 1)

> Objetivo: que el embudo exista como DATOS: origen, contacto, calificación mínima, pérdida estructurada, criterios de etapa, histórico para medir ciclos, comisiones configurables.

**Migración SQL:** ver sección 6.3 (extensiones + 6 tablas + 1 config + 1 MV + triggers + índices + RLS).

**Plantilla semilla del pipeline SaaS B2B (datos, no código):**

Script idempotente que inserta el pipeline semilla "Ventas B2B" con 10 etapas (aplica a cualquier organización B2B nueva):

| # | Etapa | Prob | sla_days | exit_criteria resumen |
|---|-------|------|----------|----------------------|
| 1 | Lead nuevo | 5 | 7 | — |
| 2 | Contactado | 10 | 5 | ≥1 actividad de contacto |
| 3 | Calificado | 20 | 7 | empresa+teléfono+sector+problema+decisor+fecha estimada |
| 4 | Discovery realizado | 30 | 10 | `require_discovery: true` |
| 5 | Demo realizada | 45 | 10 | actividad tipo reunión + next_contact_at |
| 6 | Propuesta enviada | 60 | 7 | ≥1 quotation vinculada |
| 7 | Negociación | 75 | 10 | — |
| 8 | Contrato/pago pendiente | 90 | 7 | — |
| 9 | Ganado (is_won) | 100 | — | — |
| 10 | Perdido (is_lost) | 0 | — | razón obligatoria (UI) |

Las demás organizaciones empiezan con set genérico (ya configurable).

**Servicios** (`src/lib/services/crm/`):
- `stageGateService.ts` — evalúa `exit_criteria` contra oportunidad + customer + actividades; devuelve `{ok, missing[]}`. Soft-gate.
- `lossReasonService.ts` — catálogo (global+org) y guardado estructurado.
- `scoringService.ts` — calcula `score_total` desde `scoring_configs` + respuestas; deriva `temperature`.
- `followupService.ts` (v1) — query "vencidos hoy": `next_contact_at <= hoy OR días en etapa > sla_days`.
- `seedPipelines.ts` — plantillas semilla idempotentes.
- `commissionService.ts` — dos responsabilidades sobre infraestructura EXISTENTE:
  1. **Config (lectura):** cadena única de resolución — override en la oportunidad (`opportunity.commission_rate`) → tasa vigente del vendedor (`vendor_commission_rates` con `salesperson_id NOT NULL`) → % general de la org (fila con `salesperson_id IS NULL`).
  2. **Devengo (escritura):** al ganar oportunidad (o pagar su factura), INSERTA en el ledger existente `commissions` con `source_type='opportunity'`, `commission_type='salesperson'`, `status='accrued'`, `base_amount/rate/amount`. Cero UI nueva de pagos: aparece automáticamente en `/app/finanzas/comisiones` y fluye a nómina (payroll ya lee esa tabla).
  - Hoy el ledger `commissions` lo alimentan POS (`posService`, `pedidosService`), facturas venta (`NuevaFacturaForm`) y compras (`FacturasCompraService`); CRM añade la fuente que falta.

**Componentes operativos** (`src/components/crm/`):
- `StructuredLossDialog.tsx` — reemplaza `LossReasonDialog`: catálogo + competidor + precio + features + recontacto.
- `GateWarningDialog.tsx` — en drag del Kanban: lista criterios incumplidos, permite avanzar confirmando (soft-gate).
- `ScoreBadge.tsx` + `TemperatureDot.tsx` — sobre `OpportunityCard`.
- Campos nuevos en formulario único: `source`, `vertical_id`, `next_contact_at`.
- `ImportLeadsCsv.tsx` — importa prospectos actuales.

**Configuración central** (tab CRM de `/app/configuracion?modulo=crm`, cards→modal):
- Card "Verticales" → CRUD `verticals`
- Card "Razones de pérdida" → CRUD `loss_reasons`
- Card "Scoring (GOC)" → editor de criterios/pesos/umbrales (`scoring_configs`)
- Card "Etapas y criterios" → abre `StageManager` existente + editor de `exit_criteria` por etapa
- Card "Vendedores y comisiones" → `% general` editable inline (fila `vendor_commission_rates` con `salesperson_id IS NULL`) + overrides por vendedor (`salesperson_id NOT NULL`) con vigencias + simulador ("si cierro $10M, comisión = X")

**Definition of Done FASE 1:**
- [ ] Pipeline SaaS visible en Kanban con datos reales importados (mínimo 10 oportunidades vivas)
- [ ] Arrastrar tarjeta sin cumplir criterios muestra warning con lo faltante
- [ ] Perder oportunidad exige catálogo + (si competitor) nombre/precio
- [ ] `opportunity_stage_history` registra cambios automáticamente
- [ ] Cotización puede vincularse a oportunidad desde ambos lados
- [ ] Comisión de vendedor se calcula automáticamente al crear venta/factura/oportunidad
- [ ] Cambiar % de comisión de un vendedor es una operación de 30 segundos

### FASE 2 — Flujo vivo (semana 2)

> Objetivo: que el embudo se llene solo y que nadie olvide a quién contactar.

**Captura automática de leads:**
Los webhooks Twilio/Meta ya crean conversaciones+clientes. Agregar en ese punto:
```ts
await ensureLeadOpportunity({ customerId, source: channel, recordType: 'lead' });
```
Reglas: 1 oportunidad abierta por customer (dedupe); si ya existe deal abierto, crear actividad en vez de nueva oportunidad.

**Página "Hoy" (`/app/crm/hoy`):**
Lista accionable única:
1. Contactos vencidos: `next_contact_at <= now`
2. Estancadas: `sla_days` de la etapa excedido sin actividades
3. Leads sin primer contacto (>48h)
Cada fila: botones WhatsApp/Llamar/Email + "programar próximo contacto".

**Scoring manual GOC:**
En drawer de oportunidad: sección "Calificación" con preguntas del `scoring_configs`, guarda `score_data`, calcula `score_total`, colorea badge.

**Funnel real:**
Dashboard: conversión por etapa usando `opportunity_stage_history` (lead→deal, tiempo medio por etapa, cuellos de botella).

**Integraciones de conexión #6, #9, #11, #12:**
- POS → actividad CRM: venta cerrada crea `activity` (type='purchase') + actualiza `last_contact_at`
- Actividades → `calendar_unified`: actividad con fecha → evento
- Timeline global consume `activities` comerciales
- Notificaciones: nueva opp / estancada / tarea vencida / won / lost

**Definition of Done FASE 2:**
- [ ] Un mensaje de WhatsApp nuevo genera lead en Kanban con source correcto
- [ ] Página "Hoy" muestra lista real del día y permite reprogramar en 1 click
- [ ] Score GOC visible y persistido en 80%+ de oportunidades abiertas
- [ ] Funnel muestra conversiones reales por etapa con tiempos
- [ ] Venta en POS crea actividad en timeline del cliente
- [ ] Actividades CRM aparecen en calendario unificado

### FASE 3 — Cierre conectado al dinero (semanas 3–4)

> Objetivo: propuesta con narrativa de valor, y que ganar una venta produzca documentos y trazabilidad financiera.

**Propuestas = cotizaciones narradas (sin tablas nuevas):**
- Desde oportunidad: botón "Generar propuesta" → prefill de `quotations` con líneas desde `opportunity_products` + secciones narrativas editables (`situacion_actual`, `problemas`, `solucion`, `roi_estimado`, `proximo_paso`) guardadas en `sections_json`.
- PDF/email: reusa infraestructura existente de cotizaciones (numeración COT-%, plantilla, envío).
- Al enviar: actividad automática "Propuesta enviada" + `next_contact_at = +24h`.

**Modal de cierre (Won):**
Al marcar ganada (o arrastrar a etapa is_won), modal con acciones encadenadas:
1. Generar factura desde última cotización (reusa `convertToInvoice()` existente) + guardar `invoice_sales.opportunity_id`
2. Opcional: generar venta POS (`sales.opportunity_id`)
3. Si tiene productos: reservar stock / sugerir purchase_order (toggle por org)
4. Si tiene `opportunity_spaces`: crear `reservations` con `opportunity_id`
5. Si es venta GoAdmin: registrar referencia comercial opcional (nota: nombre/NIT/contacto del cliente nuevo — la creación del tenant ocurre por signup normal y se gestiona en super admin, nunca desde el CRM)
6. Crear oportunidad hija de Onboarding (pipeline `type='onboarding'`)
7. Programar renovación si `billing_cycle_months` definido (hitos 120/90/60/30/15/7 días)
8. Pedir referido (tarea + plantilla de mensaje) — se activa post-30-días

**Integraciones de conexión #3, #4, #5, #7:**
- `quotations.opportunity_id` poblado en propuestas generadas desde CRM
- `invoice_sales.opportunity_id` poblado en ventas cerradas desde CRM
- `sales.opportunity_id` poblado si se genera venta POS
- `reservations.opportunity_id` poblado si se genera reserva PMS
- Stock comprometido si aplica

**Definition of Done FASE 3:**
- [ ] Ciclo completo demostrable: lead capturado por WhatsApp → … → propuesta PDF enviada → ganada → factura generada → oportunidad de onboarding creada
- [ ] `invoice_sales.opportunity_id` poblado en ventas cerradas desde CRM
- [ ] Tiempo de ciclo (lead→won) medible desde `opportunity_stage_history`
- [ ] Reserva PMS creada automáticamente al ganar oportunidad con espacios
- [ ] Stock comprometido al ganar oportunidad con productos (si está activado)

### FASE 4 — Post-venta (mes 2)

> Objetivo: cliente activo, salud visible, renovación anticipada y expansión sistemática — reutilizando pipelines.

**Onboarding como pipeline:**
- Plantilla: `templates` con `channel='onboarding'` (jsonb: pasos día 0–30) por organización.
- Instancia = **oportunidad** con `parent_opportunity_id` en pipeline `pipeline_type='onboarding'` (etapas: Kickoff → Configuración → Importación → Capacitación → Uso asistido → Revisión 14d → Business Review 30d). Cero UI nueva: Kanban existente + checklist ligada a `tasks`.
- Handoff won→onboarding = crear oportunidad hija (ya en FASE 3 modal de cierre).

**Health score de clientes (CRM):**
- Materialized view `mv_customer_health` leyendo `sales`, `invoice_sales`, `accounts_receivable`, `campaign_contacts` (que YA existen). Refresh horario vía pg_cron o ruta cron `/api/crm/health/recalculate`.
- `health_score_configs` (tabla nueva): config por organización con indicadores activos + pesos + umbrales 🟢🟡🔴. Default razonable semillado; el restaurante pesa recencia, el mayorista peso de saldo, etc.
- `health_score_snapshots` (tabla nueva): histórico de scores por cliente para ver tendencias (sparkline en ficha + alerta "rojo N ciclos seguidos").
- `customers.health_score` (cache int 0-100) + `customers.health_score_updated_at`.
- **Posicionamiento:** este health es GENÉRICO — cualquier organización ve la salud de SUS clientes. La salud de las organizaciones como clientes de GoAdmin vive SOLO en go-admin-super. Son productos distintos.
- UI: gauge por cliente en ficha 360° + panel de alertas (rojos) accesible desde dashboard CRM. Configuración en tab CRM central ("Post-venta").

**Renovaciones:**
- **Mecanismo genérico (todas las organizaciones):** deals ganados con `billing_cycle_months` definen su ciclo. Ruta cron `/api/crm/renewals/sync` crea/actualiza oportunidades en pipeline `type='renewal'` con hitos 120/90/60/30/15/7 días antes del vencimiento como `next_contact_at`. Funciona igual para un gimnasio (mensual) que para GoAdmin (anual).
- **Renovación de TENANTS de la plataforma (organizaciones clientes de GoAdmin):** es funcionalidad del super admin, fuera de este plan. El CRM de la organización GoAdmin solo gestiona renovaciones comerciales que ella misma registre como cualquier otra empresa.
- Nunca duplicar estados: cada org es fuente de verdad de SUS renovaciones; nada se sincroniza con plataforma.

**Expansión:**
- Pipeline `type='expansion'` + `deal_type` en `opportunities.metadata` (cross-sell/upsell/nueva sucursal/módulo).
- Señales automáticas desde datos propios: cliente saludable + sin actividad de expansión → tarea sugerida; crecimiento de compras vs periodo anterior → oportunidad de upsell candidata.

**Integración de conexión #8:**
- `opportunities.project_id` para crear proyectos desde cierre (implementaciones).

**Definition of Done FASE 4:**
- [ ] Deal ganado produce instancia de onboarding navegable en su propio Kanban
- [ ] Panel de salud marca clientes rojos con causa principal (recencia/saldo/caída)
- [ ] Histórico de health score muestra tendencia (mejorando/empeorando)
- [ ] Renovaciones con hitos automáticos (120/90/60/30/15/7 días) para deals con `billing_cycle_months` definido
- [ ] Primer deal de expansión creado desde señal de salud

### FASE 5 — Escala (mes 3+)

> Solo si las fases anteriores están completas en producción con 20+ deals cerrados fluyendo.

**1. Secuencias completas:**
Ahora sí: `automations` con `trigger_json`/`actions_json` completos + cron que crea actividades según plantilla por etapa. Solo si la página "Hoy" demuestra volumen que el manual no cubre.

**2. Referidos y canal indirecto POR ORGANIZACIÓN:**

| Mundo | Dónde vive | Datos |
|-------|-----------|-------|
| Vendedores de la PLATAFORMA GoAdmin | go-admin-super (fuera de este plan) | `sellers`, `seller_referrals`, `seller_commissions` + payouts Stripe |
| Vendedores de CADA organización | ERP (este plan) | `profiles` con rol comercial, `salesperson_id` en oportunidades/ventas |
| Partners de cada organización | ERP (este plan) | `customers` con `customer_type='partner'` + `metadata` (nivel, comisión). Comisiones en `commissions` con `payee_type='partner'` |

- Programa de referidos: `organization_preferences.settings.crm.referral_program` (jsonb: incentivo/elegibilidad) + tabla `referrals` (origin_customer_id, referred_customer_id, estado, recompensa).
- Partner externo de una organización: `customers` con `customer_type='partner'` — NO toca `sellers` del super admin jamás.

**3. Métricas comerciales avanzadas:**
RPC `fn_comercial_metrics` (win rate, cycle length, ARPA, pipeline coverage, proyección). Las métricas SaaS de plataforma (MRR, ARR, churn de organizaciones) viven en go-admin-super, no aquí. Dashboard por vendedor. Reusa `fn_reporte_crm_funnel` y `fn_reporte_crm_ranking_vendedores` existentes.

**4. IA comercial** (OPENAI_API_KEY ya existe):
- Recomendador de próxima acción (reglas + LLM)
- Resumen de discovery/llamadas
- Clasificación de objeción desde la nota
- Endpoints `/api/crm/ia/*`

**5. Plantillas de pipeline por vertical** compartibles entre organizaciones (marketplace interno de templates).

**6. i18n del módulo CRM** (hoy hardcoded español) hacia `messages/{es,en,fr,pt}.json`.

**Integración de conexión #13:**
- Reportes cruzados: RPCs funnel-real (stage_history × ventas × facturación) + dashboard.

---

## 8. Roadmap resumen

| Fase | Cuándo | Esfuerzo | Valor | Entregable estrella |
|------|--------|----------|-------|---------------------|
| 0 Higiene | días 1–3 | Bajo | Alto (confiabilidad) | Forecast honesto + 1 solo form |
| 1 Esqueleto | semana 1 | Medio | Alto | Pipeline SaaS con prospectos reales + gates + comisiones |
| 2 Flujo vivo | semana 2 | Medio | Muy alto | Leads automáticos + página "Hoy" |
| 3 Dinero | semanas 3–4 | Medio | Muy alto | Propuesta→factura en un clic |
| 4 Post-venta | mes 2 | Alto | Alto (retención) | Onboarding kanban + salud + renovaciones |
| 5 Escala | mes 3+ | Según demanda | Escala | Secuencias, partners, IA |

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Soft-gates ignorados → pipeline falso | Reporte semanal "% etapas avanzadas con override"; endurecer por org cuando madure |
| Triggers (history/status-sync) chocan con código que setea status manualmente | Auditar `updateOpportunity({status})` y unificar: status SOLO derivado de etapa |
| MV de health desfasada | Refresh programado + botón "recalcular" + timestamp visible en UI |
| Datos históricos sin source/score | Import CSV los rellena; reportes filtran "sin clasificar" para empujar higiene |
| Alcance de Fase 4 se infla | Onboarding/health/expansión salen SOLO tras tener 20+ deals cerrados fluyendo |
| `activities` no tiene `customer_id` (B6) | Merge de clientes repuntea vía `related_type='customer'` + `related_id` |

---

## 10. Orden de ejecución sugerido (esta semana)

1. Migración FASE 0 (normalización probability) + fixes B2–B6 en código
2. Migración FASE 1 (extensiones + 6 tablas + health_score_configs + mv_customer_health + triggers + índices + RLS) vía Supabase MCP
3. Seed: pipeline "Ventas B2B" 10 etapas + razones de pérdida globales + scoring config default
4. `StructuredLossDialog` + campos nuevos en formulario único + `GateWarningDialog`
5. Import CSV de prospectos reales → Kanban vivo
6. `quotations.opportunity_id` en UI (selector en Nueva cotización + botón "Propuesta" en oportunidad)
7. Card "Vendedores y comisiones" en configuración CRM

Con eso, en una semana tienes: proceso real configurado, datos reales fluyendo, pérdidas medibles, comisiones automáticas y dinero conectado. Las fases 2+ se planifican con esa base andando.

---

## 11. Estado de implementación (FASE 0–5 completadas)

> Sección añadida tras implementar todas las fases con subagentes en paralelo.

### Commits de implementación

| Commit | Fase | Descripción |
|--------|------|-------------|
| `9fe2ae4d` | FASE 0 | Higiene B1–B8 (probability 0-100, pipeline Ventas B2B, form único, markAsLost estructurado, merge clientes, localStorage→hook, código muerto) |
| `c1905759` | FASE 1 | Esqueleto comercial (7 tablas + MV + trigger + 6 servicios + 5 componentes + 5 cards config) |
| `62b38942` | FASE 1 QA + FASE 2 | QA fixes + flujo vivo (leadCapture, followup, Hoy, scoring GOC, funnel, integraciones) |
| `aaf87037` | FASE 3 | Cierre dinero (propuestas, WonCloseModal, posCrmLink, pmsCrmLink, inventoryCrmLink, selectores finanzas) |
| `ae58b870` | FASE 4 + 5 | Post-venta + escala (onboarding, health score, renovaciones, expansión, métricas, IA, i18n) |

### Objetos BD creados (via Supabase MCP)

**7 tablas nuevas:** verticals, loss_reasons, scoring_configs, opportunity_stage_history, vendor_commission_rates, health_score_snapshots, health_score_configs

**1 materialized view:** mv_customer_health (con RPC refresh_mv_customer_health)

**1 trigger:** trg_opp_stage_history (log cambios de etapa)

**Columnas nuevas en tablas existentes:**
- opportunities: metadata, source, vertical_id, next_contact_at, billing_cycle_months, parent_opportunity_id, score_total, score_data, temperature
- stages: sla_days, exit_criteria, is_won, is_lost, display_order
- pipelines: pipeline_type
- quotations: opportunity_id, sections_json
- invoice_sales: opportunity_id
- sales: opportunity_id
- reservations: opportunity_id
- templates: kind
- customers: health_score, health_score_updated_at

**RLS activa** en las 7 tablas nuevas.

### Servicios CRM (src/lib/services/crm/)

| Servicio | Funciones clave |
|----------|----------------|
| verticalsService | CRUD verticales por organización |
| lossReasonsService | Catálogo global + por org |
| scoringService | Cálculo GOC + temperature |
| stageGateService | Evalúa exit_criteria (soft-gate) |
| commissionService | Cadena resolución + devengo ledger |
| pipelineSeedService | Semilla idempotente "Ventas B2B" |
| leadCaptureService | ensureLeadOpportunity (dedupe) |
| followupService | Vencidos, estancadas, sin contacto |
| crmIntegrations | POS→actividad, calendario, timeline, notificaciones |
| proposalService | Genera cotización narrada desde oportunidad |
| posCrmLink | linkSaleToOpportunity, createPosSaleFromOpportunity |
| pmsCrmLink | linkReservationToOpportunity, createReservationFromOpportunity |
| inventoryCrmLink | reserveStockForOpportunity, releaseStockForOpportunity |
| onboardingService | Pipeline onboarding + templates + checklist |
| healthScoreService | Score 0-100 + snapshots + red alerts + refresh |
| renewalService | syncRenewals + hitos 120/90/60/30/15/7 días |
| expansionService | Señales automáticas + pipeline expansión |
| followupEngineService | Motor secuencias con automations |
| referralsService | Programa referidos via organization_preferences |
| commercialMetricsService | Win rate, cycle length, ARPA, coverage |

### Componentes CRM nuevos

**Operativos:** StructuredLossDialog, GateWarningDialog, ScoreBadge, TemperatureDot, ImportLeadsCsv, ScoringSection, ProposalBuilderDialog, WonCloseModal, OnboardingChecklist, ClientHealthCard, SaludView, FunnelView, MetricasView, HoyView

**Configuración:** VerticalsManager, LossReasonsManager, ScoringConfigurator, ExitGatesEditor, CommissionsPanel, ReferralsProgramCard

### Páginas nuevas

- `/app/crm/hoy` — Lista accionable del día
- `/app/crm/salud` — Panel de health score de clientes
- `/app/crm/metricas` — Dashboard de métricas comerciales

### Rutas API nuevas

- `/api/crm/renewals/sync` — Cron renovaciones
- `/api/crm/health/recalculate` — Cron health score
- `/api/crm/followup/run` — Cron secuencias
- `/api/crm/ia/next-action` — Recomendador IA
- `/api/crm/ia/discovery-summary` — Resumen IA

### i18n

Namespace `crm` agregado en `messages/es.json` y `messages/en.json` con 83 keys (metricas, referrals, followup, ia).

### Notas de implementación

- `opportunities` no tiene `updated_by`: el trigger inserta `null` en `changed_by`
- `opportunities` no tiene `won_date`: se usa `updated_at` como proxy
- RLS sin policies en tablas nuevas: se definirán cuando se abra a producción
- Los servicios aceptan `organizationId` opcional para funcionar server-side en rutas cron
- `mv_customer_health` se refresca via RPC `refresh_mv_customer_health()` (concurrent refresh)
- Config default de health score sembrada para org 1 (4 indicadores: recency/frecuencia/ltv/avg_ticket)

---

*Documento unificado tras análisis exhaustivo del CRM (go-admin-erp), super admin (go-admin-super), esquema BD (Supabase jgmgphmzusbluqhuqihj), verificación de bugs contra código real, fusión con PLAN-V2-IMPLEMENTACION-COMERCIAL.md, e implementación completa de FASE 0–5.*
