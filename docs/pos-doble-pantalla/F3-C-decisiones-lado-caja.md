# Fase 3, parte C — decisiones: lado caja (emparejar y emitir en remoto)

Ronda 1 (2026-09-22). Complementa PLAN §3.2, §3.3, §5.2, §7 y §12 Fase 3, y
`F3-A-decisiones-realtime.md` (rutas, tokens, políticas de canal privado) y
`F3-B-decisiones-transporte-remoto.md` (transporte remoto y pantalla). No los
sustituye.

## Qué se investigó

- Realtime en el proyecto: las políticas de `realtime.messages` para el
  canal privado `pos-display:<terminalId>` ya están aplicadas (F3-A, ronda
  2 · 1). La caja se une con su **sesión de usuario** (cliente de
  `@/lib/supabase/config`; supabase-js pasa el JWT de la sesión al socket) y
  la política `pos_display_caja_recibe/envia` exige que la terminal exista,
  esté activa y sea visible por la RLS de `pos_terminals`. No hace falta
  ningún JWT propio en la caja: el JWT de corta vida de `/bootstrap` es solo
  para la pantalla (parte B).
- `channel.send()` de supabase-js **sin unión** cae a un `POST` HTTP por
  mensaje (`/api/broadcast`). El canal de la parte B ya lo evita encolando
  hasta el join; aquí además la compuerta de oyente (abajo) hace que sin
  tableta no se publique nada.
- La parte B (sesión paralela) ya había escrito `supabaseBroadcastTransport.ts`
  con `createSupabaseDisplayChannel` (la MISMA idea de «solo cambia el
  tubo» que usa el relay de escritorio). Se reutiliza tal cual (regla 7):
  esta parte no abre un segundo canal Realtime.

## Decisión 1: un solo transporte, un canal compuesto (no dos transportes)

`DisplayTransport` es dueño del sobre (`seq`, `instanceId`). Dos transportes
serían dos contadores y dos instancias: la ventana local y la tableta verían
«cajas» distintas. En su lugar, `BroadcastChannelTransport` sigue siendo el
único transporte de la caja y su `channelFactory` devuelve un **canal
compuesto** (`multiChannel.ts · createFanOutDisplayChannel`) con dos patas:

| Pata | Tubo | Cuándo |
|---|---|---|
| `local` | relay de Go Admin Desktop o BroadcastChannel (`createBroadcastDisplayChannel`, exportado ahora desde transport.ts) | siempre |
| `remote` | `createSupabaseDisplayChannel` de la parte B (`down` fuera, `up` dentro, `private: true`) envuelto en `createListenerGatedChannel` | solo si la caja está vinculada a una fila **activa** de `pos_terminals` con el mismo id (`cajaChannel.ts`) |

Resultado: un solo `seq`, una sola instancia, los dos tubos reciben sobres
idénticos, y el emisor (`emitter.ts`) no cambió ni una línea de su lógica.
Verificado en `f3c-multi-channel.test.ts` («un solo contador…», «DisplayEmitter
con dos transportes…»).

La pata remota se cuelga **después** de una comprobación asíncrona
(`PosTerminalsService.getLinkedTerminal`, una lectura con RLS por apertura
del transporte): sin ella, cada apertura del POS en una caja con UUID local
de la Fase 0 intentaría unirse a un canal privado que la política rechaza
(un join fallido y un aviso por caja, sin beneficio). Si el transporte se
cierra antes de que la comprobación responda, la pata no se cuelga. El id
del canal remoto es el que el transporte estampa en el sobre, y se exige
que sea **exactamente** `pos_terminals.id` (F3-A ronda 3 · 6).

## Decisión 2: la pata remota solo publica mientras hay una pantalla remota escuchando

El enunciado admitía «por ambos siempre». Se descartó por coste: un latido
por segundo por caja son ~86 400 mensajes de Realtime al día por caja
(~2,6 M al mes) aunque nadie los oiga, y Realtime factura por mensaje. La
caja tampoco puede saber si la terminal tiene una pantalla **emparejada**
(el hash vive en `pos_terminal_secrets`, sin permisos para `authenticated`;
una ruta nueva para consultarlo queda fuera del alcance congelado). Lo que sí
sabe es si hay una pantalla remota **hablando**:

- `createListenerGatedChannel` deja pasar `postMessage` solo mientras la
  última señal recibida por ese tubo tiene menos de `REMOTE_LISTENER_TTL_MS`
  (10 s ≈ 10 latidos de `display_alive` perdidos; la pantalla se da por
  desconectada a los 3 s). Un `display_bye` la duerme en el acto.
- No se pierde nada: la pantalla remota pide `need_snapshot` cada 2 s
  mientras no tiene caja (displayLink.ts); ese mensaje abre la compuerta
  **antes** de entregarse, y la respuesta (`announce`: hello + state, misma
  vuelta) ya sale por el tubo. Verificado en «la compuerta se abre ANTES de
  entregar».
- Coste resultante sin tableta: un join por apertura del POS (solo cajas
  registradas) y **cero mensajes**.
- Efecto aceptado: si la caja se cierra con la pata dormida (la tableta ya
  llevaba > 10 s callada), su `bye` no sale por Realtime. No importa: la
  pantalla remota lleva ese tiempo sin oír nada y su propio watchdog la puso
  en «Conectando» a los 3 s.

## Decisión 3: el indicador dice por qué tubo llegó la pantalla

`DisplayChannel.onmessage` admite ahora `origin?: 'local' | 'remote'`
(aditivo; un tubo simple no lo manda y todo cuenta como local). El canal
compuesto etiqueta cada mensaje con la pata por la que entró, y
`BroadcastChannelTransport` anota la presencia **por origen**
(`lastDisplaySeenByOrigin`): `lastDisplaySeenAt` es la más reciente y el
`display_bye` solo borra su origen (la despedida de la tableta no apaga la
ventana local ni al revés).

`DisplayPresenceSnapshot` conserva su forma exacta (los contratos y pruebas
de F0–F2 comparan con `toEqual`); la vista con `origins`
(`DisplayPresenceView`, `readDisplayPresenceView` / `withPresenceOrigins`)
es lo que consume el hook del indicador. La etiqueta pasa a «Pantalla del
cliente conectada (en este equipo / remota / en este equipo y remota)»
(`indicator.connectedWithOrigin` + `originLocal|originRemote|originBoth`);
el texto del PLAN `indicator.connected` no cambia. `isSamePresence` cuenta
un cambio de origen como cambio visible.

Nota: el adaptador de BroadcastChannel ya no reenvía el `MessageEvent`
entero al transporte (su `origin` es la URL del documento): solo `data`.

Limitación conocida y aceptada: `lastDisplayCapabilities` (táctil y tamaño
de la pantalla, F2-B) sigue siendo **una sola**, no por origen. Con la ventana
local y la tableta a la vez, la última señal manda, y el `display_bye` de una
las borra hasta el siguiente `display_alive` de la otra (≤ 1 s) — el mismo
comportamiento que ya tenía F0 con dos pantallas locales (ver transport.ts,
cabecera). Separarlas exigiría decidir cuál gobierna la pregunta de propina, y
eso es producto, no cableado: queda fuera del alcance congelado.

## Decisión 4: emparejar y revocar desde la tarjeta y desde el indicador

- `PosTerminalsService.requestPairingCode(id)` →
  `POST /api/pos/terminals/[id]/pairing-code`;
  `PosTerminalsService.revokeRemoteDisplay(id)` → `POST /api/pos/display/revoke`.
  Misma disciplina que el PATCH: sesión en cookies, organización SOLO en la
  cabecera `X-Organization-Id`, nunca en el body. Nuevos predicados
  `isTerminalNotFoundError` (404: la caja no está vinculada a una fila real)
  e `isTerminalInactiveError` (409). `patchTerminal` se conservó literal
  (hay guardas estáticas de F2-A sobre su texto).
- `PairingCodeDialog` (compartido por la tarjeta y el menú del indicador):
  pide el código al abrirse, lo pinta grande («123 456»), cuenta atrás desde
  el `expiresAt` de la ruta (no se reimplementa el TTL), paso a paso con la
  URL de la pantalla (`resolvePairingUrl`: nunca un origen de bucle local
  —Desktop sirve desde 127.0.0.1—, se usa `NEXT_PUBLIC_APP_URL` si lo hay) y
  «Generar otro código» al vencer. El texto del paso 2 usa el mismo rótulo
  que el botón de la pantalla remota de la parte B («Emparejar con un
  código»).
- `RevokeRemoteDisplayDialog` sobre `ConfirmDialog`. Idempotente.
- `DispositivoRemotoSection` en la tarjeta: solo con caja vinculada a una
  terminal activa; muestra la antigüedad de `pos_terminals.display_last_seen_at`
  (lo escribe `/heartbeat`, legible con RLS) como señal de «tableta encendida»
  (< 3 min). Relee la terminal cuando cambia el id local (sondeo de
  localStorage cada 2 s: «Vincular esta caja» escribe sin evento en la misma
  ventana) y al cerrar cualquiera de los diálogos.
- Indicador: ítems «Emparejar otro dispositivo» y «Revocar pantalla remota»
  con los diálogos montados **fuera** del `DropdownMenu` (Radix cierra el
  menú al elegir).
- Quién puede: admin/manager, resuelto en el servidor (F3-A, ronda 2 · 5);
  un cajero ve «solo un administrador…».

## i18n

Namespace nuevo `posCustomerDisplay.pairing` (31 claves, planas) y claves
`indicator.connectedWithOrigin/originLocal/originRemote/originBoth`,
`menu.pair/revoke` en es/en/fr/pt, insertadas con reemplazos puntuales
sobre anclas únicas (los archivos son compartidos con la parte B, que añadió
`posDisplay.pairing` en paralelo; ambos bloques conviven).

## Fuera de alcance (pendientes, no se amplió)

- Saber si hay un token emparejado (`display_token_hash IS NOT NULL`) exige
  una ruta de sesión nueva; hoy la tarjeta solo muestra la última señal y
  «Revocar» siempre disponible (idempotente).
- Reintento de la pata remota tras un `CHANNEL_ERROR` persistente: lo maneja
  supabase-js (rejoin) y, si no, la siguiente apertura del transporte.
- Verificación en vivo con `SUPABASE_JWT_SECRET` provisionado (F3-A) y con la
  parte B cerrada: emparejar una tableta real y ver «conectada (remota)».

## Cierre (ronda 1)

- `npx eslint` sobre todo lo tocado: sin avisos.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`
  filtrado por `pos/display|api/pos|pos-display|posTerminalsService|components/pos/display|pantalla-cliente`: nada.
- `npx jest src/__tests__/pos-display src/__tests__/guardrails.test.ts`:
  97 suites, 2567 tests en verde (incluye `f3c-multi-channel`,
  `f3c-presence-origin`, `f3c-remote-pairing`). `npx jest src/__tests__/pos
  src/__tests__/services`: 128 suites, 2977 tests en verde.
- **`NODE_OPTIONS=--max-old-space-size=8192 npx next build`: exit 0**
  («Compiled successfully in 7.8min», 335/335 páginas). En el listado
  aparecen `ƒ /api/pos/display/bootstrap|heartbeat|pair|revoke`,
  `ƒ /api/pos/terminals/[id]/pairing-code`, `○ /pos-display` y el middleware
  (37,5 kB).

---

# Ronda 2 (2026-09-22) — correcciones de QA y tester

## 1. El canal de una terminal deja de estar abierto a toda la organización (crítico)

Migración `20260922200000_pos_display_caja_sucursal_del_usuario.sql` (con su
reversión en `supabase/rollbacks/`), aplicada por el MCP.

Hasta la parte C la caja no se unía al canal privado y por él no salía nada;
la parte C es justo el cambio que lo pone en vivo. Las políticas
`pos_display_caja_recibe` / `pos_display_caja_envia` solo exigían «existe una
terminal activa con el uuid del topic», y *ver* esa terminal lo decide
`pos_terminals_select`, que es pertenencia a la organización a secas.
Consecuencia: cualquier miembro activo podía leer en vivo el carrito, los
totales, la fase de cobro y el payload del QR de pago de cualquier terminal
activa, e inyectar mensajes `up` válidos (`display_alive`, `display_bye`,
`tip_selected`, `qr_paid_claim`) porque el `terminalId` viaja en el propio
topic.

Criterio nuevo: membresía **activa** en la organización de la terminal **y**
(la sucursal de la terminal entre las del usuario en `member_branches`
**o** `role_id in (1, 2, 5)` **o** `is_super_admin` **o**
`check_user_permission(..., 'admin.full_access')`). Es el mismo criterio de
rol que ya usa `pos_terminals_update` (20260921150000), por id y nunca por
nombre.

Fail-closed a propósito: un miembro sin ninguna sucursal asignada no entra.
Medido antes de aplicar: de 138 membresías activas, 61 no tienen fila en
`member_branches` y 60 de ellas pasan igual por rol; queda 1 afectada.
`pos_terminals` tiene 0 filas, así que no había nada que migrar.

Verificado con un bloque `DO` que inserta una terminal, evalúa la expresión
como `authenticated` con `realtime.topic` fijado y hace rollback con un
`raise`: cajero de la sucursal de la terminal → true; cajero de otra
sucursal → false; admin → true; topic malformado → false (sin 22P02).
La expresión queda fijada por tests estáticos en `tester-f3c-r1.test.ts`.

**Lo que NO cierra, y queda por escrito:** «solo la caja que reclamó la
terminal» exigiría un claim de terminal en la sesión o una tabla de reclamo.
Con esta migración el radio baja de «toda la organización» a «la misma
sucursal». Pendiente de anotar también en PLAN §11 con esta fecha
(2026-09-22); este agente no edita PLAN.md.

## 2. Ritmo por tubo: el latido remoto ya no sale a 1 Hz (alto)

El transporte es **uno** para los dos tubos (un solo `seq`), así que
`heartbeatIntervalMs` no puede distinguirlos: subirlo a 5 s ralentizaría
también la presencia de la ventana local. La decisión es que el **tubo**
decida:

- `createListenerGatedChannel` acepta `beatIntervalMs` (por defecto
  `REMOTE_BEAT_INTERVAL_MS`, 5 s): deja pasar un `heartbeat` cada intervalo y
  descarta los de en medio. Todo lo demás (`hello`, `state`, `payment`,
  `bye`…) pasa en el acto. Un hueco de `seq` es inocuo: el receptor solo
  exige `seq` creciente, como ya documenta la parte B.
- `presence.ts` gana `DEFAULT_STALE_BY_ORIGIN` (`local: STALE_AFTER_MS` 3 s,
  `remote: REMOTE_STALE_AFTER_MS` 15 s) y `resolvePresentOrigins` /
  `withPresenceOrigins` / `readDisplayPresenceView` aceptan un umbral por
  origen. Sin esto, con la tableta latiendo cada 5 s (parte B) el indicador
  parpadearía «conectada (remota)» ↔ «sin pantalla» dos segundos de cada
  cinco en el flujo normal.

Con mapa por origen, `connected` pasa a derivarse de `origins.length > 0`:
así el invariante que `presence.ts` documenta sigue siendo cierto aunque cada
tubo tenga su umbral. Sin mapa (emisor de F0–F2) todo queda como estaba.

## 3. La compuerta de oyente la gobierna quien valida (medio)

`multiChannel.ts` exporta `ListenerGate` / `upMessageListenerGate(terminalId)`
y `createListenerGatedChannel` recibe el predicado. `cajaChannel.ts` le pasa
el de su terminal, construido con `isUpMessage` de `protocol.ts`: el mismo
criterio con el que `BroadcastChannelTransport.receive` acepta o descarta.

Antes bastaba con leer `data.t`: una cadena, un número, un objeto sin `t` o un
`up` de **otra** terminal abrían la compuerta 10 s y sacaban el carrito por
Realtime sin que hubiera pantalla legítima; y un `display_bye` forjado con
terminalId ajeno dormía el tubo mientras el transporte seguía anotando la
presencia, así que la tableta se quedaba con el carrito congelado y el
indicador seguía diciendo «conectada (remota)». Los tres tests marcados
DEFECTO en `tester-f3c-r1.test.ts` quedan invertidos.

## 4. La entrega también va aislada por pata (bajo)

`createFanOutDisplayChannel` ya aislaba cada `postMessage`; ahora envuelve
igual la entrega (`handler({ data, origin })`), con aviso por consola. La
cabecera del módulo promete «nunca lanza después de construido» y una
excepción del receptor subía tal cual al callback de `broadcast` de
supabase-js o al `onmessage` del `BroadcastChannel`.

## 5. Reabrir el mismo topic espera a que el anterior salga (bajo)

`createSupabaseDisplayChannel` (parte B) expone ahora `leaving`, la promesa de
su `unsubscribe()` + `removeChannel()`, en vez de tirarla con `void leave()`
— cambio aditivo, un tipo nuevo `SupabaseDisplayChannel`. `cajaChannel.ts`
guarda esa promesa por topic y la espera antes de abrir el siguiente canal,
así apagar y encender el interruptor maestro (o `refreshPosDisplay`, o un
cambio de organización) ya no deja dos canales del mismo topic sobre el mismo
socket.

## 6. Un solo reloj por lectura de presencia (bajo)

`useCustomerDisplayPresence` hace **una** llamada
(`readDisplayPresenceView`) con **un** instante, en vez de
`readDisplayPresence` + `withPresenceOrigins` con dos lecturas del reloj. En
el borde del umbral salía `connected: true` con `origins: []` y el indicador
perdía el sufijo de origen.

## Cierre (ronda 2)

- `npx eslint` sobre todo lo tocado: sin avisos.
- `npx tsc --noEmit --incremental false -p tsconfig.json`: **0 errores en
  todo el proyecto** (146 s de `Check time`, 13.850 archivos). Ojo: sin
  `--incremental false`, el `tsbuildinfo` hace que `tsc` salga en ~27 s sin
  ejecutar el comprobador (`Check time` ausente, `Types: 89`) y reporte un
  «0 errores» falso.
- `npx jest src/__tests__/pos-display`: 99 suites, 2514 tests en verde.


---

# Ronda 3 — correcciones

## 1. El saludo de la caja ya no se pierde por la pata remota (alto)

El defecto, verificado de punta a punta: `posDisplay.ts` construye el
transporte y el emisor llama a `announce()` **síncronamente**, pero la pata
remota solo se cuelga cuando `isRegisteredTerminal()` responde (ida y vuelta
a la BD). El `hello` y el `state` salían cuando el canal compuesto era
todavía solo local; `addLeg` no reenviaba nada; y aunque hubieran llegado, la
compuerta nace dormida y `postMessage` los tiraba. Resultado: la tableta
seguía pintando el carrito, el total y el cliente de la **venta anterior**
hasta que su watchdog remoto (`REMOTE_STALE_AFTER_MS`, 15 s) soltaba la
instancia vieja y su siguiente `need_snapshot` provocaba el anuncio: hasta
~17 s con datos de otro cliente en una pantalla de cara al público.

Corrección en dos piezas, las dos dentro de `multiChannel.ts`:

- `createFanOutDisplayChannel` **retiene** el último `hello` y el último
  `state` publicados y se los entrega a la pata que se cuelga después
  (`addLeg`), en ese orden —el de `announce()`— y **solo a ella**. Un latido
  no se retiene: no le sirve a nadie.
- `createListenerGatedChannel` ya no tira lo que no puede publicar: un
  `hello` o un `state` que la compuerta deja fuera queda **retenido** y marca
  un hueco (`hasPendingSnapshot`), y se publica en cuanto la compuerta vuelve
  a abrirse, antes que ningún otro mensaje. El TTL sigue mandando sobre qué
  sale, pero ya no sobre qué se pierde para siempre.

La reposición va **después** de entregar el mensaje al transporte, a
propósito: si lo que abrió la compuerta fue un `need_snapshot`, el emisor ya
respondió con hello + state frescos en la misma vuelta y eso cierra el hueco,
así que no se duplica nada. Solo se repone cuando nadie pidió snapshot, que
es justo el caso del defecto: el `display_alive` de una tableta que todavía
cree estar hablando con la caja anterior.

**Lo que NO se hizo, y por qué.** El informe ofrecía además publicar el
saludo retenido al *colgar* la pata, lo que daría la instantánea «como la
ventana local». Se descartó: rompe el invariante de coste cero que la ronda 1
dejó cubierto con un test (`tester-f3c-r1.test.ts`, «nada se publica por
Realtime antes de que la pantalla remota hable»), porque publicaría dos
mensajes por apertura del POS aunque no haya ninguna tableta. Con la
reposición al despertar, la cota pasa de ~17 s a **un latido remoto (≤ 5 s)**
sin publicar un solo mensaje de más. Si el QA prefiere la instantánea a
cambio del invariante, el enganche es de dos líneas y queda en pendientes.

Tampoco se tocó el `else if (!sameInstance) return;` de `transport.ts`
(la parte «complementaria» del informe): es el receptor común a local y
remoto, aprobado en F0–F2, y el defecto visible se cierra sin él. Queda
anotado en pendientes.

## 2. El TTL de la compuerta se deriva del ritmo remoto (medio)

`REMOTE_LISTENER_TTL_MS` era un 10 s fijo con una cabecera que lo justificaba
con un ritmo que ya no existe («la pantalla late cada segundo… diez segundos
son ~10 latidos perdidos»). La tableta late cada `REMOTE_PRESENCE_INTERVAL_MS`
(5 s): el margen real eran **dos** latidos, y el TTL quedaba **5 s por
debajo** de `REMOTE_STALE_AFTER_MS`, el silencio que la propia tableta
tolera. O sea: la caja se callaba antes de que la tableta se enterara, y un
solo `display_alive` perdido bastaba para que un `state` se esfumara sin que
nadie lo pidiera de vuelta.

Ahora se deriva y se acota por abajo:

```ts
export const REMOTE_LISTENER_TTL_MS = Math.max(3 * REMOTE_PRESENCE_INTERVAL_MS, REMOTE_STALE_AFTER_MS);
```

Tres latidos, el mismo margen que en local, y nunca menos que el umbral de la
tableta. La cabecera se reescribió para describir el ritmo real. Y, por si
aun así llegara a dormirse, lo publicado en esa ventana ya no se pierde
(punto 1).

## 3. La espera de la salida del topic anterior tiene tope (medio)

`attachRemote` hacía `await salidasEnVuelo.get(topic)`, que encadena
`unsubscribe()` + `removeChannel()`. Si `unsubscribe()` no resolvía (socket
colgado, `phx_reply` que no llega), la pata remota **no se colgaba nunca**:
`remoteAttached` quedaba pendiente para siempre, la entrada del mapa no se
liberaba y la caja se quedaba en local sin aviso ni reintento.

Ahora la espera pasa por `esperarSalidaAnterior(topic, timeoutMs)`, que corre
la promesa contra un temporizador de `SALIDA_ANTERIOR_TIMEOUT_MS` (1,5 s,
ajustable por `deps.salidaTimeoutMs` en pruebas): pasado el plazo se abre
igual y queda constancia por consola. Quedarse sin pantalla remota es peor
que un solape momentáneo de dos canales del mismo topic, que supabase-js ya
sabe resolver. El temporizador va sin retener el proceso (`unref`).

## 4. El ritmo del latido remoto se reinicia al despertar (bajo)

`lastBeatAt` solo se ponía a `null` en `close()`. Una tableta que se empareja
o reconecta justo después de un `display_bye` (o tras vencer el TTL) podía
esperar hasta `REMOTE_BEAT_INTERVAL_MS` (5 s) su primer latido, porque el
ritmo se seguía midiendo desde el último publicado para la tableta
**anterior**. Ahora se reinicia cuando el veredicto de la compuerta pasa de
dormida a abierta.

## Lo que esta ronda NO cierra

- **Suplantación de terminal entre cajas.** El topic remoto sigue saliendo de
  `getOrCreateLocalTerminalId()` (localStorage) y la única guarda del cliente
  es que ese id corresponda a una fila activa de la organización. Un cajero
  que vea los uuid de otras terminales en Configuración › POS puede escribir
  uno en `localStorage` y unirse al canal de esa terminal. La política de
  realtime de la migración `20260922200000` acota el radio a la sucursal (o a
  toda la organización para roles 1/2/5, `is_super_admin` o
  `admin.full_access`), pero no impide la suplantación dentro de ese radio.
  Cerrarlo exige lo que la propia migración deja anticipado: un *claim* de
  terminal en la sesión, o una tabla de reclamo (terminal ↔ usuario o
  dispositivo) comprobada por la política de `realtime.messages`. **La fase 3
  no debe cerrarse declarando seguro el canal remoto**; el aplazamiento tiene
  que quedar escrito con fecha en PLAN §11, que esta sesión no edita.
- **Cubo global de `POST /api/pos/display/pair`.** Es de la parte A y hay una
  sesión concurrente sobre esa ruta. La entrada sigue rechazando a todo el
  mundo mientras el cubo global esté agotado, incluido quien presenta el
  código correcto desde una IP limpia.
- **Verificación global con el árbol quieto.** Las partes A y B se estaban
  editando en caliente durante esta ronda.

## Cierre (ronda 3)

- `npx eslint` sobre todo lo tocado: sin avisos.
- `npx tsc --noEmit --incremental false -p tsconfig.json`: **0 errores en
  todo el proyecto**, salida vacía y código 0.
- `npx jest src/__tests__/pos-display`: 105 suites, 2585 tests en verde.
- `npx jest src/__tests__/guardrails.test.ts`: 91 tests en verde.
- Los cuatro `it` marcados DEFECTO en `tester-f3c-r2.test.ts` quedan
  invertidos (afirman ahora el comportamiento corregido), y el test de coste
  cero de `tester-f3c-r1.test.ts` se amplía para cubrir la reposición.
  Los casos nuevos del builder están en `src/__tests__/pos-display/f3c-ronda3.test.ts`.
