---
name: jira-task-creator
description: Usar SIEMPRE que el usuario pida crear una tarea, historia, feature, epic, bug/error o subtarea en Jira a partir de una descripción en lenguaje natural — ej. "crea una tarea en Jira para...", "agrega un bug de...", "necesitamos una historia para...". El usuario da una sola frase; esta skill infiere tipo, resumen, descripción, prioridad, épica padre y asignación, y crea el issue automáticamente sin pedir cada campo por separado.
---

# Creación automática de issues en Jira (Atlassian Rovo)

## Configuración del sitio (ya resuelta, no volver a preguntar)
- `cloudId`: `d25ad4a1-3f84-43c9-a4a5-736f56ce9531`
- Sitio: `imaginegallego.atlassian.net`
- `PROJECT_KEY` por defecto: **GO**
  (proyecto Scrum "Go Admin ERP", board 34, verificado el 2026-08-28).
  Si el usuario trabaja en otro proyecto, lo dirá explícitamente.

> Nota: estas herramientas de Jira NO pueden crear un proyecto nuevo. Si
> `searchJiraIssuesUsingJql`/`getVisibleJiraProjects` no encuentran ningún
> proyecto o issue, avisa al usuario que debe crear manualmente un proyecto
> tipo **Scrum** en Jira antes de continuar (Jira → Create project → Scrum →
> tipos de issue: Epic, Story, Task, Bug, Subtask).

## Objetivo
El usuario da UNA frase (ej. "crea una tarea para arreglar el bug del login que
no valida el NIT, es urgente"). Con eso, esta skill debe crear el issue completo
en Jira sin hacer preguntas campo por campo — solo pregunta si algo es
genuinamente ambiguo y bloqueante (ver sección "Cuándo sí preguntar").

## Paso 1 — Inferir el tipo de issue
Mapea del lenguaje natural al tipo de Jira (`issueTypeName` en `createJiraIssue`):

| Palabras clave del usuario | issueTypeName en Jira |
|---|---|
| epic, épica, iniciativa grande | `Epic` |
| feature, funcionalidad nueva, historia, historia de usuario, "como usuario quiero..." | `Story` |
| tarea, task, trabajo de, hay que hacer | `Task` |
| bug, error, falla, no funciona, se rompe, no valida, crashea | `Bug` |
| subtarea, subtask, parte de, paso de | `Subtask` |

Si el usuario no da pistas claras, por defecto usa `Task` — es el tipo más
neutral y siempre se puede reclasificar después.

## Paso 2 — Extraer resumen, descripción y prioridad
- **Resumen (summary)**: frase corta, orientada a acción, máx ~10 palabras.
  Ejemplo: de "hay que arreglar que el login no valida bien el NIT y a veces dan
  error 500" → `"Corregir validación de NIT en login (error 500)"`.
- **Descripción**: expande el contexto que dio el usuario en 2-4 líneas, en
  formato markdown (usa `contentFormat: "markdown"` en `createJiraIssue`).
  Si el usuario dio pasos para reproducir (para un Bug), inclúyelos como lista.
- **Prioridad**: mapea señales del lenguaje:
  | Señal del usuario | Priority en Jira |
  |---|---|
  | urgente, crítico, bloqueante, ya, ahora mismo | `Highest` |
  | importante, alta, pronto | `High` |
  | (sin señal explícita) | `Medium` |
  | cuando se pueda, baja, no urge | `Low` |
  | eventualmente, algún día, nice to have | `Lowest` |

## Paso 3 — Resolver la Epic padre (si aplica a Story/Task/Bug)
Solo Story, Task y Bug pueden colgar de una Epic (Subtask cuelga de un issue
padre normal, no de una Epic — ver Paso 4).

1. Si el usuario menciona explícitamente a qué proyecto/iniciativa pertenece
   (ej. "para el módulo de facturación"), busca si ya existe una Epic con ese
   nombre:
   ```
   searchJiraIssuesUsingJql:
     jql: project = GO AND issuetype = Epic AND summary ~ "<palabra clave>" AND created >= -730d
   ```
2. Si aparece una Epic que coincide claramente → usa su `key` como `parent` en
   `createJiraIssue`.
3. Si no existe ninguna Epic que coincida → créala primero:
   ```
   createJiraIssue:
     cloudId, projectKey: GO, issueTypeName: "Epic",
     summary: "<nombre de la iniciativa, ej: Módulo de facturación>"
   ```
   Luego usa el `key` recién creado como `parent` del issue original.
4. Si el usuario NO menciona ninguna iniciativa/módulo → no fuerces una Epic;
   crea el issue sin `parent`. No inventes una Epic genérica.

## Paso 4 — Subtareas
Si el tipo es Subtask, necesitas el issue padre (Task/Story/Bug), no una Epic:
- Si el usuario dice "agrega una subtarea a GO-42 para..." → usa `GO-42` como
  `parent` directamente.
- Si el usuario describe la subtarea sin decir a qué issue pertenece y no hay
  contexto previo en la conversación que lo indique → esta es una de las pocas
  veces que SÍ debes preguntar: "¿A qué tarea pertenece esta subtarea?" (pide
  solo la key o una pista para buscarla).

## Paso 5 — Asignación
1. Si el usuario menciona a quién asignarlo por nombre → busca su cuenta:
   ```
   lookupJiraAccountId: cloudId, searchString: "<nombre>"
   ```
   y usa el `accountId` devuelto en `assignee_account_id`.
2. Si el usuario no menciona asignado → por defecto asígnalo al mismo usuario
   que pide la tarea (busca su cuenta una sola vez con `lookupJiraAccountId`
   usando su nombre conocido, y reutiliza ese `accountId` en la sesión).
3. Nunca dejes el issue sin asignar por defecto salvo que el usuario diga
   explícitamente "sin asignar"/"que quede en el backlog sin dueño".

## Paso 6 — Story points (estimación)
- Estima story points automáticamente según la complejidad inferida de la
  descripción. Usa la escala Fibonacci (1, 2, 3, 5, 8, 13):
  | Complejidad inferida | Puntos | Ejemplo |
  |---|---|---|
  | Trivial, cambio de 1 línea o config | 1 | Cambiar un label, sumar un campo |
  | Pequeño, 1 archivo, lógica simple | 2 | Agregar un campo a un formulario |
  | Moderado, 2-3 archivos, lógica clara | 3 | Endpoint CRUD simple |
  | Medio, varios archivos, integración menor | 5 | Integración con API externa simple |
  | Grande, múltiples módulos, lógica no trivial | 8 | Migración de BD + UI + servicio |
  | Muy grande, arquitectura completa | 13 | Nuevo módulo end-to-end |
- El campo de story points en Jira Cloud es `customfield_10016`. Pásalo en
  `additional_fields` al crear el issue:
  `additional_fields: { "priority": {...}, "customfield_10016": <puntos> }`
- Si el usuario dice explícitamente los puntos (ej. "es un 3", "le doy 5
  puntos") → usa ese valor sin recalcular.
- Las Epics no llevan story points (se calculan por suma de las Stories hijas).

## Paso 7 — Scrum / Sprint (asignación automática)
- **Por defecto, asigna el issue al sprint activo del proyecto GO.** No lo
  dejes en el backlog sin sprint salvo que el usuario diga explícitamente
  "déjalo en el backlog"/"sin sprint".
- El campo de Sprint en Jira es `customfield_10020`. El sprint se asigna con
  `editJiraIssue` después de crear el issue:
  ```
  editJiraIssue:
    cloudId, issueIdOrKey: "<key recién creada>",
    fields: { "customfield_10020": <sprint_id> }
  ```
- **Sprint ID conocido del proyecto GO (board 34)**:
  - `GO Sprint 1` (28/8/2026 - 11/9/2026): ID por determinar — si la
    asignación falla con un ID numérico, pide al usuario que arrastre la
    Story al sprint desde el backlog de Jira, o que proporcione el ID del
    sprint visible en la URL del board.
  - Cuando se cree un sprint nuevo, anota aquí su ID numérico para
    reutilizarlo en futuras tareas.
- Si el usuario dice "para el próximo sprint"/"que entre al sprint X" →
  busca ese sprint y usa su ID.
- **Limitación conocida**: el MCP de Atlassian no tiene herramienta para
  listar sprints. Si no conoces el ID del sprint, pídelo al usuario
  (URL del sprint en el board, o `selectedSprint=XXX` en la URL).
- Las Subtasks heredan el sprint de su Story padre automáticamente al
  arrastrar la Story en el board de Jira. No es necesario asignar sprint
  a cada subtask individualmente vía API.

## Paso 8 — Crear el issue
```
createJiraIssue:
  cloudId: "d25ad4a1-3f84-43c9-a4a5-736f56ce9531"
  projectKey: "GO"
  issueTypeName: "<Epic|Story|Task|Bug|Subtask>"
  summary: "<resumen inferido>"
  description: "<descripción inferida>"
  contentFormat: "markdown"
  parent: "<key de la Epic o del issue padre, si aplica>"
  assignee_account_id: "<accountId resuelto>"
  additional_fields: {
    "priority": { "name": "<Highest|High|Medium|Low|Lowest>" },
    "customfield_10016": <story_points>
  }
```
Después de crear, asigna el sprint con `editJiraIssue` (ver Paso 7).

## Paso 9 — Confirmar al usuario
Después de crear, responde breve y concreto — no repitas todo el JSON:
```
Creado [TIPO] GO-XX: "<resumen>"
- Épica: GO-YY (creada nueva / ya existía)
- Prioridad: <prioridad>
- Story points: <puntos>
- Sprint: <nombre del sprint> (o "en backlog" si no se asignó)
- Asignado a: <nombre>
Link: https://imaginegallego.atlassian.net/jira/software/projects/GO/boards
```

## Cuándo sí preguntar (excepciones a "todo automático")
- El proyecto (`PROJECT_KEY`) no está definido y el usuario no lo dio, y hay
  más de un proyecto en el sitio.
- Es una Subtask y no hay forma de inferir el issue padre.
- El texto del usuario es tan ambiguo que ni el tipo ni el resumen se pueden
  inferir razonablemente (ej. solo dice "crea algo en Jira").
- En cualquier otro caso, procede directo — no interrumpas con preguntas de
  campos que se pueden inferir razonablemente (esa es justamente la queja que
  origina esta skill: no repetir el menú de 5 preguntas en cada tarea).
