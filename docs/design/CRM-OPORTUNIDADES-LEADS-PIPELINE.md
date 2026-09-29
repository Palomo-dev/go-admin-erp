# CRM — Oportunidades, leads y pipeline: análisis y propuesta (2026-09-23)

Archivo de Figma `EAvjINVRnlzFM70GVoWXgl`. Proyecto Supabase `jgmgphmzusbluqhuqihj` (solo `SELECT`,
agregados). Complementa, no repite, la auditoría control por control
[`AUDITORIA-CONTROLES-CLIENTES-CRM.md`](AUDITORIA-CONTROLES-CLIENTES-CRM.md) §C (CA lista, CB detalle,
CC formulario, CD pipeline): cada botón, texto y toast ya está allí con archivo:línea. Aquí va lo que
esa auditoría no cubre: base de datos, puntos de entrada, duplicados, errores de lógica, plan de
centralización y la propuesta de diseño.

No contradice el plan V4 del CRM (`docs/crm-revenue-os/PROGRESS.md`, todas las fases aprobadas). Las
decisiones que se respetan están en §7.1.

## 0. Estado del encargo

| Parte | Estado |
|---|---|
| Análisis de interfaz, backend y BD | **Hecho** (este documento) |
| Inventario de puntos de entrada y duplicados | **Hecho** (§4) |
| Diseño en Figma (pantallas, componentes, frame «Puntos de entrada») | **No empezado.** El cupo del MCP de Figma estaba agotado desde la primera llamada (`get_metadata` y `use_figma` devolvieron «tool call limit»). No se creó, movió ni editó ningún nodo |
| Chequeo por script, capturas `45-crm-*.png` | **Pendiente**, depende del diseño |
| Especificación del diseño, lista para dibujar | **Hecha** (§6), incluido `CustomerLinkPicker` |
| Ampliación: acciones rápidas, página Actividades, entradas de la ficha del cliente | **Análisis y plan hechos** (§11); diseño pendiente del cupo |

Node ids: ninguno todavía. Los únicos nodos existentes que la propuesta reutiliza son los ya
documentados por otros agentes: `AppHeader` `45:2224`, `MobileHeader` `48:2550`, `Badge` `7:70`,
`MenuItem` `10:239` y `TaskQuickView` `626:14723` (del agente de PM; ver
`SHELL-MOVIL-Y-DETALLES.md`). `TaskRow` **no existe** ni en código ni en los documentos de diseño: es
del agente de PM y la propuesta solo lo instancia.

## 1. Los errores más graves (resumen)

Ordenados por daño real. Detalle y evidencia en §5.

1. **Editar una oportunidad borra sus líneas.** `updateOpportunity` borra productos, espacios y
   conceptos y los vuelve a insertar enviando `total_price`, que en las tres tablas es
   `GENERATED ALWAYS` (verificado en BD). El insert falla y el error no se revisa.
   `opportunitiesService.ts:364-406`.
2. **Cada guardado del formulario corre las fechas un día hacia atrás.** `expected_close_date`
   (`date`) se lee con `new Date('YYYY-MM-DD')` (UTC) y se vuelve a formatear en hora local
   (`OpportunityForm.tsx:94-95`, `:386-387`). `next_contact_at` (`timestamptz`) se guarda como
   `YYYY-MM-DD` desnudo, medianoche UTC (`:394`).
3. **«Marcar ganada» de la lista cierra sin ficha de venta y sin mover de etapa.** `markAsWon` hace
   solo `update({status:'won'})` (`opportunitiesService.ts:448-450`). Salta la regla que exige
   `win_data`, y el trigger de comisión puede devengar sobre una venta vacía. Hay 1 oportunidad ganada
   sin `win_data` en BD.
4. **Leads web en el pipeline equivocado.** `web_capture_lead` usa el pipeline `is_default` o, si no
   hay, el más antiguo, **sin filtrar `pipeline_type`**. En BD, 23 de los 42 leads están en un
   pipeline de **onboarding** (una organización sin pipeline por defecto). Ninguna ruta de creación
   del código filtra el tipo de pipeline.
5. **El formulario no encuentra clientes en organizaciones grandes.** `getCustomers()` trae todos los
   clientes sin paginar (`opportunitiesService.ts:76-98`) y el selector filtra en memoria. PostgREST
   corta en 1.000 filas: 4 organizaciones pasan de 1.000 clientes (la mayor, 18.063).
6. **KPI «Monto Ponderado» inflado 100×** e incluye ganadas y perdidas
   (`opportunitiesService.ts:526-529`: `amount × probability` con probabilidad 0-100).
7. **Permisos por nombre de rol**, prohibido por CLAUDE.md regla 6:
   `stagePermissions.ts:35-42` (`'Super Admin'`, `'Admin de organización'`, `'Manager'`). La BD usa
   ids cableados (`fn_stages_guard_outcome_flags`: `role_id in (1,2,5)`; conversión de lead:
   `isOrgAdmin` con role_id 1-2).
8. **Tres caminos distintos para ganar/perder** (lista, detalle, tablero), dos diálogos de pérdida
   (`LossReasonDialog` con 7 motivos cableados y `StructuredLossDialog` con catálogo), y
   `markAsLost` **reemplaza todo `metadata`** (`opportunitiesService.ts:477-490`), borrando
   `gate_overrides` y datos de onboarding/renovación.
9. **Moneda.** La BD pone `'USD'` por defecto; el código cablea `'COP'` en 6 sitios; el formulario
   solo ofrece COP/USD/EUR; `useOrgCurrency` existe y ningún componente del CRM lo usa. Los totales de
   columna del tablero suman importes en monedas distintas.
10. **Dueño casi nunca asignado.** 67 de 69 oportunidades tienen `salesperson_id` nulo: el formulario
    no tiene campo «Responsable» (el único selector es «Comisionista»), y solo la API de leads
    autoasigna.

## 2. Modelo de datos real (verificado con `information_schema`)

**No existe tabla `leads`.** Un lead es una fila de `opportunities` con `record_type='lead'`;
convertirlo es cambiar a `'deal'`. «Lead» tiene además un segundo significado:
`customers.lifecycle_stage='lead'` (34.233 clientes, contra 42 leads en `opportunities`). La página
Leads solo muestra los segundos.

| Tabla | Columnas que importan al diseño | Notas |
|---|---|---|
| `opportunities` | `name`, `pipeline_id`!, `stage_id`!, `customer_id`, `amount`, `currency` (default **USD**), `expected_close_date` (**date**), `status` open/won/lost, `record_type` lead/deal, `salesperson_id`, `commission_rate/type`, `source`, `vertical_id`, `next_contact_at` (**timestamptz**), `temperature`, `score_total`, `icp_fit_score`, `loss_reason`, `loss_reason_value`, `competitor_name/price`, `missing_features[]`, `recontact_at`, `win_data`, `closed_at`, `deal_type`, `parent_opportunity_id`, `sales_team_id`, `territory_id`, `branch_id`, `discovery_data`, `metadata` | 69 filas, 6 organizaciones. Sin columna de probabilidad propia: sale de la etapa |
| `pipelines` | `name`, `is_default`, `pipeline_type` sales/onboarding/renewal, `goal_amount`, `goal_period`, `goal_currency` (default USD) | 2 organizaciones sin pipeline por defecto |
| `stages` | `position`, `probability` 0-100, `color`, `sla_days`, `exit_criteria`, `is_won`, `is_lost` | 14 ganadoras, 11 perdedoras. `is_won/is_lost` son la fuente de verdad (plan V4) |
| `opportunity_products` / `_spaces` / `_custom_lines` | cantidad o noches, `unit_price`, `total_price` **GENERATED** | 5 / — / 0 filas |
| `opportunity_stage_history` | `from_stage_id`, `to_stage_id`, `changed_by`, `changed_at` | **0 filas**, aunque 9 oportunidades están fuera de su primera etapa y el trigger es del esquema base |
| `loss_reasons` | `code`, `label`, `is_global`, `sort_order` | 8 globales, 0 por organización |
| `activities` | `activity_type`, `related_type/id`, `occurred_at`, `channel`, `outcome` | 52 de oportunidades |
| `tasks` | `related_to_type/id`, `customer_id`, `project_id`, `goal_id`, `key_result_id`, `due_date` (timestamptz) | **La misma tabla del PM.** `related_to_type` mezcla `'cliente'` (13) y `'customer'` (2) |
| `notes` | `related_type/id`, `is_pinned` | Tabla propia (decisión V4) |
| `quotations` | `opportunity_id`, `sections_json` | La «propuesta» del CRM |
| `invoice_sales` / `sales` | `opportunity_id` | Se llenan al ganar (`wonCloseSteps.ts`) |
| `sales_targets` | cuota por usuario y periodo | 0 filas |
| `goals` | metas del PM | **Sin relación con el CRM**; solo vía `tasks.goal_id` |
| `crm_events` | cola de eventos | Solo `opportunity.created` (45). Nunca un `stage_changed` |
| `customer_company_links` | `person_id`, `company_id`, `position`, `is_primary`, UNIQUE(persona, empresa) | 11 vínculos. Sin CHECK persona≠empresa ni de tipo, ni «un solo principal por empresa» |

**Triggers en `opportunities`** (todos activos): `trg_set_branch_from_org` (sucursal por defecto),
`trg_opp_created_enqueue` y `trg_opp_stage_change_enqueue` (cola `crm_events`),
`trg_opp_stage_history`, `trg_sync_status_from_stage` (una etapa ganadora solo cierra con
`win_data`; una perdedora, solo con motivo), `trg_opportunities_closed_at`,
`trg_sync_customer_lifecycle` (lead→opportunity→customer, **solo en UPDATE**),
`trg_create_commission_on_opportunity_won`, `trg_notify_opportunity_changed`, y **dos** triggers de
`updated_at` duplicados (`set_opportunities_timestamp` y `set_opportunities_updated_at`).

**RPC de cambio de etapa: 11 variantes** (`update_opportunity_stage`, `_safe` ×2,
`_without_refresh`, `direct_update_opportunity`, `_bypass`, `_stage`, `fix_update_opportunity_stage`,
`update_stage_bypass`, …). El código vivo usa solo `PATCH /api/crm/opportunities/[id]/stage` →
`opportunityStageService.changeStage`. Seis de esas funciones siguen ejecutables por
`authenticated`.

## 3. Cómo funciona hoy cada página

Todo el CRM de estas pantallas lee y escribe con el **cliente de navegador**
(`@/lib/supabase/config`). Solo pasan por el servidor el cambio de etapa, los leads y la conversión.

| Página | Qué muestra y de dónde sale | Acciones y cómo persisten | Roto o engañoso |
|---|---|---|---|
| **Oportunidades** `/app/crm/oportunidades` | 8 KPI (`OpportunitiesStats`), filtros (pipeline, etapa, estado, cliente, rango de cierre), tabla de 7 columnas sin paginación. 5 consultas por carga: `getStats` vuelve a traer todo (`opportunitiesService.ts:518`) | Ver, editar, duplicar, ganar, perder, eliminar (`confirm()` nativo). Exportar/Importar son toasts «TODO» (`page.tsx:198-212`) | Ponderado ×100; búsqueda sin debounce y sin escapar `%`/`_` (`:196`); leads y deals mezclados (nadie filtra `record_type`); borrar deja tareas y notas huérfanas; «Duplicar» un lead crea un deal |
| **Leads** `/app/crm/leads` | `GET /api/crm/leads` (servidor, 17 columnas); nombres de cliente con el cliente de navegador filtrando `branch_id` estricto (`leads/page.tsx:152-156`) | «Nuevo lead» (`NewLeadDialog` → API → `leadCreateService`), «Convertir a deal» | Muestra también ganados y perdidos aunque el título dice «sin convertir»; cliente de otra sede = «Cliente no encontrado»; la confirmación dice «lo moverá al pipeline de oportunidades» y solo cambia `record_type`; el aviso de gate imprime «Faltan: , .» (`:223`, mapea `m.label` sobre `string[]`); «Hoy/Ayer» por diferencia de 24 h en hora del navegador (`:74-86`). No hay editar, calificar, asignar, descartar ni importar |
| **Nueva / editar** `/nuevo`, `/[id]/editar` | `OpportunityForm` (1.050 líneas) | Crea con `createOpportunity` (navegador) | Errores 1, 2 y 5 de §1; cambiar de pipeline al editar guarda la etapa nueva con el pipeline viejo (`types.ts:283` no tiene `pipeline_id`); la comisión no se puede activar al editar (`commissionType` sin control, `OpportunityForm.tsx:104`); el importe ignora espacios y conceptos si no hay productos (`:377`); la etapa «inicial» incluye las de ganado/perdido; los modificadores de producto no se guardan |
| **Detalle** `/app/crm/oportunidades/[id]` | Cabecera con embudo clicable, 10 pestañas, barra lateral. Importe = suma de líneas o `amount` (`OpportunityDetail.tsx:103-104`); lista, tablero y pronóstico usan solo `amount` | Ganar/perder, editar, duplicar, eliminar, acciones rápidas, propuesta, contrato, pago | Clic en etapa ganadora puede entrar en bucle: reenvía el `win_data` viejo (`useStageFlow.tsx:61`); tras ganar desde la cabecera el estado es `won` pero la etapa no cambia; `AnalyticsTab` consulta `activities` sin filtro de organización; documentos en el bucket `crm` aquí y en `crm-documents` en el drawer |
| **Pipeline** `/app/crm/pipeline` | `PipelineView`: Kanban, Tabla, Pronóstico, Clientes, Automatización. Sondeo cada 30 s (sin realtime) | Arrastrar → `PATCH …/stage` (gate, `needs_won`, `needs_lost`); crear/borrar/marcar por defecto un pipeline **desde el navegador** (`PipelineHeader.tsx:233-313`); asignación masiva | El borrado de etapa desde la cabecera salta la API (`:295`); totales de columna en monedas mezcladas; en la tabla, el filtro «Activa» usa `'active'`, que no existe; `GoalCompletionWidget.tsx:89` pondera todo al 100 % (`stages?.[0]` sobre un objeto) y sin filtro de organización |
| `/pipeline/edit-opportunity` | Redirección heredada | — | Borrable |

**Permisos.** Ninguna página usa `usePermissions` ni oculta nada. Solo hay guardas en servidor:
override del gate y `/api/crm/stages` (por nombre o id de rol), y la conversión de leads (id de rol).
Consecuencia: todos ven «Convertir» y «Avanzar de todos modos» y un Empleado recibe 403.

**Fechas.** Correctas: `OpportunityCardV2.tsx:118`, `TableView.tsx:540`, `DrawerHeader.tsx:39`
(`formatPlainDate`), `ClosingTab.tsx:34` (`useFormatDate`). Incorrectas (`new Date('YYYY-MM-DD')`
con date-fns, un día corrido en Colombia): `DetailHeader.tsx:60`, `DetailSidebar.tsx:46`,
`AnalyticsTab.tsx:80`, `OpportunitiesTable.tsx:243`, `OpportunitiesFilters.tsx:263-306`,
`clientes/id/OportunidadesTab.tsx:176` (`formatDate` deprecated). `NotasTab.tsx:15` usa
`toLocaleString` sin zona. `TasksSection.tsx:57-60` formatea un `timestamptz` como fecha plana.

**Conexiones hoy.**
- Lead → oportunidad: mismo registro, `record_type` cambia. El cliente sube de `lead` a
  `opportunity` por trigger, pero **solo si el registro nació lead**: todo lo creado directamente
  como deal deja al cliente en `lead`.
- Oportunidad → cotización (`quotations.opportunity_id`) → factura (`invoice_sales.opportunity_id`,
  al ganar con `WonCloseModal`) → venta POS, reservas, onboarding, renovación, referido, comisión
  (7 pasos en `wonCloseSteps.ts:70-80`).
- Oportunidad ↔ tareas: tabla `tasks` compartida con el PM; el CRM crea con `crmTaskService` →
  `pmService` y abre `TaskCreationPanel` del PM en modo completo (`crm/shared/TaskDialog.tsx:23`),
  pero lista con su propio `TasksSection.tsx`.
- Pipeline ↔ metas: solo `pipelines.goal_amount` y `sales_targets` (vacía). **Ninguna relación con
  `goals` del PM.**
- `getOpportunityFinance360` (`crmFinanceService.ts:232-243`) está expuesto en
  `/api/crm/finance/[type]/[id]` y **ninguna pantalla lo usa**.

## 4. Puntos de entrada y duplicados

### 4.1 Dónde se crea una oportunidad o un lead

| # | Punto de entrada | UI | Sale como | Pipeline por defecto | Moneda | Dueño | Cliente | Vivo |
|---|---|---|---|---|---|---|---|---|
| 1 | Leads › «Nuevo lead» (`NewLeadDialog` → `POST /api/crm/leads`) | Diálogo | lead | `is_default`, luego el más antiguo (servidor) | COP (lista COP/USD/EUR/MXN) | autoasigna | obligatorio; crea uno nuevo con `lifecycle_stage='lead'` | sí |
| 2 | Referidos › «Convertir» (`convertReferral`, reutiliza 1) | Diálogo | lead | igual que 1 | COP | autoasigna | obligatorio | sí |
| 3 | Formulario web (`web_capture_lead`, RPC) | Público | lead | `is_default`, luego el más antiguo, **sin mirar el tipo** | COP cableado en SQL | ninguno | crea o reutiliza por correo | sí |
| 4 | `OpportunityForm` en `/nuevo`, en «Nueva oportunidad» del pipeline, en «+» de columna y en «Clientes» del pipeline (`CreateOpportunityDialog`, portal propio) | Página / modal | deal | `is_default`, luego **alfabético** | COP (COP/USD/EUR) | manual («Comisionista») | opcional; no crea; lista cortada a 1.000 | sí |
| 5 | Asignación masiva (`BulkActionsDialog.tsx:250-300`) | Modal | deal | `is_default` o el primero | COP | manual | uno por cliente elegido | sí |
| 6 | Llamada › «Vincular» (`CallLinkPanel` → `POST /api/crm/calls/[id]/link`) | Panel en línea | deal | elegido | COP (fallback) | **ninguno**, sin `created_by` | de la llamada; puede crear uno sin ciclo de vida | sí |
| 7 | Renovación (`renewalService.ts:324-355`) | Automático | deal | pipeline de renovación | del padre | del padre | del padre | sí |
| 8 | Onboarding (`onboardingService.ts:575-613`) | Automático | deal | pipeline de onboarding | del padre o **base de la organización** (el único correcto) | del padre | del padre | sí |
| 9 | «Duplicar» (`opportunitiesService.ts:424-446`) | Botón | **deal, aunque el original sea lead** | el original | el original | se pierde | el original | sí |
| 10 | `BulkCreateOpportunitiesDialog` | Modal | deal | elegido | elegido | — | inserta `full_name` (generada): falla | huérfano |
| 11 | `ImportLeadsCsv` | Modal | **deal** (lead solo en `metadata`) | `is_default` sin desempate | COP | — | inserta `full_name`: falla | huérfano |
| 12 | `expansionService.createExpansionOpportunity` | — | deal | expansión | COP | — | dado | sin llamadores |
| 13 | `leadCaptureService.ensureLeadOpportunity` | — | deal | `is_default` | COP | — | dado | sin llamadores |
| 14 | `pipelineService.createOpportunity` | — | — | dado | USD (default BD) | — | dado | sin llamadores; `status:'active'` viola el CHECK |

**Módulos sin punto de creación** (verificado): Finanzas (cotización y factura solo *vinculan* una
oportunidad existente: `NuevaCotizacionForm.tsx:133-143`, `NuevaFacturaForm.tsx:308-322`), Clientes
(`OportunidadesTab` es de solo lectura y su vacío no tiene botón; en la ficha CRM las filas ni
siquiera son clicables, `crm/clientes/[id]/page.tsx:403-460`), POS, chat/WhatsApp (solo enlaza a una
oportunidad abierta, `whatsapp/inboundService.ts:48-58`), GO Assistant (sin acciones de
oportunidad), Edge Functions, API públicas.

**Conclusiones.**
- Solo 1, 2 y 3 crean leads. Todo lo demás crea deals y, como el trigger de ciclo de vida corre
  solo en UPDATE, el cliente queda en `lead` para siempre.
- Tres reglas distintas de «pipeline por defecto» (servidor por antigüedad, formulario alfabético,
  CSV sin desempate) y **ninguna** filtra `pipeline_type='sales'`.
- Vocabularios de origen incompatibles: `referido`/`referral`, `phone`/`llamada_entrante`,
  `manual_erp`, `website`/`web`.
- Solo el onboarding resuelve la moneda base; el resto cablea COP.
- Ninguna ruta escribe una actividad «oportunidad creada» (la cola `crm_events` sí recibe el evento).

### 4.2 Edición: dónde se modifica una oportunidad

`OpportunityForm` modo edición; `ClosedWonDialog`, `DiscoverySection`, `FollowupSection` (vía
`updateOpportunity`); `SalesTeamTerritorySelectors.tsx:119-159` y equipo `AsignarTab.tsx:70-81`
(update directo **sin filtro de organización**); `StageSelect` → PATCH; automatizaciones
(`automation/actions.ts:410-430`), análisis de llamadas, agente de voz, ICP, discovery, seguimiento,
propuestas, objeciones y fusión de identidades escriben sus propias columnas desde el servidor.

### 4.3 Duplicados de componente (los que la centralización debe eliminar)

| Concepto | Implementaciones hoy | En qué difieren |
|---|---|---|
| Formulario de oportunidad | `OpportunityForm` (página y modal), `BulkActionsDialog`, `BulkCreateOpportunitiesDialog`, `NewLeadDialog`, `CallLinkPanel` | Campos, pipeline por defecto, moneda, dueño, creación de cliente, `record_type` (tabla 4.1) |
| Ganar | `markAsWon` directo (lista), `ClosedWonDialog` + `WonCloseModal` (detalle, drawer, tablero) | La lista no pide ficha ni mueve de etapa |
| Perder | `LossReasonDialog` (7 motivos cableados, lista) y `StructuredLossDialog` (catálogo `loss_reasons`, fallback de 8) | Motivos, «funcionalidades faltantes», scroll, y el primero borra `metadata`. El plan V4 ya lo marca pendiente (`FASE-02:8`) |
| Flujo de etapa | `useStageFlow` (detalle), `OpportunityDrawer.tsx:78-128`, `KanbanBoardV2.tsx:71-83,238-275` | Cuándo se reabre, qué `win_data` se envía, qué pasa si el PATCH falla |
| Selector de cliente | 8 componentes: `crm/oportunidades/CustomerSearchSelect` (en memoria), `finanzas/.../ClienteSelector` (consulta y vínculos empresa), `pos/CustomerSelector`, `pos/customer-selector` (huérfano), `chat/.../CustomerSelector`, `gym/CustomerSelectorGym`, `parking/CustomerSearchInput`, `transporte/envios/CustomerSearchSelect`, más la búsqueda propia de `CompanyContactsManager.tsx:150-173` | Unos buscan en servidor, otros en memoria; unos por nombre y correo, otros también por teléfono o documento; solo Finanzas y POS muestran la empresa del contacto |
| Vincular persona↔empresa | `CompanyContactsManager` (986 líneas; busca solo nombre y correo, `customer_type='person'`, 10 resultados, sin documento ni teléfono) y lecturas repetidas de `customer_company_links` en `ClienteHeader`, `InfoTab`, `ClientForm`, `clientes/page`, `ClienteSelector`, `pos/CustomerSelector` | No hay vínculo inverso (desde una persona elegir su empresa) |
| Documentos | `OpportunityDocuments` (bucket `crm`) y `DocumentUploader` (bucket `crm-documents`) | Un archivo subido en el drawer no aparece en el detalle, y al revés |
| Tareas de la oportunidad | `TasksSection` del CRM y las vistas del PM (`TaskListView`, `RelatedTasksList`) | El CRM formatea `due_date` como fecha plana |
| Cambio de etapa en BD | 11 funciones SQL + el servicio vivo | Solo el servicio respeta gate y bloqueo optimista |
| Etapas por defecto | `pipelineSeedService.ts:33-42` y `pipelineTemplates.ts:55-61` | Mismos nombres, probabilidades distintas |

## 5. Errores con evidencia

**Alta**
1. Editar borra líneas — `opportunitiesService.ts:364-406`; columnas `total_price` generadas
   (`information_schema.columns.is_generated='ALWAYS'`). Mismo defecto en `addProduct` (`:621`, sin
   llamadores).
2. Corrimiento de fechas al guardar — `OpportunityForm.tsx:94-95`, `:386-387`, `:394`,
   `:111-115`; `BulkActionsDialog.tsx:288`.
3. «Marcar ganada» sin `win_data` — `OpportunitiesTable.tsx:295-304` → `opportunitiesService.ts:448-450`.
   El plan V4 (`opportunityStageService.ts:35-38`) dice que eso se había cerrado.
4. Leads en pipeline de onboarding — función SQL `web_capture_lead` (paso 4); 23 filas en BD.
5. Clientes cortados a 1.000 — `opportunitiesService.ts:76-98`, `OpportunityForm.tsx:187-196`;
   `searchCustomers` (`:106`) existe y no se usa.
6. `markAsLost` borra `metadata` — `opportunitiesService.ts:477-490`; igual en el fallback de
   `ScoringSection.tsx:103-130` y el paso de renovación `wonCloseSteps.ts:192`.
7. Trigger de comisión: si la organización no tiene sucursal usa `branch_id := 1`, que es de
   **otra organización**, e ignora `NEW.branch_id` (`20260909045617_crm_v4_f00_32_…sql:64-66`).
8. Updates sin filtro de organización desde el navegador — `SalesTeamTerritorySelectors.tsx:119/139/159`,
   `equipo/AsignarTab.tsx:70/81`, `AnalyticsTab.tsx:25`, `GoalCompletionWidget.tsx:66-74`,
   `pipelineService.ts:61-64` (y `:100` cae a la organización `1`). RLS es la única barrera.

**Media**
9. Ponderado ×100 — `opportunitiesService.ts:526-529`.
10. `GoalCompletionWidget.tsx:89` — `stages?.[0]` sobre objeto: todo al 100 %.
11. Permisos por nombre — `stagePermissions.ts:35-42`; ids cableados en `fn_stages_guard_outcome_flags`
    y `rbac.ts:12-13`.
12. Editar pipeline guarda etapa de otro pipeline — `OpportunityForm.tsx:547-550` + `types.ts:283`.
13. Bucle en el embudo del detalle — `useStageFlow.tsx:61`.
14. Tablero: `ClosedWonDialog` llama `onOpenChange(false)` tras confirmar (`ClosedWonDialog.tsx:89-90`)
    y dispara `won.revert()` (`KanbanBoardV2.tsx:248`) aun con éxito; si el PATCH falla la BD queda
    `won` (`:257-259`). El drawer abre `WonCloseModal` aunque el PATCH falle (`OpportunityDrawer.tsx:126`).
15. Conversión de lead no mueve de etapa ni valida estado (convierte perdidos) — `leads/[id]/convert/route.ts:54-104`.
16. `StageGateService` usa el cliente de navegador dentro de una ruta de servidor: sin sesión, y si
    falla la lectura devuelve `ok:true` (`stageGateService.ts:1, 261-272`). El gate de la conversión
    probablemente nunca bloquea.
17. `NewLeadDialog` ignora el 409 con `existing_customer` (`:232-233`) aunque el servicio lo prepara
    para «usar el existente».
18. Borrado de pipeline y de etapa desde el navegador (`PipelineHeader.tsx:277-313`), saltando la
    regla «las etapas se escriben por la API» (`KanbanBoardV2.tsx:30-35`).
19. `opportunity_stage_history` vacía con 9 oportunidades movidas; `crm_events` sin ningún
    `stage_changed`. Hay que averiguar si los cambios se hicieron antes de crear los triggers o si
    algo los esquiva (las funciones `*_bypass`).

**Baja / deuda**
20. Moneda (ver §1.9). 21. Doble trigger de `updated_at`. 22. 11 RPC de etapa. 23. `tasks.related_to_type`
    con `cliente` y `customer`. 24. Toast «Exito» sin tilde (`OpportunityForm.tsx:417`). 25. Código
    muerto: `StageManager`, `StageConfigDialog`, `PipelineInitializer`, `KanbanSummary` (pronostica con
    0,6/0,3/0,1 inventados), `ThemeToggle`, `CustomerList/Card/Summary/Dashboard`,
    `ProductSearchSelect`, `pos/customer-selector.tsx`, barril `pipeline/index.ts`,
    `BulkCreateOpportunitiesDialog`, `ImportLeadsCsv`, `expansionService.create…`,
    `leadCaptureService.ensureLeadOpportunity`, `pipelineService.createOpportunity`.

## 6. Propuesta de diseño (lista para dibujar)

Dónde: no hay página de CRM en Figma (las páginas son `01`–`10`, y `08` es «Acceso y organización»).
Propuesta: página nueva **«11 CRM»** (no «08 CRM», que chocaría con la numeración existente; confirmar,
pregunta 1). Sección **«CRM — Oportunidades, leads y pipeline (propuesta)»**. Componentes en
`02 Componentes` › sección **«CRM (Nuevo)»**. Shell con instancias de `AppHeader` `45:2224`, `Sidebar`,
`MobileHeader` `48:2550` y `MobileTabBar`. Tokens Light/Dark, Inter, iconos lucide 1,5 px, un solo azul
de acción (`#4361EE` / `#3651D4`), estados nunca solo por color. Datos ficticios: «Ana Gómez»,
«Distribuciones El Roble S.A.S.», «Carlos Ruiz».

### 6.1 Componentes nuevos (`02 Componentes` › «CRM (Nuevo)»)

| Componente | Propiedades | Reemplaza en código |
|---|---|---|
| **OpportunityForm** | `Layout=page\|dialog\|sheet` · `Mode=create\|edit` · `Origen=ninguno\|cliente\|factura\|conversación\|llamada\|lead` (muestra la ficha de contexto prellenada y bloqueada) · `Líneas=sí\|no` | `OpportunityForm`, `CreateOpportunityDialog`, el formulario en línea de `CallLinkPanel`, la parte de creación de `BulkActionsDialog` |
| **LeadForm** | `Layout=dialog\|sheet` · `Cliente=existente\|nuevo\|duplicado` (409 con «Usar el existente») | `NewLeadDialog` y el formulario de referido |
| **CustomerLinkPicker** | `Layout=dialog\|sheet` · `Filtro=Personas\|Empresas\|Todos` · `Paso=buscar\|crear\|cargo` · `Estado=listo\|cargando\|vacío\|sin resultados\|error` | los 8 selectores de cliente y el diálogo de `CompanyContactsManager` (§6.3) |
| **CloseWonDialog** | `Paso=ficha\|acciones\|resumen` · `Layout=dialog\|sheet` | `ClosedWonDialog` + `WonCloseModal` + `markAsWon` directo |
| **CloseLostDialog** | `Motivo=simple\|competencia\|funcionalidades` · `Layout=dialog\|sheet` | `LossReasonDialog` + `StructuredLossDialog` |
| **MoveStageDialog** | `Resultado=gate\|ganar\|perder\|sin permiso` | `GateWarningDialog` y los tres flujos de etapa |
| **ConvertLeadDialog** | `Destino=mismo pipeline\|otro pipeline` · incluye etapa destino y dueño | confirmación de `leads/page.tsx:424` |
| **OpportunityCard** | `Estado=abierta\|ganada\|perdida\|arrastrando` · `Tipo=lead\|deal` · `Densidad=kanban\|lista móvil` | `OpportunityCardV2` |
| **StageColumn** | `Estado=normal\|destino\|vacía\|cargando` · cabecera con conteo, total en moneda base y SLA | `KanbanColumnV2` |
| **OpportunityRow** | fila de tabla escritorio con menú «⋯» | `OpportunitiesTable` |
| **LeadRow** | fila con score, temperatura, último contacto, «Calificar» y «Convertir» | tabla de `leads/page.tsx` |
| **StageStepper** | embudo horizontal clicable con etapa actual, ganadas y perdidas | embudo de `DetailHeader` |
| **OpportunityHeader** | monto + moneda, etapa, probabilidad, dueño, cierre esperado, acciones | `DetailHeader` + `DrawerHeader` |
| **ConnectionsCard** | cliente, cotizaciones, facturas, venta POS, reservas, onboarding, renovación, tareas | usa `getOpportunityFinance360`, hoy sin UI |
| **FilterChips** | chips de pipeline, etapa, dueño, estado, cierre, origen; `+ Filtro` | `OpportunitiesFilters` |
| **OpportunityActionsMenu** | menú «⋯» con un ícono por acción: Ver (`Eye`), Editar (`Pencil`), Mover de etapa (`ArrowRightLeft`), Ganar (`Trophy`), Perder (`XCircle`), Duplicar (`Copy`), Nueva tarea (`ListPlus`), Eliminar (`Trash2`, rojo, separado) | menús de tabla, tarjeta y detalle |

Se reutilizan sin tocar: `PageHeader` (`Variant=list|detail|form`), `Badge` `7:70`, `MenuItem`
`10:239`, `TaskQuickView` `626:14723` y `TaskRow` (del agente de PM; se instancia, no se crea).

### 6.2 Pantallas (escritorio 1440 y móvil 390)

1. **Pipeline — kanban.** PageHeader con selector de pipeline (solo `pipeline_type=sales` por
   defecto; onboarding y renovación en otra pestaña), `FilterChips`, conmutador Kanban/Lista, totales
   por columna en moneda base con aviso «incluye 2 oportunidades en USD convertidas». Estado
   «arrastrando» con columna destino resaltada. Soltar en ganada/perdida abre `CloseWonDialog` o
   `CloseLostDialog`. Móvil: una columna por pantalla con selector de etapa arriba y `OpportunityCard`
   en lista.
2. **Pipeline — lista.** La misma data en `OpportunityRow`; selección múltiple con barra de
   «Mover de etapa», «Asignar dueño».
3. **Oportunidades.** KPI corregidos (abiertas, valor abierto, ponderado solo abiertas, tasa de
   cierre), `FilterChips`, tabla paginada con pestañas «Deals / Leads / Todas».
4. **Leads.** `LeadRow`, pestañas «Nuevos · Calificados · Descartados · Convertidos», acciones por
   fila Llamar, WhatsApp, Calificar, Convertir, Descartar (con motivo).
5. **Detalle de oportunidad.** `OpportunityHeader`, `StageStepper`, columna principal con línea de
   tiempo de actividades (instancias existentes del timeline) y pestañas Resumen · Actividad · Tareas
   (`TaskRow`; abrir con `TaskQuickView`) · Notas · Documentos · Productos · Cierre · IA; columna
   lateral con cliente (tarjeta), `ConnectionsCard`, dueño y comisión, objeciones.
6. **Nueva oportunidad** (`OpportunityForm Layout=page Mode=create`) y **editar**.
7. **Diálogos clave**: ganar (3 pasos), perder, mover etapa con gate, convertir lead, vincular
   cliente.
8. **Estados** por pantalla: listo, cargando (esqueleto con cabecera visible), vacío con primer paso
   («Crea tu primera oportunidad» / «Conecta el formulario web»), sin resultados (con «Limpiar
   filtros»), error con «Reintentar», sin permiso (sin botones de escritura, con texto que dice quién
   puede).
9. **Frame «Puntos de entrada».** Una fila por origen, cada una con la miniatura de su pantalla y la
   **misma instancia** de `OpportunityForm` con su `Origen`:
   - Pipeline «+ Nueva» y «+» de columna → `Layout=dialog, Origen=ninguno` (etapa prellenada).
   - Oportunidades «Nueva» → `Layout=page`.
   - Clientes › ficha › «Oportunidades» vacío con **botón nuevo** → `Layout=sheet, Origen=cliente`.
   - Finanzas › cotización o factura sin oportunidad → «Crear oportunidad» → `Layout=sheet,
     Origen=factura` (cliente, importe, moneda y líneas prellenadas, la factura queda vinculada).
   - Chat/Bandeja › conversación → `Layout=sheet, Origen=conversación` (cliente y canal de origen).
   - Llamada › «Vincular» → `Layout=sheet, Origen=llamada`.
   - Leads › «Convertir» → `ConvertLeadDialog`; Leads › «Nuevo» → `LeadForm`.
   - GO Assistant → misma validación del servicio (no dibuja formulario propio).

### 6.3 CustomerLinkPicker (pedido del dueño, aprobado en chat)

Un solo diálogo. **Filtro** Personas / Empresas / Todos. **Buscador** por nombre, documento, correo o
teléfono, en servidor, con debounce. **Filas** con avatar, nombre, documento, badge de tipo
(Persona/Empresa), y badge «Ya vinculada» deshabilitado cuando aplica. **Última fila** «Crear persona
«<texto>» sin salir de aquí» (o empresa, según el filtro): abre el paso `crear` con los campos
mínimos del `ClientForm`. **Paso final `cargo`** con «Cargo» y «Contacto principal» **solo** cuando se
vincula persona↔empresa.

Tres usos, misma instancia:
- En una empresa, «Vincular contacto» → `Filtro=Personas`, con paso `cargo`.
- En una persona, «Vincular empresa» → `Filtro=Empresas`, relación inversa en la misma tabla, con
  paso `cargo`.
- En oportunidad, factura o tarea, el campo «Cliente» → `Filtro=Todos`, sin cargo. Al elegir una
  persona con empresa principal se muestra «Ana Gómez · Distribuciones El Roble S.A.S.».

`OpportunityForm` y `LeadForm` instancian `CustomerLinkPicker` para el cliente.

## 7. Plan de centralización en código (no implementado)

### 7.1 Decisiones del plan V4 que se respetan
`stages.is_won/is_lost` mandan y la probabilidad es informativa (`FASE-09:959`); un solo
`PATCH …/stage` para todo (`FASE-09:875`); el drawer y el detalle comparten módulos (`FASE-09:879`);
el cliente no inserta en `activities` (`FASE-09:32`); `notes` sigue aparte; una sola barra de
acciones rápidas; componentes de 300 líneas como máximo y sin lógica de negocio (`BRIEF-UX-CRM.md:58-60`);
se rediseña en la ruta existente, sin páginas duplicadas (`:46`).

### 7.2 Un servicio y una ruta por operación

| Operación | Único punto | Reemplaza |
|---|---|---|
| Crear oportunidad o lead | `POST /api/crm/opportunities` → `opportunityCreateService` (servidor, generaliza `leadCreateService`): resuelve pipeline `is_default` **de tipo sales** → más antiguo de tipo sales; primera etapa **no** ganadora/perdedora; moneda base de la organización; autoasigna dueño; valida cliente, sucursal, pipeline y etapa; escribe líneas en la misma transacción (RPC `crm_create_opportunity`); emite actividad «creada» en servidor | `createOpportunity` de navegador, `BulkActions`, `CallLinkPanel`, `renewal`/`onboarding` (que pasan su pipeline), `web_capture_lead` (que llama la misma RPC) |
| Editar | `PATCH /api/crm/opportunities/[id]` con líneas por diferencia (upsert/delete por id, nunca `total_price`), `metadata` con merge (`jsonb ||`), `pipeline_id` + `stage_id` juntos o rechazo | `updateOpportunity`, updates sueltos de equipo/territorio |
| Mover, ganar, perder | el `PATCH …/stage` actual; ganar y perder **siempre** mueven a la etapa `is_won`/`is_lost` del pipeline | `markAsWon`, `markAsLost`, los tres flujos de UI |
| Convertir lead | `POST /api/crm/leads/[id]/convert` con etapa destino (y pipeline) opcionales; rechaza leads cerrados | la conversión actual |
| Buscar clientes | `GET /api/customers/search?q&tipo&limit` (nombre, documento, correo, teléfono) | 8 selectores |
| Vincular persona↔empresa | `POST/DELETE /api/customers/links` | escrituras directas de `CompanyContactsManager` |

Hooks: `useOpportunityMutations` (crear, editar, mover, ganar, perder) y `useStageFlow` único, usado
por tablero, drawer, detalle y lista. Componentes: los de §6.1, en `src/components/crm/shared/`. Las
fechas pasan por `toPlainDate`/`formatPlainDate` (`date`) y `formatDateInTz` (`timestamptz`); la
moneda por `useOrgCurrency`; los permisos por un `canManageStages` basado en permisos, no en nombre.

### 7.3 Orden sugerido
1. Arreglar los errores altos 1-6 (pequeños y aislados).
2. Servicio de creación en servidor + RPC; migrar los puntos vivos de la tabla 4.1.
3. `CloseWonDialog`/`CloseLostDialog`/`useStageFlow` únicos.
4. `CustomerLinkPicker` + búsqueda en servidor; migrar selectores uno por módulo.
5. `OpportunityForm` partido en secciones de ≤300 líneas con `Layout` y `Origen`; puntos de entrada
   nuevos en Clientes, Finanzas y Bandeja.
6. Borrar código muerto (§5.25) y la ruta `edit-opportunity`.

## 8. Cambios de backend y BD necesarios (no aplicados)

Todos aditivos salvo donde se indica; cada uno con su `.sql` y su rollback según
`docs/POLITICA-MIGRACIONES.md`.

1. RPC `crm_create_opportunity(...)` transaccional (oportunidad + líneas + actividad), `SECURITY
   INVOKER` o con guarda de pertenencia y sin `EXECUTE` para `anon`.
2. `web_capture_lead`: filtrar `pipeline_type='sales'` y la primera etapa no terminal; usar la moneda
   base de la organización. Mover los 23 leads que están en onboarding (decisión del dueño).
3. Índice único parcial: un solo `is_default` por organización **y tipo**; asignar uno a las 2
   organizaciones sin pipeline por defecto.
4. `opportunities.currency`: default de la moneda base (vía trigger `BEFORE INSERT`), en vez de `'USD'`.
5. `trg_sync_customer_lifecycle` también en INSERT, para que un deal creado directo suba al cliente a
   `opportunity`.
6. `fn_create_commission_on_opportunity_won`: usar `NEW.branch_id`; si no hay sucursal, no crear en
   vez de `1`.
7. `customer_company_links`: `CHECK (person_id <> company_id)`, índice único parcial de un principal
   por empresa, y validar tipos (trigger).
8. Revocar `EXECUTE` a `authenticated` y luego borrar las 10 funciones de etapa sin uso (confirmar con
   `grep` que ninguna se llama).
9. Quitar uno de los dos triggers de `updated_at`.
10. Normalizar `source` (catálogo) y `tasks.related_to_type` (`cliente`→`customer`).
11. Publicar `opportunities` y `stages` en realtime (pendiente del plan V4, `FASE-09:67`).
12. `loss_reasons` por organización editable desde configuración (hoy solo las 8 globales).
13. Relación opcional oportunidad ↔ meta: `goals` o `sales_targets` (pregunta 6).

## 9. Preguntas para el dueño

1. Página de Figma: ¿«11 CRM» (nueva) o se usa «06 Clientes»? «08» ya es «Acceso y organización».
2. «Lead» significa dos cosas: 34.233 clientes con `lifecycle_stage='lead'` y 42 filas de
   `opportunities`. ¿La página Leads debe mostrar solo los segundos (hoy) o también los contactos
   importados que nunca tuvieron oportunidad?
3. ¿Los leads viven en el mismo pipeline que los deals (hoy) o en un pipeline de prospección aparte, y
   convertir los mueve a «Ventas»?
4. Los 23 leads web en el pipeline de onboarding: ¿se mueven al de ventas?
5. ¿Quién puede ganar, perder, saltar el gate y convertir? Hoy lo decide el id o el nombre del rol.
   ¿Se crean permisos `crm.opportunities.close`, `crm.stages.override`, `crm.leads.convert`?
6. ¿Las oportunidades deben sumar a metas del PM (`goals`/resultados clave) o solo a cuotas de venta
   (`sales_targets`)?
7. ¿«Responsable» y «Comisionista» son la misma persona? Hoy hay un solo selector llamado
   «Comisionista» que escribe `salesperson_id`, y 67 de 69 oportunidades no tienen dueño.
8. ¿Qué módulos abren el formulario? Propuesta: Clientes, Finanzas (cotización/factura), Bandeja y
   Llamadas. ¿Falta alguno (POS, Reservas)?
9. Totales del tablero con monedas mezcladas: ¿convertir a la moneda base (como el pronóstico) o
   mostrar un total por moneda?

## 10. Qué falta cuando vuelva el cupo de Figma

1. Lectura de páginas y de `02 Componentes` (confirmar `PageHeader`, `Sidebar`, `MobileTabBar`,
   `TaskRow` del agente de PM).
2. Crear los 16 componentes de §6.1 en «CRM (Nuevo)».
3. Pantallas de §6.2 (escritorio y móvil, 6 estados) y el frame «Puntos de entrada».
4. Chequeo por script (0 solapes, 0 nodos fuera de sección, 0 instancias rotas, 0 textos truncados,
   0 anotaciones dentro de frames).
5. Capturas en `docs/design/figma/45-crm-*.png` y node ids en §0 de este documento.
6. Pantallas y componentes de la ampliación (§11): `QuickActionsBar Variant=customer`, los seis
   componentes de acción, la página Actividades en modo línea de tiempo y los tres puntos de entrada
   de la ficha del cliente, corrigiendo el vacío con «Nuevo producto» y el ícono de «Nueva».

## 11. Ampliación: acciones rápidas, página Actividades y ficha del cliente

La estructura actual del CRM y del pipeline se conserva; lo que sigue mejora UX y marca sin moverla.
Las entradas de **tareas** (21 caminos, 6 fallos altos: proyecto obligatorio en
`TaskCreationPanel.tsx:1238`, `TasksSection.tsx:77` borra la relación con la oportunidad, `?taskId`
ignorado en `/app/pm/tareas`, estados `pending/completed` en `TareasSidebar`, `activities.title`
inexistente) están en el inventario del agente de PM y no se repiten aquí. Registrar pago, estado de
cuenta en PDF y unificar clientes los lleva otro agente.

### 11.1 Barra de acciones rápidas: qué hace hoy cada botón

Un solo componente, `src/components/crm/shared/QuickActionsBar.tsx` (variantes `card | drawer |
detail`, sin variante de cliente). Botones de `quickActionsConfig.ts:13,56`.

| Botón | Qué abre y a dónde escribe | Qué registra | Falta o está mal |
|---|---|---|---|
| **Llamar** | Menú de 3 modos (`quickActionsConfig.ts:83`): navegador → `softphone.makeCall` (`SoftphoneProvider.tsx:150`); celular → `MobileCallDialog` → `POST /api/voice/bridge/initiate`; «Agente IA» siempre deshabilitado (`:97`) | `calls` (webhook de Twilio o la ruta de puente) | El botón nunca se deshabilita (`:71`); con un teléfono que no normaliza, el ítem queda activo y el clic no hace nada, sin aviso (`QuickActionsBar.tsx:113`). El panel de estado de la llamada por celular se desmonta al instante: `onStarted` → `done()` pone el diálogo en null (`MobileCallDialog.tsx:173`, `QuickActionsBar.tsx:138-141`) |
| **Email** | `ComposeEmailDialog` v1 → `POST /api/email/send` (`ComposeEmailDialog.tsx:74`) | `email_messages` + 1 `activities` (`sendService.ts:219-229`) | Sin comprobar remitente antes: 422 `NO_SENDER` al enviar. Sin `client_request_id`. En respuesta, `in_reply_to` va dentro de `metadata` (`:85`) y el hilo se pierde. El compositor completo (`ComposeEmailDialogFull`) no se usa desde la barra |
| **WhatsApp** | `ComposeWhatsAppDialog` → `POST /api/crm/whatsapp/send` | `conversations`, `messages`, `comm_usage_logs`, `activities`; cobra créditos (`outboundService.ts:75-301`) | Sin canal, el botón está activo y el aviso sale dentro del diálogo. `MessageForm.tsx:53` programa con `toISOString().slice(0,16)` (UTC mostrado como local) |
| **Reunión** | `MeetingDialog` → `POST /api/crm/meetings` | `calendar_events` + `activities` tipo `meeting`, con reversa si falla (`meetingsService.ts:113-163`) | Fechas en la zona del navegador (`MeetingDialog.tsx:55,64`). `calendar_events` no tiene columna de oportunidad, solo `customer_id` |
| **Tarea** | `TaskDialog` compacto → `crmTaskService` → `pmService.createTask` con **cliente de navegador** | `tasks`, sin actividad | Sale **sin asignar** (`taskService.ts:139`); en «Más opciones» no avisa al terminar (`TaskDialog.tsx:189-192`); `/api/crm/tasks` quedó muerto |
| **Nota** | `QuickNoteDialog` → `POST /api/crm/notes` | `notes` | No aparece en la página Actividades (lee solo `activities`) |
| **Propuesta** | Sin diálogo: solo el detalle la maneja, cambiando a la pestaña Cierre (`OpportunityDetail.tsx:154`) | — | En tarjeta y drawer no hace nada visible |

Montajes: tarjeta del pipeline (`OpportunityCardV2.tsx:126`, **sin refresco**), drawer
(`DrawerHeader.tsx:100`), detalle (`DetailHeader.tsx:77`), línea de tiempo con compositor y en su
vacío (`OpportunityTimeline.tsx:106,143`), ficha CRM del cliente (`crm/clientes/[id]/page.tsx:230`;
puede salir dos veces, en la cabecera y en el vacío de la línea de tiempo) y el panel de Actividades
(`ActividadesPage.tsx:264-311`). **La ficha de `/app/clientes/[id]` no la tiene**, aunque la captura
`15-clientes-detalle-actividad.png` ya la dibuja.

Ninguna acción comprueba permisos (solo el envío masivo de WhatsApp, `ComposeWhatsAppDialog.tsx:87`).

**Propuesta: un componente por acción**, compartido por ficha del cliente, oportunidad, tarjeta y
drawer del pipeline y Actividades. Cada uno recibe la entidad (cliente u oportunidad) y al terminar
emite **un solo evento** `crm:entity-changed` que escuchan línea de tiempo, listas y contadores (hoy
cada contenedor refresca a su manera y la tarjeta no refresca).

| Componente | Base | Cambio |
|---|---|---|
| `CallAction` | menú actual | deshabilitar con motivo visible («Sin teléfono», «Número inválido»); panel de estado de la llamada que no se cierra al iniciar |
| `EmailAction` | un solo compositor (el completo, con modo compacto) | comprobar remitente al abrir; idempotencia; `in_reply_to` de primer nivel |
| `WhatsAppAction` | `ComposeWhatsAppDialog` | deshabilitar sin canal con enlace a conectar; fecha programada en la zona de la organización |
| `MeetingAction` | `MeetingDialog` | zona de la organización; enlazar la oportunidad (§11.4) |
| `TaskAction` | **el TaskForm único del agente de PM** | responsable por defecto = usuario actual; guardar por API |
| `NoteAction` | `QuickNoteDialog` | única forma de crear notas (tabla `notes`) |
| `QuickActionsBar` | actual | añadir `Variant=customer`; en tarjeta, solo íconos con tooltip; cada botón con su estado deshabilitado explicado |

### 11.2 Página Actividades `/app/crm/actividades`

Cómo funciona: `ActividadesPage` + `ActividadesService` con cliente de navegador. Lista paginada de
`activities` (`ActividadesService.ts:95-100`), 7 KPI con 7 consultas (`:275-303`), filtros de tipo,
usuario y fechas, detalle en `/actividades/[id]`. Crear y duplicar van por `POST /api/crm/activities`
(zod, pertenencia, idempotencia, actualiza `last_contact_at`).

Errores:
1. **Editar y borrar se saltan la API**: `update` y `delete` directos desde el navegador
   (`ActividadesService.ts:219-250`); la ruta solo exporta POST (`api/crm/activities/route.ts:18`).
   No se valida la pertenencia de la entidad relacionada ni se resincroniza `last_contact_at`. La RLS
   deja a cualquier miembro editar o borrar la actividad de otro.
2. **Notas en dos tablas**: el tipo «Nota» del formulario escribe en `activities` (hay 25), la acción
   rápida escribe en `notes` (hay 2), y `NotasArchivosTab.tsx:130` inserta en `notes` desde el
   navegador sin filtro de organización. La página solo ve las primeras. Las notas de GO Assistant
   (`ai-assistant/execute-action/route.ts:169,234`, `transcribe/route.ts:187`) entran sin entidad y
   se ven como «—».
3. **`channel` significa dos cosas**: el formulario guarda la dirección (`inbound/outbound`,
   `ActividadForm.tsx:222`); el resto del sistema guarda el medio (`email`, `whatsapp`, `call`). El
   filtro de canales de la línea de tiempo no encuentra lo creado aquí, `contact_channel` queda en
   `'outbound'`, y editar una llamada o un correo automático le pisa el canal.
4. El KPI «Tareas» cuenta `activity_type='task'`, pero las tareas van a `tasks`: queda en 0. «Notas»
   ignora la tabla `notes`.
5. Fechas: tabla con `Intl` `es-ES` sin zona (`ActividadesTable.tsx:72-82`); filtros con
   `T23:59:59.999` sin desfase (`ActividadesService.ts:52-56`): el día se corre 5 horas.
6. Unas 14 consultas por cada cambio de página o filtro; selectores de cliente y oportunidad cortados
   en 200 (`:311,322`); el detalle muestra el JSON crudo de `metadata` (`ActividadDetalle.tsx:252-265`).

**Hay 4 líneas de tiempo distintas**: la unificada del CRM (`OpportunityTimeline` +
`timeline/sources.ts`, 8 fuentes, cursor, tiempo real), la vieja de `/app/clientes/[id]`
(`TimelineTab.tsx`: ventas, reservas, actividades, pedidos web; sin notas, tareas, llamadas ni
correos; fechas corridas), el modal de historial del pipeline (`CustomerHistoryModal`, el único con
`formatDateInTz` bien) y los conteos del tablero (`CRMDashboardService.ts:266-340`, por `created_at` y
cortados en 1.000). La unificada, además, fija `America/Bogota` (`timeline/utils.ts:44-113`) y en la
ficha CRM del cliente no trae las actividades de sus oportunidades aunque el comentario lo diga
(`crm/clientes/[id]/page.tsx:462`).

**Cómo unificar.** La página Actividades pasa a ser la misma línea de tiempo en **modo organización**:
`GET /api/crm/timeline/org` reutilizando los adaptadores de `sources.ts` sin filtro de entidad (el de
WhatsApp necesita variante propia), con búsqueda de texto, filtros de resultado y de tipo de entidad,
paginación por cursor («Cargar más») y los KPI en una RPC aparte. Se añaden `PATCH` y `DELETE` a
`/api/crm/activities` y la edición solo aplica a filas de `activities`. Antes hay que fijar que
`channel` es el medio y mover la dirección a `metadata.direction`. La ficha de `/app/clientes/[id]`
reemplaza `TimelineTab` por la unificada, con ventas y reservas como fuentes nuevas.

### 11.3 Ficha del cliente: entradas que faltan

| Punto | Hoy | Propuesta |
|---|---|---|
| «Nueva oportunidad» | **No existe** en ninguna de las dos fichas: `crm/clientes/[id]/page.tsx:411-414` y `OportunidadesTab.tsx:104` muestran solo texto; en la ficha CRM las filas ni siquiera son clicables | Botón en la cabecera de la pestaña y en su vacío → `OpportunityForm Layout=sheet, Origen=cliente` (cliente prellenado y bloqueado) |
| «Tareas pendientes · Nueva» y «Crear la primera tarea» | **No existen** en código: `TareasSidebar.tsx` es de solo lectura (`:250-267`) y enlaza a `/app/tareas` (`:367`). En Figma el botón «Nueva» ya está dibujado, **con un ícono de descarga** (`15-clientes-detalle-actividad.png`) | «Nueva» con `Plus` y, en el vacío, «Crear la primera tarea» → TaskForm único del PM con el cliente prellenado |
| Vacío de actividad | En código: «No hay actividad reciente» sin botones (`TimelineTab.tsx:334-337`, `ResumenTab.tsx:373`). El texto «Este cliente todavía no tiene actividad» con «Nuevo producto» **no está en código ni en los documentos**: está en un frame de Figma que no pude abrir sin cupo | Vacío con `QuickActionsBar Variant=customer` más «Registrar venta»; nunca «Nuevo producto» |

### 11.4 Cambios de backend y BD adicionales (no aplicados)

14. `PATCH` y `DELETE` en `/api/crm/activities` con las mismas guardas que el POST; RLS de
    `activities` para que solo el autor o un rol con permiso edite o borre.
15. Una sola tabla de notas: migrar las 25 `activities` de tipo `note` a `notes` (o al revés,
    pregunta 10) y dar entidad a las de GO Assistant.
16. `calendar_events.opportunity_id` nullable, para que una reunión aparezca en la oportunidad.
17. Endpoint `GET /api/crm/timeline/org` e índices `(organization_id, <columna de fecha> desc, id)` en
    las 8 fuentes.
18. Zona horaria de la organización en `timeline/utils.ts` en vez de `America/Bogota` fijo.

### 11.5 Preguntas adicionales

10. ¿Las notas viven en `notes` (decisión V4) y el tipo «Nota» desaparece del formulario de actividad?
11. En la página Actividades, ¿basta «Cargar más», o se necesitan números de página y total exacto?
12. «Registrar venta» en el vacío de la ficha: ¿abre el POS con el cliente o una venta rápida en
    diálogo?

## Decisiones del dueño (2026-09-23)

- **Módulos que abren el formulario de oportunidad:** todos los que lo pidan (Finanzas, Clientes, POS, chat, GO Assistant y los que vengan). Todos usan el mismo componente único, prellenado según el origen.
- **Página Leads** (lo decidió la sesión dueña del CRM): la página lista personas y empresas (`customers.lifecycle_stage='lead'`, 34.241 hoy), no negocios; nunca es un kanban. La acción principal es «Calificar → crear oportunidad». La búsqueda y la paginación van en el servidor, y hay que diseñar tres estados: vacío, «cargando más» y búsqueda sin resultados. El pipeline muestra solo oportunidades. El cambio de `lifecycle_stage` (lead → opportunity → customer) lo hace el sistema, no el usuario (queda como deuda del CRM).
- **Leads en onboarding:** la sesión del CRM corrige `web_capture_lead`. Toma el pipeline `sales` marcado por defecto; si no hay, el `sales` más antiguo; si la organización no tiene ninguno `sales`, falla de forma visible y lo registra. Hay que diseñar dónde se ve un lead web que no se pudo colocar. Mover los 23 existentes es una corrección de datos que decide el dueño, y exige remapear la etapa de cada uno: se diseña como pantalla de reasignación, no como un botón.
- **Moneda:** el KPI principal va en la moneda base de la organización, convertido con la tasa del día contable de la organización, y el desglose por moneda queda a un clic. Si falta la tasa de una moneda, no se inventa: el total muestra lo que sí tiene tasa, con un aviso de lo que quedó fuera. El valor por defecto de la moneda es la base de la organización, nunca un literal.
- **Formulario único:** es un contrato. Si un módulo necesita un campo que los demás no tienen, se agrega como campo opcional del mismo formulario, nunca como una segunda versión.
- **Organización sin embudo de ventas** (sesión CRM, commit `307e92cc`): es un estado real hoy. La org 145 no tiene ningún pipeline `sales`. `web_capture_lead` ya no coloca el lead en otro embudo: devuelve `crm_warning='no_sales_pipeline'`. Hay que diseñar dónde se ven los leads capturados que no se pudieron colocar, con el primer paso «Crear embudo de ventas». Los 23 leads que hoy están en «Onboarding» solo se pueden mover después de crear ese pipeline; el procedimiento de tres pasos está en `docs/hallazgos/F-66.md` y lo decide el dueño.
- **Ganar una oportunidad sin sucursal** (corregido en `307e92cc`): el trigger de comisión usaba la sucursal 1, que no existe, así que una organización sin sucursales no podía marcar ninguna oportunidad como ganada. Ahora usa `opportunities.branch_id`.

## Figma — leads, actividades y acciones rápidas (2026-09-23)

Archivo `EAvjINVRnlzFM70GVoWXgl`. Pantallas en la página **«11 CRM»** (`759:17`), sección
**«CRM — Leads, actividades y acciones rápidas»** (`765:446568`, en x=20000 para no chocar con la
sección de Pipeline). Componentes en `02 Componentes` › **«CRM (Nuevo)»** (`759:20897`), en una
columna propia a la derecha (x=1720) de los del agente de Pipeline. Capturas:
`docs/design/figma/45-crm-leads-*.png` (22 archivos; `45-crm-leads-00-seccion-completa.png` es la
vista general).

Se conserva la estructura actual: Leads sigue siendo una tabla con «Nuevo lead» y «Actualizar»
(ahora con KPI, chips, paginación en servidor y «Calificar»); Actividades conserva KPI + filtros +
lista + «Nueva actividad» (la tabla pasa a línea de tiempo agrupada por día, la misma del cliente y
de la oportunidad); la barra de acciones rápidas sigue siendo un solo componente con los mismos seis
botones; la ficha del cliente conserva cabecera, pestañas y barra lateral de tareas.

### Componentes

| Componente | Id | Variantes |
|---|---|---|
| `LeadRow` | `759:444712` | `Fila=encabezado · normal · seleccionada · cargando` (en móvil se usa `ListCard` del kit) |
| `QualifyLeadDialog` | `759:445219` | `Layout=dialog · sheet` (paso 1; el paso 2 es `OpportunityForm`) |
| `CaptureBanner` | `759:444768` | `Layout=escritorio · móvil` (leads sin colocar, «Crear embudo de ventas») |
| `TimelineFilters` | `759:444935` | `Layout=escritorio · móvil` |
| `CargarMas` | `759:444795` | `State=listo · cargando · fin` |
| `ActivityDialog` | `760:445129` | `Tipo=llamada · correo · whatsapp · reunión · nota` × `Layout=dialog · sheet` |
| `TimelineEntry` (ampliado, hace de ActivityItem) | `329:109173` (06 Clientes › sección Clientes de `02 Componentes`) | nuevos `Tipo=reunión` (`760:445130`) y `Tipo=llamada IA` (`760:445161`), y propiedad booleana `Acciones` (menú «⋯») en los 11 tipos |

Instancias de otros agentes: `QuickAction` `759:21219`, `QuickActionsBar (CRM)` `759:21433`,
`OpportunityCard` `759:22188`, `OpportunityRowMenu` `759:21624`, `OpportunityForm` `766:448739`,
`TaskQuickView` `626:14723`; del kit: `PageHeader`, `StatCard`, `KpiCompacto`, `SearchBar`,
`FilterButton`, `Chip`, `Pagination`, `BulkActionBar`, `EmptyState`, `ListCard`, `MenuItem`,
`ConfirmDialog`, `Toast`, `Sidebar`, `AppHeader`, `MobileHeader`, `MobileTabBar`.

### Pantallas

| Pantalla | Id |
|---|---|
| Escritorio / Leads — listo | `765:446571` |
| Escritorio / Leads — selección masiva | `765:447453` |
| Escritorio / Leads — leads sin colocar (sin embudo de ventas) | `765:448463` |
| Escritorio / Leads — detalle rápido (hoja) | `767:2873` |
| Escritorio / Leads — calificar (paso 1) | `767:3240` |
| Escritorio / Leads — calificar (paso 2: OpportunityForm) | `772:21705` |
| Escritorio / Leads — cargando · vacío · sin resultados · error · sin permiso | `767:3470` · `767:4403` · `767:5218` · `767:6038` · `767:6852` |
| Móvil / Leads — listo · cargando más · selección · detalle (hoja) · calificar · sin colocar · sin resultados · vacío | `768:6419` · `768:7017` · `768:7203` · `768:7837` · `768:8063` · `768:8277` · `768:8590` · `768:8738` |
| Escritorio / Actividades — listo | `769:12376` |
| Escritorio / Actividades — menús «Nueva actividad» y «⋯» | `769:13036` |
| Escritorio / Actividades — registrar llamada · editar nota · eliminar | `769:13655` · `769:13838` · `769:13935` |
| Escritorio / Actividades — cargando · vacío · sin resultados | `770:15494` · `770:16039` · `770:16578` |
| Móvil / Actividades — listo · hoja de tipos · enviar WhatsApp | `770:17115` · `770:17351` · `770:17452` |
| Ficha del cliente — Oportunidades con «Nueva oportunidad» | `772:19838` |
| Ficha del cliente — Nueva oportunidad (hoja, `Origen=cliente`) | `772:20628` |
| Ficha del cliente — vacío corregido (Registrar venta, Registrar llamada, Nota) | `772:20971` |
| Ficha del cliente — primera tarea creada (`TaskQuickView`) | `772:21523` |
| Acciones rápidas — el mismo componente en cuatro lugares | `773:472568` |
| Acciones rápidas — qué hace cada botón (abre → resultado + toast) | `773:472975` |

Chequeo por script al cerrar: 0 solapes entre frames y anotaciones de la sección, 0 nodos fuera de
la sección, 0 instancias rotas, 0 anotaciones dentro de frames. Textos desbordados: solo los KPI del
móvil, que se desplazan en horizontal a propósito (norma del kit). `TimelineEntry` se reacomodó en
3 columnas y `ContactoVinculadoRow` bajó 100 px para no solaparse.

### Pendiente y observaciones

- `OpportunityForm` no tiene `Origen=lead`: el paso 2 de «Calificar» usa `Origen=cliente` con
  textos sobrescritos. Falta agregar la variante (la dueña es la sesión de Pipeline).
- No hay un **TaskForm** en Figma: «Nueva tarea», «Crear la primera tarea» y la acción «Tarea»
  muestran el resultado con `TaskQuickView`. Falta el formulario único del agente de PM.
- `Badge Tono=información` (y otros tonos) no enlaza la propiedad `Texto` con la capa de texto: hay
  que sobrescribir el texto a mano. Conviene corregirlo en el kit.
- Sin móvil de la ficha del cliente: `OpportunityForm Layout=sheet` mide 480 px y no cabe en 390.
- La pantalla de reasignación de los 23 leads de Onboarding no se dibujó (solo se enlaza desde el
  banner); depende del procedimiento de `docs/hallazgos/F-66.md`.

## Figma (2026-09-23) — pipeline y oportunidades

Archivo `EAvjINVRnlzFM70GVoWXgl`. Se conservó la estructura actual del CRM (la que funciona) y se
llevó al kit y al manual de marca: un solo azul de acción, tokens `Color` Light/Dark, Inter,
íconos lucide 1,5 px, estados nunca solo por color. Datos ficticios.

### Componentes — `02 Componentes` › sección «CRM (Nuevo)» `759:20897`

La columna de `x=1720` de esa sección es del agente de leads y actividades (no se movió).

| Componente | Node id | Propiedades |
|---|---|---|
| Íconos `Icon/Trophy`, `Icon/ListPlus`, `Icon/Kanban` | `759:20906`, `759:20913`, `759:20918` | lucide, mismo trazo que `Icon/*` |
| `QuickAction` | `759:21219` | `Acción=Llamar\|Email\|WhatsApp\|Reunión\|Tarea\|Nota` · `Formato=botón\|ícono` · `Estado=default\|deshabilitado` (con motivo visible) |
| `QuickActionsBar (CRM)` | `759:21433` | `Variant=tarjeta\|drawer\|detalle\|cliente` (detalle suma Propuesta; cliente suma «Nueva oportunidad») |
| `OpportunityRowMenu` | `759:21624` | `Estado=abierta\|cerrada`; Ver, Editar, Mover de etapa, Marcar ganada, Marcar perdida, Duplicar, Nueva tarea, Eliminar (un ícono cada una; Reabrir en cerrada) |
| `OpportunityCard` | `759:22188` | `Estado=normal\|acciones\|arrastrando\|vencida\|ganada\|perdida` · `Densidad=kanban\|lista`; textos `Nombre`, `Cliente`, `Monto`, `Responsable`, `Días en etapa` |
| `StageColumn` | `759:22544` | `Estado=normal\|destino\|vacía\|cargando`; textos `Etapa`, `Total` |
| `KpiMoneda` | `759:22664` | `Estado=completo\|falta tasa\|desglose`; textos `Etiqueta`, `Valor` |
| `CustomerLinkPicker` | `761:23596` | `Paso=buscar\|crear\|cargo\|sin resultados\|cargando` · `Filtro=Todos\|Personas\|Empresas` · `Layout=dialog\|sheet` |
| `WinDialog` | `761:23994` | `Paso=ficha\|acciones\|resumen` · `Layout=dialog\|sheet` |
| `LoseDialog` | `761:24268` | `Motivo=simple\|competencia` · `Layout=dialog\|sheet` |
| `MoveStageDialog` | `761:24498` | `Resultado=confirmar\|gate\|sin permiso` |
| `OpportunityForm` | `766:448739` | `Layout=page\|dialog\|sheet` · `Mode=create\|edit` · `Origen=general\|cliente\|factura\|conversación\|lead` (9 variantes; `Origen=lead` en dialog y sheet, pedida por el agente de leads) |

Variantes de `OpportunityForm`: page/create/general `765:23407`, page/edit/general `765:23807`,
dialog/create/general `765:24211`, dialog/create/cliente `765:24447`, sheet/create/cliente
`766:448170`, sheet/create/factura `766:448358`, sheet/create/conversación `766:448556`,
dialog/create/lead `778:480261`, sheet/create/lead `778:480437`. `Layout=sheet` es el panel lateral de
480 px en escritorio; en móvil la misma instancia se ajusta a 390 (frames `778:34929` y `778:35164`).

### Pantallas — página `11 CRM` `759:17`, sección «CRM — Pipeline y oportunidades (propuesta)» `768:454425`

Escritorio 1440 con Sidebar + AppHeader; móvil 390 con MobileHeader + MobileTabBar.

| Grupo | Frames |
|---|---|
| Pipeline escritorio | listo `768:454428`, arrastrando `768:456094`, acciones rápidas + menú «⋯» `768:457615`, vista Tabla con selección `768:459368`, cargando `770:462337`, vacío `770:463421`, sin resultados `770:464381`, error `770:464677`, sin permiso `770:464982`, **sin embudo de ventas** `770:465308` |
| Pipeline móvil | listo `771:37311`, cargando `771:37831`, vacío `771:37994`, sin resultados `771:38193`, error `771:38433`, sin permiso `771:38566`, sin embudo `771:38704` |
| Oportunidades escritorio | listo `773:23160`, selección masiva `773:24723`, menú «⋯» abierto `773:25279`, cargando `773:25720`, vacío `773:26314`, sin resultados `773:26719`, error `773:27128`, sin permiso `773:27539` |
| Oportunidades móvil | listo `775:471491`, menú «⋯» en hoja `775:471915`, cargando `775:472274`, vacío `775:472436`, sin resultados `775:472586`, error `775:472808`, sin permiso `775:472941` |
| Detalle escritorio | Actividad `775:473076`, Tareas `775:473990`, cargando `775:474532`, no encontrada `775:474947`, sin permiso `775:475356`, drawer desde el kanban `776:30540` |
| Detalle móvil | Actividad `776:30808`, Resumen/Conexiones `776:31106`, cargando `776:31417`, no encontrada `776:31523`, sin permiso `776:31652` |
| Formulario único | Nueva (página) `778:32176`, Editar (página) `778:33132`, diálogo desde «+» de columna `778:33942`, panel desde la ficha del cliente `778:34281`, panel desde factura `778:34520`, móvil desde cliente `778:34929`, móvil desde conversación `778:35164` |
| Diálogos | ganar ficha `779:36778`, ganar acciones `779:36974`, ganar resumen `779:37122`, perder (competencia) `779:37255`, mover con gate `779:37437`, mover sin permiso `779:37578`, vincular cliente `779:37686`; móvil: ganar `779:37888`, perder `779:38310`, vincular empresa `779:38675` |
| Puntos de entrada | `780:45596`: Pipeline, Oportunidades, Clientes, Finanzas, POS, Chat/Bandeja, Leads y GO Assistant abren la misma instancia de `OpportunityForm` |

Qué se conservó de la estructura actual: selector de pipeline y las 5 vistas de `PipelineView`
(Kanban, Tabla, Pronóstico, Clientes, Automatización); columnas con color, conteo, «+» y «⋯»; la
tarjeta de `OpportunityCardV2` (arrastre, avatar, nombre, prioridad, cliente, monto, score, próximo
y último contacto, acciones rápidas en hover) más responsable y días en etapa; el drawer; en el
detalle, el embudo clicable, las pestañas (Actividad, Tareas, Notas, Documentos, Líneas, Análisis,
Cierre, IA), la barra lateral y la línea de tiempo unificada; en la lista, KPIs, filtros, tabla,
Importar y Exportar; en el formulario, las secciones de hoy (información general, productos,
espacios PMS, otros conceptos, comisión).

Chequeo por script (2026-09-23): 0 solapes en ambas secciones, 0 nodos fuera de sección, 0
instancias rotas, 0 anotaciones dentro de frames, 0 textos recortados sin querer (los recortes que
quedan son desplazamientos intencionales: tablero horizontal, etapas y pestañas en móvil).

Capturas: `docs/design/figma/45-crm-pipeline-*.png`.

Pendiente y avisos:
- El `Badge` del kit (`7:70`) no enlaza `Texto` con la capa de texto en la mayoría de variantes: se
  sobrescribió el texto a mano en cada instancia. Hay que corregirlo en el kit.
- El `Sidebar` no tiene ítem «CRM»; en las pantallas queda activo «Clientes» (en el panel de factura,
  «Finanzas»).
- No se dibujaron la vista Pronóstico ni la reasignación de los 23 leads de Onboarding (F-66).
- Faltaron capturas de algunos estados porque se agotó el cupo del MCP de Figma; los frames existen.

## Figma — tarjeta con acciones, plantillas de pipeline y drawer (2026-09-24)

Tres pedidos del dueño: (A) los íconos de acción rápida siempre visibles en la tarjeta del kanban,
(B) crear pipelines fácilmente desde plantillas y (C) el drawer de la oportunidad con la misma
funcionalidad y las mismas conexiones a la base de datos, pero un poco mejor. El análisis se hizo
leyendo el código; la base de datos solo se consultó con SELECT y conteos. Datos ficticios.

### A. Tarjeta del kanban: qué hace hoy

- Única tarjeta: `OpportunityCardV2.tsx` (135 líneas). Un clic o Enter abre el drawer (`:52-53`). El
  arrastre solo funciona desde el asa (`:63-70`). El avatar es el del **cliente**, no el del vendedor
  (`:73-78`). La tarjeta no tiene menú «⋯» ni prioridad.
- Acciones rápidas: `QuickActionsBar variant="card"` (`:125-127`). **Solo aparecen con hover o foco**:
  `opacity-0 pointer-events-none` + `group-hover:` (`:125`). En pantallas táctiles no se alcanzan,
  porque el toque abre el drawer.
- El orden sale de `ALL_QUICK_ACTIONS` (`quickActionsConfig.ts:13`): Llamar, Email, WhatsApp, Reunión,
  Tarea, Nota. «Propuesta» no está en la tarjeta. Son íconos de 28 px con tooltip (Radix, 200 ms).
  - Deshabilitado con motivo: «El cliente no tiene email» o «El cliente no tiene teléfono» (config `:56-81`).
  - Llamar abre un menú de 3 modos (`:83-103`): navegador (softphone), mi celular (puente) y Agente IA
    (deshabilitado hasta F6).
- La tarjeta no pasa `onActionCompleted` (`:126`): no se refresca hasta el sondeo de 30 s.
- No hay tarjeta ni lista móvil propias: el mismo `KanbanBoardV2` con desplazamiento horizontal.

**Diseño.**
- `OpportunityCard` (`759:22188`) muestra la fila de 6 íconos **en todas las variantes**, sin hover,
  con el mismo orden y las mismas funciones. Las pantallas de kanban existentes se actualizan solas.
- En `Densidad=lista` (móvil) usa la nueva `QuickActionsBar Variant=tarjeta móvil` (`800:25327`), con
  áreas táctiles de 44×40.
- El menú Llamar se abre como popover en escritorio y como hoja en móvil. Un ícono deshabilitado
  muestra el motivo: en tooltip en escritorio y en aviso en móvil.
- Mejora de código: la tarjeta emite `crm:entity-changed` al terminar una acción.

### B. Pipelines y plantillas: cómo funciona hoy

Datos (conteos, 2026-09-24):
- `pipelines`: 14 en total. Son 10 `sales` (7 por defecto, en 8 organizaciones), 3 `onboarding` y 1 `renewal`.
- `stages`: 90 en total. Tienen `sla_days` 47, `exit_criteria` 0 y `description` 0.

Plantillas en código:
- Catálogo: `src/lib/services/crm/pipelineTemplates.ts:39-97` (207 líneas), con estas plantillas:
  - **Ventas** (9 etapas, 10-100 %, cierre ganado en «Contrato/pago» + «Perdido»).
  - **Onboarding** (7 etapas, sin etapa perdida).
  - **Renovación** (6 etapas).
  - **En blanco** (sin etapas).
- Ninguna plantilla trae `exit_criteria`.
- Otros juegos de etapas cableados:
  - `pipelineSeedService.ts:32-43`: 10 etapas distintas de la plantilla Ventas.
  - `onboardingService.ts:12-20`, `renewalService.ts:129-161` y `expansionService.ts:38-89`.
  - El tipo `expansion` existe solo en código.

Flujo actual (`PipelineHeader.tsx`, 612 líneas):
- El selector (`:363-424`) muestra «Por defecto», el tipo y un switch de por defecto, más «Crear Nuevo
  Pipeline» y «Eliminar Pipeline Actual».
- El diálogo (`:465-575`) pide plantilla y nombre.
- En blanco se inserta desde el navegador y cae en `pipeline_type='sales'` por el DEFAULT.
- Las demás plantillas llaman `createPipelineFromTemplate` con el cliente del navegador.
  - **Si ya existe un pipeline de ese tipo, devuelve el existente** y el toast dice «creado» (`:114-155`).
  - Un fallo en las etapas solo deja un `console.warn` (`:193-195`).

Rutas y edición de etapas:
- `GET /api/crm/pipeline-templates` y `POST …/[id]/import` existen, pero ninguna pantalla las usa.
- Etapas:
  - `StageDialog.tsx` edita nombre, probabilidad, color, descripción y ganada/perdida.
  - **No edita `sla_days` ni `exit_criteria`**.
  - Los requisitos viven en Configuración › CRM (`ExitGatesEditor.tsx`), que mezcla las etapas de todos
    los pipelines. Su enlace `?tab=stages` no existe.

Sin embudo de ventas:
- `PipelineView.tsx:64-70` abre el pipeline más antiguo **de cualquier tipo**, sin avisar.
- El vacío solo aparece con cero pipelines.
- Al activar el CRM, `/api/modules` crea Onboarding y Renovación, pero no Ventas.

**Diseño.** El selector muestra etapas y oportunidades abiertas por pipeline y explica por qué
«Eliminar» está deshabilitado. «Nuevo pipeline» es un flujo de 3 pasos:

1. **Galería de plantillas** (`PipelineTemplateCard`): las 4 del catálogo con sus etapas,
   probabilidades, colores y etapas de cierre. Un aviso indica si ya existe un pipeline de ese tipo.
2. **Nombre, tipo, meta y por defecto.** La meta usa `goal_amount`, `goal_currency` (precargada con la
   moneda base de la organización) y `goal_period`. El switch de por defecto explica cuál deja de serlo.
3. **Etapas editables** (`StageEditorRow`): arrastrar, color, nombre, probabilidad, SLA, resultado y
   requisitos, con validación de una etapa ganada, una perdida y probabilidades en orden.

El estado «sin embudo de ventas» abre el mismo flujo con Ventas elegida. El error al crear no deja
nada a medias.

### C. Drawer de la oportunidad: análisis por pestaña

Cómo se abre y cómo carga:
- Camino: `OpportunityCardV2.tsx:52` → `KanbanColumnV2.tsx:69` → `KanbanBoardV2.tsx:228-233` →
  `OpportunityDrawer.tsx`.
  - Es un Sheet a la derecha: `w-full sm:max-w-2xl lg:max-w-3xl`, a pantalla completa en móvil (`:139-140`).
  - Solo lo usa el kanban. En la Tabla, el clic navega al detalle.
- Carga (`useOpportunityData.ts:88-115`):
  - `getOpportunityById` trae `opportunities` con `customer`, `stage` y `pipeline` embebidos. Usa
    `.single()` y no filtra por organización.
  - Luego, en paralelo, `customers` y `stages`.
- Tiempo real: no hay. `opportunities` no está en `realtimeTables.ts`, así que el refresco es manual.
- `notifyMutation` (`:69-73`) solo lo llaman el cambio de etapa, ganar, perder, las acciones rápidas y
  el onboarding.
- Al abrir en Resumen se hacen unas 14 consultas.
- Las pestañas se desmontan al cambiar (Radix sin `forceMount`): cada vuelta recarga todo y la IA
  pierde su resultado.

| Pestaña / zona | Qué muestra y de dónde sale | Acciones y qué escriben | Errores de hoy |
|---|---|---|---|
| **Cabecera** (`DrawerHeader.tsx`) | nombre + temperatura (`:56-57`), enlace al detalle (`:58-60`), cliente con enlace (`:63-66`), monto `formatCurrency(amount, currency‖'COP')` (`:43,68`), «cierra» con `formatPlainDate` (`:69-74`), estado (`:78`), score e ICP (`:86-87`) | `StageSelect` → `PATCH /api/crm/opportunities/{id}/stage` → `changeStage` (`opportunityStageService.ts:94-215`, con gate, `needs_won`/`needs_lost` y bloqueo optimista); Ganada/Perdida (`:89-94`); Editar navega a `/editar` (`OpportunityDrawer.tsx:161`); `QuickActionsBar variant="drawer"` (`:99-101`) | `'COP'` fijo como respaldo; `StageSelect disabled={false}` reabre una cerrada sin avisar; sin «⋯», sin responsable ni probabilidad a la vista; Ganada desde la cabecera escribe `status='won'` desde el navegador **sin mover la etapa** (`ClosedWonDialog.tsx:83-87`); `WonCloseModal` se abre aunque el PATCH falle (`:129`); Perdida sin etapa no pone `closed_at` (`opportunitiesService.ts:595-643`) |
| **Resumen · Seguimiento** (`FollowupSection.tsx`) | `next_contact_at`, `contact_channel`, `contact_result`, `temperature`, `next_action` | «Guardar seguimiento» → `updateOpportunity` desde el navegador, sin filtro de organización (`:89-107`) | hora con el desfase del navegador + `toISOString` (`:60-70,93`); `‖ undefined` impide vaciar; un refetch borra lo escrito (`:81-87`) |
| **Resumen · Información** (`ResumenTab.tsx:81-91`) | monto, cierre, creada, moneda | solo lectura | `created_at` (timestamptz) con `formatPlainDate` (`:27,87`) |
| **Resumen · Equipo y responsable** (`SalesTeamTerritorySelectors.tsx`) | `sales_teams`, `territories`, `organization_members` + `profiles` (`:53-75`) | cada select actualiza `sales_team_id`/`territory_id`/`salesperson_id` desde el navegador (`:117-160`) | la sección se oculta si las 3 listas están vacías, y con ella el responsable (`:188`) |
| **Resumen · Calificación GOC** (`ScoringSection.tsx`) | `scoring_configs` + segunda lectura de `opportunities` (`:40-47`) | guardar → `score_total`, `temperature`, `score_data` (`:103-115`) | el respaldo de error **reescribe todo `metadata`** (`:120-134`); no refresca la cabecera |
| **Resumen · Discovery** (`DiscoverySection.tsx`) | `discovery_templates` + `opportunities.discovery_data` | «Guardar discovery» (`:72-94`); «Configurar» → `DiscoveryConfigDialog` → `saveDiscoveryTemplate` | la plantilla se carga una sola vez; un refetch borra lo escrito; `.maybeSingle()` falla con 2 plantillas activas |
| **Resumen · Objeciones** (`OpportunityObjectionsBlock.tsx`) | `GET /api/crm/objections/opportunity/{id}` | registrar / marcar resuelta (POST/PATCH) | ya va por el servidor, con cargando, vacío y error |
| **Resumen · Cliente** (`:102-121`) | `customers` vía `getCustomerDetails` | «Editar» → `CustomerEditDialog` → `ClientForm` | — |
| **Resumen · condicionales** | Razón de pérdida (`:122-136`); Ficha de handoff con `win_data` (`:137-151`) | solo lectura | el handoff no muestra problemas, expectativas, integraciones ni fecha |
| **Resumen · Líneas** (`:37-52,152-160`) | `opportunity_products`+`products`, `opportunity_spaces`+`spaces`, `opportunity_custom_lines` | enlace «Gestionar líneas en el detalle» | sin estado de carga |
| **Actividad** (`ActividadTab.tsx` → `OpportunityTimeline`) | `GET /api/crm/timeline/opportunity/{id}` → `timelineService.ts:138-166`, 8 fuentes: `activities`, `tasks`, `notes`, `calls`, `email_messages`, `messages` de WhatsApp, `voice_agent_calls` y `opportunity_stage_history`; cursor de 30 | filtros, refrescar, banner de entradas nuevas, «Cargar más», acciones por entrada; en el vacío, `QuickActionsBar` (`:138-145`) | `America/Bogota` fijo (`timeline/utils.ts:44,99,107`); filtros con una sola clave global en localStorage |
| **Tareas** (`TasksSection.tsx`) | `tasks` por `related_to_type='opportunity'` + `related_to_id`, sin filtro de organización (`opportunitiesService.ts:960-976`) | crear rápida (Enter) → `pmService.createTask`; «Avanzado» → `TaskDialog`; marcar → `updateTaskStatus`; eliminar con `window.confirm` → `deleteTask` (los dos últimos sin filtro de organización) | `due_date` (timestamptz) con `formatPlainDate`; sin estado de error (el esqueleto queda fijo); contador solo tras visitarla |
| **Notas** (`NotasTab.tsx`) | `notes` con `profiles:user_id`, fijadas primero (`opportunitiesService.ts:1029-1046`) | «Agregar nota» → `POST /api/crm/notes` (valida organización); fijar → `toggleNotePin` y eliminar → `deleteNote`, desde el navegador, sin filtro y sin confirmar | **el autor nunca se ve** (la UI lee `note.user`, `:79`); fecha con `toLocaleString` del navegador |
| **Documentos** (`DocumentUploader.tsx`) | `documents` por organización + `related_type`/`related_id` (`documentService.ts:100-108`) | subir varios al bucket `crm-documents` + insert; descargar con URL firmada; eliminar sin confirmar | dice «Arrastra» pero no acepta arrastrar (`:243-253`); un error de carga se ve como vacío (`:58-60`); las fechas ya usan `formatDateInTz` |
| **IA** (`IATab.tsx`) | `POST /api/crm/ia/next-action` y `/discovery-summary` (con `getServerOrgContext`) | Generar/Regenerar, Generar resumen, «Crear tarea» → `TaskDialog` compacto; el agente de voz es un marcador de F6 | el resultado no se guarda y se pierde al cambiar de pestaña; las rutas no leen `notes` ni `discovery_data`; comparan la probabilidad con 0,75 (se guarda en %); días en etapa calculados con `updated_at` |
| **Onboarding** (condicional, `onboardingProgress.ts:113-120`) | `/api/crm/onboarding/by-opportunity/{id}` | iniciar checklist, marcar pasos (PATCH), completar | la más sana: todo por el servidor y con la zona de la organización |

No existen hoy como pestaña: contactos, cotizaciones/facturas ni historial. El historial de etapas
aparece como entradas de sistema en Actividad.

**Qué se conserva.**
- El Sheet a la derecha, de 768 px.
- La cabecera con los mismos datos y las mismas acciones.
- Las 6 pestañas en el mismo orden, con Onboarding condicional después de Resumen.
- Cada sección de Resumen con su fuente.
- La misma línea de tiempo, las mismas rutas y los mismos servicios: no se inventa ninguna tabla.

**Qué mejora sin backend nuevo.**
- Cabecera:
  - Probabilidad de la etapa y responsable a la vista (ya vienen en la consulta).
  - `StageBar` clicable con la probabilidad de cada etapa, que avisa si mover una oportunidad cerrada la
    reabre.
  - Menú «⋯» con ícono por acción (reutiliza `OpportunityRowMenu`).
  - Al desplazar, se compacta.
- Pestañas:
  - Se mantienen montadas y los contadores se cargan al abrir.
- Fechas:
  - Captura y visualización en la zona de la organización (seguimiento, creada, vencimiento de tareas,
    notas y línea de tiempo).
- Formularios:
  - Los campos se pueden vaciar y un refetch no borra lo escrito.
  - El responsable se ve siempre.
- Estados:
  - Esqueleto con la forma real, error que distingue «no encontrada o sin acceso» con Reintentar, y
    vacíos con primer paso (Actividad, Tareas, Notas, Documentos).
  - Error de carga visible en Documentos.
- Detalles:
  - Arrastrar y soltar real en Documentos.
  - Confirmación al eliminar tareas, notas y documentos.
  - Autor visible en notas.
  - Ficha de handoff completa.
  - Móvil: hoja a pantalla completa con cabecera compacta fuera de Resumen, pestañas desplazables y hojas
    para «⋯» y para cambiar de etapa.

**Qué requiere backend.**
- Rutas `PATCH`/`DELETE` con organización de la sesión para seguimiento, equipo, score, discovery,
  tareas y notas (hoy son updates desde el navegador sin filtro).
- Scoring sin reescribir `metadata`.
- Ganada/Perdida desde la cabecera por `PATCH /stage` o `markAsWon`, para que la etapa se mueva y
  `closed_at` quede siempre.
- «En la etapa: N días» (consulta a `opportunity_stage_history`).
- Guardar la última sugerencia de IA.
- Rutas de IA que lean `notes` y `discovery_data` y que usen la probabilidad en %.
- Tarea nueva asignada al usuario actual.

**Plantillas y selector (requiere backend).**
- RPC transaccional `create_pipeline_with_stages`: pipeline + etapas + por defecto, todo o nada, y
  validación del rol antes de las etapas de cierre.
- RPC atómica para cambiar el pipeline por defecto (hoy son 2 updates sueltos).
- `createPipelineFromTemplate` que cree uno nuevo aunque el tipo exista.
- `goal_currency` sin el DEFAULT literal `'USD'`.
- Conteo de leads web sin colocar para el aviso «sin embudo de ventas».

### Node ids

Componentes (`02 Componentes` › «CRM (Nuevo)» `759:20897`, bajo el título «Pipelines — plantillas,
editor de etapas y drawer (2026-09-24)»):

| Componente | Id | Propiedades |
|---|---|---|
| `StageEditorRow` | `798:24970` | `Estado=default\|arrastrando\|ganada\|perdida\|error` · `Layout=escritorio\|móvil` |
| `PipelineTemplateCard` | `800:25326` | `Plantilla=Ventas\|Onboarding\|Renovación\|En blanco` · `Estado=default\|seleccionada` · `Mostrar aviso`, `Aviso` |
| `StageBar` | `801:25456` | `Estado=abierta\|ganada\|perdida` · `Layout=escritorio\|móvil` |
| `OpportunityDrawerHeader` | `801:25828` | `Layout=escritorio` (`801:25457`) `\|móvil` (`801:25680`) `\|móvil compacta` (`818:25589`) |
| `QuickActionsBar (CRM)` | `759:21433` | nueva `Variant=tarjeta móvil` (`800:25327`); `tarjeta` reparte los íconos a lo ancho |
| `OpportunityCard` | `759:22188` | la fila de acciones queda visible en las 8 variantes |
| `Sidebar` | `44:3039` | nuevo ítem «CRM» (Icon/UserCheck, como `moduleConfig.ts:139`) después de Clientes: `827:80619`, `827:80638`, `827:80673` |

Pantallas (página «11 CRM», sección `768:454425`):

| Grupo | Frames |
|---|---|
| Tarjeta | kanban con menú Llamar y motivo deshabilitado `812:53241`; móvil con hoja Llamar `812:54748` |
| Plantillas escritorio | selector abierto `812:54821`, paso 1 `816:56539`, paso 2 `816:56990`, paso 3 `816:57260`, sin embudo de ventas `816:57906`, error al crear `816:58273` |
| Plantillas móvil | paso 1 `817:64137`, paso 2 `817:64385`, paso 3 `817:64484`, sin embudo `817:64841` |
| Drawer escritorio | Resumen `820:64894`, Resumen desplazado `820:65664`, Actividad `820:66213`, Tareas `822:235333`, Notas `822:235945`, Documentos `822:236526`, IA `822:237089`, Onboarding `822:237627`, menú «⋯» `822:238154` |
| Drawer estados | cargando `823:245259`, error `823:245319`, Actividad vacía `823:245355`, Tareas vacía `823:245617`, Notas vacía `823:245869`, Documentos con error `823:246103` |
| Drawer móvil | Resumen `824:170975`, Actividad `824:171262`, Tareas `824:171483`, Notas `824:171631`, Documentos `824:171769`, IA `824:171916`, «⋯» `824:172060`, hoja de etapas `824:172249` |

Decisiones del dueño aplicadas en esta ronda:
- **CRM es un ítem propio del menú lateral.** Quedó activo en las 51 instancias de `Sidebar` de la
  sección de Pipeline. En el panel de factura sigue activo «Finanzas».
  - En esta sección `Clientes` ya no queda resaltado. Eso cierra el aviso de la ronda del 2026-09-23.
- **El formulario de oportunidad se abre como panel lateral de 480 px** desde Clientes, Finanzas o chat,
  y en móvil como hoja a pantalla completa.
  - Ya estaba dibujado así: `778:34281`, `778:34520`, `778:34929` y `778:35164`.

Chequeo por script (2026-09-24), sobre 35 frames nuevos, 7.796 instancias y 4.633 textos:
- 0 solapes, 0 nodos fuera de sección, 0 instancias rotas.
- 0 textos recortados sin querer. Los recortes que quedan son desplazamientos a propósito: pestañas y
  filtros en móvil, y el cuerpo del drawer.
- 0 anotaciones dentro de frames.
- La sección de componentes tampoco tiene solapes.

Capturas: `docs/design/figma/46-crm-tarjeta-*.png` (3), `46-crm-plantillas-*.png` (10) y
`46-crm-drawer-*.png` (20).

Pendiente y avisos:
- La sección de leads y actividades (x=20000, de otro agente) sigue resaltando «Clientes» en su
  `Sidebar`. El ítem «CRM» ya existe en el componente; falta que su dueño lo active.
- `Icon/Trophy` dentro de un `Button` primario se ve oscuro: el ícono cambiado no hereda el color
  blanco. Hay que corregirlo en el ícono o en el kit.
- Las capturas `46-crm-drawer-01` y `-02` se tomaron antes de un ajuste menor en el ancho de las
  celdas de datos.
