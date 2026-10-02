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

### 2026-10-01 — consentimiento de Twilio en una transacción

Migración `20261001061000_crm_consentimiento_twilio_atomico.sql` aplicada por MCP, MD5 `cf4a0f466663f2c3ff5d7af9839315c0`. RPC privada prevalida todos los clientes propios y el teléfono leído antes de llamar a crm_set_contact_consent. Preferencia, banderas, exclusión de pendientes y devolución canónica comparten transacción. Constancia privada con RLS y sin acceso de navegador impide que un STOP repetido deshaga un START posterior; reutilizar SID con otra evidencia falla.

BEGIN/ROLLBACK pasó STOP→START→STOP antiguo, SID conflictivo, cliente ajeno y teléfono cambiado sin modificación parcial, 405 destinos sin recorte, metadata conservada, SMS independiente, cancelación y devolución única, processing conservado y ACL. Rollback probado; conserva preferencias, saldos y constancias, revoca acceso. Cero fixtures; advisors sin hallazgos para objetos nuevos.

### 2026-10-01 — Twilio conectado al consentimiento canónico

El webhook resuelve teléfonos con la normalización compartida, recorre páginas y envía todos los destinos en una RPC. Propaga fallos para reintentar; elimina INSERT de preferencias y UPDATE de banderas separados. Opt-in exige coincidencia inequívoca; para opt-out conserva el criterio conservador de sufijo. Transmite el teléfono leído y la clave estable del proveedor para CAS/deduplicación. El harness de lectura incorpora range para verificar 405 coincidencias sin simular las mutaciones SQL.

Verificación: 19 suites / 451 pruebas, tipos y lint tocado limpios. La prueba failing del viejo INSERT pasa como contrato normal de STOP/START; su efecto real y la repetición del STOP se verifican por MCP. La suite completa y build posteriores están en curso. Eventos y correo de campañas, cumplimiento compartido y resto del alcance aún pendientes.

### 2026-10-01 — checkpoint de integridad y consentimiento

Verificación completa en `4cbad9a9`: 945 suites / 17.054 pruebas pasan; una suite y ocho casos omitidos existentes. TypeScript final 0 errores, lint tocado limpio y build completo con tipos comprobados por separado, ambos procesos 0. Main integrada hasta `8b7a3620`. Las 27 migraciones están archivadas con SQL aplicado exacto, rollback y MD5. Eventos, correo, cumplimiento compartido y demás alcance siguen pendientes; PR 280 permanece en borrador, sin merge ni despliegue.

### 2026-10-01 — eventos de proveedor con constancia privada

Migración `20261001064200_crm_eventos_proveedor_con_evidencia_privada.sql` aplicada por MCP, MD5 `e0ad4b452d8c8ab70fdad1cdc34fe232`. Constancias de Meta privadas con RLS, deduplicación por organización/canal/evento y callbacks tempranos conservados. Aplicación y liquidación se basan en el vínculo guardado por el despacho privado; no en message_events editable. Lectura/entrega prevalecen sobre eventos anteriores; contradicción tras rechazo exige conciliación y pausa. Rechazo confirmado devuelve una sola vez; 131049/131048 vetan marketing durante 24 horas por el predicado canónico. Precio desconocido sigue desconocido y puede enriquecerse sin retroceder estado. Finish concilia callbacks tempranos después de liquidar y conserva idempotencia tras el callback.

BEGIN/ROLLBACK pasó callbacks tempranos/repetidos/fuera de orden, precio atrasado conservado, rechazo y cifras sin duplicación, incertidumbre confirmada, evidencia editable sin movimiento financiero, conflicto pausado, canal/organización ajenos, fechas inválidas y ACL. Rollback probado, cero fixtures; SQL archivado exactamente igual al aplicado. Advisors: aviso 0029 de fn_can_contact intencional, con control interno de pertenencia; dos FK de la tabla nueva requieren índices adicionales en el siguiente paso. Ninguna reserva histórica carece de la referencia privada. Consumidor Node, reintentos verificados e inbound aún pendientes, sin despliegue.

### 2026-10-01 — índices de relaciones de eventos privados

Migración `20261001064500_crm_eventos_proveedor_indices_de_relaciones.sql` aplicada por MCP, MD5 `be6c3f0d4e0ca43db5661aa75e0fc588`. Cubre las FK de canal y mensaje que detectó el advisor. BEGIN/ROLLBACK confirmó ambos índices y reversión funcional sin retirar soporte ni evidencia. Advisors sin FK descubiertas ni hallazgos de seguridad para objetos nuevos; avisos de índices todavía no usados son esperables antes de desplegar el consumidor. fn_can_contact conserva el aviso 0029 intencional y la pertenencia interna.

### 2026-10-01 — webhook y respaldo conectados a constancias privadas

Cloud transmite el canal y organización ya autorizados por la firma, conserva el evento completo y delega en crm_record_provider_status; falla de persistencia se propaga para reintentar. Elimina INSERT de evento, cambios de estado/cifras y lectura sin canal separados. Detalle sync=1 exige permiso de lectura usado por el listado, valida campaña propia y concilia solo evidencia privada; errores no se ocultan. Costo usa countryFromPhone/getUnitCost compartidos, sin tarifa de otro país ni categoría sustituida. Eliminadas las funciones públicas de reapertura y sincronización desde eventos editables.

Verificación: 26 suites / 629 pruebas focalizadas y 217 casos finales de eventos/rutas/guardarraíles; TypeScript final 0 errores, lint tocado limpio. Se sustituyeron mocks de N updates y reapertura por contratos del consumidor privado; efectos de ledger/estado/event_time/cifras se comprobaron en SQL real en el paso anterior. Reintento por rechazo, atribución inbound, cifras/CSV completas y correo siguen en curso. No se desplegó.

### 2026-10-01 — reintentos solo con rechazo verificado

Migración `20261001065500_crm_reintentos_con_rechazo_verificado.sql` aplicada por MCP, MD5 `a258190b3bb6d2feae2e0343de154340`. Reintento de 131056/130429/429 exige constancia privada aplicada del intento actual y reserva devuelta; máximo tres intentos con contador privado, sin depender de attempts editable. Rearma saldo, ledger, contacto, estado y job en la misma transacción; conserva mensajes y huellas anteriores en historial privado. Backoff 6/30 segundos; una campaña terminada vuelve a sending, una pausada/cancelada no se reabre. El claim recupera rechazos pendientes al reanudar con saldo. Clave estable deduplica dentro del intento actual sin devolver el mensaje rechazado anterior. Un callback histórico no cambia el intento nuevo; entrega histórica contradictoria pausa para conciliación.

BEGIN/ROLLBACK pasó tres rechazos, reserva/publicación repetida, máximo terminal, backoff, job vivo previo, resumen sin sumar fallos reintentables, historial de tres mensajes/dos reintentos, devolución única por intento, callback viejo y contradictorio, saldo infinito convertido a cero sin abono inventado, pausa/recarga/reanudación, organización ajena y ACL. También repitió eventos del paso 28 y todos los casos de lote/preparación del paso 26. Rollback probado y advisors sin hallazgos para funciones tocadas. No se desplegó ni se enviaron mensajes.

### 2026-10-01 — verificación completa de eventos y reintentos

Checkpoint `758d4774`: 947 suites / 17.074 pruebas pasan, una suite y ocho casos omitidos existentes, proceso 0. Build completo, proceso 0; TypeScript del código final sin errores, lint tocado limpio. Las treinta migraciones aplicadas conservan SQL exacto y rollback; fixture de eventos/lotes/reintentos retirado por ROLLBACK. PR 280 permanece en borrador: inbound, cifras/CSV, correo, cumplimiento compartido y el resto del alcance siguen pendientes. Sin mensajes enviados, merge ni despliegue.

### 2026-10-01 — postprocesado entrante en una transacción

Migración `20261001071200_crm_postprocesado_entrante_atomico.sql` aplicada por MCP, MD5 `f5b42a206d3f78b0ca6df27bf66f8624`. Constancia privada del consentimiento y resultado de postprocesado por mensaje, con RLS y sin acceso de navegador. La proyección crm_consent_action ya no decide idempotencia: quitarla no reaplica STOP después de START. Atribución ≤72 horas exige mensaje saliente persistido del mismo canal/cliente/organización; actualiza contacto/cifras, oportunidad propia, metadata conservada, conversación, actividad y notificación canónica juntos. Solo notifica al vendedor activo propio. Prevalida todo el contexto entrante; no recibe texto ni oportunidad del cliente.

BEGIN/ROLLBACK pasó STOP→START→STOP antiguo sin marcador editable, atribución y conteos, actividad/notificación únicas, canal/cliente/organización discordantes, otro canal, fuera de 72 horas, oportunidad ajena descartada y vendedor inactivo sin notificación. Fallo real de constraint de actividad dejó sin cambio todas las mutaciones del postprocesado, incluido consentimiento inicialmente no procesado. Rollback probado; cero fixtures de organización/usuario, notificaciones transaccionales retiradas, sin envío. Advisors sin seguridad ni FK descubiertas; dos índices de soporte aún no usados. Cero mensajes históricos tenían marcador antiguo. Consumidor Node y persistencia inicial de cliente/conversación/mensaje siguen en curso: este paso garantiza el postprocesado, no declara transaccional toda la recepción previa.

### 2026-10-01 — consumidor entrante conectado y recuperación del replay

handleWhatsAppInbound usa una RPC con contexto propio; texto/tipo, consentimiento, oportunidad y destinatario se leen del mensaje persistido en SQL. Node elimina N escrituras, linkInboundReply y createWhatsAppActivity sin consumidores restantes. Cloud busca duplicados por organización/canal/dirección antes de crear clientes/conversaciones, recupera el contexto persistido propio y repite el postprocesado. Errores de búsqueda, contexto o postprocesado se propagan al webhook para reintentar; ya no se ocultan. La conversación se reabre dentro de la RPC.

Verificación: 49 suites / 936 pruebas de WhatsApp, integraciones, jobs y guardarraíles; tipos 0 errores, lint tocado limpio. Contratos verifican contexto, replay sin INSERT/UPDATE desde Node, resultado privado, falla y respuestas inválidas. Idempotencia, consentimiento, atribución y reversión se verificaron contra SQL real en el paso anterior. Persistencia inicial de cliente/conversación/mensaje aún separada y pendiente de unificación; cifras/CSV completos, correo, cumplimiento y UI también siguen pendientes. No se desplegó.


### 2026-10-01 — cifras y exportación completas de campañas

Migración `20261001073242_crm_cifras_contactos_y_exportacion_completos.sql` aplicada por MCP, MD5 `d7239f287aa555d06fb7e2e672ca1128`. Conteos, búsqueda literal y estados efectivos se consultan en SQL antes de paginar; exportación agrega todos los contactos filtrados en una sola lectura. Orden estable por fecha e id. Una guarda propia exige permiso de lectura y rechaza contactos ajenos en una campaña. El helper de estado concentra la compatibilidad con metadata heredada. Timeline agrupa instantes UTC antes de contar y descarta fechas malformadas o sin zona; representa marcas por contacto, no cada intento. Resumen de errores excluye contactos pendientes de reintento. Costo real permanece null cuando faltan precios, con subtotal conocido y conteo sin precio.

BEGIN/ROLLBACK pasó 25.000 contactos sin recorte, página estable, filtro más allá de los límites antiguos, búsqueda literal con %/_, CSV completo/filtrado, offsets equivalentes, fecha inválida, costo desconocido/conocido, estados/filtros inválidos, campaña y usuario ajenos y ACL privada. Rollback probado; fixtures retirados. Advisors: las tres RPC de lectura tienen aviso 0029 esperado, con permiso y organización dentro; sin hallazgos de rendimiento para objetos nuevos. Archivo byte a byte igual al aplicado. Consumidores Node y CSV se conectan en el siguiente paso; sin envío ni despliegue.


### 2026-10-01 — consumidores de cifras y CSV completo

Detalle y contactos consultan las RPC con el cliente de sesión, sin service role ni límites locales de 20.000/5.000 filas. CSV usa la exportación completa de una sola lectura, verifica total antes de entregar, conserva filtros y convierte fechas con la zona de la organización. Reutiliza filasACsv para BOM, separador y neutralización de fórmulas. Ruta valida organización en query y permiso del listado; errores SQL/resultado inválido se propagan. Se retiraron skipPending y computeCampaignCounts sin consumidores; recuento operativo queda en SQL. API distingue precio desconocido de subtotal conocido.

Verificación: 46 suites / 834 pruebas de WhatsApp, integraciones, jobs y guardarraíles; tipos finales 0 errores y lint tocado limpio. Contratos verifican CSV de 1.605 filas, búsqueda/página con total 25.000, fecha en zona distinta, celdas seguras, permisos/organización ajena y rechazo de exportación parcial. SQL real verificó los conteos completos en el paso anterior. UI de campaña, recepción inicial atómica, correo y cumplimiento compartido continúan pendientes. Sin despliegue.


### 2026-10-01 — contacto semanal con constancia privada

Migración `20261001075036_crm_contactos_semanales_con_despacho_privado.sql` aplicada por MCP, MD5 `644ba0c348182854a12fc9b1f3188672`. Constancia privada por mensaje/conversación/canal; finish la escribe junto con liquidación y callbacks confirmados la actualizan. La compuerta semanal compartida cuenta solo despachos confirmados; cola, fallo e incertidumbre sin confirmación no cuentan, ni metadata editable. Entrega/lectura probadas conservan el contacto ante un rechazo tardío o contradicción, sin modificar su conciliación financiera. Una respuesta a conversación iniciada por el cliente sigue excluida durante 24 horas. Voz conserva fn_es_contacto_voz_efectivo y correo sus estados efectivos. Pertenencia y cliente propio se validan dentro del conteo; intervalos inválidos se rechazan.

BEGIN/ROLLBACK pasó cola con metadata falsa, despacho confirmado, proyección retirada, rechazo, lectura contradictoria y fallo tardío, respuesta iniciada por cliente, voz humana frente a máquina/inbound, correo enviado frente a pendiente/fallido, usuario/cliente ajenos y ACL. Fallo real de constraint en constancia dejó sin cambio mensaje/evento/despacho. Repitió casos completos de preparación/lotes, eventos y reintentos. Rollback probado; cero fixtures. Advisors: RLS sin policy es cierre deliberado de evidencia sin GRANT de navegador; 0029 del conteo esperado con pertenencia/cliente propio internos; índices nuevos aún sin uso y sin FK descubiertas. Cero mensajes históricos tenían referencia de proveedor o reserva consumida, por lo que no hubo backfill de evidencia no demostrada. SQL archivado exacto. La conexión legal de campañas y correo continúa pendiente; sin envío ni despliegue.


### 2026-10-01 — checkpoint completo de recepción, cifras y contacto semanal

Código `bf020c60`: 949 suites / 17.090 pruebas pasan, una suite y ocho casos omitidos existentes, proceso 0. TypeScript final 0 errores, lint tocado limpio y build completo proceso 0 con validación de tipos separada como CI. Paso SQL `154b8283`: 245 pruebas finales de cumplimiento/CSV/guardarraíles, además de BEGIN/ROLLBACK de conteo, fallos reales y regresiones completas de lotes/eventos/reintentos. Las 33 migraciones tienen SQL exacto y rollback; fixtures retirados. Main continúa en `8b7a3620`. PR 280 conserva estado de borrador: faltan persistencia inicial entrante atómica, correo, conexión legal de campañas, UI y el resto del alcance. Sin envío, merge ni despliegue.


### 2026-10-01 — RNE y política de datos en campañas

Migración `20261001081948_crm_rne_y_politica_campanas.sql` aplicada por MCP, MD5 `a2e608b561dac2be350ab2af3531e57e`. Constancia privada de RNE para campañas de mensajes, importación compartida con voz y exclusión de audiencia en una sola transacción. Valida campaña, cliente y teléfono leídos; omite todos los contactos excluidos y devuelve reservas canónicas juntos. Extrae el núcleo de exclusión por conjunto para evitar un recuento por cada número. Lanzar/reanudar y preparar un mensaje exigen política HTTPS y constancia vigente con números; el claim pausa por vencimiento conservando las reservas. Pausar/cancelar siguen disponibles. La compuerta del proveedor vuelve a comprobar ambos requisitos.

BEGIN/ROLLBACK pasó 6.002 contactos y 6.000 números sin recorte, conjunto vacío sin omitir toda la audiencia, teléfono cambiado, campaña/cliente ajenos, vencimiento, pausa y cancelación con devolución. Fallo real de constraint tras exclusión/devolución revirtió juntos constancia, registro RNE, contactos y saldo. Repitió preparación/lotes, eventos y reintentos con constancias válidas en fixtures transaccionales. Rollback conserva evidencia y saldos; cero fixtures persistentes. SQL archivado exacto. Advisors: aviso 0029 de lectura autenticada esperado con permiso y organización internos; índices nuevos aún sin uso, sin FK descubiertas nuevas. Dos FK preexistentes de voice_campaign_rne_checks carecen de índice. Carga Node/UI y horarios, festivos y límite semanal por destinatario siguen pendientes; este paso no declara completo el cumplimiento. Sin envío ni despliegue.


### 2026-10-01 — carga RNE conectada al servidor de campañas

GET /api/crm/campaigns/[id]/rne lee cumplimiento con sesión y permiso de lectura; POST exige crm.campaigns.manage antes de usar service role. Organización ajena en body/query recibe 403 registrado. Carga limitada por bytes incluso sin Content-Length, parser/normalización/vigencia compartidos con voz y audiencia completa en una lectura. Transmite teléfono leído y normalizado para CAS; una RPC guarda constancia, exclusiones y devolución. No conserva contenido del archivo. Resultado inválido o exportación incompleta falla; errores de política/RNE generan mensajes específicos y pausan el lote conservando reservas.

Verificación: 26 suites / 552 pruebas pasan; TypeScript 0 errores y lint tocado limpio. Contratos cubren 6.002 destinatarios sin recorte, SHA y números deduplicados, arreglo de exclusión vacío, sesión/permisos/organización, límites reales del archivo, lectura fallida, teléfono discordante y CAS. Efectos transaccionales se verificaron en SQL real en el paso previo. UI y conexión legal por destinatario siguen pendientes; sin publicación ni mensajes.


### 2026-10-01 — índices de las constancias RNE de voz

Migración `20261001083240_crm_rne_indices_de_relaciones.sql` aplicada por MCP, MD5 `83d6e3d38df538f9b55fb1697f181f5b`. Cubre campaign_id y checked_by, las dos FK preexistentes detectadas al reutilizar la importación de voz. Verificación previa: una constancia y 49.152 bytes. BEGIN/ROLLBACK comprobó índices y reversión sin cambiar evidencia ni saldo. Rollback conserva deliberadamente estos índices de soporte, sin DROP. Advisor ya no señala FK sin índice en esta tabla; solo índices aún no usados. SQL archivado exacto. Sin despliegue.


### 2026-10-01 — reglas puras de contacto compartidas con Edge

Ley 2300 y RNE conservan exactamente su implementación y se trasladan a supabase/functions/_shared/contacto. Las rutas de voz reexportan el módulo compatible; el despacho Edge podrá importar la misma regla, sin duplicar calendario, ventana, topes ni normalización. El guardarraíl examina también esa ubicación y exige una sola evaluación del tope dentro de la decisión que comprueba siempre el horario. La excepción previa de la zona fija de +57 se traslada al mismo archivo; no añade un fallback.

Verificación: 14 suites / 393 pruebas pasan, TypeScript 0 errores y lint tocado limpio. Voz, RNE y guardarraíles conservan su comportamiento. La compuerta por destinatario y su reserva de concurrencia se conectan en el siguiente paso; sin despliegue.


### 2026-10-01 — turnos privados y reprogramación de mensajes

Migración `20261001090100_crm_turnos_privados_y_reprogramacion_legal.sql` aplicada por MCP, MD5 `c79f83ec0d45a0f20f2fa4b92f7397f8`. Contexto propio y privado conserva propósito de marketing y campaña desde la reserva, y devuelve identidad real, zona del destinatario, horario configurado y reloj del servidor. Un turno de WhatsApp se reserva bajo el candado canónico antes del proveedor; capacidad suma contactos efectivos y turnos todavía inciertos. La incertidumbre no entra al conteo efectivo ni se libera por antigüedad. La constancia confirmada/rechazada concilia el turno. Números de prueba solo eximen el tope semanal; exclusiones y vigencia de ventana siguen aplicando. Ventana y semana leídas se revalidan bajo candado.

Reprogramación conserva el mismo mensaje y crédito, y publica un trabajo whatsapp con dispatch_message_id en la misma transacción; deduplicación privada por testigo. Reanudar recupera mensajes publicados que todavía no iniciaron envío. BEGIN/ROLLBACK pasó dos envíos competidores, incertidumbre de semana anterior, rechazo y confirmación privados, propósito retirado de metadata, política ausente, identidad distinta del teléfono, RNE del destinatario real, suma voz/correo, ventana vencida, testigo/organización ajenos, reprogramación repetida y ACL. Fallo real de constraint tras crear el trabajo revirtió juntos mensaje, turno y job conservando reserva/saldo. Repitió lotes/preparación, eventos, reintentos y contacto semanal. Rollback conserva evidencia y saldo, detiene solo los trabajos nuevos todavía en cola y revoca las APIs. Cero fixtures; SQL exacto. Advisors sin seguridad ni FK descubiertas en objetos nuevos; cuatro índices todavía no usados.

El consumidor Edge y el handler de reprogramación se conectan en el siguiente paso. La asignación de turnos aquí cubre WhatsApp; no declara resuelta toda la concurrencia entre voz y correo. Sin mensajes ni despliegue.


### 2026-10-01 — consumidor legal y reanudación del mensaje

channel-dispatch usa la regla compartida de voz y reserva el turno privado después de resolver destinatario/credenciales y antes del proveedor. Horario del destinatario, festivos, franja de organización y capacidad semanal se comprueban con reloj de base; force no forma parte de esta compuerta. +57 conserva la zona de Colombia. La franja solo restringe la ley. Una ventana que caducó bajo candado requiere otra oportunidad; RNE/identidad discordante bloquean. Números de prueba conservan el horario. Lecturas/resultado/configuración inválidos fallan cerrado.

Si debe esperar, una RPC reprograma el mismo mensaje con su reserva; el handler whatsapp admite dispatch_message_id y vuelve a invocar el consumidor protegido, con organización propia y secreto interno. No prepara ni cobra otra solicitud. Turno incierto conserva conciliación, sin POST. Resolución de identidad añade desempate por id igual al contexto SQL. Horario por organización se comparte con Edge; TypeScript permite sufijos .ts para los módulos de Deno, manteniendo noEmit.

Verificación focalizada: 47 suites / 817 pruebas, tipos 0 errores y lint tocado limpio. Deno comprueba ambos consumidores con dependencias aisladas en /tmp, proceso 0. Harness ejecuta Edge con proveedor simulado y compuerta real: domingos, festivos, tope semanal, RNE, incertidumbre, error de reprogramación, entrega y callback. Contratos de cola prueban mensaje ajeno, abort, fallo de lectura/secreto/consumidor y continuidad del mensaje sin otro cobro; efectos SQL reales se comprobaron en el paso anterior. Suite completa y build están en curso; no se declara verificación completa todavía. UI, correo, recepción inicial y resto del alcance siguen pendientes. Sin mensajes ni despliegue.


### 2026-10-01 — checkpoint completo de cumplimiento del despacho

Código `bc9e6b9e`: suite completa secuencial, 952 suites / 17.125 pruebas pasan, una suite y ocho casos omitidos existentes; proceso 0. Build completo proceso 0 con tipos comprobados por separado como CI; TypeScript 0 errores, lint tocado limpio y Deno de ambos consumidores proceso 0. La primera ejecución simultánea con el build tuvo un timeout en una prueba de POS: sus veinte casos pasan aislados y la repetición completa posterior pasa sin cambiar código. Las 36 migraciones aplicadas tienen SQL exacto, rollback y MD5; fixtures retirados. Main continúa en 8b7a3620.

PR 280 sigue en borrador: recepción inicial transaccional, correo y concurrencia entre canales, UI de campañas/plantillas y el resto de las 135 pantallas, conexiones y limpieza aún pendientes. Las compuertas de RNE de campañas requieren desplegar estas API/UI para cargar la constancia desde el CRM. No se fusionó ni desplegó la aplicación; los cambios SQL documentados sí están aplicados por MCP. Sin mensajes enviados.


### 2026-10-01 — recepción inicial Cloud en una transacción

Migración `20261001095255_crm_recepcion_cloud_atomica.sql` aplicada por MCP, MD5 `6df23fc83f86da413b995ae0421a8a49`. Amplía el recibo privado con id del proveedor por organización/canal, remitente, mensaje original y prueba del teléfono principal. La RPC privada crea o recupera cliente, identidad y conversación, inserta el mensaje y llama al postprocesado canónico en una transacción. El replay compara el original con la evidencia privada y devuelve el resultado histórico sin repetir consentimiento, actividad o notificación, incluso tras editar la proyección. Una identidad archivada no concede opt-in para otro teléfono; conserva la baja. Fusionar y deshacer toman primero el mismo candado de comunicaciones para mantener el orden con recepción y despacho. El adaptador anterior sigue disponible durante el despliegue.

BEGIN/ROLLBACK antes y después de aplicar comprobó creación completa, STOP/START/replay STOP editado, colisión del original, id externo igual en otro canal/organización, CAS de teléfono, alias fusionado y baja. Un constraint real en la actividad forzó un fallo tardío y revirtió cliente, identidad, conversación, mensaje, recibo y consentimiento. Reversión probada: revoca la nueva RPC y restaura las funciones anteriores, conservando datos y evidencia privada. ACL sin acceso del navegador, cero fixtures, SQL exacto; advisors sin nuevos problemas de seguridad/FK. Las pruebas del adaptador y la verificación completa continúan; sin mensajes ni despliegue.


### 2026-10-01 — adaptador Cloud sin escrituras parciales

Cloud usa la RPC privada de recepción; elimina las altas separadas de cliente/conversación/mensaje y el postprocesado posterior desde Node. Las lecturas propias construyen prueba CAS de teléfono y fusión; los errores se propagan al webhook para reintentar. El replay consulta evidencia privada y no depende del teléfono o los metadatos actuales. Cada mensaje toma el nombre del contact con su wa_id, no el primer elemento del lote. Se rechaza un remitente fuera del protocolo en lugar de inventar un indicativo. El buscador canónico pagina candidatos conservando antigüedad/id y propaga errores; deja de recortar a 200. Tests previos se trasladan al contrato transaccional, manteniendo el consumidor QR.

Verificación: 27 suites / 575 pruebas focalizadas y suite completa, 953 suites / 17.148 pruebas pasan; una suite y ocho casos omitidos existentes. TypeScript 0 errores y lint tocado limpio. Horarios/guardarraíles del checkpoint anterior pasaron en UTC, Bogotá, México, Madrid, Santiago y Katmandú (26 suites / 804 casos por zona). Build final en curso; el proceso inicial se detuvo para ejecutar build y suite completa por separado. Recepción comprobada en SQL real con rollback; no se invocó al proveedor ni se desplegó la aplicación.


### 2026-10-01 — Ola 6: detalle de campañas de mensajes y RNE conectado

Cierre del checkpoint Cloud: el build final de e2e5ebbe terminó con proceso 0; las 37 migraciones mantienen SQL exacto, rollback y MD5. Este paso de UI no añade migraciones.

Pantallas: /app/crm/campanas/[id] para WhatsApp/correo y selector de verificación de /app/crm/campanas. Figma 1402:821 (horario y cumplimiento), anotación 1402:1278 y patrón de detalle 1404:17. La vista de mensajes reutiliza el kit, tokens, estados, componentes de datos y fechas de organización, con es/en/fr/pt y componentes de menos de 300 líneas. Mantiene los indicadores propios de mensajes; no muestra llamadas activas ni minutos ficticios del panel de voz. La cabecera deja el nombre visible y coloca las acciones operativas debajo.

Cifras salen del total completo del servidor: procesados = enviados acumulados + fallidos + omitidos, sin sumar otra vez entregados/leídos/respondidos. Costo confirmado pendiente se distingue del subtotal conocido y de los contactos sin precio; no convierte precio desconocido en cero. Contactos pagina/filtra en servidor, muestra las fechas mediante useFormatDate y enlaza la oportunidad de su metadata. Exportar utiliza el CSV completo existente. Fallos de lectura, 401/403 y 404 terminan la carga sin inventar cifras ni mostrar una audiencia vacía. Una respuesta de otra campaña/organización no reemplaza la actual y el sondeo respeta la lectura pendiente.

RNE: panel de campañas de mensajes usa GET/POST reales de la fase 34, límite de 8 MB y la vigencia/parser compartidos con voz; carga el CSV/TXT y vuelve a consultar la constancia. Permiso de verificar y activación vienen del servidor. Activar/reanudar permanece bloqueado mientras falta RNE vigente o política pública HTTPS; pausar/cancelar siguen disponibles. Selector de listado distingue voz/mensajes y usa origen+id para evitar colisiones entre tablas.

Verificación: suite completa 957 suites / 17.197 pruebas pasan, una suite y ocho casos omitidos existentes, proceso 0. Tras el ajuste visual, las 5 suites / 69 pruebas de UI y lógica pasan; TypeScript 0 errores, lint tocado limpio y segundo build de producción completo proceso 0 (tipos por separado como CI). Contratos comprueban 25.000 contactos acumulados, precios pendientes, cuatro idiomas, permisos, errores, abort y reapertura de carga RNE.

E2E real: borrador temporal creado por API, aparece en listado y detalle; PATCH propio aparece de vuelta, selector RNE de mensajes llega a su API, CSV responde, activación bloqueada y 404 visible sin spinner. Comprobado a 1440 y 390, sin desbordamiento ni overlay de error. Query/body de otra organización devuelven 403 y lanzar audiencia sin calcular devuelve 409. DELETE por API y consulta MCP posterior: cero campañas/contactos de prueba. La cuenta de prueba requiere la retirada temporal de cookies de selección que documenta la skill E2E para revisar el módulo no activo; se conservan sesión/permisos reales del servidor. Stripe.js falla al cargar en la cabecera general del entorno; no se encontraron otros errores de ejecución. Capturas y sesión se conservan solo fuera del repositorio. No se cargó un RNE de prueba ni se contactó al proveedor.

PR 280 continúa en borrador. Pendiente: CRUD atómico de campaña y control de edición simultánea, asistente unificado con prellenado segment_id, correo/plantillas y restantes pantallas, recepción inicial de otros adaptadores, concurrencia entre canales, conexiones de ola 4 y limpieza de ola 5. Este checkpoint no acredita las 135 pantallas completas. No se fusionó ni desplegó.


### 2026-10-01 — Ola 6: guardado y archivo de campañas en una transacción

Migración 20261001112641_crm_campanas_edicion_y_archivo_atomicos.sql aplicada por MCP, MD5 2a35167e70348f22a5cb8f169f0766b4; rollback en el mismo checkpoint, MD5 f8eaa63d68334db045df15c41f48507f. Hay 38 migraciones de este avance. No añade tablas ni columnas: conserva el esquema real y usa statistics para la marca de archivo y su actor.

RPC privadas crm_campaign_save y crm_campaign_archive: organización/actor propios, candado canónico de comunicaciones, versión exacta y referencias bloqueadas dentro de la transacción. Guardar valida cliente, oportunidad, etapa/embudo, canal, plantilla y segmento; limpia las referencias de fuentes inactivas. No permite cambiar el estado desde un guardado ni desactivar el horario legal. En campañas programadas solo admite cambios de nombre/descripción: destinatario, contenido, horario y reservas quedan protegidos.

Retirar una campaña conserva contactos, constancias RNE y vínculos con la evidencia de créditos/entregas. Usa la cancelación canónica para pendientes y devuelve reservas conciliables una vez. Si quedan reservas sin resolver, revierte toda la operación y exige conciliación. Mensajes activos no se archivan. Lista unificada, cifras, contactos y CSV omiten archivadas; el contexto de lectura central conserva permisos y comprobación de contactos propios.

BEGIN/ROLLBACK antes y después de aplicar: creación/edición, versión obsoleta, actor/campaña/cliente/negocio/etapa/embudo/canal/plantilla de otra organización, campos privilegiados, protección de programadas y lista de 1.101 clientes sin recorte. Un constraint real al final del archivo obligó a revertir juntos cancelación, crédito, contacto, evento y archivo. Evidencia privada incompleta bloquea el archivo sin cambios parciales. Archivo correcto y repetición preservan constancia RNE, contacto/reserva vinculados y devolución única. Lecturas posteriores excluyen la archivada y las RPC nuevas niegan acceso del navegador. Rollback probado antes y después: revoca las APIs, restaura las lecturas anteriores y conserva evidencia; no vuelve a cobrar ni reconstruye trabajos cancelados. Cero fixtures y cero archivos de negocio realizados en estas pruebas.

Advisors: sin avisos para las APIs privadas nuevas ni de rendimiento en los objetos tocados. El [aviso 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) de la lectura unificada es el acceso autenticado ya existente, con permisos y organización dentro de la función. SQL exacto cotejado con la historia aplicada. Este commit instala la base; conectar las APIs de guardar/eliminar, exponer la versión al editor y revisar el asistente sigue pendiente. No se enviaron mensajes ni se desplegó la aplicación.


### 2026-10-01 — Ola 6: conflictos de versión sin reintentos infinitos

Migración 20261001120633_crm_conflictos_de_version_sin_reintentos.sql aplicada por MCP; MD5 c6397c2146159057c519ed3c9d7cf0cf. Reversión en el mismo commit, MD5 2f6164fe5d51fd096ea7822dba372ba9. Total: 39 migraciones. Cambia 16 excepciones manuales de SQLSTATE 40001 a P0001 en ocho RPC del CRM: guardar/archivar campañas, fusión/restauración, recepción Cloud, categoría/ajuste de pronóstico y edición de oportunidad. Cotejo de las ocho definiciones aplicadas: solo cambia el SQLSTATE; firmas, permisos, transacciones, condición de versión y mensajes son idénticos.

La comprobación por API real descubrió el [problema documentado de PostgREST 14](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b): lanzar 40001 manualmente convierte un conflicto de negocio en reintentos infinitos. Una solicitud obsoleta agotó 125 s y terminó en HTTP 504. Tras cambiar el código, la RPC respondió HTTP 400/P0001 en 151 ms y la API lo convirtió a 409. Dos PATCH simultáneos con una misma versión devolvieron 200/409; un nuevo intento con la versión antigua recibió 409 y no sobrescribió el registro. No se retiró el bloqueo optimista ni se reintentó sin condición.

BEGIN/ROLLBACK antes y después: guardado, archivo, 1.101 destinatarios, referencias/actor ajenos, programadas, fallo de constraint tardío con cancelación y devolución revertidas juntas, reserva sin evidencia, constancia RNE e idempotencia. Reversión completa probada; restaura la clasificación anterior y preserva ACL/datos, pero reintroduce el problema de 40001 y no debe aplicarse como solución de producción. Cero fixtures sintéticos persistentes. Los backends de las peticiones de prueba dejaron de ejecutar la RPC tras aplicar; la comprobación acotada no encontró procesos para terminar.

Advisors: sin hallazgos de rendimiento ni avisos en las nuevas RPC privadas. Las tres APIs autenticadas existentes de fusionar/restaurar/categoría mantienen su [aviso 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): acceso intencional con organización y permisos comprobados dentro de la función; sus ACL no se ampliaron. El backend Node de campañas y el asistente unificado siguen en el checkpoint siguiente. No se contactó a proveedores ni se desplegó la aplicación.


### 2026-10-01 — Ola 6: cumplimiento cerrado después de archivar campañas

Migración 20261001121958_crm_campanas_archivadas_fuera_de_cumplimiento.sql aplicada por MCP, MD5 3f9ad6d9384a4c7136e992a9e91da9cd; rollback MD5 1fc6ecf7c458df39f7100549d2402269 en el mismo commit. Total: 40 migraciones. La comprobación real encontró que detalle/cifras/contactos ya devolvían 404 al archivar, pero la consulta RNE seguía respondiendo 200. Ahora crm_campaign_compliance_snapshot y la lectura bloqueada de crm_register_campaign_rne exigen una campaña sin archived_at. No se pueden agregar constancias ni autorizar un nuevo envío después del archivo, incluso si la importación comenzó antes de archivarla.

BEGIN/ROLLBACK y reversión probados antes/después: creación/edición, audiencia de 1.101 clientes, referencias ajenas, devolución/idempotencia, error tardío con reversión completa; además, lectura de cumplimiento y registro RNE sobre una archivada dan P0002 y conservan la constancia previa. Advisors sin avisos de seguridad/rendimiento en las funciones modificadas. La reversión restaura la condición anterior de existencia; conserva historial y no desarchiva registros, pero reabre la operación RNE sobre archivadas.

E2E: archivo confirmado desde el diálogo real a 390 y revisado también a 1440, sin desbordamiento; desaparece de las dos listas. Detalle, cifras, contactos y RNE devuelven 404. MCP confirma que el registro sigue guardado con archived_at y state=canceled. El borrador de comprobación no tenía contactos, constancias ni reservas; su limpieza exacta por MCP eliminó únicamente ese fixture y su evento de cancelación. La evidencia con reservas/RNE/contactos se probó en transacción reversible con datos sintéticos. El build Node final se está verificando en el siguiente checkpoint. No se enviaron mensajes ni se desplegó.


### 2026-10-01 — Ola 6: API de guardado y archivo conectadas a las RPC

POST/PATCH/DELETE de campañas de mensajes usan crm_campaign_save/crm_campaign_archive. Su base es la migración 20261001112641 (MD5 2a35167e70348f22a5cb8f169f0766b4, rollback f8eaa63d68334db045df15c41f48507f), completada por las de conflictos 20261001120633 y cumplimiento 20261001121958: 40 migraciones aplicadas. La API deriva organización/actor de la sesión, exige gestión y transmite la versión exacta. PATCH admite expected_updated_at para proteger formularios obsoletos; si se omite, protege la lectura/escritura del servidor. Los conflictos de negocio P0001 llegan como 409, sin bucles de PostgREST ni escrituras sin condición. El horario legal queda obligatorio.

Eliminadas escrituras directas de campañas/contactos y el helper muerto patchCampaignStats. Archivo conserva evidencia y usa cancelación canónica en la misma transacción. Reservas sin conciliación y versión modificada tienen códigos diferenciados; el diálogo mantiene el error visible en los cuatro idiomas. GET lista/detalle exigen lectura, igual que cifras/contactos. La confirmación de archivo de mensajes explica pendientes e historial; voz conserva su recorrido actual. Lógica pura en campaignStoreLogica: cambiar texto/variables invalida materialized_at, además de audiencia/plantilla/propósito/canal. Reenviar los mismos datos, incluso con claves JSON reordenadas, conserva el cálculo del compositor masivo.

Verificación final: 960 suites / 17.225 pruebas pasan; una suite y ocho casos omitidos existentes, proceso 0. TypeScript sin errores; lint tocado limpio; segundo build de producción completo 357 páginas, proceso 0, tipos por separado. Nuevos contratos de servicio/rutas y render verifican permisos, organización ajena, conservación del cálculo, conflicto sin fallback, archivo y errores en cuatro idiomas. Recepción Cloud cubre P0001 y 40001 de compatibilidad; un fallo no confirma recepción.

E2E real sobre el build final: crear por API, horario legal obligado aunque el cuerpo pida false, dos ediciones simultáneas con una misma versión (200/409), nuevo intento obsoleto 409 sin sobrescritura; nombre actualizado aparece en listado y ficha. CSV responde; query/cuerpo ajenos 403, registro inexistente 404 y activar sin audiencia calculada 409. Archivo confirmado desde la pantalla a 390, diálogo revisado también a 1440, sin desbordamiento/overlay; desaparece de ambas listas y detalle/cifras/contactos/RNE dan 404. MCP confirma registro conservado con state=canceled y archived_at. Limpieza exacta de los dos borradores de esta ronda, sin contactos/RNE/reservas, deja cero campañas/contactos en org 120. Evidencia con crédito/RNE/contactos se verifica en las transacciones sintéticas de las migraciones. Sesión/capturas solo fuera del repositorio; bypass del módulo no activo según la skill E2E, conservando autorización real del servidor. Único error de navegador: Stripe.js de la cabecera en este entorno. No se cargó RNE ni se contactó a proveedores.

Pendiente del módulo: asistente unificado de cuatro pasos (1395:1065, 1402:17, 1402:821), prellenado segment_id, versión en formulario, CRUD/transiciones de voz, correo y revisión de lectores antiguos que cuentan campañas archivadas por status. La auditoría MCP encontró grants de escritura directa antiguos en campaigns/campaign_contacts: su cierre necesita el corte coordinado a la API privada para no romper la aplicación publicada anterior; sigue en el plan de despliegue. Restan las demás pantallas, conexiones de ola 4 y limpieza de ola 5. El PR 280 sigue en borrador; no hubo merge ni despliegue.

### 43 — Versiones transaccionales después de audiencia y RNE (2026-10-01)

La materialización y la importación RNE devuelven `campaign_updated_at` leído dentro del mismo bloqueo de la operación. El resultado anterior no incluía esa versión: un asistente con CAS conservaba una versión antigua después de su propia operación. La RPC privada `crm_register_campaign_rne_versioned` exige actor activo y versión exacta, conserva el orden cartera → campaña y delega el registro y las exclusiones en el flujo canónico. No se cambian firmas ni campos anteriores; los clientes publicados siguen funcionando.

- MCP: migración 41 aplicada, `20261001125142_crm_campanas_version_despues_de_audiencia_y_rne.sql`, MD5 `c88da46f06cc3bbd294b5c635765aca8`.
- Rollback: `20261001125142_crm_campanas_version_despues_de_audiencia_y_rne_rollback.sql`, MD5 `af834c3f0d7a4736534771aa62381ef6`. Restaura los dos resultados anteriores y revoca la RPC nueva; no revierte audiencias, RNE ni saldos. Los handlers nuevos que usen la RPC requieren esta migración.
- Prueba MCP real con BEGIN/ROLLBACK antes y después: materializar → editar nombre → RNE → editar nombre, versión exacta en ambos resultados y materialización preservada; versión antigua, actor/organización ajenos y campaña archivada rechazados sin evidencia parcial. RPC solo `service_role`; advisors sin avisos sobre las tres funciones.
- Rollback ensayado antes y después; definiciones anteriores restauradas exactamente. Fixtures exclusivamente sintéticos y transaccionales; no se llamó a proveedores ni se guardó un archivo RNE real.

Pendiente: conectar estos testigos en el asistente y actualizar sus contratos. Esta ronda cierra el soporte SQL; no acredita aún el asistente unificado ni correo/voz.

### 42 — Programación de campañas en zona de organización (2026-10-01)

Se reemplazó el `datetime-local` del asistente por `CampoFechaHora` y `FormField` del kit. La conversión y la revisión usan la zona de organización, nunca la del navegador. Seleccionar programación sin día y hora bloquea guardar, avanzar y lanzar; la fecha se vuelve a validar al guardar. Se rechazan fechas inválidas, pasadas y horas inexistentes por DST. El horario legal queda siempre activo y se explica en es/en/fr/pt; la velocidad muestra una duración mínima, no una promesa de entrega.

Validación: 3 suites / 58 casos pasan; lógica y kit en UTC, Bogotá, Nueva York, Madrid, Tokio y Auckland, 2 suites / 54 casos por zona. TypeScript 0, lint tocado limpio y build completo (357 páginas). Navegador real: formulario sin canales bloqueado; con canal/pipeline/etapa sintéticos, fecha incompleta bloquea y 7 de octubre a las 10:00 conserva esa hora en la revisión. Capturas privadas a 1440/390, sin overflow ni overlay; únicamente error Stripe.js del header. No se guardó campaña ni se envió contenido. MCP confirma canal/pipeline/etapa temporales eliminados.

La inspección visual pidió poner las opciones en columna en móvil y pasar un día calendario al mínimo de `CampoFecha`; ambos ajustes están cubiertos por las pruebas del componente y se comprobarán de nuevo en el siguiente build conjunto del asistente. Pendientes: testigos de versión, RNE dentro del flujo, prellenado, audiencia/canal al inicio, voz/correo y adaptación del resto del asistente a Figma. Esta ronda no acredita el asistente completo.


### 44 — Asistente: versiones propias, audiencia y RNE conectados (2026-10-01)

El asistente de mensajes conserva la versión exacta de su propio guardado, materialización y verificación RNE, incluidos los microsegundos. No consulta una versión posterior para reemplazar el testigo del formulario. Materializar, registrar RNE y activar transmiten expected_updated_at; la RPC rechaza una edición obsoleta con 409. Sin versión de respuesta válida, el flujo falla cerrado. Un doble clic no crea dos borradores y las acciones quedan bloqueadas durante guardado o importación. Tras RNE, los contadores se vuelven a leer del servidor y los controles se liberan.

La comparación pura campaignNeedsMaterialization se comparte con el guardado: cambiar audiencia, contenido, variables, plantilla, propósito o canal invalida el cálculo visible. Cambiar el nombre o reordenar claves JSON lo conserva. La prueba real descubrió que el selector conserva un pipeline al elegir un segmento y la RPC lo limpia; sameAudience ahora compara únicamente los campos activos del origen. El cálculo de un segmento ya no se invalida por ese campo inactivo. El enlace segment_id prellena la selección; el estado del asistente se reinicia al cambiar de organización. Carga, permiso y fallo de lectura tienen estados traducidos.

Sin nuevas migraciones: utiliza las 41 aplicadas, en particular 20261001125142 (MD5 c88da46f06cc3bbd294b5c635765aca8; rollback af834c3f0d7a4736534771aa62381ef6). La RPC RNE versionada solo se usa cuando llega el testigo; se mantiene la compatibilidad del detalle anterior.

Verificación final: 964 suites / 17.262 pruebas pasan; una suite y ocho casos omitidos existentes, proceso 0. Las cinco suites de regresión del flujo pasan (48 casos), TypeScript sin errores, lint tocado limpio y build completo de 357 páginas, proceso 0; tipos por separado como CI. Revisión de seguridad: organización y permiso resueltos antes de elevar, versión inválida rechazada antes de leer audiencia y conflictos sin fallback ni escrituras reparadoras.

E2E real sobre el build: segmento estático sintético preseleccionado; plantilla de prueba; programación incompleta bloquea y 7 de octubre, 10:00 conserva esa hora en la zona de organización. Opciones de envío en columna a 390. Crear y calcular devuelve 1 pendiente y deja Recalcular habilitado. Importar CSV ficticio registra 1 objetivo / 0 exclusiones; RNE vigente, política HTTPS ausente y activación bloqueada. El CSV no es un archivo de la CRC y no acredita cumplimiento de una campaña real. Editar el nombre desde el asistente después de RNE y volver a calcular funciona sin conflicto con su propia operación. Una edición externa seguida de solicitudes obsoletas a materializar/RNE/activar produce 409/409/409; cuerpo de otra organización, 403. El PATCH obsoleto desde el navegador devuelve CAMPAIGN_MODIFIED y su aviso se muestra sin sobrescribir el registro ni dejar controles bloqueados. Archivo devuelve 404 en detalle/cifras/contactos/RNE; MCP confirma state=canceled, marca de archivo, contacto y constancia conservados. Cero mensajes, jobs y reservas. Limpieza exacta de campañas, constancia, exclusión ficticia, segmento, plantilla, canal y cliente: todos los conteos quedan en cero. Capturas/sesión solo fuera del repositorio; único error de navegador, Stripe.js de la cabecera del entorno.

La primera materialización tardó 78,7 s en el entorno local; la siguiente, 1,4 s. Esto no acredita un límite de latencia de producción: queda pendiente localizar el tramo frío antes de desplegar, ya que la ruta declara maxDuration=60. Las capturas de 1440/390 no muestran overflow horizontal; la cabecera antigua del asistente sigue bajo la del shell y su adaptación al PageHeader nativo está pendiente.

Pendientes: orden Figma audiencia/canal → agente/plantilla → horario/cumplimiento → revisión, traducción y kit del resto del asistente, voz/correo, CRUD/transiciones de voz, lectores antiguos y corte coordinado de grants. Continúan las demás pantallas, conexiones de ola 4 y limpieza de ola 5. PR 280 en borrador; no hubo merge ni despliegue ni contacto con proveedores.


### 45 — Campañas de voz: guardado, versiones y archivo atómicos (2026-10-01)

Antes: el servicio validaba referencias en consultas separadas y guardaba directamente; el DELETE eliminaba la campaña. La activación podía limpiar una parada de emergencia sin comprobar el cumplimiento dentro de la transacción.

Base: migración `20261001151437_crm_campanas_voz_guardado_y_archivo_atomicos.sql`, aplicada por MCP con versión `20261001154709`; MD5 `89b6c02137a3f6e70166252d62cf5bbe`. Rollback del mismo timestamp, MD5 `a3c5a89d8b61e739fb78d35ad5ade912`. Cuatro RPC privadas para guardar, archivar, detener y registrar RNE con versión. Wallet primero, actor miembro activo, campaña propia bloqueada, CAS P0001 y referencias propias comprobadas en la transacción; auditoría procesada en CRM. La audiencia/agente/objetivo se congelan cuando hay llamadas o RNE para conservar el testigo del lote. La activación comprueba agente activo, canal habilitado, concurrencia, saldo, política HTTPS y RNE positivo/vigente. Pausar sigue disponible aunque falten referencias de una campaña antigua. Una campaña terminada no puede reanudarse.

Archivo: rechaza llamadas activas, también desde la llamada física, y reservas de crédito sin conciliar; cancela pendientes sin reserva y conserva campaña, llamadas y constancias. Listado unificado, detalle, listado de agentes, diagnóstico, RNE y reclamación de cola excluyen archivos. La cola aplica además RNE/política al reclamar; Ley 2300 por destinatario sigue en el núcleo compartido. El servicio ya no expone los antiguos create/update/delete directos de campañas de voz.

Servidor/interfaz: PATCH, archivo, parada y RNE envían la versión vista con microsegundos; una lectura posterior no sustituye una versión enviada. Clientes publicados anteriores conservan el fallback de versión propia. RNE toma la versión de la audiencia que resolvió y devuelve la nueva. La ficha, lista y pestaña del agente transmiten versiones; después de importar RNE se refresca la campaña. Mensajes de conflicto, audiencia, agente/canal, saldo y estado traducidos en es/en/fr/pt. Los controles de una campaña terminada no permiten reanudar o detener.

Verificación SQL: BEGIN/ROLLBACK real, aplicación repetida idempotente y reversión de las seis funciones anteriores con MD5 idénticos. Creación solo borrador, actor/cliente ajenos, agente inactivo, RNE ausente, versiones obsoletas de guardado/parada/RNE, archivo con llamada activa o crédito reservado, preservación de historia y constancia, lectores/cola/registro RNE después del archivo. Las cuatro RPC no se ejecutan desde anon ni authenticated; solo service_role. Advisors mantienen las advertencias intencionales 0029 de lectores/parada con permiso canónico; ninguna RPC privada nueva queda expuesta.

Gates: 966 suites y 17.295 pruebas pasan, 8 omisiones previas; TypeScript 0 con heap 8 GB, lint limpio en los 27 archivos TS/TSX modificados, diff sin errores. El primer Jest completo encontró tres dobles de Supabase sin `.is`; se actualizaron para registrar el filtro y se añadió una regresión que evita reabrir una campaña archivada aunque una integración le ponga running. Regresiones de despacho: 142 pasan, 7 omisiones de la comprobación remota previa.

Pendientes que esta fase no declara cerrados: reserva/devolución de voz atómica, topes concurrentes del motor, verificación RNE sin truncar audiencias grandes, eliminación de agentes que actualmente tiene FKs CASCADE, revocación de escrituras directas coordinada con despliegue, asistente unificado por canal y resto del alcance del plan.


Cierre del callback: migración `20261001160740_crm_voz_archivo_sin_devoluciones.sql`, aplicada con versión `20261001160944`; MD5 `19a3e8c6bb48ba3cc7c9cd44bfc6b689`, rollback `790b4310e2f1b3a6edd624bc0b0869db`. El trigger no crea una devolución cuando la cancelación proviene del archivo ni cuando la campaña ya está archivada o no es propia. ACL anterior privada conservada. BEGIN/ROLLBACK demuestra callback normal, cancelación sin recrear pendientes, callback tardío bloqueado y rollback con definición exacta. No hay cambios en tablas ni saldos.

E2E real: crear borrador 201, activar agente inactivo 404 y aviso traducido en ficha. Archivo RNE ficticio desde el input nativo: 1 número / 1 objetivo / 0 exclusiones, constancia vigente y nueva versión. Cambio externo + cuatro acciones obsoletas (editar, archivar, detener y RNE): 409/409/409/409, sin sobrescribir; cuerpo ajeno 403. La actualización periódica adoptó correctamente un cambio antes del primer clic; con la lectura periódica pausada en la pestaña para simular una pestaña antigua, Reanudar produce 409, aviso visible y controles liberados. Archivo con llamada sintética in_progress y con un crédito simulado no deducido: 409 llamadas_activas / creditos_pendientes. El diálogo mantiene el error y permite reintentar; cabe a 390 y a 1440, sin desbordamiento de la raíz ni overlay de error. Tras quitar únicamente esa reserva simulada, Eliminar desde móvil archiva; lista sin el registro y detalle/RNE/repetición de archivo 404. MCP confirma marca de archivo, llamada original cancelada, RNE conservado, cero pendientes recreados, cero llamadas físicas y saldo igual al inicial. Limpieza exacta devuelve cero campaña, llamadas, RNE, exclusión ficticia, agente y cliente. El CSV no es de la CRC y no acredita una campaña real. No se contactó a proveedores. Capturas/sesión privadas fuera del repositorio; único error de navegador, Stripe.js del entorno.

En la revisión visual, el diálogo de voz aún mostraba la descripción genérica de mensajes. Se corrigió para explicar el archivo y la conservación del historial; los errores de voz ahora distinguen llamadas/créditos. Las regresiones posteriores al ajuste pasan: 53 pruebas, tipos 0 y lint limpio. Build final y nueva comprobación del diálogo se registran al cerrar esta fase.


Cierre: build de producción final 0, 357 páginas; gate de tipos independiente 0 según la configuración documentada del proyecto. La nueva sesión carga Inicio y Campañas sin overlay; el diálogo final a 1440/390 explica la conservación del historial y permite archivar el segundo borrador. Lista vacía tras el archivo; detalle/RNE/repetición de archivo 404. Segundo fixture sin llamadas/RNE/reservas, retirado con sus eventos, agente y cliente. La comprobación final por MCP devuelve cero para las dos campañas, llamadas, constancias, exclusión ficticia, agentes y clientes de esta ronda. Browser cerrado; JSON/CSV de fixtures retirados. Advertencias de build previas de swcMinify, parche del lockfile y runtime de contratos no generaron fallo ni cambio de dependencias. Ningún despliegue ni merge.


### 46. Evidencia financiera de voz y conciliación atómica — 2026-10-01

Caracterización: `deduct_comm_credits` ya era privada; el problema estaba en separar débito, banderas, devolución y cierre en llamadas distintas. El despachador podía devolver tras un timeout o tras fallar una escritura después de la aceptación del proveedor. ConversationRelay ignoraba el resultado booleano de saldo insuficiente y separaba cobro de sello. Los callbacks podían repetir el abono. La devolución antigua limitada al cupo mensual tampoco restauraba una reserva realizada con saldo por encima de ese cupo. Antes de migrar: cero reservas antiguas pendientes; no se fabricó evidencia con `credits_reserved` ni se hizo backfill financiero.

Migración `20261001165504_crm_voz_reservas_y_conciliacion_atomicas.sql`, aplicada por MCP con versión `20261001171653`. MD5 aplicado y archivo `057aca7630eba86b0168a42cf12ce7da`; rollback `ed66f0b20c7a98eec9783787014afa78`. Tabla privada `crm_voice_credit_reservations`: un registro por intento reclamado, vínculo a llamada física e intento, SID, apertura/cierre y traza de uso. RLS con pertenencia preparada pero sin GRANT al navegador; service_role solo lee el libro y lo modifica mediante ocho RPC privadas. Un noveno ayudante interno no tiene EXECUTE para service_role. FKs RESTRICT conservan la evidencia ante borrados en cascada de agentes, intentos o llamadas; no se cambian las FKs antiguas ni se elimina historia.

La preparación reserva un minuto, crea la llamada física y correlaciona el intento en una transacción. Dos preparaciones devuelven la misma reserva; un único comienzo puede enviar. Se comprueban organización, referencias, consentimiento canónico, agente/canal, política HTTPS, estado de campaña y última constancia RNE positiva y vigente. Los límites de concurrencia incluyen llamadas inciertas; día y hora salen del timezone de la organización y del libro de intentos. Una pausa, baja de agente o cambio de cumplimiento posterior a la preparación bloquea el comienzo; una preparación no enviada puede cancelarse y devolver su débito probado. Un HTTP 4xx con código del proveedor, excepto 408, permite devolver; un timeout o 5xx conserva reserva y capacidad hasta conciliar. La aceptación REST y el callback atan el mismo token y SID al intento. Estados terminales no se reabren por eventos anteriores; callbacks de intentos antiguos conservan su historia y no alteran la reserva actual.

La apertura crea una sola traza de uso por SID y fija el inicio. El primer cierre fija el fin; el cobro es máximo de minuto reservado y minutos de conversación, descontando solo la diferencia. Repetir apertura/cierre no añade cargos. Saldo insuficiente conserva diferencia pendiente, traza y ausencia de sello; reintentar tras recuperar saldo usa el primer fin. Una conversación ya abierta o consumida no recibe el reembolso por fallo/no respuesta. El abono restaura únicamente el minuto probado, incluso por encima del cupo mensual; una reserva ilimitada no produce saldo cuando el plan pasa a finito.

Verificación real antes y después de aplicar: transacciones BEGIN/ROLLBACK para repetición de reserva/envío/callback/cierre, callback temprano, SID conflictivo, intento anterior, timeout/503/408, rechazo confirmado, cancelación previa, desactivación/pausa, RNE ausente, política ausente, saldo cero, cliente/organización ajenos, topes diario/horario/agente/concurrencia, deuda pendiente/reintento, llamada breve, entrada sin reserva y cambio ilimitado→finito. Se demuestra abono exacto con saldo 50 frente a cupo mensual 30. Reembolso fallido no modifica saldo, estado ni sello. Roles anon/authenticated realmente rechazados; service_role no puede invocar el ayudante ni escribir directamente el libro. Aplicación doble y rollback doble probados; reversión posterior al uso se bloquea para preservar evidencia. Advisors mantienen nueve categorías previas sin referencias a la tabla ni funciones nuevas. Diff limpio. Al terminar: libro vacío, cero fixtures, cero reservas antiguas pendientes, 14 llamadas físicas como antes, saldo/configuración original de org 120 conservados. Ninguna llamada ni mensaje al proveedor; ningún despliegue ni merge.

Alcance de este checkpoint: solo expansión de base, con código publicado intacto. La integración del despachador, callbacks/TwiML y servidor WS sigue pendiente en la siguiente fase; no se declara corregido el runtime todavía. Desplegar Node y WS juntos tras integrar; las reservas antiguas creadas entre migración y despliegue carecen de prueba privada y deberán conciliarse, no inferirse ni reembolsarse automáticamente. El rollback elimina estructura únicamente si el libro está vacío. Siguen pendientes recuperación de preparaciones/interacciones inciertas, topes antes de reclamar, eliminación de agentes sin evidencia financiera, escritura directa coordinada con despliegue, audiencias RNE grandes y el resto del plan.


Complemento 46: el archivo también consulta `crm_voice_credit_reservations` por la campaña guardada en su evidencia privada. No confía únicamente en las banderas de crédito editables de `voice_agent_calls`. Migración `20261001172023_crm_voz_archivo_con_evidencia_financiera.sql`, aplicada `20261001172218`, MD5 `e9455d40c3bc53b84811a4e70fb9c927`; rollback `36d2c554eea087947295b70668d2c300`. Índice parcial para reservas/deudas pendientes. Prueba real BEGIN/ROLLBACK: deuda de conversación pendiente con banderas de llamada alteradas sigue dando `creditos_pendientes`; después de pagar la diferencia se permite archivar y se conservan ambas reservas. Aplicación repetida y reversión recuperan la definición anterior con MD5 idéntico. Revertir este complemento antes del libro de reservas. La integración de runtime continúa pendiente; total 45 migraciones de este PR.


### 47. Presupuesto antes de reclamar y reintento de voz probado — 2026-10-01

La cola y el despacho puntual ahora comparten una compuerta transaccional privada antes de incrementar intentos. Bloqueo de cartera primero, campaña y llamada propias después. Capacidad global combina llamadas físicas, reclamaciones sin reservar todavía y evidencia privada de entregas inciertas; una llamada/correlación no ocupa dos plazas. Los límites diario, de últimos 60 minutos y de cliente/agente (dos intentos diarios) usan el libro real. El día sale de la zona de organización; se conserva la ventana móvil que ya usa Node. Un saldo finito también limita las reclamaciones aún sin débito. Lotes grandes dejan el resto pendiente sin journal adicional; fechas futuras no se reclaman. Consentimiento, agente/canal, HTTPS, RNE positivo vigente y campaña activa se comprueban dentro de la transacción. Los dos ayudantes carecen de EXECUTE incluso para service_role y verifican acceso a la organización.

Preparar exige el teléfono y timezone exactos usados por Node al evaluar al destinatario. Si cambian antes de preparar o de comenzar, no se envía. La reserva conserva esa prueba y referencias privadas; la llamada física omite los campos auxiliares. Preparación y comienzo usan las mismas plazas, incluyendo incertidumbres aunque se alteren las banderas/estado públicos. El control por cliente también se repite antes del débito. La constancia RNE debe tener tanto números como objetivos positivos.

`crm_voice_retry_rejected` solo reprograma un rechazo REST probado y devuelto del intento actual. Conserva las reservas anteriores, aplica política del agente y presupuesto temporal, crea la fila pendiente, el job y el testigo/auditoría juntos. Una segunda petición devuelve el mismo job. No reintenta una incertidumbre, cancelación previa ni callback sin prueba de rechazo REST; respeta otra llamada viva y el límite total de intentos. Con el cupo diario agotado programa desde el siguiente día de organización; con el horario agotado espera la expiración necesaria en los últimos 60 minutos. Node volverá a evaluar la Ley 2300 al ejecutar el trabajo. Si falla un constraint de la cola, revierte fila pendiente, testigo y auditoría, conservando el reembolso ya conciliado.

Migración `20261001173207_crm_voz_topes_reclamacion_y_reintento_probado.sql`, aplicada por MCP con versión `20261001175424`; MD5 exacto `067986f65c3bf36bba01553bf364877b`, rollback `8b71211834d62ba6b050850a7567dc5b`. Restaura cuatro definiciones anteriores y retira las tres nuevas funciones; no modifica saldos, evidencias ni trabajos. Revertir esta fase antes de retirar el libro de la fase 46. El rollback no cancela los jobs que ya se hubieran creado.

Verificación real BEGIN/ROLLBACK antes y después de aplicar: lote de 500 reclama solo dos plazas, tres pendientes sin intentos; despacho puntual comparte el cupo; llamada/reserva no duplica plaza; incertidumbre retiene capacidad aunque se altere la fila; prueba terminal la libera. Saldo uno reclama solo una llamada sin debitar todavía. Rechazo probado produce un solo job; repetir no reserva ni abona; fecha futura y tercer intento diario quedan bloqueados sin ampliar journal. Ventana móvil incluye intentos de hace 35 minutos. Teléfono/timezone cambiados antes de preparar y teléfono cambiado después bloquean; saldo queda intacto. Política inválida no produce cast fallido y usa respaldo. Fallo tardío real de constraint de outbound_jobs revierte toda reprogramación. Roles reales anon/authenticated no pueden reclamar/reintentar y service_role no invoca ayudantes. Aplicación repetida y reversión recuperan las cuatro definiciones con MD5 idéntico. Regresiones financieras de la fase 46 pasan con los nuevos testigos y ventanas explícitas para aislar créditos de topes. Advisors mantienen nueve categorías previas sin menciones a las tres funciones nuevas. Cierre por MCP: libro/fixtures/jobs de reintento cero, 14 llamadas físicas como antes, saldo/configuración original conservados y función de encolar restaurada tras la prueba temporal. Ningún contacto al proveedor, merge ni despliegue.

Diferencia respecto a la fase 46: las compuertas de reclamación sí protegen también a los consumidores publicados que ya llaman esas RPC. Las nuevas operaciones de reserva, correlación, callback, cierre y reintento todavía requieren integrar Node/WS. Antes de la siguiente preparación, Node deberá enviar la prueba de teléfono/timezone de su lectura, sin datos de organización provenientes del cliente. Siguen pendientes recuperación operativa de preparaciones/entregas inciertas, prueba de teléfonos de audiencia contra la constancia RNE, paginación RNE de voz, protección de agentes sin evidencia financiera, despliegue/corte de escrituras directas y resto del alcance completo. Total: 46 migraciones aplicadas de este PR; gates de aplicación siguen siendo los de la fase 45 porque esta fase solo modifica SQL.


### 48. Voz: despacho, callbacks y sesión conectados al libro privado — 2026-10-01

El runtime del PR usa las operaciones financieras de las fases 46/47. La preparación reserva y correlaciona dentro de una transacción; Node transmite el teléfono y timezone exactos evaluados. Solo el ganador de comenzar llama al proveedor. Un error de preparación con resultado desconocido conserva conciliación. El catch del proveedor abarca únicamente calls.create: un fallo de base después de recibir el SID nunca se convierte en rechazo ni devolución. Rechazo REST probado solicita devolución y reintento privados; timeout/5xx conserva intento/capacidad. La cola no libera una VoiceCreditPendingError. Se retiraron los antiguos débitos, inserts y abonos separados del despachador.

La API de despacho exige sesión, crm.campaigns.manage y validación estricta antes de elevar. Rechaza organización ajena en cuerpo/query, UUID inválido y cliente que no corresponde a la oportunidad. Referencia inexistente e inactividad tienen errores de negocio seguros; una incertidumbre responde 409 sin detalle del proveedor/base.

TwiML y status verifican firma/AccountSid antes de consultar la reserva propia. Las URL transportan reservationId, conservado después del aviso de grabación y en Connect action. El SID puede vincularse desde un callback anterior a la respuesta REST. Token desconocido, SID conflictivo o TwiML de otro intento fallan cerrado. Un callback anterior aplica su evidencia privada sin sobrescribir el intento actual. Callback y AMD pasan por la misma RPC, no por un abono desde flags públicos. La compatibilidad antigua exige SID ya correlacionado y nunca devuelve una reserva sin prueba privada. Se conserva el aviso/acta antes de grabar y el TwiML válido para la action de Connect.

ConversationRelay compara token de setup con upgrade, nonce y SID. Sin configuración del agente no pasa al cerebro genérico. Abre el uso privado antes de aceptar turnos; el último minuto reservado puede dejar saldo cero y todavía autoriza esa sesión saliente. Entradas sin reserva siguen necesitando saldo. Cierre/error/close durante setup concilian mediante una sola operación; saldo insuficiente conserva deuda y ausencia de sello. Transcript se guarda con condición por organización y SID para que una sesión antigua no escriba sobre otro intento. Un fallo de red de cierre conserva evidencia pendiente; la recuperación duradera sigue pendiente, no se inventa fecha ni devolución. zod 3.25.67 se declara y fija también en el lockfile del servidor WS, misma versión que la web.

No hay nuevas migraciones: las 46 propias aplicadas siguen siendo prerrequisito. Base main integrada hasta 3dfa87e7 (avisos de miembros); el conflicto de PROGRESS se resolvió conservando ambas entradas. Los contratos de oportunidades doblan la frontera after de Next, verifican organización de sesión y no envían correos. Los dobles de voz ahora responden al contrato privado y mantienen aserciones de orden, ausencia de escrituras financieras separadas y fallos conservadores; las reglas SQL reales siguen verificadas por MCP en 46/47.

Gates finales: 971 suites / 17.369 pruebas pasan; una suite y ocho casos omitidos existentes. TypeScript 0, lint tocado limpio, diff sin errores. Build de producción completo, 357 páginas y proceso 0; tipos comprobados por separado como CI. Advertencias anteriores de swcMinify, runtime de contratos y parche del lockfile no modificaron dependencias de la web. Contratos nuevos cubren autorización, incertidumbre después de aceptación, devolución solo con prueba, AMD, callback temprano/anterior/repetido, rechazo antes del modelo, deuda pendiente y cierre durante setup.

E2E sobre el build: API real devuelve 401 sin sesión; cuerpo/query ajenos 403; agente sintético inactivo 409; objetivo/id inválido 400; agente inexistente 404; callbacks sin firma/cuenta resoluble 403. Ninguna solicitud llega al proveedor. Inicio, Campañas y Llamadas renderizan y sus capturas privadas a 1440/390 no muestran overlay ni desbordamiento de la raíz; Llamadas tiene su región horizontal de indicadores en móvil. La comprobación ampliada de consola encontró Invalid API key en peticiones directas del navegador a Supabase de la cabecera/módulos; las API Node con el proxy del entorno sí funcionan. Dos comprobaciones del proxy/CA del navegador no resolvieron esa limitación y una sesión nueva redirigió a login. No se declara una consola global limpia ni verificación completa de esas lecturas de cabecera. No hubo cambios de claves ni desactivación TLS. La limitación del entorno queda explícita para la próxima comprobación visual.

Limpieza por MCP: agente sintético cero, reservas privadas/antiguas pendientes cero, llamadas de org 120 cero, saldo 30, voz deshabilitada y configuración activa como antes. Browser cerrado; credenciales/capturas solo fuera del repositorio. Sin llamadas, mensajes, merge de PR ni despliegue. Pendientes: recuperación de preparaciones/entregas inciertas y cierre fallido, testigos RNE por teléfono y audiencias completas, representación de ringing/busy en el callback privado, teléfono humano/puente y sus créditos, protección de agentes sin libro privado, corte de grants coordinado, asistente unificado y resto de olas 4/5/6. PR 280 continúa en borrador; este checkpoint no acredita el CRM completo.


### 49. Voz: RNE sobre la audiencia completa y el teléfono comprobado — 2026-10-01

Figma leído: audiencia 1395:1613, horario/RNE 1402:1278 y detalle de voz 1404:17. El lector compartido de la cola y RNE recorre páginas de 500; ya no publica como completa una revisión limitada a 5.000 objetivos ni depende del máximo de 1.000 filas de PostgREST. Conserva el evaluador canónico de segmentos; un lote de cola pequeño no convierte un segmento grande en 413. La lista manual divide sus ids y quita duplicados. Etapas y seguimientos mantienen orden estable; secuencias comprueban paso, ejecución, inscripción, cliente y oportunidad de la organización.

El servidor pasa la audiencia completa y el teléfono bruto/normalizado por el núcleo compartido. La RPC privada valida pertenencia, ausencia de duplicados, teléfono actual bajo bloqueo y versión exacta de campaña. La exclusión se obtiene del archivo dentro de SQL. Registra constancia pública, snapshot privado, testigos por cliente y omisiones juntos. No duplica el DSL ni la normalización del núcleo. Los límites/permisos no salen del navegador.

Reclamación, preparación y comienzo exigen la misma prueba privada vigente, configuración de audiencia coincidente, teléfono actual idéntico, destinatario normalizado comprobado y ausencia de exclusión global. Un objetivo nuevo sin testigo no queda autorizado. Una fecha/conteo público alterado o una constancia antigua sin snapshot no inventa evidencia. Se conserva historial con FKs RESTRICT. Verificaciones sucesivas usan clock_timestamp para ordenarse dentro de una misma transacción.

La RPC de lectura aplica pertenencia y permiso antes de devolver estado/conteos, sin teléfonos privados. La cola y el panel usan esa misma respuesta y fallan cerrado ante error o respuesta sin indicadores de evidencia. GET y POST rechazan organización ajena mediante readOrgBody, incluidas query repetida y las cuatro variantes de clave. El panel distingue constancia sin prueba y audiencia/teléfonos cambiados, ofrece cargar otra vez y mantiene fechas en timezone de organización. Lógica pura de presentación, kit y mensajes/plurales en es/en/fr/pt; el texto de autorización ahora habla de permiso de campañas.

Migración aplicada 20261001201744; archivo 20261001195944_crm_voz_rne_audiencia_y_telefono_verificados.sql, MD5 7dd6f7f294c5a73489e5107c31eb65f1, exacto por MCP. Rollback aaa059b0d4c7d00901492c11302fb676: recupera cuatro definiciones previas byte a byte, pero se niega a borrar cualquier evidencia nueva. 47 migraciones propias archivadas. Prueba antes/después de aplicar con BEGIN/ROLLBACK: 6.001 objetivos, exclusión, teléfono cambiado durante/después de verificar, destinatario distinto antes de reservar, exclusión antes de enviar, fechas públicas falsas, configuración cambiada, objetivo nuevo/ajeno, duplicados, legado, historial protegido, actor ajeno, aplicación doble y reversión exacta. No quedó ningún fixture de esas transacciones.

Tablas privadas con RLS/políticas desde la creación y sin SELECT/mutación para anon/authenticated; service solo SELECT, escritura mediante RPC. Helper privado sin EXECUTE de service. El avisador conserva nueve grupos y señala la nueva RPC de lectura SECURITY DEFINER disponible a authenticated: es deliberada, comprueba pertenencia y permiso y no expone teléfonos. Sin avisos nuevos de RLS/search_path en estas tablas/funciones; referencia de revisión: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.

Gates: suite completa: 972 suites, 17.402 pruebas aprobadas; 8 pruebas y una suite omitidas, 0 fallas. TypeScript 0, lint tocado limpio, Deno check del RNE compartido 0, diff limpio. Build final compilado en 4,5 minutos y 357 páginas generadas, salida 0. Advertencias anteriores de swcMinify, runtime de contratos y parche de lockfile; lockfile de la web intacto. main sigue en 3dfa87e7.

E2E del build con agente sintético inactivo/campaña borrador: navegador carga CSV/TXT y registra dos clientes revisados, un excluido y una evidencia privada. GET real confirma los conteos/estado. Cambiar solo un teléfono mediante MCP produce changed_targets=1, audiencia no vigente y alerta visible en escritorio/móvil. GET de organización propia 200; organización ajena 403 en los cuatro alias y query duplicada, sin sesión 401, body ajeno 403, versión antigua 409 y archivo vacío 400, sin publicar otra constancia. Capturas privadas a 1440/390, sin overlay ni overflow de la raíz. La consola global conserva Invalid API key en lecturas directas de Supabase de la cabecera/módulos; las API Node funcionan. No se acredita una consola global limpia ni se sustituyeron claves o desactivó TLS. El intento de transporte local a través del proxy del entorno no resolvió esa limitación; no forma parte del código.

Fixture de interfaz retirado mediante MCP con guardas de ids/nombres/estado: dos clientes, agente inactivo, campaña borrador, constancia, dos testigos y exclusión sintética. Conteos finales: fixtures 0, snapshots/testigos privados 0, llamadas/libro de org 120 en 0; saldo 30 minutos, canal de agentes apagado y configuración activa como antes. Sin llamadas/mensajes/modelos de proveedor, merge del PR ni despliegue. Una constancia de voz anterior requiere nueva importación con el runtime actualizado; no se hizo backfill ni se alteró su evidencia. El estado compara testigos existentes y configuración; cambios posteriores de miembros dinámicos se bloquean por falta de testigo individual, pero queda mejorar su diagnóstico en la lista/cola. Pendientes: recuperación duradera de entrega/cierre, cola/manual atómicas, telefonía humana/puente, archivo de agentes, coordinación/correo, asistente unificado y demás pantallas/conexiones/limpieza. Este checkpoint y el PR en borrador no acreditan las 135 pantallas completas.


### 50. Cifras: escala de probabilidad y cierres reales — 2026-10-01

Se revisaron por MCP las columnas de opportunities, stages y pipelines: stages.probability es integer 0–100 y stages no tiene organization_id. El KPI mensual del dashboard usa probabilityToFraction, igual que escenarios y pronóstico: 1000 al 50% produce 500. La consulta real agregada de org 120 confirma ponderado 5200 frente a 520000 con la fórmula anterior; no se modificaron sus oportunidades.

Reportes deja de usar probability >= 0.99 para identificar la única etapa ganada. El criterio de cierre compartido con Pronósticos usa status=won o is_won, admite varias etapas ganadoras y no convierte una etapa abierta del 100% en venta. El select de etapas se acota por pipelines.organization_id; error en pipeline/etapas/oportunidades se propaga en vez de publicar un vacío falso. Sin migración ni cambios visuales.

Al dejar limpio el archivo tocado se retiraron any/import sin uso. CSV reutiliza filasACsv (BOM, comillas y fórmulas neutralizadas), obtiene timezone de organización para el nombre y libera la URL. Pruebas de descarga cruzan la medianoche en Bogotá/Madrid y comprueban liberación ante rechazo.

Gates: 52 pruebas focalizadas, suite completa 974 suites / 17.421 pruebas aprobadas, 8 casos y una suite omitidos existentes, 0 fallas. TypeScript 0; lint tocado limpio; diff limpio. Build de 49 aprobado; estos cambios se compilarán con el siguiente ajuste antes de push. No se acredita E2E visual nuevo del dashboard/reportes: mantienen lectores directos afectados por la limitación Invalid API key del navegador del entorno. Quedan trasladar esas lecturas/cifras al servidor, paginación completa, moneda/rangos en zona de organización y sus estados. No cierra todo el módulo ni las 135 pantallas.

Prioridad adicional solicitada por el dueño: investigar el aviso de permiso al agendar reunión, distinguir falta de sesión de falta de autorización y verificar administrador sin relajar barreras, continuando el resto del alcance.


### 51. Reuniones: sesión y permiso diferenciados — 2026-10-01

El aviso de la captura no demuestra falta de permiso: claveError convertía tanto 401 como 403 en sinPermiso. Ahora 401 tiene mensaje de sesión vencida, ORG_AMBIGUOUS explica el cambio de organización y 403 conserva permiso denegado. POST/PATCH de reuniones transmiten el código seguro de OrgContextError. El helper compartido solo resincroniza cookies mediante ensureSessionSynced ante UNAUTHENTICATED de una API CRM local y reintenta una vez: esa respuesta precede a cualquier escritura. No reintenta 403, errores de red, conflictos ni errores internos; conserva cancelación y formulario. Cuatro idiomas. No se relajó autorización/RLS ni se cambió membresía permanentemente.

Metadatos, políticas, triggers y helpers comprobados por MCP: reuniones y actividades admiten membresía; no bloquean específicamente al administrador. BEGIN/ROLLBACK con JWT real y rol authenticated comprueba crear/leer un evento con role_id=2 e is_super_admin=false. La membresía quedó restaurada. No se afirma haber reproducido el estado de sesión de la captura original.

API sobre build real: 401 UNAUTHENTICATED sin sesión; 403 FOREIGN_ORGANIZATION con body/query ajenos; 201 de administrador crea un evento, una actividad enlazada y una notificación app. Fixture sin teléfono/correo ni invitaciones. MCP confirma una fila de cada tipo y luego limpieza guardada por ids, título y metadata del cliente: eventos/actividades/notificaciones/clientes de prueba en cero. No se enviaron correos ni llamadas.

Gates: 976 suites / 17.442 pruebas aprobadas, una suite y ocho casos omitidos existentes, 0 fallas. TypeScript 0, lint tocado limpio, diff limpio. Build combinado de 50/51: compilación y 357 páginas completas, salida 0; tipos por separado como CI. Lockfile de la web intacto; advertencias anteriores de swcMinify/runtime de contratos/parche de lockfile. Pruebas específicas cubren recuperación única, límite de reintento, cancelación, organización y formulario con mensajes reales en cuatro idiomas.

El navegador del entorno redirigió al inicio tras errores Invalid API key en las consultas directas de Supabase. No se acredita guardado desde formulario ni recuperación visual E2E; la prueba real positiva fue de API. No se cambiaron claves ni TLS. Persisten escrituras separadas de evento/actividad/enlace y la necesidad de convertirlas en RPC transaccional con validación cruzada de cliente/oportunidad y fechas; no se declara cerrada esa integridad. Sigue el alcance completo de ficha/conexiones y olas pendientes, PR en borrador, sin merge ni despliegue.


### 52. Ficha: lectura de sesión y respuestas obsoletas — 2026-10-01

La cabecera de la ficha deja de leer customers.select('*') desde el navegador. GET /api/clientes/[id] valida la organización de sesión y sus cuatro alias, exige crm.customers.view o crm.leads.view y acota el segundo caso a lifecycle_stage=lead. Usa RLS de usuario, columnas explícitas sin metadata interna y Cache-Control private/no-store. Los errores SQL conservan 500; cliente ajeno/inexistente 404, UUID inválido 400 y sesión ausente 401 con código propio. No eleva a service role.

El hook aborta al cambiar cliente, recarga u organización y descarta respuestas tardías. Oculta inmediatamente los datos anteriores; distingue sesión vencida, permiso denegado y fallos recuperables con los mensajes comunes en cuatro idiomas y el kit. Se mantienen las pestañas existentes, cuyos lectores antiguos siguen pendientes.

Pruebas de contrato y hook: 17 pasan, incluyendo cliente ajeno aun con posible pertenencia a ambas organizaciones, permiso solo de leads, ausencia de consulta ante 401/403, error SQL sin detalle privado y respuesta antigua tras cambio de organización. Suite completa: 978 suites / 17.459 pruebas aprobadas, una suite y ocho casos omitidos existentes, cero fallas. Lint tocado limpio. TypeScript completo sin incremental pasa con heap de 12 GiB; los intentos anteriores de 4/6,5 GiB agotaron memoria. No se desactivaron checks ni se modificó tsconfig.

Build completo: 357 páginas, salida 0. Después se añadió una anotación explícita de tipo al retorno del lector; sus contratos y TypeScript se volvieron a comprobar. El siguiente build conjunto verificará esa anotación junto al historial. API real de administrador: 200 propio sin metadata y private/no-store; 403 organización ajena, 404 inexistente, 400 UUID inválido y 401 sin sesión. SQL BEGIN/ROLLBACK confirma aislamiento propio/ajeno. Cliente sintético de API retirado con guardas de id/org/nombre/metadata, restantes cero.

La comprobación visual volvió a redirigir al inicio por la limitación Invalid API key de las lecturas directas de Supabase del entorno. No se acredita E2E visual de esta ficha ni se cambiaron claves/TLS. Sin migración en este bloque, mensajes a proveedores, merge ni despliegue. Continúan el historial único y conexiones comerciales; el PR sigue en borrador y este checkpoint no completa las 135 pantallas.


### 53. Historial: relaciones completas del cliente y permisos de sesión — 2026-10-01

El servicio compartido del historial consulta cinco vistas de solo lectura para clientes: actividades, notas, tareas, correos e historial de etapas. Incluyen relaciones directas y de todas las oportunidades propias del cliente sin precargar una lista recortable de ids. Tareas con customer_id explícito entran solo cuando su relación principal no es cliente/oportunidad, sin duplicación. El related_id TEXT del correo se compara con UUID::text: una referencia antigua no UUID no rompe la lectura. Para oportunidades se mantienen las fuentes originales.

Vistas security_invoker/security_barrier, SELECT solo para authenticated/service_role, sin elevación ni nuevos privilegios sobre tablas base. Cada rama une organización de fuente, oportunidad y cliente. BEGIN/ROLLBACK real verifica relaciones directas/de oportunidad, tres tipos de tareas sin duplicados, correos, etapas, referencias ajenas omitidas, usuario sin pertenencia sin filas y ausencia de SELECT anon/escrituras authenticated. Aplicación doble y rollback doble probados; rollback elimina solo vistas, sin CASCADE ni pérdida de datos. EXPLAIN usa índices existentes, coste total 10,51 sobre el volumen actual; no se añadieron índices redundantes.

La ruta exige crm.customers.view, o crm.leads.view limitado a leads; oportunidades exigen crm.opportunities.view. crm.calls.view_all se resuelve en servidor; sin él, calls/voz IA quedan restringidos al actor y las actividades referenciadas comprueban el propietario real de calls. El autor de una actividad no concede acceso a otra llamada. Query/body no pueden conceder permisos. Organización ajena en los cuatro alias da 403, UUID/rango/cursor/filtro inválido 400 y sesión ausente conserva 401 UNAUTHENTICATED. No convierte un cursor inválido en primera página ni un error de entidad/hidratación en vacío falso. Perfiles se leen por miembros propios, stages por pipelines propios y email_events con organización explícita.

El hook compartido usa pedirCrm y los diagnósticos comunes en cuatro idiomas, aborta primeras páginas obsoletas y descarta cargar más de otra entidad/filtro/organización. Evita doble carga inmediata; un refresco durante el arranque no deja loading ni cursor perdidos. 401/403/404 durante paginación retira datos anteriores. Agrupación visual usa timezone de organización y merge conserva microsegundos/desempate SQL. Sigue pendiente trasladar al kit la presentación completa y los textos antiguos del historial, así como la agrupación WhatsApp por zona de organización.

Migración aplicada 20261001221721, archivo 20261001221100_crm_historial_relaciones_cliente.sql, MD5 3403caed802528921c9d7ed0daffad27; rollback 83dbc106caee2e48902e27edd5b64747. Exactitud comprobada contra schema_migrations por MCP. Total de este PR: 48 migraciones propias. Avisador conserva los nueve grupos previos y no señala las nuevas vistas; no hay nuevo SECURITY DEFINER/RLS/search_path.

Gates conjuntos de ficha/historial: 982 suites / 17.495 pruebas aprobadas, una suite y ocho casos omitidos existentes, cero fallas; TypeScript completo con heap de 12 GiB, cero errores; lint de todos los archivos tocados limpio; diff limpio. Build final completo: compilación 4,2 minutos, 357 páginas, proceso 0. Tipos/lint por separado como CI; lockfile intacto. Se mantienen las advertencias conocidas de swcMinify/runtime y del intento de parche de lockfile por DNS del entorno. Contratos del historial, hook y cursor: 93 pruebas focalizadas, incluido recorrido exacto de 67 notas en páginas de siete con microsegundos, actor ajeno, relaciones propias y cambio de organización durante cargar más. Últimos ajustes de importación/formato se comprobaron con sus once casos.

API sobre el build real: 401 sin sesión, 403 organización ajena, 400 UUID/cursor inválidos y 404 inexistente. Admin obtiene 200 private/no-store, dos notas (directa/oportunidad) en páginas de una sin duplicados ni pérdidas, y un historial de cinco entradas con tarea, etapa y usuarios hidratados. Cliente, oportunidad, notas, tarea, actividades e historial de prueba retirados con guardas; fixtures restantes cero, avisos del fixture cero. No se enviaron mensajes ni llamadas. Navegador abierto inmediatamente al iniciar el servidor: vuelve al inicio por la limitación global de lecturas Supabase; no se acredita la ficha visual. Browser/server cerrados.

No reemplaza todavía el TimelineTab antiguo de la ficha: faltan integrar ventas, reservas/folios y pedidos web en el servicio compartido para conservar esa información al retirarlo, además del kit y conexiones comerciales. No se declara terminada la línea de tiempo visual ni las 135 pantallas. PR en borrador; main sigue en 3dfa87e7, sin merge ni despliegue.


### 54. Ficha: historial comercial único, folios y filtros coherentes — 2026-10-01

`TimelineTab` deja de tener un lector propio de ventas/reservas/actividades/pedidos: consume el mismo `/api/crm/timeline` de las oportunidades. Se conservan las fuentes previas y se añade un origen comercial paginado del cliente, sin escribir ni recalcular ventas, impuestos, cobros o contabilidad. Importes NUMERIC se conservan; importe ausente no se convierte a cero y la UI no inventa moneda cuando aún no está resuelta la organización.

La vista `crm_customer_financial_history` relaciona ventas, reservas y pedidos por cliente y organización, con `security_invoker`/`security_barrier` y solo SELECT para authenticated/service_role. Las reservas conservan todos sus folios (la FK no es única), saldos guardados, cantidades e importes pendientes; también espacios directos y múltiples, sin duplicar un espacio y con su tipo emparejado. No expone notas internas de pedidos. IDs comerciales con prefijo y collation C mantienen el desempate SQL/JS; un cursor comercial nunca se convierte a UUID en otras fuentes.

Migración aplicada `20261001225612`, archivo `20261001223800_crm_historial_comercial_cliente.sql`, MD5 `2f9aea713f977d01770693dcb5add5ed`; rollback `76c2fce8f03f6f7190a65f3e830974f0`. SQL exacto comprobado por MCP; 49 migraciones propias en el PR. Aplicación y rollback dobles dentro de BEGIN/ROLLBACK pasan. Prueba real verifica tres orígenes, dos folios con saldos 140/25 y pendientes 100/25, miembro propio con tres filas, no miembro sin filas, anon sin SELECT y authenticated sin UPDATE. Otra prueba comprueba espacios directos/múltiples, deduplicación y pares espacio/tipo. EXPLAIN usa índices existentes de cliente/organización: coste total estimado 139,23 en el volumen actual; sin índice añadido. Avisadores de seguridad/rendimiento no señalan la vista nueva.

La presentación común usa `crm/kit/TimelineEntry` y `TimelineFilters`, según los contextos de ficha `331:114976` y `331:115083`, y el componente `329:109173`: tarjetas con borde/radio/espaciado del kit, iconos Smartphone/ShoppingCart, texto que puede envolver, metadatos en zona de organización, sin eje vertical. Mantiene los cuerpos funcionales de llamadas, correo, WhatsApp, tareas y reuniones. Barra de ficha sin búsqueda ficticia, chips que envuelven en móvil y controles de responsable/fechas accesibles; estados EmptyState para vacío/sin resultados/error/sin permiso. Cabecera, filtros y registros comerciales están traducidos en es/en/fr/pt; los textos históricos internos de algunos cuerpos siguen pendientes de unificación. Se conserva el contexto completo del cliente y do_not_call para acciones rápidas.

El rango usa [desde 00:00, hasta+1 00:00) en la zona de la organización: incluye 23:59:59.999999 y respeta días de 23/25 horas. WhatsApp agrupa y pagina por la zona leída por el servidor, sin fijar Bogotá. Hoy/Ayer usan el día calendario anterior, con idioma activo. Se retira la persistencia global de filtros; el historial se desmonta al cambiar de organización/entidad. El catálogo común de permisos/pipelines/responsables se separa por organización y descarta respuestas obsoletas; invalidarlo actualiza consumidores montados. Un fallo de lectura no se presenta como catálogo vacío, salvo el 403 esperado de pipelines sin permiso.

«Ver folio» llega a la ruta real `/app/pms/folios?reservation=…&folio=…`. El lector canónico usa reservations!inner y exige organización y sucursal conjuntamente; GET de detalle también exige la organización activa y propaga errores de items/pagos. Solo abre un folio previamente leído de esa organización y reserva. Cambiar organización/sucursal/URL descarta respuestas anteriores y desmonta el diálogo. No se añaden escrituras financieras nuevas ni otra implementación de cobros.

Gates del bloque: 988 suites y 17.531 pruebas aprobadas, una suite/ocho casos omitidos existentes, cero fallas. TypeScript completo 0 con heap de 12 GiB; lint de archivos tocados 0 errores/avisos; diff limpio. Build completo 0, compilación 4,5 minutos y 357 páginas, con tipos/lint separados como CI. Advertencias conocidas de swcMinify/runtime/parche del lockfile por DNS; lockfile intacto. Pruebas recorren 1.060 entradas mezcladas en páginas de siete, sin pérdidas/duplicados, y verifican rango al último microsegundo, día de 25 horas, agrupación WhatsApp Madrid/Bogotá, respuestas tardías de folios/catálogos y traducciones reales en cuatro idiomas. La prueba de idiomas encontró una inserción fuera del namespace; se corrigió y se volvió a ejecutar la suite completa con cero fallas. Los cuatro JSON conservan íntegros sus namespaces previos.

API sobre build real: 200 private/no-store para administrador, tres registros en páginas de una sin duplicados, dos folios y montos decimales exactos; rango exclusivo devuelve la reserva. 401 sin sesión, 403 organización ajena y 400 fecha/cursor inválidos. Fixtures sintéticos retirados con guardas de id/org/marcador, así como sus notificaciones: clientes/historial/folios/avisos restantes cero. Pruebas SQL con cargos quedaron en ROLLBACK; no se enviaron correos ni llamadas.

Navegador abierto inmediatamente al iniciar el servidor: tras hidratar vuelve a `/`, sin ficha del fixture, overlay ni desbordamiento. Persiste la limitación del entorno de lecturas Supabase; no se acredita E2E visual de la ficha ni del diálogo de folio. Navegador/servidor cerrados. Continúan reuniones atómicas, conexiones desde documentos/chat/GO Assistant, las áreas nuevas y limpieza restantes; este checkpoint no completa las 135 pantallas. Sin merge ni despliegue.


### 55. Reuniones atómicas y contacto solo realizado — 2026-10-02

Crear o editar una reunión pasa por `fn_crm_guardar_reunion`: calendario, actividad y vínculo se guardan en la misma transacción. Actor de `auth.uid()`, pertenencia activa y permisos canónicos en servidor; el autor puede editar su reunión y el administrador con `crm.activities.edit_any` puede editar las de otros. Entidades, responsables y actividad vinculada se comprueban dentro de la organización. Sesión ausente conserva 401; organización ajena 403; UUID, campos, fechas o rangos inválidos 400. No acepta una organización ni actor impuestos por el body.

La acción rápida conserva una clave de idempotencia durante reintentos. Dos creaciones simultáneas con el mismo contenido producen un único evento y actividad; reutilizar la clave con otro contenido devuelve 409. Editar fechas parciales valida el rango resultante. No permite completar una reunión futura ni mover al futuro una ya completada. Historial y calendario mantienen título, lugar, descripción, fechas y estado sincronizados. Una reunión programada no actualiza el último contacto; al realizarla, cliente y oportunidad reciben la hora real de finalización sin retroceder un contacto posterior.

La entrada compartida del historial usa zona de organización, mensajes es/en/fr/pt y `pedirCrm`; muestra errores de permisos sin éxito optimista, permite cancelar una reunión futura y explica por qué aún no puede completarse. La comprobación de zona única elimina la excepción antigua de meetingsService. El contrato de rutas verifica el helper compartido que conserva el código/status de sesión.

Migración aplicada `20261001234746`, archivo `20261001233500_crm_reuniones_atomicas.sql`, MD5 `1c89f550a34ba5100ae0a70aaa5f1348`; rollback MD5 `1ecd184b481e728fcf35ec94f0529e91`. SQL exacto contrastado con schema_migrations por MCP; 50 migraciones propias. Aplicación y rollback dobles en BEGIN/ROLLBACK, restauración exacta de función/ACL previas, propietario/administrador/miembro inactivo, referencias ajenas, idempotencia y fallo tardío con reversión de todas las escrituras comprobados. La función SECURITY DEFINER con EXECUTE authenticated genera el aviso esperado 0029 del asesor: sesión, pertenencia, organización y permiso se comprueban dentro de la función; sin EXECUTE anon/PUBLIC/service_role. No se amplía una allow-list de seguridad.

Gates: 990 suites / 17.565 pruebas aprobadas, una suite y ocho casos omitidos existentes, cero fallas; TypeScript completo y lint de archivos tocados sin errores; diff limpio. Build de producción completo con 357 páginas y salida 0; tipos/lint por separado como CI. API sobre ese build: 401 sin sesión, 403 org ajena, 400 fecha imposible/rango/completar futura, dos POST concurrentes 201 con mismo evento/actividad, 409 contenido distinto, PATCH realizada 200 e historial 200 con datos y estado exactos. SQL confirma un evento, una actividad realizada y contacto real no futuro. Fixtures retirados con guardas; cliente, evento y actividad restantes cero. No se enviaron correos ni llamadas.

Navegador abierto inmediatamente tras iniciar el servidor: tras hidratar redirige a `/` y muestra «Entering your organization». Persiste la limitación de lecturas Supabase del entorno; no se acredita E2E visual. Continúan la reparación auditada de cuatro contactos futuros anteriores, las conexiones comerciales, las áreas nuevas y la limpieza. Este bloque no completa las 135 pantallas. Sin merge ni despliegue.


### 56. Integración de main: invitaciones y servidor de voz — 2026-10-02

Se integra main `650f3173` conservando los avisos al miembro, correo de reunión, etapas y desplazamiento del pipeline recién incorporados. La ruta de reunión envía la invitación usando el evento que devolvió la RPC atómica; `send_invite=false` no envía y un fallo de guardado no intenta notificar. La acción rápida conserva su clave de reintento junto con los nuevos mensajes de invitación del diálogo. Contratos prueban el orden RPC → invitación y la supresión de envío. Los contratos de oportunidades conservan el mock de la frontera after() de Next que faltaba en master.

El hotfix de dependencias de Railway queda incorporado también al CRM: resend, zod, libphonenumber-js y sanitize-html en el lockfile propio. Además se copian los archivos compartidos de Ley 2300/RNE en la imagen de esta rama: su grafo llega fuera de src/lib. Un guardarraíl nuevo comprueba todos los archivos locales alcanzados contra los COPY del Dockerfile, además del cierre npm y la exclusión de React/Next. Instalación de producción aislada, mismo lockfile y disposición final de archivos, Node 20.20.2 y /health HTTP 200; sin node_modules de Next, llamadas ni correos a proveedores.

Gates integrados: 993 suites / 17.587 pruebas pasan, una suite/ocho casos omitidos existentes; 84 contratos focalizados y nueve pruebas del Docker/dependencias pasan. Lint de archivos tocados limpio; TypeScript completo 0 errores; build completo de producción, 357 páginas, salida 0, tipos/lint separados como CI. El runner Jest advierte de un worker con teardown pendiente; no se acredita ausencia de timers globales. Persisten las advertencias conocidas de SWC/runtime y parche del lockfile por DNS. El PR #295 contiene el hotfix pequeño contra master y su prueba de arranque, sin merge ni redeploy. No se vuelve a atribuir el fallo de Railway al PR #280, que sigue abierto. La integración no añade migraciones propias; siguen 50. Continúan la reparación auditada de contactos futuros y los módulos pendientes del plan; no se declaran completas las 135 pantallas.


### 57. Reparación auditada de contactos futuros anteriores — 2026-10-02

Cuatro registros de org 125 tenían last_contact_at en el futuro, coincidente exactamente con una actividad de reunión scheduled: dos clientes y sus dos oportunidades. Se corrigen exclusivamente filas con esa evidencia. El último contacto se reconstruye desde actividades propias (directas o de oportunidades del cliente) y llamadas completadas sin respuesta de máquina, siempre con fechas finitas no futuras; reuniones solo realizadas. Cuando no existe evidencia anterior queda NULL, sin inventar ahora como contacto. Resultado: un cliente y una oportunidad recuperan contacto previo; los otros dos quedan sin contacto. Globalmente quedan cero clientes y cero oportunidades con fecha futura en la verificación inmediata.

El respaldo crm_contact_time_repairs conserva organización, entidad, fecha y canal/resultado anteriores y reparados, sin nombres ni contenido de mensajes. RLS habilitado y sin grants a PUBLIC, anon, authenticated o service_role; no se publica API ni policies de lectura. La prueba real bajo authenticated confirma acceso denegado. El asesor informa el INFO esperado [0008, RLS sin policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): es un respaldo deliberadamente cerrado para mantenimiento, no una tabla abierta. Rendimiento no señala esta tabla.

Migración aplicada 20261002002649, archivo 20261002002500_crm_contactos_futuros_reparacion.sql, MD5 cd6fc159d0d774b80017fbfd096272a5; rollback MD5 16010863ad215b3dce34bd001a34e7a3. SQL exacto contrastado con schema_migrations por MCP; 51 migraciones propias. Aplicación doble y rollback doble dentro de BEGIN/ROLLBACK pasan; las fechas/canales/resultados originales se restauran exactamente y el respaldo se retira. Si después de reparar llega un contacto nuevo, el rollback rechaza con 40001 y conserva el contacto y respaldo. Se bloquean filas en orden oportunidad → cliente, igual que el trigger de contacto. No se modifican reuniones, oportunidades comerciales, importes ni consentimiento; auditoría y updated_at conservan la corrección/reversión.

Cambio solo SQL/documentación: se conservan los gates completos verdes de fase 56 y se verifica diff limpio; no se repite el build de Next por el respaldo. Las simulaciones revierten sus cambios y no dejan fixtures. Se mantienen los cuatro respaldos reales privados. No se enviaron correos ni llamadas. La prevención de contactos de reuniones depende de que los emisores usen el runtime actualizado; sigue pendiente retirar las escrituras Node separadas de contacto general/llamadas y completar el agendado atómico de voz. Sin merge ni redeploy.
