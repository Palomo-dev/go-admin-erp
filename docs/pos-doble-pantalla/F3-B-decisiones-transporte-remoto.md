# Fase 3, parte B — decisiones: transporte remoto y pantalla emparejable

Ronda 1 (2026-09-22). Complementa PLAN §3.2, §3.3, §7, §8, §11 y §12 Fase 3 y
`F3-A-decisiones-realtime.md`; no los sustituye. La parte A (rutas y
`displayAuth`) se usa tal cual; el único cambio en ella es de superficie
(ver «Formas compartidas»).

## 1. Cómo se une la pantalla remota al canal (lo que pedía investigar)

Lo que hay en el proyecto (verificado en la parte A, rondas 2 y 3, y
releído aquí):

- `realtime.messages` tiene RLS y CUATRO políticas, todas
  `extension = 'broadcast'` (migraciones `20260922130000` y
  `20260922180000`): la pantalla recibe y emite solo en
  `'pos-display:' || (auth.jwt() ->> 'pos_terminal_id')`; la caja
  (`authenticated`) solo en canales de terminales ACTIVAS que ve por la RLS
  de `pos_terminals`. Se evalúan únicamente en canales suscritos con
  `config: { private: true }`.
- `/bootstrap` y cada `/heartbeat` emiten un **JWT HS256 de 5 min** con
  `role: anon` y el claim `pos_terminal_id` (conjunto exacto fijado por
  `REALTIME_JWT_PAYLOAD_KEYS`), firmado con `SUPABASE_JWT_SECRET`.
- En `src/lib` no había ningún uso de canales privados ni de
  `realtime.setAuth`: los usos existentes (`activityService`,
  `useActivityRealtime`, `realtimeService`…) son canales públicos con la
  sesión del cliente compartido.

**Decisión: se aplican las dos cosas a la vez**, porque en este proyecto las
dos existen y se necesitan mutuamente:

1. La pantalla se une con el JWT de `/bootstrap` y lo renueva con el de cada
   `/heartbeat` (`realtime.setAuth(token)`).
2. El canal se suscribe SIEMPRE con `private: true`; sin eso el JWT sería
   decorativo (F3-A ronda 2 · 1) y con la clave anon cualquiera podría leer
   el carrito. Es criterio de aceptación (PLAN §11) y lo fija un test.

Mecánica concreta en supabase-js 2.49 / realtime-js 2.11 (leído en
`node_modules`):

- El join manda `access_token = socket.accessTokenValue`, que al construir el
  cliente es la **clave anon**. Por eso `setAuth(jwt)` va **antes** de
  `subscribe()`; si no, la política rechaza el join y supabase-js reintenta
  con el mismo token. `remoteDisplayClient.ts` lo documenta como «orden
  obligatorio» y `useRemoteDisplay` lo espera (`await client.setToken`)
  antes de construir el receptor.
- Al confirmar el join, supabase-js llama `socket.setAuth()` **sin
  argumento**, que resuelve el token con el callback `accessToken` del
  cliente. Por eso el cliente de la pantalla se construye con la opción
  `accessToken: async () => tokenVigente` (y sin `auth`): cualquier
  re-autenticación interna lee siempre el último JWT que entregó el servidor,
  nunca la clave anon ni una sesión.
- `setAuth(jwt)` con un canal ya unido empuja `access_token` al canal
  (`phx: access_token`) y las políticas se reevalúan: es lo que hace el
  latido cada 60 s. `setAuth` rechaza un JWT con `exp` vencido; se registra y
  se sigue con el siguiente latido.

## 2. Por qué el transporte remoto es una fábrica de canal, no otra clase de lógica

`transport.ts` ya separaba lógica (sobre, seq, adopción, elección, watchdog,
latido, presencia) de tubo (`DisplayChannel` + `channelFactory`), y el relay
de escritorio ya usaba ese punto de extensión. `supabaseBroadcastTransport.ts`
hace lo mismo con un canal de Supabase:

- `createSupabaseDisplayChannel(client, terminalId, { sendEvent, listenEvent,
  channelName?, onStatus?, joinQueueLimit? })` → `DisplayChannel`.
- `SupabaseBroadcastTransport extends BroadcastChannelTransport` (caja) y
  `SupabaseBroadcastReceiver extends BroadcastChannelReceiver` (pantalla),
  con `client` (y opcionalmente `channelName`, `onStatus`) en lugar de
  `channelFactory`. **No hubo que extraer nada a un módulo común**: la
  lógica ya estaba en un solo sitio, y `transport.test.ts` sigue cubriendo
  las dos implementaciones. La parte C (canal compuesto local + remoto) ya
  consume `supabaseTransportChannelFactory`, `SupabaseClientLike` y
  `SupabaseChannelStatus` de aquí.

Detalles del canal:

| Aspecto | Decisión |
|---|---|
| Nombre | `pos-display:<terminalId>` (`displayChannelName`); la pantalla pasa el `realtime.channel` del bootstrap tal cual. |
| Config | `private: true`, `broadcast: { self: false, ack: false }`. |
| Eventos | `down` (caja → pantalla) y `up` (pantalla → caja). Cada lado se suscribe solo al evento que le toca: la caja no oye sus propios `down` ni los `down` falsos de una pantalla; la pantalla no oye `up`. |
| Antes del join | Lo publicado se ENCOLA (tope 32, se descarta lo más viejo) y se vacía en orden al `SUBSCRIBED`. Motivo: `channel.send()` sin unión cae al endpoint HTTP de Broadcast (una petición autenticada por mensaje y sin orden garantizado respecto al socket), y la caja saluda (announce) antes de que el join termine. Un hueco de seq es inocuo para el receptor. Tras `CHANNEL_ERROR`/`CLOSED` se vuelve a encolar hasta el siguiente `SUBSCRIBED`. |
| Fallo de `send` | `console.warn` y se traga (PLAN §5.5). |
| Cierre | La clase base publica `bye`/`display_bye`; luego `unsubscribe()` + `removeChannel()` (si el cliente lo expone). Los pushes van en orden por el socket. |
| `onStatus` | Cada `SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`; un handler que lanza se registra y no rompe el canal. La pantalla lo usa para «sin canal» frente a «Conectando». |

**Id de terminal del canal remoto**: siempre `pos_terminals.id` (minúsculas,
F3-A ronda 3 · 6). La pantalla lo toma de `bootstrap.terminal.id` y el
nombre del canal de `bootstrap.realtime.channel`; la caja (parte C) del id de
su fila vinculada. `displayChannelName` no normaliza (contrato de F0).

## 3. Selección de transporte en la pantalla (`resolveRemoteIntent`)

| Al cargar `/pos-display` | Resultado |
|---|---|
| `?pair=` con **exactamente** 6 dígitos | Canjear el código (manda sobre un token guardado: el usuario quiere re-emparejar), **llevando el token guardado como respaldo**. |
| token guardado (`localStorage.pos_display_remote`) | **Remoto**: bootstrap → `SupabaseBroadcastReceiver`. |
| `?pair` presente con cualquier otra cosa | Pantalla de emparejamiento con los dígitos que se puedan leer. |
| nada de lo anterior | **Local**: BroadcastChannel / relay de escritorio, exactamente como antes. |

**Un código gastado no tira un emparejamiento vivo (ronda 2 · 1).** Un
código se consume al primer canje y vive cinco minutos. El escenario del
PLAN §3.3 es una tableta en modo quiosco cuya URL de arranque es
`/pos-display?pair=<código>`: `replaceState` limpia la barra de direcciones,
pero la URL configurada en el quiosco **no cambia**, así que cada reinicio
reintenta un código ya gastado y recibe 404. Antes eso dejaba la pantalla
pidiendo un código nuevo delante del cliente —y gastando uno de los 10
intentos por IP cada 15 minutos— con un emparejamiento perfectamente vivo.
Ahora, si el canje falla y hay emparejamiento guardado, se arranca con él
(`resolveRedeemFailure`, que se relee del storage por si se revocó entre
medias). Da igual el motivo del fallo: al token guardado solo lo invalida un
401 de `/bootstrap` o `/heartbeat`, que además lo borra. **Sin** token
guardado, se pide el código, como antes.

**Nada truncado se canjea (ronda 2 · 7).** `readPairCodeFromSearch` devuelve
el valor crudo de `?pair`, sin sanear. Antes lo saneaba, y eso convertía
`?pair=1234567` o `?pair=abc-123456` en un canje silencioso de `123456`: un
intento contra un código que **no** es el que se pegó, gastando cupo del
límite de `/pair` sin decir que lo enviado no era lo escrito. Ahora solo se
canjea lo que son exactamente seis dígitos; lo demás va al campo de
emparejamiento con lo que se pueda leer, para que la persona vea lo que va a
mandar.

**Reconciliación con el alcance** («sin código y sin token: pantalla de
emparejamiento» frente a «si no hay token → BroadcastChannel, comportamiento
actual»): sin código ni token la pantalla sigue en LOCAL —una ventana
`/pos-display` abierta junto a la caja no puede ponerse a pedir un código—,
y la pantalla de emparejamiento queda a un toque desde «Conectando» cuando
en este equipo **no hay caja** (`pos_terminal_id` ausente: la situación de
una tableta): botón «Emparejar con un código» (`ConnectingView.onPair`).
Con caja local el botón no aparece.

El receptor no se abre hasta que la decisión está tomada
(`useDisplayReceiver(remote, enabled)`): así una tableta con token no abre
un receptor local un instante y se despide de nadie.

## 4. Token, storage, latido y revocación (`remoteDisplay.ts`)

- **Clave documentada**: `localStorage['pos_display_remote']` =
  `{ v: 1, token, terminalId, pairedAt }`. Se valida la forma del token al
  leer (43 caracteres base64url); cualquier cosa corrupta cuenta como
  ausente. Se guarda en claro: no hay alternativa sin sesión; por eso existe
  `/revoke` y el JWT de canal vive 5 min.
- El token largo viaja SOLO como `Authorization: Bearer` a
  `/api/pos/display/bootstrap` y `/heartbeat` (mismo origen); nunca en la
  URL, nunca en un body. El test del flujo completo lo comprueba en cada
  llamada registrada.
- Tras el canje —salga bien o mal— `?pair` se retira de la URL con
  `history.replaceState`: el código ya se consumió y una recarga no debe
  volver a mandarlo (404). En desarrollo, StrictMode remonta el efecto: el
  segundo intento reutiliza la MISMA petición de canje en vuelo
  (`pairInFlightRef`), por eso el `replaceState` va DESPUÉS de la respuesta
  y no en el primer render (ver «riesgos aceptados»).
- **Sin storage** (modo privado, almacenamiento bloqueado) el canje se
  detiene con el error `storage`, pero el código YA se consumió en el
  servidor: el texto del error lo dice y pide generar otro en la caja
  después de permitir el almacenamiento (ronda 2 · 10).
- **Latido**: `POST /heartbeat` cada 60 s (`REMOTE_HEARTBEAT_INTERVAL_MS`);
  el primero espera un intervalo entero (el bootstrap acaba de dar un JWT
  fresco). Cada 200 aplica el JWT nuevo con `setToken` → `realtime.setAuth`.
  Dos latidos nunca se solapan. 503 o red → se registra y se reintenta en el
  siguiente tick (no desempareja).
- **401** en `/bootstrap` o en `/heartbeat` = revocada o token inválido: se
  para el latido, se cierra el receptor (sale del canal: `display_bye` +
  `unsubscribe`), se libera el cliente, se BORRA el token y se vuelve a la
  pantalla de emparejamiento con el aviso «desemparejada desde la caja».
  Ventana residual: ≤ 5 min (TTL del JWT), la de F3-A ronda 3 · 2.
- **Bootstrap que falla por otra cosa** (503 `REALTIME_NOT_CONFIGURED`,
  base caída, red): se conserva el token y se reintenta con retroceso 5 s →
  10 s → 20 s → 40 s → 60 s (tope). El 503 de Realtime se dice tal cual en
  pantalla («el servidor no tiene configurado el canal… SUPABASE_JWT_SECRET»)
  para quien instala; no es un error de emparejamiento.
- **Sin `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` en el bundle**: fase
  `unavailable` con su texto; tampoco es un error de emparejamiento.
- **Bootstrap incoherente** (ronda 2 · 6): se exige que
  `realtime.channel === displayChannelName(terminal.id)`. La pantalla se une
  al canal que le dice el servidor pero filtra los sobres por `terminal.id`;
  si los dos no casaran —una regresión del servidor— quedaría unida a un
  canal ajeno descartándolo todo: «Conectando» eterno y ningún diagnóstico.
  Se rechaza el bootstrap, se registra el par (canal, esperado) y se
  reintenta con retroceso.

### Riesgos aceptados

- **El código de emparejamiento viaja en la URL de la página** cuando se
  entra por el QR o el enlace de la caja (`/pos-display?pair=123456`), así
  que queda en el historial del navegador de la tableta, en cualquier
  restauración de sesión y en los registros de acceso del servidor y del CDN
  de esa petición de página —no solo en el `POST /pair` (ronda 2 · 9).
  Se acepta: el código es de **un solo uso**, vive **cinco minutos**, no
  sirve sin llegar a la red del servidor y lo que abre es el canal de UNA
  terminal. Tecleándolo en la pantalla de emparejamiento esa superficie no
  existe, y ese camino está siempre disponible. No se retira del historial
  en el primer render porque el canje necesita el valor después de que
  StrictMode remonte el efecto; retirarlo antes rompería el arranque en
  desarrollo a cambio de estrechar una ventana que en el registro de acceso
  ya está escrita. El token largo, que sí es duradero, nunca va en la URL.
- **La pantalla remota se sirve por https o localhost** (ronda 4 · QA-2).
  `crypto.subtle` solo existe en contexto seguro, y de él sale la huella del
  código que permite distinguir «el quiosco reintenta SU propio código
  gastado» de «alguien reapunta esta tableta a otra caja». Una tableta
  apuntada a la instancia por IP de la LAN sobre **http plano** no tenía
  huella y volvía a tener el defecto original: cada reinicio reintentaba su
  `?pair` consumido, recibía 404 y se quedaba pidiendo código delante del
  cliente con un emparejamiento vivo. Sigue siendo condición de despliegue
  (el token en localStorage y el WebSocket de Realtime también lo piden),
  pero ya no se paga con el arranque: sin `crypto.subtle` se guarda una
  huella NO criptográfica con prefijo propio (`fnv1a32:`). Se puede porque la
  huella no protege un secreto —seis dígitos se invierten igual desde un
  sha256— y solo responde «¿es el mismo código?» contra un valor del propio
  dispositivo. Si la tableta cambia de esquema (http → https) la huella
  guardada deja de coincidir y se pide el código: el lado seguro.
- **Un cierre anterior al join no se despide** (ronda 2 · 4). Lo que se
  publica mientras el canal no está unido se encola, y `close()` descarta la
  cola: un `display_bye` de un cierre en el primer segundo se pierde.
  Vaciarla al cerrar costaría una petición HTTP de Broadcast por mensaje
  retenido contra un canal al que no se llegó a entrar, para ahorrarle al
  otro lado los `REMOTE_STALE_AFTER_MS` que ya sabe esperar. El silencio es
  el camino previsto: el watchdog existe precisamente para las despedidas
  que no llegan. Con el canal YA unido —el caso normal, incluida la
  revocación— el bye sí sale: `useRemoteDisplay` cierra el receptor ANTES de
  soltar el cliente de Realtime (antes llamaba `dispose()` primero y la
  despedida salía por un canal ya retirado).

## 4 bis. Ritmo del canal remoto (ronda 2 · 2)

En BroadcastChannel un mensaje no cuesta nada: no sale del navegador. Por eso
el transporte local late a `HEARTBEAT_INTERVAL_MS` = 1 s y da la caja por
caída a los 3 s. En Supabase Realtime cada mensaje se factura, y heredar ese
ritmo salía carísimo: la presencia de UNA tableta son 86.400 `display_alive`
al día (~2,6 M al mes), más otro tanto del latido de bajada de la caja; con
una sola pantalla encendida todo el día ya se está en el orden de la cuota
mensual del plan, y cada terminal lo multiplica.

El canal remoto usa un ritmo propio, que hay que pasar **explícitamente**
(las clases conservan el de 1 s por defecto, que es el correcto en local):

| Constante | Valor | Quién la pasa |
|---|---|---|
| `REMOTE_PRESENCE_INTERVAL_MS` | 5 s | `useRemoteDisplay` → `SupabaseBroadcastReceiver` |
| `REMOTE_STALE_AFTER_MS` | 15 s (3 latidos) | el receptor **y** `startDisplayLink` (si no, «Conectando» parpadearía entre latidos) |
| `REMOTE_BEAT_INTERVAL_MS` | 5 s | la parte C, en la pata remota del canal compuesto (`multiChannel.ts`, `cajaChannel.ts`): **ya aplicado** |
| `REMOTE_RESNAPSHOT_INTERVAL_MS` | 5 s | `useRemoteDisplay` → `useDisplayReceiver` → `startDisplayLink` (ronda 4 · QA-1) |
| `REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS` | 60 s | igual, y solo una vez pasados `DISCONNECTED_TO_IDLE_MS` sin caja (ronda 4 · QA-1) |

Son ~17.300 mensajes de presencia al mes por tableta: 150 veces menos. Lo que
**no** cambia es el `state` del carrito, que no es un latido: sale cuando el
cajero teclea y sigue saliendo en el acto. El ritmo lento solo alarga cuánto
tarda cada lado en dar por muerto al otro cuando calla.

**El `need_snapshot` era el peor caso, y en la ronda 2 se quedó fuera**
(ronda 4 · QA-1). Mientras no hay caja viva, el enlace vuelve a pedir el
snapshot cada `RESNAPSHOT_INTERVAL_MS` = 2 s indefinidamente:
`DISCONNECTED_TO_IDLE_MS` solo cambia la vista (Conectando → Reposo), no
detiene la pregunta. Sobre Broadcast son 30 mensajes de SUBIDA por minuto que
se suman a los 12 de la presencia: 42 por minuto = ~60.000 al día por tableta
con la caja cerrada. Una tableta de quiosco encendida toda la noche y el fin
de semana (16 h cerradas al día) gastaba ~29.000 mensajes diarios pidiendo un
snapshot que nadie iba a contestar —el mismo orden de magnitud que esta
sección bajó para la presencia— y justo en las horas en que nadie mira. Con
la caja conectada el coste no existe: el `need_snapshot` cesa en cuanto llega
el primer `state`, por eso no saltaba ni en los tests ni en la demo.

Ahora el ritmo remoto es el de la presencia (5 s) y, pasado
`DISCONNECTED_TO_IDLE_MS` —la pantalla ya pinta Reposo—, retrocede a uno por
minuto: si la caja lleva un minuto callada, preguntar cada cinco segundos no
la va a despertar, y cuando vuelva saludará ella (`announce`) sin que nadie
pregunte. En local los dos ritmos son el de siempre (2 s), porque un mensaje
de BroadcastChannel no cuesta nada; `startDisplayLink` recibe
`idleResnapshotIntervalMs` con el mismo valor que `resnapshotIntervalMs` si
no se le pasa otra cosa. La prueba cuenta los envíos del doble de canal
durante diez minutos simulados de desconexión: ~21 en remoto contra 301 en
local.

El `heartbeatIntervalMs` del lado CAJA era una decisión de la parte C, no de
la B: el canal de la caja es uno compuesto (local + remoto tras la compuerta
de oyente), así que el latido es único para las dos patas y bajarlo sin más
degradaría la detección de la pantalla local. La parte C ya lo aplicó en la
pata remota (`multiChannel.ts`, `cajaChannel.ts`), así que **este pendiente
está cerrado**; quedó escrito como abierto por error en el traspaso de la
ronda 2 (ronda 3 · 8).

## 5. Cliente Supabase propio de la pantalla (`remoteDisplayClient.ts`)

No se usa `@/lib/supabase/config`: ese cliente lleva la sesión del usuario,
caché offline y llama `realtime.setAuth()` por su cuenta en cada evento de
auth (pisaría el JWT de la pantalla). El de la pantalla se construye con
`createClient(url, anon, { accessToken: async () => tokenVigente })`: sin
`auth` (acceder a `client.auth` lanza a propósito), `x-client-info:
go-admin-pos-display` para el triaje de logs, `dispose()` = `removeAllChannels`
+ `realtime.disconnect()`.

### El JWT vencido no se conserva (ronda 2 · 3)

`setToken(jwt)` da el token por vigente **solo si `realtime.setAuth` lo
acepta**; si lo rechaza (o si ya pasó su `exp`) se olvida en los dos sitios
donde realtime-js lo guarda: el nuestro y su `accessTokenValue`. Hace falta
lo segundo porque `setAuth()` sin argumento cae en `accessTokenValue` cuando
el callback devuelve null. Antes se asignaba primero y solo se registraba un
aviso: el callback `accessToken` seguía devolviendo el JWT muerto, cada join
salía con él y el latido de socket de realtime-js (`this.setAuth()` sin
`await`, cada 30 s) dejaba una promesa rechazada sin capturar —en
desarrollo, el overlay de Next, contra PLAN §5.5.

Además hay un **latido forzado al despertar**: el JWT vive 5 min y el latido
HTTP va cada 60 s, así que en marcha siempre hay margen; lo que no lo tiene
es una tableta suspendida o sin wifi más de cinco minutos. Al volver la
pestaña a primer plano (`visibilitychange`) o al recuperar la red (`online`)
se fuerza un `beat()`, que trae un JWT fresco en el acto en vez de esperar al
siguiente tick de 60 s.

## 6. Marca, ajustes e idioma en remoto

- La marca no puede leerse con `organizationService` (sin sesión): llega en
  el bootstrap y se construye con `brandFromBootstrap` —una función pura,
  con la misma corrección AA del color.
- **En remoto NO se monta el hook de la marca local** (ronda 2 · 5). Antes
  era un parámetro `override` de `useDisplayBrand`, y las reglas de los
  hooks obligaban a llamar igual a `useOrganization()` aunque el resultado
  se descartara. En un dispositivo sin `userData` ni organización en
  localStorage —exactamente la tableta emparejada— ese hook se reprograma
  cada 1,5 s esperando una sesión que nunca llega: en un equipo de quiosco,
  un re-render para siempre. La única forma de no pagarlo es no montarlo,
  así que quien decide es el componente: `CustomerDisplay` pinta con la
  marca del bootstrap en remoto, con `NEUTRAL_DISPLAY_BRAND` mientras se
  empareja o arranca, y solo en LOCAL monta `LocalBrandShell`, que es quien
  llama `useLocalDisplayBrand`. De paso, el reintento de `useOrganization`
  ahora se cancela al desmontar (antes ni eso).
- Los ajustes de presentación (`bootstrap.settings`) NO se usan todavía en la
  parte B: lo que la pantalla pinta viene en `hello.settings` desde la caja,
  como en local. Se validan en forma (`isRemoteBootstrap`) y se dejan
  disponibles.
- **`bootstrap.locale` SÍ se aplica** (ronda 4 · QA-4). Sale del ajuste
  `pos_customer_display` de la organización, resuelto en el servidor, y hasta
  la ronda 3 se validaba, viajaba y no se usaba: el idioma efectivo de una
  tableta recién sacada de la caja era el de su navegador, no el del
  comercio. No hace falta cookie ni recarga: el proveedor de i18n de este
  proyecto cambia de idioma en caliente (`changeLanguage`, que carga los
  mensajes y avisa por evento). La regla pura es `resolveRemoteLocale`, que
  devuelve null si el idioma ya es ese o no es uno de los cuatro de la app;
  así el efecto que lo llama no puede ciclar. Solo en REMOTO: en local el
  idioma es el del equipo, que es el mismo de la caja.

## 7. Formas compartidas (único cambio en la parte A)

`PAIRING_CODE_PATTERN`, `DISPLAY_TOKEN_PATTERN`, `isPairingCodeShape` e
`isDisplayTokenShape` viven ahora en el módulo hoja
`src/lib/pos/display/pairing.ts` (sin `node:crypto`), que también usa la
pantalla en el navegador; `server/displayTokens.ts` los **reexporta** con
los mismos nombres, así ni las rutas ni los tests `f3a-*` cambian de import
(un test lo afirma por identidad de referencia). `normalizePairingCodeInput`
(«123 456» → `123456`) es nuevo y solo lo usa la pantalla.

## 8. Tests (`src/__tests__/pos-display/f3b-*`)

- `f3b-supabaseRealtimeDouble.ts`: doble de Realtime en memoria (varios
  clientes, un bus por topic, join controlable, `send` que puede rechazar,
  cliente sin `removeChannel`).
- `f3b-supabase-transport.test.ts` (20): contrato `DisplayTransport` /
  `DisplayReceiver`; canal privado, `self: false`, un evento por sentido;
  sobre y descarte por terminal / seq / instancia (herencia de
  `transport.ts`); `toInstanceId`; presencia; dos cajas; cola previa al join
  (orden, tope, re-encolado tras error); `send` que rechaza; latido; cierre
  con `bye` + salida del canal; `onStatus`.
- `f3b-remote-display.test.ts` (22): formas compartidas con el servidor;
  storage (clave, corrupción, storage que lanza); intención de arranque;
  `stripPairFromUrl`; `/pair`, `/bootstrap`, `/heartbeat` con fetch
  mockeado (200, 400/404, 401, 429, 503, red, JSON inválido, forma rara);
  latido cada 60 s con renovación, 401 → `onRevoked` una vez y parada, 503 /
  red → sigue, sin solape, respuesta tardía tras `stop()`; y el flujo
  completo código → token → bootstrap → latido → revocación → token borrado,
  con la comprobación de que el token largo nunca viaja fuera del Bearer.

## 9. Cierre (ronda 1)

- `npx eslint` sobre todo lo tocado: sin avisos.
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`:
  0 errores en archivos de la parte B. Los 7 que quedan (`presence.test.ts`,
  `tester-r6-parte-d.test.ts`, `transport.ts:305`) son de la parte C, en
  curso en paralelo (`lastSeenAt` en `PresenceLook`, `DisplayChannelEvent`
  en el adaptador de BroadcastChannel).
- `npx jest src/__tests__/pos-display`: 86 suites en verde incluidas las 2
  nuevas (42 tests); las 7 que fallan (`presence`, `tester-r1/r5/r6-parte-d`,
  `tester-f2a-r1/r2`, `tester-f1-r2-electron`) no importan ningún archivo de
  la parte B y fallan por los cambios en curso de la parte C en
  `posDisplay.ts`, `presence.ts`, `emitter.ts` y `posTerminalsService.ts`.
  `guardrails.test.ts`: en verde.
- `npx next build`: no ejecutado en esta ronda; con el error de tsc de la
  parte C en `transport.ts` no compilaría por causa ajena a la parte B.
- **Verificación en vivo pendiente de entorno** (igual que en F3-A):
  `SUPABASE_JWT_SECRET` no está provisionado; hasta entonces `/bootstrap`
  responde 503 y la pantalla remota se queda en «el servidor no tiene
  configurado el canal…» reintentando. El procedimiento está en F3-A
  «Ronda 2 · 1»; con la parte B basta abrir `/pos-display?pair=<código>` en
  la tableta.

## 10. Ronda 2 — correcciones del QA y del tester

| # | Defecto | Dónde se corrigió |
|---|---|---|
| 1 | Un `?pair` ya consumido anulaba un emparejamiento válido (quiosco) | `resolveRemoteIntent` lleva `fallback`; `resolveRedeemFailure` + `redeem` caen en el token guardado |
| 2 | El ritmo de 1 s del transporte local se heredaba en Realtime | `REMOTE_PRESENCE_INTERVAL_MS` / `REMOTE_STALE_AFTER_MS`, pasados al receptor y propagados a `startDisplayLink` |
| 3 | Un JWT vencido se quedaba como «vigente» | `setToken` solo lo conserva si `setAuth` lo acepta; se olvida también de `accessTokenValue`; latido forzado en `visibilitychange` / `online` |
| 4 | Una pantalla revocada no llegaba a decir `display_bye` | `teardownRemote` cierra el receptor ANTES de `client.dispose()` |
| 5 | Bucle de reintento de `useOrganization` en la tableta | `useLocalDisplayBrand` solo se monta en local (`LocalBrandShell`); el reintento se cancela al desmontar |
| 6 | No se comprobaba `realtime.channel` contra `terminal.id` | `isRemoteBootstrap` |
| 7 | `?pair` con más de 6 dígitos o con letras se canjeaba truncado | `readPairCodeFromSearch` devuelve el valor crudo; `resolveRemoteIntent` decide |
| 8 | Tras un canje fallido el campo se quedaba lleno y bloqueado | `PairingView` lo vacía en el flanco de `busy` con error |
| 9 | El código en la URL no estaba documentado como riesgo | §4 «Riesgos aceptados» |
| 10 | El error de storage no decía que hay que generar otro código | `pairing.errors.storage` en los cuatro idiomas |
| 11 | Suite inestable bajo carga (no es de la parte B) | topes de `until`/`waitFor` holgados y latencia medida sobre la mediana de 9 muestras |

El 4 queda con un resto documentado como riesgo aceptado (un cierre anterior
al join no se despide). Lo que en esta tabla quedó escrito como pendiente del
2 —`REMOTE_BEAT_INTERVAL_MS` en el lado caja— ya lo aplicó la parte C en la
pata remota del canal compuesto: ver §4 bis y §11 · 8.

## 11. Ronda 3 — correcciones del QA y del tester

| # | Defecto | Dónde se corrigió |
|---|---|---|
| 1 | Sin BroadcastChannel, «no compatible» tapaba el ÚNICO acceso al emparejamiento | `resolveShellContent` / `offersPairing` (logic.ts, puro) + botón dentro de `UnsupportedView` |
| 2 | El respaldo tras un canje fallido no comprobaba ni el código ni la terminal | `StoredRemoteDisplay.codeHash` (sha256 del código) y `resolveRedeemFailure(failure, stored, attemptedCodeHash)` |
| 3 | `submitCode` lanzaba el canje aunque hubiera otro en vuelo | `resolvePairingSubmit(raw, redeemInFlight)`, con el «ocupado» leído de `pairInFlightRef` (síncrono), no del updater de `setPhase` |
| 4 | El cubo GLOBAL de `/pair` lo consumían también los canjes correctos | se mira con `isRateLimitExhausted` al entrar y solo lo registra `registerGlobalPairFailure` |
| 5 | El comentario de `immediate` decía lo contrario que el código | corregido en `RemoteHeartbeatOptions` |
| 6 | El latido forzado al despertar no tenía frecuencia mínima | `FORCED_BEAT_MIN_INTERVAL_MS` + `shouldForceBeat`, con el instante en un ref |
| 7 | `teardownRemote` soltaba el cliente sin esperar la salida del canal | `SupabaseBroadcastReceiver.leaving` y `waitForLeave` (tope `LEAVE_GRACE_MS`) |
| 8 | El traspaso daba por pendiente el `REMOTE_BEAT_INTERVAL_MS` del lado caja, ya aplicado | §4 bis de este documento |

### Qué cambia de verdad en el emparejamiento (2 y 4)

El respaldo de la ronda 2 —«si el canje falla, sigue con el emparejamiento
guardado»— resolvía el quiosco (su URL de arranque conserva un código ya
consumido) y abría un agujero peor: como no comprobaba con QUÉ código se
había obtenido ese emparejamiento, reapuntar la tableta de una caja a otra y
que el canje fallara por red o por el cubo global la dejaba CALLADA contra la
caja anterior, enseñando su carrito a los clientes de la nueva. Y la tableta
no tiene «desemparejar»: `?pair` es el único camino para reapuntarla.

Ahora el emparejamiento guarda el **sha256 del código** con el que se obtuvo
y el respaldo exige que coincida; con cualquier otro código se muestra el
error del canje. Si el navegador no ofrece `crypto.subtle` (contexto no
seguro) no hay huella y tampoco hay respaldo: el lado seguro. Y un **429
nunca** lleva al respaldo, porque no dice nada del código y el cubo global se
agota desde fuera; el precio es que un quiosco que rearranque más de diez
veces en quince minutos tendrá que esperar su ventana.

El cubo global (120/min en todo el despliegue) dejó de contar los canjes
correctos: un canje que acierta no es abuso, y contándolos bastaban 120
peticiones por minuto desde cualquier sitio para dejar sin emparejar a TODAS
las organizaciones durante la ventana. Mismo patrón que `displayAuth` en la
parte A: se mira al entrar y solo lo gastan los fallos.

## 12. Ronda 4 — correcciones del QA

| # | Defecto | Dónde se corrigió |
|---|---|---|
| QA-1 (alto) | El ritmo remoto se había corregido para la presencia pero no para el `need_snapshot`: 30 mensajes/min de subida indefinidamente con la caja cerrada | `REMOTE_RESNAPSHOT_INTERVAL_MS` (5 s) y `REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS` (60 s) en `supabaseBroadcastTransport.ts`, en `RemoteReceiverSource`, propagados por `useDisplayReceiver` a `startDisplayLink`; el enlace admite `idleResnapshotIntervalMs` y retrocede cuando `disconnectedTooLong` |
| QA-2 (bajo) | Sin `crypto.subtle` (http plano) no había huella del código y el respaldo del quiosco no se aplicaba nunca | huella no criptográfica con prefijo `fnv1a32:` en `pairingCodeFingerprint`; `isCodeFingerprintShape` acepta los dos esquemas; riesgo y condición de despliegue escritos en §4 |
| QA-3 (bajo) | `waitForLeave` dejaba vivo el temporizador del tope cuando ganaba la salida del canal | se guarda el id y se limpia en el `then` de la carrera (`useRemoteDisplay.ts`) |
| QA-4 (bajo) | `bootstrap.locale` se validaba, viajaba y no se usaba | `resolveRemoteLocale` (puro) + `changeLanguage` en `CustomerDisplay`, sin recarga; §6 |
| QA-5 (bajo) | Trazabilidad de la ronda aplicada | este documento lleva una sección por ronda; **el árbol tiene aplicada la ronda 4** (esta) sobre la 3 |

`bootstrap.settings` sigue **sin usarse** a propósito: lo que la pantalla
pinta viaja en `hello.settings` desde la caja (una sola fuente, la misma en
local y en remoto), y el bootstrap solo lo valida y lo deja disponible.
Retirarlo del contrato tocaría la parte A, que está aprobada y solo admite
cambios aditivos; queda anotado como pendiente para quien reabra esa ruta.

La prueba de cada corrección está en
`src/__tests__/pos-display/f3b-ronda4.test.ts` (11 tests). El test de la
ronda 3 que fijaba «sin `crypto.subtle` no hay huella»
(`tester-f3b-r3.test.ts`) se cambió por el comportamiento nuevo, con el
motivo escrito en el propio test.
