# PM — Tareas, metas y proyectos: diseño en Figma y plan de centralización (2026-09-23)

Archivo de Figma `EAvjINVRnlzFM70GVoWXgl`. Capturas en `docs/design/figma/56-pm-*.png` (29 archivos).
Datos ficticios («Ana Gómez», «Carlos Ruiz», «Distribuciones El Roble S.A.S.»).

Pedido del dueño: diseñar el PM igual que el CRM. Se conserva lo que funciona hoy, se lleva al manual
de marca y al kit, y se **centraliza**: una sola tarea (`TaskForm`) que abren el PM, el CRM
(oportunidad, ficha del cliente, acciones rápidas), las notificaciones y la vista rápida del header.

## 0. Dónde está

| Qué | Dónde | Id |
|---|---|---|
| Componentes | `02 Componentes` › sección **«PM (Nuevo)»** (x=0, y=138800) | `830:533232` |
| Pantallas | página nueva **«12 PM y tareas»** («09» ya es «Documentos») | `832:539029` |
| Sección de pantallas | «PM — Tareas, metas y proyectos (propuesta)» | `833:538003` |
| Reemplazos en `11 CRM` | 2 instancias de `TaskQuickView` → `TaskForm` (§4) | `772:21577`, `773:473617` |

## 1. Qué se conservó de hoy

- **Tareas**: las cuatro vistas (Lista, Kanban, Calendario, IA Planner) como pestañas; los filtros de
  hoy (estado, proyecto, vencimiento con sus atajos, prioridad, responsable, módulo, tipo) pasan al
  `FilterPanel` del kit con chips; los KPI de pendientes, en progreso, vencidas y completadas.
- **Formulario**: los mismos campos de `TaskCreationPanel` (título, descripción con «Generar con
  IA», tipo, prioridad, proyecto, cliente, «Relacionado con» espacio/reserva/venta, meta, fecha,
  horas estimadas y reales, responsable, estado, subtareas con «Desglosar con IA», adjuntos de 10 MB,
  dependencias `blocks`/`relates_to`) y el cronómetro de `TaskTimer`.
- **Metas**: tipos Meta / Propósito / Propuesta, resultados clave con métrica número / porcentaje /
  moneda / sí-no, avance ponderado por horas estimadas (`recalcGoalProgress`), tareas por KR.
- **Proyectos**: estados `draft|active|on_hold|completed|cancelled`, salud
  `on_track|at_risk|off_track`, miembros con rol, hitos (`milestones`) y «repartir tareas»
  (`distributeProjectTasks`).

## 2. Componentes — `02 Componentes` › «PM (Nuevo)» `830:533232`

| Componente | Set | Variantes (id) |
|---|---|---|
| Íconos lucide nuevos | — | `Icon/Target` `830:533239`, `Icon/Flag` `830:533243`, `Icon/Timer` `830:533248`, `Icon/ListChecks` `830:533255`, `Icon/FolderKanban` `830:533261` |
| `TimerChip` | `830:533290` | `Estado=detenido\|corriendo` × `Tamaño=sm\|md`: `830:533264`, `830:533270`, `830:533277`, `830:533283` |
| `TaskRow` | `830:533866` | `Estado=pendiente\|en progreso\|vencida\|completada\|cancelada\|cargando` × `Layout=escritorio\|móvil`. Escritorio: `830:533293`, `830:533363`, `830:533430`, `830:533499`, `830:533562`, `830:533626`. Móvil: `830:533640`, `830:533675`, `830:533717`, `830:533762`, `830:533809`, `830:533857`. Propiedades de texto `Título` y `Contexto` enlazadas; `Vence texto` se sobrescribe por instancia |
| `TaskCard` (kanban) | `830:534109` | `Estado=normal` `830:533869`, `vencida` `830:533914`, `en progreso` `830:533967`, `completada` `830:534019`, `arrastrando` `830:534064` |
| `SubtaskList` | `830:534263` | `Estado=listo` `830:534112`, `vacío` `830:534232` |
| `PMRowMenu` (menú «⋯», un ícono por acción) | `830:534552` | `Tipo=tarea` `830:534266`, `meta` `830:534360`, `proyecto` `830:534457` |
| `GoalCard` | `831:26579` | `Estado=activa` `831:26280`, `en riesgo` `831:26342`, `lograda` `831:26402`, `abandonada` `831:26461`, `borrador` `831:26520` |
| `KeyResultRow` (editable en línea) | `831:26800` | `Estado=lectura` `831:26582`, `editando` `831:26638`, `logrado` `831:26700`, `en riesgo` `831:26752` |
| `ProjectCard` | `831:27123` | `Estado=activo` `831:26803`, `en pausa` `831:26872`, `completado` `831:26941`, `borrador` `831:27003`, `cancelado` `831:27063` |
| `GoalCloseDialog` | `831:27348` | `Resultado=lograda\|abandonada` × `Layout=dialog\|sheet`: `831:27126`, `831:27183`, `831:27238`, `831:27292` |
| **`TaskForm`** | `832:538017` | ver tabla siguiente |

### TaskForm — el formulario único

`Layout=page|dialog|sheet` · `Mode=create|edit` · `Origen=general|oportunidad|cliente|notificación|meta`.
No es el producto cartesiano completo (30): se dibujaron las 10 combinaciones que usa algún punto de
entrada. Una combinación nueva se agrega como variante del mismo set, nunca como otro formulario.

| Variante | Id | Tamaño |
|---|---|---|
| page · create · general | `832:534738` | 1128 × 960 |
| page · edit · general (detalle en página) | `832:535025` | 1128 × 1287 |
| dialog · create · general | `832:535602` | 640 |
| dialog · create · oportunidad | `832:535903` | 640 |
| dialog · create · meta | `832:536200` | 640 |
| sheet · create · general | `833:553857` | 480 |
| sheet · create · cliente | `832:536508` | 480 |
| sheet · create · oportunidad | `832:536820` | 480 |
| sheet · create · notificación | `832:537117` | 480 |
| sheet · edit · general (detalle en hoja) | `832:537424` | 480 |

Reglas que el diseño fija:
- **Proyecto opcional**: «Proyecto (opcional)» con «Sin proyecto» por defecto. Lo mismo para meta,
  cliente y «Relacionado con». Solo el título es obligatorio.
- **Vence = fecha + hora** en la zona de la organización, con el aviso «Hora de la organización:
  Bogotá (GMT-5). Editar la tarea no corre la fecha.» (`due_date` es `timestamptz`).
- **Responsable por defecto = usuario actual** («Ana Gómez (tú)»). Hoy la acción rápida del CRM la
  crea sin asignar.
- **Origen**: la ficha de contexto (oportunidad, cliente, notificación, meta + KR) llega prellenada
  y **fijada** («🔒 Fijado»). Guardar la tarea nunca borra esa relación.
- **Mode=edit es el detalle**: la misma hoja o página muestra estado, cronómetro («Marcar como
  completada» + `TimerChip`), subtareas, adjuntos, dependencias, tiempo registrado y actividad. No hay
  una vista de detalle aparte.
- En móvil, la misma instancia `Layout=sheet` a 390 px (los campos dobles caben; «Eliminar» pasa a
  ícono en el pie).

### Tonos de badge (SISTEMA-BADGES §4)

| Dato | Valores → tono |
|---|---|
| Estado de tarea | Pendiente neutro · suave; En progreso información · suave; Completada éxito · suave; Cancelada neutro · contorno; Vencida N d peligro · suave |
| Prioridad | Baja neutro; Media información; Alta advertencia (como en `TaskQuickView`); Crítica peligro · sólido |
| Meta | Borrador neutro; Activa información; En riesgo advertencia (derivado); Lograda éxito; Abandonada neutro · contorno |
| Proyecto | Borrador neutro; Activo éxito; En pausa advertencia; Completado éxito · contorno; Cancelado neutro · contorno. Salud con punto: En curso éxito, En riesgo advertencia, Atrasado peligro |

## 3. Pantallas — página `12 PM y tareas`, sección `833:538003`

Escritorio 1440 con `Sidebar` + `AppHeader`; móvil 390 con `MobileHeader Mode=page` + `MobileTabBar`.

| Grupo | Frames |
|---|---|
| Tareas escritorio | lista agrupada por vencimiento `833:538005`, kanban por estado `833:539181`, calendario `833:540019`, detalle abierto en hoja `?tarea=T-1042` `833:540569`, nueva tarea (diálogo) `833:541082`, menú «⋯» de fila `833:541371` |
| Tarea en página | detalle `/app/pm/tareas/T-1042` `833:550095`, nueva `/app/pm/tareas/nueva` `833:550925` |
| Estados escritorio | cargando `833:551526`, vacío con primer paso `833:552037`, sin resultados `833:552439`, error `833:552939`, sin permiso `833:553389` |
| Tareas móvil | lista agrupada `834:9403`, kanban (una columna por estado) `834:9975`, calendario semana + agenda `834:10287`, detalle en hoja `834:10592`, nueva tarea (hoja) `834:11027`, hoja de acciones «⋯» `834:11388`, vacío `834:11515`, cargando `834:11729` |
| Metas escritorio | tarjetas con avance `844:93467`, detalle con KR editables y tareas ligadas `844:94384`, marcar como lograda `844:95391`, marcar como abandonada (con motivo) `844:95500`, agregar tarea desde la meta `844:95607`, vacío `844:96034` |
| Metas móvil | tarjetas `845:548584`, detalle con KR `845:548934`, abandonar (hoja) `845:549286` |
| Proyectos escritorio | lista `845:550009`, detalle con miembros, hitos y avance `845:550725`, vacío `845:551597` |
| Proyectos móvil | lista `845:549371`, detalle (pestaña Miembros) `845:549722` |
| **Puntos de entrada** | `845:554753`: PM Tareas, PM Metas, CRM oportunidad, CRM ficha del cliente, Notificaciones, Header (vista rápida), PM Proyecto y GO Assistant abren la **misma** instancia de `TaskForm` |

Errores conocidos que el diseño corrige:

| Error de hoy | En el diseño |
|---|---|
| Proyecto obligatorio | «Proyecto (opcional)» / «Sin proyecto» en todas las variantes; el vacío de Proyectos dice que las tareas no lo necesitan |
| La fecha se corre al editar | fecha + hora con la zona de la organización; nunca un `date` suelto |
| «Abrir en Tareas» no abre la tarea | URL `/app/pm/tareas?tarea=<id>` con la hoja `sheet · edit` abierta sobre la lista (`833:540569`); página propia `/app/pm/tareas/<id>` (`833:550095`) |
| Metas sin «lograda / abandonada» | botón «Marcar como lograda» en la cabecera, entradas en `PMRowMenu Tipo=meta` y `GoalCloseDialog` (motivo obligatorio al abandonar; decide qué pasa con las tareas abiertas) |
| KR sin editar su valor | `KeyResultRow Estado=editando`: valor en línea, «Antes: 28 · Nuevo avance: 80 %», Enter guarda |

## 4. Cambios en `11 CRM` (solo las dos instancias de tarea)

| Frame | Antes | Ahora |
|---|---|---|
| «Escritorio / Ficha del cliente — crear la primera tarea (TaskForm Origen=cliente)» `772:21523` (antes «…primera tarea creada (TaskQuickView)») | `TaskQuickView` provisional | instancia `772:21577` de `TaskForm sheet · create · cliente`, con el cliente del frame |
| «Acciones rápidas — qué hace cada botón» `773:472975`, columna «Tarea» | `TaskQuickView` | instancia `773:473617` de `TaskForm sheet · create · oportunidad` |

No se tocó nada más de esa página.

## 5. Chequeo por script (2026-09-23)

- Sección de pantallas `833:538003`: 0 solapes entre frames y rótulos, 0 nodos fuera de la sección,
  0 instancias rotas (3.885 revisadas), 0 anotaciones dentro de los frames de pantalla (los rótulos
  «Tareas — escritorio», etc. están en la sección). Único texto cortado: las pestañas de Metas en
  móvil, que se desplazan en horizontal a propósito (el frame se llama «desplazamiento
  horizontal»). Los chips del calendario y los títulos de fila truncan con «…» por diseño.
- Sección de componentes `830:533232`: 0 solapes, 0 nodos fuera, 0 instancias rotas, sin choque con
  otras secciones de la página.

## 6. Plan de centralización en código (no implementado)

### 6.1 Lo que hay hoy (verificado en código)

| Pieza | Dónde | Problema |
|---|---|---|
| Formulario del PM | `src/components/pm/TaskCreationPanel.tsx` (≈1.300 líneas) | fecha con `<input type="date">` (`:902`) contra `tasks.due_date` `timestamptz`: el día se corre; todo desde el navegador vía `pmService` |
| Formulario del CRM | `src/components/crm/shared/TaskDialog.tsx` (compacto) → `crmTaskService` → `pmService.createTask` | sale sin responsable; «Más opciones» expande a `TaskCreationPanel` |
| Lista de tareas del CRM | `src/components/crm/pipeline/drawer/TasksSection.tsx` | formatea `due_date` como fecha plana |
| Ficha del cliente | `src/components/clientes/id/TareasSidebar.tsx` | solo lectura; enlaza a `/app/tareas` (`:373`), ruta que no es la del PM |
| Vista rápida del header | `src/components/shell/header/VistaRapidaTarea.tsx:228` | abre `/app/pm/tareas?taskId=…` |
| Notificaciones / Inicio | `NotificationDetailSheet.tsx:114`, `inicio/widgets/widgetModels.ts:115` | mismo `?taskId=` |
| Página Tareas | `src/app/app/pm/tareas/page.tsx:83` | solo lee `?view=`: ignora `taskId`, por eso «Abrir en Tareas» no abre nada |
| Metas | `src/app/app/pm/metas/page.tsx`, `GoalCreationPanel.tsx`, `pmService.recalcKeyResultProgress` | el estado solo cambia al recalcular (`progress >= 100 → achieved`); no hay acción para lograda/abandonada ni para editar `current_value` |
| Recordatorios | `src/lib/hooks/useTaskReminders.ts` | deriva «hoy» con `toISOString().split('T')[0]` (prohibido por CLAUDE.md) |

El panel ya ofrece «Sin proyecto» (`TaskCreationPanel.tsx:799`) y solo valida el título (`:601`). Si
el error «proyecto obligatorio» persiste, está en otro camino (servidor, RLS o una restricción de la
BD): hay que confirmarlo con el MCP de Supabase antes de tocar nada.

### 6.2 Destino

1. **Un servicio y una ruta** (servidor, `getServerOrgContext()`):
   `POST /api/tasks` (crear, con subtareas y dependencias en una RPC transaccional
   `pm_create_task`), `PATCH /api/tasks/[id]` (editar; `due_date` como instante ISO construido con
   la zona de la organización), `POST /api/tasks/[id]/complete`, `.../timer` (iniciar / detener).
   El servidor pone `assigned_to = usuario actual` si no llega, valida pertenencia de proyecto, meta,
   KR, cliente y entidad relacionada, y conserva `related_to_type/id` al editar.
   `crmTaskService`, las escrituras de navegador de `pmService` y la ruta muerta `/api/crm/tasks` se
   reemplazan por ella. GO Assistant llama al mismo servicio.
2. **Un componente**: `src/components/tareas/TaskForm/` con `layout` (`page|dialog|sheet`), `mode`
   (`create|edit`) y `origen` (`{ tipo: 'oportunidad'|'cliente'|'notificacion'|'meta', id }`), partido
   en secciones de ≤300 líneas (`CamposPrincipales`, `Vencimiento`, `Relaciones`, `Subtareas`,
   `Adjuntos`, `Dependencias`, `Tiempo`, `Actividad`). Se monta con un `TaskFormProvider` en el
   layout de la app y se abre con `abrirTarea({ id })` / `nuevaTarea({ origen, valores })`.
   Reemplaza `TaskCreationPanel`, `crm/shared/TaskDialog`, el alta de `TasksSection` y el enlace de
   `TareasSidebar`.
3. **Una URL**: `?tarea=<id>` en cualquier página abre la hoja (`mode=edit`); `/app/pm/tareas/<id>`
   es la página. `VistaRapidaTarea`, `NotificationDetailSheet`, `widgetModels` y `TareasSidebar`
   pasan a construirla con un helper `urlTarea(id)`. Se acepta `?taskId=` como alias durante la
   transición.
4. **Fechas**: `due_date` se edita con fecha + hora y se muestra con `formatDateInTz`; los grupos
   (Vencidas, Hoy, Mañana…) se calculan con `todayInTz(tz)`. Se corrige `useTaskReminders`.
5. **Metas y KR**: `PATCH /api/goals/[id]/status` (`achieved|abandoned|active`, motivo obligatorio al
   abandonar, qué hacer con las tareas abiertas) y `PATCH /api/key-results/[id]` (`current_value` →
   recalcula KR y meta en la misma transacción). El recálculo automático deja de pisar un estado
   puesto a mano.
6. **Listas**: `TaskRow`/`TaskCard` en `src/components/tareas/`, usadas por PM, oportunidad, ficha
   del cliente, meta y proyecto (hoy hay cuatro listas distintas).

### 6.3 Cambios de BD a evaluar (no aplicados; cada uno con su `.sql` y rollback)

- `goals.closed_reason text NULL`, `goals.closed_at timestamptz NULL` (motivo y fecha de cierre).
- Normalizar `tasks.related_to_type` (`cliente` → `customer`) y añadir `notification` y
  `opportunity` a los tipos aceptados si hay CHECK.
- RPC `pm_create_task` transaccional, sin `EXECUTE` para `anon`.

### 6.4 Orden sugerido

1. `?tarea=` en la página Tareas + helper `urlTarea` (arregla «Abrir en Tareas» sin tocar el
   formulario).
2. Fecha + hora con la zona de la organización en el formulario actual y `useTaskReminders`.
3. Rutas `/api/tasks` + responsable por defecto; migrar la acción rápida del CRM.
4. `TaskForm` único con `layout`/`origen`; migrar PM, CRM, ficha del cliente y notificaciones.
5. Metas: lograda/abandonada y edición del valor de los KR.

## 7. Pendiente y observaciones

- El `Sidebar` del kit no tiene ítem para el PM: en las pantallas se sobrescribió «Reportes» por
  «Proyectos y tareas» con el ícono `FolderKanban`. Hay que agregar el ítem real al kit (el menú sale
  de `catalog.ts` y de los módulos del plan).
- La vista **IA Planner** se conserva como pestaña, pero no se rediseñó su contenido.
- `PageHeader Variant=detail` muestra una miniatura de imagen, no el ícono del módulo; en Metas y
  Proyectos queda la miniatura.
- Faltan en móvil: sin resultados, error y sin permiso de Tareas (están en escritorio), y el vacío de
  Metas y Proyectos.
- No se dibujó la edición de proyecto ni de meta (siguen `ProjectCreationPanel` y
  `GoalCreationPanel`); convendría llevarlos al mismo patrón de `Layout`.
- Las tareas de housekeeping del PMS (`pms/housekeeping/TaskDialog.tsx`) usan otro servicio y
  quedaron fuera.

## 8. Preguntas para el dueño

1. ¿El detalle de una tarea se abre por defecto en hoja sobre la lista (como está dibujado) o en
   página propia? Ambas existen; la hoja conserva el contexto.
2. Al marcar una meta como **lograda**, ¿se cierran también sus KR abiertos (casilla marcada por
   defecto) y sus tareas pendientes quedan abiertas?
3. Al **abandonar** una meta, ¿qué se hace por defecto con sus tareas abiertas: dejarlas sin meta,
   cancelarlas o dejarlas como están?
4. ¿«En riesgo» de una meta se calcula (avance 15 puntos por debajo de lo esperado a hoy, o un KR en
   riesgo) o lo marca el responsable?
5. Tareas creadas desde una **notificación**: ¿qué notificaciones ofrecen «Crear tarea de
   seguimiento» (stock bajo, cartera vencida, pedido web…)?
6. ¿Las tareas de housekeeping del PMS deben unificarse con `tasks`, o siguen aparte?
7. ¿El ítem del menú lateral se llama «Proyectos y tareas», «Tareas» o «PM»?
