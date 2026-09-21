# Auditoría Go Admin Desktop — Offline, UI e Instalador

Fecha: 2026-09-15
Alcance revisado: `electron/` completo, `src/lib/supabase/config.ts`, `src/lib/utils/offlineCache.ts`,
`src/components/app-layout/OfflineIndicator.tsx`, `public/sw.js`, `next.config.js`,
`electron/release/` (build 0.1.2 publicado), `docs/PLAN-OFFLINE-ELECTRON.md`.

---

## Resumen ejecutivo

La app de escritorio es un **wrapper de una URL remota** (`https://app.goadmin.io`). Con esa
arquitectura el offline real **no es alcanzable por parches**: cada navegación de Next.js App Router
es una petición HTTP al servidor. El trabajo offline que ya existe (cache de queries en IndexedDB,
cola de acciones, banner) está bien pensado, pero está construido encima de un cimiento que no
sostiene: el "app shell" cacheado se carga en un **origen opaco (`data:`)** donde ese mismo
IndexedDB y ese mismo `localStorage` **no existen**.

Además, el POS no puede imprimir sin internet: los tickets se encolan en la tabla `print_jobs` de
Supabase y el agente los consume desde ahí.

Tres frentes, por orden de impacto:

| Frente | Estado | Esfuerzo para arreglar |
|---|---|---|
| Offline | Roto de raíz (arquitectura) | 3-5 semanas (UI empaquetada) + 6-10 semanas (POS local-first) |
| Instalador | Funciona pero con 6 defectos serios, 1 bloqueante comercial (sin firma) | 3-5 días |
| UI | Se ve como un navegador sin barra; zoom hardcodeado; sin recuperación de errores | 4-6 días |

---

## 1. Offline — por qué hoy no funciona

### 1.1 Arquitectura: wrapper de URL remota
`electron/src/main/windows/mainWindow.ts` → `getLoadUrl()` devuelve `WEB_APP_URL`
(`https://app.goadmin.io`). La web es Next.js 15 App Router **con middleware** (`src/middleware.ts`,
matcher amplio). Cada ruta (`/app/pos`, `/app/inventario`, …) exige:

1. Un documento HTML generado en el servidor, o
2. Un payload RSC (`?_rsc=…`) pedido al servidor en la navegación cliente.

Sin red no hay ni lo uno ni lo otro. **Aunque los datos estén cacheados, no hay a dónde navegar.**

### 1.2 El "app shell" cacheado es inservible
`offlineManager.saveAppShell()` guarda `document.documentElement.outerHTML`, y
`mainWindow.loadCachedShell()` lo carga como `data:text/html;charset=utf-8,<encodeURIComponent(…)>`.

Cuatro problemas, cada uno suficiente por sí solo:

- **Origen opaco.** Un `data:` URL no tiene origen. Por tanto: `localStorage` está vacío (⇒ la ruta
  de auth offline de `config.ts` que lee `sb-<ref>-auth-token` **nunca** encuentra sesión),
  el IndexedDB es otro (⇒ `goadmin-offline`, el cache de queries y la cola de acciones,
  **no son accesibles**), no hay cookies, y `crypto.subtle` está restringido.
- **Cross-origin.** El `<base href="https://app.goadmin.io/">` inyectado hace que todos los chunks
  `_next/static/**` se pidan cross-origin desde un origen opaco → sin red fallan, y con red serían
  opacos.
- **DOM post-hidratación ≠ HTML de Next.** React intenta rehidratar sobre un DOM que ya fue mutado
  por React; falla y borra el árbol.
- **Tamaño.** Un `outerHTML` de la app ronda 1-3 MB; `encodeURIComponent` lo infla ~1.5-3×.
  Chromium tiene límites prácticos de longitud de URL y el parseo es lentísimo.

Resultado observable: pantalla en blanco o shell muerto sin navegación.

### 1.3 `goadmin-cache://` está registrado y nunca se usa
`offlineManager.initOfflineManager()` hace `protocol.handle('goadmin-cache', …)`, pero
**ningún código carga jamás una URL `goadmin-cache://`**. Además falta
`protocol.registerSchemesAsPrivileged()` **antes** de `app.ready`, así que ese esquema no es
`standard` ni `secure`: aunque se usara, no tendría storage, ni Service Workers, ni `fetch`.

### 1.4 Código muerto y duplicado
- `electron/src/main/offlineCache.ts` → `initOfflineCache()` **no se llama desde ningún sitio**.
- `getCachedAssetPath()`, `clearOfflineCache()`, `hasCachedAppShell()` no se usan ni se exponen por IPC.
- El directorio `cache/assets/` se crea y queda vacío para siempre.
- Hay **dos** banners offline distintos: el inyectado en `saveAppShell()` y `OfflineIndicator.tsx`.

### 1.5 El cache HTTP de Chromium no cubre el documento
Sí retiene `_next/static/**` (URLs versionadas, inmutables). Pero el **documento HTML** de cada ruta
sale de SSR/middleware con `Cache-Control: private, no-store` → nunca entra al cache HTTP.
Sin documento no hay app, por muchos chunks que haya en disco.

### 1.6 El Service Worker está deliberadamente desactivado para esto
`public/sw.js` líneas 40-42: *"NO interceptar navegaciones ni API"*. El único mecanismo estándar que
resolvería 1.5 está apagado a propósito (por bugs de Safari en la PWA). En Electron no hay Safari:
se puede tener una estrategia distinta para el desktop.

### 1.7 Impresión offline: imposible hoy
`electron/src/main/agentRunner.ts` consume trabajos de la tabla `print_jobs` de Supabase (polling
cada 5 s + realtime). El POS los **inserta** ahí (`src/lib/services/printJobsService.ts`).
Sin internet no hay INSERT y no hay job → **no sale el recibo**.

Existe el camino local y funciona: `ipc.ts` → `printing:print-raw` → discovery server `/print` →
`printerDrivers.printToDevice()`. **El POS simplemente no lo usa.** Para un POS que debe operar sin
internet, esto es el fallo más caro de todos.

### 1.8 La cola de acciones no es transaccional
`config.ts` intercepta escrituras offline y devuelve `202` con `{ data: null, error: null }`.
Consecuencias:

- La UI cree que guardó, pero **no recibe la fila creada ni su `id`**. Cualquier flujo encadenado
  (venta → líneas → pagos → movimiento de inventario) se rompe en el segundo paso.
- La cola encola **peticiones HTTP sueltas**, no operaciones de negocio. Si la venta se encola y las
  líneas fallan, se sincroniza una venta vacía.
- No hay IDs generados en cliente (UUID v4/v7), no hay idempotencia, no hay reintento por operación,
  y a los 5 reintentos la acción **se borra silenciosamente** (`syncQueue()`): venta perdida sin aviso.

### 1.9 `navigator.onLine` es la señal equivocada
Toda la lógica offline (`config.ts`, `offlineCache.ts`, `OfflineIndicator.tsx`, `mainWindow.ts`)
depende de `navigator.onLine` / `net.online`. En Windows eso solo dice *"hay un adaptador de red con
enlace"*. El caso más común en un local comercial —WiFi conectado, router sin internet— reporta
`true` y la app se queda colgada en timeouts en vez de entrar en modo offline.

**Hace falta un health-check real**: ping periódico a Supabase (`/rest/v1/` con `HEAD`) con
histéresis, y que ese sea el estado de verdad.

### 1.10 Sin pre-cacheo
Solo se cachea lo que el usuario visitó. Si el cajero no abrió inventario antes del corte, no hay
productos. La Fase 4 del `PLAN-OFFLINE-ELECTRON.md` no está implementada.

---

## 2. Instalador — defectos concretos

### 2.1 BLOQUEANTE COMERCIAL: sin firma de código
No hay `win.certificateFile`, ni Azure Trusted Signing, ni variables `CSC_*` en ningún sitio.
Cada instalación nueva muestra *"Windows protegió su PC — SmartScreen"*. Para vender un ERP a PYMEs
colombianas esto se traduce directamente en *"me dijeron que era un virus"*.
**Es el ítem con mayor retorno de todo el instalador.**
Opciones: certificado OV/EV (~USD 200-400/año, requiere token o HSM) o Azure Trusted Signing
(~USD 10/mes, más simple, requiere entidad verificada).

### 2.2 Icono de los accesos directos roto
`build/installer.nsh` crea los accesos apuntando a `$INSTDIR\resources\build\icon.ico`.
Esa ruta **no existe**: en `release/win-unpacked/resources/` solo hay `app.asar`, `app-update.yml` y
`elevate.exe`. Con `asarUnpack: [build/icon.ico]` sería `resources\app.asar.unpacked\build\icon.ico`.
Lo robusto es usar el propio ejecutable como fuente del icono:
`CreateShortCut "$DESKTOP\Go Admin ERP.lnk" "$INSTDIR\Go Admin ERP.exe" "" "$INSTDIR\Go Admin ERP.exe" 0`

### 2.3 Accesos directos huérfanos al desinstalar
Se crean a mano en `Section -PostInstall`, así que electron-builder no los conoce y el desinstalador
no los borra. Falta la `Section un.` correspondiente (o usar la macro `customUnInstall`).

### 2.4 Cambio de `perMachine` entre versiones (rompe actualizaciones)
El build publicado 0.1.2 (`release/builder-effective-config.yaml`) se generó con
`perMachine: true` + `requestedExecutionLevel: requireAdministrator`.
El `electron-builder.yml` actual dice `perMachine: false` + `asInvoker`.
Los clientes que ya tienen 0.1.2 instalado *para todos los usuarios* no podrán actualizar limpio:
NSIS aborta o deja dos instalaciones paralelas. Hay que **elegir uno y congelarlo**
(recomendado: `perMachine: false`, no pide UAC, mejor tasa de instalación) y publicar una versión
puente que desinstale la anterior si detecta la clave de registro per-machine.

### 2.5 `artifactName` sin versión
`GoAdminERP-Setup.${ext}` → todos los releases de GitHub tienen el mismo nombre de asset.
Se pisan en la carpeta de Descargas del cliente, no se puede saber qué versión es un `.exe` suelto, y
complica los rollbacks. Debe ser `GoAdminERP-Setup-${version}.${ext}`.

### 2.6 Auto-update apuntando al repo de código
`publish: { provider: github, owner: Palomo-dev, repo: go-admin-erp }`.
Si ese repo es privado, `electron-updater` **no puede descargar** sin un token, y embeber un token en
el .exe no es opción. Debe apuntar a un repo público separado (`go-admin-desktop-releases`) o a
`provider: generic` sobre S3 / Supabase Storage / Cloudflare R2.

**[VERIFICADO 2026-09-21]** El repo es público y la cadena está completa: `app-update.yml` del
paquete (`provider: github`, `owner: Palomo-dev`, `repo: go-admin-erp`, sin `publisherName` →
sin verificación de firma, coherente con `verifyUpdateCodeSignature: false`), feed
`releases.atom` con `v0.2.1` primero, `latest.yml` de la release `v0.2.1` (`version: 0.2.1`,
`GoAdminERP-Setup-0.2.1.exe` + `.blockmap` publicados y descargables sin token). Una
instalación 0.2.0 encuentra la 0.2.1. Nada que arreglar en `updater.ts`; detalle en
`docs/desktop/HARDENING-2026-09-21.md` §6.

### 2.7 `Page custom` dentro del `.nsh` incluido
electron-builder inyecta `installer.nsh` en un punto concreto del script generado. Declarar `Page`
ahí es frágil: puede quedar en orden incorrecto o duplicarse. Lo soportado son las macros
`customPageAfterChangeDir`, `customInstall`, `customUnInstall`.

### 2.8 Sin CI para el desktop
`.github/workflows/` solo tiene `ci-web.yml` y `mobile-build.yml`. Los `.exe` se generan a mano desde
la máquina de desarrollo. Sin build reproducible, sin firma automatizada, sin publicación
automática de `latest.yml`.

### 2.9 Menor
- `files: node_modules/**/*` desactiva el filtrado automático de devDependencies de electron-builder.
  El `app.asar` publicado pesa 15 MB (aceptable), pero conviene verificarlo con
  `npx asar list app.asar` y quitar el patrón explícito.
- `printer@0.4.0` (optionalDependency) es un módulo nativo abandonado desde 2016; no compila contra
  Node 20 / Electron 33. Confirmar si se usa realmente o eliminarlo.
  **[CERRADO 2026-09-21]** No se instalaba nunca (fallaba el build nativo) y su único uso era un
  `try { require('printer') }` con fallback a PowerShell. Eliminado de `print-agent/package.json` y
  `electron/package.json` (y de los lock); el fallback de texto plano de `printViaSystem` pasa al
  spooler RAW. Ver `docs/desktop/HARDENING-2026-09-21.md` §5.
- `escpos@3.0.0-alpha.6`: alpha sin mantenimiento desde 2018.
  **[CERRADO 2026-09-21 — documentado, no migrado]** Sí se usa de verdad (`escpos.Printer` sobre
  un adaptador propio en `printing/escposBuffer.ts` y `escpos.Network`); alternativa y plan en
  `HARDENING-2026-09-21.md` §5.
- Instalador 84 MB / 283 MB desempaquetado: normal para Electron, pero vale la pena activar
  actualizaciones diferenciales (ya se genera `.blockmap`, solo falta no renombrar el artefacto).

---

## 3. UI — qué se ve mal y por qué

| # | Problema | Archivo |
|---|---|---|
| 3.1 | `zoomFactor: 0.75` hardcodeado: todo se ve 25% más pequeño. En portátiles 1366×768 es ilegible. `Ctrl+0` además resetea a 0.75, no a 100%. El zoom no se persiste. | `mainWindow.ts` |
| 3.2 | Parece un navegador sin barra: sin barra de título propia, sin atrás/adelante/recargar/inicio, sin indicador de carga. Si una ruta falla, el usuario no tiene cómo recuperarse. | `mainWindow.ts` |
| 3.3 | Splash en `data:` URL, sin logo, texto "Iniciando agente de impresión…" (que no es lo que el usuario espera leer), cierre forzado a 15 s. | `mainWindow.ts` |
| 3.4 | `backgroundColor: '#1e3a8a'` produce un flash azul en cada carga y no coincide con el tema de la app. Sin sincronización con `nativeTheme` (modo oscuro). | `mainWindow.ts` |
| 3.5 | Dos banners offline distintos, con estilos distintos, que pueden aparecer simultáneamente. | `offlineManager.ts` + `OfflineIndicator.tsx` |
| 3.6 | El estado de ventana restaurado no se valida contra los monitores actuales. Al desconectar un segundo monitor la ventana reaparece fuera de pantalla y el usuario cree que la app no abre. | `mainWindow.ts` |
| 3.7 | Menú de aplicación por defecto de Electron, en inglés (File/Edit/View…), visible con Alt. | — |
| 3.8 | `setInterval(refreshMenu, 15_000)` en el tray: nunca se limpia y reconstruye el menú aunque nadie lo mire. | `tray.ts` |
| 3.9 | El estado de actualización existe (`updater.ts`) pero solo se ve si la web lo pinta. Sin UI nativa de "hay una actualización lista". | `updater.ts` |

---

## 4. Bugs y riesgos de seguridad

### 4.1 "Salir" del tray probablemente no cierra la app
`index.ts`: `before-quit` hace `e.preventDefault(); quitting = true; … app.quit()`.
Pero `mainWindow.on('close')` sigue con `closing === false` → `e.preventDefault()` → **Electron
cancela el quit**. La variable `closing` de `mainWindow.ts` nunca se pone en `true` (no hay setter
exportado). El proceso se queda vivo en la bandeja.
**Fix:** exportar `prepareQuit()` desde `mainWindow.ts` y llamarlo en `before-quit` antes de `app.quit()`.

### 4.2 Sin `will-navigate`: el bridge se hereda a dominios externos
El preload expone `window.goAdminDesktop` en el `webContents`. Si por cualquier enlace la ventana
navega fuera de `app.goadmin.io`, **ese sitio hereda el bridge**: impresión, autostart, config,
refresh token. Falta:

```ts
mainWindow.webContents.on('will-navigate', (e, url) => {
  if (!url.startsWith(WEB_APP_URL)) { e.preventDefault(); shell.openExternal(url); }
});
```

### 4.3 `sandbox: false` global
La ventana principal y las hijas (`setWindowOpenHandler`) corren sin sandbox, sin CSP, con
`contextIsolation` como única barrera. Está justificado por el diálogo de impresión
(`window.open('', '_blank')`), pero conviene aislar **solo** la ventana de impresión en lugar de
bajar el sandbox de toda la app.

**[CERRADO 2026-09-21]** Vista de la web, pantalla del cliente y ventanas hijas con
`sandbox: true`. `window.open('', '_blank')` + `document.write` + `print()` sigue funcionando
(con el opener sandboxed las hijas nacen sandboxed y comparten proceso; comprobado con Electron
33.4.11). Además, IPC `printing:open-preview` (`window.goAdminDesktop.openPrintPreview(html)`)
que abre una ventana sandboxed y sin preload desde el main. Sin cambios en `src/`. Ver
`docs/desktop/HARDENING-2026-09-21.md` §1.

### 4.4 El crash reporter no reporta
`submitURL: 'https://app.goadmin.io/api/crash-report'` con `uploadToServer: false` → ese endpoint
nunca recibe nada. Además `appendLog()` **no se llama desde ningún sitio** y `flushLog()` solo en
excepciones no capturadas: `agent.log` está casi siempre vacío, aunque el tray ofrece "Ver logs".
Ya hay Sentry en la web (`@sentry/react`); conviene usarlo también en el proceso main.

**[CERRADO 2026-09-21]** `@sentry/electron/main` en el proceso main con el DSN de
`NEXT_PUBLIC_SENTRY_DSN` (de `resources/web/.env` o del entorno, nunca cableado),
`release = go-admin-desktop@<versión>`, `uncaughtException`/`unhandledRejection` y minidumps
nativos subidos a Sentry por su integración (`crashReporter` con `uploadToServer: true` hacia el
endpoint del DSN). Sin DSN: desactivado en silencio, `crashReporter` local con
`uploadToServer: false`. `appendLog()` ya se usa desde webServer/connectivity desde la fase 3.
Ver `HARDENING-2026-09-21.md` §2.

### 4.5 `SUPABASE_ANON_KEY` hardcodeada en el asar
`constants.ts`. Es la anon key (pública por diseño), pero deja la app clavada a un proyecto y rotarla
obliga a publicar un release nuevo.

**[CERRADO 2026-09-21]** `constants.ts` ya no lleva URL ni anon key. `electron/src/main/publicEnv.ts`
las lee del entorno, de `resources/web/.env` (empaquetado) o, sin empaquetar, de `.env.local`/`.env`
de la raíz; `agentRunner` y `connectivity` las consumen de ahí y el agente recibe
`SUPABASE_URL`/`SUPABASE_ANON_KEY` por `process.env`. Sin valores: error claro en el log, el agente
no arranca (sin borrar el token) y la web abre igual. Ver `HARDENING-2026-09-21.md` §3.

### 4.6 `next.config.js` con los tipos y el lint desactivados
`typescript.ignoreBuildErrors: true` y `eslint.ignoreDuringBuilds: true`. La web que carga el
Electron se despliega aunque tenga errores de tipos. Es la causa probable de varios de los
`tsconfig.*.tsbuildinfo` sueltos en la raíz del repo.

**[CERRADO 2026-09-21 — parcial]** `typescript.ignoreBuildErrors: false`. El `next build`
compiló («Compiled successfully») y la comprobación de tipos solo tropezó con páginas que otro
agente borraba a la vez en `src/app/auth`; `tsc --noEmit` no reporta ningún error en la zona del
desktop, pero sí 32 en trabajo ajeno sin commitear que, a partir de ahora, harán fallar el
despliegue hasta corregirse. `eslint.ignoreDuringBuilds` sigue en `true` con comentario honesto:
miles de `no-explicit-any` preexistentes; queda como deuda. Ver `HARDENING-2026-09-21.md` §4.

---

## 5. Recomendación

### La decisión de fondo

**El wrapper de URL remota no puede dar offline.** Hay que meter la UI dentro del `.exe`.
Todo lo demás es consecuencia de eso.

#### Opción A — Parchear el wrapper (lo que propone el plan actual)
1-2 semanas. Resultado: la app abre offline con una pantalla degradada y sin navegación real.
**No sirve para un POS.** Vale como parche de 2 días para que deje de verse rota (quitar el `data:`
URL, mostrar una pantalla offline honesta), no como destino.

#### Opción B — Empaquetar la UI dentro del .exe ← **recomendada**
El renderer deja de cargar `https://app.goadmin.io` y carga desde un esquema propio servido de disco.

**B1 · Protocolo `app://` + export estático (el .exe ligero, ~90 MB)**
- `protocol.registerSchemesAsPrivileged([{ scheme:'app', privileges:{ standard:true, secure:true, supportFetchAPI:true, corsEnabled:true, stream:true } }])` **antes** de `app.ready`.
- Las rutas bajo `/app` se compilan como SPA cliente; Supabase ya se llama directo desde el navegador,
  así que la mayor parte del ERP no necesita servidor.
- Auth pasa a ser puramente cliente en desktop (sin middleware): el `refresh token` ya está
  persistido cifrado en `store.ts`.
- Las API routes de Next que sí necesiten servidor se llaman por red y degradan a la cola offline.
- **Resuelve de raíz 1.1, 1.2, 1.5, 1.6**: origen estable ⇒ `localStorage`, IndexedDB y cookies
  sobreviven, y la navegación cliente funciona sin red.
- Coste: sacar `/app` de la dependencia de SSR + middleware. ~3-5 semanas.

**B2 · Servidor Next embebido en 127.0.0.1 (el camino barato)**
- El proceso main arranca `next start` sobre un puerto local y la ventana carga `http://127.0.0.1:PORT`.
- Mantiene SSR y middleware **intactos**: cambio de código mínimo en la web.
- Contra: el `.exe` sube a ~200-250 MB, arranque 2-4 s más lento, y hay que empaquetar `node_modules`
  de producción de Next.
- ~1-2 semanas. **Si tocar el App Router no es viable ahora, esta es la opción.**

#### Opción C — Local-first de verdad, acotado al POS
Necesario para arreglar 1.7 y 1.8, y es lo único que permite que un cajero venda 4 horas sin internet
sin perder nada:
- Base de datos local: **SQLite** (`better-sqlite3`, en el main, expuesto por IPC) o **PGlite**
  (Postgres real en el renderer, SQL idéntico al de Supabase).
- **IDs UUID v7 generados en cliente** para ventas, líneas y pagos ⇒ idempotencia natural en el
  sincronizado.
- **Outbox por operación de negocio**, no por petición HTTP: una venta es un sobre atómico
  (cabecera + líneas + pagos + movimientos), se sincroniza entera o no se sincroniza.
- **Nunca borrar** una operación tras N reintentos: moverla a una bandeja "requiere revisión" visible
  para el administrador.
- **Impresión local directa**: el POS llama `window.goAdminDesktop.printRaw()` (ya existe) en lugar de
  insertar en `print_jobs`; `print_jobs` pasa a ser el registro de auditoría que se sincroniza después.
- Resto de módulos (CRM, PMS, reportes, contabilidad) en **modo solo-lectura cacheada** offline,
  con aviso explícito.
- ~6-10 semanas para POS + impresión.

### Mi recomendación concreta

1. **Semana 0 (2-3 días):** parches de honestidad y los bugs concretos — quitar el `data:` URL shell,
   pantalla offline real, `prepareQuit()`, `will-navigate`, health-check de conectividad real en vez
   de `navigator.onLine`, zoom a 100% persistido.
2. **Semana 1 (3-5 días, en paralelo):** instalador — firma de código (arrancar el trámite **hoy**,
   tarda días), icono de accesos directos, `Section un.`, congelar `perMachine: false`,
   `artifactName` con versión, mover releases a repo propio, workflow de CI que firme y publique.
3. **Semanas 1-3:** UI nativa — barra propia con atrás/recargar/estado de conexión/estado de
   actualización, splash con marca, menú en español, validación de monitores, tema sincronizado.
4. **Semanas 2-4:** **Opción B2** (servidor Next embebido) para tener offline funcional rápido, con
   B1 como objetivo a medio plazo si el tamaño del `.exe` molesta.
5. **Semanas 4-12:** **Opción C** acotada a POS + impresión local.

El orden importa: sin el paso 4 la UI puede quedar preciosa y seguir sin abrir sin internet, y sin el
paso 5 abrirá sin internet pero el cajero no podrá vender ni imprimir.

---

## 6. Referencia rápida de archivos

| Archivo | Qué hay que hacer |
|---|---|
| `electron/src/main/windows/mainWindow.ts` | Eliminar `loadCachedShell` con `data:` URL. Zoom 1.0 persistido. `will-navigate`. Validar bounds contra `screen.getAllDisplays()`. Exportar `prepareQuit()`. |
| `electron/src/main/index.ts` | `registerSchemesAsPrivileged` antes de `ready`. Llamar `prepareQuit()` en `before-quit`. Quitar `initOfflineCache` muerto. |
| `electron/src/main/offlineManager.ts` | Reescribir: servir el bundle real por `app://`, o eliminar si se va a B2. |
| `electron/src/main/offlineCache.ts` | **Borrar** (código muerto). |
| `electron/src/main/tray.ts` | Guardar y limpiar el `setInterval`. |
| `electron/src/main/agentRunner.ts` | Camino de impresión local sin `print_jobs`. |
| `electron/src/main/crashReporter.ts` | Cablear `appendLog()` o sustituir por Sentry en el main. |
| `electron/electron-builder.yml` | `artifactName` con versión, `publish` a repo de releases, firma, congelar `perMachine`, quitar `node_modules/**/*` de `files`. |
| `electron/build/installer.nsh` | Icono desde el `.exe`, macros de electron-builder en vez de `Page custom`, `Section un.`. |
| `src/lib/supabase/config.ts` | Health-check real de conectividad. Devolver filas sintéticas con UUID de cliente al encolar. |
| `src/lib/utils/offlineCache.ts` | Outbox por operación de negocio. No borrar tras 5 reintentos. |
| `src/components/app-layout/OfflineIndicator.tsx` | Fuente única del banner (quitar el inyectado). Última sincronización. |
| `src/lib/services/printJobsService.ts` | En desktop, imprimir por IPC local y registrar el job después. |
| `next.config.js` | Reactivar `typescript` y `eslint` en build (con deuda acotada). |
