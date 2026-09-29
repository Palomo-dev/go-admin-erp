# GO Asistente — del Figma al código (escritorio)

- **Fecha:** 2026-09-29
- **Alcance:** el asistente del header para las organizaciones clientes (GO Assistant). **No** es el
  chat de atención al cliente final (`ai-auto-response`, ADR-001): comparten cobro de créditos y
  resolución de organización, nada más.
- **Figma:** archivo `EAvjINVRnlzFM70GVoWXgl`, página «03 Navegación y shell», sección
  «GO Asistente — escritorio (propuesta)» (`667:34452`). Componentes en «02 Componentes» › «GO
  Asistente — escritorio (Nuevo)» (`660:15723`). Capturas en `docs/design/figma/40-asistente-*.png`.
- **Antecedentes:** `docs/design/GO-ASISTENTE-ESCRITORIO.md` (análisis y propuesta del 2026-09-23),
  `docs/PROMPT-CLAUDE-CODE-ASISTENTE-AGENTE.md` (plan), ADR-002/003/004 y
  `docs/ia-chat/HANDOFF-GO-ASSISTANT-2026-09-29.md`.
- **Datos:** el repositorio es público. Aquí solo hay agregados; ningún nombre de organización.

---

## 1. Estructura actual (antes de este cambio)

### 1.1 Rutas HTTP (`src/app/api/ai-assistant/**`)

Todas empiezan por `getServerOrgContext(request)` (guardarraíl 11) y la organización nunca sale del
body (`readOrgBody`).

| Ruta | Qué hace | Créditos |
|---|---|---|
| `POST /stream` | Turno en SSE: `meta`, `token`, `tool_start`, `tool_end`, `action`, `question`, `usage`, `error`, `done` | `checkAICredits` antes; `chargeAiCredits('assistant_chat')` después, una vez por turno y solo si hubo tokens |
| `POST /chat` | Camino de respaldo sin stream (solo si el transporte falló antes de empezar) | igual |
| `POST /execute-action` | Confirma una propuesta por `actionId` (o la cierra con una entidad `external` creada en el formulario del módulo). Reevalúa permisos al ejecutar | **no cobra**: `ai_agent_actions.credits` vale 0 en todas las filas |
| `POST /reject-action` | Rechaza (compare-and-set `pending/confirmed → rejected`) | — |
| `POST /undo-action` | Compensa dentro de `undo_window_minutes` (15) con `undoService` | — |
| `POST /suggestions` | Sugerencias según `currentPath` validado (`suggestionsForPath`) | — |
| `POST /attachments` | Sube adjuntos al bucket privado `ai-attachments` | — |
| `GET/DELETE /conversations[/id]` | Historial (solo los hilos del propio usuario) y archivar | — |
| `POST /transcribe` · `POST /tts` | Nota de voz → texto · respuesta en audio (si `tts_enabled`) | saldo antes, cobro después |
| `GET /credits` | Saldo y nivel (`ok`/`low` < 50/`empty`) | lectura |
| `GET/PATCH /settings` | Nivel de capacidad de la organización | — |

### 1.2 Orquestador y catálogo

- **Bucle del agente**: `src/lib/ai/agent/runAgent.ts`. Máximo 4 vueltas modelo → herramientas.
  Riesgo `low` se ejecuta y vuelve al modelo; `medium`/`high` se **propone** (fila en
  `ai_agent_actions`, caduca a 30 min) y pausa el turno; una sola propuesta por turno.
  `preguntar_opciones` pausa con la pregunta A/B/C/Otro (decisión del dueño: sin formularios).
- **Herramientas** (`src/lib/ai/agent/tools/*`): 17 registradas (10 de lectura, 7 de escritura
  transaccional por RPC `SECURITY INVOKER`). Catálogo viejo en `actionCatalog.ts` +
  `aiActionsService.ts`.
- **Permisos**: `getAssistantCapabilities` = nivel de la organización ∩ permisos del usuario ∩
  módulos activos. El catálogo se filtra **antes** de ofrecérselo al modelo y se reevalúa al ejecutar.
- **Confirmación**: `ActionConfirmationForm` de solo lectura; «Corregir» rechaza en el servidor y la
  frase siguiente produce otra propuesta (`correction.ts`).
- **Deshacer**: `undoService.ts` compensa (anula, ajuste contrario, cancela); `registrar_venta` no se
  deshace.
- **Modelo**: `ai_assistant_settings.model_overrides` → `ai_settings.model` → `OPENAI_MODEL` →
  default (`modelRouter.ts`). Nunca cableado.
- **Streaming**: `streamClient.ts` (fetch + lector; `EventSource` no hace POST). Un corte nunca se
  reintenta solo: pudo cobrar o dejar propuesta.

### 1.3 UI del panel (antes)

`AIAssistantPanel.tsx` (1.040 líneas) montado por `AppLayout.tsx` como columna hermana del shell;
`w-80 xl:w-96`; cabecera `bg-blue-600` con «GO Assistant» en inglés; mensajes sin avatares (ya
corregido el 2026-09-29); pasos plegables; tarjeta con desenlace en su sitio; saldo al pie; pestaña
flotante de 40 × 40; sin atajo; errores del stream dentro de la burbuja; pie con «Modelo: …»; textos
cableados en español (sin i18n); `branchId` nunca llegaba al panel.

### 1.4 Base de datos (verificada por MCP, solo lectura, 2026-09-29)

| Tabla | Hoy |
|---|---|
| `ai_assistant_conversations` | 26 hilos de 5 organizaciones; 0 archivados; todos `channel=text` |
| `ai_assistant_messages` | 101 mensajes; **`credits` vacío en todos**; último del 2026-09-20 |
| `ai_agent_actions` | 23 propuestas, **todas `create_customer`**: 20 ejecutadas, 1 rechazada, 1 deshecha, 1 caducada; `credits` = 0 en las 23 |
| `ai_attachments` | 2 |
| `ai_assistant_settings` | 89 organizaciones, todas `write_full`; **ninguna con `tts_enabled`** |
| `ai_usage_logs` | 27 cobros `assistant_chat` (media 4,74 créditos, mediana 4) y 2 `assistant_stt` (1 crédito) |
| `ai_settings` | 44 con `credits_reset_at`, **ninguna con fecha futura** |
| `organization_modules` | 43 organizaciones con `gym` **y** `memberships` activos a la vez (alias) |

RLS relevante: `ai_usage_logs` y `ai_assistant_settings` se pueden leer por cualquier miembro activo
de la organización (así el panel lee promedio y voz con la sesión del usuario, sin service role).

### 1.5 Pruebas existentes

`src/__tests__/services/goAssistant*.test.ts` (F0–F6, moneda, clientes, facturas, preguntas, panel),
`assistant*.test.ts`, `src/lib/ai/**/__tests__`, `src/app/api/ai-assistant/**/__tests__`,
`src/components/app-layout/Header/__tests__/assistantHistory.test.ts` (intérprete aislado del panel)
y `src/__tests__/guardrails.test.ts`.

**Por qué fallaba `goAssistantF6.test.ts`.** No era la prueba: era un defecto real. El módulo «gym»
se generalizó como «memberships» (`src/lib/config/moduleAliases.ts`) y el catálogo de navegación ya
no tiene páginas para `gym`. La prueba seguía con el fixture viejo (`/app/gym/membresias`), y la
herramienta `listar_modulos_activos` **no canonizaba el alias**: a las 43 organizaciones que tienen
las dos filas activas les contaba un módulo «Gimnasio» sin ninguna pantalla además del de
Membresías. Se arregló en la herramienta (§4) y el fixture pasó a reflejar la base real.

---

## 2. Inventario del Figma

La sección tiene **16 pantallas** (1440 × 900, copias del shell expandido) y 17 componentes. No hay
pantallas móviles en esta sección: el móvil existente (`AssistantPanel` Variant=mobile, hoja a
pantalla completa) se conserva.

| # | Pantalla | Nodo | Estado en código |
|---|---|---|---|
| 01 | Cerrado: botón, pestaña 28 × 96 y tooltip «Ctrl+J» | `667:34455` | **Hecho** (pestaña + atajo); tooltip del botón del header: pendiente del shell |
| 02 | Bienvenida con sugerencias de la página | `667:34706` | **Hecho** |
| 03 | Respuesta en markdown con tabla | `667:35253` | **Hecho** |
| 04 | Pensando y consultando (pasos, Detener) | `667:35749` | **Hecho** |
| 05 | Pregunta de aclaración A/B/C | `667:36162` | **Hecho** (+ teclado) |
| 06 | Confirmación antes de ejecutar | `667:36553` | **Hecho** (con mejoras, §3) |
| 07 | Acción completada con Deshacer | `667:36967` | **Hecho** («Ver cliente» + «Deshacer · N min») |
| 08 | Carga masiva (acoplado) | `667:37374` | **Hecho** |
| 09 | Carga masiva (ampliado 720, sidebar en rail) | `668:37351` | **Hecho el panel de 720**; sidebar en rail: pendiente del shell |
| 10 | Historial de conversaciones | `668:38333` | **Hecho** (grupos en la zona de la organización) |
| 11 | Créditos bajos | `668:38793` | **Hecho** (con promedio real) |
| 12 | Sin créditos (composer bloqueado) | `668:39178` | **Hecho** |
| 13 | Error: respuesta incompleta, con Reintentar | `668:39619` | **Hecho** |
| 14 | Sin permiso | `668:40068` | **Hecho** |
| 15 | Dictando una nota de voz | `668:40449` | **Hecho** (onda con nivel real) |
| 16 | Pantalla 03 en modo oscuro | `668:40896` | **Hecho** (solo tokens semánticos) |

### 2.1 Mapa frame ↔ componente Figma ↔ código ↔ API

| Componente Figma | Nodo | Código | API / evento |
|---|---|---|---|
| `AsistentePanelEscritorio` (acoplado/ampliado) | `665:399342` | `Header/AIAssistantPanel.tsx` | — |
| `AsistenteCabecera`, `AsistenteBotonCabecera` | `660:16002`, `660:15791` | `assistant/PanelHeader.tsx` | — |
| `AsistenteBienvenida`, `AsistenteSugerencia` | `660:16014`, `660:16009` | `assistant/WelcomeView.tsx` | `POST /suggestions` |
| `AsistenteContexto` (chip de página) | `660:16003` | `assistant/Composer.tsx` + `usePaginaActual.ts` | `currentPath` en `/stream` y `/suggestions` |
| `AsistenteMensaje` | `662:15899` | `assistant/MessageBubble.tsx` | `token`, `done` |
| `AsistenteTablaRespuesta` | `662:15900` | `Header/MarkdownRenderer.tsx` (tablas GFM) | `token` |
| `AsistentePasos` | `662:16000` | `assistant/TurnInProgress.tsx` | `tool_start`, `tool_end` |
| `AsistentePregunta` | `662:16001` | `assistant/QuestionCard.tsx` | `question` |
| `AsistenteConfirmacion` | `663:16182` | `Header/ActionConfirmationForm.tsx` | `action` → `/execute-action`, `/reject-action`, `/undo-action` |
| `AsistenteCargaMasiva` | `663:16533` | `assistant/BulkPreviewTable.tsx` | `action.preview.bulk` |
| `AsistenteComposer` | `664:16404` | `assistant/Composer.tsx` | `/attachments`, `/transcribe`, `/credits` |
| `AsistenteAviso` | `664:16499` | `assistant/AssistantNotice.tsx` | `error.code`, `notice`, 401/403 |
| `AsistenteHistorial`, `AsistenteHistorialFila` | `664:16540`, `664:16539` | `assistant/ConversationHistory.tsx` | `GET/DELETE /conversations` |
| `AssistantLauncher` edge-tab | `45:2223` | `assistant/EdgeTab.tsx` | — |

Iconos: todos son Lucide (Bot, SquarePen, History, Volume2/VolumeX, Maximize2/Minimize2,
PanelRightClose, Coins, MapPin…), así que se usan de `lucide-react` con trazo 1,5, sin descargar
recursos. Colores: solo tokens semánticos del kit (`bg-brand`, `bg-brand-action`, `text-fg`,
`text-fg-secondary`, `bg-subtle`, `bg-canvas`, `border-line`…), que cubren claro y oscuro sin `dark:`.

---

## 3. Brechas del Figma y mejoras aplicadas

| Tema | El Figma | Lo implementado y por qué |
|---|---|---|
| Créditos en la tarjeta | «≈1 crédito» | «Confirmar no gasta créditos». Es lo cierto: ejecutar no llama al modelo y el turno que preparó el resumen ya se cobró (0 créditos en las 23 acciones de la base). Mostrar un costo que nunca se cobra sería engañoso |
| Riesgo alto | Un clic | **Doble paso**: el primer «Confirmar» repite el resumen («Vas a: …») y pide «Sí, confirmar». Lo exige §6.2 del plan y no estaba en la UI |
| Caducidad | No aparece | «La propuesta caduca en N min» en los últimos 5; caducada bloquea «Confirmar» y ofrece «Pedir un resumen nuevo» (antes, el servidor respondía 409) |
| Deshacer | «Deshacer · 15 min» fijo | Minutos **reales** que quedan (`undoUntil` nuevo en `/execute-action`) y estado «Deshecha» en la tarjeta |
| «Ver cliente» | Botón | Enlace a la ficha real (`entityLinks.ts`); una prueba comprueba que cada ruta `[id]` existe |
| Créditos bajos | «Alcanzan para unas 4 respuestas… se renueva el 1 de octubre» | Promedio **real** de la organización (`avgPerReply`, últimos 50 cobros; sin estimación con menos de 3). **Sin fecha de renovación**: ninguna organización tiene `credits_reset_at` futura. Se puede descartar |
| Sin créditos | Aviso al escribir | Aviso **al abrir** y composer bloqueado; al volver a la pestaña se relee el saldo (quizá compró en otra) |
| Tipos de aviso | 4 | 6: + **sesión caducada** (401, con «Iniciar sesión») y **límite de velocidad** (429). «Reintentar» solo donde puede servir |
| Sin permiso | El modelo lo decía con sus palabras | Evento SSE nuevo `notice { code: 'FORBIDDEN_TOOL' }` cuando el modelo pide una herramienta que existe pero no se le ofreció; y 403 de `/execute-action` (permisos retirados entre proponer y confirmar) |
| Reintentar | Botón | Manual (nunca automático) y **sin duplicar** la burbuja del usuario |
| «Escuchar» | Solo si la voz está activa | Ahora se sabe al abrir (`ttsEnabled` en `/credits`); antes se descubría al primer clic fallido y **ninguna** organización la tiene activa |
| Atajo | Ctrl+J abre/cierra | Tres casos: cerrado → abre; abierto con el foco fuera → **enfoca**; foco dentro → cierra. Por tecla física (teclados no QWERTY). Esc: detiene la respuesta, vuelve del historial o cierra |
| Pregunta | «Atajo: pulsa A, B o C» | Implementado con foco en la tarjeta; «O» = Otro; Ctrl+C sigue copiando; «A, B o C» con `Intl.ListFormat` en los 4 idiomas |
| Nota de voz | Onda dibujada | **Nivel real** del micrófono (AnalyserNode); Esc cancela sin transcribir (no cobra) |
| Chip de página | Solo informativo | Se puede **quitar** (la descripción del componente lo pedía): deja de mandarse `currentPath` |
| Carga masiva | «leído sin IA, sin costo» | No se afirma: una foto sí pasa por visión. «Ver en grande» amplía el panel donde cabe (≥ 1280 px); por debajo despliega la tabla en su sitio |
| Historial | Hoy / Ayer / Esta semana | Grupos en la **zona de la organización** (`toPlainDate`), no UTC; + «Anteriores»; «Archivar» visible también con el teclado |
| Accesibilidad | — | Región `status` que anuncia la fase (no cada token), `aria-busy`, `aria-pressed`, `aria-keyshortcuts`, tooltips con el nombre de cada botón, `inert` con el panel cerrado, `prefers-reduced-motion` en puntos, giros y cursor |
| Rendimiento | — | `MessageBubble` con `React.memo` (antes cada token re-interpretaba el markdown de todo el hilo); la tabla masiva virtualizada; scroll automático solo si la persona ya estaba abajo; sugerencias solo en la bienvenida |
| Móvil | No está en la sección | Se conserva la hoja a pantalla completa; botones de 40 px; sin «Ampliar»; sin foco automático (abriría el teclado) |
| Idiomas | Solo español | Namespace `asistente` en es/en/fr/pt (175 claves), cubierto por `traduccionesModulos.test.ts` |
| Nombre del modelo | Quitado | Quitado del pie |
| Sucursal | — | El panel lee la sucursal del `BranchProvider`; `CustomerFormDialog` ya no recibe `null` (hallazgo 12 del diseño) |

---

## 4. Estado de la implementación (2026-09-29)

### 4.1 Archivos

**Nuevos**
- `src/lib/ai/assistant/panelUi.ts` — lógica pura: modo, atajo, fase, avisos, créditos, deshacer,
  teclado de la pregunta, doble confirmación, historial por día, iconos de sugerencias.
- `src/lib/ai/assistant/entityLinks.ts` — «Ver <entidad>».
- `src/components/app-layout/Header/assistant/{PanelHeader,AssistantNotice,WelcomeView,TurnInProgress,MessageBubble,EdgeTab}.tsx`
  y `usePaginaActual.ts`.
- Pruebas: `src/lib/ai/assistant/__tests__/panelUi.test.ts`,
  `src/components/app-layout/Header/__tests__/assistantPiezas.render.test.tsx`.

**Modificados**
- Panel: `Header/AIAssistantPanel.tsx`, `ActionConfirmationForm.tsx`, `MarkdownRenderer.tsx`,
  `assistant/{Composer,QuestionCard,BulkPreviewTable,ConversationHistory}.tsx`.
- Servidor (aditivo, sin cambiar contratos): `api/ai-assistant/credits/route.ts` (+`avgPerReply`,
  +`ttsEnabled`), `api/ai-assistant/execute-action/route.ts` (+`undoUntil` en la respuesta),
  `lib/ai/agent/runAgent.ts` (+evento `notice`), `lib/ai/assistant/streamClient.ts` (+`onNotice`
  opcional), `lib/ai/assistant/{clientTypes,credits}.ts`.
- Defecto de F6: `lib/ai/agent/tools/navegacion.ts` (canoniza alias de módulo y deduplica).
- Punto de montaje, **edición mínima**: `app-layout/AppLayout.tsx` — se retira el cuadrado flotante
  de 40 × 40 (la pestaña y el atajo los pinta el panel) y sus dos imports que quedaban sin uso.
- i18n: `messages/{es,en,fr,pt}.json` › `asistente`. **Aviso de coordinación**: la sesión del shell
  commiteó estos cuatro archivos completos en `df9ca960` y el namespace entró con ese commit.
- Pruebas: `goAssistantF6.test.ts` (fixture real), `goAssistantPanelUX.test.ts` (textos vía i18n),
  `Header/__tests__/assistantHistory.test.ts` (intérprete ampliado + 5 casos nuevos),
  `i18n/traduccionesModulos.test.ts` (registra `asistente`).

Sin migraciones: nada de lo anterior las necesitó.

### 4.2 Lo que no cambió (y vigilan las pruebas)

Organización de la sesión; permisos resueltos en el servidor; la propuesta vive en el servidor y se
confirma solo con `actionId`; saldo antes y cobro después; un stream cortado no se reintenta solo; un
`route.ts` solo exporta handlers; deshacer compensa; preguntas A/B/C en vez de formularios.

### 4.3 Verificación

- `jest` de la zona (asistente, `src/lib/ai`, rutas `ai-assistant`, `Header`, `guardrails`, `i18n`,
  navegación): **39 suites, 1.458 pruebas en verde** con `TZ=UTC`; las del panel también con
  `TZ=America/Bogota`. `goAssistantF6.test.ts` pasa (19/19; fallaba 1).
- `tsc` acotado (tsconfig temporal con los archivos tocados, sus pruebas y todas las rutas
  `ai-assistant`): **0 errores**. No se corrió el `tsc` completo ni `next build` (poca memoria en la
  máquina; instrucción del encargo).
- `eslint` de todos los archivos tocados: limpio.
- **No** hubo prueba en navegador (hace falta sesión).

### 4.4 Pendientes

| Qué | Depende de |
|---|---|
| Sidebar en rail con el panel ampliado (pantalla 09) | Sesión del shell: escuchar `window` › `go-asistente:estado` `{ abierto, modo }` en `SidebarShell` |
| Header compacto con el panel abierto (buscador en icono, sin chip de plan) y tooltip «Abrir GO Asistente · Ctrl+J» con `aria-keyshortcuts` en el botón del header | Sesión del shell (`AppHeader.tsx`) |
| Recordar si el panel quedó abierto al recargar | Decisión del dueño (pregunta 9 del diseño) |
| «N acciones» en cada fila del historial | Contar `ai_agent_actions` ejecutadas por hilo en `listConversations` |
| Guardar `credits` por mensaje en `ai_assistant_messages` (hoy vacío en todas) | Tocar `runAgent` y `conversationStore`; sin migración |
| `PendingAction.type` está tipado como `AIActionType` (catálogo viejo) pero recibe nombres de herramienta del agente | Ampliar el tipo; no afecta en ejecución |
| Prueba en navegador de todo lo anterior | Sesión del dueño |

### 4.5 Decisiones para el dueño

1. **«Confirmar no gasta créditos»** en vez de «≈1 crédito»: ¿de acuerdo? (Es lo que pasa hoy.)
2. **Doble confirmación en riesgo alto** (facturas, ajustes, cargas masivas): la pide el plan §6.2;
   añade un clic. ¿Se mantiene?
3. **Ampliado solo desde 1280 px**: por debajo el panel se queda en 400 y la tabla masiva se
   despliega en su sitio. ¿O pantalla completa sobre el contenido?
4. **Saldo visible para todos** los usuarios (hoy) o solo administradores.
5. **Voz de salida**: con la organización sin voz, el botón se ve deshabilitado con el motivo. ¿O se
   oculta?
6. **Atajo Ctrl/⌘+J** (Chrome lo usa para Descargas; el panel lo intercepta solo dentro del ERP).

## Decisiones del dueño (2026-09-30)

Aprobadas tal como quedaron implementadas:

1. La tarjeta de acción dice «Confirmar no gasta créditos» (no «≈1 crédito»): confirmar no cobra.
2. Doble confirmación en acciones de riesgo alto (facturas, ajustes, cargas masivas).
3. Modo ampliado solo desde 1280 px; por debajo el panel se queda en 400 px.
4. El saldo de créditos lo ven todos los usuarios.
5. Con la voz apagada en la organización, «Escuchar» se ve deshabilitado con el motivo.
6. Atajo Ctrl/⌘+J (dentro del ERP lo toma el asistente, aunque en Chrome abre Descargas).
