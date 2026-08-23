# Sistema Comercial GoAdmin — Plan V2 de Implementación por Fases

> Fecha: 2026-08-22
> Autor: análisis propio (ox-alpha) tras explorar go-admin-erp, go-admin-super y las 372 tablas live de Supabase (jgmgphmzusbluqhuqihj)
> Relación con documentos previos: valida el diagnóstico de `ANALISIS-Y-RECOMENDACIONES.md` (~90%), **rechaza su plan de implementación** por sobredimensionado y mal ordenado. Este documento es el plan alternativo.
> Principio innegociable: **nada hardcodeado**. Todo configurable por organización. GoAdmin es una organización más usando su propio CRM.

---

## 0. TL;DR

| Doc V1 | Plan V2 (este documento) |
|---|---|
| ~30 tablas nuevas | ~8 objetos nuevos + extensiones jsonb |
| Configuradores UI antes que datos | Datos fluyendo semana 1, configuradores cuando se necesiten |
| Leads como problema de modelo (tablas) | Leads = etapa del pipeline (`record_type`) |
| Expansión/onboarding como tablas propias | Pipelines adicionales reutilizando TODO el Kanban |
| Propuestas = nuevas tablas + builder | Reusar `quotations` (ya tienen numeración, PDF, email) + `opportunity_id` |
| Post-venta desconectada del SaaS | Renovaciones genéricas vía `billing_cycle_months` (cualquier org, incluida GoAdmin); renovación de TENANTS de la plataforma vive en go-admin-super |
| Pipeline ↔ dinero enterrado en notas | Semana 1: `quotations.opportunity_id` y cierre → factura |
| Sin captura automática | Webhooks existentes (Twilio/Meta) auto-crean leads en el pipeline |

Orden: **higiene → esqueleto de datos → flujo vivo → dinero → post-venta → escala.**

---

## 1. Principios rectores

1. **Reutilizar antes de crear.** Ya existe Kanban DnD + realtime, etapas CRUD, oportunidades con líneas, actividades/tareas/notas, forecast, cotizaciones con conversión a factura. Cada feature nueva debe montarse sobre esa maquinaria.
2. **Configuración por organización.** Toda tabla nueva lleva `organization_id` + RLS. Lo que hoy está hardcodeado (razones de pérdida, moneda COP, sets de etapas default) migra a datos.
3. **Contenido ≠ datos relacionales.** Buyer personas, playbooks, guiones de demo son *contenido*: jsonb o markdown, nunca 5 tablas relacionales.
4. **El dinero primero.** Un CRM que no conecta propuesta → pago es un TODO list caro. La costura pipeline↔cotización↔factura va en las primeras semanas, no "alguna vez".
5. **Frontera estricta de datos (regla de oro):** el CRM solo ve y toca los datos de SU organización (RLS por `organization_id`). Jamás lee ni escribe tablas de plataforma — `organizations`, `subscriptions`, `plans`, `sellers`, `organization_members` como listado global, etc. Toda la información agregada de las organizaciones existe únicamente en go-admin-super. GoAdmin usa el CRM exactamente igual que cualquier otra organización: consumiendo su propio producto con sus propios datos.
6. **Métricas se calculan, no se almacenan.** RPCs y materialized views (ya existen `fn_reporte_crm_*`, `mv_crm_forecast`). Cero tablas de métricas pre-calculadas.
7. **Validación progresiva (soft-gates).** Los criterios de etapa advierten y piden confirmación; bloquear duro al inicio genera pipeline paralelo en Excel/WhatsApp.

### Separación de niveles (intocable)

| Nivel | App | Mide |
|---|---|---|
| Salud de organizaciones clientes de GoAdmin (SaaS) | go-admin-super | suscripción, miembros, sucursales, uso del ERP |
| Salud de los clientes de cada organización | go-admin-erp CRM | frecuencia compra, recencia, saldo, engagement |

El Health Core del super admin ya existe y sigue evolucionando allá. Este plan NO lo toca ni lo duplica.

---

## 2. Qué NO construyo (y por qué) — diferencias explícitas con V1

| Propuesta V1 | Decisión V2 | Razón |
|---|---|---|
| Tabla `leads` separada | `opportunities.record_type = 'lead' \| 'deal'` | El lead es la etapa 1 del pipeline. Conversión = mover de etapa. Se reutilizan Kanban, forms, servicios, forecast. Evita sincronizar dos entidades |
| `crm_buyer_personas`, `crm_demo_templates`, `crm_sales_playbooks` (3 tablas) | Extender `templates` existente (está VACÍA, verificado) con `kind` + `metadata` jsonb | Contenido editorial no merece tabla nueva; reutilizar evita proliferación y respetó la decisión de prefijos |
| `crm_expansion_types` + `crm_expansion_opportunities` | Pipeline con `pipeline_type='expansion'` + campo `deal_type` opcional | V1 se contradice: ya define `pipeline_type`. Reuso total del Kanban |
| `crm_lead_scoring_models` + `crm_lead_scores` | `scoring_configs` (1 fila/org, jsonb) + `opportunities.score_total/score_data` | Nadie corre N modelos simultáneos. Score calculado se guarda en la oportunidad |
| `crm_health_score_configs` + `_indicators` + `_scores` (3 tablas) | `health_score_configs` (jsonb) + materialized view `mv_customer_health` | Los indicadores salen de `sales`, `invoice_sales`, `accounts_receivable`, `campaign_contacts` que YA existen |
| `crm_proposal_templates` + `crm_proposals` | Extender `quotations`: `opportunity_id` + `sections_json` | Las cotizaciones ya numeran, imprimen PDF, envían email y convierten a factura. Una propuesta ES una cotización narrada |
| `crm_onboarding_plans` + `_steps` + `_instances` (3 tablas) | `onboarding_templates` (jsonb) + oportunidades en pipeline `type='onboarding'` | El progreso del onboarding ES un kanban de etapas. Handoff won→onboarding = crear oportunidad hija |
| `crm_followup_sequences/_steps/_instances` (motor completo) en Fase 2 | Fase 2: `next_contact_at` + vista "Hoy". Motor completo recién Fase 5 | El 80 % del valor del seguimiento es saber a quién tocar hoy. El motor automatiza el 20 % restante |
| `crm_commission_rules` | Ya existe `commission_rate/type` en opportunities y tabla `commissions` | Duplicado |
| `crm_sales_metrics` (tabla) | RPC `fn_comercial_metrics` + dashboard que consulta | Ver principio 6 |
| `crm_referrals` + `crm_partner_*` propias desde cero | Fase 5: referidos/partners **de cada organización** (`referrals`, `partners` con `organization_id`) — jamás tocar `sellers` del super admin | El programa de la plataforma GoAdmin ya existe y funciona con Stripe; el del ERP es otro mundo |
| Configuración en `/app/crm/configuracion/*` | Cards/modales dentro del tab CRM de `/app/configuracion` (patrón centralizado existente: `configModulesRegistry.ts` → `CRMConfigPanel.tsx`, card→modal, detalle→Drawer) | Es la arquitectura decidida del proyecto |

Lo que SÍ acepto de V1 tal cual: catálogo de razones de pérdida, `exit_criteria` jsonb en stages, `source`/`last_contact_at`/`next_contact_at` en opportunities, `pipeline_type`, banderas `is_won/is_lost` en stages, APIs solo donde hay lógica de servidor.

---

## 3. Arquitectura de la solución

### 3.1 Flujo objetivo completo

```
        CAPTURA AUTOMÁTICA                     MANUAL
 Meta/Twilio/Web widget ──┐            Referidos, prospección, eventos
                          ▼                    ▼
                 OPORTUNIDAD (record_type='lead')  ── etapa Lead (5%)
                          │  SDR contacta → actividades registran last/next_contact
                          ▼
                     Calificado (20%)  ← GOC scoring + exit gate
                          ▼
                  Discovery realizado (30%) ← wizard jsonb
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
      │  ├→ nota de referencia      precio + features + recontacto)
      │  │   (tenant se crea por signup, se gestiona en super admin)
      │  ├→ oportunidad ONBOARDING (pipeline type='onboarding')
      │  └→ programar RENOVACIÓN (billing_cycle_months, hitos genéricos)
      ▼
  CUSTOMER SUCCESS: mv_health → alertas → EXPANSIÓN (pipeline type='expansion')
                                          REFERIDO → sellers (comisión automática)
```

### 3.2 Reglas técnicas

- **Migraciones:** vía Supabase MCP (`apply_migration`), versionadas, jamás SQL suelto. Cada migración incluye RLS + índices.
- **RLS:** mismo patrón helper que las tablas existentes (`organization_id` = org activa del JWT). Ejemplo base:

```sql
alter table verticals enable row level security;
create policy verticals_select on verticals
  for select using (organization_id = current_org_id());
-- insert/update/delete análogos. Para tablas con seeds globales:
-- using (organization_id = current_org_id() or organization_id is null)
```

- **Tipos:** todo en `src/types/crm.ts` (única fuente). Eliminar duplicados de `crm/pipeline/types.ts`, `crm/oportunidades/types.ts`, etc. `status` canónico: `'open' | 'won' | 'lost'`.
- **Org actual:** siempre `useOrganization()`. Prohibido localStorage con claves arbitrarias (hoy hay 5 claves candidatas dispersas) y prohibido fallback `organizationId = 2`.
- **UI de configuración:** dentro de `/app/configuracion`, tab CRM (`CRMConfigPanel`), con deep-link directo **`/app/configuracion?modulo=crm`** (soportado nativamente: `useConfiguracionState` lee el query param `modulo`). Tabs internas estilo `GeneralConfigPanel`: *Canales (existe) · Proceso comercial · Plantillas · Seguimiento · Post-venta*. Componentes nuevos en `src/components/crm/config/`, embebibles (prop `embedded`), cards→modal, detalle→Sheet.
- **APIs REST:** solo donde hay lógica que deba ser server-side (scoring consistente, cron de renovaciones/captura, generación con IA). CRUD simple sigue cliente→Supabase con RLS.
- **Frontera de tablas:** prohibido en código CRM cualquier `.from('organizations')`, `.from('subscriptions')`, `.from('plans')`, `.from('sellers*')`, `.from('organization_commission_rates')` (PayFac/plataforma), `.from('payout*')`. Linter/review deben rechazarlo. Si algún flujo necesita saber algo de plataforma, es una feature del super admin.
- **Moneda:** quitar "COP" hardcodeado; default = moneda de la organización (`organization_settings`).

### 3.3 Convención de `stages.exit_criteria` (jsonb)

```jsonc
{
  "required_fields": ["amount", "expected_close_date"],          // columnas de opportunities
  "required_customer_fields": ["company_name", "phone"],          // columnas de customers
  "required_activities": [ { "type": "call", "count": 1 } ],      // mínimo de actividades registradas
  "require_discovery": false,                                     // discovery_data no vacío
  "min_score": 51                                                 // score_total >= 51 (opcional)
}
```
El validador (`stageGateService`) devuelve `{ ok, missing[] }`. En el Kanban: si `!ok` → dialog lista lo faltante y permite **avanzar igual con confirmación** (soft-gate, registra override en metadata). Bloqueo duro será un toggle futuro por organización.

Escalas canónicas que se fijan en FASE 0: `probability` = 0–100 (entero), `position` = entero creciente (se elimina cualquier uso de `display_order`), `status` = `'open' | 'won' | 'lost'`.

### 3.4 Matriz de integración total (BD + Backend + UI)

> Responde a la pregunta "¿el flujo queda completo, todo se conecta con todo?". Cada costura se cierra en una fase concreta y en las tres capas.

| # | Conexión | Estado hoy | Qué falta (capas) | Se cierra en |
|---|---|---|---|---|
| 1 | CRM ↔ Clientes | ✅ Bidireccional (`customer_id`, tabs en ficha 360°) | Mantener | — |
| 2 | CRM ↔ Tareas/Actividades/Notas | ✅ Completo (polimórfico) | Mantener + registrar `last/next_contact_at` automáticamente al crear actividad | F1 (backend hook en activityService) |
| 3 | CRM ↔ Cotizaciones/Propuestas | ❌ Sin vínculo | BD: `quotations.opportunity_id` · UI: selector en Nueva cotización + botón "Generar propuesta" en oportunidad · Backend: prefill de líneas | F1/F3 |
| 4 | CRM ↔ Facturas/CxC | ❌ Won no genera nada | BD: `invoice_sales.opportunity_id` · Backend: modal de cierre llama `convertToInvoice()` · UI: modal Won encadenado | F3 |
| 5 | CRM ↔ Inventario | ❌ Sin reserva | Backend (opcional por org): al ganar con productos → reservar stock / sugerir compra · UI: toggle en modal de cierre | F3 |
| 6 | CRM ↔ POS/Ventas | ❌ Una vía rota | Backend: venta cerrada crea actividad `purchase` del cliente · Reporte: ventas reales vs pipeline pronosticado (RPC) | F2 |
| 7 | CRM ↔ PMS/Reservas | ❌ Sin conversión | Backend: oportunidad ganada con `opportunity_spaces` → crear `reservations` · UI: acción en modal de cierre (si módulo activo) | F3 |
| 8 | CRM ↔ PM/Proyectos | ❌ Sin puente | BD: `opportunities.project_id` · Backend/UI: "Crear proyecto" desde cierre (plantilla) para implementaciones | F4 |
| 9 | CRM ↔ Calendario | ❌ Actividades fuera del calendario | Backend: actividad con fecha → evento en `calendar_unified` (crear/editar/borrar) · UI: aparece en calendario existente | F2 |
| 10 | CRM ↔ Chat/Conversaciones | ❌ Chat no sabe del deal | BD: `conversations.opportunity_id` · UI: badge "Deal abierto" en conversación + acceso rápido; lead automático desde webhook | F1/F2 |
| 11 | CRM ↔ Timeline global | 🟡 Cliente sí, global no | UI: `/app/timeline` consume `activities` comerciales | F2 |
| 12 | CRM ↔ Notificaciones | 🟡 Solo cambio de etapa | Backend: eventos nueva opp / estancada (sla_days) / tarea vencida / won / lost → `notifications` | F1–F2 |
| 13 | CRM ↔ Reportes cruzados | 🟡 Solo internos | Backend: RPCs funnel-real (stage_history × ventas × facturación) · UI: dashboard | F2/F5 |

Regla: ninguna conexión se considera "lista" hasta que sus capas BD + backend/UI estén desplegadas juntas en su fase.

---

## 4. FASE 0 — Higiene de datos (días 1–3)

> Sin esto, toda métrica nueva miente. No agrega features: deja el suelo firme.

### 4.1 Bugs a corregir

| # | Bug | Fix |
|---|---|---|
| B1 | Doble escala `probability` (0–1 vs 0–100 según inicializador) | Migración normalizadora + escala canónica 0–100 + corregir `PipelineInitializer.tsx` y `kanbanService` |
| B2 | 3 sets de etapas default contradictorios | Un único `ensureDefaultPipeline()` (server-side, idempotente, lee plantilla semilla). Eliminar creación client-side en `PipelineInitializer` |
| B3 | 5 creadores de oportunidad + inline en PipelineView | Dejar UNO (`NewOpportunityForm`). Borrar modales duplicados y el form inline |
| B4 | `markAsLost` persiste label español | Persistir `value`; label solo para UI |
| B5 | ~~Join `customers!inner(first_name,last_name)`~~ **FALSO POSITIVO descartado**: verificado contra BD live y código — `customers` tiene `first_name`, `last_name` Y `full_name`; `CRMDashboardService.ts:424` es correcto | Ninguno — no tocar |
| B6 | Merge de clientes hace UPDATE inválido sobre tabla polimórfica y traga el error | Repuntear vía `related_type/related_id` correctamente + propagar errores reales |
| B7 | `commissionsService.getOrgId()` lee org desde localStorage (`organizacionActiva`/`currentOrganizationId`) en vez de `useOrganization()` | Migrar al hook compartido; mismo anti-patrón detectado en kanbanService/AutomationsView |
| B8 | `crm/reportes/ReportesService.ts:153,155,179` ordena etapas por `display_order`, columna que no existe en el esquema (la real es `position`) | Reemplazar por `position`; tras el fix, `grep -r display_order src/` debe devolver 0 resultados |

### 4.2 Limpieza de código muerto

Eliminar: `ClientsViewRefactorizado.tsx`, `EmailNotifications.{ts,tsx}` (dejar uno), `KanbanSummary.d.ts`/`KanbanColumn.d.ts`, `ForecastChart` duplicados (pronostico/ vs pipeline/), huérfanos `ConfiguracionHub.tsx` y `CustomersList.tsx`, traducciones de statuses inexistentes en `crmTranslations.ts`, lectura de org por localStorage.

### 4.3 Definition of Done

- [ ] Todas las `probability` en 0–100 y el forecast pondera correcto
- [ ] Crear pipeline nuevo produce SIEMPRE las mismas etapas semilla
- [ ] Un solo path de creación de oportunidades
- [ ] `npm run lint` y `tsc --noEmit` limpios
- [ ] 0 referencias a código eliminado

---

## 5. FASE 1 — Esqueleto comercial (semana 1)

> Objetivo: que el embudo exista como DATOS: origen, contacto, calificación mínima, pérdida estructurada, criterios de etapa, e histórico para medir ciclos.

### 5.1 Migración SQL completa

```sql
-- ============ EXTENSIONES ============
alter table pipelines
  add column if not exists pipeline_type text not null default 'sales';
  -- valores: 'sales' | 'renewal' | 'expansion' | 'onboarding'

alter table stages
  add column if not exists exit_criteria jsonb not null default '{}',
  add column if not exists is_won  boolean not null default false,
  add column if not exists is_lost boolean not null default false,
  add column if not exists sla_days integer;             -- días máx. sin actividad en la etapa

alter table opportunities
  -- clasificación
  add column if not exists record_type text not null default 'deal',   -- 'lead' | 'deal'
  add column if not exists source text,                 -- meta_ads|google_ads|web|whatsapp|referido|partner|prospeccion|evento|otro
  add column if not exists vertical_id uuid,
  -- calificación
  add column if not exists score_total integer,
  add column if not exists score_data jsonb default '{}',
  add column if not exists temperature text,            -- cold|warm|hot (derivado de score)
  -- seguimiento
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_contact_at timestamptz,
  add column if not exists contact_channel text,
  add column if not exists contact_result text,
  add column if not exists objection text,
  -- closed-lost estructurado
  add column if not exists loss_reason_value text,      -- value del catálogo (B4)
  add column if not exists competitor_name text,
  add column if not exists competitor_price numeric(14,2),
  add column if not exists missing_features text[],
  add column if not exists recontact_at date,
  -- vínculos internos
  add column if not exists parent_opportunity_id uuid references opportunities(id),
  add column if not exists billing_cycle_months integer; -- para generar renovación genérica

create index if not exists idx_opps_next_contact on opportunities (organization_id, next_contact_at)
  where status = 'open';
create index if not exists idx_opps_record_type on opportunities (organization_id, record_type);

alter table quotations
  add column if not exists opportunity_id uuid references opportunities(id),
  add column if not exists sections_json jsonb;         -- narrativa de propuesta (Fase 3)

-- ============ TABLAS NUEVAS (5 — incluye vendor_commission_rates movida aquí desde Fase 5 por prioridad del dueño) ============
-- Convención de nombres: SIN prefijo "crm_" (decisión explícita del dueño).
-- Verificado contra las 372 tablas live: ningún nombre colisiona.
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

create table if not exists loss_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id integer references organizations(id), -- null = seed global
  value text not null,          -- price|competitor|budget|timing|no_response|requirements|product|implementation|decision_maker|other
  label_es text not null,
  label_en text,
  category text,
  sort_order integer default 0,
  is_active boolean default true
);

create table if not exists scoring_configs (
  organization_id integer primary key references organizations(id),
  config jsonb not null,        -- criterios GOC: [{key,label,question,type,weight,options}]
  threshold_cold integer default 30,
  threshold_warm integer default 51,
  threshold_hot integer default 71,
  updated_at timestamptz default now()
);

-- Comisiones configurables (movida de Fase 5 a Fase 1 por petición del dueño).
-- UNA sola tabla cubre ambos casos del dueño: % por vendedor Y % general.
create table if not exists vendor_commission_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references organizations(id),
  salesperson_id uuid references profiles(id),          -- NULL = % GENERAL de la organización (default para todos)
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
-- ⚠️ NO confundir con organization_commission_rates: esa tabla es de la integración
-- PayFac/Modelo B (tarifas que la PLATAFORMA cobra a organizaciones por proveedor,
-- se accede con service-role y hace join a organizations). Territorio de plataforma:
-- el CRM no la lee ni la escribe.

-- Contenido comercial NO necesita tabla nueva: se extiende `templates`
-- (existe en producción, está VACÍA — verificado; cero riesgo de migración)
alter table templates
  add column if not exists kind text not null default 'message',
      -- message|buyer_persona|playbook|demo_script|objection|discovery_template
  add column if not exists metadata jsonb not null default '{}';
-- RLS + índices (organization_id) en cada una.
-- Nota: los objetos YA existentes con nombre crm_* (fn_reporte_crm_*, mv_crm_forecast)
-- NO se renombran: están vivos en producción. La regla aplica solo a objetos nuevos.

-- ============ HISTÓRICO DE ETAPA (métricas de ciclo) ============
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

-- ============ SINCRONÍA ETAPA ↔ STATUS ============
create or replace function fn_sync_status_from_stage() returns trigger as $$
begin
  if new.stage_id is distinct from old.stage_id then
    select case when s.is_won then 'won' when s.is_lost then 'lost' else 'open' end
      into new.status
      from stages s where s.id = new.stage_id;
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_opp_sync_status
  before update on opportunities
  for each row execute function fn_sync_status_from_stage();

-- ============ NORMALIZACIÓN PROBABILIDADES (fix B1) ============
update stages set probability = round(probability * 100) where probability between 0 and 1;
-- revisar manualmente cualquier valor ambiguo (=1) antes de ejecutar
```

### 5.2 Plantilla semilla del pipeline SaaS B2B (datos, no código)

Script idempotente que inserta (solo para la organización de GoAdmin) el pipeline "Ventas GoAdmin" con 10 etapas:

| # | Etapa | Prob | sla_days | exit_criteria resumen |
|---|---|---|---|---|
| 1 | Lead nuevo | 5 | 7 | — |
| 2 | Contactado | 10 | 5 | ≥1 actividad de contacto |
| 3 | Calificado | 20 | 7 | empresa+teléfono+sector+empleados+sedes+problema+software actual+decisor+fecha estimada |
| 4 | Discovery realizado | 30 | 10 | `require_discovery: true` |
| 5 | Demo realizada | 45 | 10 | actividad tipo reunión + next_contact_at definido |
| 6 | Propuesta enviada | 60 | 7 | ≥1 quotation vinculada |
| 7 | Negociación | 75 | 10 | — |
| 8 | Contrato/pago pendiente | 90 | 7 | — |
| 9 | Ganado (is_won) | 100 | — | — |
| 10 | Perdido (is_lost) | 0 | — | razón obligatoria (UI) |

Las demás organizaciones empiezan con el set genérico actual (ya configurable); pueden clonar plantillas más adelante (Fase 5).

### 5.3 Código

**Servicios** (`src/lib/services/crm/`):
- `stageGateService.ts` — evalúa `exit_criteria` contra la oportunidad (+customer +actividades); devuelve `{ok, missing[]}`.
- `lossReasonService.ts` — catálogo (global+org) y guardado estructurado.
- `scoringService.ts` — calcula `score_total` desde `scoring_configs` + respuestas; deriva `temperature`.
- `commissionService.ts` — dos responsabilidades sobre infraestructura EXISTENTE:
  1. **Config (lectura):** cadena única de resolución — override en la oportunidad → tasa vigente del vendedor (`vendor_commission_rates` con `salesperson_id` NOT NULL) → % general de la org (fila con `salesperson_id IS NULL`).
  2. **Devengo (escritura):** al ganar oportunidad (o pagar su factura), INSERTA en el ledger existente `commissions` con `source_type='opportunity'`, `commission_type='salesperson'`, `status='accrued'`, `base_amount/rate/amount`. Cero UI nueva de pagos: aparece automáticamente en `/app/finanzas/comisiones` y fluye a nómina (payroll ya lee esa tabla).
  - Hoy el ledger `commissions` lo alimentan POS (`posService`, `pedidosService`), facturas venta (`NuevaFacturaForm`) y compras (`FacturasCompraService`); CRM añade la fuente que falta.
- `followupService.ts` (v1) — query de "vencidos hoy": `next_contact_at <= hoy OR días en etapa > sla_days`.
- `seedPipelines.ts` — plantillas semilla idempotentes.

**Componentes** (`src/components/crm/`):
- `StructuredLossDialog.tsx` — reemplaza `LossReasonDialog`: catálogo + competidor + precio + features faltantes + fecha recontacto.
- `GateWarningDialog.tsx` — en drag del Kanban: lista criterios incumplidos, permite avanzar confirmando (soft-gate).
- `ScoreBadge.tsx` + `TemperatureDot.tsx` — sobre `OpportunityCard`.
- Campos nuevos en formulario único: `source`, `vertical_id`, `next_contact_at`.
- `ImportLeadsCsv.tsx` — importa prospectos actuales (nombre, email/teléfono, fuente, monto estimado). Activa el stub TODO de import de `/app/crm/oportunidades`.

**Configuración central** (tab CRM de `/app/configuracion`, cards→modal):
- Card "Verticales" → CRUD `verticals`
- Card "Razones de pérdida" → CRUD `loss_reasons`
- Card "Scoring (GOC)" → editor de criterios/pesos/umbrales
- Card **"Vendedores y comisiones"** → % general editable inline + overrides por vendedor con vigencias + simulador (movida aquí desde Fase 5 por prioridad del dueño)
- Card "Etapas y criterios" → abre el StageManager existente + editor de `exit_criteria` por etapa

### 5.4 Definition of Done

- [ ] Tu pipeline SaaS visible en el Kanban con tus datos reales importados (mínimo 10 oportunidades vivas)
- [ ] Arrastrar una tarjeta sin cumplir criterios muestra el warning con lo faltante
- [ ] Perder una oportunidad exige catálogo + (si competitor) nombre/precio
- [ ] `opportunity_stage_history` registra cambios automáticamente
- [ ] Cotización puede vincularse a oportunidad desde ambos lados

---

## 6. FASE 2 — Flujo vivo (semana 2)

> Objetivo: que el embudo se llene solo y que nadie olvide a quién contactar.

### 6.1 Captura automática de leads

Los webhooks Twilio/Meta ya crean conversaciones+clientes. Agregar en ese punto:

```ts
// tras crear/identificar al customer entrante
await ensureLeadOpportunity({
  customerId, source: channel /* whatsapp|meta|web_widget */,
  recordType: 'lead',
});
```
Reglas: 1 oportunidad abierta por customer (dedupe); si ya existe deal abierto, crear actividad en vez de nueva oportunidad. Aplica también al widget web del chat. Resultado: **el marketing alimenta el pipeline sin trabajo manual.**

### 6.2 Página "Hoy" (`/app/crm/hoy`)

Lista accionable única:
1. Contactos vencidos: `next_contact_at <= now`
2. Estancadas: `sla_days` de la etapa excedido sin actividades
3. Leads sin primer contacto (>48h)
Cada fila: botones WhatsApp/Llamar/Email (reusa quick replies y servicios existentes) + "programar próximo contacto" (actualiza `next_contact_at`). Esta página sustituye el motor de secuencias hasta Fase 5.

### 6.3 Scoring manual GOC

En el drawer de la oportunidad: sección "Calificación" con preguntas del `scoring_configs` (G/O/C/T), guarda `score_data`, calcula `score_total`, colorea badge (frío/nurturing/oportunidad/alta/🔥). Al pasar umbral warm sugiere mover a "Calificado".

### 6.4 Funnel real

Dashboard: conversión por etapa usando `opportunity_stage_history` (lead→deal, tiempo medio por etapa, cuellos de botella). Reemplaza el funnel decorativo actual basado en probabilidades.

### 6.5 Definition of Done

- [ ] Un mensaje de WhatsApp nuevo genera lead en el Kanban con source correcto
- [ ] La página "Hoy" muestra tu lista real del día y permite reprogramar en 1 click
- [ ] Score GOC visible y persistido en al menos el 80% de oportunidades abiertas
- [ ] Funnel muestra conversiones reales por etapa con tiempos

---

## 7. FASE 3 — Cierre conectado al dinero (semanas 3–4)

> Objetivo: propuesta con narrativa de valor, y que ganar una venta produzca documentos y trazabilidad financiera.

### 7.1 Propuestas = cotizaciones narradas (sin tablas nuevas)

Extensión ya aplicada en Fase 1 (`quotations.opportunity_id`, `sections_json`). Builder v1:
- Desde la oportunidad: botón "Generar propuesta" → prefill de quotation con líneas desde `opportunity_products/custom_lines` + secciones narrativas editables (`situacion_actual`, `problemas`, `solucion`, `roi_estimado`, `proximo_paso`) guardadas en `sections_json`.
- PDF/email: reusa la infraestructura existente de cotizaciones (numeración COT-%, plantilla, envío).
- Al enviar: actividad automática "Propuesta enviada" + `next_contact_at = +24h` + sugerencia de mover a etapa 6.

### 7.2 Modal de cierre (Won)

Al marcar ganada (o arrastrar a etapa is_won), modal con acciones encadenadas:
1. Generar factura desde la última cotización (reusa `convertToInvoice()` existente) y guardar `invoice_sales.opportunity_id` (columna nueva, migración de esta fase)
2. Registrar referencia comercial opcional (nota: nombre/NIT/contacto del cliente nuevo — la creación del tenant ocurre por signup normal y se gestiona en super admin, nunca desde el CRM). El deal YA está ligado a su `customers.customer_id`: esa es la única relación necesaria. La correspondencia cliente↔organización-plataforma (si algún día se necesita) se resuelve fuera del CRM por NIT/email, en super admin
3. Crear oportunidad hija de **Onboarding** (Fase 4 usa esto)
4. Programar renovación si `billing_cycle_months` definido
5. Pedir referido (tarea + plantilla de mensaje) — se activa post-30-días vía tarea, no inline

Lost ya quedó estructurado en Fase 1.

### 7.3 Definition of Done

- [ ] Ciclo completo demostrable: lead capturado por WhatsApp → … → propuesta PDF enviada → ganada → factura generada → oportunidad de onboarding creada
- [ ] `invoice_sales.opportunity_id` poblado en ventas cerradas desde CRM
- [ ] Tiempo de ciclo (lead→won) medible desde `opportunity_stage_history`

---

## 8. FASE 4 — Post-venta (mes 2)

> Objetivo: cliente activo, salud visible, renovación anticipada y expansión sistemática — reutilizando pipelines.

### 8.1 Onboarding como pipeline

- Plantilla: `onboarding_templates` (jsonb: pasos día 0–30) por organización.
- Instancia = **oportunidad** con `parent_opportunity_id` en pipeline `pipeline_type='onboarding'` (etapas: Kickoff → Configuración → Importación → Capacitación → Uso asistido → Revisión 14d → Business Review 30d). Cero UI nueva: Kanban existente + checklist ligada a tareas.
- La ficha del handoff vive en la propia oportunidad (discovery_data + productos + notas heredadas del deal padre).

### 8.2 Health score de clientes (CRM)

```sql
create materialized view mv_customer_health as
select c.organization_id, c.id customer_id,
       count(s.id) filter (where s.created_at > now() - interval '90 days') purchases_90d,
       extract(day from now() - max(s.created_at)) recency_days,
       coalesce(sum(s.total), 0) ltv_total,
       avg(s.total) avg_ticket,
       (select count(*) from accounts_receivable ar
         where ar.customer_id = c.id and ar.status <> 'paid') outstanding_count
from customers c left join sales s on s.customer_id = c.id
group by c.organization_id, c.id;
```
(refinar joins a `sales`/`invoice_sales` según esquema real; refresh horario vía pg_cron o ruta cron `/api/crm/health/recalculate`)
- Histórico (tendencia de salud): el mismo cron que refresca la MV escribe snapshots:
```sql
create table if not exists health_score_snapshots (
  id bigint generated always as identity primary key,
  organization_id integer not null references organizations(id),
  customer_id uuid not null,
  score integer not null,
  band text,                    -- green|yellow|red
  indicators jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists idx_hss_customer on health_score_snapshots (organization_id, customer_id, created_at desc);
```
Permite ver si un cliente está empeorando ciclo tras ciclo (sparkline en ficha + alerta "rojo N ciclos seguidos"). Sin esto la MV solo da foto fija.
- `health_score_configs` (jsonb por org: indicadores activos + pesos + umbrales 🟢🟡🔴). Default razonable semillado; el restaurante pesa recencia, el mayorista peso de saldo, etc.
- **Posicionamiento (confirmado por el dueño):** este health es GENÉRICO — cualquier organización ve la salud de SUS clientes aquí. La salud de las organizaciones como clientes de GoAdmin vive SOLO en go-admin-super y se mejora allá. Son productos distintos que comparten principio (indicadores configurables + pesos), no código compartido.
- UI: gauge por cliente en su ficha 360° + panel de alertas (rojos) accesible desde el dashboard CRM. Configuración en tab CRM central ("Post-venta").

### 8.3 Renovaciones

- **Mecanismo genérico (todas las organizaciones):** deals ganados con `billing_cycle_months` definen su ciclo. Ruta cron `/api/crm/renewals/sync` crea/actualiza oportunidades en pipeline `pipeline_type='renewal'` con hitos 120/90/60/30/15/7 días antes del vencimiento como `next_contact_at`. Funciona igual para un gimnasio (mensual) que para GoAdmin (anual).
- **Renovación de TENANTS de la plataforma (organizaciones clientes de GoAdmin):** es funcionalidad del super admin, fuera de este plan. El CRM de la organización GoAdmin solo gestiona renovaciones comerciales que ella misma registre como cualquier otra empresa.
- Nunca duplicar estados: cada org es fuente de verdad de SUS renovaciones; nada se sincroniza con plataforma.

### 8.4 Expansión

Pipeline `type='expansion'` + `deal_type` (cross-sell/upsell/nueva sucursal/módulo). Señales automáticas desde datos propios: cliente saludable + sin actividad de expansión → tarea sugerida; crecimiento de compras vs periodo anterior → oportunidad de upsell candidata.

### 8.5 Definition of Done

- [ ] Deal ganado produce instancia de onboarding navegable en su propio Kanban
- [ ] Panel de salud marca clientes rojos con causa principal (recencia/saldo/caída)
- [ ] Renovaciones con hitos automáticos (120/90/60/30/15/7 días) para deals con ciclo definido
- [ ] Primer deal de expansión creado desde señal de salud

---

## 9. FASE 5 — Escala (mes 3+)

1. **Secuencias completas** (ahora sí): `followup_sequences/steps/instances` + cron que crea actividades según plantilla por etapa. Solo si la página "Hoy" demuestra volumen que el manual no cubre.
2. **Referidos y canal indirecto POR ORGANIZACIÓN** (conceptos separados — nunca confundir):

   | Mundo | Dónde vive | Datos |
   |---|---|---|
   | Vendedores de la PLATAFORMA GoAdmin | go-admin-super (fuera de este plan) | `sellers`, `seller_referrals`, `seller_commissions` + payouts Stripe |
   | Vendedores de CADA organización | ERP (este plan) | `profiles` con rol comercial dentro de la org, `salesperson_id` en oportunidades/ventas/reservas |

   - Programa de referidos genérico: `referral_programs` (jsonb: incentivo/elegibilidad — ej. 1 mes gratis tras 30 días de cliente saludable) + tabla `referrals` (origin_customer_id, referred_customer_id/opportunity_id, estado, recompensa). Todo con `organization_id`.
   - Partner externo de una organización (distribuidor, agencia): entidad `partners` por org con nivel simple (metadata) — NO toca `sellers` del super admin jamás.
   - Si GoAdmin quiere partner-program a nivel plataforma, es trabajo del super admin, separado.

3. **Métricas comerciales avanzadas**: RPC `fn_comercial_metrics` (win rate, cycle length, ARPA, pipeline coverage, proyección). Las métricas SaaS de plataforma (MRR, ARR, churn de organizaciones) viven en go-admin-super, no aquí. Dashboard por vendedor.
4. **IA comercial** (OPENAI_API_KEY ya existe): recomendador de próxima acción (reglas + LLM), resumen de discovery/llamadas, clasificación de objeción desde la nota. Endpoints `/api/crm/ia/*`.
5. **Plantillas de pipeline por vertical** compartibles entre organizaciones (marketplace interno de templates).
6. **i18n del módulo CRM** (hoy hardcoded español) hacia `messages/{es,en,fr,pt}.json`.

---

## 10. Roadmap resumen

| Fase | Cuándo | Esfuerzo | Valor | Entregable estrella |
|---|---|---|---|---|
| 0 Higiene | días 1–3 | Bajo | Alto (confiabilidad) | Forecast honesto + 1 solo form |
| 1 Esqueleto | semana 1 | Medio | Alto | Pipeline SaaS con TUS prospectos reales + gates |
| 2 Flujo vivo | semana 2 | Medio | Muy alto | Leads automáticos + página "Hoy" |
| 3 Dinero | semanas 3–4 | Medio | Muy alto | Propuesta→factura en un clic |
| 4 Post-venta | mes 2 | Alto | Alto (retención) | Onboarding kanban + salud + renovaciones |
| 5 Escala | mes 3+ | Según demanda | Escala | Secuencias, partners, IA |

Regla de corte: **no se inicia una fase con la anterior incompleta en producción.**

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Soft-gates ignorados → pipeline falso otra vez | Reporte semanal "% etapas avanzadas con override"; endurecer por org cuando madure |
| Triggers (history/status-sync) chocan con código que setea status manualmente | Auditar `updateOpportunity({status})` y unificar: status SOLO derivado de etapa |
| MV de health desfasada | Refresh programado + botón "recalcular" + timestamp visible en UI |
| Datos históricos sin source/score | Import CSV los rellena; reportes filtran "sin clasificar" para empujar higiene |
| Alcance de Fase 4 se infla | Onboarding/health/expansión salen SOLO tras tener 20+ deals cerrados fluyendo |

---

## 12. Orden de ejecución sugerido (esta semana)

1. Migración Fase 0 (normalización probability) + fixes B2–B6 en código
2. Migración Fase 1 (extensiones + 4 tablas + triggers + índices + RLS) vía MCP
3. Seed: pipeline "Ventas GoAdmin" 10 etapas + razones de pérdida globales
4. `StructuredLossDialog` + campos nuevos en formulario único + GateWarningDialog + card "Vendedores y comisiones" (config central)
5. Import CSV de prospectos reales → Kanban vivo
6. `quotations.opportunity_id` en UI (selector en Nueva cotización + botón "Propuesta" en oportunidad)

Con eso, en una semana tienes: proceso real configurado, datos reales fluyendo, pérdidas medibles y dinero conectado. Las fases 2+ se planifican con esa base andando.

---

*Fin del Plan V2. Este documento reemplaza, para efectos de implementación, la sección de fases de ANALISIS-Y-RECOMENDACIONES.md (que conserva valor como inventario/diagnóstico).*
