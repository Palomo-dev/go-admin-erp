# CRM — del Figma al código con el flujo completo conectado

Fecha: 2026-09-29. Análisis sin cambios de código, de base de datos ni de Figma.

Fuentes:

- Figma `EAvjINVRnlzFM70GVoWXgl`, solo lectura (`get_metadata`, `get_screenshot`).
  - Inventario tomado a las **22:58 UTC** y verificado sin cambios a las **23:02 UTC**.
  - Otros agentes están añadiendo secciones nuevas de CRM mientras se escribe esto. Lo que aparezca
    después de esa hora no está aquí.
- Repositorio local (`src/**`).
- Base Supabase `jgmgphmzusbluqhuqihj`, solo `SELECT` y conteos por MCP.
- Documentos previos, que este plan complementa y no repite:
  - [`docs/design/CRM-OPORTUNIDADES-LEADS-PIPELINE.md`](../design/CRM-OPORTUNIDADES-LEADS-PIPELINE.md):
    análisis del 23 y 24 de septiembre, decisiones del dueño y node ids del diseño.
  - [`docs/design/AUDITORIA-CONTROLES-CLIENTES-CRM.md`](../design/AUDITORIA-CONTROLES-CLIENTES-CRM.md):
    control por control, con archivo y línea.
  - [`docs/crm-revenue-os/`](../crm-revenue-os/): plan V4 del CRM, fases 00–16 y `BRIEF-UX-CRM.md`.

Sin datos de organizaciones clientes: solo conteos. Los ejemplos del Figma son ficticios.

> **Regla del dueño (2026-09-29): qué se puede implementar.**
>
> - Al código solo pasa el diseño de CRM que **ya existía y está aprobado**.
> - Las secciones nuevas que otros agentes crean hoy en Figma **no se implementan** hasta que el
>   dueño las revise y apruebe:
>   - «CRM · Telefonía y llamadas (Nuevo)»;
>   - «CRM · IA y automatización (Nuevo)»;
>   - «CRM · Red y gestión (Nuevo)».
> - Todo frame o sección de CRM que diga **«propuesta»** tampoco es implementable hasta su
>   aprobación.
>
> En este documento:
>
> - **Implementable:**
>   - la sección «CRM — Leads, actividades y acciones rápidas» (`765:446568`, 36 frames);
>   - los componentes de «02 Componentes › CRM (Nuevo)» (`759:20897`), que existen desde el 23-sep.
> - **No implementable hasta aprobación:**
>   - la sección «CRM — Pipeline y oportunidades **(propuesta)**» (`768:454425`, 97 frames);
>   - las tres secciones nuevas.
>
> Todo lo no implementable está listado en §1.4. En las olas (§7) va aparte, como **ola 3B
> bloqueada**.

> **Árbol compartido.** Hay trabajo de otra sesión sin commit en el importador de leads:
> - `src/app/app/crm/leads/importar/`, `src/app/api/crm/leads/importar/` y `src/components/crm/leads/importar/`;
> - `src/lib/crm/importacionLeads/`, `src/lib/importacion/`;
> - `leadCreateService.ts`, `leadCustomer.ts`, `leadsImportService.ts` y `leadsImportLookup.ts`;
> - `messages/*.json`.
>
> Ninguna ola de este plan debe tocar esos archivos hasta que esa sesión los suba.

---

## 0. Resumen

### 0.1 Conteos

| Qué | Cuántos |
|---|---|
| Páginas de Figma con CRM | 1 página propia, **«11 CRM»** (`759:17`), con 2 secciones, más la sección de componentes «CRM (Nuevo)» en «02 Componentes» |
| Frames de pantalla en «11 CRM» (existentes a las 23:02 UTC) | **133**: 75 de escritorio, 49 de móvil y 9 entre drawer de 768 px y láminas de anotación |
| — implementables | **36**: sección «Leads, actividades y acciones rápidas» (`765:446568`) |
| — no implementables hasta aprobación | **97**: sección «Pipeline y oportunidades **(propuesta)**» (`768:454425`) |
| Secciones nuevas de hoy (pendientes de aprobación, fuera de las olas) | 3, detectadas entre las 23:11 y las 23:12 UTC: «CRM · IA y automatización (Nuevo)» `1295:767945` y «CRM · Red y gestión (Nuevo)» `1295:767955`, las dos en «11 CRM» y todavía sin frames; «CRM — Telefonía y llamadas (Nuevo)» `1295:36609`, en «02 Componentes», con 12 íconos y 6 sets en construcción |
| Componentes CRM en Figma | **20 sets con 120 variantes**, más 3 íconos. Se reutilizan además 4 componentes de la sección «Clientes» y unos 18 del kit |
| Componentes Figma de CRM que ya existen en código con ese nombre | 3 de 20: `QuickActionsBar`, `OpportunityForm` y `TimelineFilters`. Los tres son parciales |
| Rutas de página del CRM | 34 `page.tsx` bajo `src/app/app/crm/**`, con 19 entradas de menú en `src/config/crmNav.ts` |
| Rutas API del CRM | 175 `route.ts` bajo `src/app/api/crm/**` |
| Código de componentes CRM | 402 archivos y **64.077 líneas** en 34 carpetas de `src/components/crm/**` |
| Servicios CRM | 221 archivos en `src/lib/services/crm/**` |
| Pruebas que tocan el CRM | 214 archivos `*.test.ts(x)`; 124 están en `src/lib/services/crm/__tests__` |
| i18n | Namespace `crm` con **94 claves**. Solo 4 archivos del CRM usan `useTranslations`: el resto del texto está cableado en español |
| Tablas de BD que usa el CRM | unas 95; §3 lista las que importan a las pantallas del Figma |
| Pantallas del menú CRM **sin diseño** en Figma | **14 de 19** entradas de menú (§6) |

### 0.2 Las 10 brechas más importantes

1. **La página Leads del Figma y la del código muestran cosas distintas.**
   - El Figma lista personas y empresas con `customers.lifecycle_stage='lead'` (35.159 hoy), con
     paginación en servidor. Lo decidió el dueño el 2026-09-23.
   - El código lista `opportunities.record_type='lead'` (42 filas, de 2 organizaciones), vía
     `GET /api/crm/leads`.
   - Hay que rehacer la ruta, la pantalla y la acción principal, que pasa de «Convertir a deal» a
     «Calificar → crear oportunidad».
2. **Faltan datos en `customers` para la fila de lead.** El Figma muestra en la tabla de leads
   Origen, Responsable, Score, Último contacto y «Descartar lead». La tabla `customers` no tiene:
   - dueño;
   - origen: solo 6 filas lo guardan en `metadata.source`;
   - score;
   - último contacto;
   - estado de descarte: el CHECK de `lifecycle_stage` solo admite
     `lead|opportunity|customer|churned`.

   Hace falta una migración aditiva (§7.3, M1).
3. **El estado «sin embudo de ventas» es la norma, no la excepción.**
   - 44 de las 49 organizaciones con el módulo CRM activo no tienen ningún pipeline
     `pipeline_type='sales'`.
   - El Figma lo dibuja en 6 frames y resuelve el caso con el asistente «Nuevo pipeline» de 3 pasos.
   - En el código, el pipeline se crea y se borra desde el navegador (`PipelineHeader.tsx:233-313`).
     `GET /api/crm/pipeline-templates` existe y ninguna pantalla lo usa.
4. **No hay ruta de servidor para crear ni editar una oportunidad.**
   - `opportunitiesService.ts` (1.092 líneas) escribe con `@/lib/supabase/config`, el cliente de
     navegador: crear, editar, perder, borrar, duplicar, tareas y notas.
   - Solo pasan por el servidor el cambio de etapa (`PATCH /api/crm/opportunities/[id]/stage`) y los
     leads.
   - El formulario único del Figma, con `Origen=general|cliente|factura|conversación|lead`, necesita
     `POST` y `PATCH /api/crm/opportunities` antes que la interfaz.
5. **Permisos resueltos en el cliente, o no resueltos.**
   - Ninguna pantalla del CRM usa `usePermission(s)`. Hay 0 archivos.
   - El Figma dibuja el estado «sin permiso» en 12 frames y pide `MoveStageDialog Resultado=sin permiso`.
   - En el catálogo `permissions` solo existen `crm.customers.*`, `crm.contacts.*`, `crm.leads.*` y
     `crm.jobs.*`. No hay permisos de oportunidades, etapas, pipelines ni actividades.
   - `stagePermissions.ts` decide por id de rol `[1,2,5]`.
6. **Perder no mueve de etapa y se escribe desde el navegador.**
   - `markAsLost` hace un `update` directo (`opportunitiesService.ts:585-633`). Ya fusiona `metadata`,
     pero no mueve a la etapa `is_lost` ni pasa por el servidor.
   - Ganar ya va por `PATCH …/stage`.
   - El Figma unifica los dos en `WinDialog` y `LoseDialog`. El código tiene todavía:
     - para ganar: `ClosedWonDialog`, `WonCloseModal` y `MarkWonFlow`;
     - para perder: `StructuredLossDialog` y `LossReasonDialog`.
7. **La página Actividades del Figma no calza con el código.**
   - El Figma pide una línea de tiempo agrupada por día, con 9 tipos y KPIs, y un `ActivityDialog`
     por tipo.
   - El código es una tabla (`ActividadesTable`) cuyo editar y borrar van **directo desde el
     navegador** (`ActividadesService.ts:233,246`). La ruta `/api/crm/activities` solo tiene `POST`.
   - La RLS deja a cualquier miembro editar o borrar la actividad de otro.
   - Las fechas salen con `Intl` `es-ES`, sin zona horaria (`ActividadesTable.tsx:75`).
8. **Cuatro líneas de tiempo y zona horaria cableada.**
   - `timeline/utils.ts:44,99,107` fija `America/Bogota` por defecto.
   - 6 llamadores no pasan la zona horaria de la organización: secuencias, automatizaciones, referidos
     y trabajos.
   - La ficha `/app/clientes/[id]` sigue con el `TimelineTab` viejo, sin notas, llamadas ni correos.
   - Hay **dos fichas de cliente**: `/app/clientes/[id]` y `/app/crm/clientes/[id]`, de 487 líneas.
     El Figma dibuja una sola.
9. **Kit CRM por construir.** 17 de los 20 componentes del Figma no existen en código:
   - `OpportunityCard`, `StageColumn`, `KpiMoneda` y `OpportunityRowMenu`;
   - `LeadRow`, `QualifyLeadDialog`, `CaptureBanner`, `CargarMas` y `ActivityDialog`;
   - `CustomerLinkPicker`, `WinDialog`, `LoseDialog` y `MoveStageDialog`;
   - `StageEditorRow`, `PipelineTemplateCard`, `StageBar` y `OpportunityDrawerHeader`.

   El kit general `src/components/kit` sí trae la base que el diseño reutiliza: `PageHeader`,
   `StatCard`, `KpiCompacto`, `FilterChips`, `Pagination`, `BulkActionBar`, `EmptyState`,
   `ListCard`, `RowActionsMenu`, `CustomerPicker` y `PanelAdaptable`.
10. **Conexiones del flujo sin pantalla.**
    - `getOpportunityFinance360` (`/api/crm/finance/[type]/[id]`) no la usa ninguna pantalla. El Figma
      la pinta como tarjeta «Conexiones» del detalle.
    - `calendar_events` no tiene `opportunity_id`: una reunión no aparece en la oportunidad.
    - Ninguna ficha de cliente tiene «Nueva oportunidad».
    - Finanzas y Chat no abren el formulario con `Origen=factura|conversación`.
    - `opportunity_stage_history` tiene 1 fila para 70 oportunidades, así que «días en etapa» no tiene
      historia.

> **Aviso sobre las brechas 3–6 y 9–10.** Describen pantallas cuyo diseño está en la sección
> «(propuesta)»: Pipeline, Oportunidades, detalle, drawer, formulario y diálogos. El análisis vale,
> pero **su reemplazo visual espera la aprobación del dueño** (ola 3B). Los arreglos de backend y
> seguridad que no dependen del diseño sí van en la ola 1: escrituras desde el navegador, permisos y
> funciones SQL heredadas.

### 0.3 Plan por olas

| Ola | Qué | Tamaño | Depende de |
|---|---|---|---|
| 0 | Decisiones del dueño (**incluida la aprobación de la sección «propuesta», D7**) y pruebas de caracterización de los flujos vivos | S | — |
| 1 | Backend: permisos, RPC transaccionales, rutas de servidor y migraciones. Los pasos solo al servicio de la ola 3B van marcados | L | 0 |
| 2 | Kit CRM: los 20 componentes de «CRM (Nuevo)», con lógica pura probada e i18n | L | 0 (en paralelo con 1) |
| **3A** | **Implementable ya:** Leads (incluido «Calificar» → `OpportunityForm Origen=lead`), Actividades, acciones rápidas y entradas de la ficha del cliente, todo de la sección `765:446568` | L | 1 y 2 |
| **3B** | **Bloqueada hasta aprobación:** Pipeline kanban y tabla, «Nuevo pipeline» con plantillas, drawer, Oportunidades, detalle, formulario en página y diálogos de etapa, todo de la sección `768:454425` «(propuesta)» | XL | 1, 2 y **D7** |
| 4 | Puntos de entrada cruzados: Finanzas y Chat, cuyos frames están en la sección «propuesta», así que siguen a la 3B; POS; GO Assistant | M–L | 3A (ficha) y 3B (resto) |
| 5 | Limpieza de código muerto y duplicados; guardarraíles nuevos | M | 3A y 3B |
| 6 | Módulos sin diseño aprobado, incluidas las 3 secciones nuevas de hoy: solo higiene (fechas, i18n, servidor) hasta que el dueño apruebe su Figma | M por módulo | aprobación |

---

## 1. Inventario de Figma

### 1.1 Páginas y secciones

La API de metadatos solo lista las páginas cargadas: `01 Sistema` y `02 Componentes`. La página de
CRM se localizó por su id, que está documentado.

| Página | Sección | Id | Tamaño | Contenido |
|---|---|---|---|---|
| 11 CRM | CRM — Leads, actividades y acciones rápidas | [`765:446568`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=765-446568) | 9.600 × 9.551 | 36 frames |
| 11 CRM | CRM — Pipeline y oportunidades (propuesta) | [`768:454425`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-454425) | 15.280 × 23.330 | 97 frames. **No implementable hasta aprobación** (dice «propuesta») |
| 11 CRM | CRM · IA y automatización (Nuevo) | [`1295:767945`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-767945) | — | **Nueva hoy (23:11 UTC), pendiente de aprobación.** Solo título y 7 filas: Agentes IA, Automatizaciones, Segmentos, Campañas, Plantillas, Secuencias y Objeciones |
| 11 CRM | CRM · Red y gestión (Nuevo) | [`1295:767955`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-767955) | — | **Nueva hoy (23:11 UTC), pendiente de aprobación.** Solo título y subtítulo, sin frames |
| 02 Componentes | CRM — Telefonía y llamadas (Nuevo) | [`1295:36609`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-36609) | — | **Nueva hoy (23:12 UTC), pendiente de aprobación.** 12 íconos de telefonía y los sets `Softphone/Tecla`, `Softphone/Control`, `Softphone/BotonLlamada`, `Llamada/ResultadoOpcion`, `Llamada/Reproductor` y `Llamada/SegmentoTranscripcion` |
| 02 Componentes | CRM (Nuevo) | [`759:20897`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-20897) | 4.640 × 21.000 | 20 sets y 3 íconos |
| 02 Componentes | Clientes | [`223:7911`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=223-7911) | — | `CustomerIdentityCard`, `TimelineEntry`, `QuickActionsBar`, `CustomerPicker` y otros, que el CRM reutiliza |
| 02 Componentes | Teléfono — PhoneInput (Nuevo) | [`717:17024`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=717-17024) | — | `PhoneInput` (para formularios de lead y cliente) |
| 06 Clientes | (ver `docs/design/PARIDAD-CLIENTES.md`) | — | — | Catálogo y ficha del cliente. Fuera del alcance de este plan salvo las entradas de CRM (§4.11) |

**Aprobación.**

- Ningún nodo lleva marca de aprobación. Se buscaron «aprobado», «revisado», «✓» y «listo para» en
  nombres de nodo: nada.
- La sección de Pipeline se llama «(propuesta)». La de Leads y actividades no lleva calificativo.
- Las decisiones del dueño del 23 y el 24 de septiembre están aplicadas en el diseño, según
  `CRM-OPORTUNIDADES-LEADS-PIPELINE.md` §Decisiones:
  - CRM como ítem propio del menú;
  - formulario único como panel de 480 px;
  - Leads = personas y empresas;
  - KPI en moneda base con desglose.
- **Por la regla del dueño, la sección «(propuesta)» no se implementa hasta que la apruebe
  expresamente.** Es el bloqueo principal del plan (D7). Los estados de sus frames están en §1.4.

**Pendientes que el propio diseño declara** (doc de diseño §Pendiente):

- no hay vista Pronóstico;
- no hay pantalla de reasignación de los 23 leads que están en un embudo de onboarding;
- no hay `TaskForm` único (es del agente de PM);
- no hay ficha del cliente en móvil;
- `Badge` no enlaza `Texto`;
- `Icon/Trophy` no hereda el blanco dentro de un botón primario;
- la sección de Leads sigue resaltando «Clientes» en el `Sidebar`.

**Duplicado en el propio Figma.** Hay dos componentes `QuickActionsBar`:

- `329:108300`, en la sección Clientes;
- `759:21433`, en la sección CRM.

Hay que pedir a diseño que uno sea instancia del otro.

### 1.2 Componentes CRM (`02 Componentes › CRM (Nuevo)`)

| Componente | Id | Variantes | Reemplaza en código | Existe hoy |
|---|---|---|---|---|
| Íconos `Icon/Trophy`, `Icon/ListPlus`, `Icon/Kanban` | [`759:20898`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-20898) | 3 | lucide `Trophy`, `ListPlus`, `Kanban` | sí (lucide) |
| `QuickAction` | [`759:21219`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-21219) | 24: Acción (6) × Formato botón/ícono × Estado default/deshabilitado | botones de `QuickActionsBar.tsx` | parcial: los motivos ya están en `quickActionsConfig.ts`; Llamar nunca se deshabilita |
| `QuickActionsBar (CRM)` | [`759:21433`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-21433) | 5: tarjeta, drawer, detalle, cliente, tarjeta móvil | `shared/QuickActionsBar.tsx` (258 líneas) | parcial: faltan `cliente` y `tarjeta móvil`, y en la tarjeta solo aparece con hover |
| `OpportunityRowMenu` | [`759:21624`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-21624) | 2: abierta, cerrada | menús de `OpportunitiesTable`, `TableView` y `DetailHeader` | no; base en kit `RowActionsMenu` |
| `OpportunityCard` | [`759:22188`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-22188) | 8: normal, acciones, arrastrando, vencida, ganada y perdida en kanban; normal y vencida en lista | `pipeline/OpportunityCardV2.tsx` | parcial: faltan responsable, prioridad, días en etapa y acciones siempre visibles |
| `StageColumn` | [`759:22544`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-22544) | 4: normal, destino, vacía, cargando | `KanbanColumnV2` | parcial |
| `KpiMoneda` | [`759:22664`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-22664) | 3: completo, falta tasa, desglose | `OpportunitiesStats` y totales del kanban | no |
| `LeadRow` | [`759:444712`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-444712) | 4: encabezado, normal, seleccionada, cargando | tabla de `leads/page.tsx` | no |
| `QualifyLeadDialog` | [`759:445219`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-445219) | 2: dialog, sheet | confirmación «Convertir a deal» | no |
| `CaptureBanner` | [`759:444768`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-444768) | 2: escritorio, móvil | — | no |
| `TimelineFilters` | [`759:444935`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-444935) | 2: escritorio, móvil | `timeline/TimelineFilters.tsx` | parcial |
| `CargarMas` | [`759:444795`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=759-444795) | 3: listo, cargando, fin | «Cargar más» de `OpportunityTimeline` | no, como componente |
| `ActivityDialog` | [`760:445129`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=760-445129) | 10: llamada, correo, whatsapp, reunión y nota, en dialog y sheet | `ActividadForm` (526 líneas), `ComposeEmailDialog`, `ComposeWhatsAppDialog`, `MeetingDialog` y `QuickNoteDialog` | no; hoy son 5 diálogos distintos |
| `CustomerLinkPicker` | [`761:23596`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=761-23596) | 7: buscar (Todos, Personas, Empresas), crear, cargo, sin resultados, cargando | `CustomerSearchSelect`, `CompanyContactsManager` y otros 6 selectores de cliente | no; base en kit `CustomerPicker` + `GET /api/crm/customers/search` (RPC `fn_clientes_buscar`) |
| `WinDialog` | [`761:23994`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=761-23994) | 4: ficha, acciones y resumen en dialog; ficha en sheet | `ClosedWonDialog` + `WonCloseModal` + `MarkWonFlow` | no |
| `LoseDialog` | [`761:24268`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=761-24268) | 3: simple y competencia en dialog; simple en sheet | `StructuredLossDialog` + `LossReasonDialog` | no |
| `MoveStageDialog` | [`761:24498`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=761-24498) | 3: confirmar, gate, sin permiso | `GateWarningDialog` | no |
| `OpportunityForm` | [`766:448739`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=766-448739) | 9: page crear y editar; dialog general, cliente y lead; sheet cliente, factura, conversación y lead | `oportunidades/OpportunityForm.tsx` (1.201 líneas) + `CreateOpportunityDialog` | parcial: no tiene `Layout=sheet` ni `Origen`, y es un solo archivo de 1.201 líneas |
| `StageEditorRow` | [`798:24970`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=798-24970) | 10: default, arrastrando, ganada, perdida y error, en escritorio y móvil | `StageDialog`, `ExitGatesEditor` | no |
| `PipelineTemplateCard` | [`800:25326`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=800-25326) | 8: Ventas, Onboarding, Renovación y En blanco, cada una default o seleccionada | diálogo de `PipelineHeader` | no |
| `StageBar` | [`801:25456`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=801-25456) | 4: abierta, ganada y perdida en escritorio; abierta en móvil | embudo de `DetailHeader` y `StageSelect` del drawer | no |
| `OpportunityDrawerHeader` | [`801:25828`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=801-25828) | 3: escritorio, móvil, móvil compacta | `drawer/DrawerHeader.tsx` | no |

Componentes reutilizados de otras secciones:

- `CustomerIdentityCard`
  ([`329:108665`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=329-108665)).
- `TimelineEntry`
  ([`329:109173`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=329-109173)), con
  `Tipo=reunión` y `llamada IA` añadidos.
- `CustomerPicker`
  ([`192:11644`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=192-11644)).
- `ContactoVinculadoRow`
  ([`329:109310`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=329-109310)).
- `PhoneInput`
  ([`724:18240`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=724-18240)).
- `TaskQuickView` `626:14723`, del agente de PM.
- Del kit:
  - estructura: `PageHeader`, `Sidebar`, `AppHeader`, `MobileHeader` y `MobileTabBar`;
  - datos: `StatCard`, `KpiCompacto` y `ListCard`;
  - búsqueda y filtros: `SearchBar`, `FilterButton` y `Chip`;
  - listas: `Pagination` y `BulkActionBar`;
  - estados y menús: `EmptyState`, `MenuItem`, `ConfirmDialog` y `Toast`.

### 1.3 Pantallas (133 frames)

El «estado» se deduce del nombre del frame. «Escritorio 1440» lleva `Sidebar` + `AppHeader`;
«Móvil 390» lleva `MobileHeader` + `MobileTabBar`.

#### Sección «CRM — Leads, actividades y acciones rápidas» (`765:446568`) — 36 frames

| # | Frame | Plataforma | Estado que representa | Enlace |
|---|---|---|---|---|
| 1 | Escritorio / Leads — listo | Escritorio 1440 | listo | [`765:446571`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=765-446571) |
| 2 | Escritorio / Leads — selección masiva | Escritorio 1440 | selección masiva | [`765:447453`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=765-447453) |
| 3 | Escritorio / Leads — leads sin colocar (sin embudo de ventas) | Escritorio 1440 | sin embudo de ventas | [`765:448463`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=765-448463) |
| 4 | Escritorio / Leads — detalle rápido (hoja) | Escritorio 1440 | hoja/diálogo | [`767:2873`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=767-2873) |
| 5 | Escritorio / Leads — calificar (paso 1) | Escritorio 1440 | asistente (paso) | [`767:3240`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=767-3240) |
| 6 | Escritorio / Leads — cargando | Escritorio 1440 | cargando | [`767:3470`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=767-3470) |
| 7 | Escritorio / Leads — vacío (primer paso) | Escritorio 1440 | vacío | [`767:4403`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=767-4403) |
| 8 | Escritorio / Leads — búsqueda sin resultados | Escritorio 1440 | sin resultados | [`767:5218`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=767-5218) |
| 9 | Escritorio / Leads — error | Escritorio 1440 | error | [`767:6038`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=767-6038) |
| 10 | Escritorio / Leads — sin permiso | Escritorio 1440 | sin permiso | [`767:6852`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=767-6852) |
| 11 | Móvil / Leads — listo | Móvil 390 | listo | [`768:6419`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-6419) |
| 12 | Móvil / Leads — cargando más | Móvil 390 | cargando | [`768:7017`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-7017) |
| 13 | Móvil / Leads — selección masiva | Móvil 390 | selección masiva | [`768:7203`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-7203) |
| 14 | Móvil / Leads — detalle rápido (hoja) | Móvil 390 | hoja/diálogo | [`768:7837`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-7837) |
| 15 | Móvil / Leads — calificar (paso 1) | Móvil 390 | asistente (paso) | [`768:8063`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-8063) |
| 16 | Móvil / Leads — leads sin colocar | Móvil 390 | sin embudo de ventas | [`768:8277`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-8277) |
| 17 | Móvil / Leads — búsqueda sin resultados | Móvil 390 | sin resultados | [`768:8590`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-8590) |
| 18 | Móvil / Leads — vacío (primer paso) | Móvil 390 | vacío | [`768:8738`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-8738) |
| 19 | Escritorio / Actividades — listo | Escritorio 1440 | listo | [`769:12376`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=769-12376) |
| 20 | Escritorio / Actividades — menús «Nueva actividad» y «⋯» | Escritorio 1440 | menú abierto | [`769:13036`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=769-13036) |
| 21 | Escritorio / Actividades — registrar llamada | Escritorio 1440 | diálogo (ActivityDialog llamada) | [`769:13655`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=769-13655) |
| 22 | Escritorio / Actividades — editar nota | Escritorio 1440 | diálogo (ActivityDialog nota) | [`769:13838`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=769-13838) |
| 23 | Escritorio / Actividades — eliminar | Escritorio 1440 | confirmación | [`769:13935`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=769-13935) |
| 24 | Escritorio / Actividades — cargando | Escritorio 1440 | cargando | [`770:15494`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-15494) |
| 25 | Escritorio / Actividades — vacío (primer paso) | Escritorio 1440 | vacío | [`770:16039`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-16039) |
| 26 | Escritorio / Actividades — sin resultados | Escritorio 1440 | sin resultados | [`770:16578`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-16578) |
| 27 | Móvil / Actividades — listo | Móvil 390 | listo | [`770:17115`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-17115) |
| 28 | Móvil / Actividades — nueva actividad (hoja de tipos) | Móvil 390 | hoja/diálogo | [`770:17351`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-17351) |
| 29 | Móvil / Actividades — enviar WhatsApp (hoja) | Móvil 390 | hoja/diálogo | [`770:17452`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-17452) |
| 30 | Escritorio / Ficha del cliente — Oportunidades con «Nueva oportunidad» | Escritorio 1440 | listo | [`772:19838`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=772-19838) |
| 31 | Escritorio / Ficha del cliente — Nueva oportunidad (hoja, Origen=cliente) | Escritorio 1440 | hoja/diálogo | [`772:20628`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=772-20628) |
| 32 | Escritorio / Ficha del cliente — vacío (cliente sin actividad) corregido | Escritorio 1440 | vacío | [`772:20971`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=772-20971) |
| 33 | Escritorio / Ficha del cliente — crear la primera tarea (TaskForm Origen=cliente) | Escritorio 1440 | vista rápida (TaskQuickView) | [`772:21523`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=772-21523) |
| 34 | Escritorio / Leads — calificar (paso 2: OpportunityForm) | Escritorio 1440 | asistente (paso) | [`772:21705`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=772-21705) |
| 35 | Acciones rápidas — un solo componente en cuatro lugares | Escritorio 1440 | lámina de uso (anotación) | [`773:472568`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-472568) |
| 36 | Acciones rápidas — qué hace cada botón | Anotación / lámina 3320×1518 | lámina de uso (anotación) | [`773:472975`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-472975) |

#### Sección «CRM — Pipeline y oportunidades (propuesta)» (`768:454425`) — 97 frames

> **No implementable hasta aprobación del dueño**: la sección dice «propuesta». Se inventaría para
> analizar brechas y preparar el backend. Ningún frame de esta tabla entra en la ola 3A.

| # | Frame | Plataforma | Estado que representa | Enlace |
|---|---|---|---|---|
| 1 | Escritorio / Pipeline kanban — listo | Escritorio 1440 | listo | [`768:454428`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-454428) |
| 2 | Escritorio / Pipeline kanban — arrastrando | Escritorio 1440 | arrastrando | [`768:456094`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-456094) |
| 3 | Escritorio / Pipeline kanban — acciones rápidas y menú «⋯» | Escritorio 1440 | menú abierto | [`768:457615`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-457615) |
| 4 | Escritorio / Pipeline — vista Tabla con selección | Escritorio 1440 | selección masiva | [`768:459368`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-459368) |
| 5 | Escritorio / Pipeline kanban — cargando | Escritorio 1440 | cargando | [`770:462337`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-462337) |
| 6 | Escritorio / Pipeline kanban — vacío (primer paso) | Escritorio 1440 | vacío | [`770:463421`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-463421) |
| 7 | Escritorio / Pipeline kanban — sin resultados | Escritorio 1440 | sin resultados | [`770:464381`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-464381) |
| 8 | Escritorio / Pipeline kanban — error | Escritorio 1440 | error | [`770:464677`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-464677) |
| 9 | Escritorio / Pipeline kanban — sin permiso | Escritorio 1440 | sin permiso | [`770:464982`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-464982) |
| 10 | Escritorio / Pipeline kanban — sin embudo de ventas | Escritorio 1440 | sin embudo de ventas | [`770:465308`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=770-465308) |
| 11 | Móvil / Pipeline — listo | Móvil 390 | listo | [`771:37311`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=771-37311) |
| 12 | Móvil / Pipeline — cargando | Móvil 390 | cargando | [`771:37831`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=771-37831) |
| 13 | Móvil / Pipeline — vacío | Móvil 390 | vacío | [`771:37994`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=771-37994) |
| 14 | Móvil / Pipeline — sin resultados | Móvil 390 | sin resultados | [`771:38193`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=771-38193) |
| 15 | Móvil / Pipeline — error | Móvil 390 | error | [`771:38433`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=771-38433) |
| 16 | Móvil / Pipeline — sin permiso | Móvil 390 | sin permiso | [`771:38566`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=771-38566) |
| 17 | Móvil / Pipeline — sin embudo de ventas | Móvil 390 | sin embudo de ventas | [`771:38704`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=771-38704) |
| 18 | Escritorio / Oportunidades — listo | Escritorio 1440 | listo | [`773:23160`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-23160) |
| 19 | Escritorio / Oportunidades — selección masiva | Escritorio 1440 | selección masiva | [`773:24723`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-24723) |
| 20 | Escritorio / Oportunidades — menú «⋯» abierto | Escritorio 1440 | menú abierto | [`773:25279`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-25279) |
| 21 | Escritorio / Oportunidades — cargando | Escritorio 1440 | cargando | [`773:25720`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-25720) |
| 22 | Escritorio / Oportunidades — vacío (primer paso) | Escritorio 1440 | vacío | [`773:26314`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-26314) |
| 23 | Escritorio / Oportunidades — sin resultados | Escritorio 1440 | sin resultados | [`773:26719`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-26719) |
| 24 | Escritorio / Oportunidades — error | Escritorio 1440 | error | [`773:27128`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-27128) |
| 25 | Escritorio / Oportunidades — sin permiso | Escritorio 1440 | sin permiso | [`773:27539`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=773-27539) |
| 26 | Móvil / Oportunidades — listo | Móvil 390 | listo | [`775:471491`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-471491) |
| 27 | Móvil / Oportunidades — menú «⋯» (hoja) | Móvil 390 | hoja/diálogo | [`775:471915`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-471915) |
| 28 | Móvil / Oportunidades — cargando | Móvil 390 | cargando | [`775:472274`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-472274) |
| 29 | Móvil / Oportunidades — vacío | Móvil 390 | vacío | [`775:472436`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-472436) |
| 30 | Móvil / Oportunidades — sin resultados | Móvil 390 | sin resultados | [`775:472586`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-472586) |
| 31 | Móvil / Oportunidades — error | Móvil 390 | error | [`775:472808`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-472808) |
| 32 | Móvil / Oportunidades — sin permiso | Móvil 390 | sin permiso | [`775:472941`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-472941) |
| 33 | Escritorio / Detalle de oportunidad — Actividad | Escritorio 1440 | listo | [`775:473076`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-473076) |
| 34 | Escritorio / Detalle de oportunidad — Tareas | Escritorio 1440 | listo | [`775:473990`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-473990) |
| 35 | Escritorio / Detalle de oportunidad — cargando | Escritorio 1440 | cargando | [`775:474532`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-474532) |
| 36 | Escritorio / Detalle de oportunidad — no encontrada | Escritorio 1440 | no encontrada | [`775:474947`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-474947) |
| 37 | Escritorio / Detalle de oportunidad — sin permiso | Escritorio 1440 | sin permiso | [`775:475356`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=775-475356) |
| 38 | Escritorio / Pipeline — drawer de oportunidad | Escritorio 1440 | drawer | [`776:30540`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=776-30540) |
| 39 | Móvil / Detalle de oportunidad — Actividad | Móvil 390 | listo | [`776:30808`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=776-30808) |
| 40 | Móvil / Detalle de oportunidad — Resumen | Móvil 390 | listo | [`776:31106`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=776-31106) |
| 41 | Móvil / Detalle de oportunidad — cargando | Móvil 390 | cargando | [`776:31417`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=776-31417) |
| 42 | Móvil / Detalle de oportunidad — no encontrada | Móvil 390 | no encontrada | [`776:31523`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=776-31523) |
| 43 | Móvil / Detalle de oportunidad — sin permiso | Móvil 390 | sin permiso | [`776:31652`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=776-31652) |
| 44 | Escritorio / Nueva oportunidad — página | Escritorio 1440 | formulario (página) | [`778:32176`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=778-32176) |
| 45 | Escritorio / Editar oportunidad — página | Escritorio 1440 | formulario (página, edición) | [`778:33132`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=778-33132) |
| 46 | Escritorio / Pipeline — Nueva oportunidad (diálogo desde «+» de columna) | Escritorio 1440 | diálogo | [`778:33942`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=778-33942) |
| 47 | Escritorio / Clientes › ficha › Oportunidades — Nueva oportunidad (panel) | Escritorio 1440 | panel lateral | [`778:34281`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=778-34281) |
| 48 | Escritorio / Finanzas › factura de venta — Crear oportunidad (panel) | Escritorio 1440 | panel lateral | [`778:34520`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=778-34520) |
| 49 | Móvil / Nueva oportunidad — desde ficha del cliente | Móvil 390 | hoja (OpportunityForm sheet) | [`778:34929`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=778-34929) |
| 50 | Móvil / Nueva oportunidad — desde conversación | Móvil 390 | hoja (OpportunityForm sheet) | [`778:35164`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=778-35164) |
| 51 | Escritorio / Pipeline — Soltar en Ganada → WinDialog (ficha de venta) | Escritorio 1440 | diálogo | [`779:36778`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-36778) |
| 52 | Escritorio / Pipeline — WinDialog — qué hacer al ganar | Escritorio 1440 | diálogo | [`779:36974`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-36974) |
| 53 | Escritorio / Pipeline — WinDialog — resumen | Escritorio 1440 | diálogo | [`779:37122`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-37122) |
| 54 | Escritorio / Pipeline — Soltar en Perdida → LoseDialog (competencia) | Escritorio 1440 | diálogo | [`779:37255`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-37255) |
| 55 | Escritorio / Pipeline — Mover de etapa con requisitos (gate) | Escritorio 1440 | diálogo (MoveStageDialog gate) | [`779:37437`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-37437) |
| 56 | Escritorio / Pipeline — Mover a Ganada sin permiso | Escritorio 1440 | diálogo (MoveStageDialog sin permiso) | [`779:37578`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-37578) |
| 57 | Escritorio / Pipeline — Vincular cliente (CustomerLinkPicker) | Escritorio 1440 | diálogo (CustomerLinkPicker) | [`779:37686`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-37686) |
| 58 | Móvil / Pipeline — WinDialog en hoja | Móvil 390 | diálogo | [`779:37888`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-37888) |
| 59 | Móvil / Pipeline — LoseDialog en hoja | Móvil 390 | diálogo | [`779:38310`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-38310) |
| 60 | Móvil / Pipeline — Vincular empresa en hoja | Móvil 390 | hoja/diálogo | [`779:38675`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=779-38675) |
| 61 | Puntos de entrada — formulario único de oportunidad | Anotación / lámina 2960×4199 | lámina de uso (anotación) | [`780:45596`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=780-45596) |
| 62 | Escritorio / Pipeline kanban — acciones de la tarjeta: menú Llamar y motivo deshabilitado | Escritorio 1440 | menú abierto | [`812:53241`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=812-53241) |
| 63 | Móvil / Pipeline — tarjeta con acciones y menú Llamar (hoja) | Móvil 390 | hoja/diálogo | [`812:54748`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=812-54748) |
| 64 | Escritorio / Pipeline — selector de embudo abierto | Escritorio 1440 | menú abierto (selector de embudo) | [`812:54821`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=812-54821) |
| 65 | Escritorio / Nuevo pipeline — paso 1: plantilla | Escritorio 1440 | asistente (paso) | [`816:56539`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=816-56539) |
| 66 | Escritorio / Nuevo pipeline — paso 2: nombre, tipo, meta y por defecto | Escritorio 1440 | asistente (paso) | [`816:56990`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=816-56990) |
| 67 | Escritorio / Nuevo pipeline — paso 3: etapas editables | Escritorio 1440 | asistente (paso) | [`816:57260`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=816-57260) |
| 68 | Escritorio / Pipeline — sin embudo de ventas → Nuevo pipeline (Ventas elegida) | Escritorio 1440 | sin embudo de ventas | [`816:57906`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=816-57906) |
| 69 | Escritorio / Nuevo pipeline — error al crear (no queda nada a medias) | Escritorio 1440 | error | [`816:58273`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=816-58273) |
| 70 | Móvil / Nuevo pipeline — paso 2: nombre, tipo, meta y por defecto | Móvil 390 | asistente (paso) | [`817:64385`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=817-64385) |
| 71 | Móvil / Nuevo pipeline — paso 3: etapas | Móvil 390 | asistente (paso) | [`817:64484`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=817-64484) |
| 72 | Móvil / Pipeline — sin embudo de ventas → Crear embudo | Móvil 390 | sin embudo de ventas | [`817:64841`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=817-64841) |
| 73 | Escritorio / Drawer — Resumen (arriba) | Escritorio 1440 | drawer | [`820:64894`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=820-64894) |
| 74 | Escritorio / Drawer — Resumen (desplazado: cabecera compacta) | Escritorio 1440 | drawer | [`820:65664`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=820-65664) |
| 75 | Escritorio / Drawer — Actividad | Escritorio 1440 | drawer | [`820:66213`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=820-66213) |
| 76 | Escritorio / Drawer — Tareas | Escritorio 1440 | drawer | [`822:235333`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=822-235333) |
| 77 | Escritorio / Drawer — Notas | Escritorio 1440 | drawer | [`822:235945`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=822-235945) |
| 78 | Escritorio / Drawer — Documentos | Escritorio 1440 | drawer | [`822:236526`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=822-236526) |
| 79 | Escritorio / Drawer — IA | Escritorio 1440 | drawer | [`822:237089`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=822-237089) |
| 80 | Escritorio / Drawer — Onboarding (solo oportunidades de onboarding) | Escritorio 1440 | drawer | [`822:237627`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=822-237627) |
| 81 | Escritorio / Drawer — menú «⋯» de la oportunidad | Escritorio 1440 | menú abierto | [`822:238154`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=822-238154) |
| 82 | Drawer — cargando | Drawer 768 (escritorio) | cargando | [`823:245259`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=823-245259) |
| 83 | Drawer — error: no encontrada o sin acceso | Drawer 768 (escritorio) | error | [`823:245319`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=823-245319) |
| 84 | Drawer — Actividad vacía (primer paso) | Drawer 768 (escritorio) | vacío | [`823:245355`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=823-245355) |
| 85 | Drawer — Tareas vacía (primer paso) | Drawer 768 (escritorio) | vacío | [`823:245617`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=823-245617) |
| 86 | Drawer — Notas vacía (primer paso) | Drawer 768 (escritorio) | vacío | [`823:245869`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=823-245869) |
| 87 | Drawer — Documentos: error al cargar | Drawer 768 (escritorio) | error | [`823:246103`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=823-246103) |
| 88 | Móvil / Drawer — Resumen | Móvil 390 | drawer | [`824:170975`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=824-170975) |
| 89 | Móvil / Drawer — Actividad | Móvil 390 | drawer | [`824:171262`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=824-171262) |
| 90 | Móvil / Drawer — Tareas | Móvil 390 | drawer | [`824:171483`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=824-171483) |
| 91 | Móvil / Drawer — Notas | Móvil 390 | drawer | [`824:171631`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=824-171631) |
| 92 | Móvil / Drawer — Documentos | Móvil 390 | drawer | [`824:171769`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=824-171769) |
| 93 | Móvil / Drawer — IA | Móvil 390 | drawer | [`824:171916`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=824-171916) |
| 94 | Móvil / Drawer — menú «⋯» (hoja) | Móvil 390 | hoja/diálogo | [`824:172060`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=824-172060) |
| 95 | Móvil / Drawer — cambiar etapa (hoja) | Móvil 390 | hoja/diálogo | [`824:172249`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=824-172249) |
| 96 | Móvil / Nuevo pipeline — paso 1: plantilla | Móvil 390 | asistente (paso) | [`817:64137`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=817-64137) |
| 97 | Móvil / Oportunidades — selección masiva | Móvil 390 | selección masiva | [`845:82719`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=845-82719) |

**Cobertura de estados por pantalla del Figma**:

| Pantalla | Estados |
|---|---|
| Leads | 10 de escritorio y 8 de móvil. **No hay «error» ni «sin permiso» en móvil** |
| Pipeline | 10 de escritorio y 7 de móvil |
| Oportunidades | 8 de escritorio y 8 de móvil |
| Detalle | 5 de escritorio y 5 de móvil |
| Actividades | 8 de escritorio y 3 de móvil. **No hay error, sin permiso, cargando ni vacío en móvil** |
| Drawer | 9 de escritorio, 6 estados y 8 de móvil |

### 1.4 Pendiente de aprobación: no implementable

| Qué | Id | Hora vista | Por qué no se implementa | Qué desbloquea al aprobarse |
|---|---|---|---|---|
| Sección «CRM — Pipeline y oportunidades (propuesta)», 97 frames (§1.3) | [`768:454425`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=768-454425) | 22:58 | dice «propuesta» | ola 3B: Pipeline, «Nuevo pipeline», drawer, Oportunidades, detalle, formulario en página y diálogos; ola 4: Finanzas y Chat |
| Sección «CRM · IA y automatización (Nuevo)» | [`1295:767945`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-767945) | 23:11 | nueva de hoy, sin revisar; aún sin frames | ola 6: Agentes IA, Automatizaciones, Segmentos, Campañas, Plantillas, Secuencias y Objeciones |
| Sección «CRM · Red y gestión (Nuevo)» | [`1295:767955`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-767955) | 23:11 | nueva de hoy, sin revisar; solo título | ola 6; por el nombre, Referidos, Partners, Equipo, Salud, Pronóstico o Identidades (sin confirmar) |
| Sección «CRM — Telefonía y llamadas (Nuevo)» | [`1295:36609`](https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1295-36609) | 23:12 | nueva de hoy, sin revisar; en construcción | ola 6: softphone en navegador, Llamadas, reproductor y transcripción |

Las demás coincidencias de «Propuesta» en «11 CRM» no marcan estado de diseño. Son el nombre de una
etapa de ejemplo: las instancias `StageColumn · Propuesta` y los frames `Etapa — Propuesta`, todos
dentro de la sección `768:454425`, y una tarea de ejemplo, «Enviar propuesta ajustada». En la sección
`765:446568` ningún frame dice «propuesta».

**Componentes de «CRM (Nuevo)» `759:20897`.** La sección existe desde el 23-sep y no dice
«propuesta», así que se toma como diseño existente y se implementa en la ola 2. Hay un matiz:
`OpportunityCard`, `StageColumn`, `KpiMoneda`, `WinDialog`, `LoseDialog`, `MoveStageDialog`,
`PipelineTemplateCard`, `StageEditorRow`, `StageBar` y `OpportunityDrawerHeader` solo se usan en
pantallas de la sección «(propuesta)». Conviene que el dueño confirme si su aprobación cubre también
esos componentes. Si no la cubre, pasan con la ola 3B.

---

## 2. Inventario de código

### 2.1 Rutas de página (`src/app/app/crm/**`)

| Ruta | Líneas de `page.tsx` | Monta | Grupo del menú | ¿Tiene Figma? |
|---|---|---|---|---|
| `/app/crm` | 11 | `ModuleRootRedirect` (el panel vive en `/app/inicio#crm`) | — | n/a |
| `/app/crm/clientes` | 12 | reutiliza `src/app/app/clientes/page.tsx` | Base de clientes | sí, en «06 Clientes» |
| `/app/crm/clientes/[id]` | **487** | ficha CRM propia: `QuickActionsBar`, `OpportunityTimeline`, `ClientHealthCard`, `CustomerFoliosSection`, `DocumentUploader` | — | parcial (frames 772:*); **duplica** `/app/clientes/[id]` |
| `/app/crm/identidades` | 11 | `crm/identidades` | Base de clientes | **no** |
| `/app/crm/segmentos` (+ `nuevo`, `[id]`) | 11 | `crm/segmentos` | Base de clientes | **no** |
| `/app/crm/salud` | 23 | `health/SaludView` | Base de clientes | **no** |
| `/app/crm/leads` | **466** | todo en la página + `NewLeadDialog` | Comercial | sí, pero es **distinto** |
| `/app/crm/leads/importar` | 14 | `leads/importar/ImportarLeadsAsistente` (**sin commit, de otra sesión**) | — | no; el Figma solo pone el botón «Importar» |
| `/app/crm/pipeline` | 27 | `pipeline/PipelineView` (Kanban, Tabla, Pronóstico, Clientes, Automatización) | Comercial | sí para Kanban y Tabla; Pronóstico, Clientes y Automatización **no** |
| `/app/crm/pipeline/edit-opportunity` | 43 | redirección heredada | — | borrable |
| `/app/crm/oportunidades` | 274 | `OpportunitiesStats`, `OpportunitiesFilters`, `OpportunitiesTable` | Comercial | sí |
| `/app/crm/oportunidades/nuevo` y `[id]/editar` | 26 y 53 | `OpportunityForm` | — | sí |
| `/app/crm/oportunidades/[id]` | 18 | `OpportunityDetail` + `detail/*` | — | sí |
| `/app/crm/pronostico` | 13 | `revenueos/RevenueOsPage` | Comercial | **no** |
| `/app/crm/equipo` | 21 | `equipo/EquipoPage` | Comercial | **no** |
| `/app/crm/objeciones` | 16 | `objeciones/ObjecionesPage` | Comercial | **no**; solo el bloque «Objeciones» del detalle |
| `/app/crm/actividades` (+ `[id]`) | 11 y 21 | `actividades/ActividadesPage`, `ActividadDetalle` | Actividad | sí la lista, pero es **distinta**; el detalle `[id]` **no** |
| `/app/crm/llamadas` | 153 | página propia | Actividad | **no** |
| `/app/crm/campanas` (+ `nuevo`, `[id]`) | 11–16 | `crm/campanas` | Marketing | **no** |
| `/app/crm/plantillas` (+ `nueva`, `[id]`) | 10–16 | `plantillas/PlantillasPage`, `TemplateEditorPage` | Marketing | **no** |
| `/app/crm/secuencias` | 16 | `secuencias/SecuenciasPage` | Marketing | **no** |
| `/app/crm/referidos` | 16 | `referidos/ReferidosPage` | Marketing | **no** |
| `/app/crm/partners` | 16 | `partners/PartnersPage` | Marketing | **no** |
| `/app/crm/agentes-ia` | 16 | `agentes/AgentesIaPage` | Automatización | **no** |
| `/app/crm/automatizaciones` | 16 | `automatizaciones/AutomatizacionesPage` | Automatización | **no** |
| `/app/crm/propuestas/[id]/imprimir` | 18 | `propuestas/ProposalPrintView` | — | **no** |

El menú sale de `src/config/crmNav.ts`, la única fuente: 19 entradas, todas `enabled: true`.

### 2.2 Componentes (`src/components/crm/**`) — métricas por carpeta

Qué mide cada columna:

- «Nav.»: archivos que importan el cliente de navegador `@/lib/supabase/config`.
- «i18n»: archivos con `useTranslations`.
- «Fechas OK»: archivos que usan `useFormatDate`, `formatDateInTz` o `formatPlainDate`.
- «Moneda org.»: archivos que usan `useOrgCurrency` o `useMonedaOrganizacion`.
- «Kit»: archivos que importan `@/components/kit`.

Ninguna carpeta usa `usePermission(s)`.

| Carpeta | Archivos | Líneas | Nav. | i18n | Fechas OK | Moneda org. | Kit | Figma |
|---|---|---|---|---|---|---|---|---|
| pipeline | 68 | 13.862 | **23** | 0 | 9 | 18 | 2 | sí |
| oportunidades | 25 | 6.738 | 7 | 0 | 4 | 8 | 1 | sí |
| agentes | 35 | 5.301 | 0 | 2 | 1 | 0 | 2 | no |
| actividades | 11 | 2.903 | 1 | 0 | 0 | 0 | 1 | sí |
| automatizaciones | 20 | 2.478 | 1 | 0 | 2 | 0 | 1 | no |
| secuencias | 14 | 2.329 | 0 | 0 | 1 | 0 | 1 | no |
| shared | 16 | 2.261 | 4 | 0 | 0 | 0 | 0 | sí (acciones rápidas) |
| dashboard | 10 | 2.225 | 1 | 0 | 0 | 3 | 0 | no |
| email | 19 | 2.167 | 0 | 0 | 0 | 0 | 0 | parcial (`ActivityDialog Tipo=correo`) |
| equipo | 15 | 1.730 | 6 | 0 | 0 | 6 | 0 | no |
| reportes | 10 | 1.698 | 1 | 0 | 0 | 1 | 0 | no |
| identidades | 9 | 1.636 | 1 | 0 | 0 | 0 | 1 | no |
| timeline | 16 | 1.552 | 2 | 0 | 0 (zona fija, ver §5) | 0 | 0 | sí |
| leads | 10 | 1.529 | 0 | 1 | 0 | 1 | 6 | sí (solo el importador usa el kit) |
| segmentos | 8 | 1.489 | 1 | 0 | 2 | 0 | 0 | no |
| objeciones | 12 | 1.447 | 0 | 0 | 0 | 0 | 1 | no |
| whatsapp | 15 | 1.427 | 3 | 0 | 0 | 0 | 0 | parcial (`ActivityDialog Tipo=whatsapp`) |
| referidos | 12 | 1.372 | 0 | 0 | 2 | 0 | 1 | no |
| revenueos | 10 | 1.116 | 0 | 0 | 2 | 0 | 0 | no |
| partners | 10 | 1.108 | 0 | 0 | 1 | 0 | 1 | no |
| calls | 6 | 1.044 | 0 | 0 | 0 | 0 | 0 | no |
| health | 9 | 909 | 0 | 0 | 0 | 1 | 0 | no |
| pronostico | 7 | 808 | 0 | 0 | 0 | 0 | 0 | no |
| plantillas | 7 | 759 | 0 | 0 | 0 | 0 | 1 | no |
| metricas | 2 | 721 | 1 | 0 | 0 | 2 | 0 | no |
| campanas | 11 | 709 | 3 | 0 | 2 | 0 | 1 | no |
| propuestas | 5 | 639 | 0 | 0 | 2 | 1 | 0 | no |
| hoy, clientes, config, documents, contratos, postventa, demo | 1–2 c/u | 151–427 | 2 | 0 | 4 | 1 | 0 | no |

Código muerto confirmado, con 0 importadores fuera de su archivo:

- `pipeline/StageManager.tsx` (652 líneas);
- `pipeline/modals/BulkCreateOpportunitiesDialog.tsx` (408);
- `oportunidades/ImportLeadsCsv.tsx` (564);
- `pipeline/KanbanSummary.tsx`;
- `pipeline/PipelineInitializer.tsx`.

`CustomerList`, `StageConfigDialog` y `LossReasonDialog` tienen un solo uso: candidatos a retirar
cuando entre el kit.

### 2.3 Servicios, rutas API y hooks

**Servicios.** Son 221 archivos en `src/lib/services/crm/**`. Los que alimentan las pantallas del
Figma:

| Servicio | Uso | Cliente |
|---|---|---|
| `components/crm/oportunidades/opportunitiesService.ts` | CRUD de oportunidades, líneas, tareas, notas y estadísticas (**vive en `components/`, no en `lib/services`**) | navegador |
| `opportunityStageService.ts` + `opportunityStageData.ts` + `opportunityStageReconcile.ts` | cambio de etapa con gate, `needs_won`, `needs_lost` y bloqueo optimista | servidor |
| `leadCreateService.ts`, `leadCustomer.ts`, `leadAutoAssign.ts` y `leadAssignmentConfig.ts` | crear lead y autoasignar (los dos primeros los modifica ahora otra sesión) | servidor |
| `timelineService.ts` + `timeline/` | línea de tiempo con 8 fuentes y cursor | servidor |
| `activityService.ts`, `callActivityService.ts` y `callActivitySync.ts` | escribir actividades | servidor |
| `meetingsService.ts` | reunión: `calendar_events` + actividad, con reversa | servidor |
| `taskService.ts` → `pmService` | tareas en la tabla `tasks` compartida con PM | **navegador** |
| `crmFinanceService.ts` | `getOpportunityFinance360` (cotizaciones, facturas, venta, reservas) | servidor, **sin pantalla** |
| `wonCloseSteps.ts` | 7 pasos al ganar: factura, venta, reservas, onboarding, renovación, referido y comisión | mixto |
| `pipelineTemplates.ts`, `pipelineSeedService.ts` | plantillas de pipeline y etapas por defecto (**dos juegos distintos**) | navegador / servidor |
| `stageGateService.ts`, `stagePermissions.ts` | criterios de salida y quién puede saltarlos | servidor |
| `lossReasonsService.ts` | catálogo de motivos de pérdida | — |

**Rutas API.** Son 175 bajo `src/app/api/crm/**`. Las de las pantallas del Figma:

| Ruta | Métodos | Nota |
|---|---|---|
| `leads` | GET, POST | GET lista `opportunities.record_type='lead'` |
| `leads/[id]/convert` | POST | — |
| `opportunities/[id]/stage` | **PATCH** | es la **única** ruta de oportunidades |
| `activities` | POST | faltan PATCH y DELETE |
| `notes` | POST | — |
| `tasks` | POST | — |
| `meetings` | POST | — |
| `timeline/[type]/[id]` | GET | — |
| `customers/search` | GET | RPC `fn_clientes_buscar` |
| `finance/[type]/[id]` | — | sin pantalla |
| `pipeline-templates` | GET | sin pantalla |
| `pipeline-templates/[id]/import` | POST | sin pantalla |
| `stages`, `stages/[id]`, `stages/[id]/gate` | — | — |
| `objections/opportunity/[id]` | — | — |
| `onboarding/by-opportunity/[id]` | — | — |
| `ia/next-action` y `ia/discovery-summary` | — | — |
| `whatsapp/send` y `email` (fuera de `crm/`) | — | — |

Todas las rutas revisadas empiezan por `getServerOrgContext`, `withOrg` o un envoltorio equivalente
(`withWhatsAppRoute`). El guardarraíl de `src/__tests__/guardrails.test.ts` lo exige para `crm/**` en
modo estricto.

**Hooks CRM**, 32 en total:

- pipeline: `useKanbanBoard` y `useOpportunityData` (leen con el cliente de navegador) y `usePipeline`;
- detalle y línea de tiempo: `useStageFlow` y `useTimeline`;
- compartidos: `useCustomerSearch` (ya va al servidor), `useCrmLookups` y `useOrgDefaultCountry`;
- uno por módulo en secuencias, automatizaciones, referidos, partners, objeciones, agentes y el resto.

**Tiempo real.** No hay. `opportunities` y `stages` no están en la publicación `supabase_realtime`, y
el tablero sondea (`KanbanBoardV2.tsx:194`).

### 2.4 i18n

`messages/{es,en,fr,pt}.json`:

- `crm`: 94 claves, repartidas en `title`, `metricas`, `referrals`, `followup` e `ia`;
- `clientes`: 698 claves.

Solo 4 archivos del CRM traducen: `leads/page.tsx`, el importador de leads y dos paneles de
campañas de voz. **Todo el texto de Pipeline, Oportunidades, Detalle, Drawer, Actividades y acciones
rápidas está cableado en español.** El reemplazo por el Figma es el momento de crear
`crm.pipeline.*`, `crm.oportunidades.*`, `crm.leads.*`, `crm.actividades.*` y `crm.acciones.*` en
los 4 idiomas.

### 2.5 Pruebas existentes

- 214 archivos de prueba del CRM. La mayoría son de servicio y de contrato de ruta con la
  organización doblada: `objections.contract`, `referrals.contract`, `partners.contract`,
  `leads`, `payments` y `contracts`.
- De componente: `shared/__tests__` (`quickActionsConfig`, `callModeDefault`, `useOrgDefaultCountry`,
  `callTargetCountry`, `f12MiscCustomerSearch`) y `timeline/__tests__/utils.test.ts`, que **fija
  `America/Bogota`**.
- Guardarraíles de `src/__tests__/guardrails.test.ts` que tocan el CRM:
  - 2: sin tablas de plataforma;
  - 3: sin `display_order`;
  - el caso de rutas estrictas `crm/**`: organización de sesión, 403 ante una organización ajena en
    el body y sin reexportar;
  - 9: `src/lib/crm/enums.ts` ↔ `db-checks.json`;
  - 18: crons de `/api/crm/jobs/run`.
- **No hay** pruebas de pantalla para Pipeline, Oportunidades, Leads ni Actividades, ni una prueba de
  caracterización del flujo lead → oportunidad → ganar → factura.

---

## 3. Base de datos

### 3.1 Tablas que tocan las pantallas del Figma

Conteos exactos del 2026-09-29. Todas tienen RLS activa.

| Tabla | Filas | Organizaciones | Uso en pantallas | Notas |
|---|---|---|---|---|
| `opportunities` | 70 | 6 | Pipeline, Oportunidades, Detalle, Drawer y formulario | 42 `record_type='lead'` (2 organizaciones); **68 sin `salesperson_id`**; moneda: 63 COP y 7 USD; `temperature` nula en las 70; 1 ganada sin `win_data` |
| `pipelines` | 14 | 9 | selector y asistente | 10 `sales`, 3 `onboarding`, 1 `renewal`; **44 de 49 organizaciones con CRM activo no tienen `sales`** |
| `stages` | 90 | — (vía `pipeline_id`) | columnas, `StageBar` y editor | `exit_criteria` nulo en las 90; `is_won` e `is_lost` mandan |
| `opportunity_stage_history` | **1** | — | «días en etapa» e historial | el trigger existe; sin historia previa |
| `opportunity_products` / `_spaces` / `_custom_lines` | — | — | pestaña Líneas y formulario | `total_price` GENERATED |
| `loss_reasons` | 8 globales | — | `LoseDialog` | sin catálogo por organización |
| `customers` | 36.235 | 21 | Leads, ficha y `CustomerLinkPicker` | **35.159 con `lifecycle_stage='lead'`** (17 organizaciones), 1.062 `customer`, 14 `opportunity` |
| `customer_company_links` | 11 | — | `CustomerLinkPicker Paso=cargo` | UNIQUE(persona, empresa), sin CHECK persona≠empresa |
| `activities` | 103 | 6 | Actividades y líneas de tiempo | por tipo: 49 system, 25 call, 25 note, 2 email, 1 visit y 1 whatsapp; `channel` nulo en 102 |
| `notes` | 2 | 2 | pestaña Notas y `ActivityDialog Tipo=nota` | **las notas viven en dos tablas** (25 en `activities`) |
| `tasks` | 851 | 89 | pestaña Tareas y KPI «Tareas abiertas» | tabla del PM. `related_to_type` mezcla `cliente` (13) y `customer` (2); `opportunity` (4) |
| `calls` | 9 | 1 | línea de tiempo y `ActivityDialog Tipo=llamada` | — |
| `voice_agent_calls` | 0 | 0 | entrada «Llamada IA» | — |
| `email_messages` | 0 | 0 | entrada de correo | — |
| `calendar_events` | 8 | 2 | «Reunión» | **no tiene `opportunity_id`** |
| `quotations` / `invoice_sales` | 1 / 2 con oportunidad | — | «Conexiones» y `WinDialog` | — |
| `commissions` | 229 | — | «Comisión estimada» en el detalle | — |
| `crm_events` | 47 | — | cola de eventos | — |
| `exchange_rates`, `organization_currencies` | — | — | `KpiMoneda` (tasa del día y moneda base) | — |
| `permissions` (códigos `crm.*`) | 12 | — | «sin permiso» | solo `customers`, `contacts`, `leads` y `jobs` |

### 3.2 Restricciones y disparadores que el código debe respetar

**CHECK.**

| Columna | Valores admitidos |
|---|---|
| `opportunities.status` | `open`, `won`, `lost` |
| `opportunities.record_type` | `lead`, `deal` |
| `opportunities.deal_type` | `new`, `renewal`, `expansion`, `referral`, `partner` |
| `opportunities.commission_type` | `salesperson`, `intermediation_sale`, `none` |
| `customers.lifecycle_stage` | `lead`, `opportunity`, `customer`, `churned` |
| `customers.status` | `active`, `inactive`, `merged` |
| `activities.activity_type` | `call`, `email`, `whatsapp`, `sms`, `meeting`, `visit`, `note`, `system`, `ai_call`, `task` |
| `tasks.status` | `open`, `in_progress`, `done`, `canceled` |
| `tasks.priority` | `low`, `med`, `high`, `critical` |
| `pipelines.goal_period` | `monthly`, `quarterly`, `yearly` |
| `stages.probability` | de 0 a 100 |

**Columnas generadas.** `customers.full_name`, `doc_type`, `doc_number` y `search_text` son
`GENERATED`, igual que `total_price` en las tres tablas de líneas.

**Disparadores en `opportunities`.**

| Trigger | Qué hace |
|---|---|
| `trg_00_moneda_base_por_defecto` | pone la moneda base de la organización; `currency` ya no tiene DEFAULT `'USD'`. Lo mismo en `pipelines` |
| `trg_sync_status_from_stage` | una etapa ganadora solo cierra con `win_data`; una perdedora, solo con motivo |
| `trg_opp_stage_history` | escribe el historial de etapas |
| `trg_opp_created_enqueue` y `trg_opp_stage_change_enqueue` | encolan en `crm_events` |
| `trg_sync_customer_lifecycle` | sube el ciclo de vida del cliente |
| `trg_create_commission_on_opportunity_won` | crea la comisión al ganar |
| `trg_opportunities_closed_at` | pone `closed_at` |
| `trg_set_branch_from_org` | pone la sucursal por defecto |
| `trg_notify_opportunity_changed` y `opportunities_notify_forecast_trigger` | notifican cambios |
| `set_opportunities_timestamp` y `set_opportunities_updated_at` | **duplicados**: los dos mantienen `updated_at` |

En `stages`, `trg_stages_guard_outcome_flags` bloquea cambiar `is_won` o `is_lost` a quien no tenga
rol `1`, `2` o `5`.

### 3.3 RLS

En `opportunities`, `activities`, `notes`, `pipelines` y `stages`, la RLS es de **pertenencia a la
organización** en SELECT, UPDATE y DELETE. La de INSERT es `WITH CHECK`.

Consecuencias:

- cualquier miembro puede editar o borrar cualquier oportunidad, actividad, nota, pipeline o etapa
  de su organización;
- no hay distinción de autor ni de permiso;
- en `customers`, la política es `ALL` con `user_belongs_to_organization`.

### 3.4 RPC

Usadas o relevantes:

- `fn_clientes_buscar` y `fn_clientes_buscar_ids`: búsqueda de clientes.
- `web_capture_lead`: SECURITY DEFINER, sin EXECUTE para `anon` ni para `authenticated`. Devuelve
  `crm_warning='no_sales_pipeline'`.
- `fn_crm_seed_pipeline_ventas` (sin EXECUTE para `authenticated`) y `fn_crm_seed_defaults` (con
  EXECUTE).
- `fn_pipeline_funnel`, `fn_reporte_crm_funnel` y `fn_reporte_crm_ranking_vendedores`.
- `fn_enroll_in_sequence` y `fn_pause_sequences_on_reply`.
- `fn_register_crm_payment`.
- `refresh_crm_forecast` y `mv_crm_forecast`.

**Riesgo abierto: seis funciones heredadas de cambio de etapa**, todas SECURITY DEFINER y ejecutables
por `authenticated`, que se saltan el gate y el servicio:

- `direct_update_opportunity_bypass`;
- `direct_update_opportunity_stage`;
- `update_opportunity_stage` (dos firmas);
- `update_opportunity_stage_safe`;
- `update_opportunity_stage_without_refresh`.

A esas se suma `update_stage_without_triggers`, sobre `stages`. Ninguna la usa el código vivo. Hay
que revocarlas en la ola 1 (M9).

### 3.5 Lo que el Figma muestra y la BD no tiene

| Dato en el Figma | Frame | BD hoy | Propuesta |
|---|---|---|---|
| Lead: **Responsable** y KPI «Sin responsable» | `765:446571` | `customers` no tiene dueño | M1: `customers.owner_id uuid NULL` |
| Lead: **Origen** (Formulario web, Referido, WhatsApp, Importación CSV, Llamada entrante, Instagram) | `765:446571` | solo `metadata.source` en 6 filas; `opportunities.source` tiene vocabulario mezclado (`website`/`web`, `referral`/`referido`) | M1: `customers.lead_source text NULL` con CHECK de catálogo; normalizar `opportunities.source` |
| Lead: **Score** «82 · Alto» | `765:446571` | `customers.health_score` es de salud, no de calificación; `opportunities.score_total` es por oportunidad | M1: `customers.lead_score int NULL` o derivarlo del ICP (decisión D3) |
| Lead: **Último contacto** y KPI «Contactados (7 días)» | `765:446571` | no hay columna; se puede derivar de `activities` | M1: `customers.last_contact_at timestamptz NULL`, mantenido por el servidor al registrar la actividad |
| Lead: **Descartar lead** (con motivo) | `759:444936` | CHECK de `lifecycle_stage` sin `discarded` | M1: `customers.lead_discarded_at timestamptz NULL` + `lead_discard_reason text NULL`, sin tocar el CHECK |
| Lead: «Calificados este mes · 46 oportunidades nuevas» | `765:446571` | derivable: `opportunities` creadas con `metadata.origen='lead'` o `source` | RPC de KPI (M10) |
| Leads sin colocar (sin embudo de ventas) | `765:448463` | `web_capture_lead` devuelve el aviso, pero **no queda registro consultable** de cuántos | M1b: vista o RPC de conteo sobre `customers` capturados por web sin oportunidad, o `crm_events` con tipo `lead.unplaced` |
| Tarjeta: **Prioridad** «Alta / Media» | `768:454428` | `opportunities` no tiene prioridad (`temperature` existe y está nula en las 70) | M2: `opportunities.priority text NULL` con CHECK `low\|medium\|high`, o usar `temperature` (decisión D4) |
| Tarjeta: **días en etapa** | `759:21627` | `opportunity_stage_history` con 1 fila | cálculo: último `changed_at` o, si no hay, `created_at`; sin migración |
| Detalle: **Reunión** en «Conexiones» | `775:473076` | `calendar_events` sin `opportunity_id` | M3: `calendar_events.opportunity_id uuid NULL` con FK |
| KPI: **tasa del 23 sep** y «no incluye € 2.400: falta la tasa EUR» | `759:22569` | `exchange_rates(organization_id, base_currency, target_currency, rate, effective_date)` existe | RPC `crm_kpis_moneda_base` (M10); no inventa tasas |
| Calificar: «¿Quién decide la compra?» | `759:444936` | sin columna; `opportunities.discovery_data` (jsonb) sirve | se guarda en `discovery_data.decisor` (sin migración) |
| Pipeline: meta y moneda de meta en el asistente | `816:56990` | `pipelines.goal_amount`, `goal_currency` (trigger de moneda base) y `goal_period` | sin migración |
| Etapa: requisitos de salida y SLA en `StageEditorRow` | `816:57260` | `stages.exit_criteria` jsonb y `sla_days` | sin migración; hoy nadie los edita desde el pipeline |
| Actividades: filtro «Cliente u oportunidad» y «Llamada IA» | `769:12376` | `activities.related_type/id`; `activity_type='ai_call'`; `voice_agent_calls` | sin migración |

### 3.6 Lo que la BD tiene y el Figma no muestra

- En `opportunities`:
  - `deal_type` (new, renewal, expansion, referral, partner);
  - `parent_opportunity_id`;
  - `billing_cycle_months`;
  - `vertical_id`;
  - `icp_band` e `icp_fit_score` (el Figma solo pinta «Score»);
  - `commission_type` (el formulario lo tiene; el detalle solo muestra «comisión 5 %»);
  - `contact_channel`, `contact_result` y `next_action`;
  - `recontact_at`;
  - `sales_team_id` y `territory_id` (solo aparecen en «Equipo y responsable» del drawer);
  - `branch_id`.
- En `customers`:
  - `company_size`, `branches_count` y `current_software` (campos de venta B2B);
  - `do_not_call` (debería bloquear «Llamar» con motivo: el `QuickAction` deshabilitado del Figma lo
    permite, pero el motivo no está dibujado);
  - `timezone` por cliente;
  - `roles`.
- `stages.description`.
- `pipelines.pipeline_type='renewal'`: el Figma trae la plantilla, pero no una vista propia de
  renovaciones.
- `loss_reasons` por organización: no hay pantalla de configuración.
- `sales_targets` (0 filas) frente a `pipelines.goal_amount`.

---

## 4. Mapa pantalla por pantalla

Leyenda del estado: **igual** / **parcial** (misma estructura, faltan piezas) / **distinto** (hay que
rehacerla) / **sin pantalla**.

### 4.1 Leads — IMPLEMENTABLE (ola 3A)

- **Figma:** `765:446571` y los 17 frames 765–768 de §1.3, con `LeadRow`, `QualifyLeadDialog` y
  `CaptureBanner`.
- **Ruta:** `/app/crm/leads` (`page.tsx`, 466 líneas).
- **Componentes hoy:** tabla propia y `NewLeadDialog` (503 líneas).
- **API y servicio:** `GET /api/crm/leads` (`opportunities` con `record_type='lead'`), lectura de
  nombres de `customers` con el **cliente de navegador** filtrando `branch_id` (`page.tsx:157`),
  `POST /api/crm/leads/[id]/convert`.
- **Tablas:** `opportunities` y `customers`.
- **Estado: distinto.**

Brechas de UI:

- KPI (4);
- búsqueda por nombre, documento, correo o teléfono;
- chips de filtro (Origen, Fecha de captura, Responsable, Etiquetas);
- `LeadRow` con avatar, origen, responsable, score, etiquetas y último contacto;
- «Calificar» por fila y menú «⋯»;
- paginación en servidor (25 por página);
- selección masiva con «Asignar responsable»;
- hoja de detalle rápido con `QuickActionsBar`;
- banner de leads sin colocar;
- «Importar», que lleva a `/leads/importar` (de otra sesión);
- estados: vacío con primer paso, sin resultados, error y sin permiso.

Brechas de datos y backend:

- ruta nueva `GET /api/crm/leads` sobre `customers` con `lifecycle_stage='lead'`, con filtros,
  paginación y conteo exacto. Reutiliza `fn_clientes_buscar` con un parámetro de ciclo de vida;
- KPI por RPC;
- columnas de M1;
- «Descartar» (`PATCH /api/crm/leads/[customerId]/discard`);
- «Asignar responsable» en lote.

Flujo:

1. Lead (cliente) → «Calificar» paso 1 (`QualifyLeadDialog`).
2. Paso 2: `OpportunityForm Origen=lead`.
3. `POST /api/crm/opportunities`.
4. `trg_sync_customer_lifecycle` sube el cliente a `opportunity`.
   - **Hoy solo corre en UPDATE**: hay que confirmarlo o ampliarlo (M5).

Riesgos:

- lectura desde el navegador;
- «Hoy/Ayer» calculado con 24 h del navegador;
- 35.159 filas: nunca cargar todo;
- la página convive con el importador de otra sesión.

### 4.2 Pipeline — kanban y tabla — BLOQUEADA: sección «(propuesta)», no implementable hasta aprobación (ola 3B)

- **Figma:**
  - kanban: `768:454428`, `768:456094`, `768:457615`, `812:53241` y los estados `770:*`;
  - móvil: `771:*` y `812:54748`;
  - tabla: `768:459368`.
- **Ruta:** `/app/crm/pipeline` → `PipelineView`.
- **Componentes hoy:**
  - `KanbanBoardV2` (280 líneas), `KanbanColumnV2` y `OpportunityCardV2` (138);
  - `TableView` (583);
  - `PipelineHeader` (612);
  - `GoalCompletionWidget`.
- **API y servicio:** `useKanbanBoard` lee `stages` y `opportunities` **desde el navegador**; mover es
  `PATCH /api/crm/opportunities/[id]/stage`; sondeo cada 30 s.
- **Tablas:** `pipelines`, `stages`, `opportunities`, `customers` y `exchange_rates`.
- **Estado: parcial.**

Brechas de UI:

- 4 `KpiMoneda`: valor abierto, ponderado solo de abiertas, abiertas y tasa de cierre a 90 días;
- `FilterChips` (Responsable, Cierre, Prioridad);
- botón «Etapas»;
- total por columna en moneda base con el aviso «incl. USD»;
- tarjeta con responsable, prioridad, días en etapa, próximo y último contacto, y 6 acciones
  **siempre visibles**;
- columna destino al arrastrar;
- menú «⋯» de la tarjeta;
- móvil de una columna con selector de etapa;
- estados: sin embudo, sin permiso y error.

Brechas de datos y backend:

- lectura por servidor (`GET /api/crm/pipeline/[id]/board`) o, como mínimo, RLS más estrecha;
- KPI en moneda base por RPC;
- prioridad (M2);
- días en etapa;
- realtime (M12) o mantener el sondeo.

Flujo: tarjeta → drawer (§4.5) → mover → `MoveStageDialog`, `WinDialog` o `LoseDialog` (§4.8).

Riesgos:

- `GoalCompletionWidget` y `SalesTeamTerritorySelectors` escriben desde el navegador;
- 23 archivos del pipeline usan el cliente de navegador.

### 4.3 Pipeline — selector y «Nuevo pipeline» desde plantilla — BLOQUEADA: sección «(propuesta)», no implementable hasta aprobación (ola 3B)

- **Figma:** `812:54821`, `816:56539`, `816:56990`, `816:57260`, `816:57906`, `816:58273` y el móvil
  `817:*`, con `PipelineTemplateCard` y `StageEditorRow`.
- **Código:** diálogo dentro de `PipelineHeader.tsx:465-575`. Crea y borra pipeline y etapas **desde
  el navegador** (`:233-313`).
- **API sin usar:** `GET /api/crm/pipeline-templates` y `POST …/[id]/import`.
- **Tablas:** `pipelines` y `stages`.
- **Estado: distinto.**

Brechas:

- asistente de 3 pasos: plantilla, luego nombre, tipo, meta y por defecto, luego etapas con SLA,
  requisitos y resultado;
- aviso «ya existe uno de ese tipo»;
- «Eliminar» deshabilitado con motivo;
- error sin estado a medias;
- validación: una etapa ganada, una perdida y probabilidades en orden.

Backend:

- RPC transaccional `crm_create_pipeline_with_stages` (M6);
- RPC atómica para el pipeline por defecto;
- índice único parcial de un solo `is_default` por organización y tipo;
- `DELETE /api/crm/pipelines/[id]` con guarda de oportunidades;
- unificar los dos juegos de etapas (`pipelineTemplates.ts` frente a `pipelineSeedService.ts`).

Flujo: es la puerta de entrada del 90 % de las organizaciones (§0.2 punto 3). El estado «sin embudo»
de Pipeline, Leads y la captura web depende de esto.

### 4.4 Oportunidades — lista — BLOQUEADA: sección «(propuesta)», no implementable hasta aprobación (ola 3B)

- **Figma:** `773:23160` y los estados `773:*`, más el móvil `775:*` y `845:82719`.
- **Ruta:** `/app/crm/oportunidades` (`page.tsx`, 274 líneas).
- **Componentes:** `OpportunitiesStats` (124), `OpportunitiesFilters` (333) y `OpportunitiesTable` (340).
- **Servicio:** `opportunitiesService`, **navegador**.
- **Tablas:** `opportunities`, `stages`, `pipelines` y `customers`.
- **Estado: parcial.**

Brechas de UI:

- pestañas Abiertas, Ganadas, Perdidas y Todas con conteo;
- 4 `KpiMoneda`;
- `SearchInput` del kit con atajo «/»;
- Filtros con contador, orden y chips;
- columnas Prob., Responsable y Próximo contacto (en rojo si está vencido);
- `OpportunityRowMenu`;
- selección masiva (`BulkActionBar`);
- Importar y Exportar reales (hoy son toasts «TODO»);
- paginación.

Backend:

- `GET /api/crm/opportunities` paginado y filtrado en servidor;
- separar leads de deals (`record_type`);
- KPI por RPC;
- borrado por ruta, que también limpie tareas y notas huérfanas.

Riesgos:

- borrar desde el navegador con `confirm()` nativo;
- la búsqueda sin escapar `%` y `_`.

### 4.5 Drawer de oportunidad (desde el kanban) — BLOQUEADA: sección «(propuesta)», no implementable hasta aprobación (ola 3B)

- **Figma:** `776:30540`, `820:*`, `822:*`, `823:*` y `824:*`, con `OpportunityDrawerHeader`,
  `StageBar` y `OpportunityRowMenu`.
- **Código:** `pipeline/OpportunityDrawer.tsx` (204), `drawer/DrawerHeader` (107),
  `drawer/tabs/*` y `drawer/*Section`.
- **Datos:** `useOpportunityData` lee desde el navegador.
- **Estado: parcial.**

Brechas:

- cabecera con probabilidad, responsable y `StageBar` clicable que avisa si reabre;
- «⋯»;
- cabecera compacta al desplazar;
- pestañas que no se desmontan;
- estados vacío y error por pestaña;
- arrastrar y soltar real en Documentos;
- confirmaciones;
- autor visible en notas.

Backend:

- `PATCH` por sección, con la organización de la sesión: seguimiento, equipo, score, discovery,
  tareas y notas. **Hoy son updates desde el navegador sin filtro de organización.**

Detalle completo, pestaña por pestaña, en el doc de diseño §C.

### 4.6 Detalle de oportunidad — BLOQUEADA: sección «(propuesta)», no implementable hasta aprobación (ola 3B)

- **Figma:** `775:473076`, `775:473990` y los estados `775:*`, más el móvil `776:*`.
- **Ruta:** `/app/crm/oportunidades/[id]` → `OpportunityDetail` (194) con:
  - `detail/DetailHeader` (111) y `DetailSidebar` (133);
  - pestañas `LineItemsTab`, `AnalyticsTab` y `ClosingTab`;
  - `useStageFlow`.
- **Estado: parcial.**

Brechas de UI:

- cabecera con Editar, Marcar perdida, Marcar ganada y «⋯»;
- franja de 6 métricas: monto, probabilidad, ponderado, cierre, responsable con comisión y próximo
  contacto;
- `StageBar`;
- `QuickActionsBar Variant=detalle`;
- compositor «Escribe una nota o registra una llamada…»;
- filtros de la línea de tiempo;
- `CustomerIdentityCard` lateral con contacto principal;
- tarjeta **«Conexiones»**: cotización, factura, tareas, reunión, renovación y comisión.

Backend:

- «Conexiones» = `GET /api/crm/finance/opportunity/[id]` (existe) + tareas + `calendar_events` con
  M3 + `commissions`;
- `AnalyticsTab` consulta `activities` sin filtro de organización.

Flujo: oportunidad → cotización (`quotations.opportunity_id`) → factura (`invoice_sales.opportunity_id`)
→ comisión (`commissions`).

### 4.7 Formulario único de oportunidad y puntos de entrada — mixto (ver nota)

> **Nota de alcance.** Es implementable el componente `OpportunityForm` (en «CRM (Nuevo)») en las
> variantes que usan frames de la sección aprobada:
>
> - `Origen=lead`: «Calificar» paso 2, `772:21705`;
> - `Origen=cliente` como hoja: ficha del cliente, `772:20628`.
>
> Quedan en la ola 3B, porque sus frames están en la sección «(propuesta)»:
>
> - la página Nueva y Editar (`778:32176`, `778:33132`);
> - el diálogo desde el «+» de columna (`778:33942`);
> - los paneles desde Finanzas y Chat (`778:34520`, `778:35164`);
> - la lámina de puntos de entrada (`780:45596`).
>
> Mientras tanto, `/nuevo` y `/editar` siguen con el formulario actual y solo reciben arreglos de
> backend.

- **Figma:** `778:32176`, `778:33132`, `778:33942`, `778:34281`, `778:34520`, `778:34929`,
  `778:35164`, `772:21705` y `772:20628`, más la lámina `780:45596`.
- **Código:**
  - `OpportunityForm.tsx` (1.201 líneas);
  - `CreateOpportunityDialog` (portal propio);
  - formularios paralelos en `BulkActionsDialog` (970), `NewLeadDialog`, `CallLinkPanel` y
    `renewal`/`onboarding`.
- **Estado: distinto** en arquitectura.

Brechas de UI:

- `Layout=page|dialog|sheet`;
- `Origen` con ficha de contexto bloqueada;
- «Responsable» separado de «Comisionista»: hoy hay un solo selector que escribe `salesperson_id`;
- `CustomerLinkPicker` en vez de `CustomerSearchSelect`;
- móvil a pantalla completa.

Backend:

- `POST /api/crm/opportunities` → `opportunityCreateService`:
  - generaliza `leadCreateService`;
  - pipeline `sales` por defecto;
  - primera etapa no terminal;
  - moneda base;
  - autoasigna;
  - líneas en la misma transacción (RPC `crm_create_opportunity`, M4);
  - actividad «creada».
- `PATCH /api/crm/opportunities/[id]`, con líneas por diferencia y `metadata` fusionado.

Puntos de entrada:

| Origen | Dónde se abre | Estado hoy |
|---|---|---|
| Pipeline | «+ Nueva» y «+» de columna | existe |
| Oportunidades | «Nueva» | existe |
| Clientes | ficha, pestaña Oportunidades | **no hay botón** |
| Finanzas | cotización o factura | **no hay**; solo vinculan una oportunidad que ya existe |
| Chat / Bandeja | conversación | **no hay** |
| Leads | «Calificar» | **no hay** |
| POS | — | **no hay** |
| GO Assistant | — | sin acción de oportunidad |

Riesgos:

- lógica duplicada en 5 formularios (regla 7 de CLAUDE.md);
- el pipeline por defecto se resuelve con tres reglas distintas.

### 4.8 Diálogos: ganar, perder, mover de etapa y vincular cliente — BLOQUEADA: sección «(propuesta)», no implementable hasta aprobación (ola 3B)

- **Figma:** `779:36778`, `779:36974`, `779:37122`, `779:37255`, `779:37437`, `779:37578`,
  `779:37686`, más el móvil `779:37888`, `779:38310` y `779:38675`.
- **Código:**
  - ganar: `ClosedWonDialog` + `WonCloseModal` + `MarkWonFlow`;
  - perder: `StructuredLossDialog` + `LossReasonDialog`;
  - mover: `GateWarningDialog`;
  - vincular: `CustomerSearchSelect` y `CompanyContactsManager`;
  - tres flujos de etapa: `useStageFlow`, `OpportunityDrawer` y `KanbanBoardV2`.
- **Estado: parcial.**

Brechas:

- `WinDialog` de 3 pasos: ficha, qué hacer al ganar (los 7 pasos de `wonCloseSteps`) y resumen;
- `LoseDialog`, que **siempre mueve a la etapa `is_lost`** por `PATCH …/stage`;
- `MoveStageDialog` con «sin permiso» resuelto en servidor;
- un solo `useStageFlow` para tablero, drawer, detalle y lista;
- `CustomerLinkPicker` con los pasos buscar, crear y cargo.

Backend:

- `needs_lost` en `PATCH …/stage` con los datos estructurados de pérdida;
- permisos `crm.opportunities.close` y `crm.stages.override_gate` (M7);
- `POST` y `DELETE /api/customers/links` para vincular persona ↔ empresa, con CHECK
  persona≠empresa (M8b).

### 4.9 Actividades — IMPLEMENTABLE (ola 3A)

- **Figma:** `769:12376`, `769:13036`, `769:13655`, `769:13838`, `769:13935`, `770:15494`,
  `770:16039`, `770:16578` y el móvil `770:17115`, `770:17351` y `770:17452`, con `ActivityDialog`,
  `TimelineFilters`, `CargarMas` y `TimelineEntry`.
- **Ruta:** `/app/crm/actividades` → `ActividadesPage` (401), `ActividadesTable` (359),
  `ActividadForm` (526) y `ActividadesService` (360).
- **Estado: distinto.**

Brechas de UI:

- línea de tiempo agrupada por día («Hoy · miércoles 23 sep»);
- chips de tipo: Todos, Llamadas, Correos, WhatsApp, Reuniones, Notas, Tareas, Sistema y Llamada IA;
- filtros de responsable, cliente u oportunidad y rango;
- 7 KPI en una franja;
- «Cargar 20 más» con total;
- menú «⋯» por entrada, que edita o elimina solo `activities` y `notes`;
- Exportar;
- «Nueva actividad» abre `ActivityDialog` por tipo.

Backend:

- `GET /api/crm/timeline/org`: los adaptadores de `timeline/sources.ts` sin filtro de entidad, más
  búsqueda e índices;
- KPI por RPC (M10);
- `PATCH` y `DELETE /api/crm/activities` y `/api/crm/notes`, con guardas;
- RLS de autor o permiso (M8);
- decidir notas en `notes` y `channel` como medio (D6).

Riesgos:

- editar y borrar desde el navegador;
- `Intl es-ES` sin zona;
- filtros con `T23:59:59.999` sin desfase;
- unas 14 consultas por cambio de filtro.

### 4.10 Acciones rápidas (en 4 lugares) — IMPLEMENTABLE (ola 3A)

- **Figma:** `773:472568` y `773:472975`, con `QuickAction` y `QuickActionsBar` en las variantes
  tarjeta, drawer, detalle, cliente y tarjeta móvil.
- **Código:** `shared/QuickActionsBar.tsx` (258), `quickActionsConfig.ts` (123), `MobileCallDialog`
  (269), `ComposeEmailDialog` (157), `MeetingDialog` (136), `TaskDialog` (291) y `QuickNoteDialog` (71).
- **Estado: parcial.**

Brechas:

- `Variant=cliente` y `tarjeta móvil`;
- visibles sin hover;
- Llamar deshabilitado con motivo (sin teléfono, número inválido y, añadido aquí, `do_not_call`);
- panel de estado de llamada que no se cierra al iniciar;
- un solo evento `crm:entity-changed` para refrescar;
- la tarea sale asignada al usuario actual y por API.

Backend:

- Tarea: `POST /api/crm/tasks` existe; hoy `TaskDialog` escribe con `pmService` desde el navegador.

### 4.11 Ficha del cliente: entradas del CRM — IMPLEMENTABLE (ola 3A)

- **Figma:** `772:19838`, `772:20628`, `772:20971` y `772:21523`, además de «06 Clientes».
- **Código:** dos fichas.
  - `/app/clientes/[id]`: `TimelineTab` viejo y `OportunidadesTab` de solo lectura, sin botón y sin
    `QuickActionsBar`.
  - `/app/crm/clientes/[id]`: 487 líneas, con `QuickActionsBar` y `OpportunityTimeline`.
- **Estado: parcial.**

Brechas:

- «Nueva oportunidad» en la pestaña y en su vacío → `OpportunityForm Layout=sheet Origen=cliente`;
- vacío corregido con Registrar venta, Registrar llamada y Nota;
- «Nueva tarea» con `Plus`;
- línea de tiempo unificada.

**Decisión D1:** qué ficha sobrevive. La recomendación es una sola, `/app/clientes/[id]`, con el
bloque CRM, y `/app/crm/clientes/[id]` redirige.

---

## 5. Riesgos transversales

| Riesgo | Dónde | Regla de CLAUDE.md |
|---|---|---|
| Escrituras de negocio desde el navegador | `opportunitiesService`, `PipelineHeader`, `ActividadesService`, `SalesTeamTerritorySelectors`, `GoalCompletionWidget`, `TasksSection`, `NotasTab` y `NotasArchivosTab` (clientes) | «Servicios que tocan varias tablas → RPC»; «clientes Supabase» |
| Permisos: ninguno en la interfaz; en el servidor, por id de rol | 0 usos de `usePermission` en CRM; `stagePermissions.ts`, `fn_stages_guard_outcome_flags` | 6 |
| Lógica duplicada | 5 formularios de oportunidad, 3 flujos de etapa, 2 diálogos de pérdida, 2 de ganar, 8 selectores de cliente, 2 juegos de etapas por defecto, 4 líneas de tiempo, 2 fichas de cliente, 2 `QuickActionsBar` en Figma | 7 |
| Zona horaria | `timeline/utils.ts:44,99,107` (Bogotá por defecto, 6 llamadores sin zona), `ActividadesTable.tsx:75`, `MeetingDialog`, `MessageForm.tsx:53`, `FollowupSection` | Fechas 1–7 |
| Moneda | Mejoró: 18 archivos del pipeline usan la moneda de la organización y el trigger pone la base. Pendientes: totales de columna con monedas mezcladas y KPI sin tasa | «moneda cableada» |
| Textos sin traducir | todo el núcleo del CRM | i18n |
| Funciones SQL de etapa ejecutables por `authenticated` | 6 funciones SECURITY DEFINER (§3.4) | seguridad |
| RLS de pertenencia sin autor | `activities`, `notes`, `opportunities`, `pipelines` y `stages` | 6 |
| Consultas sin tope | `getCustomers` sin paginar (sigue existiendo aunque `searchCustomers` ya va por RPC); 35.159 leads | rendimiento |
| Trabajo ajeno sin commit | importador de leads y `messages/*.json` | «no commitear archivos compartidos» |

---

## 6. Módulos CRM sin diseño en Figma (para el equipo de diseño)

Comparación con la lista del dueño. «¿Diseño aprobado?» = hay frames de pantalla en una sección que
no es nueva de hoy ni dice «propuesta». La columna «En curso hoy» dice si una de las tres secciones
nuevas (§1.4) ya lo menciona. **Eso no lo vuelve implementable.** Las menciones sueltas se anotan.

| # | Módulo (lista del dueño) | ¿Diseño aprobado? | En curso hoy (pendiente de aprobación) | Lo que sí hay | Código actual |
|---|---|---|---|---|---|
| 1 | **Teléfono para llamar desde el navegador** (softphone) | **No** | «Telefonía y llamadas» `1295:36609` (componentes de softphone) | Menú «Llamar» con 3 modos en la tarjeta (`812:53241`, `812:54748`); la nota «Softphone dock, IncomingCallToast — Sin cambio» (`51:2915`, sección Header) | `SoftphoneProvider`, `MobileCallDialog`, `CallPanels`; FASE-03 y FASE-05 |
| 2 | **Electron y app móvil** | **No** para lo propio de cada plataforma: llamada nativa, notificaciones, sin conexión | — | Pantallas móviles web de 390 px del núcleo del CRM | `electron/`, `mobile/`; FASE-15 |
| 3 | **Agentes IA** | **No** | «IA y automatización» `1295:767945`, fila 1 | «Agente IA» deshabilitado en el menú Llamar; entrada «Llamada IA» en la línea de tiempo; pestaña IA del drawer | `/app/crm/agentes-ia`, `components/crm/agentes` (35 archivos) |
| 4 | **Automatizaciones** | **No** | «IA y automatización», fila 2 | Solo la etiqueta de la pestaña «Automatización» del pipeline | `/app/crm/automatizaciones`, `AutomationsView` |
| 5 | **Segmentos** | **No** | «IA y automatización», fila 3 | — | `/app/crm/segmentos` (+ nuevo, `[id]`) |
| 6 | **Campañas** | **No** | «IA y automatización», fila 4 | — | `/app/crm/campanas` (+ nuevo, `[id]`), campañas de voz |
| 7 | **Llamadas** | **No** como página | «Telefonía y llamadas» (reproductor, transcripción, resultado) | `ActivityDialog Tipo=llamada`, entradas de llamada en la línea de tiempo | `/app/crm/llamadas` (153 líneas), `components/crm/calls` |
| 8 | **Plantillas** (correo y WhatsApp) | **No** | «IA y automatización», fila 5 | `PipelineTemplateCard` es de **pipelines**, no de mensajes | `/app/crm/plantillas` (+ editor) |
| 9 | **Secuencias** | **No** | «IA y automatización», fila 6 | — | `/app/crm/secuencias` |
| 10 | **Referidos** | **No** | ¿«Red y gestión» `1295:767955`? (vacía) | — | `/app/crm/referidos` |
| 11 | **Partners** | **No** | ¿«Red y gestión»? (vacía) | — | `/app/crm/partners` |
| 12 | **Objeciones** | **No** como biblioteca | «IA y automatización», fila 7 | Bloque «Objeciones» y «Registrar objeción» en el detalle y el drawer | `/app/crm/objeciones` |
| 13 | **Equipo** | **No** | ¿«Red y gestión»? (vacía) | Sección «Equipo y responsable» del drawer | `/app/crm/equipo` |
| 14 | **Salud** | **No** | ¿«Red y gestión»? (vacía) | Texto «Salud del cliente» en la ficha | `/app/crm/salud` |
| 15 | **Pronósticos** | **No**: el propio diseño lo declara pendiente | ¿«Red y gestión»? (vacía) | Etiqueta de la pestaña «Pronóstico» | `/app/crm/pronostico` (Revenue OS), `ForecastView` |
| 16 | **Identidades** | **No** | ¿«Red y gestión»? (vacía) | — | `/app/crm/identidades` |

**Faltan también en la lista del dueño**, sin diseño:

- detalle de actividad (`/app/crm/actividades/[id]`);
- pestaña «Clientes» del pipeline;
- impresión de propuesta (`/app/crm/propuestas/[id]/imprimir`);
- configuración del CRM: requisitos de etapa, scoring, telefonía, proveedores, WhatsApp, motivos de
  pérdida por organización y trabajos;
- comisiones del vendedor y metas (`sales_targets`);
- contratos y firma, demos, ROI, ICP y plantillas de discovery;
- panel «Hoy» del vendedor (`components/crm/hoy`);
- reasignación de los 23 leads que están en onboarding;
- `TaskForm` único (del agente de PM);
- ficha del cliente en móvil;
- estados «error» y «sin permiso» de Leads y Actividades en móvil.

**Nota.** Según los títulos de fila, las secciones nuevas de hoy ya cubren 9 de los 16 módulos de la
lista: 7 con fila propia en «IA y automatización» y 2 con los componentes de «Telefonía y
llamadas». Por ahora es solo título, sin frames, a las 23:11 UTC. Hasta que el dueño las apruebe, esos
módulos siguen fuera de las olas de implementación. En la ola 6 solo reciben higiene sin cambio
visual.

**Recomendación para el equipo de diseño.** El orden sugerido sale del uso real y de lo que bloquea el
flujo:

1. Llamadas + softphone.
2. Pronóstico.
3. Plantillas y campañas de WhatsApp: hay 4 campañas y 6 plantillas en BD.
4. Configuración del CRM (etapas y motivos).
5. Lo demás.

Referidos, partners y secuencias tienen 0 filas en BD.

---

## 7. Plan de implementación por olas

Cada ola sigue el patrón que ya usan los planes de `docs/implementacion/*-PLAN.md`:

1. caracterización;
2. RPC;
3. rutas de servidor;
4. interfaz;
5. commit por paso.

El documento de fases sería `docs/implementacion/CRM-FIGMA-PLAN.md` cuando se apruebe.

Tamaños: **S** ≤ 1 día · **M** 2–3 días · **L** 4–6 días · **XL** > 6 días (una persona o un agente).

### 7.1 Olas

**Ola 0 — Preparación (S).**

- Decisiones D1–D8 (§8). **D7, aprobar la sección «(propuesta)», decide si la ola 3B existe.**
- Congelar la sección `765:446568`, ya aprobada, mientras dure la ola 3A.
- Pruebas de caracterización, en jest y contra servicios: cambio de etapa, ganar y perder, convertir
  lead, crear oportunidad, crear actividad y línea de tiempo. Así el reemplazo no cambia
  comportamiento sin querer.
- Esqueleto i18n `crm.*` en 4 idiomas.

**Ola 1 — Backend (L). Depende de la 0.** Todo aditivo, con `.sql` y rollback según
`POLITICA-MIGRACIONES.md`.

Los pasos marcados **(3B)** solo sirven a pantallas de la sección «(propuesta)». Se pueden hacer
antes porque corrigen escrituras desde el navegador y permisos, pero no tienen interfaz nueva hasta
la aprobación. Si el dueño prefiere no adelantarlos, se mueven a la 3B.

| Paso | Qué | Tamaño |
|---|---|---|
| 1.1 | Permisos `crm.opportunities.{view,create,edit,delete,close}`, `crm.stages.{manage,override_gate}`, `crm.pipelines.manage` y `crm.activities.edit_any` + `role_permissions`; `stagePermissions` pasa a permiso (M7) | M |
| 1.2 | `POST` y `PATCH /api/crm/opportunities`, con la RPC `crm_create_opportunity` y la actualización de líneas por diferencia (M4); `DELETE` con limpieza | L |
| 1.3 | Perder por `PATCH …/stage` con `needs_lost` estructurado; retirar `markAsLost` del navegador | S |
| 1.4 | **(3B)** `GET /api/crm/opportunities` paginado y `GET /api/crm/pipeline/[id]/board` | M |
| 1.5 | Leads sobre `customers`: M1, `GET /api/crm/leads` nuevo (conservar el viejo con otro nombre mientras haya llamadores), descartar y asignar en lote | M |
| 1.6 | **(3B)** Pipelines: RPC `crm_create_pipeline_with_stages`, pipeline por defecto atómico, índice único parcial, `DELETE` con guarda (M6) | M |
| 1.7 | Actividades y notas: `PATCH` y `DELETE`, RLS de autor o permiso (M8), `GET /api/crm/timeline/org` + índices (M11) | M |
| 1.8 | KPI por RPC en moneda base: leads y actividades para la 3A; oportunidades **(3B)** (M10) | M |
| 1.9 | `REVOKE EXECUTE` de las 6 funciones heredadas de etapa (M9); `calendar_events.opportunity_id` (M3); `opportunities.priority` si D4 lo pide (M2) | S |

**Ola 2 — Kit CRM (L). En paralelo con la 1.**

- Los 20 componentes de §1.2, en `src/components/crm/kit/`, con la lógica pura en archivos
  `*Logica.ts`, como hace `src/components/kit`.
- Máximo 300 líneas por componente y sin lógica de negocio (`BRIEF-UX-CRM.md`).
- Orden, por dependencias:

| Paso | Componentes | Tamaño |
|---|---|---|
| 2.1 | `QuickAction`, `QuickActionsBar` (5 variantes) y `OpportunityRowMenu` (sobre `RowActionsMenu`) | M |
| 2.2 | **(3B, salvo confirmación del dueño; ver §1.4)** `KpiMoneda`, `StageBar`, `OpportunityCard` y `StageColumn` | M |
| 2.3 | `CustomerLinkPicker` (sobre el `CustomerPicker` del kit + `/api/crm/customers/search`) | M |
| 2.4 | **(3B, salvo confirmación)** `WinDialog`, `LoseDialog`, `MoveStageDialog` y `useStageFlow` único | M |
| 2.5 | `OpportunityForm` partido en secciones, con `Layout` y `Origen`: primero `dialog` y `sheet` con `Origen=lead` y `cliente` (3A); el resto de variantes con la 3B | L |
| 2.6 | `LeadRow`, `QualifyLeadDialog`, `CaptureBanner`, `CargarMas`, `ActivityDialog` (5 tipos) y `TimelineFilters` | M |
| 2.7 | **(3B, salvo confirmación)** `OpportunityDrawerHeader`, `StageEditorRow` y `PipelineTemplateCard` | M |

**Ola 3A — Pantallas con diseño aprobado (L). Depende de la 1 y la 2.** Solo frames de la sección
`765:446568`. Se rediseña en la ruta existente, sin páginas duplicadas.

| Paso | Pantalla | Tamaño |
|---|---|---|
| 3A.1 | Acciones rápidas en sus lugares actuales: tarjeta, drawer, detalle y ficha, con `Variant=cliente` (§4.10) | M |
| 3A.2 | Leads (§4.1), incluidos «Calificar» y `OpportunityForm Origen=lead` en diálogo u hoja. Empieza cuando la sesión del importador haya subido su trabajo | L |
| 3A.3 | Actividades (§4.9) | L |
| 3A.4 | Ficha del cliente: «Nueva oportunidad» con `OpportunityForm Layout=sheet Origen=cliente`, vacío corregido y primera tarea (§4.11). Implica decidir D1 | M |

**Ola 3B — BLOQUEADA hasta que el dueño apruebe la sección «(propuesta)» `768:454425` (XL).** Mientras
tanto, estas pantallas conservan su interfaz actual y solo reciben los arreglos de backend de la
ola 1.

| Paso | Pantalla | Tamaño |
|---|---|---|
| 3B.1 | Pipeline: kanban, tabla y móvil, con 10 estados (§4.2) | L |
| 3B.2 | Nuevo pipeline desde plantilla y «sin embudo» (§4.3) | M |
| 3B.3 | Drawer (§4.5) | L |
| 3B.4 | Oportunidades: lista y móvil (§4.4) | M |
| 3B.5 | Detalle con «Conexiones» (§4.6) | L |
| 3B.6 | Formulario: página, diálogo desde columna y paneles de Finanzas y Chat (§4.7) | M |
| 3B.7 | Diálogos de ganar, perder, mover y vincular (§4.8) | M |

**Ola 4 — Conexiones cruzadas (M–L). Depende de la 3A; lo marcado (3B) espera la aprobación.**

- Ficha del cliente: línea de tiempo única en `/app/clientes/[id]`.
- **(3B)** Finanzas: «Crear oportunidad» desde cotización o factura (`Origen=factura`); su frame
  `778:34520` está en la sección «propuesta».
- **(3B)** Chat / Bandeja: `Origen=conversación`; frame `778:35164`.
- POS: botón, si D8 lo confirma.
- GO Assistant: acción de crear oportunidad que llama al mismo servicio, sin formulario propio.
- Tarea desde el CRM con el `TaskForm` del PM cuando exista.

**Ola 5 — Limpieza (M).**

- Borrar el código muerto: `StageManager`, `BulkCreateOpportunitiesDialog`, `ImportLeadsCsv`,
  `KanbanSummary`, `PipelineInitializer` y la ruta `edit-opportunity`.
- Borrar los diálogos viejos y los 7 selectores de cliente sustituidos.
- Borrar el trigger `updated_at` duplicado.
- Guardarraíles nuevos (§7.4).

**Ola 6 — Módulos sin diseño aprobado (M por módulo, bloqueada por aprobación).**

- Incluye todo lo que cubrirán las tres secciones nuevas de hoy (§1.4): Telefonía y llamadas, IA y
  automatización, Red y gestión. **No se implementa su diseño hasta que el dueño lo apruebe.**
- Mientras tanto, solo higiene: fechas con la zona de la organización, i18n, escrituras por servidor
  y `usePermission`.
- Nada de rediseño visual inventado ni adelantado desde frames sin aprobar.

### 7.2 Dependencias

```
Ola 0 ──┬──> Ola 1 (backend) ──┐
        └──> Ola 2 (kit) ──────┴──> Ola 3A (Leads, Actividades, acciones, ficha) ──> Ola 4 (ficha) ──┐
Aprobación D7 de «(propuesta)» ──> Ola 3B (Pipeline, Oportunidades, detalle, drawer, formulario,     │
                                   diálogos) ──> Ola 4 (Finanzas, Chat) ─────────────────────────────┴─> Ola 5
Aprobación de las 3 secciones nuevas de hoy ─────────────────────────────────────────> Ola 6
Importador de leads (otra sesión, sin commit) ──> paso 3A.2
TaskForm del PM ──> ola 4 (tareas)
```

### 7.3 Migraciones propuestas (no aplicadas)

Todas aditivas, con columnas `NULL`-ables o con `DEFAULT`, sin `DROP` ni cambio de tipo. Van por MCP
con su `.sql` en `supabase/migrations/` y su reversión en `supabase/rollbacks/`. Los comentarios de
esquema no llevan nombres de organizaciones.

| Id | Cambio | Para | Rollback |
|---|---|---|---|
| M1 | `customers`: `owner_id uuid NULL` (FK a usuario), `lead_source text NULL` (CHECK de catálogo), `lead_score int NULL`, `last_contact_at timestamptz NULL`, `lead_discarded_at timestamptz NULL` y `lead_discard_reason text NULL`; índice `(organization_id, lifecycle_stage, created_at desc)`; copiar `metadata.source` a `lead_source` | Leads | quitar columnas e índice |
| M1b | Vista o RPC `crm_leads_sin_colocar(org)` para el `CaptureBanner` | Leads | `drop` |
| M2 | `opportunities.priority text NULL` con CHECK `low\|medium\|high` (solo si D4 = columna nueva) | Tarjeta | quitar columna |
| M3 | `calendar_events.opportunity_id uuid NULL` con FK e índice | Conexiones y línea de tiempo | quitar columna |
| M4 | RPC `crm_create_opportunity(...)` y `crm_update_opportunity(...)`: oportunidad, líneas por diferencia, `metadata` fusionado y actividad «creada»; SECURITY INVOKER o guarda de pertenencia; sin EXECUTE para `anon` | Formulario | `drop function` |
| M5 | `trg_sync_customer_lifecycle` también en INSERT | Lead → oportunidad | volver al trigger actual |
| M6 | RPC `crm_create_pipeline_with_stages` y `crm_set_default_pipeline`; índice único parcial `(organization_id, pipeline_type) WHERE is_default` (antes, verificar duplicados) | Nuevo pipeline | `drop` |
| M7 | Permisos `crm.opportunities.*`, `crm.stages.*`, `crm.pipelines.manage` y `crm.activities.edit_any` en `permissions` + `role_permissions` por rol; `fn_stages_guard_outcome_flags` por permiso | «Sin permiso» | borrar filas y restaurar la función |
| M8 | RLS de UPDATE y DELETE en `activities` y `notes`: autor o permiso `crm.activities.edit_any` | Actividades | políticas anteriores |
| M8b | `customer_company_links`: `CHECK (person_id <> company_id)` (`NOT VALID` + `VALIDATE`) e índice parcial de un principal por empresa | `CustomerLinkPicker` | `drop constraint` e índice |
| M9 | `REVOKE EXECUTE ... FROM authenticated` en las 6 funciones heredadas de etapa | Seguridad | `GRANT` |
| M10 | RPC de KPI: `crm_kpis_oportunidades(org, filtros)` en moneda base con `exchange_rates` e informe de monedas sin tasa, `crm_kpis_leads(org)` y `crm_kpis_actividades(org, rango, tz)` | KPI | `drop` |
| M11 | Índices `(organization_id, <fecha> desc, id)` en las 8 fuentes de la línea de tiempo | Actividades | `drop index` |
| M12 | `opportunities` y `stages` en `supabase_realtime` (opcional) | Pipeline | quitar de la publicación |
| M13 | Datos (decisión D6): notas de `activities` a `notes`; `tasks.related_to_type` de `cliente` a `customer` | Unificar | script inverso |

### 7.4 Pruebas que hay que añadir

1. **Caracterización (ola 0).** Servicio de etapa, ganar, perder, convertir y crear, con los
   resultados actuales fijados.
2. **Contrato de ruta** para cada ruta nueva:
   - la organización sale de la sesión;
   - una organización ajena en el body da 403 y queda registrada;
   - un usuario sin permiso recibe 403.

   Mismo patrón que `objections.contract.test.ts`.
3. **RPC.**
   - `crm_create_opportunity`: todo o nada, primera etapa no terminal, moneda base y pipeline `sales`.
   - `crm_create_pipeline_with_stages`: rechaza sin etapa ganadora.
4. **Kit.** Lógica pura de cada componente:
   - motivos de `QuickAction` deshabilitado, incluido `do_not_call`;
   - conversión y «falta tasa» de `KpiMoneda`;
   - validación de `StageEditorRow`;
   - pasos de `CustomerLinkPicker`;
   - `Origen` de `OpportunityForm`, que prellena y bloquea campos.
5. **Pantalla (Testing Library).** Estados listo, cargando, vacío, sin resultados, error y sin permiso
   de Pipeline, Oportunidades, Leads y Actividades.
6. **Zona horaria.** `npm run test:tz-all` sobre la línea de tiempo, Actividades y el formulario. El
   test de `timeline/utils` deja de fijar Bogotá y recibe la zona.
7. **Guardarraíles nuevos** en `src/__tests__/guardrails.test.ts`:
   - ningún archivo de `src/components/crm/{pipeline,oportunidades,actividades,leads,kit}` escribe
     con `@/lib/supabase/config`: nada de `insert`, `update`, `delete` ni `upsert`;
   - `America/Bogota` prohibido en `src/components/crm/**`, salvo como fallback documentado;
   - prohibido comparar `roleName` o nombres de rol en CRM;
   - paridad de claves `crm.*` en los 4 idiomas.

### 7.5 Checklist de punta a punta: «el flujo queda conectado»

Se verifica en el navegador con una organización de prueba **y** con consultas por MCP.

Los puntos marcados **(3B)** solo se pueden cerrar cuando la sección «(propuesta)» esté aprobada e
implementada. Hasta entonces se verifican contra la interfaz actual, con el backend nuevo.

1. [ ] **(3B)** Organización sin embudo de ventas:
   - Pipeline muestra «sin embudo»;
   - «Crear embudo» lleva a la plantilla Ventas;
   - se crean el pipeline y sus etapas en una transacción;
   - queda por defecto.
2. [ ] Captura web (`web_capture_lead`):
   - el cliente aparece en Leads con origen «Formulario web»;
   - sin embudo, aparece en el `CaptureBanner`.
3. [ ] Leads:
   - buscar por documento y teléfono en servidor;
   - asignar responsable en lote;
   - descartar con motivo, que desaparece de la vista por defecto.
4. [ ] Calificar → `OpportunityForm Origen=lead`:
   - la oportunidad nace en la primera etapa no terminal del pipeline `sales`;
   - moneda base;
   - responsable asignado;
   - actividad «Oportunidad creada desde lead»;
   - el cliente pasa a `lifecycle_stage='opportunity'`.
5. [ ] Tarjeta del kanban: las 6 acciones.
   - Llamar crea una fila en `calls` y una actividad.
   - Email escribe en `email_messages` y crea una actividad.
   - WhatsApp escribe en `messages`, crea una actividad y cobra créditos.
   - Reunión escribe en `calendar_events` **con `opportunity_id`** y crea una actividad.
   - Tarea escribe en `tasks`, asignada al usuario.
   - Nota escribe en `notes`.
   - Cada acción aparece en la línea de tiempo de la oportunidad, en la ficha del cliente y en
     Actividades, con la hora en la zona de la organización.
6. [ ] **(3B)** Mover de etapa:
   - con criterios sin cumplir sale `MoveStageDialog Resultado=gate`;
   - sin permiso, «sin permiso» resuelto en servidor;
   - queda fila en `opportunity_stage_history` y `crm_events` recibe `stage_changed`;
   - «días en etapa» vuelve a 0.
7. [ ] **(3B)** Ganar con `WinDialog`:
   - `win_data` completo y etapa `is_won`;
   - los pasos elegidos se ejecutan: cotización a factura con `invoice_sales.opportunity_id`,
     comisión en `commissions` y onboarding o renovación si aplica;
   - «Conexiones» del detalle muestra cada uno;
   - el cliente pasa a `customer`.
8. [ ] **(3B)** Perder con `LoseDialog`:
   - la etapa pasa a `is_lost`, con motivo de catálogo, competidor y `closed_at`;
   - `metadata` conserva `gate_overrides`.
9. [ ] Formulario desde cada origen (la ficha del cliente y «Calificar» en la 3A; el resto en la **(3B)**): Pipeline «+», Oportunidades, ficha del cliente, factura de venta
   y conversación.
   - Es la misma instancia, con los campos del origen prellenados y bloqueados.
   - La factura queda vinculada.
10. [ ] **(3B)** KPI:
    - valor abierto y ponderado en moneda base con la tasa del día;
    - una oportunidad sin tasa se excluye con aviso.
11. [ ] Actividades: editar y borrar solo las propias sin permiso; «Cargar más»; filtros por
    responsable, entidad y rango en la zona de la organización.
12. [ ] Un usuario de otra organización no ve ni modifica nada (RLS + rutas); una organización ajena
    en el body da 403 y queda registrada.
13. [ ] Idiomas: la interfaz del núcleo cambia completa en `en`, `fr` y `pt`.
14. [ ] Compuertas: `npx jest`, `npx tsc --noEmit -p tsconfig.json` y `npx next build`, sin
    regresiones sobre el estado conocido de CLAUDE.md.

---

## 8. Decisiones que necesita el dueño antes de la ola 1

| Id | Pregunta | Recomendación |
|---|---|---|
| D1 | ¿Qué ficha de cliente queda: `/app/clientes/[id]` o `/app/crm/clientes/[id]`? | Una sola, `/app/clientes/[id]`, con el bloque CRM; la otra redirige |
| D2 | Leads = `customers.lifecycle_stage='lead'`. ¿Qué pasa con las 42 oportunidades `record_type='lead'` actuales? | Se muestran en Oportunidades con la etiqueta «Lead» y dejan de crearse nuevas con ese tipo |
| D3 | Score del lead: ¿columna propia o ICP del cliente? | Columna `lead_score`, calculada por el servidor desde el ICP |
| D4 | Prioridad de la tarjeta: ¿columna nueva o `temperature` (frío, tibio, caliente)? | Usar `temperature`, que ya existe y el Figma pide en «Calificar», y mostrarla como prioridad; evita M2 |
| D5 | Permisos nuevos (M7): ¿qué roles reciben `close`, `override_gate` y `pipelines.manage`? | Admin y Manager; Empleado solo `view`, `create` y `edit` de lo propio |
| D6 | Notas: ¿`notes` o `activities`? ¿`channel` es el medio? | `notes` para notas y `channel` = medio; migrar las 25 |
| D7 | **Bloqueante.** ¿Se aprueba la sección «CRM — Pipeline y oportunidades (propuesta)» `768:454425` (97 frames) y los componentes de «CRM (Nuevo)» que solo ella usa? Mientras no, la ola 3B no existe | Revisarla frame por frame con el §4.2–§4.8 de este plan y, si se aprueba, quitar «(propuesta)» del nombre de la sección y poner un marcador de aprobación. Aprobar por separado las 3 secciones nuevas de hoy |
| D8 | ¿El POS abre el formulario de oportunidad? | Solo si hay caso de uso; no está dibujado |

---

## Anexo — cómo se obtuvo

- **Figma.**
  - `get_metadata` de la página `759:17` y de la sección `759:20897` a las 22:58 y 23:02 UTC, con el
    mismo tamaño de respuesta en las dos lecturas: sin cambios.
  - Tercera lectura, a las 23:11–23:12 UTC, de `759:17` y de la página `3:2`, comparando ids.
    - Aparecieron 13 nodos nuevos en «11 CRM»: las secciones `1295:767945` y `1295:767955`, cada una
      con su título y sus filas.
    - Aparecieron 47 nodos nuevos en «02 Componentes»: la sección `1295:36609`.
    - Ninguno se quitó. Las secciones existentes no cambiaron.
  - `get_screenshot` de `765:446571`, `767:2873`, `759:444936`, `768:454428`, `769:12376`,
    `773:23160` y `775:473076` para contrastar los datos pintados con la BD.
  - No se llamó a ninguna herramienta de escritura.
- **Código.** `find`, `grep` y `wc` sobre `src/**`. Las métricas de §2.2 salen de búsquedas de
  imports, así que son aproximadas por archivo, no por uso.
- **BD.** Solo `SELECT`:
  - `information_schema.columns`, `pg_constraint`, `pg_policies`, `pg_proc` e
    `information_schema.triggers`;
  - conteos agregados por tabla.

  Ningún dato de cliente se copió aquí.


---

## Ola 1 — estado

Actualizado el 2026-09-30. Backend de la ola 1 con las decisiones del dueño D1–D8 (D7 aprobado:
el backend de la 3B entra). Sin commit.

### Migraciones (todas por MCP, con `.sql` en `supabase/migrations/` y rollback en `supabase/rollbacks/`)

| Archivo | Qué | Estado |
|---|---|---|
| `20260930160100_crm_ola1_permisos` | M7: 12 permisos `crm.*` nuevos + `role_permissions` (D5); `fn_crm_tiene_permiso` / `fn_crm_exigir_permiso`; etapas por `crm.stages.manage` | aplicada antes del corte |
| `20260930160200_crm_ola1_revocar_etapa_heredadas` | M9: sin EXECUTE las 6 funciones heredadas de etapa | aplicada antes del corte |
| `20260930160300_crm_ola1_customers_lead` | M1: `owner_id`, `lead_source` (CHECK), `lead_score`, `icp_band`, `last_contact_at` (trigger), descarte | aplicada antes del corte |
| `20260930160400_crm_ola1_calendar_events_opportunity` | M3: `calendar_events.opportunity_id` + relleno | aplicada antes del corte |
| `20260930160500_crm_ola1_oportunidad_alta_triggers` | M5: ciclo de vida en INSERT + etapa inicial en el historial | aplicada antes del corte |
| `20260930160600_crm_ola1_oportunidad_rpc` | M4: `crm_create/update/delete_opportunity` | aplicada antes del corte |
| `20260930160700_crm_ola1_pipeline_rpc` | M6: `crm_create_pipeline_with_stages`, `crm_set_default_pipeline`, `crm_delete_pipeline` | **aplicada en esta sesión** |
| `20260930160800_crm_ola1_web_capture_lead_cliente` | D2: la captura web deja de crear oportunidades 'lead'; marca el cliente (`lead_source='web_form'`) | **aplicada en esta sesión** |

Verificado por MCP que los seis archivos anteriores son byte a byte lo aplicado (md5 de
`schema_migrations.statements`), igual que los dos nuevos. Cambio respecto al borrador de M6: **no**
se crea el índice por tipo; ya existía `unique_default_pipeline_per_org (organization_id) WHERE
is_default` y el tablero abre el pipeline por defecto de la organización, así que «por defecto» es
por organización. Pruebas en seco con `DO … RAISE EXCEPTION` de las dos: Empleado sin
`crm.pipelines.manage` → 42501; nombre repetido → 23505; sin etapa ganadora / probabilidades
desordenadas / periodo inválido → 22023; organización ajena → denegado; borrar un pipeline con
oportunidades → P0001; captura web sin oportunidad nueva, con `lead_source='web_form'` y
reactivación del descarte.

**M8 (RLS de autor en `activities` y `notes`) no se aplicó**: hay escritores legítimos de filas
ajenas (fusión de identidades, sincronización de llamadas y de correo) que una política de autor
rompería. La autoría se exige en el servidor (`activityEditService`). Tampoco M2 (D4: prioridad =
`temperature`), M10, M11 ni M12.

### Permisos por rol (D5, resueltos en el servidor con `hasOrgAdminOrPermission`)

| Rol | Permisos CRM |
|---|---|
| 1 Super Admin, 2 Admin de organización | todos (atajo de administrador + `role_permissions`) |
| 5 Manager | `opportunities.{view,create,edit,edit_any,delete,close}`, `stages.{manage,override_gate}`, `pipelines.manage`, `activities.edit_any`, `leads.{view,create,edit,assign,convert}` |
| 4 Empleado | `opportunities.{view,create,edit}` (editar solo lo propio: responsable o creador), `leads.{view,create,edit,convert}` (editar/descartar solo su lead o uno sin responsable) |

Un cargo (`job_position_permissions`) sigue mandando sobre el rol. Las rutas de etapas
(`/api/crm/stages/**`) y el override del gate dejan la lista de ids de rol y usan
`crm.stages.manage` / `crm.stages.override_gate`.

### Rutas nuevas o cambiadas

- `GET|POST /api/crm/opportunities`, `GET|PATCH|DELETE /api/crm/opportunities/[id]` (RPC M4;
  `es_lead` marca las 42 heredadas).
- `PATCH …/[id]/stage` (propia o `edit_any`; `close` para cerrar o reabrir; `override_gate`),
  `POST …/[id]/win` y `POST …/[id]/lose` (siempre a la etapa `is_won` / `is_lost`, por
  `opportunityStageService`), `PUT …/[id]/customer`, `GET …/[id]/meetings`,
  `GET …/[id]/stage-history`, `GET …/[id]/finance`.
- `GET|POST /api/crm/pipelines`, `PATCH|DELETE /api/crm/pipelines/[id]`;
  `POST /api/crm/pipeline-templates/[id]/import` pasa a la RPC y a `crm.pipelines.manage`.
- `PATCH|DELETE /api/crm/activities/[id]` y `/api/crm/notes/[id]`: solo lo propio salvo
  `crm.activities.edit_any`; las actividades `system` no se tocan.
- Leads: `GET /api/crm/leads` ahora lista **clientes** en etapa lead (paginado, conteo, filtros de
  origen, responsable, descartados, fechas y búsqueda); la lista vieja vive en
  `GET /api/crm/leads/heredados` mientras la pantalla actual la use. `POST /api/crm/leads/[id]/qualify`,
  `PATCH /api/crm/leads/[id]/discard`, `POST /api/crm/leads/assign`. `POST …/[id]/convert` (solo
  heredadas) pasa de rol admin a `crm.leads.convert`.
- `markAsLost` del navegador pasa a `POST …/lose`; las reuniones escriben
  `calendar_events.opportunity_id`.

### Modelo de leads (D2, D3) e importador

`createLeadWithCustomer` crea o marca la ficha (`lead_source`, `owner_id`, `metadata.lead`) y no crea
oportunidad; nunca degrada un cliente ya avanzado y reactiva uno descartado. `lead_score` /
`icp_band` salen del ICP (`leadScoreService` sobre `icpService.evaluateICP`). La asignación
automática (round-robin y carga) ahora cuenta también los leads-cliente. El importador conserva
dedupe, RNE pendiente, moneda y pruebas; ver `docs/crm-revenue-os/IMPORTAR-LEADS.md` (sección
añadida).

### Pruebas

- Nuevas: `src/app/api/crm/opportunities/__tests__/ola1Oportunidades.contract.test.ts` (38),
  `src/app/api/crm/leads/__tests__/ola1Leads.contract.test.ts` (15),
  `src/lib/services/crm/__tests__/ola1Servicios.test.ts` (29); guardarraíl 36 en
  `src/__tests__/guardrails.test.ts` (escrituras de `opportunities`/`activities` desde
  `src/components/crm/**` con deuda congelada de 9 archivos; ninguna oportunidad `record_type='lead'`
  nueva en TS ni en migraciones posteriores a la ola).
- Adaptadas al modelo nuevo: alta de leads, asignación automática, referidos, importador y
  `markAsLost`.
- Resultado: guardarraíles, `src/app/api/crm/**`, `src/lib/services/crm/**`, `src/lib/crm/**` e i18n
  en verde salvo `f10Proposals.contract` y `f6Adversarial`, que fallan por cambios de otras sesiones
  en archivos que la ola 1 no toca (zona horaria y middleware).

### Pendiente y riesgos

- La pantalla actual de Leads lista solo las oportunidades 'lead' heredadas hasta la ola 3A: un lead
  creado ahora (cliente) no aparece en ella, sí en `GET /api/crm/leads` y en la ficha del cliente.
- Onboarding no tiene etapa perdida: «perder» ahí responde 409 `sin_etapa_perdida`.
- `fn_crm_uuid_o_null` (160600) no fija `search_path` (aviso del asesor); corregir en la próxima
  migración de la ola.
- Automatizaciones que dependían de que la captura web creara una oportunidad dejan de dispararse
  con ese evento.

---

## Ola 2 — estado

Fecha: 2026-09-30. Kit CRM en `src/components/crm/kit/`: 20 sets de «CRM (Nuevo)» (`759:20897`)
y los 4 reutilizados de «Clientes» (`223:7911`). Solo presentación y lógica pura: ninguna pantalla
conectada ni API de escritura (eso es la 3A/3B). Los cuerpos que arma la lógica son los que validan
las rutas de la ola 1 (`opportunityWriteService`, `…/win`, `…/lose`).

D7 aprobada: la sección `768:454425` ya se llama «CRM — Pipeline y oportunidades» y lleva junto al
título el marcador «Aprobada por el dueño 2026-09-29» (nodo `1301:769878`). Verificado en Figma; no
hizo falta tocar nada más.

### Componente Figma ↔ archivo

| Componente (node-id) | Archivos | Estado |
|---|---|---|
| `QuickAction` (`759:21219`) | `QuickAction.tsx`, `quickActionLogica.ts` | 24 variantes; deshabilitado siempre con motivo (`aria-disabled`, sigue en el tabulado) |
| `QuickActionsBar (CRM)` (`759:21433`) | `QuickActionsBarCrm.tsx` | 5 variantes; `toolbar` con flechas; tarjeta siempre visible |
| `OpportunityRowMenu` (`759:21624`) | `OpportunityRowMenu.tsx`, `opportunityRowMenuLogica.ts` | sobre `RowActionsMenu` del kit |
| `OpportunityCard` (`759:22188`) | `OpportunityCard.tsx`, `opportunityCardLogica.ts` | prioridad = `temperature` (D4) como Baja/Media/Alta |
| `StageColumn` (`759:22544`) | `StageColumn.tsx`, `stageColumnLogica.ts` | normal, destino, vacía, cargando |
| `KpiMoneda` (`759:22664`) | `KpiMoneda.tsx`, `kpiMonedaLogica.ts`, `monedaCrm.ts` | la tasa nunca se inventa |
| `LeadRow` (`759:444712`) | `LeadRow.tsx`, `leadRowLogica.ts` | orígenes = `LEAD_SOURCES` de `enums.ts` (ola 1) |
| `QualifyLeadDialog` (`759:445219`) | `QualifyLeadDialog.tsx`, `qualifyLeadLogica.ts` | entrega el prellenado de `OpportunityForm Origen=lead` |
| `CaptureBanner` (`759:444768`) | `CaptureBanner.tsx`, `captureBannerLogica.ts` | oculto sin leads sin colocar |
| `TimelineFilters` (`759:444935`) | `TimelineFilters.tsx`, `timelineFiltersLogica.ts` | rango → instantes en la zona de la organización |
| `CargarMas` (`759:444795`) | `CargarMas.tsx`, `cargarMasLogica.ts` | listo, cargando, fin, error |
| `ActivityDialog` (`760:445129`) | `ActivityDialog.tsx`, `ActivityDialogCampos.tsx`, `activityDialogLogica.ts` | 5 tipos × dialog/hoja (`PanelAdaptable`) |
| `CustomerLinkPicker` (`761:23596`) | `CustomerLinkPicker.tsx`, `customerLinkPickerLogica.ts` | buscar, sin resultados, cargando, crear, cargo |
| `WinDialog` (`761:23994`) | `WinDialog.tsx`, `winDialogLogica.ts` | `won_data` se fusiona con el anterior |
| `LoseDialog` (`761:24268`) | `LoseDialog.tsx`, `loseDialogLogica.ts` | catálogo `loss_reasons`; competencia pide competidor y precio |
| `MoveStageDialog` (`761:24498`) | `MoveStageDialog.tsx`, `moveStageDialogLogica.ts` | confirmar, gate, sin permiso |
| `OpportunityForm` (`766:448739`) | `OpportunityForm.tsx`, `OpportunityFormCampos.tsx`, `opportunityFormLogica.ts` | 3 layouts × 5 orígenes × crear/editar |
| `StageEditorRow` (`798:24970`) | `StageEditorRow.tsx`, `stageEditorRowLogica.ts` | validación de la lista entera |
| `PipelineTemplateCard` (`800:25326`) | `PipelineTemplateCard.tsx`, `pipelineTemplateCardLogica.ts` | las 4 plantillas reales de `pipelineTemplates.ts` |
| `StageBar` (`801:25456`) | `StageBar.tsx`, `stageBarLogica.ts` | escritorio y móvil |
| `OpportunityDrawerHeader` (`801:25828`) | `OpportunityDrawerHeader.tsx`, `drawerHeaderLogica.ts` | escritorio, móvil, móvil compacta |
| Íconos `Icon/Trophy`, `ListPlus`, `Kanban` (`759:20898`) | lucide | sin archivo propio |
| `CustomerIdentityCard` (`329:108665`) | `CustomerIdentityCard.tsx`, `customerIdentityCardLogica.ts` | persona y empresa, con `QuickActionsBar Variant=cliente` |
| `TimelineEntry` (`329:109173`) | `TimelineEntry.tsx`, `timelineEntryLogica.ts` | 11 tipos (incluidos reunión y llamada IA) y menú «⋯» si es editable |
| `CustomerPicker` (`192:11644`) | `src/components/kit/CustomerPicker.tsx` (ya existía) | se reutiliza tal cual; `CustomerLinkPicker` cubre el vinculador del CRM |
| `ContactoVinculadoRow` (`329:109310`) | `ContactoVinculadoRow.tsx`, `contactoVinculadoRowLogica.ts` | cargo en línea (Enter/Escape); desvincular lo confirma la pantalla |

Comunes: `camposCrm.ts` (clases de campo, `parsearMonto`, símbolo de moneda), `fechasCrm.ts`
(día relativo, `datetime-local` ↔ instante en la zona de la organización).

### i18n

Namespace `crm.kit` en `messages/{es,en,fr,pt}.json`: 536 claves con paridad exacta. En fr y pt el
namespace `crm` solo tiene `kit`; el resto de `crm` sigue sin traducir (deuda previa).
`src/__tests__/i18n/traduccionesModulos.test.ts` ahora admite namespaces anidados y vigila
`crm.kit` (paridad, ICU válido, variables y toda clave que pide el código).

### Pruebas

- `src/components/crm/kit/__tests__/kitCrmLogica.test.ts`: 39 pruebas de lógica, con «ahora» fijo
  y zona explícita (pasan con `TZ=UTC` y `TZ=America/Bogota`).
- `src/components/crm/kit/__tests__/kitCrmRender.test.tsx`: 95 pruebas de render (sin jest-dom), cada
  componente en los 4 idiomas con el proveedor real de next-intl. Una clave faltante o una variable
  ICU que no llega hacen fallar la prueba. Incluyen comportamiento: validación y prellenado de
  «Calificar», nota con `is_pinned`, vinculador con debounce y «Ya vinculada», ganar en 3 pasos,
  competencia en perder, gate con permiso de omitir, bloqueo por origen del formulario y cargo en
  línea.
- En verde: `guardrails.test.ts` e `i18n` (831), kit y navegación (491), tsc acotado y ESLint de
  los archivos tocados.

Bug corregido al probar: `parsearMonto('18.000.000')` devolvía 18 000 (el separador de miles
repetido se leía como decimal). Afectaba a presupuesto, monto y precio del competidor.

### Diferencias con el Figma (decididas)

- `OpportunityCard`: no hay `Estado=acciones` aparte. Las acciones se ven siempre (pedido del dueño
  del 2026-09-24).
- `CustomerLinkPicker`:
  - se elige con clic o Enter sobre la fila, sin botón «Seleccionar» en el pie;
  - los tipos de documento llegan por prop (`country_identification_types` del país), no cableados.
- `ActivityDialog`:
  - la duración es un campo de texto (4:12 o 4 min 12 s);
  - el fin de la reunión se elige por duración;
  - los participantes se escriben como texto (el selector de usuarios y clientes es de la 3A).
- `TimelineFilters`: sin rango elegido, «Todas las fechas» propone los últimos 30 días (el
  `DateRangeButton` del kit no admite rango vacío).
- `StageEditorRow`: el color es un `select` con los colores que pasa la pantalla; no hay selector
  libre.
- `OpportunityForm Layout=page`:
  - las líneas (productos, espacios PMS, conceptos) y «Origen y comisión» llegan como
    `seccionesPagina`;
  - el editor de líneas de `oportunidades/OpportunityForm.tsx` se parte en la 3B, no aquí.
- `OpportunityForm Layout=sheet`: es un panel lateral de 480 px (`Sheet`); `dialog` usa
  `PanelAdaptable` (hoja inferior en móvil).
- `WinDialog`: el motivo de ganancia y la comisión solo se muestran si la pantalla pasa el catálogo
  y la comisión. No hay tabla de motivos de ganancia en la base.
- `CustomerIdentityCard`: el nivel («Oro») es una prop, porque no hay columna de nivel en
  `customers`. «Nuevo» = creado hace menos de 30 días en la zona de la organización.

### Pendiente para la 3A/3B

- Conectar pantallas y rutas:
  - `onGuardar`, `onEnviar`, `onGanar` y `onPerder` → rutas de la ola 1;
  - la búsqueda del vinculador → `/api/crm/customers/search` (el RPC no filtra por tipo; hoy filtra
    el kit).
- Guardarraíl nuevo (§7.4): ningún archivo de `src/components/crm/kit` escribe con
  `@/lib/supabase/config`. Hoy se cumple: el kit no importa Supabase.

---

## Ola 3A — estado

Fecha: 2026-09-30. Pantallas de la sección «CRM — Leads, actividades y acciones rápidas»
(`765:446568`) conectadas al backend de la ola 1 y al kit de la ola 2. Sin commit. Toda escritura va
por `/api/crm/**` (guardarraíl 36); ninguna pantalla nueva importa `@/lib/supabase/config`.

### Pantallas ↔ Figma ↔ código

| Paso | Figma | Ruta | Código |
|---|---|---|---|
| 3A.2 Leads | `765:446571` listo, `765:447453` selección, `765:448463` sin colocar, `767:2873` detalle, `767:3240` + `772:21705` calificar, `767:3470` cargando, `767:4403` vacío, `767:5218` sin resultados, `767:6038` error, `767:6852` sin permiso; móvil `768:6419`–`768:8738` | `/app/crm/leads` | `src/components/crm/leads/pantalla/**` (`LeadsPantalla`, `LeadsTabla`, `LeadsListaMovil`, `LeadsKpis`, `LeadsFiltros`, `LeadDetalleHoja`, `CalificarLead`, `AsignarResponsableDialog`, `leadsPantallaLogica`, `calificarLogica`, `useLeadsPantalla`) |
| 3A.3 Actividades | `769:12376`, `769:13036` menús, `769:13655` llamada, `769:13838` editar nota, `769:13935` eliminar, `770:15494` cargando, `770:16039` vacío, `770:16578` sin resultados; móvil `770:17115`, `770:17351`, `770:17452` | `/app/crm/actividades` | `src/components/crm/actividades/pantalla/**` (`ActividadesPantalla`, `EntradaActividad`, `EditarEntradaDialog`, `FiltrosMovilActividades`, `actividadesPantallaLogica`, `useActividadesPantalla`) |
| 3A.1 Acciones rápidas | `773:472568`, `773:472975` | tarjeta del kanban, drawer, detalle, línea de tiempo, ficha, detalle del lead | `src/components/crm/acciones/**` (`AccionesRapidasCrm`, `ModoLlamadaDialog`, `TareaRapidaDialog`, `accionesRapidasLogica`, `apiCrm`, `useCatalogosCrm`, `buscarClientes`) |
| 3A.4 Ficha (D1) | `772:19838`, `772:20628`, `772:20971`, `772:21523` | `/app/clientes/[id]`; `/app/crm/clientes/[id]` redirige | `src/components/crm/ficha/useFichaClienteCrm.tsx` + ranuras aditivas en `ClienteHeader`, `OportunidadesTab`, `ResumenTab` y `TareasSidebar` |

- **Leads cierra la regresión de la ola 1:** la pantalla lista `GET /api/crm/leads` (clientes en
  etapa lead, D2) y ya no `…/leads/heredados`, que queda sin llamadores (se puede borrar en la ola 5).
- «Calificar»: `QualifyLeadDialog` → `OpportunityForm layout=dialog origen=lead` →
  `POST /api/crm/leads/[id]/qualify` (el navegador no manda `customer_id` ni `origen`) → abre la
  oportunidad creada.
- Acciones rápidas: la barra del kit (`QuickActionsBarCrm`, siempre visible, motivo visible incluido
  `do_not_call`) sustituye a `shared/QuickActionsBar` en `OpportunityCardV2`, `DrawerHeader`,
  `DetailHeader` y `OpportunityTimeline`. Llamar → modos (navegador, mi celular, agente IA
  deshabilitado con motivo, solo registrar) → «Registrar llamada» (`/api/crm/activities`) con tarea de
  seguimiento para mí (`/api/crm/tasks`, 10:00 de la organización); Reunión y Nota por
  `ActivityDialog` (`/api/crm/meetings`, `/api/crm/notes`); Email y WhatsApp siguen en sus
  compositores únicos (regla dura 7: WhatsApp cobra créditos); Tarea por `/api/crm/tasks` (el
  servidor la asigna al usuario actual). Un solo evento `crm:entity-changed` refresca Leads,
  Actividades, el detalle del lead y la ficha.
- Ficha única (D1): barra `Variant=cliente` con «Nueva oportunidad» → `OpportunityForm layout=sheet
  origen=cliente` → `POST /api/crm/opportunities`; «Nueva oportunidad» también en la pestaña y en su
  vacío (con KPI «Perdidas»); vacío corregido del resumen (Nota, Registrar llamada, Registrar venta);
  «+ Nueva» y «Crear la primera tarea» en el panel de tareas. Lo que solo tenía la ficha del CRM se
  movió: salud (panel lateral), folios del PMS (Cuentas) y documentos del CRM (Notas y archivos).

### Backend añadido (lecturas, sin migraciones)

| Ruta | Qué |
|---|---|
| `GET /api/crm/activities` | Línea de tiempo de la organización: `activities` + `notes` + tareas del CRM (`related_to_type` cliente u oportunidad). Filtros `types`, `q`, `user_id`, `customer_id` (incluye sus oportunidades) u `opportunity_id`, `from`/`to`. Cursor `(instante crudo, id)` y total exacto solo en la primera página. `editable` por entrada, resuelto en el servidor con la regla de `activityEditService` (propio o `crm.activities.edit_any`; nunca `system` ni tareas). Servicio: `src/lib/services/crm/actividadesOrgService.ts`. |
| `GET /api/crm/activities/resumen` | Los 7 KPI (total, llamadas, correos, WhatsApp, reuniones, notas, tareas abiertas) con rango, responsable y entidad. |
| `GET /api/crm/leads/resumen` | KPI de Leads (total, +mes, sin responsable, contactados 7 días, calificados este mes = oportunidades `metadata.origen='lead'`) y «sin colocar» (leads `web_form` si no hay pipeline `sales`; sustituye a M1b sin RPC). Instantes calculados en la zona por la interfaz. `crm.leads.view`. |
| `GET /api/crm/permisos` | Permisos `crm.*` de la sesión para mostrar/ocultar botones (admin por id de rol o `get_user_permission_codes`). Solo interfaz: cada escritura se vuelve a exigir. |
| `GET /api/crm/leads` | Añade `do_not_call`, `avatar_url` y `city` a las columnas (motivo «Pidió no ser llamado» y detalle). |

`ActividadesService.updateActivity/deleteActivity` (detalle `/app/crm/actividades/[id]`) pasan a
`PATCH`/`DELETE /api/crm/activities/[id]`; su entrada sale de la deuda congelada del guardarraíl 36.

### i18n

Namespaces nuevos en `messages/{es,en,fr,pt}.json` con paridad exacta (254 claves):
`crm.accionesRapidas`, `crm.pantallaLeads`, `crm.pantallaActividades` y `crm.fichaCliente`,
registrados en `src/__tests__/i18n/traduccionesModulos.test.ts`. Fechas con `useFormatDate` /
`dateDisplay` y la zona de la organización (días de Actividades, rango de captura, vencimientos);
moneda con `useMonedaOrganizacion`.

### Pruebas

- `src/app/api/crm/__tests__/ola3aRutas.contract.test.ts` (13): feed de la organización sin señuelos
  de la 121, `editable` propio/ajeno/`edit_any`/sistema/tareas, cursor con microsegundos y empate por
  id, filtros, 400/401; KPI; resumen de Leads y «sin colocar»; permisos Empleado vs administrador.
  `ola1Fake.ts` admite ahora `lte` y `or` (aditivo).
- `src/components/crm/leads/pantalla/__tests__/leadsPantallaLogica.test.ts` (17): parámetros en la
  zona (Bogotá), estados, filas, selección, CSV sin fórmulas, cuerpo de calificar, días de
  Actividades en la zona, propias vs ajenas (duplicar/editar/rutas), cuerpos de llamada, seguimiento,
  reunión, nota y tarea. Pasa con `TZ=UTC` y `TZ=America/Bogota`.
- `src/components/crm/leads/pantalla/__tests__/pantallasOla3aRender.test.tsx` (18, sin jest-dom, 4
  idiomas): Leads listo (lee `/api/crm/leads`, nunca `/heredados`), vacío, sin permiso, error con
  reintento, sin colocar, móvil «Cargar 25 más», flujo lead → calificar → oportunidad, asignar en
  lote; Actividades listo con menú solo en lo propio, vacío, filtro por tipo, borrar por `DELETE`,
  sin permiso. Cada prueba verifica que toda escritura va a `/api/crm/**`.
- `src/components/crm/acciones/__tests__/accionesRapidasRender.test.tsx` (4): motivo `do_not_call`,
  Nota → `/api/crm/notes` + evento, Tarea sin `assigned_to`, «Nueva oportunidad» de la ficha →
  `/api/crm/opportunities` con `origen=cliente`.
- En verde: guardarraíles + i18n (895), `src/app/api/crm/**` y `src/components/crm/**` (1 769 − 4:
  solo falla `f10Proposals.contract`, el fallo preexistente anotado en la ola 1). tsc acotado de los
  archivos tocados sin errores; ESLint limpio en los archivos tocados. `npx next build` no se corrió
  (memoria de la sesión).

### Pasos de despliegue

1. Desplegar el código de la 3A (pantallas nuevas y rutas de lectura; sin migraciones propias).
2. **Justo después**, aplicar por MCP `20260930160800_crm_ola1_web_capture_lead_cliente` (está en
   disco con su rollback; se revirtió en la BD porque producción aún usaba la pantalla vieja):
   desde ese momento el formulario de contacto de los sitios deja de crear oportunidades 'lead' y
   solo marca al cliente `lead_source='web_form'`, que la pantalla nueva ya muestra. Verificado por
   MCP el 2026-09-30: no figura en `schema_migrations`. Tras aplicarla, comprobar el md5 del `.sql`
   contra lo aplicado, como en la ola 1.
3. Avisar a quien mantenga automatizaciones que se disparaban con la oportunidad 'lead' de la
   captura web (ver «Pendiente y riesgos» de la ola 1).

### Diferencias con el Figma y pendientes

- La cabecera de la ficha sigue siendo `ClienteHeader` con la barra en una ranura; sustituirla por el
  `CustomerIdentityCard` del kit (ola 2) queda para la ola 4 (línea de tiempo única de la ficha).
- Tarea: diálogo rápido propio (`TareaRapidaDialog`) hasta que exista el `TaskForm` del PM (ola 4);
  el Figma `772:21523` dibuja el formulario completo.
- WhatsApp y Email usan sus compositores existentes, no los cuerpos `correo`/`whatsapp` del
  `ActivityDialog` (regla dura 7). La hoja móvil «enviar WhatsApp» (`770:17452`) es la del
  compositor.
- «Etiquetar» (fila y barra masiva) no tiene ruta de etiquetas en el CRM: la fila abre la edición de
  la ficha y en la barra masiva está deshabilitado con su motivo. Pendiente: `PATCH` de etiquetas.
- Selección masiva: sin «Seleccionar los N» de todas las páginas (asignar admite 500 ids); descartar
  en lote va uno por uno (la ruta comprueba cada lead).
- Participantes de la reunión: el correo y el nombre del cliente como texto; el selector de usuarios
  y clientes sigue pendiente (ola 2 lo dejó para la 3A: se anota para la ola 4).
- Editar una nota enriquecida la guarda como texto plano.
- El vacío corregido del resumen se muestra cuando el cliente no tiene ventas, reservas ni pedidos
  web; no mira llamadas ni notas (el resumen no las lee).
- «Registrar venta» del vacío abre el POS sin el cliente elegido (el POS no recibe el cliente por
  URL).
- Actividades arranca con el mes en curso (Figma «1 – 23 sep»); un mes sin nada es «vacío», cualquier
  otro filtro sin resultados es «sin resultados».
- M10/M11 siguen sin aplicarse: los KPI y el feed cuentan con `count` exacto sobre índices por
  organización; si la organización grande (35 000 leads) lo nota, crear los índices de M11.
- Código muerto tras la 3A (ola 5): `components/crm/actividades/{ActividadesPage,ActividadesTable,ActividadForm,ActividadesFiltros,ActividadesStats,ActividadesPagination}`,
  `shared/QuickActionsBar.tsx` (ya sin usos; sus pruebas de F15/F16 leen el archivo) y la ruta
  `GET /api/crm/leads/heredados`.

---

## Ola 3B — estado

Fecha: 2026-09-30. Pantallas de la sección «CRM — Pipeline y oportunidades» (`768:454425`, aprobada
por el dueño, D7) conectadas al backend de la ola 1 y al kit de la ola 2. Sin commit. Toda escritura
de oportunidades, etapas y actividades va por `/api/crm/**`; las pantallas nuevas no importan
`@/lib/supabase/config` (guardarraíl 36, prueba nueva), salvo `oportunidad/pasosGanar.ts`, que arma
las dependencias de los ejecutores únicos de `wonCloseSteps` (los mismos del `WonCloseModal`).

### Pantallas ↔ Figma ↔ código

| Paso | Figma | Ruta | Código |
|---|---|---|---|
| 3B.1 Pipeline | `768:454428` listo, `768:456094` arrastrando, `768:457615`/`812:53241` menú y acciones, `768:459368` tabla, `770:462337`–`770:465308` estados; móvil `771:37311`–`771:38704`, `812:54748` | `/app/crm/pipeline` | `src/components/crm/pipeline/pantalla/**` (`PipelinePantalla`, `KanbanTablero`, `PipelineMovil`, `TablaPipeline`, `EstadosPipeline`, `EtapasPipeline`, `useTableroPipeline`, `usePipelines`) |
| 3B.2 Selector y «Nuevo pipeline» | `812:54821`, `816:56539`, `816:56990`, `816:57260`, `816:57906`, `816:58273`; móvil `817:*` | Pipeline | `SelectorPipeline`, `NuevoPipelineAsistente`, `nuevoPipelineLogica` |
| 3B.3 Drawer | `776:30540`, `820:*`, `822:*`, `823:*`, `824:*` | Pipeline (tarjeta) | `src/components/crm/oportunidad/OportunidadDrawer.tsx`, `ResumenOportunidad.tsx` |
| 3B.4 Oportunidades | `773:23160`–`773:27539`; móvil `775:471491`–`775:472941`, `845:82719` | `/app/crm/oportunidades` | `src/components/crm/oportunidades/pantalla/OportunidadesPantalla.tsx` + `oportunidad/{TablaOportunidades,ListaMovilOportunidades,AccionesMasivas,KpisOportunidades,FiltrosOportunidades,useListaOportunidades}` |
| 3B.5 Detalle | `775:473076`, `775:473990`, `775:474532`, `775:474947`, `775:475356`; móvil `776:30808`–`776:31652` | `/app/crm/oportunidades/[id]` | `oportunidad/{OportunidadDetalle,MetricasOportunidad,ConexionesOportunidad,LineasResumen}` |
| 3B.6 Formulario y entradas | `778:32176`, `778:33132`, `778:33942` | `/app/crm/oportunidades/nuevo` (`?pipeline&etapa&cliente&nombreCliente`), `…/[id]/editar`, «+» de columna | `oportunidad/{FormularioOportunidadPagina,NuevaOportunidadDialogo,LineasOportunidad,OrigenComisionSeccion,lineasLogica}` |
| 3B.7 Diálogos | `779:36778`–`779:37686`; móvil `779:37888`–`779:38675` | tablero, lista, drawer y detalle | `oportunidad/{useFlujoEtapa,useAccionesOportunidad,pasosGanar}` + `WinDialog`, `LoseDialog`, `MoveStageDialog`, `CustomerLinkPicker` del kit |

- **Flujo de etapa único** (`useFlujoEtapa`): tablero, tabla, lista, drawer y detalle usan el mismo.
  Destino ganada → `WinDialog` → `POST …/win`; perdida → `LoseDialog` → `POST …/lose` (siempre a la
  etapa `is_lost`, motivo del catálogo `GET /api/crm/loss-reasons`); abierta → `MoveStageDialog` →
  `PATCH …/stage` (y `PATCH …/[id]` del próximo contacto si cambió). Sin `edit` propio/`edit_any` o
  sin `close` para cerrar/reabrir, «sin permiso» sin llamar al servidor; el 409 `gate` abre el diálogo
  con los requisitos y «Avanzar de todos modos» solo con `crm.stages.override_gate`.
- **Kanban**: @dnd-kit (puntero). Alternativa de teclado: «Mover de etapa» del menú «⋯» de cada
  tarjeta. Soltar en una columna abierta mueve YA (optimista) y revierte si el servidor rechaza;
  soltar en Ganada/Perdida abre su diálogo sin mover. Cada columna pide sus tarjetas paginadas
  (`GET /api/crm/opportunities?stage_id=…&limit=20`, «Cargar más» por columna).
- **Ganar**: `POST …/win` y después los pasos elegidos por los ejecutores ÚNICOS de `wonCloseSteps`
  (`pasosGanar.crearDepsGanar`, que ahora comparte el `WonCloseModal`). «Agradecimiento» no tiene
  ejecutor; reservas y comisión se ejecutan siempre (son del sistema).
- **D2**: las 42 `record_type='lead'` llevan la etiqueta «Lead» (tarjeta del kit con `esLead`, tabla
  y detalle).
- **Formulario en página**: `OpportunityForm layout=page` + `seccionesPagina` (líneas y «Origen y
  comisión»). El total de líneas es `lineasLogica.totalLineas`, que también usa ahora el formulario
  anterior (un solo cálculo; las oportunidades no llevan impuestos). El kit ganó dos props aditivas:
  `clienteId` (cliente elegido con `CustomerLinkPicker`) y `montoCalculado` (suma de líneas).

### Backend añadido

| Qué | Detalle |
|---|---|
| `GET /api/crm/opportunities` | Pasa a `oportunidadesLecturaService`: filtros de temperatura (D4), cierre, «sin responsable», búsqueda por nombre **o cliente**, orden (`sort`/`dir`) y por fila `cliente_nombre`, contacto del cliente, `etapa` y `entro_etapa_en`. |
| `GET /api/crm/opportunities/resumen` | Conteos por estado, abiertas por moneda (con ponderado), cierres del mes, ganadas/perdidas a 90 días y tasas de la organización. Moneda base resuelta en el servidor (`resolveOrgCurrency`). Lee 7 columnas en páginas de 1000 hasta 20 000 (`truncado`). |
| `GET /api/crm/pipelines/[id]/board` | Pipeline (404 si es de otra organización), etapas y el resumen del pipeline; **no** trae tarjetas. |
| `GET /api/crm/opportunities/[id]` | Añade cliente, etapa, pipeline, espacios, nombre del producto y `entro_etapa_en`. |
| `PUT /api/crm/opportunities/[id]/score` | Calificación GOC calculada en el servidor (`scoringCalculo.calcularScore`, cálculo único que ahora usa también `scoringService`). |
| `PATCH /api/crm/opportunities/[id]/seguimiento` | Próximo paso: lo editable por `crm_update_opportunity`; canal y resultado del último contacto (no están en la RPC) en el servidor con la organización. |
| `GET /api/crm/loss-reasons` | Motivos globales + de la organización, activos. |
| Migración `20260930210000_crm_ola3b_lineas_espacios` | `fn_crm_opp_lineas_aplicar` aplica también `spaces` (espacios del PMS, por diferencia, espacio de una sucursal de la organización) y `fn_crm_uuid_o_null` fija `search_path` (aviso de la ola 1). Aplicada por MCP; prueba en seco con `begin … rollback`; md5 del `.sql` = lo aplicado (`a407f9b1…`). Rollback en `supabase/rollbacks/`. |

Bug encontrado por la prueba de contrato: devolver el constructor de PostgREST desde una función
`async` lo ejecutaba (es «thenable») sin orden ni rango; `aplicarFiltros` devuelve `{ q }`.

### Guardarraíl 36: deuda vaciada

De 8 entradas queda 1. Salieron:

- `oportunidades/opportunitiesService.ts` → `POST`, `PATCH` (+ `…/stage` y `…/seguimiento`) y
  `DELETE /api/crm/opportunities/**`; estado, cierre y ficha de venta ya no se escriben por ahí.
- `pipeline/TableView.tsx` → `DELETE /api/crm/opportunities/[id]`.
- `pipeline/drawer/SalesTeamTerritorySelectors.tsx` y `equipo/tabs/AsignarTab.tsx` → `PATCH …/[id]`.
- `oportunidades/ScoringSection.tsx` → `PUT …/[id]/score`.
- `pipeline/services/pipelineService.ts` → `POST /api/crm/opportunities` (antes insertaba
  `status:"active"`, que el CHECK rechaza).
- `oportunidades/ImportLeadsCsv.tsx`: código muerto sin importadores, **borrado**.

Queda `identidades/IdentidadesService.ts` (fusión de identidades): no es pantalla de la 3B; necesita
su RPC transaccional.

### i18n

Namespace `crm.oportunidad` (405 claves) en `messages/{es,en,fr,pt}.json` con paridad exacta, más
`crm.kit.tarjeta.lead`; registrado en `src/__tests__/i18n/traduccionesModulos.test.ts`. Fechas con
`dateDisplay`/`fechasCrm` y la zona de la organización (filtros de cierre y KPI calculados en su día;
«hace 90 días» como instante en su zona). Moneda con `useMonedaOrganizacion`/`resolveOrgCurrency`.

### Pruebas

- `src/app/api/crm/__tests__/ola3bRutas.contract.test.ts` (15): lista (organización de la sesión,
  «Lead», entrada a la etapa, filtros y búsqueda por cliente, filtros inválidos ignorados),
  resumen, board (404 ajeno, 400, 403), detalle, score (servidor calcula; 400 si el navegador manda el
  score; 403 ajena), seguimiento (RPC + contacto con organización; 400; 403 body ajeno), motivos y
  espacios en el alta. `ola1Fake.ts` admite `ilike` dentro de `or()` (aditivo).
- `src/components/crm/oportunidad/__tests__/oportunidadLogica.test.ts` (30): permisos, tarjeta,
  moneda base y «falta tasa», estados, rechazos (gate, cierre, permiso, conflicto), tablero
  optimista, filtros en la zona, líneas y comisión, duplicar, asistente, elección de pipeline, pasos
  al ganar, conexiones y scoring. Pasa con `TZ=UTC` y `TZ=America/Bogota`.
- `src/components/crm/oportunidad/__tests__/pantallasOla3bRender.test.tsx` (26, sin jest-dom, 4
  idiomas): Oportunidades y Pipeline listos; vacío, sin permiso, error con reintento; sin embudo →
  asistente → `POST /api/crm/pipelines` con 9 etapas en una llamada; 409 sin estado a medias;
  crear en página con líneas → mover (menú, alternativa de teclado) → ganar (3 pasos, `…/win` y
  pasos) / perder (`…/lose` a la etapa perdida); Empleado sin cerrar (menú y «sin permiso» sin
  llamada); arrastre optimista revertido por el gate con el diálogo de requisitos; drawer →
  «Guardar seguimiento»; móvil por etapa; detalle listo, 404 y 403. Cada prueba verifica que toda
  escritura va a `/api/crm/**`.
- Adaptadas: `crmOportunidadesRonda` §1 (las líneas van por el servidor en un PATCH, sin
  `total_price` ni escrituras del navegador), `f6Adversarial` (el tablero es `pantalla/KanbanTablero`
  y `EtapasPipeline` monta `StageDialog`), `finanzas/ventas/cotizaciones` (el cableado de la factura
  al ganar vive en `crearDepsGanar`).
- En verde: guardarraíles (174) + i18n + `src/lib/services/crm/**` (3 807 − 1), `src/components/crm/**`
  (562) y `src/app/api/crm/**` (383 − 4). Los únicos fallos son los preexistentes anotados:
  `f10Proposals.contract` y `f6Adversarial › H2` (middleware). tsc acotado de los archivos tocados
  (con sus pruebas) sin errores; ESLint limpio en los archivos tocados. `npx next build` no se corrió
  (memoria de la sesión).

### Diferencias con el Figma y pendientes

- Selector de embudo: muestra etapas por pipeline, no «N abiertas» (no hay conteo por pipeline sin
  leerlos todos).
- «Etapas» abre la lista con editar/eliminar/nueva sobre `StageDialog` y `/api/crm/stages/**`; la
  edición en rejilla con `StageEditorRow` solo está en «Nuevo pipeline».
- «Vincular cliente» (`CustomerLinkPicker`) busca y vincula; crear un cliente desde el vinculador no
  tiene ruta de alta en el CRM: sin «Crear persona/empresa».
- «Importar» de Oportunidades lleva al importador de Leads (se importan leads y se califican).
- Selección masiva: sin «Seleccionar las N» de todas las páginas; cada acción va una por una (cada
  ruta vuelve a comprobar permiso y propiedad).
- Estados de cotización y factura en «Conexiones» se muestran con el valor de la base.
- `/nuevo?cliente=` sin `nombreCliente` deja el cliente elegido pero sin su nombre en el botón.
- Pestañas heredadas del drawer y del detalle (Actividad, Tareas, Notas, Documentos, IA, Onboarding,
  Análisis y Cierre) se reutilizan tal cual; leen del navegador con `useOpportunityData` (solo
  lectura). «Análisis» ahora filtra `activities` por organización.
- Ola 4: «Crear oportunidad» desde factura (`778:34520`) y desde conversación (`778:35164`) con el
  mismo `OpportunityForm`; línea de tiempo única de la ficha; `TaskForm` del PM.
- Ola 5: borrar lo que la 3B dejó sin uso — `PipelineView`, `PipelineHeader`, `KanbanBoardV2`,
  `KanbanColumnV2`, `OpportunityCardV2`, `hooks/useKanbanBoard`, `pipeline/OpportunityDrawer`,
  `drawer/DrawerHeader`, `drawer/StageSelect`, `ClosedWonDialog`, `GateWarningDialog`, `TableView`,
  `modals/CreateOpportunityDialog`, `BulkActionsDialog`, `oportunidades/{OpportunityDetail,
  OpportunitiesTable,OpportunitiesFilters,OpportunitiesStats,MarkWonFlow,StructuredLossDialog,
  LossReasonDialog,OpportunityForm}` y `detail/{DetailHeader,DetailSidebar,useStageFlow}` (antes,
  comprobar importadores); `pipelineService.updateCustomer` escribe `full_name`, que es GENERATED.


## Ola 6 — estado: Identidades, base transaccional (2026-09-30)

Especificación leída directamente en la sección `1295:767955`, frames
`1436:19` (lista), `1436:843123` (comparación), `1436:843665` (historial),
`1438:721` (vacío), `1438:1130` (búsqueda) y `1438:1553` (error), y sus
anotaciones `1436:1043`, `1436:843664`, `1436:844178` y `1438:1907`.

### Base de datos aplicada por MCP

| Versión | Migración | MD5 del SQL aplicado |
| --- | --- | --- |
| 20260930210840 | `crm_fusion_transaccional` | `7d8ddda6c6239d225df73efc067b0161` |
| 20260930211556 | `crm_busqueda_duplicados` | `cc78c97d4b07b8cb32e222c20075d940` |
| 20260930213351 | `crm_fusion_snapshot_relaciones` | `7e18f575bdf67be889019ba0fd76d3cf` |

Cada migración tiene el SQL exacto y su rollback. Los rollbacks conservan las
tablas y la auditoría; no revierten automáticamente fusiones ejecutadas. La
tercera reversión restaura exactamente la función de la primera migración.

- `customer_merges`: ambos contactos antes/después, snapshots de relaciones,
  autor, fecha y restauración. Permiso `crm.customers.merge` y RLS; sin
  escrituras directas de `authenticated` ni ejecución de `anon`.
- `crm_merge_customers`: un par por transacción, bloqueo ordenado de contactos
  y facturas, elecciones limitadas a columnas editables. Conserva metadata,
  usa `status='merged'`, libera correo/documento transferidos sin violar las
  restricciones únicas y guarda su original en el snapshot.
- Relaciones trasladadas: conversaciones, oportunidades, llamadas,
  identidades reales, actividades de cliente, contactos de campañas de la
  organización y facturas exclusivamente en borrador. Una restricción única
  bloquea y revierte la fusión completa; no se elimina silenciosamente una
  inscripción para resolver conflictos.
- Facturas con estado distinto de borrador, XML fiscal o estado de factura
  electrónica bloquean la operación. Los importes no se modifican.
- `crm_unmerge_customer`: solo administrador, ventana de 30 días, restaura
  únicamente relaciones registradas. Falla sin cambios parciales ante filas
  desaparecidas, reasignadas o facturas emitidas después de fusionar. Las
  relaciones creadas después permanecen en el principal.
- `crm_find_duplicates`: candidatos completos en PostgreSQL, con conteos
  agregados por organización; la comparación definitiva de teléfono usa
  `phoneNormalize.ts` y los ajustes existentes de WhatsApp. No se confirma
  una coincidencia por un sufijo o un nombre.
- `customer_merge_exclusions` y `crm_exclude_customer_pair`: pares ordenados,
  exclusión idempotente, validación de ambos clientes contra la sesión.
- `customer_duplicate_scans` y `crm_start_duplicate_scan`: búsqueda persistida
  y trabajo de la cola existente en una sola transacción; solicitudes
  concurrentes reutilizan el trabajo activo. Operación de mantenimiento
  `crm_duplicate_scan`, separada del mantenimiento global.

### Verificación de esta base

Pruebas reales por `execute_sql` dentro de `BEGIN … ROLLBACK`: fusión y
restauración de llamadas; transferencia y devolución de correo único;
retención de una llamada creada después; conflicto de relación y rollback
completo; clientes inexistentes y membresía ajena; exclusión repetida;
encolado idempotente; documento fiscal bloqueando la fusión antes de escribir.
Los SQL temporales de prueba no se versionan (regla 1 de `CLAUDE.md`).

`get_advisors` de seguridad sin hallazgos sobre las tablas nuevas. Rendimiento:
las claves foráneas nuevas tienen índices; únicamente avisos de índices recién
creados sin uso registrado ([regla 0005](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)).

### Estado de integración

Las rutas, los contratos y la pantalla se implementan en el siguiente commit.
No se declara cerrado el checklist punta a punta hasta verificar navegador.
El worker debe desplegarse junto con el productor de búsquedas; no se debe
habilitar el productor con una versión anterior del handler de mantenimiento.

## Ola 6 — estado: Identidades, servidor y pantalla (2026-09-30)

- Frames revisados: listado `1436:19`, comparación `1436:843123`, historial
  `1436:843665`, vacío `1438:721`, búsqueda `1438:1130`, error `1438:1553`.
  Código: `components/crm/identidades`, rutas `api/crm/customer-duplicates`,
  `customer-merges` y `customer-identities`; servicios `customerMergeService`,
  `customerDuplicatesLogica`, `customerDuplicateScanService`.
- Todas las mutaciones van por la sesión y permisos `crm.customers.*`.
  La comparación permite escoger principal y campos editables; no envía
  columnas generadas. La lista de canales usa filas reales de
  `customer_channel_identities`, sin ids virtuales ni escrituras del navegador.
- Historial paginado de los últimos 90 días, relaciones movidas y autor;
  deshacer disponible únicamente para administrador dentro de 30 días.
  Exclusiones persistentes por par; candidatos completos antes de paginar,
  sin omitir otros pares de un grupo al excluir uno.
- Kit compartido, estados vacío/cargando/error/sin permiso y textos es/en/fr/pt.
  Fechas con el contexto de la organización. Acciones accesibles también
  en móvil; cambio de organización remonta el contenido y cancela lecturas.
- Refinamiento compatible del worker: migración
  `20260930215527_crm_busqueda_worker_compatible`, MD5
  `15e1bf559c69e632ebd6ab1b444af102`, aplicada por MCP con rollback versionado.
  Reemplaza el encolado `maintenance` descrito en el estado anterior por
  `noop` + `operation=crm_duplicate_scan`; una versión anterior devuelve el
  payload y no ejecuta mantenimiento global. El productor y el handler nuevo
  deben desplegarse juntos para completar la búsqueda. Si un worker anterior
  finaliza el job sin procesarla, la API devuelve estado fallido y permite
  reintentar; no queda un sondeo indefinido. El mantenimiento global conserva
  su comportamiento original. El worker valida organización y job de la búsqueda.

### Pruebas y revisión

- Contratos de rutas: sesión, permiso denegado, organización ajena en body/query,
  ids ajenos, SQLSTATE a HTTP y ningún falso éxito. Lógica pura: teléfono
  internacional/nacional con normalizador canónico, sufijo parecido que no
  coincide, exclusión por par y conteo global antes de paginar.
- Render con proveedor real de next-intl en los cuatro idiomas: estados,
  selección de principal/campo, historial/deshacer y canales sin permiso.
- Navegador con sesión y dos contactos ficticios: comparación, selección del
  correo secundario, fusión 201, comprobación de archivo y correo único,
  historial/deshacer 200 y restauración comprobada en PostgreSQL; exclusión
  200 y resultado vacío; edición y borrado de una identidad de prueba 200.
- Búsqueda 202, handler real local limitado al job propio de prueba,
  finalización y lectura 200 con estado `done`. Ningún drenaje global de cola.
  Contactos, identidad, exclusión, auditoría y job de prueba retirados por id.
- Escritorio 1440×960 y móvil 390×844 revisados sin desbordamiento de página.
  La cuenta de prueba tiene el módulo CRM inactivo: se usó la alternativa
  local indicada por la skill E2E (retirar cookies de preferencia de módulo);
  no se cambió licencia ni membresía. Las API siguieron verificando sesión.
- Lint de archivos tocados limpio. Contratos/render enfocados: 53 pruebas
  pasan. El conjunto completo ejecutó 917 suites: 915 pasan, una omitida y
  una falla de temporización en POS (`tester-f2b-r1`); las dos suites POS
  que fallaron intermitentemente entre ejecuciones pasan aisladas (49 pruebas).
  Este fallo ajeno no se registra como una de las ocho fallas del baseline
  antiguo: la base actual es `main`, que ya las corrigió.
- Corrección del informe anterior de advisors: la comprobación actual sí
  muestra aviso 0029 para las RPC `security definer` ejecutables por usuarios
  autenticados. Es acceso intencional: validan membresía/permisos dentro de
  la función, fijan `search_path` y rechazan `anon`; no se revoca el acceso
  necesario para la pantalla. Rendimiento: índices nuevos aún sin uso.
  Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

### Diferencias y pendientes de este módulo

No se implementó exportación del historial. Se exige que los clientes sean del
mismo tipo y se bloquean fusiones encadenadas mientras exista una reversión
pendiente, para evitar restauraciones ambiguas; estas restricciones son más
estrictas que la anotación del frame. Se conservan como pendientes explícitos,
no se declara cerrado el alcance completo de las olas 4/5/6.

### Ola 6 — estado: Llamadas, integridad y listado (2026-09-30)

- Figma: `1351:18` y anotación `1351:1311`; detalle `1363:1263` conserva el reproductor, transcripción y aplicación humana existentes. No hay una segunda implementación de telefonía.
- Esquema comprobado por MCP: `calls`, `call_recordings`, `call_transcripts`, `call_analyses`, `call_consents`, `customers`, `opportunities`, `profiles`, `comm_settings`. Se usa el estado real `pending` de transcripciones; el `queued` de la anotación describe la cola, no el CHECK de la tabla.
- Migraciones aplicadas y reversión incluida: `20260930220920_crm_llamadas_busqueda_y_cifras.sql` (md5 `10dc2708459590677d88967828ff478f`) y `20260930222707_crm_llamadas_indicadores_contestadas.sql` (md5 `cc16db421a29dd8b16f5cc8fc8d96994`). RPC `crm_calls_list`, permiso `crm.calls.view_all`, índice GIN de transcripciones e índice por organización/vendedor/fecha. Función con pertenencia/permisos propios, search_path fijo y sin ejecución anon.
- `GET /api/crm/calls`: vendedor forzado a su sesión, solicitud de otro vendedor sin permiso → 403; organización ajena → 403. La RPC aplica filtros antes del conteo, indicadores y paginación. Búsqueda por número, cliente y palabras dichas; grabación realmente lista, no solo una bandera. Los fallos SQL llegan como error, nunca como vacío correcto.
- `POST` valida pertenencia de cliente/oportunidad y registra usuario/organización de sesión. Los días de filtro usan medianoche de la organización y límite superior exclusivo, también con DST.
- UI única: `CallsTable`, `CallsFilters`, `CallRow`, `CallRowDetail`, página de Llamadas. Kit, tokens, 4 idiomas, Skeleton/EmptyState, paginación de 25 y exportación de todas las páginas con protección de fórmulas CSV. Un evento abre el SoftphoneDock existente. Enter en controles hijos no expande la fila; una grabación existente puede reproducirse aunque su bandera actual esté apagada.
- Prueba SQL real, `BEGIN…ROLLBACK`: 205 llamadas, total/medio/perdidas independientes del LIMIT, una grabación lista con bandera apagada, consentimiento no acreditado, búsqueda de transcripción, vendedor ajeno y organización ajena rechazados, administrador ve 206. Se aumentó la duración de una no contestada a 99999 para comprobar que no contamina el promedio. No quedaron filas de esas pruebas.
- Verificación: 7 suites / 269 tests pasan (rutas, lógica/DST, render en 4 idiomas, telefonía previa y guardarraíles); tsc 0 errores con 8 GB; lint de archivos de producción tocados sin errores. El límite de componentes se cumple (CallsTable 294 líneas).
- Punta a punta: sesión real de prueba en org 120, POST manual → 201 → GET filtrado → 200/1 fila, media 65 segundos, saldo real 30; apareció en la tabla. Revisión a 1440 y 390, sin overflow de raíz. Fixture manual eliminado por id, organización y marca, verificación restante 0. Capturas locales contienen datos reales del shell: no se publican. Se usó la alternativa local de sesión de la skill; no se activó el módulo CRM de ese plan.
- Advisors: aviso 0029 de SECURITY DEFINER autenticada intencional (controles dentro de RPC); índice GIN nuevo aún sin uso registrado. No se agregó acceso anon ni nuevas tablas sin RLS.
- Diferencias/pendientes: minutos de **conversación**, no minutos facturados inventados; saldo del plan real. El detalle de análisis/transcripción y el dock conservan su comportamiento anterior, pero su adaptación completa de textos y estados al kit sigue pendiente en la fase visual de Telefonía. Las políticas previas de lectura directa de llamadas no se alteraron en estas migraciones; el alcance del listado se controla tanto en ruta como en RPC. Exportación concurrente usa páginas y puede reflejar cambios ocurridos durante la descarga.

### Ola 6 — estado: Pronósticos, categorías y auditoría (2026-09-30)

- Figma `1431:19`, `1434:648`, `1434:1185`, estados `1434:842149`, `1434:842588`, móvil `1434:843089`. Anotaciones `1431:18`, `1431:1048`, `1434:1184`, `1434:1399` verificadas. El dueño confirmó **stages.probability**: el nombre pipeline_stages de la anotación no existe; no se crea una tabla paralela ni se cambia Figma.
- Esquema verificado por MCP: opportunities, stages (organización a través de pipelines), pipelines, sales_targets, sales_team_members, sales_teams, organization_members, profiles, exchange_rates, organizations, currencies y crm_events. Probabilidad entera porcentual, objetivos mensuales/trimestrales reales y zona de la organización.
- Migración `20260930225439_crm_pronostico_categorias_y_ajustes.sql`, MD5 `5ecdd01ece1488008143905fb9a9f879`, aplicada por MCP con rollback: forecast_category nullable, forecast_adjustments con RLS, permisos crm.forecast.view_all/adjust, RPC de snapshot, cambio de categoría con concurrencia y auditoría, escritura de ajuste solo desde servicio con actor explícito y verificación independiente de permiso/token. No se cambian importes de oportunidades.
- Migración `20260930233500_crm_pronostico_acceso_e_indices.sql`, MD5 `8a6f41c9f635e5b5a23c4467ee7f5d24`, aplicada con rollback: índices de las FK de ajustes; se revoca SELECT de anon/authenticated sobre la vista materializada antigua mv_crm_forecast, que exponía datos sin aislamiento. Comprobación real: anon false, authenticated false, service_role true. Su rollback documenta que restituir la ACL previa vuelve a exponer esos datos; no se ejecutó.
- Prueba SQL real BEGIN/ROLLBACK: 205 oportunidades completas del vendedor; otro vendedor/otra organización denegados; categoría conserva importe y deja un crm_event con actor; edición desactualizada rechazada; escritura directa de ajuste denegada a autenticados; ajuste del supervisor con autor comprobado; conflicto de snapshot y reversión que añade una segunda fila. Fixtures retirados al revertir la transacción.
- Advisors: las dos funciones SECURITY DEFINER autenticadas tienen aviso 0029 intencional: controles dentro de función, search_path fijo y sin anon. La vista antigua ya no tiene lectura pública. Sus funciones históricas de refresco aún tienen avisos de search_path y se revisarán junto con la limpieza de código/trigger de ola 5; índices nuevos inicialmente sin uso. No se declara cerrado ese pendiente.

### Ola 6 — estado: Pronósticos conectado a servidor y pantalla (2026-09-30)

- Misma ruta `/app/crm/pronostico`, `RevenueOsPage`: Pronóstico como entrada principal; los cuatro análisis previos de Revenue OS siguen disponibles en la vista Análisis comercial, sin consultar sus KPI mientras está el pronóstico.
- `GET /api/crm/forecast`, `POST /api/crm/forecast/adjustments`, `PATCH /api/crm/opportunities/[id]/forecast-category`: organización de sesión, permisos por código, errores SQL traducidos y concurrencia. El servidor calcula antes/moneda/actor; el navegador no puede suplantarlos. Seleccionar vendedor conserva todos los vendedores disponibles; las cifras incluyen todo el periodo y solo las oportunidades se paginan (25).
- `forecastLogica` reutiliza `sumarEnMonedaBase` y `probabilityToFraction`: tasa vigente o inversa, ninguna tasa inventada; sin tasa → subtotal y aviso, cobertura desconocida y ajuste bloqueado. Cuota trimestral prevalece sobre mensuales, después cuota del equipo; no se prorratean metas anuales. Omitida no entra al pronóstico. Compromiso/mejor caso incorporan las diferencias auditadas; ponderado permanece calculado a partir de oportunidades.
- Kit/tokens en filtros, indicadores, tabla/tarjetas, ajustes e historial, es/en/fr/pt, Skeleton/error/forbidden/sin cuotas, foco/labels y fecha de organización. Componentes ≤300 líneas. CSV usa la utilidad compartida, también en Llamadas, y neutraliza fórmulas precedidas por espacios.
- 7 suites / 274 pruebas pasan: SQL no se oculta (ver pruebas reales anteriores), contratos API, cifras mixtas, 205 oportunidades, categorías, concurrencia/reversión, render en cuatro idiomas, CSV y guardarraíles. TypeScript 0 errores con 8 GB; lint tocado limpio. Revisión de layout a 1440 y 390 sin overflow de raíz. Capturas privadas se conservan solo localmente; no se publican datos del shell.
- API con sesión real de org 120: trimestre vacío 2050-Q1 → ajuste 201 → lectura con total 123 → escritura vieja 409 → reversión 201 → dos auditorías y total 0; organización ajena 403. Ambos registros ficticios eliminados por ids/organización/periodo/marca vía MCP; quedan 0. El navegador real consultó el pronóstico; la cuenta mantiene su plan sin activar CRM (alternativa de sesión local ya documentada).
- Diferencias/pendientes: ajustes se acumulan por diferencia para no perder el historial cuando cambian oportunidades; revertir se limita al último ajuste del vendedor. Las cuotas de equipo se consideran la configuración vigente del trimestre (no tienen periodo en esa tabla). No se inventan objetivos mensuales a partir de cuotas trimestrales; la pantalla presenta el trimestre. Se conserva la vista anterior de análisis con sus estilos/textos históricos. Prueba de ajuste/reversión real por API y render del diálogo; no se afirma haber editado oportunidades reales de clientes ni haber probado estos botones en dispositivos físicos. Filtros del historial: trimestre/equipo/vendedor del panel. Continúa el resto del alcance autorizado.


### Ola 6 — estado: Campañas, lectura unificada e integridad (2026-10-01)

- Caracterización: listado `1395:17`, voz activa `1404:17` y anotaciones `1395:1064`, `1404:1009`, `1404:831543`; wizard `1395:1065` caracterizado para el siguiente paso. Esquema verificado por MCP: `campaigns`, `voice_agent_campaigns`, `voice_agent_calls`, `calls`, `activities`, agentes, audiencias y configuración.
- Migraciones aplicadas con rollback aditivo: `20260930235900_crm_campanas_unificadas.sql` MD5 `673fca19e9db7385f7ee82559af5c875`; `20261001002200_crm_campanas_parada_con_permiso.sql` MD5 `d338b002b78b0a907007cb4be8badf1e`; `20261001003200_crm_campana_voz_detalle_y_contactos.sql` MD5 `4a311f58f05e799d6edeb5effef3e3b7`. Ninguna tabla ficticia ni cambio destructivo.
- `crm_campaigns_unificadas`: una respuesta JSON completa evita el truncamiento de PostgREST; proyección de estados reutiliza el motor de mensajes, validación RNE y política existentes. Filtros antes del total/paginación. Lectura exige `crm.opportunities.view`; gestión usa el nuevo código `crm.campaigns.manage`, además del criterio canónico de administrador.
- Parada canónica `fn_stop_voice_campaign`: motivo obligatorio, fecha, estado pausado y bandera de emergencia en una sola escritura. `POST /api/crm/voice-agents/campaigns/[id]/stop` sustituye el PATCH sin motivo; el panel anterior queda conectado a la confirmación. El despachador conserva su protección y aplica el umbral aprobado en Figma de 10 fallos consecutivos (antes 5), probado a ambos lados del límite con fallo real del doble del proveedor.
- `crm_voice_campaign_detail`: conteos completos y llamadas paginadas. Los intentos se recuperan desde `calls.metadata.campaign_id`, con fallback de vínculo antiguo, para conservar reintentos. Contacto efectivo comparte `fn_es_contacto_voz_efectivo` con `fn_contactos_efectivos_semana`; no cuenta buzones/fax/no contestadas. Reuniones desde actividades reales, deduplicadas por evento. Minutos de conversación separados del saldo del plan; no se presentan como facturación.
- Servidor: organización de sesión, rechazo de organización ajena, permiso resuelto en servidor y RPC, error interno sin texto SQL. Cambiar solo target_config no salta la validación de segmento/etapa/clientes; concurrencia no supera el canal. Pausar sigue permitido cuando bajó el límite del canal. Materializar audiencia también exige gestión.
- Pruebas SQL BEGIN/ROLLBACK: 207 campañas completas; 206 objetivos/intentos, reintentos conservados, 2 contactos efectivos, reunión duplicada contada una sola vez, página 9 con 6 llamadas; no miembro y miembro sin gestión rechazados. Sin fixtures persistentes. Advisors security/performance: tres avisos 0029 intencionales para funciones autenticadas, con permiso interno, search_path fijo y anon revocado; ningún hallazgo de performance nuevo filtrado a estas funciones.
- Continúa la adaptación del asistente de creación y de plantillas. Los endpoints heredados de RNE/diagnóstico conservan su autorización administrativa; no se amplía acceso a secretos ni se ejecuta la cola durante pruebas.


### Ola 6 — estado: Campañas, listado y detalle de voz con kit (2026-10-01)

- `/app/crm/campanas`: voz, WhatsApp y correo con estados canónicos, búsqueda, paginación 25, actualización cada 15 s, Skeleton/vacío/sin resultados/error/sin permiso. Claves de fila incluyen origen para evitar colisiones entre tablas. Acciones según permiso del servidor; pausa/cancelación/parada confirmadas; RNE reutiliza su panel y enlace real de configuración.
- `/app/crm/campanas/[id]?tipo=voz`: agente, motivo/fecha de parada, intentos/contactos/reuniones/minutos, llamadas activas, cola, resultados por estado, historial paginado y enlace a detalle de llamada. El diagnóstico conserva su flujo canónico. Pantallas con tokens, es/en/fr/pt, zona de organización y componentes ≤300 líneas. El panel anterior usa motivo obligatorio y el permiso devuelto por el servidor.
- 7 suites / 360 pruebas pasan, 7 casos históricos omitidos ya existentes: contratos, proyección, umbral de parada, render 20 casos con proveedor real de idioma, compatibilidad de cuerpos y guardarraíles. TypeScript 0 errores; lint en archivos tocados limpio. Corregido también el uso del timezone de sucursal en fechas de historial/canales de Identidades.
- API real en org 120 con fixture ficticio: crear 201 → detalle 200 con 0 intentos → detener 200 → motivo/fecha/flag persistidos → organización ajena 403 → eliminar 200. Agente ficticio eliminado por MCP; quedan 0 campañas y 0 agentes de prueba. No llamadas ni mensajes enviados.
- Revisión real a 1440 y 390: detalle visible, 0 alertas y sin overflow horizontal de raíz. Capturas privadas fuera del repositorio. Se conserva el plan/membresía de la cuenta; alternativa de sesión local documentada anteriormente.
- Diferencias/pendientes: los indicadores cuentan intentos físicos y contactos efectivos por intento (no personas únicas); reuniones son eventos reales deduplicados. Historial incluye 25 por página; llamadas activas hasta 100 visibles, con total global. No se inventan duración estimada de campaña ni coste exacto antes del proveedor. El asistente de creación, plantillas, adaptación completa de IA y demás olas continúan abiertos. Este avance no declara terminadas las 135 pantallas.


### Ola 6 — corrección previa al asistente: audiencia de voz (2026-10-01)

- `buildCampaignTargets` trataba el id de `segments` como `campaign_contacts.campaign_id`; una campaña por segmento quedaba vacía o leía filas incorrectas. Ahora llama a `resolveAudience`, el mismo resolutor de mensajes, con la organización ya validada. No se crea un segundo evaluador de audiencia.
- Regresión probada con clientes coincidentes/no coincidentes y señuelos de otra organización, más un contacto falso con campaign_id igual al segmento: solo sale el cliente que cumple los criterios de su propia organización. Segmento ajeno → 404. Errores de consulta de segmento se propagan; errores internos de WhatsApp no devuelven texto SQL.
- 3 suites / 109 pruebas pasan (7 omisiones históricas), lint tocado limpio. El siguiente paso añade la persistencia de segmentos estáticos y el preview con DSL canónico, requeridos por las anotaciones `1384:1741` y `1384:826348`; el resolver actual conserva temporalmente los filtros planos heredados. No se afirma cerrada esa adaptación.

### Ola 4/5/6 — verificación del avance y PR (2026-10-01)

- PR borrador [#280](https://github.com/Palomo-dev/go-admin-erp/pull/280), base `main`, rama `feat/crm-flujo-completo`. Se integró `main` hasta `8ebd05a3`; el conflicto de `PROGRESS.md` conserva ambos apéndices. No se fusiona ni despliega `master`.
- Batería completa después de integrar: 934 suites / 16.926 pruebas pasan, 8 omisiones preexistentes. TypeScript 0 errores; lint de los archivos TypeScript modificados sin errores ni avisos; guardarraíles verdes.
- Compilación de producción completa con `NEXT_SKIP_TYPECHECK=1`, la configuración existente del CI. La comprobación separada `tsc --noEmit` sí se ejecutó y pasó; no se ocultan errores de tipos. La primera compilación fue interrumpida después de su comprobación de tipos por consumo de memoria y no cuenta como build completado.
- Pruebas de fecha/guardarraíles en las seis zonas configuradas: 26 suites / 804 pruebas por zona, todas pasan. Las dos pruebas intermitentes de POS ahora esperan los efectos de ambos intervalos y drenan el temporizador que publica el estado. Conservan las comprobaciones de transporte, elección de caja y propina; 49 casos pasan también con `--detectOpenHandles`. La batería general emitió aviso de cierre forzado de un worker; las dos suites modificadas no reportan recursos abiertos en esa comprobación específica.
- Las once migraciones CRM de este avance ya están aplicadas con sus reversiones y MD5 documentados. Continúa el resto del alcance autorizado: este PR sigue como borrador y no acredita las 135 pantallas completas.

### 2026-10-01 — segmentos: snapshots estáticos y lectura sin truncamiento

- Migración `20261001010300_crm_segmentos_estaticos_y_contexto.sql`, aplicada por MCP; MD5 `1b5348d63ab91613fe89c5afa177debb`. Reversión de acceso en `supabase/rollbacks/` en el mismo commit: conserva miembros y auditoría.
- Nueva tabla `segment_members` con RLS, pertenencia y guard de organización; `crm.segments.manage` se resuelve por código/rol/cargo. Guardado privado transaccional: filtros, miembros, conteo, auditoría y token de concurrencia. No materializa segmentos históricos al migrar.
- Prueba BEGIN/ROLLBACK en dos organizaciones ficticias: 1.206 miembros, varias páginas, rechazo de miembros ajenos, empleado sin permiso, conflicto de edición, snapshot estable ante altas, alias de fusión reversible, compras sin ventas anuladas/futuras, categorías propias, RNE y ACL. No quedaron fixtures. Primer intento detectó lectura estática lenta; materializar los ids una vez corrigió el coste y la prueba completa pasó en 21,3 s.
- Advisors: dos avisos 0029 intencionales para RPC de lectura autenticada con permiso y organización comprobados dentro de SQL; ninguna ejecución anónima ni escritura de miembros autenticada. Tres índices nuevos todavía sin uso (INFO). No aparece aviso de search_path ni FK sin índice en los objetos nuevos.
- La API y las pantallas de segmentos aún no están conectadas; siguiente paso: DSL canónico compartido con automatizaciones y campañas. No se declara terminada la fase.

### 2026-10-01 — segmentos: copiar, borrar y referencias atómicas

- Migración `20261001015500_crm_segmentos_operaciones_atomicas.sql`, aplicada por MCP; MD5 `48840ca1143b1ea808aa6d842d59492b`. Rollback de acceso en el mismo commit, sin borrar snapshots ni auditoría.
- Copiar conserva los IDs originales del snapshot (incluidas fusiones reversibles); borrar comprueba versión y campañas de mensaje/voz antes de borrar miembros por cascada. Ambos registran actor/evento en la transacción.
- Guards de campañas toman KEY SHARE sobre segmentos propios, incluyendo referencias en JSON: evitan crear una audiencia ajena o una referencia concurrente al borrado. No había referencias colgantes en las columnas verificadas antes de aplicar.
- ACL: mutaciones directas de `segments` revocadas para authenticated/anon. Las pantallas anteriores no pueden escribir hasta desplegar las nuevas API; no se desplegó ni se fusionó este PR. Service role solo se usa tras validar actor, org y permiso.
- Prueba BEGIN/ROLLBACK pasó con 1.206 miembros y comprobó copia sin pérdidas, versión vieja, borrado y cascada, bloqueo de segmento usado, rechazo de referencia ajena y ACL cerrada. Error inicial del test: el timestamp de creación de una copia podía coincidir con el de otra fila en la transacción; el test corregido usa una versión realmente anterior de la misma fila. Cero fixtures persistentes.
- Advisors: sin avisos de seguridad para funciones nuevas. Se mantienen avisos previos en `segments` (FK created_by sin índice y policies con auth.uid por fila); se revisarán en la limpieza, sin editar migraciones aplicadas.

### 2026-10-01 — segmentos: conflictos sin reintentos transitorios

- Migración `20261001023100_crm_segmentos_conflictos_de_negocio.sql`, aplicada por MCP; MD5 `200b9ee05c1567a157f35ff10259885c`. Rollback restaura las tres funciones anteriores sin cambiar ACL ni datos.
- Versión vieja, segmento usado y snapshot ausente son conflictos de negocio: ahora usan P0001 (la API lo convierte a 409), conservando locks y comprobaciones SQL. 40001 llegaba como 500 de PostgREST y el intermediario reintentaba: la prueba HTTP agotaba 45 s. Después del cambio, la misma edición vieja respondió 409 en 621 ms y el borrado bloqueado en 533 ms.
- BEGIN/ROLLBACK pasó la prueba de 1.206 miembros con comprobación del mensaje concreto del conflicto (no captura genéricamente un fallo del propio test). Advisors security/performance: sin avisos para estas tres funciones.
- Flujo real adicional de API: snapshot de dos miembros estable tras alta de un tercero; edición, versión vieja→409, org ajena→403, miembro ajeno→400, actualización explícita→tres miembros y copia aún con dos. Crear una campaña borrador bloqueó eliminar su segmento; al quitar la dependencia, borrar→200 y leer→404. Ningún envío ni llamada iniciado. La copia y los clientes ficticios se están retirando al terminar la prueba de UI.

### Ola 6 — segmentos: servidor y DSL compartido (2026-10-01)

- API nuevas `segments`, `[id]`, `[id]/members`, `[id]/duplicate` y `preview`: org de sesión, permiso `crm.segments.manage` en servidor, escritura privada transaccional y versión esperada. Preview devuelve solo conteos y tres muestras; miembros paginados, sin truncar en 1.000 filas. Importación CSV de hasta 5.000 UUID propios, sin fórmulas ni duplicados.
- `conditionsDsl` es el único evaluador de segmentos, automatizaciones, secuencias y campañas de voz/mensajes. El formato antiguo se adapta estrictamente: un campo desconocido se rechaza. Las compras/categorías virtuales usan el contexto SQL común, excluyendo ventas anuladas, futuras o ajenas.
- Contratos reales de rutas cubren organización ajena 403, registro ajeno 404, sin permiso 403, versión vieja 409 y rechazo de cifras inventadas. Las tres migraciones de segmentos y sus pruebas SQL están documentadas arriba; no se sustituyeron por mocks.
- Flujo HTTP real y consultas MCP: alta CSV estática con dos miembros, alta posterior de tercero sin alterar snapshot, edición, copia estable, actualización explícita a tres, bloqueo del borrado por campaña y borrado tras quitar la dependencia. La creación y eliminación también se probaron desde la pantalla. No se enviaron mensajes ni llamadas. Verificado: cero segmentos, miembros, campañas, clientes y eventos ficticios restantes.
- Pendientes concretos: recálculo periódico/background de dinámicos, indicadores de canal y referencias en el listado, y prellenado efectivo del asistente de campañas/secuencias. Las lecturas de miembros y preview ya dan los conteos actuales; el listado identifica su conteo como último guardado. No se declara terminado todo el módulo ni las 135 pantallas.

### Ola 6 — segmentos: pantallas y verificación (2026-10-01)

- Figma ↔ código: lista `1384:17` → `SegmentosPage`; miembros `1384:1045` → `SegmentoDetallePage`/`SegmentoMiembros`; constructor `1384:825677` → `SegmentoEditor`/`ConditionBuilder`; estados `1388:632`, `1079`, `1532`, `1979` → EmptyState, Skeleton y aviso de preview no disponible con reintento.
- UI con kit y es/en/fr/pt: filtros, importar CSV, crear, editar, duplicar y borrar con confirmación; reglas AND/OR anidadas conservadas; preview con debounce 400 ms y cancelación; selección explícita para refrescar snapshot. Fechas del constructor usan CampoFecha/CampoFechaHora y zona de organización, no la zona del navegador. Las cifras distinguen teléfonos presentes de contactables por voz; fecha de entrada estática es la del snapshot, la dinámica no se inventa.
- Lista y detalle reales revisados a 1440/390; ancho de raíz igual a viewport 390, sin overflow de raíz. Capturas privadas fuera del repositorio, sin publicar nombres del shell. Los componentes nuevos tienen menos de 300 líneas. El enlace a campaña/secuencia está presente; prellenado del destino sigue pendiente.
- Verificación después del cambio: 939 suites / 16.981 pruebas pasan (8 omisiones preexistentes), lint de 38 archivos TypeScript sin errores/avisos y build de producción completo con la comprobación de tipos separada. La primera pasada completa encontró una expectativa incorrecta del test de hora (el kit muestra 8:30 p. m., no 20:30); se corrigió y se repitió toda la batería. Persiste el aviso general de worker forzado ya documentado; no se presenta como ausencia de recursos abiertos.

### Ola 6 — integridad de consentimiento entre identidades y campañas (2026-10-01)

- Migración `20261001025300_crm_consentimiento_identidades_y_marketing.sql`, aplicada por MCP, MD5 `5386e8988161fb23f85b6485ee777521`; rollback exacto del predicado anterior, ACL y comentario en el mismo commit. No modifica registros existentes.
- `fn_can_contact` sigue siendo la puerta única para voz, correo y WhatsApp. Las bajas, `do_not_call` y banderas de un cliente archivado se conservan mientras su fusión siga activa; al deshacerla, las preferencias vuelven a cada identidad. No se trasladan ni borran consentimientos para simular una fusión.
- Marketing de WhatsApp requiere `contact_consents.status=opted_in` del principal. Si la fusión sustituye su teléfono, un opt-in anterior para el número original no autoriza el nuevo: requiere renovación posterior. Las bajas de cualquier identidad fusionada vetan el contacto; no se hereda un consentimiento positivo del alias. Utility conserva su comportamiento salvo baja o dato ajeno; canal/propósito desconocido se rechaza.
- Prueba real BEGIN/ROLLBACK: sin opt-in, opt-in explícito, normalización, org ajena, propósito/canal inválido, baja del alias, número sustituido, renovación, DNC/metadatos, deshacer y ACL. Cero fixtures persistentes. Advisors: aviso 0029 intencional por RPC autenticada con pertenencia interna (ya existía); ninguno de performance ni search_path.
- Efecto al desplegar: campañas de marketing de WhatsApp con consentimiento desconocido quedan excluidas; la reversión vuelve a permitir ese comportamiento anterior y lo advierte explícitamente. Pendiente siguiente: escritura atómica de consentimiento y materialización/activación de campañas.

### Ola 6 — segmentos: cola de recuento y referencias (2026-10-01)

- Migración `20261001030800_crm_segmentos_recuento_en_cola.sql`, aplicada por MCP; MD5 `b522092310d8cf142542b218ff63f9bb`. Rollback en el mismo commit: restaura guardado/copia y cierra las RPC nuevas; conserva columnas, jobs, auditoría y protección de referencias de secuencias.
- Guardar un dinámico acepta conteo pendiente y encola atómicamente una operación local `noop`; no inventa una audiencia ni exige recorrer toda la base durante el guardado. Recuento por páginas de 1.000, cursor y fecha de evaluación persistentes. Cada continuación comprueba organización, job y versión antes de confirmar conteos y siguiente job en la misma transacción. La última página publica las cifras; cambios derivados no invalidan el formulario.
- `crm_enqueue_due_segment_recounts` selecciona segmentos de organizaciones con CRM activo, con locks SKIP LOCKED y lotes de 50. Sin backfill ni jobs creados por la migración. El consumidor viejo trata una operación noop desconocida como eco, sin efectos externos; el productor nuevo recupera esas tareas vencidas al desplegarse. No se usa maintenance, que ejecutaría limpieza global.
- BEGIN/ROLLBACK real pasó: continuación, reintento sin doble suma, fin sin alterar versión, edición concurrente, rechazo de cifras imposibles, productor en organización con módulo ya activo, referencias ajenas, bloqueo por secuencia y ACL. Primer intento de fixture quiso activar CRM sin plan y el trigger lo rechazó; se corrigió la prueba usando una organización ya activa dentro de la transacción, sin cambiar planes ni deshabilitar validaciones. Cero fixtures persistentes.
- Advisors: [0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) intencional solo en la RPC de lectura de usos: exige permiso y pertenencia dentro de SQL, sin acceso anónimo. Índice de job nuevo todavía sin uso (INFO); sin avisos de search_path ni FK sin índice en los objetos nuevos.
- Servidor/UI en verificación: consumidor del runner, productor en cron existente, usos y cifras por canal en cuatro idiomas. 64 pruebas focalizadas pasan y lint tocado limpio; TypeScript y flujo real se verificarán antes de cerrar este paso. Siguen pendientes prellenado del asistente y las demás pantallas del alcance.

### Ola 6 — segmentos: consumidor, listado y verificación completa (2026-10-01)

- `noopHandler` ejecuta el recuento por la misma página/evaluador que preview y materialización; conserva fecha de evaluación y cifras acumuladas. Reintentos/versiones abandonadas no leen ni suman otra vez. Abortos mantienen el cursor; fallo terminal marca error y conserva el último conteo válido. Guardar un dinámico no recorre clientes: la RPC encola atómicamente.
- `segment_counts` se integra en el cron existente de cinco minutos como tarea programada, sin alterar el CHECK de kinds. Selección SQL por vencimiento de 15 minutos y CRM activo; lotes con presupuesto/AbortSignal. No promete exactitud temporal a los 15 minutos: cada página espera el drenaje de la cola (actualmente cada dos minutos).
- Lista: cifras contactables de voz/correo/WhatsApp con fecha del conteo, pendiente/error diferenciados, usos en campañas y secuencias y actualización cada 15 segundos mientras haya recuento. Cuatro idiomas; no convierte un fallo en cero. Guardar un cambio de nombre conserva la caché hasta recalcular; un cambio de filtro la invalida.
- API + runner reales: creación dinámica 201 con last_run_at nulo y job propio, drenaje noop de una sola tarea (cola previamente vacía), final con cero coincidencias y base exacta de 10.125 clientes, versión del formulario estable, renombrado conservando cifras y nuevo job, listado con usos propios. MCP confirmó los datos; fixtures/jobs/eventos retirados, todos cero. No se drenaron otros kinds ni se enviaron llamadas/mensajes.
- UI real: lista de fixture en escritorio/móvil 390 px, ancho de raíz 390, sin overlay de error. Capturas privadas fuera del repositorio; la primera captura móvil tomó la transición del sidebar al redimensionar, la posterior quedó estable. No se publican nombres del shell.
- Gates: 940 suites / 16.989 pruebas pasan, 8 omisiones previas, proceso 0; TypeScript 0 con heap 8 GB, lint de archivos tocados limpio, build de producción 0 con gate independiente de tipos. El primer tsc final agotó su heap por defecto; al repetir con el presupuesto de memoria del proyecto pasó. El primer Jest completo encontró un temporizador de test de outbox sin cierre, corregido en commit independiente y repetida la batería. La siguiente tarea sigue siendo consentimiento/campañas/plantillas; prellenado y el alcance restante todavía no están terminados.

### Ola 6 — consentimiento entrante atómico (2026-10-01)

- Migración `20261001034200_crm_consentimiento_atomico_entrante.sql`, aplicada por MCP; MD5 `879c62783a852a724fb86f154159d2b3`. Rollback en el mismo commit desactiva el trigger/cierra RPC y conserva consentimientos, evidencias, auditoría y exclusiones existentes. No cambia el predicado de contacto de la migración 15.
- `crm_set_contact_consent`: cliente propio bloqueado, consentimiento/banderas/exclusión de pendientes de su canal y auditoría en una transacción. Unknown no elimina bajas ni renueva un alta previa. Descartar pendientes no se limita a 200 contactos. Las RPC de escritura son privadas de service role; no se eleva automáticamente un cliente autenticado.
- El trigger de mensajes entrantes certificados por service role aplica la preferencia antes del disparador de IA. Una consulta inicial guarda evidencia unknown, sin convertirla en opt-in de marketing. Palabras de alta/baja se resuelven desde configuración propia del proveedor, normalizando acentos/puntuación; baja tiene prioridad. El marcador del mensaje hace idempotente el postprocesado y conserva la fecha del primer evento.
- BEGIN/ROLLBACK real: saludo→unknown/utility, baja con acentos→240 pendientes excluidos, metadata conservada, repetición sin mover changed_at/auditoría, unknown sin borrar baja, START posterior y mensaje antiguo sin deshacerlo, cliente/mensaje ajenos, ACL, palabras configuradas y configuración inválida con fallback. La primera prueba de palabras configuradas eligió otro proveedor por prioridad; se corrigió el fixture dando prioridad explícita, sin modificar la lógica. Rollback pasó; cero fixtures persistentes y ningún envío.
- Advisors security/performance: ninguno para las cuatro funciones nuevas. Las funciones tienen search_path fijo y no hay ejecución autenticada/anónima de mutaciones.
- Servidor en verificación: usa RPC para guardar/aplicar y propaga errores de lectura/registro. 597 pruebas de WhatsApp, integraciones, webhook y guardarraíles pasan; tipos/lint aún se están verificando. Pendiente de la fase: reserva/reembolso de créditos y materialización/activación atómica de campañas, y uso del predicado canónico en los disparadores de despacho. Este paso no declara resuelta la facturación de bajas ni todo el asistente de campañas.

### 2026-10-01 — consentimiento: servidor conectado y verificado

Registro y postprocesado entrante usan las RPC privadas de la migración 17. Se propagan errores de lectura/escritura; el servidor no concede opt-in por un saludo ni recorre solo los primeros 200 pendientes. Pasan 23 suites / 597 pruebas de WhatsApp, integraciones, webhook y guardarraíles, TypeScript con heap de 8 GB y lint de los archivos tocados. Despacho canónico y contabilidad de campañas siguen en curso.

### 2026-10-01 — despacho y consentimiento compartido

Migración `20261001035400_crm_despacho_consentimiento_canonico.sql` aplicada por MCP, MD5 `09727dff1cf8e153f773e6510d30bf4c`; rollback exacto de los dos triggers anteriores conserva mensajes y preferencias. Puerta privada única para consentimiento/identidades y categoría real de plantilla/campaña. Plantillas requieren aprobación propia, nombre/idioma coherentes y ContentSid propio; rawTemplate sigue funcionando si resuelve una plantilla propia aprobada. El trigger de despacho añade el secreto interno desde Vault, sin valores en el repositorio. IA comprueba consentimiento antes de encolar.

BEGIN/ROLLBACK real pasó fila visible en AFTER INSERT (función VOLATILE), utility sin marketing, marketing con/sin alta, categoría falsificada, plantilla ajena/payload sustituido, compatibilidad raw, campaña de marketing y STOP sin despacho/IA; rollback y cero fixtures. Se reforzaron las aserciones con IS DISTINCT FROM para que NULL no esconda un fallo; el caso de campaña crea unknown explícitamente porque unknown conserva un alta previa. Advisors sin avisos para las funciones tocadas. Pendiente consumidor Edge: autenticación, claim de envío, revalidación tras espera y persistencia atómica del resultado. No se desplegaron Edge Functions.

### 2026-10-01 — reserva exclusiva y resultado de despacho

Migración `20261001040341_crm_despacho_claim_y_resultado.sql` aplicada por MCP, MD5 `56e8d3f7e0409e3f4b7da73daa73ac39`; advisors sin avisos para las funciones nuevas. Dos RPC privadas: claim bloquea mensaje propio, valida canal/cliente y consentimiento; finish conserva metadata reciente, registra evento/resultado en la misma transacción y exige el token del claim. Sin expiración que reenvíe una entrega ambigua: processing/uncertain necesitan conciliación. Deferred identifica ausencia de llamada al proveedor y puede reservarse otra vez. Rollback solo revoca funciones, conserva evidencia. BEGIN/ROLLBACK pasó reserva repetida, org ajena, token falso, entrega sin ID, metadata concurrente, resultado idempotente/conflictivo, uncertain sin reenvío, deferred recuperable y baja. Cero fixtures; consumidor Edge sigue en curso.

### 2026-10-01 — despacho Edge: autenticación, reserva y revalidación

Consumidor con secreto interno antes de leer mensajes, rechazo de organización/conversación discordante y claim exclusivo. Destinatario de identidad/cliente propios, sin sustitución por metadata.to; consultas con tenant. Resultado/evento en RPC atómica con token. Desconexión, 5xx o 2xx sin ID quedan uncertain; ausencia de Evolution queda deferred sin enviar. IA verifica consentimiento/ventana al inicio, tras debounce y antes de insertar respuesta; fallo de reserva impide generar. Normalización telefónica y ventana de Meta son módulos puros compartidos, sin duplicar reglas.

Las dos Edge Functions pasan Deno 2.9.6 check, usando un import map local a los mismos paquetes npm (Supabase 2/OpenAI 4) y las declaraciones nativas Deno; las URL de producción permanecen. Lint limpio, sin deshabilitar reglas; se tiparon estructuras anteriores. Pruebas ejecutan los handlers con proveedor simulado: secreto, tenant, claim duplicado, baja tardía, destino propio, persistencia fallida y entregas ambiguas. SQL real probado por MCP en migraciones 18/19; ninguna Edge desplegada ni mensaje real enviado.

Verificación del avance: 942 suites / 17.018 pruebas, ocho omisiones existentes y proceso 0; TypeScript 0 errores, lint tocado y build de producción completos. Focalizadas: 15 suites / 395 pruebas. Las 19 migraciones conservan archivo exacto y rollback. Sigue pendiente contabilidad/materialización/activación de campañas y el resto del alcance completo del CRM; PR #280 permanece en borrador.

### 2026-10-01 — campañas: materialización transaccional y cifras completas

Migración `20261001042330_crm_campanas_materializacion_atomica.sql` aplicada por MCP, MD5 `b7e4acbb9614fd9ec44993d2ca6ca033`, rollback de acceso en el mismo commit. RPC privada publica contactos, exclusiones, cifras y auditoría en una transacción, con versión de campaña, IDs propios/únicos y consentimiento revalidado. Conserva historial enviado. Solo borradores sin reserva: una campaña programada debe detenerse antes de cambiar audiencia. Recuento SQL sin los topes de 20.000 lecturas de Node. Estimado recibido sigue siendo aproximado; precio definitivo depende del proveedor.

BEGIN/ROLLBACK pasó 1.206 miembros, baja entre clasificación/publicación, historial leído/costo conservados, repetición sin duplicar, ID ajeno sin modificar filas previas, versión vieja, duplicados, campaña programada y ACL. Primer ensayo encontró precedencia de operadores JSON; se corrigió antes de aplicar. Cero fixtures; advisors sin avisos para ambas funciones. Servidor aún sin conectar; siguiente paso: reservas y lanzamiento/cancelación atómicos, para impedir la doble deducción.

### 2026-10-01 — reservas de créditos de WhatsApp

Migración `20261001043347_crm_reservas_creditos_whatsapp.sql` aplicada por MCP, MD5 `40955f9c7a66adfbf38632a79697ca27`. Tabla interna con RLS, lectura por pertenencia preparada pero sin GRANT de navegador, índices de FK y RPC privadas. Reserva descuenta por la función canónica deduct_comm_credits; consumo confirma la misma unidad sin segundo débito; devolución se registra una sola vez. Lock de monedero por organización para las operaciones compuestas. Rollback revoca el acceso y conserva evidencia/saldos.

Una entrega vinculada requiere evidencia privada dispatch_confirmed/safe_to_refund del consumidor/cancelación: metadata y eventos editables del mensaje no autorizan un abono. Incluso si desaparece el mensaje, message_attached conserva la necesidad de conciliación. Las próximas RPC de vínculo/despacho deberán restablecer safe_to_refund en cada intento y respetar el mensaje actual de la reserva.

BEGIN/ROLLBACK pasó saldo finito/cero/ilimitado, reserva y devolución repetidas, consumo sin segundo descuento, clave reasignada, contacto/reserva de otra organización, prueba de metadata falsificada, ACL/RLS y auditoría sin duplicar. Cero fixtures y cero reservas reales; advisors sin avisos para objetos nuevos. Sin consumidores conectados todavía: NO se declara corregida la doble deducción del flujo activo hasta integrar lanzamiento, cancelación, consentimiento y resultado de proveedor.

### 2026-10-01 — RNE: constancia con números y vigencia compartida

Migración `20261001045500_crm_rne_constancia_con_numeros.sql` aplicada por MCP, MD5 `f5df24227b5e0c7629316efb5875c2a3`. Corrige el patrón E.164 de la RPC que rechazaba números con + y permitía registrar cero números. Archivo sin números válidos falla antes de escribir; conserva las constancias anteriores. Lista y detalle de campañas incluyen el recuento real. Cola, API y diagnóstico exigen recuento positivo entero y fecha vigente; el panel distingue constancia incompleta y pide reimportación en es/en/fr/pt, sin conceder vigencia al terminar un POST.

La base tenía una constancia vigente con cero números. No se inventó su contenido: necesita una nueva importación. BEGIN/ROLLBACK pasó deduplicación, exclusiones y llamadas omitidas, repetición, campaña ajena, archivo inválido sin escritura parcial, proyecciones y ACL; rollback probado, cero fixtures. Dos ensayos corrigieron únicamente fixtures (una llamada viva por cliente y SHA-256 válido). Advisors sin avisos para funciones tocadas. Verificación focalizada: 6 suites / 100 pruebas, tipos y lint limpios. Contabilidad y consumidores de campañas siguen en curso; no se desplegó la aplicación.

### 2026-10-01 — WhatsApp: preparación y liquidación transaccionales

Migración `20261001051000_crm_whatsapp_preparacion_y_creditos_atomicos.sql` aplicada por MCP, MD5 `c0e298fbd34a8c491b1f75823ef078ab`. RPC privada crea reserva, conversación, mensaje, actividad pendiente y uso en una transacción. Valida contexto propio, claves estables, actores, oportunidad y consentimiento real tras insertar; cualquier rechazo revierte todo, incluido el débito. Repetición devuelve el mismo mensaje y las claves históricas no vuelven a cobrar. Vincula la reserva privada antes del commit que habilita despacho.

Claim y resultado toman primero el lock del monedero. Confirmar consume la reserva sin segundo débito; rechazo conocido devuelve una sola vez; uncertain conserva saldo reservado y no admite reenvío automático; deferred conserva la reserva y puede reclamarse con otro token. La evidencia financiera pertenece a la reserva privada, no a metadata editable del mensaje. Resultado actualiza contacto, actividad, uso y cifras de campaña en la misma transacción, solo si coinciden mensaje y token actuales.

BEGIN/ROLLBACK pasó preparación repetida, contexto ajeno, plantilla inválida y marketing sin alta sin escritura parcial, confirmación y rechazo repetidos, metadata falsificada, incertidumbre, token antiguo tras deferred, campaña con reserva previa sin segundo descuento, cifras y auditoría. Rollback probado, cero fixtures, advisors sin avisos para las funciones tocadas. Consumidores Node aún no conectados: lanzamiento/pausa/cancelación y envío siguen en curso. No se desplegó Edge ni aplicación.

### 2026-10-01 — campañas: transición y devolución por baja

Migración `20261001051500_crm_campanas_transiciones_y_devoluciones.sql` aplicada por MCP, MD5 `7efcef9dbef2d11f99985af91fef41f8`. Lanzar reserva cada contacto y publica estado/job/auditoría en una sola transacción con versión de campaña. Pausar/reanudar no vuelven a descontar; cancelación y STOP usan el mismo criterio privado de devolución. Reservas sin mensaje o mensajes deferred/sin claim se cancelan antes de devolver; processing/uncertain y envíos confirmados requieren su resultado. Puerta de contacto veta campañas pausadas, canceladas y futuras. Preferencias entrantes toman el lock de monedero antes de otras filas.

BEGIN/ROLLBACK pasó saldo insuficiente sin reserva/job parcial, organización ajena, versión antigua, lanzamiento repetido, reserva previa sin doble cobro, pausa/reanudación con job vivo deduplicado, 5.104 contactos cancelados sin tope, dos devoluciones y una reserva processing conservada hasta rechazo confirmado. STOP real por trigger devolvió el mensaje individual sin claim y preservó el reclamado hasta su resultado. Migraciones 23/24 verificadas juntas, rollback probado, cero fixtures; advisors sin avisos para funciones tocadas. Se verificó el CHECK real de outbound_jobs: correo comparte campaign_batch; su consumidor todavía debe conectarse. Servidor/UI, RNE de mensajes y cumplimiento común siguen pendientes; no se declara completo el lanzamiento comercial ni se desplegó.

### 2026-10-01 — campañas: servidor usa publicación y transiciones privadas

Materialización clasifica con los servicios compartidos y publica una vez por RPC con versión y actor. Conserva historial en SQL y devuelve sus cifras completas; no borra/recrea lotes desde Node ni intenta reparar estado tras un fallo. Lecturas de ventanas y duplicados recorren páginas sin truncar; relaciones de duplicados filtradas por organización. Lanzamiento obtiene conteo actual, informa el límite de Meta y delega reservas/estado/job a la transición. Pausa/reanudación/cancelación transmiten actor de sesión y versión. Ajustes, identidades, plantilla y campaña propagan fallos de lectura.

Verificación: 23 suites / 533 pruebas de WhatsApp, integraciones, despacho y guardarraíles, más comprobación final de 21 casos de rutas/transición; tipos y lint limpios. Contratos de sesión, permiso crm.campaigns.manage, organización ajena, campaña ajena, actor/versiones y fallo de base pasan. No hubo escritura de negocio fuera de la RPC en las operaciones sustituidas. Envío, claims de lote, eventos y cifras del detalle siguen en curso; los consumidores anteriores aún requieren adaptación a los estados reales y a reservas, por lo que este paso no declara listas las campañas para desplegar.

### 2026-10-01 — envío individual conectado a la reserva atómica

El servicio de WhatsApp publica por crm_prepare_whatsapp_outbound: reserva, conversación, mensaje, actividad pendiente y uso quedan juntos. Node deja de descontar e insertar por separado. Errores de cliente, oportunidad, ventana y límite diario se propagan; un resultado vacío o discordante falla. La categoría marketing aprobada prevalece sobre el propósito declarado para el horario y para SQL. La confirmación y devolución usan la reserva del despacho, sin segundo cobro.

Verificación: 37 suites / 690 pruebas (WhatsApp, jobs y guardarraíles), TypeScript y lint tocado sin errores. BEGIN/ROLLBACK real repitió los casos de preparación/liquidación y añadió una clave legacy de 30 días: mismo mensaje, cero débito y cero reserva nueva; cero fixtures. Las pruebas de Node validan el contrato privado, mientras la idempotencia y liquidación se verifican en SQL real. El lector previo del job sigue siendo una optimización de siete días; la RPC conserva claves históricas. El consumidor de lotes y eventos todavía requiere adaptación a queued real, sin declarar enviado al publicar el mensaje. No se desplegó.

### 2026-10-01 — lotes con estados y reservas reales

Migración `20261001054500_crm_lotes_con_estados_y_reservas_reales.sql` aplicada por MCP, MD5 `f1dfd6b8905e047b9e1271eba1c5ed62`. RPC privadas reclaman hasta 50 contactos propios con estados reales/legacy y token, sin recorte previo por terminales; liberan, omiten, fallan o pausan solo el testigo actual. No rescatan mensajes vinculados en la reserva privada, ni siquiera con metadata atrasada. Timeout después del commit conserva queued; solo el resultado del proveedor declara enviado. Publicación del recuento y siguiente job comparten transacción y dedupe. Incertidumbre, ledger huérfano, reserva no liquidada y fecha inválida pausan en vez de encadenar envíos o abonos.

BEGIN/ROLLBACK pasó 260 contactos (200 terminales delante), límite 50, tokens distintos, testigo vivo/caducado, callback antiguo, backoff y job deduplicado, devolución única por omisión/fallo, timeout con mensaje persistido, metadata atrasada, incertidumbre sin devolución/reenvío, pausa, costo decimal, organización ajena y ACL. Rollback probado; conserva estados/evidencia/saldos y revoca acceso nuevo. Cero fixtures; advisors sin hallazgos para las funciones nuevas. Consumidor Node en curso; correo y eventos aún pendientes. No se desplegó ni se declara lista la campaña comercial.

### 2026-10-01 — consumidor de lotes conectado a SQL

El job exige organización antes de leer y filtra la campaña por ella. Reclama por RPC, transmite el testigo en cada resultado y publica progreso/job de forma atómica. Node deja de hacer UPDATE de contactos/estadísticas, fn_campaign_mark_sent y encolado separado. El resultado distingue prepared de sent: preparar conserva sent=0; SQL cuenta las confirmaciones del proveedor. Timeout después del commit no libera el mensaje vinculado. Abort o deadline libera solamente lo no procesado con su testigo; respeta throttle global/por destinatario y no permite desactivar el horario configurado con respect_allowed_hours=false o force. Historial reciente recorre páginas sin truncar.

Verificación: 37 suites / 683 pruebas de WhatsApp, jobs y guardarraíles; 21 casos finales con reloj/abort/contratos; tipos y lint limpios. Los mocks anteriores simulaban UPDATE de SQL y afirmaban sent al insertar: se sustituyeron por contratos del consumidor; claim, rescate, ledger, backoff y resultados permanecen probados en transacciones reales por MCP, documentadas en el paso anterior. Eventos de proveedor, correo, horario legal común y RNE de mensajes siguen en curso. No se desplegó.

### 2026-10-01 — primer mensaje de campaña exige testigo vigente

Migración `20261001060500_crm_preparacion_con_testigo_vigente.sql` aplicada por MCP, MD5 `5574b75aa489cec4d9c0ec3eba42ec6e`. Preparación privada exige contacto queued sin enviado y testigo actual antes del primer mensaje. Repetir un mensaje existente conserva idempotencia; el testigo transitorio no cambia la huella estable. Callback sin testigo o con el de otro lote no publica ni cobra. Rollback restaura la función anterior y conserva evidencia y saldos.

BEGIN/ROLLBACK repitió los casos de lote y añadió ausencia/testigo ajeno, repetición con token distinto sin segundo débito y reversión; advisors sin hallazgos para la función. El archivo conserva exactamente el SQL aplicado. Consumidor transmite testigo en el siguiente paso.

### 2026-10-01 — testigo del lote en el consumidor

El lote transmite su token a la preparación privada. El esquema del navegador no expone ese campo y la ruta de envío individual fija source=crm, sin permitir suplantar procedencia de campaña. Pruebas de contrato verifican la transmisión; tipos y lint limpios. Se ajustaron dos fixtures de voz para que una constancia vigente traiga números válidos: 17 suites / 321 casos, siete omisiones existentes; 11 casos finales del envío.

Integrada main hasta 8b7a3620 conservando ambas entradas de PROGRESS.md; build completo en 27f47678, proceso 0. Suite completa de ese punto: 942 suites pasan, 22 fallos en tres suites. Diecinueve provenían de los fixtures de RNE sin recuento y pasan tras corregirlos; tres son del mock de orden de Twilio. Esa revisión encontró además el INSERT antiguo de consentimiento de Twilio: se está sustituyendo por la operación canónica. La suite completa se repetirá tras ese arreglo; no se declara verde ni se despliega.
