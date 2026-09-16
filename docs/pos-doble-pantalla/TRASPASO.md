# Traspaso — POS de doble pantalla

> Documento para que **otro agente continúe exactamente donde quedó** este trabajo.
> Léelo entero antes de tocar nada. Última actualización: 2026-09-15, tras DETENER el
> flujo de la Fase 0 a petición del usuario (ronda 3 de la Parte A sin QA final). Fuentes de verdad: `PLAN.md` (qué se construye),
> `PROGRESS.md` en la raíz (estado y calificaciones), `workflow-f0.js` (cómo se
> orquesta la Fase 0).

---

## 1. Reglas del usuario (no negociables)

1. **Todo sobre `main`.** Sin ramas, sin PRs, sin worktrees. Aplica también a
   subagentes y workflows: nunca `isolation: 'worktree'`. Si un prompt escrito
   pide ramas, se ignora y se va a `main`. (Reafirmado dos veces el 2026-09-15.)
2. **Commit local solo de los archivos propios** con `git add <archivos>`: el
   árbol tiene cientos de cambios sin commitear de otras sesiones. Nunca
   `git add -A`. Mensaje en español, terminado en
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
3. **Push solo con autorización explícita** en la conversación.
4. **Base de datos solo por el MCP de Supabase** (proyecto `jgmgphmzusbluqhuqihj`),
   con `.sql` en `supabase/migrations/` + reversión en `supabase/rollbacks/` en el
   mismo commit. Nada de `.sql` sueltos de prueba. La Fase 0 no toca la base.
5. **Nunca el nombre de una organización cliente** en código, docs, tests ni
   comentarios: el repositorio es público. Usar `org 135` o descripciones.
6. `PROGRESS.md` **se anexa, nunca se reescribe**, y nunca desde una cadena entre
   comillas dobles de PowerShell (los backticks se comen caracteres). Escribir
   con Python/UTF-8 explícito o con el tool de edición.
7. Español de Colombia en código, comentarios, commits y UI. `next-intl` para
   textos: sin cadenas hardcodeadas.
8. Fechas: prohibido `toISOString().split('T')[0]`; usar
   `src/lib/utils/dateDisplay.ts`; zona horaria de la organización, nunca
   `America/Bogota` cableado.
9. Dejar limpios de ESLint los archivos que se toquen. `tsc` completo tarda
   más de 10 min y necesita `NODE_OPTIONS=--max-old-space-size=8192`; hay ~190
   errores preexistentes en otros archivos: solo cuentan los de los archivos
   de esta iniciativa.

## 2. El ciclo (`.devin/workflows/loop.md`)

Por cada **parte** de cada fase: **builder** construye → **tester** rompe (pruebas
reales, no solo lectura) → **qa-reviewer** califica 1–10 con rubric de 5
dimensiones y da acciones concretas. Umbral **9,5**. Máximo **3 rondas** por
parte; si no llega, se detiene, se resume el bloqueo raíz en `PROGRESS.md` y se
pide input humano. Un fallo crítico limita el máximo a 6/10. Nunca un 10
automático. Cada ronda se anexa a `PROGRESS.md` (sección "Historial de rondas —
POS doble pantalla") con calificación QA, calificación tester, qué se hizo, qué
falta y próxima acción.

## 3. Fases y partes (estado al momento del traspaso)

| Fase | Parte | Estado | Rondas | QA |
|---|---|---|---|---|
| **F0 Espejo local** | A · Protocolo, proyección, transporte, identidad local (+ tests) | **en_revision — flujo detenido** | r1 6,9 · r2 7,8 · r3: tester 7, **QA no llegó a correr** | sin nota final |
| F0 | B · Emisión desde `posService` y `CheckoutDialog` | pendiente (arranca al aprobar A) | 0 | — |
| F0 | C · Ruta `/pos-display` con estados y marca | pendiente (paralelo con B y D) | 0 | — |
| F0 | D · Indicador en POS + tarjeta "Pantalla del cliente" en Configuración › POS | pendiente (paralelo con B y C) | 0 | — |
| F0 | Integración · extremo a extremo + QA final | pendiente | 0 | — |
| F1 Electron 2ª pantalla | `displayWindow.ts`, IPC, persistencia, monitores, atajo de salida | pendiente | 0 | — |
| F2 Terminal, ajustes, propina, QR | `pos_terminals` (migración), tarjeta completa, Propina, Cobro·QR con imagen | pendiente | 0 | — |
| F3 Otro dispositivo | `SupabaseBroadcastTransport`, emparejamiento, `/api/pos/display/*` | pendiente | 0 | — |
| F4 Calificación y reposo | `pos_display_feedback`, calificación, reposo con promociones | pendiente | 0 | — |

### Parte A — lo que existe ya (sin commitear)

Archivos creados por el builder (rondas 1–3):

- `src/lib/pos/display/protocol.ts` — tipos v1 (`DownMessage`, `UpMessage`, `DisplayState`, `DisplayCart`, `DisplayPayment`) + type guards `isDownMessage` / `isUpMessage`.
- `src/lib/pos/display/projection.ts` — `projectCartForDisplay(cart, { currency, lastChangedLineId })`, pura.
- `src/lib/pos/display/transport.ts` — interfaz `DisplayTransport`, `BroadcastChannelTransport` (emisor) y `BroadcastChannelReceiver` (pantalla), con `instanceId`, `seq`, heartbeat.
- `src/lib/pos/display/terminal.ts` — `getOrCreateLocalTerminalId()` en `localStorage` (`pos_terminal_id`).
- `src/lib/pos/display/index.ts` — barrel.
- Tests en `src/__tests__/pos-display/`: `projection`, `protocol`, `transport`, `terminal`, más los que añadió el tester: `qa-projection-edge`, `qa-transport-edge`, `qa-protocol-terminal-edge`. Ronda 2: 205/207 pasaron.

Bugs que QA encontró y que el builder ya atendió en r2/r3 (verificar que sigan resueltos):

- `DisplayLine.total` debe ser `qty × unitPrice` bruto (antes de descuento), no `item.total`.
- `resolveTaxIncluded` debe evaluar `Boolean(item.tax_included)` sobre los items normalizados (coherente con `calculateCartTotals` en `posService.ts`), con `cart.tax_included` truthy.
- Dos pestañas de `/app/pos` comparten `terminalId`: se añadió `instanceId` al sobre; el receptor **reinicia `highestSeq`** al cambiar de `instanceId` (adopción y `bye`).
- Mensajes de subida con `toInstanceId` opcional para no responder a la pestaña equivocada.
- Spread del sobre invertido (`{ ...draft, v, seq, terminalId, instanceId }`) para que un draft no pise campos del protocolo.
- `postMessage` envuelto en try/catch (`DataCloneError`), sin propagar.
- `isDownMessage` exige `Number.isInteger(seq) && seq >= 0`; `isDisplayStateShape` valida `cart.lines` array y `payment.method`.
- Interfaz `DisplayTransport` expone `startHeartbeat`/`stopHeartbeat`.

Pendiente "para el 10" según QA r2: documentar en JSDoc que `modifiers[].extraPrice` es informativo y ya va dentro del `unitPrice`; que el receptor distinga `bye` de silencio (`lastByeAt`); deduplicar un `hello` repetido con el mismo `seq`.

### Estado REAL del código al detener (verificado por el orquestador)

- `npx jest src/__tests__/pos-display` → **11 suites, 179 tests, 0 fallos**.
- `npx eslint src/lib/pos/display/ src/__tests__/pos-display/` → **limpio**.
- Archivos: `src/lib/pos/display/{index,projection,protocol,terminal,transport}.ts` y 11 suites en `src/__tests__/pos-display/` (las del builder + `qa-*` + `tester-r2-*` + `tester-r3-*`).
- Todo **sin commitear**.

### Hallazgos del tester r3 sin QA que los priorice (lista de la ronda de cierre)

1. [medio] `projectCartForDisplay` lanza `TypeError` si `items` o `modifiers` traen `null` (carritos viejos de `localStorage`): filtrar antes de proyectar.
2. [medio] `BroadcastChannelReceiver` no puede soltar la instancia activa si la pestaña muere sin `bye`: liberar la instancia al entrar en *Conectando* (3 s sin heartbeat), para que el siguiente `need_snapshot` no vaya a una instancia muerta.
3. [medio] Carrera con dos pestañas de `/app/pos` al abrir la pantalla: el `need_snapshot` inicial va sin destinatario y "gana el último hello". Definir y documentar la regla de adopción (p. ej. el hello con `sessionOpen=true`, o el más reciente).
4. [bajo] `projectLine` copia `item.id` sin normalizar: generar un id estable si falta.
5. [bajo] Un `bye` de instancia desconocida sin instancia activa se adopta y libera en el mismo mensaje y llega a la UI: ignorarlo.
6. [bajo] Llevar al `PLAN.md` §8 lo que el protocolo ya cambió: `instanceId` obligatorio en el sobre de bajada, `toInstanceId` opcional en el de subida, `publish()` recibe `DownMessageDraft`, `startHeartbeat`/`stopHeartbeat` en la interfaz.

**Decisión pendiente del usuario** (regla del `loop.md`: no una 4ª ronda a ciegas): o bien un `qa-reviewer` califica el código tal como quedó y, si da ≥ 9,5, se sigue con B/C/D; o bien se autoriza **una ronda de cierre** corta con los 6 puntos de arriba. No hay bloqueo técnico: las rondas convergieron (6,9 → 7,8 → hallazgos ya solo medios/bajos).

## 4. Dónde está el flujo en ejecución

- **Run v1:** `wf_dfb8eae5-1e5` · DETENIDO el 2026-09-15 con `qa:A:r3` en curso.
- **Run v2 (en curso):** `wf_939fe7ed-76d` · Task `whiuc7kwy` · script `docs/pos-doble-pantalla/workflow-f0-v2.js`. Ronda de cierre de A (máx. 2) con el feedback acumulado → B/C/D en paralelo → integración. Journal: `...\subagents\workflows\wf_939fe7ed-76d\journal.jsonl`.
- **Preparado para después:** `workflow-f1.js` (Electron, listo para lanzar al aprobar F0) y la migración `supabase/migrations/20260916010000_pos_terminals.sql` + rollback (Fase 2; la aplica el orquestador por MCP tras el QA). Verificado contra la base: `update_updated_at_column` y `organization_members.is_active` existen; `pos_terminals` no.
- **Corrección heredada para F1:** los prompts de C y D del flujo v2 mencionan `window.electronAPI`; el bridge real es `window.goAdminDesktop` (`src/lib/utils/desktop.ts`, `src/types/go-admin-desktop.d.ts`). El builder de F1 tiene orden de corregirlo (`grep electronAPI src/` debe dar cero).
- **Commits hechos el 2026-09-15 en `main`:** `06394a3a` (cuenta congelada con scroll) y `9608bb32` (inicio sin parpadeo del panel de empleado).
- **Script original:** `C:\Users\USUARIO\.claude\projects\C--Users-USUARIO-CascadeProjects-go-admin-erp\028e691a-aac7-432a-a2b9-a3b08c454b01\workflows\scripts\pos-doble-pantalla-f0-wf_dfb8eae5-1e5.js`
- **Copia en el repo:** `docs/pos-doble-pantalla/workflow-f0.js` (idéntica; úsala en una sesión nueva).
- **Journal con los resultados reales de cada agente:** `C:\Users\USUARIO\.claude\projects\C--Users-USUARIO-CascadeProjects-go-admin-erp\028e691a-aac7-432a-a2b9-a3b08c454b01\subagents\workflows\wf_dfb8eae5-1e5\journal.jsonl`
- El script se detiene solo si A no llega a 9,5 en r3 (devuelve `detenidoEn: 'A'`), o si B/C/D no llegan tras 3 rondas. Si todo aprueba, corre la integración y devuelve `{ partes, integracion }`.

**Cómo retomar (el run no se puede reanudar desde otra sesión):**

1. Preguntar al usuario cuál de las dos salidas de §3 quiere (QA sobre lo que hay, o ronda de cierre).
2. Ronda de cierre = un `builder` con los 6 puntos de §3 como lista obligatoria → `tester` → `qa-reviewer`. Prompts base en `workflow-f0.js` (`promptBuilder('A', 4, feedback)` etc.).
3. Con A ≥ 9,5: relanzar `workflow-f0.js` editado para **saltar `phase('Parte A')`** (construir `resultadoA` a mano con la nota) y entrar en `phase('Partes B C D')`, que corre B, C y D en paralelo y luego la integración.
4. Antes de lanzar B, actualizar `PLAN.md` §8 con los cambios de protocolo del punto 6 de §3, porque los builders de B/C/D leen el plan.

## 5. Qué hacer al terminar cada fase (lo hace el orquestador, no los subagentes)

1. Anexar a `PROGRESS.md` una entrada por ronda y editar la tabla de fases en sitio.
2. Actualizar `PLAN.md` con cualquier decisión nueva que salga del QA (sección
   13 "Riesgos y decisiones abiertas" o donde toque).
3. `npx jest src/__tests__/pos-display` verde; `npx eslint` de los archivos de la
   fase limpio; `tsc` filtrado a los archivos de la fase sin errores.
4. `git add` solo de los archivos de la fase + `PROGRESS.md` + `docs/pos-doble-pantalla/*`
   y commit en `main` con mensaje `feat(pos): fase N — <qué> (QA X/10)`.
5. Lanzar la fase siguiente con el mismo esquema de tres roles. Para F1 (Electron)
   el tester solo puede verificar por `tsc`/`eslint` del paquete `electron/` y
   revisión de código: dejar claro en `noProbado` que no se ejecutó Electron.
   Para F2 la migración `pos_terminals` la aplica el orquestador por MCP tras el
   QA, con su `.sql` y rollback en el mismo commit.

## 6. Otros pendientes de la sesión anterior (no son de este loop, no perderlos)

- **Sin commitear en `main` del ERP:**
  - `src/app/app/cuenta-congelada/page.tsx` — arreglo del scroll (la página no
    tenía contenedor de scroll porque `html/body` llevan `overflow: hidden`).
    Verificado con parseo + ESLint. Commitear: `fix(pos): cuenta congelada con scroll propio`.
  - `src/hooks/usePermissionContext.ts` + `src/app/app/inicio/page.tsx` —
    elimina el parpadeo del panel de empleado para admins: el hook expone
    `resolvedOrganizationId`, `loading` es verdad durante el debounce, y relanza
    cargas pendientes con la closure más reciente; la página decide solo cuando
    `resolvedOrganizationId === organization.id`. ESLint limpio. **Falta que el
    usuario lo verifique en pantalla** (admin entrando a `/app/inicio`: skeleton
    → panel admin, nunca el de empleado). Commitear: `fix(inicio): no decidir el
    panel hasta resolver el rol de esta organización`.
  - `PROGRESS.md` (sección POS anexada) y `docs/pos-doble-pantalla/` (PLAN.md,
    TRASPASO.md, workflow-f0.js).
- **Vercel (ERP):** el usuario puso `GATE_COOKIE_SECRET` pero hacía falta un
  redespliegue **sin caché de build** para que el middleware la lea. Comprobar
  en producción que el caché de veredictos (`ga_gate`) está activo: debe bajar
  la cantidad de consultas a Supabase por navegación en `/app/*`.
- **Supabase:** el usuario subió el compute (de Small 2 GB) pero requería
  reinicio para aplicarse. Comprobar con
  `select setting from pg_settings where name='shared_buffers'` (Small = 65536;
  Medium ≈ 131072) y `max_connections` (90 → 120).
- **goadmin-websites:** commit `b91cdf6` (de otra sesión) sin push. Los míos
  (`01b8cd2`, `ec425ee`, `dff259b`) ya están en `origin/main` y desplegados.
- **Diseño pendiente en goadmin-websites:** el lookup de organización lanza
  excepción cuando la base falla (`8a67a16`), y `unstable_cache` no cachea
  excepciones: justo en una caída el caché desaparece. Falta *stale-while-error*.

## 7. Prompt para el agente que continúa

Copiar tal cual en una sesión nueva sobre `C:\Users\USUARIO\CascadeProjects\go-admin-erp`:

```
Continúa el trabajo del POS de doble pantalla. Lee en este orden y no empieces
hasta terminar los tres: docs/pos-doble-pantalla/TRASPASO.md (estado y reglas),
docs/pos-doble-pantalla/PLAN.md (qué se construye), y la sección "POS doble
pantalla" al final de PROGRESS.md (calificaciones).

Reglas duras: todo sobre main (sin ramas, PRs ni worktrees, tampoco para
subagentes); git add solo de tus archivos; push solo si lo autorizo; base de
datos solo por MCP con .sql + rollback en el mismo commit; nunca el nombre de
una organización cliente; PROGRESS.md se anexa, nunca se reescribe.

Estado: la Fase 0, Parte A, quedó DETENIDA tras 3 rondas sin QA final
(r1 6,9 · r2 7,8 · r3 tester 7). El código está en src/lib/pos/display/ con
11 suites / 179 tests en verde y eslint limpio, sin commitear. TRASPASO.md §3
lista los 6 hallazgos del tester r3 que nadie priorizó.

Empieza por esto, sin lanzar una 4ª ronda a ciegas: corre UN qa-reviewer sobre
el código tal como está (prompt base promptQA en workflow-f0.js) para tener una
nota. Si da >= 9,5, sigue con B, C y D en paralelo y la integración usando
workflow-f0.js editado para saltar la Parte A. Si da < 9,5, autorízame una
ronda de cierre con su lista + los 6 puntos de §3 antes de continuar. En
cualquier caso, antes de lanzar B actualiza PLAN.md §8 con los cambios de
protocolo del punto 6 de §3 (los builders leen el plan).

Usa el ciclo del loop.md con subagentes: builder -> tester -> qa-reviewer por
parte, umbral 9,5, máximo 3 rondas, y luego integración. El tester debe correr
pruebas reales (jest, eslint, tsc filtrado; render de /pos-display si puede
levantar un servidor sin chocar con otro). El qa-reviewer verifica el código
por sí mismo y da acciones concretas. Al aprobar cada fase: anexa las rondas a
PROGRESS.md, actualiza PLAN.md si hubo decisiones nuevas, commitea en main solo
los archivos de la fase, y lanza la siguiente (F1 Electron, F2 terminal y
propina con migración pos_terminals por MCP, F3 otro dispositivo, F4
calificación). Repórtame por fase, no el detalle de cada subagente.

También quedan sin commitear dos arreglos previos (TRASPASO.md §6):
cuenta-congelada (scroll) e inicio (parpadeo del panel de empleado). Commitéalos
por separado en main antes de seguir.
```
