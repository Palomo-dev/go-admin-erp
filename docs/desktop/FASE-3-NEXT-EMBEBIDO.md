# Fase 3 del desktop — servidor Next embebido en 127.0.0.1

Origen: `docs/ROADMAP-DESKTOP.md` §Fase 3 y
`docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md` §1 y §5 (opción B2).
Última actualización: 2026-09-16 00:55 (congelación de `main` para commit).

## 0. Estado real

### Hecho (en el árbol, compila)

- `next.config.js`: `output: 'standalone'` **solo si `NEXT_DIST_DIR` está definida** (la exporta
  `build-web.js`) y `distDir: process.env.NEXT_DIST_DIR || '.next'`. Sin la variable, `next build`
  y Vercel siguen exactamente igual (ni standalone ni otro directorio).
- `electron/scripts/build-web.js`: `next build` aislado en `.next-desktop` + copia a
  `electron/resources/web/` + `.env` solo con `NEXT_PUBLIC_*` (allow-list) + defaults de
  producción para `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SELLERS_URL`.
- `electron/src/main/webServer.ts`: `start()` / `stop()` / `getUrl()`, `utilityProcess.fork`,
  puerto estable 47800 persistido (reintento con los siguientes si está ocupado), evento `ready`
  al primer `GET /` que responde, `GATE_COOKIE_SECRET` persistido, reinicio automático si el
  hijo muere, logs a `userData/agent.log`.
- `electron/src/main/index.ts`: arranque **antes** de crear la ventana (splash visible, cierre de
  seguridad a 45 s), parada en `before-quit`, recarga de la vista tras `restarted`.
- `electron/src/main/windows/mainWindow.ts`: `getLoadUrl()` → URL local si el servidor arrancó;
  `isInternalUrl()` acepta `127.0.0.1:<puerto>`; `will-navigate` y `setWindowOpenHandler` la usan.
- `electron/src/main/crashReporter.ts`: `appendLog` escribe a disco (debounce 2 s) y con `
`.
- `electron/electron-builder.yml`: `extraResources: resources/web → web`. `electron/.gitignore`
  excluye `resources/web/`; `.gitignore` raíz excluye `.next-desktop/` (y se le quitaron dos
  líneas con bytes NUL que lo hacían «binario» para git).
- `tsconfig.json`: `include` añade `.next-desktop/types/**/*.ts` (lo escribe Next en cada build;
  sin él lo reescribiría cada vez con otro formato).
- `electron/package.json`: scripts `build:web` y `build:web:copy`.
- Verificado: `cd electron && npx tsc -p .` limpio; `node scripts/build-web.js` completa el
  `next build` (ver «Evidencia»).

### Pendiente

- `npm run package:dir` con `resources/web` presente y arranque del `.exe` (`curl
  http://127.0.0.1:47800/auth/login` → 200). No se llegó por la congelación: el `next build`
  tardó 28 min en el primer intento (murió por un `next build` ajeno en `.next`) y otros ~45 min
  en el segundo, aislado.
- Prueba sin red (`--host-resolver-rules`, §5) navegando `/app/pos`, `/app/inventario`,
  `/app/crm` con datos cacheados, y su evidencia.
- `npm run package` (NSIS): tamaño del instalador y `.blockmap`.
- Estado de la fila «Fase 3» en `docs/ROADMAP-DESKTOP.md` (sigue en «Pendiente»).

### ¿Se puede commitear `electron/**` y `next.config.js` tal cual?

Sí. `npm run build` del desktop (`sync:agent` + `tsc` + `copy:renderer`) no depende de
`resources/web`; `electron-builder` empaqueta igual sin esa carpeta (`extraResources` con origen
inexistente no rompe) y la app cae a `https://app.goadmin.io`. `next build` del ERP no cambia:
`distDir` solo varía si alguien exporta `NEXT_DIST_DIR`. `resources/web/` y `.next-desktop/` están
ignorados por git.

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
 ├─ webServer.start()  ──utilityProcess.fork──▶  resources/web/server.js  (Next standalone)
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

- **Proceso hijo: `utilityProcess.fork(server.js)`**, no `child_process` con
  `ELECTRON_RUN_AS_NODE=1` + `process.execPath`. Usa el Node embebido de
  Electron (no hace falta un `node.exe` aparte ni depende del PATH), Electron
  mata al hijo si el main muere, y `stdio: 'pipe'` permite volcar su salida al
  log del main. Se borra `ELECTRON_RUN_AS_NODE` del entorno del hijo por si el
  main la heredara.
- **Puerto estable: `PREFERRED_PORT = 47800`, persistido en
  `userData/web-server.json`.** El origen incluye el puerto; si cambiara en
  cada arranque, cada apertura sería «un navegador nuevo» sin sesión ni cache
  offline. Orden de prueba: puerto persistido → 47800..47809 → uno del sistema.
  Cada candidato se reserva un instante con `net.createServer().listen()`
  antes de arrancar; si el arranque falla (p. ej. alguien tomó el puerto entre
  la reserva y el `listen` de Next) se prueba el siguiente. Un timeout de 30 s
  no se reintenta con otro puerto (no lo arreglaría). Si el puerto cambia
  respecto al persistido se deja un `AVISO` en el log.
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
npm run build:web        # next build (10-20 min) + copia a resources/web + .env público
npm run package:dir      # tsc + copy:renderer + electron-builder --dir → release/win-unpacked
& "release\win-unpacked\Go Admin ERP.exe"
curl.exe -s -o NUL -w "%{http_code}" http://localhost:47800/auth/login   # → 200
npm run package          # instalador NSIS + .blockmap en release/
```

Prueba sin red sin tocar adaptadores: arrancar el `.exe` con reglas de
resolución de nombres de Chromium, que afectan al renderer **y** al
health-check del main (`net.fetch`), así que la app entra en modo offline de
verdad (`isAppOnline() === false`):

```powershell
& "release\win-unpacked\Go Admin ERP.exe" --host-resolver-rules="MAP app.goadmin.io ~NOTFOUND, MAP *.supabase.co ~NOTFOUND, MAP *.goadmin.io ~NOTFOUND"
```

No afecta al proceso hijo de Next (Node usa su propio DNS), así que el gate
del middleware sí puede llegar a Supabase en esta simulación; su camino sin
red está cubierto por código (`catch` + presupuesto de 2,5 s) y por la cookie
`ga_gate` persistida. La prueba definitiva es desconectar el WiFi.

## 6. Tamaño y actualizaciones diferenciales

Ver «Evidencia». El instalador crece (antes 84 MB) por `resources/web`
(`node_modules` trazados + `.next/server` + `.next/static`). El `.blockmap`
sigue generándose (`nsis.differentialPackage: true`), así que las
actualizaciones descargan solo los bloques que cambian; como
`resources/web` va sin comprimir dentro del NSIS 7z por bloques, un cambio
de la web se traduce en descargar los chunks nuevos, no los 200+ MB.

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
Require stack: .next\serverpppp\crmctividades\[id]\page.js
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

**No ejecutado todavía** (congelación de `main`): `npm run package:dir`,
arranque del `.exe`, prueba con `--host-resolver-rules`, `npm run package`
(tamaño y `.blockmap`). Ver §0 «Pendiente».
