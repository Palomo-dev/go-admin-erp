# FASE 09 — Ficha 360 y UX del vendedor: timeline unificado, acciones rápidas, drawer y detalle, Kanban unificado

> Fecha: 2026-09-08 · Estado: **reescrito V4** (sustituye al V3 completo; el V3 "tabs financieros/documentos" queda cubierto por lo ya existente: `documents` + bucket `crm-documents` existen, `crmFinanceService` no es de esta fase)
> Proyecto Supabase: `jgmgphmzusbluqhuqihj`
> Depende de: **F0** (`activities.call_id/email_message_id/message_id/conversation_id`, CHECK `activity_type` ampliado a `call|email|whatsapp|sms|meeting|visit|note|system|ai_call|task`, `messages.related_opportunity_id`, trigger `trg_calls_completed_activity`), **F3** (`SoftphoneProvider` en `src/app/app/layout.tsx`, `CallButton`, `CallPlayer`), **F4** (`CallTranscriptPanel`, `CallAnalysisPanel`), **F7** (`ComposeEmailDialog`, `email_events`), **F16** (`ComposeWhatsAppDialog`), **F6** (`voice_agent_calls` + `AIAgentDialog`).
> Bloquea: F10 (propuesta desde la ficha), F11 (post-venta usa el timeline), F17 (nav y configuración).
> Esfuerzo: **XL** · Valor: **muy alto** (es la superficie donde el vendedor vive; sin esto nada de F3-F7 se ve).

---

## 0. Objetivo y alcance

Al terminar, en una org de prueba con F0-F7 desplegadas:

1. Desde la **tarjeta del Kanban** (hover), el **drawer** y el **detalle** de la oportunidad, y desde `clientes/[id]`, la misma `QuickActionsBar` permite Llamar (navegador | mi celular | agente IA), Email, WhatsApp, Reunión, Tarea y Nota; ningún botón apunta a rutas inexistentes (B1, B2) y el clic en la barra nunca abre el drawer ni inicia drag (B17).
2. Existe **un solo** timeline (`OpportunityTimeline`) consumidor de `GET /api/crm/timeline/[type]/[id]`, con cursor estable, filtros por tipo/canal/usuario/fecha, agrupación por día, "cargar más" y realtime: toda interacción (llamada, email, WhatsApp, llamada IA, tarea, nota, reunión, cambio de etapa) aparece en ≤ 2 s sin recargar. Sustituye los tres timelines actuales (B6).
3. Cada entrada se renderiza con su tarjeta: `CallEntry` (player + transcripción + análisis colapsables), `EmailEntry` (estado con eventos abierto/clic/rebote, preview HTML sanitizado, responder), `WhatsAppEntry` (últimas N burbujas + "responder aquí"), `AiCallEntry`, `TaskEntry`, `NoteEntry`, `MeetingEntry`, `SystemEntry`.
4. `OpportunityDrawer` pasa de 1013 L sin tabs a un shell ≤ 250 L con header sticky y tabs Resumen | Actividad | Tareas | Notas | Documentos | IA; `OpportunityDetail` (1330 L) reutiliza los mismos módulos; se elimina la tormenta de 7 queries por mutación (B14) con `useOpportunityData` de refetch granular.
5. El Kanban vivo tiene gates (`evaluateStageGate` + `GateWarningDialog`), realtime (`realtimeService`), `WonCloseModal`/`StructuredLossDialog` y tarjeta `OpportunityCardV2` (avatar, temperatura, próxima acción/vencido, última interacción con icono de canal); `KanbanBoard`/`KanbanColumn`/`OpportunityCard` muertos se eliminan (B4, B5).
6. `ActivityActions.tsx` (844 L) desaparece: sus cuatro diálogos viven en `ComposeEmailDialog` (F7), `ComposeWhatsAppDialog` (F16), `CallDialog` (F3/F5) y `MeetingDialog` (esta fase, con server action `/api/crm/meetings`).
7. Ninguna interacción se registra dos veces: la actividad la crea el servidor (`emailService`, trigger de llamadas, `/api/crm/activities`, `/api/crm/meetings`); el cliente nunca inserta en `activities` (B9, B11).
8. Accesible (roles, foco atrapado en el drawer, atajos), responsive (drawer full-screen en móvil) y funcional en PWA/Capacitor/Electron.

**No incluye:** editor de email (F7), envío WhatsApp masivo (F16), configuración de agentes (F6), tab financiero (V3 §0.1 se pospone a F10/F11: `invoice_sales`, `payments` ya existen y se muestran en `clientes/[id]` tab "finanzas"), nav global y páginas nuevas de configuración (F17), documentos (ya existen `documents` + `DocumentUploader`).

---

## 1. Estado actual verificado

> **Ronda 3 (2026-09-09, agente F9)**: correcciones del informe `TEST-F9-r2.md` (F9-30…F9-44). La tabla refleja el estado **después** de la ronda 3; §13, §13 bis y §13 ter tienen el detalle por ronda.
>
> **Decisión de arquitectura (F9-01/F9-31), corregida en la ronda 3**: la fuente de verdad de "ganada/perdida" son `stages.is_won` / `stages.is_lost` (explícitas y configurables). `stages.probability` es **solo informativa**. La invariante la garantiza ahora **la base de datos**, no un correctivo en memoria: `fn_sync_status_from_stage` (verificado en `pg_proc` el 2026-09-09) deriva `status` de `is_won`/`is_lost`, **nunca** escribe `closed_at` y **no marca un desenlace terminal sin datos de cierre** — sin `win_data` no cierra como ganada, sin motivo no cierra como perdida, y deja la oportunidad **abierta sobre la etapa terminal**, que es un estado recuperable que la interfaz resuelve exigiendo el modal. Se hizo en la BD porque hay tres rutas vivas que escriben `stage_id` sin `status` (`callAnalysisService.ts:762`, `opportunitiesService.ts:450`, `voiceAgentTools.ts:66`) y por cualquiera de ellas habría vuelto el cierre vacío con su comisión devengada. `reconcileStatus` (ahora en `opportunityStageReconcile.ts`) queda como **red de seguridad**, con guarda optimista y sin revertir cierres ajenos legítimos.

| Componente / archivo | Estado | Situación tras la ronda 1 |
|---|---|---|
| `src/lib/services/crm/timelineService.ts` (172 L) + `timeline/{types,timestamps,cursor,sources,whatsappSource,assemble}.ts` (289/58/140/249/138/296 L) | ✅ | Timeline v2 con 8 fuentes (`activities`, `tasks`, `notes`, `calls`, `email_messages`, `messages` agrupado por conversación/día, `voice_agent_calls`, `opportunity_stage_history`), dedupe por `activities.call_id/email_message_id/message_id/metadata.stage_history_id` (`timeline/assemble.ts:19`), hidratación por lote ≤ 7 queries con `.in(ids)` (`timeline/assemble.ts:81`). **Ronda 2**: cursor `(occurred_at,id)` **estrictamente** menor en SQL vía `or=(col.lt.X,and(col.eq.X,id.lt.Y),col.is.null)` (`timeline/cursor.ts:46`) — antes `lte` inclusivo truncaba páginas en silencio (F9-02); `col IS NULL` = epoch en el filtro, en el orden (`NULLS LAST`) y en el mapeo (F9-03/F9-10); desempate `id DESC` en **todas** las fuentes (F9-06); se pagina por la misma columna que se muestra (F9-07); `channels` filtra por `activities.channel` (F9-08); los grupos de WhatsApp son indivisibles entre páginas (F9-05) y no incluyen mensajes de otra oportunidad del mismo cliente (F9-09); corte seguro por número de filas crudas + reintento interno hasta `MAX_ROUNDS` para no devolver páginas vacías (`timelineService.ts:100-160`). **Ronda 3**: (a) **F9-30** el filtro de `channels` ya no rompe la paginación — se pasa como predicado a `finish()` y la cola sale de las filas **leídas**, no de las supervivientes (`timeline/cursor.ts:96-120`); antes 31 activities de otro canal por encima devolvían el timeline **vacío**; (b) **F9-32** el cursor conserva los MICROsegundos de `timestamptz` (`timeline/timestamps.ts`, `canonicalTs`): `Date.parse` los truncaba a milisegundos y toda fila del mismo milisegundo con µs menores desaparecía para siempre — la corrección alcanza también al orden y al desempate en memoria (`compareDesc`/`isBefore`); (c) **F9-33** un día de WhatsApp con más de 200 mensajes ya no borra el historial anterior: con cursor se añade una consulta acotada al **inicio** del día del cursor (`whatsappSource.ts:88-95`); (d) **F9-34** una entrada de WhatsApp lleva como mucho `GROUP_CAP = 50` mensajes y declara `truncated`. Sin RPC `fn_crm_timeline` (F9-20 abierto; 12 consultas por página, fijadas por el test T1.9). |
| `src/app/api/crm/timeline/[type]/[id]/route.ts` (92 L) | ✅ | Contrato v2: `kinds/channels/user_id/from/to/limit/cursor` (+ alias v1 `type/channel/user/date_from/date_to`), 400 tipo/kinds/fechas inválidos, 404 entidad ajena (`TimelineEntityNotFoundError`), `{success, data, next_cursor}`, `Cache-Control: no-store`. |
| `src/lib/services/crm/activityService.ts` (185 L) + `POST /api/crm/activities` (41 L) | ✅ | zod con `ACTIVITY_TYPES` de `src/lib/crm/enums.ts`, `assertRelatedBelongsToOrg` (404), 409 por `call_id` duplicado, idempotencia `metadata.client_key`, actualiza `opportunities.last_contact_at/contact_channel/contact_result` para tipos de contacto. **Ronda 2**: `call_id`/`email_message_id`/`message_id`/`conversation_id` se validan contra la organización (`assertRefsBelongToOrg`, F9-16) y un `occurred_at` futuro (>5 min de desfase de reloj) se rechaza en zod (F9-17). |
| `src/lib/services/crm/meetingsService.ts` (251 L) + `meetingsIcs.ts` (62 L) + `POST /api/crm/meetings`, `PATCH /api/crm/meetings/[id]` | ✅ | `calendar_events` (CHECK real **`confirmed\|tentative\|cancelled`**, corregido en ronda 2) + activity `meeting` con `metadata.event_id`; `updateMeeting` mapea `scheduled|done|canceled` → evento (+ `metadata.completed_at`) y `activities.outcome`. **Ronda 2**: `assigned_to` se valida contra `organization_members` activos (F9-14); si falla la activity se borra el `calendar_events` huérfano (compensación, F9-15); `buildIcs` pliega líneas a 75 octetos sin partir UTF-8 (`foldIcsLine`, F9-28; extraído a `meetingsIcs.ts` en la ronda 3). Envío del `.ics` a la espera de adjuntos de F7. **Ronda 3 (pasada de gemelos)**: los tres UPDATE/DELETE cuyo resultado se ignoraba (compensación del evento huérfano, enlace `metadata.activity_id`, sincronización de la activity) comprueban el error y lo registran. |
| `src/lib/services/crm/opportunityStageService.ts` (216 L) + `opportunityStageReconcile.ts` (96 L) + `opportunityStageData.ts` (30 L) + `stagePermissions.ts` (58 L) + `PATCH /api/crm/opportunities/[id]/stage` (86 L) | ✅ | Único punto de cambio de etapa: gate (`evaluateStageGate`) → 409 `{reason:'gate', gate}`; `is_won/is_lost` sin datos → 409 `needs_won|needs_lost`; `override` registrado en `opportunities.metadata.gate_overrides[]`; datos won/lost persistidos; 404/400 para oportunidad/etapa ajena, otro pipeline o misma etapa. **Ronda 2**: (a) **F9-01** `status`/`closed_at` los dicta `is_won/is_lost`; tras el UPDATE se relee y se corrige lo que haya escrito `fn_sync_status_from_stage` (`reconcileStatus`) y nunca queda `closed_at` sin `loss_reason`/`win_data`; (b) **F9-11** `override` exige `requireOrgAdmin` en la ruta (403); (c) **F9-12** `won_data:{}` / `loss_data:{}` ya no saltan el modal; (d) **F9-13** escritura optimista sobre `updated_at` con un reintento → 409 `conflict`, sin pisar `gate_overrides`; (e) **F9-27** la etapa se resuelve con `pipelines!inner(organization_id)`, no solo por RLS; (f) el override se registra aunque el gate no fuera evaluable (`gate_evaluated:false`). **Ronda 3**: (g) **F9-31** la invariante la garantiza la BD (ver la nota de arriba) y `reconcileStatus` pasa a ser red de seguridad; (h) **F9-35** el UPDATE correctivo lleva la misma guarda optimista `updated_at` que el principal, comprueba su resultado y **no revierte** un cierre ajeno que traiga datos de cierre válidos; (i) **F9-37** `won_data:{}` ya no se salta la guarda `same_stage` (se usa `hasWonData`/`lossLabel`, el mismo criterio que el cierre real), así que no reabre un cierre en silencio; (j) **F9-36** el `override` ya no exige administrador de organización: lo permite la jefatura (`Super Admin`, `Admin de organización`, `Manager`, o `is_super_admin`) según `stagePermissions.canOverrideStageGate`. El criterio anterior dejaba fuera a **35 miembros activos** (verificado por MCP el 2026-09-09), incluido el único perfil comercial que tendría sentido que pudiera saltar un gate. |
| `POST /api/crm/notes` (50 L), `POST /api/crm/tasks` (62 L) | ✅ | Nota rápida (tabla `notes`) y tarea rápida (`related_to_type/id`, `status 'open'`, `priority 'med'`, `assigned_to` usuario, `customer_id` resuelto). `/api/tasks` (PM) no existe en el repo → se creó `/api/crm/tasks`. |
| `src/components/crm/shared/QuickActionsBar.tsx` (233 L) + `quickActionsConfig.ts` (93 L) + `shared/realtimeTables.ts` (nuevo, 52 L) | ✅ | **Ronda 2 (F9-18)**: el motivo de una acción deshabilitada ya se ve (el `<button disabled>` va envuelto en un `<span>` que sí recibe eventos de puntero). Variantes `card|drawer|detail`; Llamar ▾ (navegador vía `useSoftphone` opcional — sin provider no lanza; "mi celular" → `MobileCallDialog` → `POST /api/voice/bridge/initiate`; "Agente IA" deshabilitado con motivo hasta F6), Email, WhatsApp, Reunión, Tarea, Nota; `stopPropagation` en click/mousedown/pointerdown/keydown (B17); diálogos con `next/dynamic` (`ssr:false`). |
| `shared/{ComposeEmailDialog,ComposeWhatsAppDialog,MeetingDialog,QuickTaskDialog,QuickNoteDialog,MobileCallDialog}.tsx` (≤ 168 L) | ✅ | v1 propios de F9: email por `POST /api/email/send` (selector de plantillas si `GET /api/email/templates` responde 200 — B2/B3 corregidos); WhatsApp por el contrato SEC de `POST /api/integrations/whatsapp/send` (`channel_id, to, type:'text', text:{body}, conversation_id?, customer_id?, opportunity_id?`); reunión por `/api/crm/meetings` (B11). F7/F16 pueden sustituirlos conservando las props. |
| `src/components/crm/timeline/OpportunityTimeline.tsx` (168 L), `hooks/useTimeline.ts` (196 L), `TimelineFilters.tsx`, `TimelineEntryCard.tsx`, `utils.ts`, `entries/*` (10 archivos ≤ 151 L) | ✅ | Único timeline (B6): filtros persistidos en `localStorage`, grupos por día (`America/Bogota`, Hoy/Ayer), "Cargar más" + `IntersectionObserver`, realtime (`activities/calls/email_messages/tasks/notes/messages/opportunity_stage_history`) con debounce 400 ms, banner "N nuevas" si el usuario no está arriba, fallback polling 15 s. **Ronda 2**: el modo se reportaba como `polling` con intervalo de 15 s (F9-04/F9-29). **Ronda 3 (F9-38)**: `notes` **sí** está publicada en `supabase_realtime` (verificado por MCP el 2026-09-09) y `realtimeTables.ts` no lo reflejaba, así que el timeline sondeaba cada 15 s sin necesidad; con la lista al día las 7 tablas del timeline están publicadas y el modo real pasa a ser `live`; `refreshToken` fuerza la recarga desde el drawer/el detalle; `CallEntry` monta `entries/CallIntelligenceSections.tsx` (nuevo) con **un solo** `useCallIntelligence` para transcripción + análisis (F9-25). `CallEntry` carga `CallTranscriptPanel`/`CallAnalysisPanel` de F4 con `next/dynamic` (fallback `CallPanels.tsx`) y `CallPlayer` con seek; `EmailEntry` con eventos y `GET /api/email/messages/[id]?events=true` + Responder; `WhatsAppEntry` con responder inline dentro de ventana 24 h (B15 corregido); `AiCallEntry`; `TaskEntry` (toggle done); `MeetingEntry` (realizada/cancelar); `SystemEntry`; `NoteEntry`; `GenericEntry`. |
| `src/components/crm/pipeline/hooks/useOpportunityData.ts` (144 L) | ✅ | Carga granular (oportunidad → cliente + etapas), `refetch` por sección, `patch` optimista. Corrige B12/B13/B14. **Ronda 2 (F9-04)**: `opportunities` **NO** está en la publicación `supabase_realtime`, así que el canal ya no se abre (entraba en SUBSCRIBED sin recibir nada nunca); el refresco lo hace el drawer con `refetch` tras cada mutación. `shared/realtimeTables.ts` centraliza qué tablas están publicadas de verdad. |
| `src/components/crm/pipeline/OpportunityDrawer.tsx` (196 L) + `drawer/DrawerHeader.tsx` (103 L), `drawer/StageSelect.tsx` (84 L), `drawer/tabs/{Resumen,Actividad,Tareas,Notas,Documentos,IA}Tab.tsx` (≤ 161 L) | ✅ | Header sticky con `StageSelect` (gate/won/lost vía `PATCH /stage`), `QuickActionsBar variant="drawer"`, Ganada/Perdida/Editar, link al detalle; 6 tabs con carga por pestaña; conserva `FollowupSection`, `SalesTeamTerritorySelectors`, `ScoringSection`, `DiscoverySection` (+ config), `TasksSection`, `DocumentUploader`, `CustomerEditDialog`, `ClosedWonDialog`, `WonCloseModal`, `StructuredLossDialog`, ficha de handoff y razón de pérdida. **Ronda 2 (F9-04)**: `onMutated` + `refresh-pipeline-data` + `refreshToken` del timeline tras etapa/ganar/perder/nota/tarea/reunión — se recuperó el refresco real que la ronda 1 había eliminado fiándose de un realtime inexistente. |
| `src/components/crm/oportunidades/OpportunityDetail.tsx` (171 L) + `detail/{DetailHeader,DetailSidebar,LineItemsTab,AnalyticsTab,useStageFlow}.tsx` (≤ 121 L) | ✅ | Reusa `ActividadTab/TareasTab/NotasTab/IATab` del drawer; conserva Ganar/Perder/Editar/Duplicar/Eliminar, embudo clicable (ahora vía `PATCH /stage` con gate), Productos/Espacios/Conceptos/Analítica. **Ronda 2 (F9-19)**: `?tab=` se lee al montar y al escribirlo se **conservan** el resto de query params (`goToTab`); tras una acción rápida se refresca el timeline. Sin merge cliente de timeline ni `ActivityActions`. |
| `src/components/crm/pipeline/KanbanBoardV2.tsx` (248 L), `KanbanColumnV2.tsx` (84 L), `OpportunityCardV2.tsx` (134 L), `hooks/useKanbanBoard.ts` (233 L) | ✅ | **Ronda 2**: el chip de la cabecera dice la verdad — `opportunities`/`stages` no están publicadas, así que el modo real es `auto 30 s` (polling + `refresh-pipeline-data`), no "tiempo real" (F9-04); el drawer se monta con `onMutated` que refresca el tablero; soltar en una etapa `is_won` abre `ClosedWonDialog` (datos reales de cierre) antes del PATCH y solo después `WonCloseModal` — se acabó el `won_data:{closed_from:'kanban'}` (F9-12); la barra de acciones oculta lleva `pointer-events-none` (F9-23). **Ronda 3**: (a) **F9-39** el evento `refresh-pipeline-data` está amortiguado 400 ms (`REFRESH_DEBOUNCE_MS`), así que una ráfaga de acciones desde el drawer cuesta una recarga y no dos consultas del pipeline por evento; (b) **F9-41** la gestión de etapas ya **no** escribe `stages` desde el navegador: crear/editar/borrar/reordenar va por `POST|PUT /api/crm/stages` y `PATCH|DELETE /api/crm/stages/[id]`, con comprobación de rol (jefatura) y de pertenencia del pipeline a la organización. Montado en `PipelineView.tsx:129`. Drag con handle separado (B17), gate → `GateWarningDialog`, `is_won` → `WonCloseModal`, `is_lost` → `StructuredLossDialog` (B4), realtime `subscribeToStages/subscribeToOpportunities` con merge por columna y `draggingRef`, optimista con revert, color de columna por `style` (B5), gestión de etapas (crear/editar/borrar/reordenar) portada de `PipelineStages`. Tarjeta: iniciales/avatar, temperatura, `ScoreBadge`, ICP, próxima acción (rojo si vencida), última interacción con icono de canal, pill won/lost, `QuickActionsBar variant="card"` en hover/focus. |
| Borrados | ✅ | `pipeline/{KanbanBoard,KanbanColumn,OpportunityCard,PipelineStages}.tsx`, `pipeline/drawer/ActivityActions.tsx` (B1/B10), `opportunitiesService.{getOpportunityTimeline,getOpportunityActivities,createActivity}` (B9); `pipeline/index.ts` exporta los V2. |
| `src/app/app/crm/clientes/[id]/page.tsx` | ✅ | `QuickActionsBar variant="detail"` bajo el header (`related_type='customer'`) y tab "Actividad" = `OpportunityTimeline entityType="customer"` (incluye WhatsApp de todas sus conversaciones). |
| `src/components/crm/actividades/ActividadesPage.tsx`, `actividades/types.ts` | ✅ | `ActivityActions` → `QuickActionsBar`; `ActivityType` y `ACTIVITY_TYPE_CONFIG` ampliados con `sms|ai_call|task`. |
| `src/lib/services/crm/index.ts:293-300` | ✅ | Exporta `TimelineKind/TimelineQuery/encodeCursor/decodeCursor/TimelineEntityNotFoundError` (antes `TimelineEntryType/TimelineFilters`, inexistentes; hallazgo REG). |
| Tests | ✅ | `src/lib/services/crm/__tests__/{timelineService,activityService,meetingsService,opportunityStageService,f9Routes.smoke}.test.ts`, `src/components/crm/shared/__tests__/quickActionsConfig.test.ts`, `src/components/crm/timeline/__tests__/utils.test.ts`, más el mock fiel de Postgres `__tests__/pgMock.ts` y los 10 casos adversarios `__tests__/timelineAdversarial.test.ts` → **39 suites / 595 tests verdes** con `npx jest src/lib/services/crm src/components/crm` (ronda 2). Sin `@testing-library` instalado → no hay tests de render; se prueba la lógica pura. `f9Routes.smoke.test.ts` audita las 7 rutas por análisis estático (handler exportado, `getServerOrgContext`, `organization_id` nunca del body, sin `@/lib/supabase/config`, `safeParse`, cambio de etapa solo por servicio): no se importan en runtime porque `orgContext` arrastra `svix` (ESM-only) y jest corre en CJS. |
| Base de datos (ronda 3, aplicada por MCP) | ✅ | `fn_sync_status_from_stage` redefinida y backfill de `is_won/is_lost` **aplicados** (rondas anteriores de DB) y verificados en `pg_proc` el 2026-09-09. Migración `crm_v4_f09_stage_write_hardening` (esta ronda): (a) `update_stage_without_triggers` era **SECURITY DEFINER sin `search_path`, con EXECUTE para `anon` y PUBLIC y sin ninguna comprobación de pertenencia** — cualquiera con la clave publicable podía reconfigurar CUALQUIER etapa de CUALQUIER organización saltándose RLS; ahora lleva `search_path`, comprobación de pertenencia + rol y solo `authenticated`/`service_role` pueden ejecutarla; (b) trigger `trg_stages_guard_outcome_flags`: cambiar `is_won`/`is_lost` exige jefatura y una etapa no puede ser ganadora y perdedora a la vez; (c) **F9-43** `fn_log_stage_change` guarda `changed_by = auth.uid()` en vez de `null` literal. Las cuatro reglas se probaron en vivo con `begin; … rollback;` (empleado bloqueado, admin permitido, `anon` sin EXECUTE, autor registrado). |
| Pendiente (otras fases / DB) | 🟡 | Publicar `opportunities` y `stages` en `supabase_realtime` (el tablero sigue en `auto 30 s`; `notes` ya está publicada). RPC `fn_crm_timeline` + índices de paginación (F9-20: hoy son 12 consultas por página, fijadas por el test T1.9). Reparar la **única** oportunidad histórica dañada (`3d9e5b6a-…`, org 2, `status='won'` con `win_data='{}'`; no tiene comisión asociada) — propuesta de reparación en `scratchpad/reports/F9-r3.md`. `AIAgentDialog` (F6) y modo "Agente IA"; invitación `.ics` (adjuntos F7); `MessageBubble` reutilizable en `chat/`. |

---

## 2. Arquitectura y flujo

```
                 ┌─────────────── superficies (mismos módulos) ───────────────┐
                 │ OpportunityCardV2 (hover)  OpportunityDrawer  OpportunityDetail  clientes/[id] │
                 └──────────────┬──────────────────┬───────────────┬────────────────┘
                                ▼                  ▼               ▼
                          QuickActionsBar   OpportunityTimeline   useOpportunityData
                            │ Llamar ──► useSoftphone().makeCall (F3) | POST /api/voice/bridge/initiate (F3) | AIAgentDialog (F6)
                            │ Email  ──► ComposeEmailDialog (F7) ─► POST /api/email/send ─► emailService crea activities(email_message_id)
                            │ WhatsApp ► ComposeWhatsAppDialog (F16) ─► INSERT messages(related_opportunity_id) ─► trg_channel_dispatch
                            │ Reunión ► MeetingDialog ─► POST /api/crm/meetings ─► calendar_events + activities(meeting) [+ ICS Resend]
                            │ Tarea  ──► QuickTaskDialog ─► POST /api/crm/tasks (F9; /api/tasks de PM no existe) con related_to_*
                            │ Nota   ──► QuickNoteDialog ─► POST /api/crm/notes (tabla notes; la activity la crea el timeline)
                            ▼
      BD: activities / calls / email_messages(+email_events) / messages / voice_agent_calls / tasks / notes / opportunity_stage_history
                            │ postgres_changes (canal timeline:{type}:{id})            │ 8 consultas TS + cursor (fn_crm_timeline NO existe)
                            ▼                                                          ▼
                    useTimeline(type,id,filters) ── debounce 400 ms ──► GET /api/crm/timeline/[type]/[id]?cursor=… ──► timelineService v2
                            │                                                          (RPC + hidratación por lote: calls→transcript/analysis, emails→events, messages→burbujas)
                            ▼
                    OpportunityTimeline ─► agrupa por día ─► TimelineEntryCard ─► CallEntry | EmailEntry | WhatsAppEntry | AiCallEntry | TaskEntry | NoteEntry | MeetingEntry | SystemEntry
```

**Regla de una sola fuente de verdad por interacción:** la fila de `activities` es la entrada canónica de llamadas (`call_id`), emails (`email_message_id`), llamadas IA (`activity_type='ai_call'`, `call_id`), reuniones (`meeting`) y notas (`note`). WhatsApp no genera `activities` (volumen): el timeline agrupa `messages` por `conversation_id` y día. Tareas, cambios de etapa y llamadas en curso (sin actividad aún) vienen de sus tablas. Así no hay duplicados aunque `calls` y `activities` emitan ambos.

**Secuencia "email abierto por el cliente" (sin recarga):**

```
Cliente abre el correo ─► Resend webhook (F7) ─► /api/email/webhooks/resend (svix) ─► UPDATE email_messages.status='opened', open_count+1
   ─► INSERT email_events(opened) ─► postgres_changes(email_messages UPDATE, related_id=eq.{opp}) ─► useTimeline.bump()
   ─► GET timeline página 1 ─► mergeEntries (misma key email:{id}) ─► EmailEntry re-render: badge "Abierto 1×" + fila de evento
```

**Secuencia "llamada del agente IA" (F6 produce, F9 muestra):**

```
AIAgentDialog ─► POST /api/crm/voice-agents/[id]/call ─► voice_agent_calls(pending) ─► Twilio ─► ws-server ─► tools (move_stage → PATCH /stage con gate; create_task)
   ─► status callback ─► voice_agent_calls(completed, outcome, conversation_log) + calls(completed) ─► trg_calls_completed_activity ─► activities(ai_call, call_id)
   ─► realtime activities INSERT ─► AiCallEntry (hidrata voice_agent_calls + voice_agent_tool_runs por call_id) ; si movió etapa → SystemEntry aparte
```

**Máquina de estados del drawer:** `closed` → `opening` (skeleton header, `useOpportunityData` carga `opportunity`+`customer` en 1 query con `select` anidado) → `ready` (tab activa carga perezosa) → `mutating` (acción; solo refetch de la parte afectada) → `closed`. Cambio de etapa desde el header: `pending_gate` → `gate_warning` | `won_modal` | `lost_dialog` | `applied`.

**Máquina de estados del Kanban drag:** `idle` → `dragging` → `dropped` → (`is_won` → `won_modal`) | (`is_lost` → `lost_dialog`) | (`gate.ok=false` → `gate_warning` → confirmar/cancelar) | `updating` (optimista, revert en error) → `idle`. Realtime `UPDATE` de otra sesión → merge sin pisar el drag en curso.

---

## 3. Base de datos

### 3.1 Migraciones

#### `202609_crm_v4_f09_timeline_indexes`

```sql
CREATE INDEX IF NOT EXISTS idx_activities_org_related_occurred
  ON activities (organization_id, related_type, related_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_activities_call ON activities (call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_email ON activities (email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_org_related_created
  ON notes (organization_id, related_type, related_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_org_related
  ON tasks (organization_id, related_to_type, related_to_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_org_related
  ON email_messages (organization_id, related_type, related_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_org_opportunity
  ON messages (organization_id, related_opportunity_id, created_at DESC) WHERE related_opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osh_org_opp
  ON opportunity_stage_history (organization_id, opportunity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vacalls_org_opp
  ON voice_agent_calls (organization_id, opportunity_id, started_at DESC) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_org_opp_started ON calls (organization_id, opportunity_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_org_customer ON conversations (organization_id, customer_id, last_message_at DESC);
```

#### `202609_crm_v4_f09_fn_crm_timeline`

Una sola consulta con `UNION ALL`, orden y cursor `(occurred_at, id)` en SQL. `SECURITY INVOKER` para que apliquen las RLS de cada tabla al usuario de sesión; el `p_org_id` es un filtro adicional, no la barrera.

```sql
CREATE OR REPLACE FUNCTION fn_crm_timeline(
  p_org_id integer, p_entity_type text, p_entity_id uuid,
  p_kinds text[] DEFAULT NULL, p_channels text[] DEFAULT NULL, p_user_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_cursor_at timestamptz DEFAULT NULL, p_cursor_id uuid DEFAULT NULL, p_limit integer DEFAULT 30
) RETURNS TABLE (kind text, id uuid, occurred_at timestamptz, user_id uuid, ref jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH cust AS (SELECT customer_id FROM opportunities WHERE id = p_entity_id AND p_entity_type = 'opportunity'),
u AS (
  SELECT CASE a.activity_type WHEN 'call' THEN 'call' WHEN 'email' THEN 'email' WHEN 'ai_call' THEN 'ai_call'
              WHEN 'meeting' THEN 'meeting' WHEN 'note' THEN 'note' WHEN 'sms' THEN 'sms' ELSE 'activity' END AS kind,
         a.id, a.occurred_at, a.user_id,
         jsonb_build_object('activity_id', a.id, 'call_id', a.call_id, 'email_message_id', a.email_message_id,
           'channel', a.channel, 'outcome', a.outcome, 'duration_seconds', a.duration_seconds, 'notes', a.notes, 'metadata', a.metadata) AS ref
  FROM activities a WHERE a.organization_id = p_org_id AND a.related_type = p_entity_type AND a.related_id = p_entity_id
  UNION ALL
  SELECT 'task', t.id, COALESCE(t.completed_at, t.created_at), t.assigned_to,
         jsonb_build_object('title', t.title, 'status', t.status, 'priority', t.priority, 'due_date', t.due_date)
  FROM tasks t WHERE t.organization_id = p_org_id AND t.related_to_type = p_entity_type AND t.related_to_id = p_entity_id
  UNION ALL
  SELECT 'system', h.id, h.changed_at, h.changed_by,
         jsonb_build_object('from_stage_id', h.from_stage_id, 'to_stage_id', h.to_stage_id)
  FROM opportunity_stage_history h WHERE p_entity_type = 'opportunity' AND h.organization_id = p_org_id AND h.opportunity_id = p_entity_id
  UNION ALL
  SELECT 'call_live', c.id, c.started_at, c.user_id, jsonb_build_object('call_id', c.id, 'status', c.status, 'direction', c.direction)
  FROM calls c WHERE c.organization_id = p_org_id AND c.status IN ('dialing','ringing','in_progress')
    AND ((p_entity_type = 'opportunity' AND c.opportunity_id = p_entity_id) OR (p_entity_type = 'customer' AND c.customer_id = p_entity_id))
  UNION ALL
  SELECT 'whatsapp', (array_agg(m.id ORDER BY m.created_at DESC))[1], max(m.created_at), NULL::uuid,
         jsonb_build_object('conversation_id', m.conversation_id, 'day', date_trunc('day', max(m.created_at)), 'count', count(*))
  FROM messages m WHERE m.organization_id = p_org_id
    AND ((p_entity_type = 'opportunity' AND m.related_opportunity_id = p_entity_id)
      OR (p_entity_type = 'customer' AND m.conversation_id IN (SELECT id FROM conversations WHERE customer_id = p_entity_id)))
  GROUP BY m.conversation_id, date_trunc('day', m.created_at)
)
SELECT u.kind, u.id, u.occurred_at, u.user_id, u.ref FROM u
WHERE (p_kinds IS NULL OR u.kind = ANY (p_kinds))
  AND (p_user_id IS NULL OR u.user_id = p_user_id)
  AND (p_from IS NULL OR u.occurred_at >= p_from) AND (p_to IS NULL OR u.occurred_at <= p_to)
  AND (p_channels IS NULL OR u.ref->>'channel' = ANY (p_channels) OR u.kind = ANY (p_channels))
  AND (p_cursor_at IS NULL OR u.occurred_at < p_cursor_at OR (u.occurred_at = p_cursor_at AND u.id < p_cursor_id))
ORDER BY u.occurred_at DESC, u.id DESC
LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;
REVOKE ALL ON FUNCTION fn_crm_timeline FROM public;
GRANT EXECUTE ON FUNCTION fn_crm_timeline(integer, text, uuid, text[], text[], uuid, timestamptz, timestamptz, timestamptz, uuid, integer) TO authenticated;
```

`voice_agent_calls` entra vía su `activities` (`activity_type='ai_call'`, creada por F6 al completar) y se hidrata en TS por `call_id`; no se une aquí para no duplicar. `notes` (tabla) entra como `kind='note'` solo si F0 decide migrar `notes` → `activities(note)`; si no, se añade una rama `UNION ALL` sobre `notes` idéntica a la de tasks (decisión en 11).

#### `202609_crm_v4_f09_realtime_publication`

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE calls; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='email_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE email_messages; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='opportunity_stage_history') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE opportunity_stage_history; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='opportunities') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE opportunities; END IF;
END $$;
```

(`activities` la añade F4; `tasks` y `messages` ya están.) `opportunities` es necesaria para que `subscribeToOpportunities` (`realtimeService.ts:240`) reciba eventos en el Kanban.

#### Vista `crm_timeline_v` (opcional): **no se crea**. Una vista no acepta parámetros de cursor y obligaría a filtrar en cliente; la función cubre el caso y hereda RLS.

### 3.2 Seeds

Ninguno. Para la org de prueba se generan datos con el E2E de 9.3.

### 3.3 Verificación post-migración

```sql
SELECT proname, prosecdef FROM pg_proc WHERE proname='fn_crm_timeline';           -- 1 fila, prosecdef=false
SELECT count(*) FROM pg_indexes WHERE indexname IN ('idx_activities_org_related_occurred','idx_messages_org_opportunity','idx_osh_org_opp','idx_vacalls_org_opp','idx_email_messages_org_related'); -- 5
SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename IN ('calls','email_messages','opportunity_stage_history','opportunities','activities','tasks','messages'); -- 7
-- Cursor estable: dos páginas consecutivas no comparten ids
SELECT * FROM fn_crm_timeline(7,'opportunity','<uuid>',NULL,NULL,NULL,NULL,NULL,NULL,NULL,5);
EXPLAIN (ANALYZE) SELECT * FROM fn_crm_timeline(7,'opportunity','<uuid>',NULL,NULL,NULL,NULL,NULL,NULL,NULL,30); -- Index Scan en activities/tasks/osh, < 20 ms
```

### 3.4 Impacto en tablas existentes

- `activities`: pasa a ser la fila canónica por interacción; `notes` de llamadas ya no llevan "Duración: 120s" (van a `duration_seconds`).
- `calendar_events`: reuniones creadas por `/api/crm/meetings` con `event_type='meeting'`, `customer_id`, `metadata{opportunity_id, activity_id}`.
- Se deja de usar: `opportunitiesService.getOpportunityActivities/createActivity` (`:200-210`, `:571-594`), merge de timeline en `OpportunityDetail.tsx:919-922` y `opportunitiesService.ts:959-972`, evento `refresh-pipeline-data`.

---

## 4. Backend

### 4.1 Endpoints

| Método | Ruta | Auth | Query / body | Respuesta | Errores | Idempotencia |
|---|---|---|---|---|---|---|
| GET | `/api/crm/timeline/[type]/[id]` (existe, contrato v2) | sesión | `?kinds=call,email,whatsapp,ai_call,task,note,meeting,system,sms,activity&channels=phone,voice_ai,email,whatsapp&user_id=&from=&to=&limit=30&cursor=<base64 occurred_at|id>` | `{success, data: TimelineEntry[], next_cursor: string|null}` | 400 type inválido; 404 entidad no es de la org | — |
| GET | `/api/crm/timeline/[type]/[id]/entry/[kind]/[entryId]` **NUEVO** | sesión | — | `TimelineEntry` hidratada (para refrescar una sola entrada al llegar realtime) | 404 | — |
| POST | `/api/crm/activities` **NUEVO** | sesión | `{ activity_type: 'note'|'visit'|'sms'|'system'|'meeting'|'call'|'email'|'whatsapp'; related_type:'opportunity'|'customer'; related_id: uuid; notes?: string; channel?: string; outcome?: string; duration_seconds?: number; occurred_at?: string; metadata?: object; call_id?: uuid }` | `201 {success, data: Activity}` | 400 zod; 404 related no es de la org; 409 si `call_id` ya tiene actividad | `metadata.client_key` opcional: si existe, devuelve la existente |
| GET | `/api/crm/activities` (existe en módulo actividades: `ActividadesService.ts`) | sesión | filtros actuales | — | — | — |
| POST | `/api/crm/meetings` **NUEVO** | sesión | `{ title; start_at; end_at; timezone?: string (default org); location?: string; description?: string; customer_id?: uuid; opportunity_id?: uuid; assigned_to?: uuid; attendees?: string[] (emails); send_invite?: boolean }` | `201 {success, data:{ event: CalendarEvent, activity_id, email_message_id? }}` | 400; 409 solapamiento con `calendar_events` del mismo `assigned_to` (advertencia, no bloqueo salvo `strict=true`) | `client_key` |
| PATCH | `/api/crm/meetings/[id]` **NUEVO** | sesión | subconjunto + `status: 'scheduled'|'done'|'canceled'` | `{success, data}` | 404 | — |
| POST | `/api/tasks` (existe, PM) | sesión | `related_to_type/related_to_id` | — | — | — |
| PATCH | `/api/crm/opportunities/[id]/stage` **NUEVO** | sesión | `{ stage_id; ignore_gate?: boolean; won_data?: object; loss_data?: LossReasonData }` | `{success, data:{opportunity, gate?: GateResult}}` | 409 `{gate}` si `ok=false` y `!ignore_gate`; 403 `ignore_gate` sin permiso | — |
| GET | `/api/crm/opportunities/[id]` (existe vía `opportunitiesService.getOpportunityById`; se expone como ruta) | sesión | `?include=customer,stage,salesperson,counts` | `OpportunityFull` con `salesperson_id` (fix B12) | 404 | — |

Formato del cursor: `base64url(occurred_at ISO + '|' + id)`. Los tipos:

```ts
export type TimelineKind = 'call'|'call_live'|'email'|'whatsapp'|'sms'|'ai_call'|'task'|'note'|'meeting'|'system'|'activity';
export interface TimelineEntryBase { kind: TimelineKind; id: string; occurred_at: string; user?: { id: string; name: string; avatar_url: string | null } | null }
export type TimelineEntry =
  | (TimelineEntryBase & { kind: 'call'|'call_live'; call: { id; direction; status; mode; duration_seconds; from_number; to_number; recording?: { id; status } };
      activity?: { id; notes; outcome }; transcript?: { id; status }; analysis?: { id; summary; sentiment; quality_score; temperature; suggested_stage_id } })
  | (TimelineEntryBase & { kind: 'email'; email: { id; subject; to_email; status; sent_at; open_count; click_count; body_html_snapshot?: string };
      events: Array<{ event_type; occurred_at }>; activity_id: string })
  | (TimelineEntryBase & { kind: 'whatsapp'; conversation_id: string; count: number; messages: Array<{ id; direction; role; content; content_type; created_at }>; window_open: boolean })
  | (TimelineEntryBase & { kind: 'ai_call'; voice_agent_call: { id; outcome; duration_seconds; turns_count; agent: { id; name } }; tool_runs: Array<{ tool; result; applied_at }>; call_id: string; activity_id: string })
  | (TimelineEntryBase & { kind: 'task'; task: { id; title; status; priority; due_date } })
  | (TimelineEntryBase & { kind: 'note'|'activity'|'meeting'|'sms'; activity: { id; activity_type; notes; channel; outcome; duration_seconds; metadata } ; event?: { id; start_at; end_at; location; status } })
  | (TimelineEntryBase & { kind: 'system'; from_stage: { id; name } | null; to_stage: { id; name } | null });
```

### 4.2 Servicios

**`src/lib/services/crm/timelineService.ts`** (reescritura v2, ≤ 300 L)

```ts
export interface TimelineQuery { kinds?: TimelineKind[]; channels?: string[]; userId?: string; from?: string; to?: string; limit?: number; cursor?: string }
export async function getTimeline(orgId: number, entityType: 'opportunity'|'customer', entityId: string,
  supabase: SupabaseClient, q: TimelineQuery): Promise<{ entries: TimelineEntry[]; next_cursor: string | null }>;
// 1. rpc('fn_crm_timeline', {...})  2. hydrate(rows)  3. cursor = última fila
export async function getTimelineEntry(orgId: number, kind: TimelineKind, id: string, supabase: SupabaseClient): Promise<TimelineEntry | null>;
export function encodeCursor(at: string, id: string): string; export function decodeCursor(c: string): { at: string; id: string } | null;
async function hydrate(rows: RawRow[], orgId: number, supabase: SupabaseClient): Promise<TimelineEntry[]>;
// Por lote y por kind: calls (+call_recordings, call_transcripts.status, call_analyses última), email_messages (+email_events últimas 10),
// messages (últimas 5 por conversation_id/día), voice_agent_calls (+voice_agent_tool_runs), calendar_events (por activity.metadata.event_id),
// stages (from/to), profiles (user_id → name, avatar_url). Máximo 8 queries por página, todas con .in('id', ids) y organization_id.
```

**`src/lib/services/crm/activityService.ts`** (NUEVO, server-only; sustituye a `opportunitiesService.createActivity`)

```ts
export const activityInputSchema = z.object({ activity_type: z.enum(['call','email','whatsapp','sms','meeting','visit','note','system','ai_call','task']),
  related_type: z.enum(['opportunity','customer']), related_id: z.string().uuid(), notes: z.string().max(20000).optional(),
  channel: z.string().optional(), outcome: z.string().optional(), duration_seconds: z.number().int().min(0).optional(),
  occurred_at: z.string().datetime().optional(), metadata: z.record(z.unknown()).optional(), call_id: z.string().uuid().optional() });
export async function createActivity(orgId: number, userId: string, input: z.infer<typeof activityInputSchema>, supabase: SupabaseClient): Promise<Activity>;
// verifica que related_id pertenece a la org; si related_type='opportunity' actualiza opportunities.last_contact_at/contact_channel cuando activity_type ∈ call|email|whatsapp|sms|meeting|visit
export async function assertRelatedBelongsToOrg(orgId: number, type: 'opportunity'|'customer', id: string, supabase: SupabaseClient): Promise<void>;
```

**`src/lib/services/crm/meetingService.ts`** (NUEVO)

```ts
export async function createMeeting(orgId: number, userId: string, input: MeetingInput, supabase: SupabaseClient): Promise<{ event: CalendarEvent; activityId: string; emailMessageId?: string }>;
// 1. INSERT calendar_events {organization_id, title, description, location, start_at, end_at, timezone, assigned_to, customer_id, event_type:'meeting', status:'scheduled', created_by, metadata{opportunity_id}}
// 2. createActivity({activity_type:'meeting', related_type, related_id, occurred_at:start_at, channel:'meeting', metadata{event_id}})
// 3. si send_invite && customer.email: buildIcs(event) → sendEmail (F7 emailService) con attachment invite.ics (method REQUEST) y related_type/id
export async function updateMeeting(orgId: number, id: string, patch: Partial<MeetingInput> & { status?: 'scheduled'|'done'|'canceled' }, supabase: SupabaseClient): Promise<CalendarEvent>;
export function buildIcs(e: { uid: string; title: string; description?: string; location?: string; startAt: string; endAt: string; organizerEmail: string; attendees: string[] }): string; // RFC 5545, VTIMEZONE America/Bogota
```

**`src/lib/services/crm/opportunityStageService.ts`** (NUEVO; usado por el endpoint de stage, el Kanban y el drawer)

```ts
export async function changeStage(orgId: number, userId: string, params: { opportunityId: string; stageId: string; ignoreGate?: boolean }, supabase: SupabaseClient):
  Promise<{ ok: true; opportunity: OpportunityFull } | { ok: false; reason: 'gate'; gate: GateResult } | { ok: false; reason: 'needs_won'|'needs_lost' }>;
// evaluateStageGate → si !ok y !ignoreGate → {gate}; si stage.is_won → 'needs_won' (UI abre WonCloseModal); is_lost → 'needs_lost'; si no, UPDATE stage_id (trigger fn_log_stage_change escribe opportunity_stage_history; F8 encola crm_events)
```

**`src/components/crm/pipeline/hooks/useOpportunityData.ts`** (NUEVO, cliente)

```ts
export function useOpportunityData(opportunityId: string | null, opts?: { enabled?: boolean }): {
  opportunity: OpportunityFull | null; customer: CustomerInfo | null; loading: boolean; error: string | null;
  refetch: { opportunity(): Promise<void>; customer(): Promise<void>; all(): Promise<void> };
  patch(partial: Partial<OpportunityFull>): void;   // optimista
};
// 1 query: /api/crm/opportunities/[id]?include=customer,stage,salesperson,counts. Realtime en opportunities filter id=eq.{id} → patch.
```

**`src/components/crm/timeline/hooks/useTimeline.ts`** (NUEVO, cliente)

```ts
export function useTimeline(entityType: 'opportunity'|'customer', entityId: string, filters: TimelineQuery): {
  entries: TimelineEntry[]; groups: Array<{ day: string; entries: TimelineEntry[] }>; loading: boolean; loadingMore: boolean; error: string | null;
  hasMore: boolean; loadMore(): void; refresh(): void; newCount: number; showNew(): void;
};
// Realtime: supabase.channel(`timeline:${entityType}:${entityId}`) con postgres_changes sobre activities (filter related_id=eq.), calls (opportunity_id|customer_id), email_messages (related_id=eq.), messages (related_opportunity_id=eq.), tasks (related_to_id=eq.), opportunity_stage_history (opportunity_id=eq.). Al evento: debounce 400 ms → GET primera página → merge por (kind,id) → entradas nuevas arriba con newCount si el scroll no está arriba.
```

### 4.3 Webhooks / proveedor

Ninguno propio de F9. Consume los de F3 (Twilio status/recording → `calls`), F7 (Resend Svix → `email_events`) y F16 (Meta → `messages`). El timeline solo lee.

### 4.4 Jobs / cola

Ninguno nuevo. `send_invite` de reuniones usa el job `email` de F7 (`outbound_jobs.kind='email'`, payload `{email_message_id}`) para no bloquear la request.

### 4.5 Snippets no obvios

**Cursor estable y merge sin duplicados (cliente)**

```ts
function mergeEntries(prev: TimelineEntry[], next: TimelineEntry[]): TimelineEntry[] {
  const map = new Map(prev.map(e => [`${e.kind}:${e.id}`, e]));
  for (const e of next) map.set(`${e.kind}:${e.id}`, e);          // realtime trae versiones nuevas (p. ej. call → analysis)
  return [...map.values()].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id));
}
export function groupByDay(entries: TimelineEntry[], tz = 'America/Bogota') {
  const fmt = new Intl.DateTimeFormat('es-CO', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const groups = new Map<string, TimelineEntry[]>();
  for (const e of entries) { const d = fmt.format(new Date(e.occurred_at)); (groups.get(d) ?? groups.set(d, []).get(d)!).push(e); }
  return [...groups].map(([day, entries]) => ({ day, entries }));
}
```

**Suscripción realtime del timeline (RLS aplica al canal autenticado)**

```ts
const ch = supabase.channel(`timeline:${entityType}:${entityId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `related_id=eq.${entityId}` }, bump)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `${entityType === 'opportunity' ? 'opportunity_id' : 'customer_id'}=eq.${entityId}` }, bump)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages', filter: `related_id=eq.${entityId}` }, bump)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `related_opportunity_id=eq.${entityId}` }, bump)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `related_to_id=eq.${entityId}` }, bump)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'opportunity_stage_history', filter: `opportunity_id=eq.${entityId}` }, bump)
  .subscribe();
// bump = debounce(400, () => refreshFirstPage()); cleanup: supabase.removeChannel(ch)
```

Para `entityType='customer'` la rama de `messages` usa `conversation_id=in.(...)` con las conversaciones del cliente cargadas al montar.

**Drag sin secuestro del clic (`OpportunityCardV2`)**

```tsx
<Card ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}
  onClick={() => { if (!drag.isDragging) onOpen(opportunity.id); }}
  className="group relative ...">
  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
       onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
    <QuickActionsBar variant="card" opportunityId={opportunity.id} customerId={opportunity.customer_id} customer={opportunity.customer} />
  </div>
</Card>
```

**Gate en el drop (portado de `KanbanBoard.tsx:462-530`)**

```ts
const onDragEnd = async (r: DropResult) => {
  if (!r.destination || r.destination.droppableId === r.source.droppableId) return;
  const res = await fetch(`/api/crm/opportunities/${r.draggableId}/stage`, { method: 'PATCH', body: JSON.stringify({ stage_id: r.destination.droppableId }) }).then(x => x.json());
  if (res.success) return applyOptimistic(r);
  if (res.data?.gate) return setGateWarning({ open: true, missing: res.data.gate.missing.map((m: GateMissing) => m.label), stageName, retry: () => changeStage({ ignore_gate: true }) });
  if (res.reason === 'needs_won') return setWonClose({ open: true, opportunityId: r.draggableId, destStageId: r.destination.droppableId, originalStageId: r.source.droppableId });
  if (res.reason === 'needs_lost') return setLossDialog({ open: true, opportunityId: r.draggableId, destStageId: r.destination.droppableId });
};
```

**Hidratación por lote en `timelineService.hydrate` (máximo 8 queries por página)**

```ts
async function hydrate(rows: RawRow[], orgId: number, supabase: SupabaseClient): Promise<TimelineEntry[]> {
  const ids = (k: string, path: string) => rows.filter(r => r.kind === k).map(r => r.ref[path] ?? r.id).filter(Boolean);
  const callIds = [...ids('call', 'call_id'), ...ids('call_live', 'call_id'), ...ids('ai_call', 'call_id')];
  const [calls, transcripts, analyses, emails, events, waMsgs, vaCalls, stages] = await Promise.all([
    callIds.length ? supabase.from('calls').select('id,direction,status,mode,duration_seconds,from_number,to_number,cost_amount,call_recordings(id,status)').eq('organization_id', orgId).in('id', callIds) : { data: [] },
    callIds.length ? supabase.from('call_transcripts').select('id,call_id,status').eq('organization_id', orgId).in('call_id', callIds) : { data: [] },
    callIds.length ? supabase.from('call_analyses').select('id,call_id,summary,sentiment,quality_score,temperature,suggested_stage_id,created_at').eq('organization_id', orgId).in('call_id', callIds).order('created_at', { ascending: false }) : { data: [] },
    ids('email', 'email_message_id').length ? supabase.from('email_messages').select('id,subject,to_email,status,sent_at,open_count,click_count,body_html_snapshot').eq('organization_id', orgId).in('id', ids('email', 'email_message_id')) : { data: [] },
    ids('email', 'email_message_id').length ? supabase.from('email_events').select('email_message_id,event_type,occurred_at').in('email_message_id', ids('email', 'email_message_id')).order('occurred_at', { ascending: false }).limit(200) : { data: [] },
    rows.some(r => r.kind === 'whatsapp') ? supabase.rpc('fn_last_messages_by_group', { p_org_id: orgId, p_groups: rows.filter(r => r.kind === 'whatsapp').map(r => ({ conversation_id: r.ref.conversation_id, day: r.ref.day })), p_limit: 5 }) : { data: [] },
    ids('ai_call', 'call_id').length ? supabase.from('voice_agent_calls').select('id,call_id,outcome,duration_seconds,turns_count,conversation_log,voice_agents(id,name,purpose_type),voice_agent_tool_runs(tool,result,applied_at)').eq('organization_id', orgId).in('call_id', ids('ai_call', 'call_id')) : { data: [] },
    rows.some(r => r.kind === 'system') ? supabase.from('stages').select('id,name,color').in('id', rows.filter(r => r.kind === 'system').flatMap(r => [r.ref.from_stage_id, r.ref.to_stage_id]).filter(Boolean)) : { data: [] },
  ]);
  const profiles = await loadProfiles(rows.map(r => r.user_id).filter(Boolean), supabase);   // 9.ª query solo si hay user_ids
  return rows.map(r => assemble(r, { calls, transcripts, analyses, emails, events, waMsgs, vaCalls, stages, profiles }));
}
```

`fn_last_messages_by_group` (SQL, ≤ 25 L, `SECURITY INVOKER`): `SELECT … FROM messages m JOIN unnest(p_groups) g ON m.conversation_id = g.conversation_id AND date_trunc('day', m.created_at) = g.day … ORDER BY created_at DESC` con `ROW_NUMBER() ≤ p_limit`. Se incluye en la migración `202609_crm_v4_f09_fn_crm_timeline`.

**Patrón del handler `POST /api/crm/activities`**

```ts
export async function POST(req: NextRequest) {
  try {
    const ctx = await getServerOrgContext();                                  // orgContext.ts:24
    const body = activityInputSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ success: false, error: body.error.flatten() }, { status: 400 });
    const activity = await createActivity(ctx.organizationId, ctx.userId, body.data, ctx.supabase);
    return NextResponse.json({ success: true, data: activity }, { status: 201 });
  } catch (e) {
    if (e instanceof OrgContextError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    if (e instanceof RelatedNotFoundError) return NextResponse.json({ success: false, error: 'Entidad no encontrada' }, { status: 404 });
    if (e instanceof DuplicateActivityError) return NextResponse.json({ success: false, error: 'La llamada ya tiene actividad', data: e.existing }, { status: 409 });
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
```

**`useOpportunityData`: patch optimista + realtime**

```ts
useEffect(() => {
  if (!opportunityId) return;
  const ch = supabase.channel(`opp:${opportunityId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'opportunities', filter: `id=eq.${opportunityId}` },
        (p) => setOpportunity(prev => prev ? { ...prev, ...pickSafe(p.new) } : prev))   // pickSafe: stage_id, amount, status, temperature, next_action, last_contact_at, salesperson_id
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}, [opportunityId]);
const patch = useCallback((partial: Partial<OpportunityFull>) => setOpportunity(prev => prev ? { ...prev, ...partial } : prev), []);
```

**ICS mínimo (`buildIcs`)**

```ts
const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GoAdmin//CRM//ES','METHOD:REQUEST','BEGIN:VEVENT',
  `UID:${uid}@goadmin.io`, `DTSTAMP:${utc(now)}`, `DTSTART:${utc(startAt)}`, `DTEND:${utc(endAt)}`, `SUMMARY:${esc(title)}`,
  description ? `DESCRIPTION:${esc(description)}` : '', location ? `LOCATION:${esc(location)}` : '',
  `ORGANIZER;CN=${esc(orgName)}:mailto:${organizerEmail}`, ...attendees.map(a => `ATTENDEE;RSVP=TRUE:mailto:${a}`),
  'END:VEVENT','END:VCALENDAR'].filter(Boolean).join('\r\n');
// sendEmail(F7) attachments: [{ filename: 'invitacion.ics', content: Buffer.from(ics).toString('base64'), contentType: 'text/calendar; method=REQUEST' }]
```

### 4.6 Variables de entorno

Ninguna nueva. Usa `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` (realtime cliente) y las de F7 para el ICS.

### 4.7 Dependencias npm

| Paquete | Versión | Motivo |
|---|---|---|
| `@testing-library/react` + `@testing-library/jest-dom` + `jest-environment-jsdom` | `^16`, `^6`, `^30` (dev) | Render de `*Entry` con fixtures (hoy `jest.config.js` es `testEnvironment: 'node'`; se usa docblock `@jest-environment jsdom` por archivo). |
| `@hello-pangea/dnd` | `^18.0.1` (existe) | Se mantiene; se retiran usos CRM de `@dnd-kit`/`react-dnd` si los hubiera. |
| `motion` | `^13.1.1` (existe) | Entradas nuevas del timeline. |
| `date-fns` | existe | Agrupación/fechas relativas (`OpportunityDetail.tsx:49-50` ya lo usa). |

---

## 5. UI

### 5.1 Rutas / páginas

| Ruta | Archivo | Cambio |
|---|---|---|
| `/app/crm/pipeline` | `src/components/crm/pipeline/PipelineView.tsx:116-187` | Tab Kanban monta `KanbanBoardV2` en lugar de `PipelineStages`. |
| `/app/crm/oportunidades/[id]` | `src/components/crm/oportunidades/OpportunityDetail.tsx` | Header conserva Ganar/Perder/Editar/Duplicar/Eliminar y embudo; tabs Actividad/Tareas/Notas/Documentos/IA reutilizan los módulos del drawer; Productos/Espacios/Conceptos/Analítica se mantienen. |
| `/app/crm/clientes/[id]` | `src/app/app/crm/clientes/[id]/page.tsx` | `QuickActionsBar variant="detail"` bajo el header; tab "actividades" (:448-496) → `OpportunityTimeline entityType="customer"`. |
| `/app/crm/llamadas`, `/app/crm/leads` en nav | `AppLayout.tsx:127-138` | Lo hace F17 (B8). |

### 5.2 Componentes (todos ≤ 300 L; props TS exactas)

**`src/components/crm/shared/QuickActionsBar.tsx`** (NUEVO, ≤ 220 L)

```ts
export interface QuickActionsBarProps {
  variant: 'card' | 'drawer' | 'detail';
  opportunityId?: string; customerId?: string;
  customer?: { id: string; full_name?: string | null; email?: string | null; phone?: string | null } | null;
  opportunityName?: string;
  actions?: Array<'call'|'email'|'whatsapp'|'meeting'|'task'|'note'>;   // default: todas
  onActionCompleted?: (kind: QuickActionKind, result?: unknown) => void;
  className?: string;
}
```

Estado: `openDialog: 'email'|'whatsapp'|'meeting'|'task'|'note'|'ai'|null`. Hooks: `useSoftphone()` (F3; si el provider no está montado, el botón Llamar solo ofrece "mi celular"), `usePermissions()` (existe en `@/lib/hooks`; oculta acciones sin permiso `crm.call`, `crm.email`, `crm.whatsapp`). Llamar es un `DropdownMenu`: "Desde el navegador" (`makeCall({to, customerId, opportunityId})`, deshabilitado si `deviceState!=='registered'`), "Desde mi celular" (`POST /api/voice/bridge/initiate` con `{to, customerId, opportunityId}`; el teléfono del agente sale de `user_comm_preferences` F3, si falta abre `MobilePhoneDialog`), "Agente IA" (`AIAgentDialog` F6, lazy). Todos los botones con `type="button"` y `stopPropagation` en `onClick/onMouseDown/onPointerDown`. Variante `card`: iconos 28 px con `Tooltip`; `drawer`/`detail`: icono + etiqueta. Diálogos cargados con `next/dynamic` (`ssr:false`).

**`src/components/crm/shared/MeetingDialog.tsx`** (NUEVO, ≤ 240 L): props `{ open; onOpenChange; opportunityId?; customerId?; customer?; onCreated?(event) }`; formulario `title`, fecha/hora inicio-fin (`<Input type="datetime-local">`), duración rápida 30/45/60, ubicación/enlace, descripción, `Switch` "enviar invitación por email" (solo si `customer.email`); `POST /api/crm/meetings`.

**`src/components/crm/shared/NoteQuickDialog.tsx`** (≤ 120 L) y **`TaskQuickDialog.tsx`** (≤ 180 L): `POST /api/crm/activities {activity_type:'note'}` y `POST /api/tasks` (`related_to_type/id`, `assigned_to` default usuario, `status:'open'`, `priority:'med'`).

**`src/components/crm/timeline/OpportunityTimeline.tsx`** (NUEVO, ≤ 280 L)

```ts
export interface OpportunityTimelineProps {
  entityType: 'opportunity' | 'customer'; entityId: string;
  initialFilters?: TimelineQuery; pageSize?: number;      // default 30
  compact?: boolean;                                       // tarjetas colapsadas por defecto (drawer)
  showFilters?: boolean; showComposer?: boolean;           // composer = QuickActionsBar variant 'drawer' arriba
  onEntryAction?: (action: 'reply_email'|'reply_whatsapp'|'open_call'|'apply_analysis', entry: TimelineEntry) => void;
}
```

Usa `useTimeline`; `TimelineFilters` (chips de tipo con contador, `Select` canal, `Select` usuario del equipo, `DateRangePicker` existente en `@/components/ui`); lista `role="feed"`; grupos por día con `<h4>` sticky; botón "Cargar más" al final + `IntersectionObserver`; banner "N entradas nuevas" cuando llegan por realtime y el usuario no está arriba.

**`src/components/crm/timeline/TimelineEntryCard.tsx`** (≤ 120 L): `{ entry: TimelineEntry; compact?: boolean; onAction? }` → icono/color desde `ACTIVITY_TYPE_CONFIG` (`actividades/types.ts:82-138`, ampliado con `ai_call`, `meeting`, `task`, `system`, `sms`), cabecera (avatar usuario, título, hora relativa con `formatDistanceToNow` + tooltip absoluto), cuerpo delegado por `kind` a `entries/*`.

**`src/components/crm/timeline/entries/`** (NUEVOS):

| Archivo | Props | Contenido |
|---|---|---|
| `CallEntry.tsx` (≤ 220 L) | `{ entry: Extract<TimelineEntry,{kind:'call'|'call_live'}>; compact?; onAction? }` | Dirección/estado/duración/outcome; `CallPlayer` (F3/F4 con ref); `Collapsible` "Transcripción" → `CallTranscriptPanel` (F4), "Análisis IA" → `CallAnalysisPanel` (F4); badge sentimiento/temperatura; `call_live` muestra "En curso…" con pulso. |
| `EmailEntry.tsx` (≤ 200 L) | `{ entry: Extract<…,{kind:'email'}> }` | Asunto, destinatario, `Badge` estado (`sent/delivered/opened/clicked/bounced/complained`), fila de eventos (icono + hora) desde `events`, `Collapsible` "Ver correo" → `HtmlContentRenderer` con `body_html_snapshot` (sanitizado, `sandbox` de imágenes con proxy si F7 lo define), botón "Responder" → `ComposeEmailDialog` (F7) con `replyTo`. |
| `WhatsAppEntry.tsx` (≤ 220 L) | `{ entry: Extract<…,{kind:'whatsapp'}> }` | "N mensajes · {día}"; últimas 5 burbujas con estilo de `chat/conversations/id/MessageTimeline.tsx` (extraer `MessageBubble` reutilizable ≤ 80 L); indicador ventana 24 h (`window_open`); "Responder aquí" → `<Textarea>` inline + botón → `POST /api/crm/whatsapp/reply` (F16: inserta `messages` con `direction:'outbound', role:'agent', channel_id, conversation_id, content, related_opportunity_id`) o, fuera de ventana, abre `ComposeWhatsAppDialog` en modo plantilla; enlace "Abrir bandeja" → `/app/chat/conversaciones/{conversation_id}`. |
| `AiCallEntry.tsx` (≤ 180 L) | `{ entry: Extract<…,{kind:'ai_call'}> }` | Agente, propósito, resultado (`outcome`), duración/turnos, `Collapsible` "Conversación" (turnos desde `voice_agent_calls.conversation_log`), lista "Acciones aplicadas" (`voice_agent_tool_runs`), `CallPlayer` si hay grabación. |
| `TaskEntry.tsx` (≤ 100 L) | `{ entry }` | Título, estado con `Checkbox` (PATCH `/api/tasks/[id]` `status:'done'`), prioridad, vence/vencida en rojo. |
| `NoteEntry.tsx` (≤ 80 L) | `{ entry }` | `HtmlContentRenderer` del `notes` (notas del drawer se guardan HTML), "fijar" si aplica. |
| `MeetingEntry.tsx` (≤ 120 L) | `{ entry }` | Título, rango horario, ubicación/enlace, estado, botones "Marcar realizada"/"Cancelar" (PATCH `/api/crm/meetings/[id]`). |
| `SystemEntry.tsx` (≤ 60 L) | `{ entry: Extract<…,{kind:'system'}> }` | "Etapa: {from} → {to}" con colores de etapa, usuario, hora; línea de tiempo discreta. |

**`src/components/crm/pipeline/OpportunityDrawer.tsx`** (reescrito, shell ≤ 250 L)

```ts
export interface OpportunityDrawerProps { open: boolean; onOpenChange(open: boolean): void; opportunityId: string | null;
  onChanged?: (o: OpportunityFull) => void; onClosedWon?: (id: string) => void; onClosedLost?: (id: string) => void; defaultTab?: DrawerTab }
export type DrawerTab = 'resumen'|'actividad'|'tareas'|'notas'|'documentos'|'ia';
```

Props de los módulos del drawer (todos en `src/components/crm/pipeline/drawer/`):

```ts
// DrawerHeader.tsx (≤ 200 L)
export interface DrawerHeaderProps {
  opportunity: OpportunityFull; customer: CustomerInfo | null; stages: Array<{ id: string; name: string; color: string | null; is_won: boolean; is_lost: boolean }>;
  onRename(name: string): Promise<void>; onStageChange(stageId: string): Promise<void>;
  onWon(): void; onLost(): void; onEdit(): void; onActionCompleted(kind: QuickActionKind): void;
}
// StageSelect.tsx (≤ 120 L): <Select> con color por etapa; llama PATCH /api/crm/opportunities/[id]/stage y expone los 3 resultados
export interface StageSelectProps { value: string; stages: DrawerHeaderProps['stages']; disabled?: boolean;
  onResult(r: { ok: true } | { ok: false; reason: 'gate'; gate: GateResult } | { ok: false; reason: 'needs_won' | 'needs_lost' }): void }
// tabs/*.tsx: todas reciben el mismo contrato
export interface DrawerTabProps { opportunity: OpportunityFull; customer: CustomerInfo | null; data: ReturnType<typeof useOpportunityData>; active: boolean }
// IATab.tsx además: { lastAnalyzedCallId: string | null }  (viene de counts.last_analyzed_call_id del GET /api/crm/opportunities/[id])
```

Header sticky (`src/components/crm/pipeline/drawer/DrawerHeader.tsx` ≤ 200 L): nombre editable inline, cliente (link), monto, `StageSelect` (≤ 120 L; `changeStage` → gate/won/lost), `TemperatureDot` (existe), responsable (`Avatar`), `QuickActionsBar variant="drawer"`, botones Ganada/Perdida/Editar. Tabs (`src/components/crm/pipeline/drawer/tabs/`): `ResumenTab` (≤ 250 L: info, cliente + `CustomerEditDialog`, `ScoringSection`, `DiscoverySection`, `FollowupSection`, `SalesTeamTerritorySelectors`, productos/espacios/conceptos como resumen con link al detalle), `ActividadTab` (`OpportunityTimeline compact showComposer`), `TareasTab` (`TasksSection` existente 244 L), `NotasTab` (≤ 160 L, extraído de `:866-934`), `DocumentosTab` (`DocumentUploader`), `IATab` (≤ 220 L: `next_action` de `/api/crm/ia/next-action`, resumen de discovery de `/api/crm/ia/discovery-summary`, `CallAnalysisPanel` de la última llamada con análisis, botón "Lanzar agente IA"). Carga por tab (`lazy` + `Suspense`). Ancho `sm:max-w-3xl`, `h-dvh`, contenido `overflow-y-auto`.

**`src/components/crm/oportunidades/OpportunityDetail.tsx`** (reducir a ≤ 300 L): header + embudo existentes; `QuickActionsBar variant="detail"`; `Tabs` con `ResumenTab`-equivalente inline (productos/espacios/conceptos ya existentes se extraen a `ProductsTab.tsx`, `SpacesTab.tsx`, `CustomLinesTab.tsx` ≤ 200 L cada uno) + `ActividadTab`, `TareasTab`, `NotasTab`, `DocumentosTab`, `IATab` compartidos + `AnalyticsTab` existente.

**Kanban**: `src/components/crm/pipeline/kanban/KanbanBoardV2.tsx` (≤ 280 L: `DragDropContext`, columnas, modales gate/won/lost, realtime), `KanbanColumnV2.tsx` (≤ 160 L; color de etapa con `style={{ borderTopColor: stage.color }}`, no clase dinámica: fix B5), `OpportunityCardV2.tsx` (≤ 200 L), `hooks/useKanbanBoard.ts` (≤ 250 L: carga pipeline/stages/opportunities, `subscribeToStages`/`subscribeToOpportunities` con merge, optimistic update/revert, `changeStage`). Props de la tarjeta:

```ts
export interface OpportunityCardV2Props { opportunity: KanbanOpportunity; index: number; onOpen(id: string): void; compact?: boolean }
// KanbanOpportunity = OpportunityBase + { customer?: {id, full_name, avatar_url}; salesperson?: {id, first_name, avatar_url}; temperature; next_action; next_contact_at; last_contact_at; contact_channel; score_total; icp_band }
```

```ts
// kanban/hooks/useKanbanBoard.ts (≤ 250 L)
export function useKanbanBoard(pipelineId: string | null): {
  stages: Stage[]; opportunities: Record<string /*stageId*/, KanbanOpportunity[]>; loading: boolean; error: string | null;
  stats: Record<string, { count: number; total: number }>;                       // reutiliza calculateStageStatistics de kanbanService
  moveOptimistic(oppId: string, from: string, to: string, index: number): () => void;   // devuelve revert()
  changeStage(oppId: string, stageId: string, opts?: { ignoreGate?: boolean; wonData?: unknown; lossData?: LossReasonData }): Promise<StageChangeResult>;
  refetchStage(stageId: string): Promise<void>; refetchAll(): Promise<void>;
};
// Realtime: subscribeToStages(pipelineId, …) (realtimeService.ts:277) + subscribeToOpportunities(stageId, …) (:240) por columna visible;
// UPDATE de stage_id → mueve la tarjeta entre columnas sin refetch; INSERT → inserta; DELETE → quita. Ignora eventos de la oportunidad en drag (ref dragging).
// kanban/KanbanBoardV2.tsx
export interface KanbanBoardV2Props { pipelineId: string; onOpenOpportunity(id: string): void; showStageManager?: boolean }
// kanban/KanbanColumnV2.tsx
export interface KanbanColumnV2Props { stage: Stage; opportunities: KanbanOpportunity[]; stats: { count: number; total: number }; onOpen(id: string): void; onCreate(stageId: string): void }
```

Muestra: avatar del cliente (iniciales), nombre, monto/moneda, `TemperatureDot`, `ScoreBadge` (existe), "Próxima acción: {next_action} · {next_contact_at}" en rojo si vencida, "Última interacción: {icono canal} hace 2 h", pill won/lost, `QuickActionsBar variant="card"` en hover/focus.

Gestión de etapas (crear/editar/borrar/reordenar) que hoy vive en `PipelineStages.tsx:313-590` se conserva en `StageManager.tsx` (652 L, existe) accesible desde el header del board; `PipelineStages.tsx` se elimina tras paridad.

### 5.3 Flujos de usuario

**Llamar desde la tarjeta:** hover tarjeta → icono teléfono → menú "Navegador" → `makeCall` (F3) → `SoftphoneDock` muestra la llamada → colgar → en ≤ 2 s aparece `CallEntry` "En curso…" → "Completada 4:12" con player → (F4) transcripción y análisis se rellenan solos en la misma tarjeta.

**Email desde el drawer:** Actividad → barra → Email → `ComposeEmailDialog` (F7) → Enviar → `EmailEntry` "Enviado" → al abrirlo el cliente, el badge pasa a "Abierto" por realtime en `email_messages`.

**WhatsApp inline:** `WhatsAppEntry` → "Responder aquí" → texto → Enviar → burbuja saliente aparece optimista; si Meta rechaza (fuera de ventana), toast y se abre `ComposeWhatsAppDialog` con plantillas.

**Mover etapa desde el drawer:** `StageSelect` → etapa "Negociación" → gate falta "cotización" → `GateWarningDialog` → "Mover de todas formas" (si permiso) → `SystemEntry` aparece en Actividad y la tarjeta se mueve en el Kanban abierto detrás (realtime).

**Reunión:** barra → Reunión → fecha/hora + "enviar invitación" → `MeetingEntry` programada; el cliente recibe `.ics`; el día de la reunión, "Marcar realizada" → `activities.outcome='done'`.

**Cliente 360:** `clientes/[id]` → `QuickActionsBar` → cualquier acción se registra con `related_type='customer'`; tab Actividad muestra además los WhatsApp de todas sus conversaciones.

**Tarea rápida desde la tarjeta:** hover → ☑ → `TaskQuickDialog` (título, vence, prioridad) → `POST /api/tasks` con `related_to_type='opportunity'` → `TaskEntry` en el timeline y contador del tab "Tareas" actualizado por realtime en `tasks`; en la tarjeta, "Próxima acción" pasa a mostrar la tarea si `opportunities.next_action` está vacío (`next_action` lo recalcula F8/F4; aquí solo se muestra).

**Nota rápida:** barra → 📝 → `NoteQuickDialog` (`RichTextEditor` corto) → `POST /api/crm/notes` → `NoteEntry`; desde el `IATab`, "Guardar como nota" convierte el resumen de la última llamada en nota.

**Agente IA desde la barra (F6):** Llamar ▾ → "Agente IA" → `AIAgentDialog` (elige agente/propósito, ve guion, "Llamar ahora") → `voice_agent_calls` → al completar, F6 crea `activities(ai_call)` → `AiCallEntry` con conversación y tools aplicadas; si el agente movió etapa, además aparece un `SystemEntry`.

**Aplicar sugerencias de IA desde la tarjeta de llamada:** `CallEntry` → "Aplicar sugerencias (2)" → `CallAnalysisPanel` (F4) → `POST /api/crm/calls/[id]/analysis/apply` → si mueve etapa pasa por el mismo `PATCH /stage` (gate) → `SystemEntry` + tarjeta Kanban se mueve.

**Detalle completo:** desde el drawer, "Abrir detalle" (icono expandir en el header) → `/app/crm/oportunidades/[id]` con la misma tab activa (`?tab=actividad`); el detalle añade Productos/Espacios/Conceptos/Analítica.

### 5.4 Wireframes

```
Tarjeta Kanban (hover)
┌────────────────────────────────────────────┐
│ (JP) Implementación POS · El Corral   🔥 A │  ← avatar, nombre, temperatura, ICP
│ $ 12.500.000 COP            Score 78       │
│ ⏰ Próx.: Enviar propuesta · vence hoy     │  ← rojo si vencida
│ 📞 Última: llamada · hace 2 h              │
│                     [📞][✉][💬][📅][☑][📝]   │  ← QuickActionsBar variant card (hover/focus)
└────────────────────────────────────────────┘

Drawer
┌──────────────────────────────────────────────────────────────── sm:max-w-3xl ┐
│ Implementación POS  ✎          [Etapa: Negociación ▾] 🔥 caliente   (JP) Juan │ sticky
│ El Corral · $12.500.000 COP · cierra 30 sep                                    │
│ [📞 Llamar ▾][✉ Email][💬 WhatsApp][📅 Reunión][☑ Tarea][📝 Nota]  [Ganada][Perdida][Editar] │
│ ─ Resumen ─ Actividad ─ Tareas (3) ─ Notas ─ Documentos ─ IA ───────────────── │
│ ┌ Actividad ───────────────────────────────────────────────────────────────┐ │
│ │ [Todos][Llamadas 4][Emails 2][WhatsApp 1][Tareas 3][Sistema]  Canal ▾ Usuario ▾ Fecha ▾ │
│ │ ▲ 2 entradas nuevas                                                       │ │
│ │ ── Hoy ──────────────────────────────────────────────────────────────────  │ │
│ │ 📞 Llamada saliente · 4:12 · contestada        (JP) 14:30                 │ │
│ │    ▶ ──●──────── 01:02/04:12   🙂 positivo · 78/100 · [🔥]               │ │
│ │    ▸ Transcripción (41 turnos)   ▸ Análisis IA   [Aplicar sugerencias (2)]│ │
│ │ ✉ Propuesta comercial POS · a juan@elcorral.co · Abierto 2× ✓ Clic 1×      │ │
│ │    ✓ enviado 10:15 · 👁 abierto 10:42 · 🔗 clic 10:43     ▸ Ver correo [Responder] │
│ │ ── Ayer ─────────────────────────────────────────────────────────────────  │ │
│ │ 💬 WhatsApp · 6 mensajes · ventana abierta (18 h)                         │ │
│ │    ┌ Cliente: ¿Me mandan la cotización? ┐  ┌ Tú: Claro, hoy mismo ┐       │ │
│ │    [Responder aquí: ____________________] [Enviar]   Abrir bandeja →       │ │
│ │ 🤖 Llamada IA "Confirmar demo" · 2:10 · resultado: demo confirmada        │ │
│ │    ▸ Conversación (9 turnos)   Acciones: tarea creada, etapa sugerida     │ │
│ │ 🔄 Etapa: Calificado → Negociación · (JP)                                 │ │
│ │ ☑ Tarea: Enviar cotización · vence 09 sep · [ ] pendiente                 │ │
│ │                              [Cargar más]                                  │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘

Móvil (< 640 px): drawer full-screen, header 2 líneas, barra de acciones scroll horizontal, tabs como <Select>.
```

```
Kanban V2 (/app/crm/pipeline › tab Kanban)
┌ Pipeline Ventas ▾   [Etapas ⚙]  [+ Nueva oportunidad]   ● tiempo real                          ┐
│ ┃Nuevo        3 · $8.2M ┃Calificado  5 · $31M ┃Negociación  2 · $25M ┃Ganado ✓ 4 ┃Perdido ✗ 1 │  ← borde superior con stage.color (style)
│ ┌────────────┐          ┌────────────┐         ┌────────────┐                                     │
│ │(MR) Tienda │          │(JP) POS    🔥│        │(AL) ERP    ❄│                                     │
│ │$2.1M · B   │          │$12.5M · A  │         │$18M · A     │                                     │
│ │⏰ hoy      │          │⏰ vencida ⚠│         │📞 hace 2 h  │                                     │
│ └────────────┘          │[📞][✉][💬]… │         └────────────┘                                     │
│ ┌────────────┐          └────────────┘         ┌ ─ ─ ─ ─ ─ ─ ┐  ← placeholder de drop             │
│ │(CO) Kiosco │          ┌────────────┐                                                             │
│ └────────────┘          │(JP) Sedes  │                                                             │
│  + Nueva                └────────────┘                                                             │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
Drop en "Negociación" con gate incumplido:
┌ Faltan criterios para "Negociación" ───────────────┐
│ • Cotización enviada   • Decisor identificado       │
│ [Cancelar]                 [Mover de todas formas]  │  ← segundo botón solo con permiso crm.stage.override
└─────────────────────────────────────────────────────┘

Detalle (/app/crm/oportunidades/[id])
┌ ← Oportunidades   Implementación POS · El Corral            [Ganar][Perder][Editar][Duplicar][Eliminar] ┐
│ Nuevo ─● Calificado ─● Negociación ─○ Propuesta ─○ Cierre         (embudo clicable existente :488-514)   │
│ [📞 Llamar ▾][✉ Email][💬 WhatsApp][📅 Reunión][☑ Tarea][📝 Nota]                                        │
│ Resumen · Actividad · Tareas · Notas · Documentos · IA · Productos · Espacios · Conceptos · Analítica    │
│ ┌ IA ────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Próxima acción sugerida: "Enviar propuesta con descuento por 3 sedes antes del viernes"  [Crear tarea]│ │
│ │ Discovery: Presupuesto $4.5M · Decisor: Juan (gerente) · Plazo: octubre · Dolor: cierres manuales    │ │
│ │ Última llamada analizada (08 sep): 🙂 positivo · 78/100 · [Ver análisis]  [Lanzar agente IA ▾]        │ │
│ │ Costo IA acumulado: $0.19                                                                             │ │
│ └───────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘

Cliente 360 (/app/crm/clientes/[id])
┌ (EC) El Corral · Restaurantes · Bogotá · Salud 85 🟢 · 3 oportunidades ($33M)                            ┐
│ [📞 Llamar ▾][✉ Email][💬 WhatsApp][📅 Reunión][☑ Tarea][📝 Nota]                                        │
│ Info · Salud · Finanzas · Documentos · Oportunidades · Actividad                                          │
│ ── Actividad (todas las oportunidades + conversaciones del cliente) ──  [Oportunidad ▾ Todas] [Canal ▾]  │
│ 💬 WhatsApp · 6 mensajes · conversación "Soporte" · ayer                                                 │
│ 📞 Llamada saliente · Implementación POS · 4:12 · hoy 14:30                                              │
│ ✉ Propuesta comercial POS · abierto 2× · hoy 10:15                                                       │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Contrato de `TimelineFilters.tsx`** (≤ 160 L): `{ value: TimelineQuery; onChange(v: TimelineQuery): void; counts?: Partial<Record<TimelineKind, number>>; teamUsers: Array<{ id; name }>; compact?: boolean }`. Los `counts` salen de `GET /api/crm/opportunities/[id]?include=counts` (`counts: { calls, emails, whatsapp, ai_calls, tasks_open, notes, meetings }`) para no pedir una página por chip. Los filtros se guardan en `localStorage['crm.timeline.filters']` por usuario y se sincronizan a `?kinds=` en el detalle.

**Contrato de `TaskQuickDialog`/`NoteQuickDialog`:** `{ open; onOpenChange; relatedType: 'opportunity'|'customer'; relatedId: string; defaultAssignee?: string; onCreated?(row) }`. Ambos cierran con `toast({ title: 'Tarea creada' })` y llaman `onCreated`; el timeline no necesita `refresh()` porque realtime lo trae, pero `QuickActionsBar.onActionCompleted` permite a superficies sin realtime (Electron offline) forzar `refresh()`.

### 5.5 Estados vacíos / carga / error

- Timeline vacío: ilustración ligera + "Aún no hay interacciones. Empieza con una llamada, un email o una nota." + `QuickActionsBar` centrada.
- Carga: skeleton de 3 tarjetas (header + 2 líneas); "Cargar más" con spinner; tarjetas hidratándose (análisis pendiente) muestran badge "Analizando…" (F4).
- Error de red: banner con "Reintentar"; realtime caído (`CHANNEL_ERROR`) → polling 15 s + icono discreto "sin tiempo real".
- Drawer sin `opportunityId` válido → "Oportunidad no encontrada o sin acceso".
- Kanban: columna vacía muestra "Arrastra aquí" y botón "Nueva oportunidad" (existente).

### 5.6 Accesibilidad

- Drawer: `Sheet` de shadcn ya atrapa foco; título con `SheetTitle`; `Esc` cierra; foco inicial en el nombre.
- Tabs con `role="tablist"`/`aria-selected` (shadcn `Tabs`); atajos: `1-6` cambian de tab con el drawer enfocado, `c` llamar, `e` email, `w` WhatsApp, `n` nota (solo cuando no hay input enfocado; `useHotkeys` propio ≤ 60 L).
- Timeline `role="feed"` con `aria-busy` durante carga; cada tarjeta `article` con `aria-labelledby`; colapsables con `aria-expanded`.
- Tarjeta Kanban: `tabIndex=0`, `Enter` abre, `Space`+flechas para mover (soporte de teclado de `@hello-pangea/dnd`), barra de acciones visible en `focus-within`.
- Contraste de temperatura/estado con texto además de color; `aria-label` en iconos.

### 5.7 Motion (sobrio)

- Entradas nuevas por realtime: `motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} transition={{duration:0.15}}`; sin stagger en carga inicial.
- Cambio de tab: fade 120 ms (`AnimatePresence mode="wait"`); movimiento de tarjeta en Kanban por realtime: `layout` de motion 200 ms.
- Respeta `prefers-reduced-motion` (`MotionProvider`).

### 5.8 Responsive / cross-platform

- `< 640 px`: `Sheet side="bottom"` full-screen; barra de acciones con scroll horizontal; tarjetas compactas (sin última interacción); Kanban con scroll horizontal por columna y tarjeta de 260 px.
- PWA/Capacitor: `tel:` y WhatsApp deep links solo como fallback del menú "mi celular" si no hay bridge; `navigator.share` para compartir enlace de reunión; el softphone del navegador requiere micrófono (F3: `RECORD_AUDIO`, `NSMicrophoneUsageDescription`).
- Electron: `shell.openExternal` para enlaces de bandeja/documentos; realtime sin cambios.

---

## 6. Integración con proveedores

F9 no llama proveedores directamente. Consume: Resend vía `emailService` (F7) para el `.ics` (adjunto `text/calendar; method=REQUEST`, ≤ 40 MB total, sin adjuntos en batch); Meta Cloud API vía `trg_channel_dispatch` (F16) para "responder aquí" (fuera de ventana 24 h exige plantilla APPROVED: el `WhatsAppEntry` lee `window_open` = `conversations.last_message_at` inbound < 24 h); Twilio vía `useSoftphone`/bridge (F3). Precios y límites: los de cada fase.

---

## 7. Multi-tenant y seguridad

| Punto | Control | Cierra |
|---|---|---|
| `GET timeline` | `getServerOrgContext()`; `fn_crm_timeline` SECURITY INVOKER → RLS de cada tabla + `p_org_id` de sesión; hidratación con `.eq('organization_id', orgId)`. | B6 (sin exponer datos cross-org) |
| `POST activities`/`meetings` | zod; `assertRelatedBelongsToOrg`; `user_id` de sesión; `organization_id` nunca del body. | B11 (insert cliente en `calendar_events`), C-A patrón |
| `PATCH stage` | `evaluateStageGate`; `ignore_gate` requiere permiso `crm.stage.override` (F2); `stage_id` debe pertenecer al `pipeline_id` de la oportunidad. | — |
| Realtime | Canales `postgres_changes` con RLS; el cliente solo ve filas que ya puede leer; filtros por id no son barrera de seguridad. | — |
| HTML de emails | `HtmlContentRenderer` sanitiza (DOMPurify existente en el componente); imágenes remotas bloqueadas por defecto con botón "Cargar imágenes" (evita tracking pixels de terceros en inbound F7). | — |
| WhatsApp inline | `POST /api/crm/whatsapp/reply` (F16) valida `conversation_id` de la org y ventana 24 h; nunca `channel_id` del body sin verificar. | C1-C5 msg (F16) |
| Documentos | `DocumentUploader` existente con bucket privado `crm-documents` y URL firmada. | — |
| Cliente sin escrituras directas | `guardrails.test.ts`: `src/components/crm/timeline/**` y `shared/QuickActionsBar.tsx` no importan `supabase.from(...).insert`; solo `fetch('/api/...')`. | B9/B11 |

---

## 8. Créditos, costos y límites

F9 no consume créditos por sí misma. Muestra en el `IATab` el costo acumulado de IA de la oportunidad (`ai_usage_logs.metadata->>'opportunity_id'`) y en cada `CallEntry`/`AiCallEntry` el costo de la llamada (`calls.cost_amount`, `call_transcripts.cost_amount`, `call_analyses.cost_amount`). Límites de UI: 100 entradas por página máximo (LIMIT en SQL), 5 burbujas por grupo WhatsApp, `body_html_snapshot` truncado a 200 KB en la hidratación.

---

## 9. Pruebas

### 9.1 Unitarias

| Archivo | Casos |
|---|---|
| `src/lib/services/crm/__tests__/timelineService.test.ts` | `encodeCursor/decodeCursor` ida y vuelta; `hydrate` agrupa ids por kind y hace ≤ 8 queries (mock supabase contando `.from`); entrada `call` con `activity` y `analysis` → un solo objeto; `whatsapp` con 12 mensajes → `messages.length===5`, `count===12`; `system` resuelve nombres de etapa. |
| `src/lib/services/crm/__tests__/activityService.test.ts` | `activity_type` inválido → zod error; `related_id` de otra org → 404; `call_id` con actividad existente → 409; `client_key` repetido → misma fila. |
| `src/lib/services/crm/__tests__/meetingService.test.ts` | `buildIcs` produce `METHOD:REQUEST`, `DTSTART` UTC, líneas CRLF, escape de comas; `createMeeting` sin email no envía invitación. |
| `src/lib/services/crm/__tests__/opportunityStageService.test.ts` | gate `ok:false` → `{reason:'gate'}`; `is_won` → `needs_won`; `ignoreGate` sin permiso → error 403. |
| `src/components/crm/timeline/__tests__/*.test.tsx` (`@jest-environment jsdom`) | Render de `CallEntry`, `EmailEntry`, `WhatsAppEntry`, `AiCallEntry`, `TaskEntry`, `NoteEntry`, `MeetingEntry`, `SystemEntry` con fixtures `src/__fixtures__/timeline/*.json`; `groupByDay` con zona `America/Bogota` (entrada 23:30 UTC-5 cae en el día correcto); `mergeEntries` no duplica y reordena. |
| `src/components/crm/shared/__tests__/QuickActionsBar.test.tsx` | `variant="card"` renderiza solo iconos; clic no propaga (`onClick` del padre no se llama); sin `useSoftphone` provider → menú sin "navegador"; sin permiso `crm.email` → sin botón Email. |
| `src/__tests__/guardrails.test.ts` | Ningún archivo en `src/components/crm/{timeline,shared}` importa `@/lib/supabase/config`; `KanbanBoard.tsx`, `KanbanColumn.tsx`, `OpportunityCard.tsx`, `PipelineStages.tsx`, `drawer/ActivityActions.tsx` no existen. |

Fixtures (`src/__fixtures__/timeline/`, JSON con datos anonimizados de la org de prueba): `entry-call-completed.json` (con `activity`, `transcript.status='completed'`, `analysis` con `mixed`), `entry-call-live.json`, `entry-email-opened.json` (3 `events`: sent/delivered/opened), `entry-email-bounced.json`, `entry-whatsapp-window-open.json` (5 burbujas, `count: 12`), `entry-whatsapp-window-closed.json`, `entry-ai-call.json` (9 turnos, 2 `tool_runs`), `entry-task-overdue.json`, `entry-note.json`, `entry-meeting-scheduled.json`, `entry-system-stage.json`, `page-1.json`/`page-2.json` (30 + 12 entradas con cursor real), `opportunity-full.json`, `kanban-pipeline.json` (5 etapas, 15 oportunidades).

### 9.2 Integración

1. `fn_crm_timeline` con datos sembrados (3 activities, 2 tasks, 1 stage change, 8 messages en 2 días): página 1 `limit=5` y página 2 con cursor → 8 entradas totales sin repetidos ni huecos (comparar con `ORDER BY occurred_at DESC, id DESC` directo).
2. Usuario de otra org llamando a `fn_crm_timeline` con `p_org_id` ajeno → 0 filas (RLS).
3. `POST /api/crm/meetings` con `send_invite:true` (Resend mock de F7) → `calendar_events` + `activities(meeting)` + `email_messages` con adjunto `invitacion.ics`.
4. `PATCH /api/crm/opportunities/[id]/stage` hacia etapa con `exit_criteria` incumplidos → 409 con `gate.missing`; con `ignore_gate` y permiso → 200 y fila en `opportunity_stage_history`.
5. Webhook Twilio status `completed` (F3 mock) → trigger crea `activities(call)` → canal realtime recibe `INSERT` en `activities` con `related_id` filtrado.

### 9.3 E2E (org de prueba)

1. Abrir `/app/crm/pipeline`: tarjetas muestran avatar, temperatura y próxima acción; hover muestra 6 iconos; clic en un icono no abre el drawer; clic en la tarjeta sí.
2. Arrastrar a "Negociación" con gate incumplido → `GateWarningDialog`; cancelar → tarjeta vuelve; confirmar → se mueve y aparece `SystemEntry` en su drawer.
3. Arrastrar a etapa `is_won` → `WonCloseModal`; completar → tarjeta verde "Ganada".
4. Abrir drawer → tab Actividad → "Llamar > Navegador" → hablar 30 s → colgar → `CallEntry` visible en ≤ 2 s → esperar ≤ 4 min → player, transcripción y resumen dentro de la misma tarjeta (F4).
5. Email desde la barra (F7) → `EmailEntry` "Enviado"; abrir el correo desde otro cliente → badge "Abierto" sin recargar.
6. En una segunda pestaña mover la etapa → la primera pestaña actualiza el Kanban y el header del drawer sin recargar.
7. `clientes/[id]` → barra de acciones → Nota → aparece en el timeline del cliente.
8. Móvil (DevTools 375 px): drawer full-screen; barra con scroll; reunión creable.
9. Verificar en BD: por cada interacción del E2E existe exactamente una fila en `activities` (`SELECT call_id, count(*) FROM activities WHERE call_id IS NOT NULL GROUP BY 1 HAVING count(*)>1` → 0 filas).

### 9.4 Casos borde (≥ 10)

1. Oportunidad sin cliente → barra oculta Email/WhatsApp; Llamar pide número.
2. Cliente sin email pero con teléfono → Email deshabilitado con tooltip.
3. Dos entradas con el mismo `occurred_at` → cursor desempata por `id`; sin pérdida.
4. 5 000 entradas → paginación de 30; `EXPLAIN` usa índices; primera página < 300 ms.
5. Realtime desconectado → polling 15 s; al reconectar, `refresh()` y sin duplicados (`mergeEntries`).
6. Llamada en curso (`call_live`) que luego completa → la entrada `call_live` desaparece y la `call` (por `activities`) la sustituye (misma posición temporal).
7. Email rebotado → estado `bounced` en rojo y aviso "no volver a enviar" (F7 `do_not_email`).
8. WhatsApp fuera de ventana 24 h → "Responder aquí" deshabilitado con texto "usa una plantilla" y botón que abre el diálogo.
9. Usuario sin permiso `crm.stage.override` → `GateWarningDialog` sin botón "Mover de todas formas".
10. Cambio de etapa concurrente (otro usuario) mientras el drawer está abierto → header refleja la etapa nueva; `StageSelect` no revierte.
11. Timeline de cliente con 40 conversaciones → `conversation_id=in.(...)` limitado a 50 ids; el resto solo por refresh manual.
12. `body_html_snapshot` de 2 MB → truncado en hidratación con enlace "ver correo completo" (`/api/email/messages/[id]`).
13. Drawer abierto y navegación con atrás del navegador → se cierra (query param `?opp=` sincronizado).
14. Tarea marcada `done` desde `TaskEntry` → `tasks` realtime actualiza el contador del tab "Tareas (2)".

---

## 10. Definition of Done

- [ ] Migraciones 3.1 aplicadas; `fn_crm_timeline` con `prosecdef=false`; índices e inclusión en `supabase_realtime` verificados (3.3).
- [ ] `GET /api/crm/timeline/[type]/[id]` devuelve `TimelineEntry` v2 hidratadas con cursor estable (prueba 9.2.1) y ≤ 9 queries por página.
- [ ] `POST /api/crm/activities`, `POST/PATCH /api/crm/meetings`, `PATCH /api/crm/opportunities/[id]/stage`, `GET /api/crm/opportunities/[id]` implementados con `getServerOrgContext()` y zod.
- [ ] `QuickActionsBar` montada en `OpportunityCardV2`, `OpportunityDrawer`, `OpportunityDetail` y `clientes/[id]`; ningún botón apunta a rutas inexistentes (B1, B2); `stopPropagation` verificado (B17).
- [ ] `OpportunityTimeline` es el **único** timeline: eliminados el merge cliente de `OpportunityDetail.tsx:919-922`, la lista inline del drawer (`:804-845`) y `opportunitiesService.getOpportunityActivities/createActivity`.
- [ ] Las 8 tarjetas `entries/*` renderizan sus fixtures; `CallEntry` embebe `CallPlayer`, `CallTranscriptPanel`, `CallAnalysisPanel`; `EmailEntry` muestra eventos y preview sanitizado; `WhatsAppEntry` responde inline.
- [ ] Realtime: cualquier interacción aparece en ≤ 2 s (E2E 9.3.4-6) y no hay duplicados (9.3.9).
- [ ] `OpportunityDrawer.tsx` ≤ 250 L con header sticky y 6 tabs; `useOpportunityData` hace 1 query al abrir y refetch granular; `refresh-pipeline-data` eliminado del código.
- [ ] `OpportunityDetail.tsx` ≤ 300 L reutilizando los tabs compartidos.
- [ ] `KanbanBoardV2` con gates, `WonCloseModal`, `StructuredLossDialog` y realtime; `KanbanBoard.tsx`, `KanbanColumn.tsx`, `OpportunityCard.tsx`, `PipelineStages.tsx` y `drawer/ActivityActions.tsx` eliminados; `index.ts` actualizado; B5 corregido.
- [ ] `ActivityActions` descompuesto: Email → F7, WhatsApp → F16, Llamar → F3/F5, Reunión → `MeetingDialog` + `/api/crm/meetings` (sin insert cliente, B11).
- [ ] Accesibilidad: foco atrapado en drawer, `role="feed"`, atajos, contraste en claro/oscuro; responsive en 375 px.
- [ ] `guardrails.test.ts` ampliado pasa; `npm run lint`, `tsc --noEmit`, `npm test` limpios; cero `.sql` en el repo.

**Métricas de éxito:** tiempo de apertura del drawer p95 < 600 ms (antes: 7 queries); 0 actividades duplicadas por interacción; ≥ 80 % de las acciones de contacto del equipo se inician desde tarjeta/drawer (medido por `activities.metadata.source='quick_actions'`); 0 errores 404 en `/api/integrations/twilio/click-to-call` y `/api/email/templates` en logs de Vercel.

---

## 11. Riesgos y decisiones

| Decisión | Por qué X y no Y |
|---|---|
| `fn_crm_timeline` en SQL (UNION + cursor) en vez de 6-8 queries TS | El servicio actual aplica el cursor solo a `activities` y ordena en memoria: páginas incorrectas con > 50 entradas. Un `UNION ALL` con `ORDER BY … LIMIT` usa índices y devuelve exactamente la página; la hidratación se hace en TS por lote. `SECURITY INVOKER` mantiene RLS. |
| Actividad como fila canónica; WhatsApp agrupado | Evita duplicar llamada (`calls` + `activities`) y emails; WhatsApp genera decenas de filas por día que no deben ser "actividades". |
| `KanbanBoardV2` nuevo (no parchear `PipelineStages`) | `PipelineStages.tsx` (1041 L) mezcla CRUD de etapas y tarjetas; portar gates/realtime dentro lo llevaría a > 1300 L. Se reutilizan `StageManager`, `StageDialog`, `DeleteStageDialog`, `GateWarningDialog`, `WonCloseModal`, `StructuredLossDialog` y se borra lo muerto. |
| Un `PATCH /stage` server-side para drawer, Kanban y F4/F6/F8 | Una sola implementación del gate; hoy el drawer y el board tienen lógicas distintas y F4 (auto-aplicar) y F6 (tool `move_opportunity_stage`) necesitan la misma. |
| `useOpportunityData` + `useTimeline` sin react-query | Regla del brief; los hooks encapsulan cache por id y refetch granular; si el proyecto adopta react-query después, la firma se mantiene. |
| `notes` (tabla) vs `activities(note)` | Se mantiene la tabla `notes` para notas largas del drawer (`RichTextEditor`) y se añade la rama `UNION ALL` sobre `notes` en `fn_crm_timeline` (`kind='note'`, `ref{body,is_pinned}`); `NoteQuickDialog` escribe en `notes` vía `POST /api/crm/notes` (existe en `opportunitiesService`? No: se crea ruta ≤ 60 L). Decisión: **no** migrar datos históricos. |
| `MeetingDialog` en F9 (no F7) | Es la única acción de la barra sin fase propia; el `.ics` reutiliza `sendEmail` de F7. Google/Cal.com quedan como nivel 2 (D1). |
| Drawer `sm:max-w-3xl` con tabs, no página completa | El vendedor trabaja desde el Kanban; el detalle completo sigue existiendo para casos largos y comparte los módulos. |
| Riesgo: publicación realtime en tablas grandes (`messages`, `opportunities`) | Filtros por id en cliente reducen tráfico; si el volumen crece, pasar a canal `broadcast` desde triggers (`realtime.send`) sin cambiar los hooks. |
| Riesgo: tamaño de PRs | 12 PRs; el borrado del código muerto va al final, tras paridad verificada por E2E. |

---

## 12. Archivos tocados (real, rondas 1, 2 y 3)

**Servicios y API (server)**: `src/lib/services/crm/timelineService.ts` (fachada, 139 L), `src/lib/services/crm/timeline/{types,sources,assemble}.ts` (nuevos), `activityService.ts`, `meetingsService.ts`, `opportunityStageService.ts` (nuevos), `src/lib/services/crm/index.ts` (exports corregidos), `src/app/api/crm/timeline/[type]/[id]/route.ts` (contrato v2), `src/app/api/crm/{activities,notes,tasks,meetings,meetings/[id],opportunities/[id]/stage}/route.ts` (nuevos).

**Shared**: `src/components/crm/shared/{QuickActionsBar,quickActionsConfig,ComposeEmailDialog,ComposeWhatsAppDialog,MeetingDialog,QuickTaskDialog,QuickNoteDialog,MobileCallDialog}.ts(x)` (nuevos).

**Timeline**: `src/components/crm/timeline/{OpportunityTimeline,TimelineFilters,TimelineEntryCard}.tsx`, `utils.ts`, `hooks/useTimeline.ts`, `entries/{CallEntry,CallPanels,EmailEntry,WhatsAppEntry,AiCallEntry,TaskEntry,NoteEntry,MeetingEntry,SystemEntry,GenericEntry}.tsx` (nuevos).

**Pipeline / drawer**: `src/components/crm/pipeline/{KanbanBoardV2,KanbanColumnV2,OpportunityCardV2}.tsx`, `hooks/{useKanbanBoard,useOpportunityData}.ts`, `drawer/{DrawerHeader,StageSelect}.tsx`, `drawer/tabs/{types,ResumenTab,ActividadTab,TareasTab,NotasTab,DocumentosTab,IATab}.ts(x)` (nuevos); `OpportunityDrawer.tsx` (reescrito, 178 L), `PipelineView.tsx` (monta V2), `index.ts`.

**Detalle**: `src/components/crm/oportunidades/OpportunityDetail.tsx` (reescrito, 171 L), `detail/{DetailHeader,DetailSidebar,LineItemsTab,AnalyticsTab,useStageFlow}.tsx` (nuevos), `opportunitiesService.ts` (borrados `getOpportunityTimeline/getOpportunityActivities/createActivity`).

**Otros**: `src/app/app/crm/clientes/[id]/page.tsx`, `src/components/crm/actividades/{ActividadesPage,types}.ts(x)`.

**Borrados (lista completa y verificada, corregida en ronda 2)**: `pipeline/KanbanBoard.tsx`, `pipeline/KanbanColumn.tsx`, `pipeline/OpportunityCard.tsx`, `pipeline/PipelineStages.tsx`, `pipeline/drawer/ActivityActions.tsx` y —omitidos por error en la ronda 1, señalado por el tester (F9-24)— `pipeline/AutomationSettings.tsx`, `pipeline/EmailNotifications.ts` y `pipeline/EmailNotifications.tsx`. Ninguno tiene importadores colgando (`AutomationsView.tsx` define su propio tipo homónimo; los hits de `grep` restantes son `pm/views/KanbanBoard`, variables locales y comentarios).

**Nuevos en la ronda 2**: `src/lib/services/crm/timeline/cursor.ts` (cursor estricto, rango con NULL = epoch, corte seguro y día de Bogotá), `src/lib/services/crm/timeline/whatsappSource.ts` (fuente WhatsApp extraída de `sources.ts` por tamaño y por su paginación por grupo), `src/components/crm/shared/realtimeTables.ts` (tablas realmente publicadas en `supabase_realtime` + evento `refresh-pipeline-data`), `src/components/crm/timeline/entries/CallIntelligenceSections.tsx` (un solo `useCallIntelligence` para los dos paneles de F4), `src/lib/services/crm/__tests__/pgMock.ts` (mock fiel de PostgREST compartido por los tests del timeline).

**Modificados en la ronda 2**: `timelineService.ts`, `timeline/{types,sources,assemble}.ts`, `opportunityStageService.ts`, `activityService.ts`, `meetingsService.ts`, `app/api/crm/opportunities/[id]/stage/route.ts`, `components/crm/pipeline/{KanbanBoardV2,OpportunityCardV2,OpportunityDrawer}.tsx`, `pipeline/hooks/{useKanbanBoard,useOpportunityData}.ts`, `pipeline/drawer/tabs/ActividadTab.tsx`, `components/crm/timeline/{OpportunityTimeline.tsx,hooks/useTimeline.ts,entries/CallEntry.tsx}`, `components/crm/shared/QuickActionsBar.tsx`, `components/crm/oportunidades/OpportunityDetail.tsx`.

**Tests**: `src/lib/services/crm/__tests__/{timelineService,timelineAdversarial,activityService,meetingsService,opportunityStageService,f9Routes.smoke}.test.ts` + `__tests__/pgMock.ts`, `src/components/crm/shared/__tests__/quickActionsConfig.test.ts`, `src/components/crm/timeline/__tests__/utils.test.ts`. `timelineAdversarial.test.ts` lo escribió el tester en la ronda 1 reproduciendo 10 defectos; en la ronda 2 los asserts se **invirtieron para afirmar el comportamiento correcto** (mismo escenario y mismo mock, más comprobaciones extra).

**Nuevos en la ronda 3**: `src/lib/services/crm/timeline/timestamps.ts` (precision de `timestamptz`, F9-32), `src/lib/services/crm/stagePermissions.ts` (permiso de excepcion de gate y de gestion de etapas, F9-36/F9-41), `src/lib/services/crm/opportunityStageReconcile.ts` (red de seguridad post-trigger con guarda optimista, F9-35), `src/lib/services/crm/opportunityStageData.ts` (criterio unico de "hay datos de cierre"), `src/lib/services/crm/meetingsIcs.ts` (ICS extraido para bajar de 300 L), `src/app/api/crm/stages/route.ts` y `src/app/api/crm/stages/[id]/route.ts` (escritura de etapas con RBAC, F9-41), `src/lib/services/crm/__tests__/f9Round3Builder.test.ts`.

**Modificados en la ronda 3**: `timeline/{types,cursor,sources,whatsappSource,assemble}.ts`, `opportunityStageService.ts`, `activityService.ts`, `meetingsService.ts`, `app/api/crm/opportunities/[id]/stage/route.ts`, `components/crm/shared/{realtimeTables,ComposeEmailDialog}.ts(x)`, `components/crm/pipeline/KanbanBoardV2.tsx`, `components/crm/pipeline/hooks/useKanbanBoard.ts`, `components/crm/timeline/entries/{CallPanels,WhatsAppEntry}.tsx`, `src/lib/services/crm/__tests__/{pgMock.ts,timelineService.test.ts,timelineAdversarial.test.ts,timelineR2Adversarial.test.ts,stageR2Adversarial.test.ts}`.

**Migracion de la ronda 3 (solo por MCP, cero archivos `.sql`)**: `crm_v4_f09_stage_write_hardening` - endurece `update_stage_without_triggers`, anade `fn_stages_guard_outcome_flags` + su trigger y hace que `fn_log_stage_change` guarde el autor.

**No tocados (otras fases)**: `src/app/app/layout.tsx` (F3), `components/voice/**` (F3), `components/crm/calls/**` y `api/crm/calls/**` (F4; se consumen con `next/dynamic`), `api/email/**` (F7), `components/crm/whatsapp/**` (F16), `chat/**`, `src/app/api/crm/transcribe/route.ts` (F4 lo mantiene por compatibilidad; ya sin consumidores en F9), `src/__tests__/guardrails.test.ts` (SEC).

## 13. Registro de implementación — ronda 1 (2026-09-08)

**Hecho**: todo lo listado en §1 y §12. Verificación final de la ronda (2026-09-08, cierre):

- `npx tsc --noEmit -p scratchpad/tsconfig.f9.json` (incluye `src/lib/services/crm/index.ts` y `app/crm/pipeline/page.tsx`) → **0 errores en archivos de F9**. Los 9 restantes son preexistentes en el baseline y ajenos a la fase (`pmService.ts` ×4, `TrazabilidadSeccion.tsx` ×4, `foliosService.ts` ×1), arrastrados por el grafo de imports. Quedaron en cero los 8 errores que F9 tenía a media ronda: `KanbanBoardV2.tsx:61` y `useStageFlow.tsx:32` (estrechamiento del union `StageChangeResult` antes de leer `.message`), `useKanbanBoard.ts:94/126/127/129` (`as unknown as Record<string, unknown>` sobre `GenericStringError`) y `index.ts:293/295` (`TimelineEntryType`/`TimelineFilters` → `TimelineKind`/`TimelineQuery`). Los 3 de `PipelineStages.tsx` desaparecen del baseline porque el archivo se borró.
- `npx jest src/lib/services/crm src/components/crm` → **29 suites / 264 tests verdes** (1 suite y 1 test `skip` preexistentes de otra fase).
- `curl` sin sesión contra el dev server de este repo (`:3011`): `GET /api/crm/timeline/opportunity/<uuid>`, `POST /api/crm/{activities,notes,tasks,meetings}`, `PATCH /api/crm/opportunities/<uuid>/stage`, `GET /app/crm/pipeline` y `GET /app/crm/clientes/<uuid>` → **307 → `/auth/login`** (middleware fail-closed en todas).
- Navegador (MCP): `http://localhost:3011/app/crm/pipeline` redirige a `/auth/login?redirectTo=%2Fapp%2Fcrm%2Fpipeline`, la pantalla de login renderiza y la consola no reporta errores. Sin credenciales de prueba no se puede pasar del login: la verificación visual del Kanban/drawer/detalle queda para el tester con sesión (pasos en `scratchpad/reports/F9-r1.md`).
- Nota de entorno: el dev server de `:3000` sirve **otro checkout** (`pagina-web-go-admin-erp-1`) y devuelve 404 en `/app/crm/pipeline`; para este repo hay que levantar uno propio (`npx next dev -p 3011`). Un `.next/cache` corrupto de una ejecución anterior producía un 500 en `_not-found` (`Cannot read properties of undefined (reading 'call')`); se resolvió borrando `.next/cache/webpack` y `.next/server/app/_not-found` — no es un fallo de código de F9.

**Desviaciones respecto al plan**:
- Sin migraciones: no existe `fn_crm_timeline` ni índices nuevos (regla 2). El servicio hace 8 consultas en paralelo (`limit+1` por fuente) + hidratación por lote; el RPC queda como optimización sugerida a DB.
- `timelineService.ts` se dividió en `timeline/{types,sources,assemble}.ts` para respetar ≤ 300 L por módulo (la fachada conserva las exportaciones públicas).
- `POST /api/tasks` (PM) no existe → `POST /api/crm/tasks`. `NoteQuickDialog/TaskQuickDialog` se llaman `QuickNoteDialog/QuickTaskDialog`.
- Kanban V2 vive en `src/components/crm/pipeline/` (no en `pipeline/kanban/`) junto a los archivos que reutiliza; la gestión de etapas se integró en el board (no `StageManager`).
- `GET /api/crm/timeline/.../entry/[kind]/[entryId]` y `GET /api/crm/opportunities/[id]` no se crearon: `useOpportunityData` usa `opportunitiesService.getOpportunityById` (RLS) y el realtime del timeline refresca la página 1 con merge por `(kind,id)`.
- `calendar_events.status` usa el CHECK real (`confirmed|cancelled`); el estado API `scheduled|done|canceled` se mapea en `meetingsService` (+ `metadata.completed_at`, `activities.outcome`).
- Contrato WhatsApp: el de SEC (`/api/integrations/whatsapp/send` con `channel_id/to/type/text`), no `/api/crm/whatsapp/reply`.
- `usePermissions` no se aplicó (no existen permisos `crm.call/email/whatsapp` en el sistema actual); los botones se habilitan por datos del cliente (email/teléfono).
- Sin tests de render (`@testing-library` no instalado; regla 8): se testea la lógica pura (`quickActionsConfig`, `utils`, servicios con mock de supabase).
- `guardrails.test.ts` (archivo de SEC) no se modificó; las prohibiciones de §9.1 se piden a SEC.

**Pendientes**: modo "Agente IA" (F6 `AIAgentDialog`), invitación `.ics` (F7 adjuntos), `MessageBubble` compartido con `chat/`, sustitución de `ComposeEmailDialog`/`ComposeWhatsAppDialog` v1 por los de F7/F16, `notes` en `supabase_realtime` (DB), `fn_crm_timeline` (DB, opcional), verificación visual con sesión.


---

## 13 bis. Registro de implementación — ronda 2 (2026-09-08)

> ⚠️ **Registro histórico. Léelo junto a §13 ter, que lo corrige.** Cuatro afirmaciones de
> esta sección **caducaron el mismo día** (F9-24/F9-42) y la ronda 3 las rectifica: (1) el
> trigger `fn_sync_status_from_stage` **ya no** deriva `status` de `probability` — la
> migración de DB se aplicó y deriva de `is_won`/`is_lost`; (2) la invariante de cierre **no**
> la garantiza `reconcileStatus`, la garantiza la BD, que además no cierra sin datos de
> cierre; (3) el DDL descrito como "bloqueante" está **aplicado**; (4) `notes` **sí** está
> publicada en `supabase_realtime`, así que el timeline ya no sondea cada 15 s. El estado
> vigente es el de §1 y §13 ter.

Ronda de correcciones sobre el informe del tester `scratchpad/reports/TEST-F9-r1.md`
(66 casos, 22 fallos, 4/10). Se atendieron los 29 hallazgos F9-01…F9-29; el detalle
ítem por ítem está en `scratchpad/reports/F9-r2.md`.

### Decisión de arquitectura F9-01 (la más importante)

**`stages.is_won` / `stages.is_lost` son la fuente de verdad; `stages.probability` es solo informativa.**

Razones: (a) son explícitas y configurables desde el diálogo de etapa, mientras que
`probability` es un peso de forecast que un comercial cambia sin intención de cerrar nada;
(b) `probability = 0` es legítimo en etapas iniciales (en la org 2, "Contacto Inicial" y
"Reunión Agendada" valen 0) y hoy el trigger las marca como **perdidas** con `closed_at`
y sin `loss_reason`; (c) `is_won/is_lost` permiten dos etapas ganadoras o ninguna, cosa
que `probability` no expresa; (d) el gate y el modal de cierre ya cuelgan de esas banderas.

Conflicto real: el trigger `trg_sync_status_from_stage` (AFTER UPDATE OF stage_id) ejecuta
un **segundo UPDATE** que deriva `status` de `probability` (100→won, 0→lost, resto→open) y
pisa lo que escribe el servicio. El `RETURNING` de PostgREST se materializa antes, así que
la fila devuelta miente. Como F9 no aplica DDL:

- **Servicio**: `opportunityStageService.changeStage` relee la oportunidad tras el UPDATE y,
  si `status`/`closed_at` no coinciden con lo que dicta `is_won/is_lost`, emite un UPDATE
  correctivo (`reconcileStatus`). Ese UPDATE no toca `stage_id`, así que no vuelve a
  disparar el trigger. Invariante garantizada: **nunca queda `closed_at` sin
  `loss_reason` (perdida) o sin `win_data` (ganada)**.
- **DB (bloqueante)**: redefinir la función y hacer el backfill de `is_won/is_lost`. El SQL
  exacto y las 14 filas afectadas están en `scratchpad/reports/F9-r2.md`, sección
  "Petición a DB (bloqueante F9-01)". Hasta entonces queda un efecto colateral que el
  servicio **no puede deshacer**: el UPDATE del trigger dispara
  `trg_create_commission_on_opportunity_won`, así que una oportunidad con
  `commission_type <> 'none'`, `commission_rate > 0` y `salesperson_id` puede generar una
  comisión "accrued" aunque el estado se corrija a `open` un instante después.

### Verificación de la ronda 2

- `npx jest src/lib/services/crm/__tests__/timelineAdversarial.test.ts` → **10/10 verdes**.
  Los 10 casos son los del tester; los asserts se invirtieron para afirmar el comportamiento
  correcto (documentado en la cabecera del archivo). Un test que siguiera exigiendo el bug
  estaría afirmando que el timeline pierde datos.
- `npx jest src/lib/services/crm src/components/crm` → **39 suites / 595 tests verdes**
  (1 suite y 1 test `skip` preexistentes de otra fase).
- `npx jest` (repo completo) → **61 suites / 909 tests verdes**; la única roja es
  `src/lib/services/website/__tests__/sectionContract.test.ts` (2 tests), del módulo website,
  ajena a F9.
- `npx tsc --noEmit -p scratchpad/tsconfig.f9.json` → **0 errores en archivos de F9**
  (quedan los 9 preexistentes de `pmService.ts`, `TrazabilidadSeccion.tsx` y `foliosService.ts`,
  arrastrados por el grafo de imports).
- `npx tsc --noEmit` completo → **0 errores** en `lib/services/crm/{timeline*,activityService,meetingsService,opportunityStageService}`,
  `components/crm/{timeline,shared,pipeline,oportunidades,actividades}` y `app/api/crm/{activities,meetings,notes,tasks,opportunities,timeline}`.
- **BD, escenario F9-01 con `begin; … rollback;`**:
  - org 125, etapa "Ganado" (`is_won=false`, `probability=100`): `Contacto Inicial/open/closed_at null`
    → tras el UPDATE el trigger deja `won` + `closed_at` → tras `reconcileStatus` vuelve a
    `open` + `closed_at null`. Ya **no** se cierra indebidamente.
  - org 2, etapa "Reunión Agendada" (`probability=0`, no terminal): el trigger deja `lost` +
    `closed_at` sin razón → `reconcileStatus` lo devuelve a `open` + `closed_at null`.
  - org 2 con el backfill propuesto aplicado dentro de la misma transacción
    (`is_won=true, probability=100` en "Ganado"): el servicio exige `win_data` (409 `needs_won`),
    el modal la aporta y el cierre queda `won` + `closed_at` + `win_data`.

### Desviaciones y decisiones de la ronda 2

- **`emails` y `voice_agent_calls` se paginan y se muestran por `created_at`** (antes se
  filtraba por `created_at` y se mostraba `sent_at` / `started_at ?? scheduled_at`, y las filas
  con desfase no salían nunca: F9-07). `sent_at`, `started_at` y `scheduled_at` siguen en el
  payload para la tarjeta.
- **Grupos de WhatsApp indivisibles** (F9-05): con cursor se pide hasta el final del día de
  Bogotá del cursor (como mucho 24 h de más) y se descartan los grupos cuya cabecera no es
  estrictamente anterior al cursor, porque esos ya se mostraron enteros en la página previa.
- **Páginas vacías**: cuando el corte seguro no deja nada visible, `getTimeline` reintenta
  internamente hasta 5 rondas antes de devolver. Es lo que evita el salto de entradas que el
  tester detectó al filtrar por `kinds` (T1.5) sin obligar al cliente a pulsar "Cargar más"
  varias veces.
- **Realtime**: `src/components/crm/shared/realtimeTables.ts` documenta qué tablas están en
  `supabase_realtime` (verificado por MCP). El Kanban ya no promete "tiempo real": muestra
  `auto 30 s` y refresca por polling + evento `refresh-pipeline-data`; `useOpportunityData`
  ni siquiera abre el canal; el timeline mantiene el polling de 15 s mientras `notes` no esté
  publicada. En cuanto DB publique las tres tablas basta con añadirlas a ese archivo.
- **`profiles` no tiene `organization_id`** (verificado en `information_schema`), así que la
  parte de F9-22 sobre filtrar la hidratación de perfiles por organización no aplica: la
  cubre RLS. Sí se corrigió el tope de `email_events`, que ahora escala con el número de
  emails de la página en vez de un `limit(300)` global.
- **F9-25**: compartir un solo `useCallIntelligence` exige importar F4 de forma estática; se
  aisló en `timeline/entries/CallIntelligenceSections.tsx`, que `CallEntry` carga con
  `next/dynamic(...).catch(fallback)`. Se conserva la degradación si `@/components/crm/calls`
  no estuviera disponible.
- **F9-20 (12-17 consultas por página)** sigue abierto: se reduce con la RPC `fn_crm_timeline`
  pedida a DB. El test T1.9 fija ahora un techo (≤ 20) para que no crezca sin querer.
- **F9-21 (`opportunity_stage_history.changed_by` siempre NULL)** es un defecto de
  `fn_log_stage_change`; queda anotado y pedido a DB (F9 no aplica DDL).
- **F9-26 (tamaño de archivos)**: `sources.ts` bajó de 308 a 248 L al extraer `cursor.ts` y
  `whatsappSource.ts`. `clientes/[id]/page.tsx` (477 L), `ActividadesPage.tsx` (384 L),
  `BulkActionsDialog.tsx` (950 L) y `opportunitiesService.ts` (907 L) siguen por encima de
  300 L: son preexistentes y partirlos en esta ronda habría mezclado refactor con
  correcciones críticas; queda pendiente y explícito, no "ningún archivo supera 308 L".

**Pendientes tras la ronda 2**: la petición a DB (F9-01 bloqueante, publicación realtime,
`changed_by`, RPC del timeline), el modo "Agente IA" (F6), la invitación `.ics` (F7),
`MessageBubble` compartido con `chat/`, la verificación visual con sesión y el reparto de
los 4 archivos preexistentes de más de 300 L.

---

## 13 ter. Registro de implementación — ronda 3 (2026-09-09)

Correcciones del informe `scratchpad/reports/TEST-F9-r2.md` (58 casos, 15 fallos, 6/10),
hallazgos **F9-30 … F9-44**. Detalle por hallazgo en `scratchpad/reports/F9-r3.md`.

### Lo que cambia de raíz

1. **La invariante de cierre vive en la BD** (F9-31). `fn_sync_status_from_stage` ya no
   deriva un desenlace terminal cuando faltan los datos de cierre. Verificado en vivo con
   `begin; … rollback;`: escribir solo `stage_id` hacia una etapa `is_won` deja
   `status='open'`, `closed_at=null` y **ninguna comisión**. Por eso `opportunityStageService`
   deja de presentarse como la garantía y `reconcileStatus` pasa a
   `opportunityStageReconcile.ts` como red de seguridad con guarda optimista.

2. **La paginación del timeline deja de perder datos por tres vías distintas**
   (F9-30, F9-32, F9-33), y las tres tenían la misma forma: *algo que se descarta después de
   consultar convierte "quedan filas" en "fuente agotada"*. La cola segura sale ahora de las
   filas **leídas**, el cursor conserva los microsegundos, y WhatsApp añade una ventana que
   alcanza los días anteriores por muy cargado que esté el día del cursor.

3. **La escritura de etapas tiene puerta y cerrojo** (F9-41). Puerta:
   `/api/crm/stages` con comprobación de rol y de organización. Cerrojo: en la BD,
   `update_stage_without_triggers` deja de ser un `SECURITY DEFINER` ejecutable por `anon`
   sin ninguna comprobación de pertenencia — era un agujero de multi-tenancy con el que
   cualquiera con la clave publicable podía reconfigurar etapas de otras organizaciones.

### Verificación de la ronda 3

- `npx jest` (repo completo) → **1409 verdes · 8 saltados · 2 rojos / 1419 casos, 86 suites**;
  la única roja es `src/lib/services/website/__tests__/sectionContract.test.ts` (2 tests), del
  módulo website, ajena y preexistente. De los 8 saltados, 7 son de `f6Adversarial` (F6), que
  sondea la API REST real y en esa ejecución respondió `api_caida` por timeout de red; en la
  primera pasada de la ronda sí corrieron. No dependen de F9.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → **219 errores**, exactamente la
  cifra del informe del tester; **0** en archivos de F9, incluidas las dos rutas nuevas.
- Los 9 `test.failing` del tester (R2.1-R2.4, R2.6, R2.7, S2.3, S2.6, S2.7) son ahora `test`
  normales: mismo escenario, mismo assert, sin invertir nada. No queda ninguno.
- **BD (todo con `begin; … rollback;`, sin dejar nada creado)**: empleado que marca `is_won`
  → bloqueado; empleado que edita nombre/color → permitido; empleado que llama al RPC →
  bloqueado; admin que marca `is_won` → permitido; admin que intenta ganadora + perdedora →
  bloqueado; `anon` que llama al RPC → `permission denied`; cambio de etapa → el historial
  guarda `changed_by = auth.uid()`.

### Desviaciones y decisiones de la ronda 3

- **WhatsApp: una entrada tiene tope, un día no se pierde** (F9-33/F9-34). Un grupo sigue
  siendo indivisible (conversación + día de Bogotá) porque de eso depende que su cabecera sea
  reconstruible desde cualquier cursor; lo que cambia es que la entrada lleva como mucho 50
  mensajes (`GROUP_CAP`) y lo declara con `truncated`, y que con cursor se lanza una segunda
  consulta acotada al inicio del día del cursor. Coste: hasta 2 consultas más a `messages`
  cuando hay cursor (sin cursor, ninguna).
- **`finish()` recibe el filtro en memoria en vez de aplicarlo antes**. Es la forma de que la
  cola salga de lo leído sin duplicar la lógica en cada fuente.
- **El correctivo de estado se conserva** aunque la BD ya garantice la invariante: protege un
  despliegue con la función antigua. Pero ahora (a) no toca la fila si otro proceso la cerró
  con datos de cierre válidos, (b) lleva la guarda `updated_at`, (c) comprueba el resultado y
  (d) si no hay `updated_at` **no escribe**, en vez de escribir a ciegas.
- **Permisos de etapa por rol, no por permiso granular**. No existe tabla de permisos
  granulares en el esquema; el criterio es `Super Admin` / `Admin de organización` / `Manager`
  o `organization_members.is_super_admin`, centralizado en `stagePermissions.ts` y replicado
  en la BD. Si algún día hay `permissions`, se cambia en un solo sitio.
- **RLS de `stages` sin tocar.** Restringir INSERT/DELETE por rol habría roto el sembrado de
  pipelines (`pipelineSeedService`, `pipelineTemplates`, `onboardingService`, `expansionService`,
  `renewalService`), que no son de F9. Lo que sí se cierra en la BD es lo que tiene
  consecuencias contables: `is_won`/`is_lost`.
- **El simulador de tests es ahora estricto** (F9-40): `eq` sobre columna ausente o NULL no
  casa, `select('…!inner(…)')` filtra, `contains` compara de verdad, los timestamps se
  comparan con precisión de microsegundos y hay `update()`. Al endurecerlo, los fixtures de
  `timelineService.test.ts` dejaron de pasar por falta de `organization_id` y claves de
  relación: **ese era justo el punto**, y ahora hay pruebas reales de aislamiento entre
  organizaciones (`f9Round3Builder.test.ts`, casos B3.1-B3.3).
- **F9-44**: el test T1.9 deja de ser una banda de tolerancia (10..20) y fija la lista exacta
  de las 12 consultas por página. F9-20 (bajarlas con una RPC) sigue abierto y declarado.
- **Límite conocido, declarado**: la hidratación de `email_events` sigue con un tope global
  (`min(1000, max(50, n*10))`) en vez de por mensaje. Es la misma familia que F9-33 —un
  elemento dominante se come el presupuesto— pero acotada: solo afecta a las insignias de
  aperturas/clics de los emails más antiguos de la página, nunca hace desaparecer una entrada.
- **Archivos > 300 L**: `opportunityStageService.ts` y `meetingsService.ts` se pasaron al
  crecer y se han partido (`opportunityStageReconcile`, `opportunityStageData`, `meetingsIcs`,
  `timeline/timestamps`). Siguen por encima, preexistentes y ajenos a esta ronda:
  `clientes/[id]/page.tsx` (477 L), `ActividadesPage.tsx` (384 L), `BulkActionsDialog.tsx`
  (950 L), `opportunitiesService.ts` (907 L).

**Pendientes tras la ronda 3**: publicar `opportunities` y `stages` en `supabase_realtime`;
la RPC `fn_crm_timeline` (F9-20); reparar la única oportunidad histórica con `win_data` vacío
(propuesta en el informe, **no ejecutada**); el modo "Agente IA" (F6); la invitación `.ics`
(F7); `MessageBubble` compartido con `chat/`; y la verificación en navegador con sesión, que
sigue sin hacerse.
