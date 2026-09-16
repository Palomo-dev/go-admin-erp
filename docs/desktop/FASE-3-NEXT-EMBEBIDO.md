# Fase 3 del desktop — servidor Next embebido en 127.0.0.1

Origen: `docs/ROADMAP-DESKTOP.md` §Fase 3 y
`docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md` §1 y §5 (opción B2).
Última actualización: 2026-09-16 (cierre de la fase: paquete, arranque y prueba sin red verificados; ver §0 y §7).

## 0. Estado real

Última actualización: 2026-09-16 (sesión de cierre de la fase; ver §7).

### Hecho (en el árbol, compila, probado)

- `next.config.js`: `output: 'standalone'` y `experimental.preloadEntriesOnStart: false`
  **solo si `NEXT_DIST_DIR` está definida** (la exporta `build-web.js`) y
  `distDir: process.env.NEXT_DIST_DIR || '.next'`. Sin la variable, `next build` y Vercel siguen
  exactamente igual.
- `electron/scripts/build-web.js`: `next build` aislado en `.next-desktop` + copia a
  `electron/resources/web/` + `.env` solo con `NEXT_PUBLIC_*` (allow-list) + defaults de
  producción para `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SELLERS_URL`.
- `electron/src/main/webServer.ts`: `start()` / `stop()` / `getUrl()`, `utilityProcess.fork`,
  **puerto de casa** 47800 persistido (se reintenta 3 s si está ocupado y nunca se sobreescribe;
  §2.3), evento `ready` al primer `GET /` que responde, `GATE_COOKIE_SECRET` persistido, reinicio
  automático si el hijo muere, logs a `userData/agent.log`.
- `electron/src/main/index.ts`: arranque **antes** de crear la ventana (splash visible, cierre de
  seguridad a 45 s), parada en `before-quit`, recarga de la vista tras `restarted`.
- `electron/src/main/windows/mainWindow.ts`: `getLoadUrl()` → URL local si el servidor arrancó;
  `isInternalUrl()` acepta `localhost:<puerto>` y `127.0.0.1:<puerto>`; `will-navigate` y
  `setWindowOpenHandler` la usan.
- `electron/src/main/connectivity.ts`: el cambio ONLINE/OFFLINE también va a `agent.log`.
- `electron/src/main/store.ts`: `config.json` se escribe de forma atómica (temporal + `rename`) y
  un archivo corrupto se aparta en vez de fallar en cada lectura (§7, hallazgo 4).
- `electron/src/main/devCapture.ts`: el recorte de pantalla solo se hace si la ventana tiene el
  foco (§7, hallazgo 5).
- `electron/electron-builder.yml`: `extraResources: resources/web → web`. `electron/.gitignore`
  excluye `resources/web/`; `.gitignore` raíz excluye `.next-desktop/`.
- `tsconfig.json`: `include` añade `.next-desktop/types/**/*.ts`.
- `electron/package.json`: scripts `build:web` y `build:web:copy`.
- **Paquete `--dir` verificado**: `resources/web/server.js` va fuera del `app.asar` (§7).
- **Arranque del `.exe`**: `GET http://127.0.0.1:47800/auth/login` → 200,
  `GET http://localhost:47800/` → 307 a `/auth/login` (§7).
- **Prueba sin red** (`--host-resolver-rules`, §5): la ventana carga el login desde el servidor
  local, `connectivity` declara OFFLINE, la navegación a `/app/pos` se queda dentro de la ventana
  (§7). Captura: `docs/desktop/evidencia/fase-3/offline-login-exe.png`.
- **Instalador NSIS**: `GoAdminERP-Setup-0.1.3.exe` 136,9 MB + `.blockmap` 143 KB (§6).
- `electron/src/main/webLauncher.ts` (nuevo): envoltorio del `server.js` en el utilityProcess
  que cierra el hijo si el main muere de golpe (§2.3, §7.2 hallazgo 2).

### Pendiente

- **Criterio de aceptación completo del roadmap** («apagar el WiFi y navegar entre `/app/pos`,
  `/app/inventario` y `/app/crm` viendo los datos visitados con conexión»): requiere una sesión
  iniciada en el perfil del desktop. En esta sesión no había credenciales de un usuario de prueba,
  así que se verificó todo lo que no depende de la sesión (servidor local, middleware, redirección
  al login, navegación interna, modo offline del main). Queda para quien tenga un usuario de
  pruebas: iniciar sesión con red, visitar los tres módulos, desconectar el WiFi y repetir.
- Login con Google desde el desktop (§3): añadir `http://localhost:47800/auth/callback` a las
  redirecciones permitidas de Supabase Auth.
- Unificar las claves de Supabase hardcodeadas en `electron/src/main/constants.ts` con
  `resources/web/.env` (auditoría §4.5).

### Cómo se construyó el paquete de esta sesión (y por qué desde una instantánea)

`main` estaba en obras durante toda la sesión (cuatro sesiones más escribiendo en el mismo
árbol): `npm run build:web` sobre el árbol de trabajo falló tres veces por causas ajenas —una
ruta-sonda temporal de otra sesión (`zz-sonda-tester-r3`), dos rutas con un `import {` a medio
escribir, y `wonCloseSteps.ts` importando `renewalService` → `sequenceService` → `twilio` dentro
de un componente cliente—, y `HEAD` (`e3972da7`) tenía committeadas las dos rutas rotas. El build
que se empaquetó salió de una instantánea limpia (`git archive HEAD` + `next.config.js` de esta
sesión + esas dos rutas tal como quedaron reparadas en el árbol), con `node_modules` enlazado por
junction. Es el mismo `build-web.js`; solo cambia la raíz. Cuando `main` vuelva a compilar,
`npm run build:web` normal produce lo mismo.

## 1. Qué problema resuelve

Hasta ahora Go Admin Desktop era un envoltorio de `https://app.goadmin.io`. La
web es Next.js 15 App Router con middleware: cada navegación necesita un
documento HTML o un payload RSC del servidor. Sin internet no había a dónde
navegar, por muchos datos que la cache de IndexedDB tuviera (auditoría §1.1 y
§1.5). Y el antiguo «app shell» servido como `data:` URL tenía origen opaco:
ni localStorage, ni cookies, ni IndexedDB (§1.2).

Con esta fase el `.exe` lleva dentro el build `standalone` de Next, lo arranca
escuchando en `127.0.0.1:47800` y la ventana carga `http://localhost:47800`.
SSR y middleware siguen intactos, el origen es estable y la app abre y navega
sin red.

## 2. Arquitectura

```
Go Admin ERP.exe (main de Electron)
 ├─ webServer.start()  ──utilityProcess.fork──▶  dist/main/webLauncher.js ──require──▶ resources/web/server.js  (Next standalone)
 │       │                                          escucha 127.0.0.1:47800
 │       └─ espera al primer GET / que responda (≤ 30 s), luego crea la ventana
 ├─ BrowserWindow  (barra propia, fase 2)
 │    └─ WebContentsView ──▶ http://localhost:47800   (preload/index → window.goAdminDesktop)
 └─ before-quit ──▶ webServer.stop()  (mata el hijo; Electron también lo mata si el main muere)
```

Los datos siguen saliendo de Supabase **desde el navegador** (cliente
`@/lib/supabase/config`), exactamente igual que en la web. Lo único que cambia
es quién sirve el HTML, los chunks y el middleware: antes Vercel, ahora el
servidor local.

### 2.1 Build — `electron/scripts/build-web.js`

`npm run build:web` (en `electron/`):

1. `next build` en la raíz con `NODE_OPTIONS=--max-old-space-size=8192` y
   `NEXT_DIST_DIR=.next-desktop`; con esa variable `next.config.js` activa
   `output: 'standalone'` (sin ella, el build de Vercel no cambia).
2. Copia a `electron/resources/web/`:
   - `.next-desktop/standalone/**` → `resources/web/` (`server.js`,
     `.next-desktop/server`, `node_modules` trazados, `package.json`).
   - `.next-desktop/static` → `resources/web/.next-desktop/static` y `public` →
     `resources/web/public`. Next no las copia al standalone a propósito (en un
     despliegue normal las sirve un CDN); aquí las sirve el propio `server.js`.
3. Escribe `resources/web/.env` **solo con variables públicas** (allow-list
   `PUBLIC_ENV_ALLOWLIST`, todas `NEXT_PUBLIC_*`). Ver §4.

`npm run build:web:copy` (`--skip-next-build`) reutiliza el `.next-desktop/standalone`
existente para iterar sobre el empaquetado sin esperar el build.

`DESKTOP_ENV_DEFAULTS` fija `NEXT_PUBLIC_APP_URL=https://app.goadmin.io` y
`NEXT_PUBLIC_SELLERS_URL=https://sellers.goadmin.io` durante el build: en
`.env.local` suelen apuntar a `localhost` y Next **inlina** las `NEXT_PUBLIC_*`
en el bundle del navegador en tiempo de build. Una variable definida en el
entorno del proceso sigue mandando.

**`.next` aislado: el build del desktop usa `.next-desktop`.** El primer
intento de esta fase (23:10, `.next` de siempre) murió a los 30 minutos con
`Cannot find module '../../../../../webpack-runtime.js'` en «Collecting page
data»: a las 23:40 otro agente lanzó `npx next build` en el mismo árbol (la
verificación de cierre que pide `CLAUDE.md`) y borró `.next/server` debajo del
build en curso. Por eso `next.config.js` tiene ahora
`distDir: process.env.NEXT_DIST_DIR || '.next'` y `build-web.js` exporta
`NEXT_DIST_DIR=.next-desktop` al `next build`: el build del desktop y cualquier
`next dev`/`next build` normal ya no comparten directorio. `.next-desktop/`
está en `.gitignore`. El standalone queda en `.next-desktop/standalone/` con
su `server.js` apuntando a `.next-desktop` como `distDir`, y `build-web.js`
copia `.next-desktop/static` a `resources/web/.next-desktop/static`. Coste:
`.next-desktop` no comparte `.next/cache` (irrelevante: `next.config.js` ya
desactiva la cache de webpack en producción).

### 2.2 Empaquetado — `electron/electron-builder.yml`

```yaml
extraResources:
  - from: resources/web
    to: web
```

Queda en `resources/web/` junto al `app.asar`, **fuera del asar**: Next
necesita leer archivos reales del disco (`fs.readFileSync` de chunks,
`node_modules`, `.next/static`). `electron/.gitignore` excluye
`resources/web/`. Si la carpeta no existe, el paquete se construye igual y la
app cae a `https://app.goadmin.io`.

### 2.3 Runtime — `electron/src/main/webServer.ts`

Singleton `webServer` con:

| Miembro | Qué hace |
|---|---|
| `start(): Promise<string>` | Arranca `server.js` y resuelve con la URL cuando responde al primer `GET /`. Idempotente (llamadas concurrentes comparten la promesa). Rechaza si no hay build, si no hay puerto libre o si no responde en 30 s. |
| `stop(): Promise<void>` | Mata el hijo (espera hasta 5 s al `exit`) y vuelca el log. |
| `getUrl(): string \| null` | `http://localhost:<puerto>` o `null` si no está arriba. |
| `getHosts(): string[]` | `localhost:<puerto>` y `127.0.0.1:<puerto>`, para `isInternalUrl()`. |
| `shouldUseLocalWeb()` | `app.isPackaged \|\| GOADMIN_DESKTOP_LOCAL_WEB === '1'`. |
| `hasLocalWeb()` / `getWebRoot()` | `process.resourcesPath/web` empaquetado; `electron/resources/web` en desarrollo. |
| eventos `ready`, `exit`, `restarted`, `error` | `ready` al primer request OK; `exit` si el hijo muere sin pedirlo; `restarted` cuando el reinicio automático vuelve a responder (index.ts recarga la vista). |

Decisiones:

- **Proceso hijo: `utilityProcess.fork(webLauncher.js)`**, no `child_process`
  con `ELECTRON_RUN_AS_NODE=1` + `process.execPath`. Usa el Node embebido de
  Electron (no hace falta un `node.exe` aparte ni depende del PATH) y
  `stdio: 'pipe'` permite volcar su salida al log del main. Se borra
  `ELECTRON_RUN_AS_NODE` del entorno del hijo por si el main la heredara.
  `webLauncher.js` (en `dist/main`, dentro del asar; el utilityProcess lo
  carga sin problema) hace `require(resources/web/server.js)` y **vigila al
  main** con `process.kill(pid, 0)` cada segundo: Electron no siempre mata al
  hijo enseguida cuando el main muere de golpe (en la prueba siguió
  escuchando 5-15 s), y ese huérfano obligaba al siguiente arranque a cambiar
  de puerto (§7.2, hallazgo 2).
- **Puerto de casa: `PREFERRED_PORT = 47800`, persistido en
  `userData/web-server.json` la primera vez que arranca bien y nunca
  sobreescrito.** El origen incluye el puerto; si cambiara entre arranques,
  cada apertura sería «un navegador nuevo» sin sesión ni cache offline. Orden
  de prueba: puerto de casa → 47800..47809 → uno del sistema. Cada candidato
  se reserva un instante con `net.createServer().listen()` antes de arrancar;
  si el arranque falla (p. ej. alguien tomó el puerto entre la reserva y el
  `listen` de Next) se prueba el siguiente. Un timeout de 30 s no se reintenta
  con otro puerto (no lo arreglaría).
  - El puerto de casa se **reintenta durante 3 s** (6 × 500 ms) si está
    ocupado. Motivo real (§7, hallazgo 2): si el main muere de golpe (crash,
    `Stop-Process`, apagado), Electron mata al `server.js` hijo al cerrar el
    job object, pero tarda unos segundos; el siguiente arranque lo encontraba
    escuchando, saltaba a 47801 y —con la política anterior— persistía 47801:
    el origen cambiaba para siempre.
  - Si aun así hay que arrancar en otro puerto, se deja un `AVISO` en el log y
    **no se persiste**: el siguiente arranque vuelve a intentar el de casa. Si
    el de casa está ocupado de forma permanente por otro programa, el orden de
    candidatos es fijo y se acaba siempre en el mismo puerto alternativo.
- **La ventana carga `localhost`, el servidor escucha en `127.0.0.1`.**
  `NextURL` (`next/dist/server/web/next-url.js`) reescribe `127.0.0.1` y
  `[::1]` a `localhost` en `request.url` del middleware, así que toda
  redirección (`NextResponse.redirect(new URL('/auth/login', request.url))`)
  apunta a `http://localhost:<puerto>` aunque se pida a `127.0.0.1`
  (comprobado con `curl`: `GET http://127.0.0.1:47801/` → `307
  Location: http://localhost:47801/auth/login`). Si la ventana viviera en
  `127.0.0.1`, cada redirección cambiaría de origen (otro localStorage, otras
  cookies) y `will-navigate` la bloquearía. Chromium resuelve `localhost` al
  loopback sin DNS. El sondeo de arranque y el `listen` siguen en `127.0.0.1`
  (IPv4 explícito: `localhost` en Node puede resolver a `::1`).
- **Espera al primer request OK**: sondeo `GET /` cada 250 ms (cualquier
  código de estado vale: la raíz redirige al login con 307).
- **Logs**: stdout/stderr del hijo → `console` del main con prefijo `[web]` y
  `appendLog()` de `crashReporter.ts` → `userData/agent.log`. `appendLog`
  ahora vuelca a disco con un debounce de 2 s (antes solo escribía al haber
  crash) y termina cada línea con `\n`.
- **Reinicio automático**: si el hijo muere con la app abierta, se reintenta
  hasta 3 veces por sesión (1,5 s entre intentos) y se emite `restarted`;
  `index.ts` recarga la vista con `reloadCurrent()`.
- **`GATE_COOKIE_SECRET` persistido** en `web-server.json`. El middleware
  firma con él la cookie `ga_gate` (cache del veredicto de estado de la
  organización y módulos). Solo lo verifica este servidor local, así que basta
  con que sea estable por instalación: si cambiara por arranque, la primera
  navegación a cada módulo sin internet esperaría los 2,5 s de presupuesto del
  gate (`MW_DB_BUDGET_MS`) antes de mostrar la página.
- Otras variables del hijo: `HOSTNAME=127.0.0.1`, `PORT`,
  `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`,
  `GOADMIN_DESKTOP_EMBEDDED=1` (marca para la web, hoy sin uso).
- **Sin precarga de rutas al arrancar** (`experimental.preloadEntriesOnStart:
  false`, solo en el build del desktop). Con el default, el servidor de
  producción de Next evalúa nada más arrancar los manifests de todas las
  páginas y API routes (`unstable_preloadEntries` → `loadComponentsImpl`) en
  el hilo principal, y el primer request —la ventana cargando el login— se
  queda detrás: perfilado con el inspector el 2026-09-16, 26 s de 28 s del
  primer request eran esa precarga (`vm.Script`, `deepFreeze`, `require` de
  rutas como `api/crm/webhooks/elevenlabs`). Medido en el standalone
  empaquetado: primer `GET /app/pos` 10-43 s con precarga, 0,17 s sin ella;
  las rutas se cargan en su primer uso (0,2-0,4 s cada una). En Vercel el
  proceso vive horas y la precarga amortiza; en el desktop arranca en cada
  apertura. Ver §7, hallazgo 1.

### 2.4 Ventana — `windows/mainWindow.ts` e `index.ts`

- `getLoadUrl()`: si `shouldUseLocalWeb()` y `webServer.getUrl()` no es
  `null`, carga la URL local; si no, `WEB_APP_URL` (empaquetado) o `DEV_URL`.
- `isInternalUrl()` acepta el host de la URL cargada, `app.goadmin.io`,
  `localhost:<puerto>` y `127.0.0.1:<puerto>` (solo el puerto que arrancó
  **este** proceso). Lo usan `will-navigate`
  (todo lo demás se abre en el navegador del sistema y nunca hereda el bridge)
  y `setWindowOpenHandler` (ventanas hijas para imprimir).
- `index.ts`: `await webServer.start()` **antes** de `createMainWindow()`, con
  el splash visible (su cierre de seguridad pasó de 15 s a 45 s: 30 s de
  arranque + carga). Si `start()` rechaza, se registra y la ventana carga la
  web remota: el arranque de la app nunca se bloquea por esto. En `before-quit`
  se llama `await webServer.stop()` antes de `app.quit()`.
- Desarrollo: `GOADMIN_DESKTOP_LOCAL_WEB=1 npm run dev` (tras `npm run
  build:web`) usa `electron/resources/web`; sin la variable se sigue cargando
  `DEV_URL` (`http://localhost:3000`).

## 3. Qué funciona sin internet y qué no

Con el servidor local arriba y sin red:

| Funciona | Por qué |
|---|---|
| Abrir la app y ver la última página | HTML y chunks salen del servidor local. |
| Navegar entre `/app/*` (POS, inventario, CRM, …) | El middleware valida la sesión decodificando el JWT de la cookie (sin llamar a Supabase) y el gate de acceso «nunca bloquea la navegación por un fallo» (`runAppGate` → `catch` → sigue). Con la cookie `ga_gate` vigente ni siquiera intenta la BD. |
| Sesión | El cliente Supabase (`config.ts`) sirve la sesión desde `localStorage` cuando `isAppOnline()` es `false` (conectividad real del health-check del main, no `navigator.onLine`). |
| Datos ya visitados con conexión | `GET` a `/rest/v1/*` se sirven desde la cache de IndexedDB `goadmin-offline` (`getCachedResponse`), sin TTL mientras se está offline. |
| Escrituras | Se encolan en `action-queue` (IndexedDB) y se reenvían al volver la red. **Limitación conocida** (auditoría §1.8): la cola es por petición HTTP, no por operación de negocio; la fase 4 (POS local-first) la sustituye. |

| No funciona | Por qué |
|---|---|
| Datos que no se visitaron con conexión | No hay pre-cacheo (auditoría §1.10). Las páginas cargan con listas vacías o el mensaje `Offline: no cached data`. |
| Cualquier `/api/*` que use claves de servidor (service role, Stripe, cron, IA, correo, integraciones) | Esas claves **no viajan en el instalador** (§4). Con red, esas rutas responden error 500 en el servidor local. Con red, el resto de la app usa Supabase directo y no las necesita. Si un flujo del ERP depende de una API route con secreto, hoy hay que ejecutarlo desde la web. |
| Login con Google (OAuth) | `redirectTo` es `window.location.origin/auth/callback` = `http://localhost:47800/...`, que no está en la lista de redirecciones permitidas de Supabase Auth. Login con correo y contraseña funciona (necesita red, como siempre). Añadir `http://localhost:47800/auth/callback` a esa lista lo habilitaría con red. |
| Imágenes remotas (`next/image` sobre Storage de Supabase) y realtime | Necesitan red. |
| Impresión desde el POS | Inserta en `print_jobs` (necesita red). El camino local (`printing:print-raw`) existe y lo usará la fase 4. |
| Cambio de organización / verificación de plan | Depende de Supabase; el gate cacheado deja pasar y la UI muestra lo cacheado. |

Con red, todo lo anterior funciona igual que en la web, con las excepciones
de las API routes con secretos y OAuth.

## 4. Variables de entorno empaquetadas (solo públicas)

`resources/web/.env` contiene exclusivamente claves de la allow-list de
`build-web.js`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SELLERS_URL`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
`NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY`, `NEXT_PUBLIC_SENTRY_DSN`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_META_APP_ID`,
`NEXT_PUBLIC_WHATSAPP_CONFIG_ID`.

Todas ya van inlinadas en el bundle del navegador que cualquiera descarga de
`app.goadmin.io`; empaquetarlas no expone nada nuevo. Se incluyen porque hay
código de servidor (middleware, `edge-rest.ts`, `server-user.ts`) que las lee
de `process.env` en tiempo de ejecución.

**Prohibido** añadir `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
`CRON_SECRET`, `OPENAI_API_KEY` ni ninguna otra clave de servidor: el
instalador es público y cualquiera puede abrirlo. `webServer.ts` repite la
allow-list por prefijo `NEXT_PUBLIC_` al leer el `.env` por si alguien lo
editara en una instalación. `build-web.js` además borra cualquier `.env*` que
Next hubiera copiado al standalone.

Las claves de Supabase también existen hardcodeadas en
`electron/src/main/constants.ts` (auditoría §4.5, pendiente de unificar).

## 5. Cómo construir y cómo verificar offline

```powershell
cd electron
npm run build:web        # next build (7-15 min con el árbol en calma) + copia a resources/web + .env público
npm run package:dir      # tsc + copy:renderer + electron-builder --dir → release/win-unpacked
& "release\win-unpacked\Go Admin ERP.exe"
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:47800/auth/login   # → 200
curl.exe -s -o NUL -w "%{http_code}" http://localhost:47800/             # → 307 (a /auth/login)
npm run package          # instalador NSIS + .blockmap en release/
```

Para cerrar la app desde un script: `Stop-Process` sobre el PID del main (el
que no tiene padre `Go Admin ERP.exe`), nunca por nombre. Con `agent.log`
en `%APPDATA%\go-admin-desktop\agent.log` se ve el arranque del servidor
(`[web:stdout] ✓ Ready in …`, `[webServer] Servidor Next listo en …`) y el
estado de red (`[connectivity] Estado: OFFLINE`).

### Prueba sin red sin tocar adaptadores

Arrancar el `.exe` con reglas de resolución de nombres de Chromium: todo
falla salvo el loopback. Afectan al renderer **y** al health-check del main
(`net.fetch`), así que la app entra en modo offline de verdad
(`isAppOnline() === false`, pill «Sin conexión» en la barra):

```powershell
& "release\win-unpacked\Go Admin ERP.exe" --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"
```

No afecta al proceso hijo de Next (Node usa su propio DNS), así que el gate
del middleware sí puede llegar a Supabase en esta simulación; su camino sin
red está cubierto por código (`catch` + presupuesto de 2,5 s) y por la cookie
`ga_gate` persistida. La prueba definitiva es desconectar el WiFi.

### Ver y capturar la ventana sin tocar el escritorio

Añadiendo `--remote-debugging-port=9333` al `.exe`, `http://127.0.0.1:9333/json`
lista los targets (la barra `toolbar/index.html`, la web en `localhost:47800/…`
y su service worker `sw.js`) y por el websocket de cada uno se puede leer
`document.title`, `location.href`, cookies, y guardar un PNG con
`Page.captureScreenshot`. Es lo que se usó para la evidencia de §7: captura
solo el contenido de la app, nunca otras ventanas. (`devCapture.ts` sigue
siendo solo para desarrollo, y su recorte de pantalla ya exige que la
ventana tenga el foco.)

## 6. Tamaño y actualizaciones diferenciales

Medido el 2026-09-16 con `npx electron-builder --win` (7,5 min):

| Artefacto | Antes (0.1.3 sin web, 2026-09-15) | Ahora (0.1.3 con web) |
|---|---|---|
| `release/win-unpacked/` | 283 MB | **616 MB** (`resources/web` = 333 MB: `node_modules` trazados 62,6 MB, `.next-desktop/server` 229,5 MB, `.next-desktop/static` 39,7 MB, `public` 0,2 MB) |
| `GoAdminERP-Setup-0.1.3.exe` | 84,0 MB (84 043 458 B) | **136,9 MB** (136 941 934 B) |
| `GoAdminERP-Setup-0.1.3.exe.blockmap` | 88 KB | **143 KB** |

El instalador crece 53 MB (la web comprime bien: 333 MB → ~53 MB en el 7z
del NSIS). El `.blockmap` sigue generándose (`nsis.differentialPackage: true`),
así que las actualizaciones descargan solo los bloques que cambian; un cambio
de la web se traduce en descargar los chunks nuevos, no el instalador entero.
`latest.yml` se regenera con el `sha512` y `size` nuevos.

## 7. Evidencia (2026-09-15/16)

**Compilación del desktop**

```
cd electron && npx tsc -p .        → sin errores (repetido tras cada cambio)
node --check scripts/build-web.js  → OK
```

**`node scripts/build-web.js` (intento 1, `.next` compartido, 23:10 → 23:42)**

```
 ✓ Compiled successfully in 28.5min
   Collecting page data ...
Error: Cannot find module '../../../../../webpack-runtime.js'
Require stack: .next\server\app\app\crm\actividades\[id]\page.js
> Build error occurred  [Error: Failed to collect page data for /app/crm/actividades/[id]]
```
Causa: a las 23:40:54 otro proceso `npx next build` (otra sesión) recreó `.next`.
Se aisló el build en `.next-desktop` (§2.1).

**`node scripts/build-web.js` (intento 2, `.next-desktop`, 23:44 → 00:02)**

```
 ✓ Compiled successfully in 41.4min
   Skipping validation of types / Skipping linting
   Collecting page data ... Generating static pages ... Finalizing page optimization ...
ƒ Middleware  37.3 kB
[build-web] ERROR: next build terminó con código 4294967295
```
`next build` imprimió el resumen completo y `.next-desktop/standalone/` quedó
íntegro (263 MB: `server.js`, `.next-desktop/server`, `node_modules`,
`src/`), pero el proceso salió con `-1` (0xFFFFFFFF) después. No hay traza en
el log; el equipo estaba con otros dos builds/tests de Node en paralelo.
**Pendiente reproducir** con el árbol en calma: si se repite, tratar `-1` con
`standalone/server.js` presente como éxito o buscar el worker que no cerró.

**`node scripts/build-web.js --skip-next-build` (00:50)**

```
[build-web] Copiando .next-desktop/standalone → resources/web
[build-web] Copiando .next-desktop/static → resources/web/.next-desktop/static
[build-web] Copiando public → resources/web/public
[build-web] resources/web/.env escrito con 11 variables públicas
[build-web] OK — resources/web listo (289.2 MB sin comprimir)
```
`resources/web/.env` contiene únicamente las 11 claves `NEXT_PUBLIC_*` de la
allow-list (comprobado con `cut -d= -f1`).

**Smoke test del standalone con Node (sin Electron), 00:52**

```
HOSTNAME=127.0.0.1 PORT=47801 NODE_ENV=production node resources/web/server.js
   ▲ Next.js 15.5.7  - Local: http://127.0.0.1:47801   ✓ Starting...
GET /auth/login                       → 200 (1 s tras el arranque)
GET /                                 → 307 Location=http://localhost:47801/auth/login
GET /app/pos                          → 307 Location=http://localhost:47801/auth/login?redirectTo=%2Fapp%2Fpos
GET /_next/static/chunks/webpack-….js → 200
```
Es decir: el `server.js` empaquetado sirve documento, middleware y chunks
estáticos desde disco. El `Location` con `localhost` es el motivo de §2.3
(«La ventana carga `localhost`»).

**Lo anterior quedó pendiente por la congelación de `main`; se cerró en la sesión siguiente (§7.2).**

## 7.2 Evidencia del cierre (2026-09-16, 00:40 → 03:00)

Todo con el árbol en `main`, sin ramas ni commits. Tiempos en UTC salvo que se diga otra cosa.

### Reproducción del `next build` con exit `-1`

`node scripts/build-web.js` había terminado el 2026-09-16 00:02 con el resumen completo, el
standalone íntegro y **código 4294967295 (0xFFFFFFFF, «-1»)** mientras otras dos sesiones
corrían builds y tests en la misma máquina. Reproducido con el mismo `spawnSync` (mismo `env`,
`npx.cmd next build`, `NEXT_DIST_DIR=.next-desktop`) con el árbol en calma:

```
[repro] inicio 2026-09-16T05:44:10Z
 ✓ Compiled successfully in 6.8min
ƒ Middleware  37.3 kB
[repro] fin 2026-09-16T05:58:23Z status=0 signal=null duracion=14.2 min
[repro] standalone/server.js existe=true
```

**Causa real: el `-1` no lo produce Next.** `next build` termina siempre con
`process.exit(0)` explícito (`node_modules/next/dist/bin/next`, línea 89:
`mod.nextBuild(...).then(() => process.exit(0))`); un fallo suyo sale con 1, y un OOM de Node
con 134 / 0xC0000409. `0xFFFFFFFF` es el código con el que `.NET Process.Kill()` —lo que usa
`Stop-Process` de PowerShell— llama a `TerminateProcess(handle, -1)` (`taskkill /F` y
`process.kill` de Node usan 1). Es decir: el proceso fue matado desde fuera, con casi total
seguridad por un `Stop-Process -Name node` (o `Get-Process node | Stop-Process`) de otra sesión,
en la ventana entre imprimir el resumen y salir (Next cierra los workers y vacía telemetría ahí,
y en Windows tarda segundos). Encaja con que el standalone quedara íntegro. De ahí la regla de esta
sesión: **nunca matar `node` por nombre**; solo el PID que uno lanzó.

Con el árbol en calma el build tarda 14-17 min (6,8-10 min de compilación). Los 28 y 41 min de la
noche anterior eran contención con los otros builds.

### Empaquetado `--dir`

```
npm run package:dir                → exit 0, 2 min (3 min la primera vez por @electron/rebuild)
release/win-unpacked/resources/    app.asar (14,9 MB) · app.asar.unpacked/ · web/
release/win-unpacked/resources/web/  .env · .next-desktop/ · node_modules/ · public/ · server.js · src/  (333 MB)
npx asar list app.asar | grep '^\\web'   → 0 entradas  (el server.js de Next NO está en el asar)
cut -d= -f1 resources/web/.env           → solo las 11 NEXT_PUBLIC_* de la allow-list
```

### Arranque del `.exe` con red

`Start-Process "release\win-unpacked\Go Admin ERP.exe"` (PID anotado; se cierra con
`Stop-Process -Id <pid>` del main, nunca por nombre).

```
agent.log:  [web:stdout] ▲ Next.js 15.5.7 - Local: http://127.0.0.1:47800
            [web:stdout] ✓ Ready in 3.9s
            [webServer] Servidor Next listo en http://localhost:47800
curl 127.0.0.1:47800/auth/login  → 200 (7 s tras lanzar el .exe)
curl localhost:47800/            → 307 Location=http://localhost:47800/auth/login
curl localhost:47800/app/pos     → 307 Location=http://localhost:47800/auth/login?redirectTo=%2Fapp%2Fpos
web-server.json                  → { "port": 47800, "gateSecret": "<64 hex>" }
```

### Prueba sin red (`--host-resolver-rules`, paquete definitivo)

```
"Go Admin ERP.exe" --remote-debugging-port=9333 --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"
```

| Instante (desde el lanzamiento) | Qué |
|---|---|
| +3,4 s | `[webServer] Servidor Next listo en http://localhost:47800` (`Ready in 255 ms`) |
| +3,5 s | la vista pide `GET /` → 307 → `GET /auth/login` → 200 (trazado con CDP `Network.*`) |
| +5,5 s | `load` del login. `document.title` = «GO Admin ERP», `readyState` = complete |
| +17 s | `[connectivity] Estado: OFFLINE` (2 fallos × 15 s del health-check, ahora también en `agent.log`) |

- Captura de la vista (CDP `Page.captureScreenshot`, solo el contenido de la app):
  `docs/desktop/evidencia/fase-3/offline-login-exe.png`.
- **`isInternalUrl` mantiene la navegación dentro**: `Page.navigate` a
  `http://localhost:47800/app/pos` → la vista queda en
  `http://localhost:47800/auth/login?redirectTo=%2Fapp%2Fpos` (el middleware redirige; la
  ventana no se abre fuera ni muestra la pantalla offline):
  `docs/desktop/evidencia/fase-3/offline-app-pos-redirige-login-exe.png`.
- Sin `did-fail-load`, sin `[mainWindow] Error cargando`, sin pantalla «Sin conexión» de
  respaldo. Los targets de CDP son la barra (`toolbar/index.html`), la web y su service worker
  (`sw.js`, que solo cachea estáticos).
- La misma prueba con el paquete anterior (build de las 00:02, con precarga de rutas) también
  cargó el login local, pero 16-25 s después de que el servidor estuviera listo (hallazgo 1).
- Cierre limpio comprobado en el modo desarrollo (`electron .` con `GOADMIN_DESKTOP_LOCAL_WEB=1`):
  `[webServer] Parando el servidor Next` → `El servidor Next terminó (código 0)`.

### Hallazgos y arreglos (todos en `electron/**` salvo el 1)

1. **Primer request de 10-43 s** (el peor caso, con el disco frío). Con `curl` contra el
   `server.js` empaquetado, arrancado a mano en otro puerto: primer `GET /app/pos` 13-43 s, el
   segundo 0,2 s; el tiempo de CPU del proceso subía 13 s durante ese request. Perfil con el
   inspector (`Profiler.start` en el primer request): 26 174 ms de 27 828 ms en
   `loadComponentsImpl` ← `unstable_preloadEntries` (`next-server.js:576`), es decir, la
   precarga de **todas** las rutas al arrancar (`vm.Script`, `deepFreeze`, `require` de
   `app/api/crm/webhooks/elevenlabs/route.js`, `app/api/ai-assistant/chat/route.js`, …), en el
   hilo principal. Arreglo: `experimental.preloadEntriesOnStart: false` solo con
   `NEXT_DIST_DIR` (`next.config.js`). Con el `server.js` resultante: primer `GET /app/pos`
   0,17 s, `/auth/login` 0,22 s, siguientes 0,01-0,06 s; en el `.exe`, login visible 2 s después
   de «listo».
2. **Cambio de origen tras una muerte abrupta del main.** Matando el main con `Stop-Process`,
   el `server.js` hijo seguía escuchando en 47800 durante 5-15 s; el siguiente arranque saltaba
   a 47801 **y lo persistía**: el origen cambiaba para siempre (`AVISO: el puerto cambió de 47800
   a 47801`). Arreglos: (a) `webLauncher.ts`, envoltorio del `server.js` en el utilityProcess
   que vigila al main (`process.kill(pid, 0)` cada 1 s) y se cierra si desaparece — tras matar
   el main, el puerto estaba libre en < 1 s y el relanzamiento inmediato arrancó en 47800;
   (b) el puerto de casa se reintenta 3 s si está ocupado; (c) nunca se sobreescribe el puerto
   persistido (§2.3). Verificado: con un huérfano vivo el log dice `Puerto 47800 ocupado; se
   espera hasta 3 s…` y, si no se libera, `AVISO: el puerto de casa 47800 está ocupado; esta
   sesión corre en 47801 (… no se persistirá)`, y `web-server.json` sigue en 47800.
3. **`[connectivity] Estado: OFFLINE` solo salía por consola**: ahora también en `agent.log`.
4. **`config.json` corrupto en el perfil de pruebas**: 276 bytes todo NUL (NTFS reserva el tamaño
   antes de volcar; un apagado o crash en mitad de `writeFileSync` lo deja así). Cada lectura
   fallaba con el mismo stack trace (`[store] No se pudo leer config.json: SyntaxError`) y se
   perdían vinculación y refresh token. `store.ts`: escritura atómica (temporal + `fsync` +
   `rename`) y cuarentena del archivo ilegible (`config.json.corrupto-<fecha>`) con un único
   aviso.
5. **`devCapture.ts` capturó una ventana ajena.** En el modo de captura de desarrollo, con la
   ventana de la app sin foco (Windows no deja robar el foco a un proceso en segundo plano), el
   respaldo «recorte de pantalla» guardó la ventana que estaba delante —un navegador del usuario
   con una página de verificación en dos pasos— en `docs/desktop/evidencia/`. Se borró en el
   acto y el recorte ahora exige `win.isFocused()`; si no, pasa al respaldo que solo captura el
   contenido propio. Las capturas de esta fase se hicieron por CDP (§5).
6. `resources/app-update.yml` no existe en el paquete `--dir` (`Error: ENOENT … app-update.yml`
   en consola): esperado, lo genera solo el instalador NSIS; el updater lo ignora.

### Cosas que NO son de esta fase pero se vieron

- `next build` en el árbol de trabajo falló tres veces por trabajo en curso de otras sesiones
  (§0); `HEAD` `e3972da7` tiene dos rutas con `import {` roto (`crm/health/[customerId]`,
  `crm/onboarding/templates`) que en el árbol ya están reparadas sin commitear. Y otra sesión
  hizo `git stash` del árbol completo (74 archivos, incluidos los de esta fase) para commitear;
  se recuperaron solo los cinco archivos de esta fase con `git checkout stash@{0} -- …`. Más
  tarde esa misma sesión hizo `git add -A` y el `next.config.js` de esta fase (`preloadEntriesOnStart`)
  viajó en su commit `5c4150f4`; el resto de `electron/**` y estos docs siguen sin commitear, como
  se pidió.
- Un `next build` con `node_modules` enlazado por junction desde otra carpeta produce un
  standalone de 1,25 GB: el trazado de archivos copia `node_modules` entero. Con la carpeta real,
  333 MB.
- La web registra un service worker en `localhost:47800` (`public/sw.js`, solo estáticos). Y
  la página de login carga Stripe.js en iframes de `js.stripe.com`; sin red simplemente no
  cargan.
