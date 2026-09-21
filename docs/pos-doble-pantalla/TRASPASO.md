# Traspaso — POS de doble pantalla (pantalla del cliente)

> Documento para que **otro agente continúe exactamente donde quedó** este trabajo.
> Léelo entero antes de tocar nada. Última actualización: **2026-09-21**, al cerrar la
> Fase 0 (ronda 4) y tras la prueba de humo en Go Admin Desktop. Fuentes de verdad:
> `docs/pos-doble-pantalla/PLAN.md` (qué se construye, 14 secciones),
> `PROGRESS.md` en la raíz (historial de rondas y calificaciones, solo se anexa),
> `docs/pos-doble-pantalla/workflow-f*.js` (cómo se orquesta cada fase).

---

## 0. Mapa de documentos y rutas

| Qué | Dónde |
|---|---|
| Plan completo (UI/UX, BD, backend, Electron, web, protocolo, fases) | `docs/pos-doble-pantalla/PLAN.md` |
| Este traspaso | `docs/pos-doble-pantalla/TRASPASO.md` |
| Historial de rondas y calificaciones (anexar, nunca reescribir) | `PROGRESS.md` (raíz), entradas «Fase: F0 …» y «Prueba de humo en Go Admin Desktop» |
| Ciclo de trabajo builder → tester → qa-reviewer | `.devin/workflows/loop.md` |
| Scripts del Workflow tool por fase | `docs/pos-doble-pantalla/workflow-f0-v4.js` (F0, ya ejecutado), `workflow-f1.js`, `workflow-f2.js`, `workflow-f3.js`, `workflow-f4.js` |
| Migraciones preparadas (NO aplicadas, sin commitear) | `supabase/migrations/20260916010000_pos_terminals.sql` + `supabase/rollbacks/20260916010000_pos_terminals_rollback.sql` (F2) · `supabase/migrations/20260916020000_pos_display_feedback.sql` + rollback (F4) |
| Núcleo de la pantalla (protocolo, proyección, transporte, emisor) | `src/lib/pos/display/{protocol,projection,transport,desktopChannel,terminal,emitter,emitterRegistry,settings,customerDisplaySettings,presence,payment,openDisplay,posDisplay,route,index}.ts` |
| Ruta pública de la pantalla | `src/app/pos-display/` (excluida del gate en `src/middleware.ts`; `isCustomerDisplayPath` en `src/lib/pos/display/route.ts`) |
| Componentes de la pantalla | `src/components/pos-display/{CustomerDisplay,OrderView,views,useDisplayReceiver,displayLink,logic,BrandHeader,FullscreenButton}.tsx` |
| Indicador en el POS + presencia | `src/components/pos/display/{CustomerDisplayIndicator.tsx,useCustomerDisplayPresence.ts}` |
| Tarjeta en Configuración › POS | `src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx` |
| Puntos de emisión desde la caja | `src/lib/services/pos/posService.ts` (tras cada escritura de `pos_carts_<org>`), `src/components/pos/CheckoutDialog.tsx` (cobro y gracias), `src/components/pos/CartView.tsx` (`handleTotalsChange` → `setTotals`), `src/app/app/pos/page.tsx` (`startPosDisplay`) |
| Puente de escritorio (tipos web) | `src/lib/utils/desktop.ts` (`DesktopPosDisplayBridge`: `send/onMessage/open/close/status/onStatus/listDisplays/setEnabled`) — el objeto global es `window.goAdminDesktop`, **nunca** `window.electronAPI` |
| Puente de escritorio (Electron, otra sesión) | `electron/src/main/posDisplayIpc.ts`, `electron/src/main/windows/posDisplayWindow.ts`, `electron/src/main/broadcast.ts`, `electron/src/preload/index.ts`; prueba manual en `electron/scripts/smoke-pos-display.md` |
| Tests | `src/__tests__/pos-display/*.test.ts` (34 suites, 832 tests) + guardarraíl «Pantalla del cliente» en `src/__tests__/guardrails.test.ts` |
| Textos | `messages/{es,en,fr,pt}.json`, espacio `posDisplay` / `customerDisplay` |

Contexto rápido del producto (PLAN §1–§3): la **caja manda y la pantalla refleja**; el
transporte local es `BroadcastChannel` (misma origin) y, dentro de Go Admin Desktop, el
relay IPC `pos-display:message` (`desktopChannel.ts`, sin red ni dependencia de origin);
la pantalla es la ruta pública `/pos-display?t=<terminalId>`; por defecto solo muestra el
resumen; propina y calificación solo si se activan en Configuración › POS.

---

## 1. Reglas del usuario (no negociables)

1. **Todo sobre `main`.** Sin ramas, sin PRs, sin worktrees. Aplica también a
   subagentes y workflows: nunca `isolation: 'worktree'`.
2. **Commit local solo de los archivos propios** con `git add <archivos>`: el árbol
   tiene decenas de cambios sin commitear de otras sesiones (CRM, GO Assistant,
   agentes de voz, `electron/src/agent/*`…). Nunca `git add -A`. Mensaje en español,
   terminado en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
3. **Push solo con autorización explícita.** (El dueño delegó decisiones, migraciones y
   commits en `main`; el push lo ha estado haciendo la sesión de Desktop tras avisar.)
4. **Base de datos solo por el MCP de Supabase** (proyecto `jgmgphmzusbluqhuqihj`), con
   `.sql` en `supabase/migrations/` + reversión en `supabase/rollbacks/` **en el mismo
   commit**. Verificar tablas/columnas con el MCP antes de escribir queries.
5. **Nunca el nombre de una organización cliente** en código, docs, tests ni
   comentarios: el repositorio es público.
6. `PROGRESS.md` **se anexa, nunca se reescribe**, y nunca desde una cadena entre
   comillas dobles de PowerShell. Escribir con Python/UTF-8 explícito o el tool de edición.
7. Español de Colombia en código, comentarios, commits y UI. `next-intl` para textos.
8. Fechas: prohibido `toISOString().split('T')[0]`; usar `src/lib/utils/dateDisplay.ts`.
9. ESLint limpio en los archivos que se toquen. `tsc` completo tarda >10 min y necesita
   `NODE_OPTIONS=--max-old-space-size=8192`; un tsc acotado con un `tsconfig` que incluya
   solo los archivos de la fase (ejemplo en el scratchpad de la sesión anterior:
   `tsconfig.totals.json` extendiendo el raíz con `include` explícito) tarda 2–3 min.
10. El dueño quiere **todo completamente funcional y con el flujo completo**, y que se le
    reporte **por fase**, no por subagente.

## 2. El ciclo (`.devin/workflows/loop.md`)

Por cada **parte** de cada fase: **builder** construye → **tester** rompe (pruebas
reales: jest, eslint, tsc acotado; render si puede) → **qa-reviewer** califica 1–10 con
5 dimensiones y da acciones concretas. Umbral **9,5**. Máximo **3 rondas** por parte; si
no llega, se detiene, se resume el bloqueo raíz en `PROGRESS.md` y se pide input humano.
Un fallo crítico limita a 6/10. Nunca un 10 automático. Cada ronda se anexa a
`PROGRESS.md` (el script `anexar_rondas.py` del scratchpad lo hacía leyendo el
`journal.jsonl` del run y **emparejando por `agentId`**, no por etiqueta: los runs
paralelos intercalan etiquetas).

Lección de la F0: cuando el QA no converge (6,9 → 7,8 → 8,8 → 8,4), el orquestador debe
**congelar el alcance y tomar decisiones explícitas** (D1–D9 en `PROGRESS.md`) en vez de
lanzar otra ronda a ciegas; así A pasó a 9,7.

---

## 3. Estado por fase (2026-09-21)

| Fase | Estado | Evidencia |
|---|---|---|
| **F0 Espejo local** | **CERRADA en código** — A 9,7 · B 9,8 · C 9,6 · D 9,7 (r5). Commits `17e88b6e`, `7fe4f133`, `13e05fe7`, `3f15d64f`, `68cb0fd8`, `4eb61121`. | `PROGRESS.md` «F0 v4 (ronda 4)»; `npx jest src/__tests__/pos-display` → 34 suites / 832 tests / 0 fallos |
| F0 · integración + QA final | **Parcial**: el `tester:integracion` dejó `integracion.test.ts` (15 casos, verde) pero el run murió antes de `qa:final`. La integración real se verificó **a mano en Go Admin Desktop 0.2.1** (§4). | `PROGRESS.md` «Prueba de humo en Go Admin Desktop 0.2.1» |
| F1 Electron en la 2ª pantalla | **Hecho en Electron por la sesión de Desktop** (`a923cc57`, `d884fcd7`, 0.2.1/0.2.2): ventana hija en el monitor secundario, relay IPC, persistencia `posDisplay.{enabled,displayId}`, `Ctrl+Shift+D`, cierre al quitar el monitor. **Falta el lado web** (`workflow-f1.js`, ya re-alcanzado): selector de monitor en la tarjeta de Configuración (`listDisplays`/`setEnabled`), cierre desde el indicador por el puente, estado «abierta sin señal» (status.open y sin `display_alive`), ocultar `FullscreenButton` en escritorio, `grep electronAPI src/` = 0. | `electron/scripts/smoke-pos-display.md` |
| F2 Terminal, ajustes, propina, QR | Pendiente. Migración `pos_terminals` escrita y verificada contra la base (existen `update_updated_at_column` y `organization_members.is_active`; `pos_terminals` no), **no aplicada**. | `workflow-f2.js` |
| F3 Otro dispositivo | Pendiente. | `workflow-f3.js` |
| F4 Calificación y reposo | Pendiente. Migración `pos_display_feedback` escrita, **no aplicada**. | `workflow-f4.js` |

### Lo que la Fase 0 dejó construido (resumen funcional)

- Protocolo v1 con sobre `{v, seq, terminalId, instanceId}`, `toInstanceId` en subida,
  adopción de instancia (ventana 500 ms), watchdog de silencio 3 s, presencia
  `display_alive`/`display_bye`, `announce(hello, state)`, versiones incompatibles.
- `DisplayCart` proyectado desde el `Cart` de la caja con **override de totales** desde
  `calculateCartTaxes` (el mismo motor que ve el cajero; honra `tax_excluded`).
- Emisor único por página (`emitterRegistry`), arranque en `/app/pos`
  (`startPosDisplay` crea el `terminalId` local aunque el interruptor esté apagado, para
  que «Abrir ahora» siempre enlace).
- Pantalla con estados *Conectando*, *Reposo*, *Pedido* (con «y N más» en ventanas
  bajas), *Cobro efectivo* (recibido/cambio), *Cobro tarjeta/QR sin imagen*, *Gracias*,
  *Caja cerrada*; marca de la organización (`organizationService.getPublicBrand`).
- Indicador en el encabezado del POS con menú «Activar y abrir pantalla del cliente» /
  «Abrir pantalla del cliente» / «Cerrar», estados «Pantalla desactivada» / «Sin
  pantalla» / «Pantalla del cliente conectada».
- Tarjeta Configuración › POS › «Pantalla del cliente»: interruptor maestro + «Abrir ahora».
- En `/pos-display` no aparecen el banner PWA ni la petición de notificaciones.

---

## 4. Prueba de humo real (Go Admin Desktop 0.2.1, 2026-09-16)

Ejecutada con control del escritorio sobre el paquete
`electron/release/win-unpacked/Go Admin ERP.exe`, un solo monitor:

- Indicador → «Activar y abrir pantalla del cliente»: la ventana hija abre y enlaza en
  < 1 s por IPC (logo, nombre, «Le atiende …», líneas). Indicador «conectada».
- Cantidades, líneas nuevas y cambio de carrito se reflejan al instante.
- Cobrar → «PAGO EN EFECTIVO» con Recibido/Cambio (20.000 sobre 12.750 → 7.250).
- Completar venta → «Gracias por su compra · Total pagado».
- Cerrar por menú y por la X del sistema → «Sin pantalla» en < 5 s; reabrir enlaza.
- **Bug encontrado y corregido** (`68cb0fd8`): tras la venta, la pantalla mostraba el
  total de la venta anterior sobre el carrito siguiente. Ahora `TaxSummary` etiqueta los
  totales con `cartId`, cancela el cálculo asíncrono superado, y `CartView` filtra por id
  y retira el override con subtotal 0. **Pendiente verificarlo en vivo**: el paquete
  0.2.2 (`d631a647`, tag `v0.2.2`) incluye `68cb0fd8`, así que el próximo agente puede
  repetir el flujo «venta → carrito siguiente» y confirmar que la pantalla dice $ 0.

---

## 5. Lo que falta (en orden)

1. **QA final de la Fase 0** (no corrió): un `qa-reviewer` sobre el conjunto
   (`promptQAFinal` en `workflow-f0-v4.js`) + verificar en 0.2.2 el fix de totales.
   Anexar a `PROGRESS.md` y, si ≥ 9,5, marcar F0 cerrada.
2. **F1 lado web** con `workflow-f1.js` (ya re-alcanzado al puente real). Tester: jest +
   eslint + tsc acotado; el Electron se prueba con `electron/scripts/smoke-pos-display.md`.
3. **F2**: antes de lanzar `workflow-f2.js`, aplicar `pos_terminals` por MCP
   (`apply_migration`) y commitear `.sql` + rollback juntos. Luego tarjeta completa
   (§5.2 del PLAN), Propina (táctil = el cliente pulsa; no táctil = informativo; se
   registra por el flujo `tips` existente), Cobro·QR con imagen y «Ya pagué».
4. **F3**: `SupabaseBroadcastTransport` (solo Broadcast, un canal por terminal,
   desactivable por organización; la base ya se cayó una vez por carga: PLAN §13),
   emparejamiento por código de 6 dígitos, rutas `/api/pos/display/*` con
   `getServerOrgContext`, exclusión en middleware.
5. **F4**: aplicar `pos_display_feedback` por MCP, calificación en *Gracias* (solo si
   está activada en Configuración › POS), informe en Reportes › POS, reposo con promociones.
6. Al cerrar cada fase: anexar rondas a `PROGRESS.md`, actualizar `PLAN.md` §13 si hubo
   decisiones, `git add` solo de los archivos de la fase, commit en `main`
   `feat(pos): fase N — <qué> (QA X/10)`, y avisar a la sesión de Desktop si el paquete
   debe reconstruirse.

Notas sueltas que no hay que perder:

- La sesión de Desktop (`Database errors: timeouts and permissions`) puso `sandbox:true`
  en todas las vistas de Electron (0.2.2) y pidió aviso si la pantalla del cliente se
  resiente; en la prueba de humo (0.2.1, sin sandbox) todo funcionó: **re-probar en 0.2.2**.
- El botón «Sin conexión» del encabezado del POS es el de «Ventas pendientes de
  sincronizar» (ahora `PendientesSinConexionDialog`), no un estado de red; confunde junto
  al «En línea» de la barra. Es de otra iniciativa; solo señalarlo.
- `next.config` tiene `typescript.ignoreBuildErrors: true`: `next build` no detecta
  errores de tipos; el tsc acotado es la única red.
- Los `.sql` de F2 y F4 están **sin commitear a propósito** (se commitean con la fase que
  los aplica). No borrarlos.

---

## 6. Otros pendientes heredados (no son de este loop)

- **goadmin-websites:** diseño *stale-while-error* pendiente en el lookup de organización
  (`8a67a16`): `unstable_cache` no cachea excepciones, así que justo en una caída de la
  base el caché desaparece. `product_count` con tope de 2000 filas documentado.
- **Supabase:** el dueño subió el compute; comprobar `shared_buffers`/`max_connections`
  tras el reinicio. Riesgo de arquitectura: la tienda pública y el ERP comparten base
  (recomendado proyecto aparte o réplica de lectura).
- **Vercel (ERP):** `GATE_COOKIE_SECRET` requiere redespliegue sin caché de build;
  comprobar que el caché de veredictos `ga_gate` baja las consultas por navegación.

---

## 7. Prompt para el agente que continúa

Copiar tal cual en una sesión nueva sobre `C:\Users\USUARIO\CascadeProjects\go-admin-erp`:

```
Continúa el POS de doble pantalla (pantalla del cliente). Lee en este orden y no
empieces hasta terminar los tres: docs/pos-doble-pantalla/TRASPASO.md (estado, rutas
y reglas), docs/pos-doble-pantalla/PLAN.md (qué se construye) y las entradas «Fase:
F0» y «Prueba de humo» al final de PROGRESS.md (calificaciones y decisiones).

Reglas duras: todo sobre main (sin ramas, PRs ni worktrees, tampoco para subagentes
ni workflows); git add solo de tus archivos (el árbol tiene cambios de otras
sesiones); push solo si lo autorizo; base de datos solo por el MCP de Supabase con
.sql + rollback en el mismo commit; nunca el nombre de una organización cliente;
PROGRESS.md se anexa, nunca se reescribe; el puente de escritorio es
window.goAdminDesktop (nunca electronAPI).

Estado: Fase 0 cerrada en código (A 9,7 · B 9,8 · C 9,6 · D 9,7; 34 suites / 832
tests verdes) y probada a mano en Go Admin Desktop 0.2.1; falta solo el qa:final de
fase y verificar en el paquete 0.2.2 el fix 68cb0fd8 (la pantalla no debe heredar el
total de la venta anterior al pasar al carrito siguiente). La parte Electron de la
Fase 1 ya la hizo la sesión de Desktop; falta el lado web (workflow-f1.js).

Haz, en este orden y con el ciclo de .devin/workflows/loop.md (builder → tester →
qa-reviewer por parte, umbral 9,5, máximo 3 rondas, decisiones explícitas del
orquestador si no converge): (1) qa:final de F0 y anexo a PROGRESS.md; (2) F1 lado
web con workflow-f1.js; (3) aplicar la migración pos_terminals por MCP y lanzar F2
con workflow-f2.js; (4) F3 con workflow-f3.js; (5) aplicar pos_display_feedback y
lanzar F4 con workflow-f4.js. Al cerrar cada fase: anexa las rondas a PROGRESS.md,
actualiza PLAN.md si hubo decisiones nuevas, commitea en main solo los archivos de
la fase y avísame por fase (no por subagente). Todo debe quedar completamente
funcional y con el flujo completo: revisa siempre UI, base de datos y backend antes
de dar algo por hecho.
```
