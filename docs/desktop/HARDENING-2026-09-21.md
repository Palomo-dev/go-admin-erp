# Hardening del desktop — cierre de los puntos sueltos de la auditoría (2026-09-21)

Cierra los puntos de `docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md` que no
entraron en ninguna fase (2, 3, 4A–4D): **§4.3** sandbox, **§4.4** crash
reporter, **§4.5** anon key cableada, **§4.6** `next.config.js`, **§2.9**
dependencias, y la revisión del auto-update (**§2.6**). Todo en `electron/**`,
`print-agent/src/**` (y su espejo `electron/src/agent`), `next.config.js` y
`docs/desktop/**`. **Ningún cambio en `src/`.**

Versión de referencia: `electron/package.json` 0.2.1, Electron 33.4.11,
`@sentry/electron` 7.19.0.

## Resumen

| Punto | Estado | Dónde |
|---|---|---|
| §4.3 `sandbox: false` global | **Cerrado.** Vista web, pantalla del cliente e hijas con `sandbox: true`; `window.open('')` para imprimir sigue funcionando; IPC nuevo `printing:open-preview`. | `windows/mainWindow.ts`, `windows/posDisplayWindow.ts`, `printPreview.ts`, `ipc.ts`, `preload/index.ts` |
| §4.4 crash reporter | **Cerrado.** Sentry en el main (DSN de `NEXT_PUBLIC_SENTRY_DSN`), `release` = versión, minidumps nativos a Sentry; sin DSN, apagado. | `crashReporter.ts`, `index.ts` |
| §4.5 anon key en el asar | **Cerrado.** `constants.ts` sin URL/anon key; `publicEnv.ts` las lee de `resources/web/.env` o del entorno. | `publicEnv.ts`, `constants.ts`, `agentRunner.ts`, `connectivity.ts`, `webServer.ts` |
| §4.6 `next.config.js` | **Cerrado (parcial).** `typescript.ignoreBuildErrors: false`. `eslint.ignoreDuringBuilds` sigue en `true`: deuda documentada. | `next.config.js` |
| §2.9 `printer` / `escpos` | **Cerrado.** `printer@0.4.0` eliminado (no se usaba de verdad). `escpos` sí se usa: alternativa documentada, sin migrar. | `print-agent/package.json`, `electron/package.json`, `discoveryServer.ts`, `printerDrivers.ts` |
| §2.6 auto-update | **Verificado.** 0.2.0 → 0.2.1 funciona con lo publicado; nada que corregir. | `updater.ts`, `electron-builder.yml`, release `v0.2.1` |

---

## 1. §4.3 — Sandbox en toda la app

### Qué había

La vista de la web (`WebContentsView`) y la pantalla del cliente corrían con
`sandbox: false`, y `setWindowOpenHandler` forzaba `sandbox: false` en las
hijas. El motivo, documentado en el propio código: si el opener no está
sandboxed y la hija sí, Chromium las separa de proceso y
`window.open('', '_blank')` devuelve un proxy sin `document`; la web escribe
el ticket con `document.write()` y llama a `print()`, así que reimprimir no
mostraba nada.

### Qué se hizo

1. `sandbox: true` en la vista de la web (`mainWindow.ts`), en la pantalla
   del cliente (`posDisplayWindow.ts`) y en las hijas que permite
   `installExternalLinkGuards` (`about:blank` o URL interna; `nodeIntegration`
   false, `contextIsolation` true). La barra ya lo tenía desde la fase 2.
2. Se comprobó, con el mismo binario de Electron (33.4.11), que **con el opener
   sandboxed las hijas nacen sandboxed, comparten proceso y `window.open('')`
   devuelve una ventana same-origin con `document.write` y `print()`
   operativos**: `{"opened":true,"wrote":"hola","hasPrint":true,"sameOrigin":true}`
   tanto con origen `data:` como con origen `http://localhost:<puerto>` (el del
   servidor Next embebido). Es decir, la impresión del navegador funciona sin
   bajar el sandbox de nada.
3. Vía alternativa para la web, sin depender de `window.open` ni del bloqueador
   de emergentes: IPC `printing:open-preview` → `electron/src/main/printPreview.ts`
   crea una `BrowserWindow` sandboxed, **sin preload** (no tiene
   `window.goAdminDesktop`), que no puede navegar ni abrir ventanas, con el
   HTML recibido como `data:` URL (tope 1,5 M caracteres; un ticket son KB).
   Solo acepta llamadas desde webContents con URL interna
   (`isInternalUrl`) o `about:blank`. Expuesta en el preload como
   `window.goAdminDesktop.openPrintPreview(html, { title?, width?, height?,
   autoPrint?, silent?, deviceName? })` → `{ success, error? }`.
   - `autoPrint: false` (default): la página se imprime sola con su propio
     `<script>window.print(); window.close()</script>`, exactamente como hoy.
   - `autoPrint: true`: el main llama a `webContents.print({ silent, deviceName })`
     y cierra la ventana al terminar.
4. El preload de la web (`preload/index.ts`) solo usa `contextBridge` e
   `ipcRenderer`, disponibles en un preload sandboxed; el arranque confirma
   `[preload] Bridge expuesto correctamente` con `sandbox: true`.

### Qué necesita (o no) el lado web

**Nada obligatorio.** Los ~18 `window.open('', '_blank')` + `document.write`
de `src/` (10 archivos: parking `SessionReceipt.tsx` y `parkingTicketService.ts`,
`pos/pedidos-online`, `pos/cajas/ReportGenerator.tsx`,
`pos/configuracion/impresiones/ImpresionesPage.tsx`,
`transporte/envios/shipmentLabelPrinter.ts`, `lib/services/printService.ts`,
`pdfService.ts`, `lib/pos/display/openDisplay.ts`…) siguen funcionando igual.

Opcional, cuando alguien toque esos archivos: en desktop
(`window.goAdminDesktop?.openPrintPreview`) usar
`openPrintPreview(html, { width, height })` en vez de `window.open` +
`document.write`. Ventajas: no depende de que la hija comparta proceso con la
página, no hereda el preload, y con `autoPrint: true` permite imprimir sin
diálogo en una impresora concreta. El HTML puede ir tal cual (con su propio
`window.print()`).

### Cómo verificarlo

- `grep -rn "sandbox" electron/src/main` → solo `sandbox: true`.
- Arrancar la app, iniciar sesión, POS → reimprimir un ticket (o
  Configuración → Impresiones → «Imprimir prueba»): debe abrirse la ventana y
  el diálogo de impresión de Windows.
- Prueba aislada del mecanismo (sin sesión): script de Electron que crea una
  `BrowserWindow` con `sandbox: true` y un preload, carga una página
  `http://localhost:<puerto>` que hace `window.open('')` + `document.write` y
  reporta por IPC; se ejecutó con `npx electron` desde `electron/` y devolvió
  `opened:true, wrote:"hola", hasPrint:true, sameOrigin:true`.

---

## 2. §4.4 — Crash reporter que reporta

### Qué había

`crashReporter.start({ submitURL: 'https://app.goadmin.io/api/crash-report',
uploadToServer: false })`: el endpoint no existía y no se subía nada;
`uncaughtException` solo escribía en `userData/agent.log`.

### Qué se hizo (`electron/src/main/crashReporter.ts`)

- `@sentry/electron@^7.19.0` en `electron/package.json` (soporta Electron ≥ 23).
- `initCrashReporter()` se llama **antes de `app.whenReady()`** (módulo
  `index.ts`): Sentry exige inicializarse antes de `ready` y el crashReporter
  nativo debe existir antes de que nazcan procesos hijos (renderers,
  `utilityProcess` del servidor Next).
- Con DSN (`getPublicEnv().sentryDsn`, ver §3): `Sentry.init` de
  `@sentry/electron/main` con
  - `release: go-admin-desktop@<app.getVersion()>`,
    `environment: production|development` según `app.isPackaged`;
  - `ipcMode: Classic` y `getSessions: () => []`: **no se inyecta el preload de
    Sentry en ningún renderer ni se toca `session.defaultSession`**. La web ya
    lleva su Sentry (`@sentry/nextjs`); la barra y la pantalla del cliente no
    reportan;
  - `tracesSampleRate: 0`, `sendDefaultPii: false`, `beforeSend` que quita
    `server_name` y `user`;
  - su integración `SentryMinidump` arranca ella misma `crashReporter.start`
    con `uploadToServer: true` hacia el endpoint de minidumps del DSN: los
    crashes nativos (renderer, GPU, main) llegan a Sentry. Por eso **no**
    llamamos a `crashReporter.start` cuando hay DSN;
  - `uncaughtException`/`unhandledRejection`: los captura la integración de
    Sentry (nivel `fatal`) y además el handler propio los escribe en
    `agent.log`. Al haber más de un handler, Sentry no muestra su diálogo
    modal y el proceso (app de bandeja) sigue vivo, como antes.
- Sin DSN: Sentry no se inicializa (una sola línea en el log) y
  `crashReporter.start({ uploadToServer: false })` deja los minidumps en
  `app.getPath('crashDumps')` para diagnóstico manual. Documentado en el
  propio módulo.
- `require('@sentry/electron/main')` dinámico dentro de `try`: si el paquete
  faltara en una instalación rota, la app arranca sin Sentry.

### Cómo verificarlo

- Log de arranque: `[publicEnv] Variables públicas leídas de: …\resources\web\.env`
  seguido de `[crashReporter] Inicializado (Sentry activo, minidumps a Sentry)`.
  Sin DSN: `(… sin DSN: solo log local y minidumps en disco)`.
- Forzar un error: en desarrollo, desde la consola del main
  (`electron . --inspect`), `setTimeout(() => { throw new Error('prueba') })`;
  debe aparecer en Sentry con `release go-admin-desktop@0.2.1` y en
  `userData/agent.log`.
- Crash nativo: `process.crash()` en el main o `webContents.forcefullyCrashRenderer()`;
  el minidump sube al proyecto del DSN (evento «Native crash»).

---

## 3. §4.5 — Sin URL ni anon key en el asar

### Qué había

`electron/src/main/constants.ts` exportaba `SUPABASE_URL` y `SUPABASE_ANON_KEY`
cableadas; `agentRunner.ts` y `connectivity.ts` las importaban, y el agente
las recibía por `process.env`.

### Qué se hizo

- Nuevo `electron/src/main/publicEnv.ts`, **único módulo** que resuelve las
  variables públicas, una vez por proceso (`getPublicEnv()`):
  1. entorno del proceso: `NEXT_PUBLIC_SUPABASE_URL` o `SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY` o `SUPABASE_ANON_KEY`,
     `NEXT_PUBLIC_SENTRY_DSN` o `SENTRY_DSN` (clave a clave);
  2. `resources/web/.env` (el que escribe `scripts/build-web.js` con la
     allow-list `NEXT_PUBLIC_*` y viaja junto al build standalone; misma
     fuente que el servidor Next embebido, así web y agente hablan con el
     mismo proyecto);
  3. solo sin empaquetar: `.env.local` y `.env` de la raíz del repositorio.
  Solo se aceptan claves `NEXT_PUBLIC_*` de los archivos. Nunca se escriben
  valores en el log: solo la fuente y qué falta.
- `webServer.ts` usa el mismo parser (`readPublicEnvFile`) y la misma ruta
  (`getWebRoot`) en vez de duplicarlos.
- `agentRunner.ts`: `getClient()` y `primeAgentEnv()` llaman a
  `requireSupabaseEnv()`; sin valores lanzan `PublicEnvMissingError` con un
  mensaje que dice qué falta y dónde ponerlo. `tryAutoStart` **no borra el
  refresh token** en ese caso (el fallo es de la instalación, no del token).
  El agente recibe `SUPABASE_URL`/`SUPABASE_ANON_KEY` por `process.env` como
  antes (`agent/config.ts` no cambia).
- `connectivity.ts`: el health-check usa la URL de Supabase si existe; si no,
  sondea `https://app.goadmin.io/` (lo que importa es saber si hay ruta).
- `constants.ts` conserva `APP_NAME`, `WEB_APP_URL`, intervalos y puerto.

### Cómo verificarlo

- `grep -rn "supabase.co\|eyJhbGci" electron/src` → sin resultados.
- Arranque normal: `[publicEnv] Variables públicas leídas de: <ruta>\resources\web\.env`.
- Simular la falta: renombrar `resources/web/.env` (dev: y no tener `.env.local`)
  → `[publicEnv] Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (fuentes revisadas: …). El agente de impresión no podrá arrancar; la web abre igual.`
  La ventana carga la web; al vincular el agente desde la web, el IPC devuelve
  el error de `PublicEnvMissingError`.

---

## 4. §4.6 — `next.config.js`

- `typescript.ignoreBuildErrors: false`. Verificación ejecutada tres veces con
  `NODE_OPTIONS=--max-old-space-size=8192 NEXT_DIST_DIR=.next-hardening npx next build`
  (directorio de salida aparte para no chocar con otros builds; borrado
  después):
  1. **«Compiled successfully in 13.1min»** y entró en «Checking validity of
     types»; falló solo en el stub generado
     `.next-hardening/types/app/auth/verify-ux-a/page.ts` porque **otro agente
     borró/renombró `src/app/auth/verify-ux-a` durante el build** (a lo largo
     de la sesión aparecieron y desaparecieron `verify-ux-a/b/c/d/at/bt/ct`).
  2. y 3. fallaron antes, en webpack, por la misma carrera
     (`Cannot find module …/verify-ux-d/page.tsx`, `…/verify-ux-bt/page.tsx`).
  Como el build completo no es reproducible mientras haya trabajo concurrente
  en `src/app/auth`, se corrió la misma comprobación que hace Next
  (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`):
  **32 errores, todos en trabajo sin commitear de otros agentes** y ninguno en
  `electron/`, `print-agent/` ni en archivos de este cambio:
  `tester-uxm-c/backup-pre-fix/*` (20, carpeta suelta en la raíz que no debe
  commitearse), stubs `.next/types/app/auth/verify-ux-{b,bt,c,d}` de páginas ya
  borradas (8), `src/app/auth/verify-ux-at/page.tsx` (1) y
  `src/components/pos/cajas/CajasService.ts` (2, `M` en git). **Con
  `ignoreBuildErrors: false` esos errores harán fallar Vercel y `build:web`
  hasta que sus autores los corrijan**; es el comportamiento buscado, pero
  quien haga el próximo despliegue debe saberlo. Repetir el `next build` con el
  árbol quieto para dejar la evidencia final.
  - Aviso para quien lo repita: `next build` **reescribe `tsconfig.json`**
    (añade `<dist>/types/**/*.ts` a `include` y reformatea). Se restauró con
    `git checkout -- tsconfig.json` tras cada intento. Con `NEXT_DIST_DIR=.next`
    o `.next-desktop` no pasa porque ya están en `include`.
- `eslint.ignoreDuringBuilds: true` se queda, con comentario honesto en el
  archivo: `npm run lint` no está verde (miles de
  `@typescript-eslint/no-explicit-any` preexistentes). **Deuda**: cuando el
  lint quede en 0, pasar a `false`. Mientras, cada archivo tocado queda limpio
  (regla de `CLAUDE.md`).
- Vercel: `output: 'standalone'` y `preloadEntriesOnStart` siguen condicionados
  a `NEXT_DIST_DIR`, así que el despliegue no cambia de forma; solo pasa a
  fallar si hay errores de tipos, que es lo que se busca.

---

## 5. §2.9 — Dependencias

### `printer@0.4.0` → eliminado

- `grep` en `print-agent/src`: dos usos, ambos `try { require('printer') }`
  con fallback (listar impresoras por PowerShell `Win32_Printer`; texto plano
  por `printDirect`). El paquete es nativo, abandonado en 2016, y **no
  compila contra Node 20 / Electron 33**: no estaba instalado en ningún
  `node_modules` (`optionalDependency` que siempre fallaba), así que el
  fallback era el único camino que se ejecutaba.
- Se quitó de `optionalDependencies` en `print-agent/package.json` y
  `electron/package.json` (`npm install` en ambos actualizó los lock;
  `"node_modules/printer"` ya no aparece). `discoveryServer.ts` lista
  impresoras directamente con PowerShell; `printViaSystem` (agente standalone
  sin Electron) cae a texto plano por el spooler RAW
  (`transports/rawSpooler.sendRawToPrinter`) en lugar de a un módulo que no
  existía. Espejo regenerado con `npm run sync:agent`.

### `escpos@3.0.0-alpha.6` → se usa de verdad; documentado, no migrado

- Usos reales: `printing/escposBuffer.ts` (`escpos.Printer` sobre un adaptador
  propio que acumula bytes: es el **generador de comandos ESC/POS** de todos los
  tickets) y `printerDrivers.ts` (`escpos.Network` para impresión y cajón por
  red; `escpos.Bluetooth` opcional).
- Alternativa mantenida: **`node-thermal-printer`** (activa, TypeScript,
  `getBuffer()` para obtener los bytes sin dispositivo, perfiles EPSON/STAR,
  tablas de códigos) cubre lo que hoy hace `escpos.Printer` +
  `BufferAdapter`. Para red ya existe `transports/networkSocket.ts` propio
  (sustituyó a `escpos-network` en el camino de texto por los falsos
  positivos de su `close()`); quedarían por mover los dos usos de
  `escpos.Network` en `printerDrivers.ts`. Bluetooth por MAC seguiría
  necesitando un módulo nativo (`escpos-bluetooth`/`bluetooth-serial-port`),
  hoy ya opcional.
- Plan sugerido (no hecho): 1) `escposBuffer.ts` → `node-thermal-printer`
  con `getBuffer()` y comparar byte a byte los tickets de prueba de
  `printing/`; 2) `escpos.Network` → `networkSocket.ts`; 3) retirar `escpos`,
  `escpos-network` y `escpos-bluetooth`. Riesgo: cambios sutiles de encoding
  (`CP858`, tabla 19) y de corte; por eso no se migra en un hardening.

`npm ci` sigue funcionando en `print-agent/` y `electron/` (lock
actualizados en este cambio).

---

## 6. §2.6 — Auto-update: 0.2.0 → 0.2.1

Revisado `electron/src/main/updater.ts` contra lo publicado:

- `app-update.yml` del paquete (`release/win-unpacked/resources/`):
  `provider: github`, `owner: Palomo-dev`, `repo: go-admin-erp`,
  `releaseType: release`, `updaterCacheDirName: go-admin-desktop-updater`,
  **sin `publisherName`** → electron-updater no verifica firma (coherente
  con `verifyUpdateCodeSignature: false` de `electron-builder.yml`, necesario
  mientras el .exe salga sin firmar).
- `gh release view v0.2.1 --json assets`: `GoAdminERP-Setup-0.2.1.exe`
  (137 091 762 B), `.blockmap`, `latest.yml`, más una copia sin versión
  `GoAdminERP-Setup.exe` (inofensiva). No es draft ni prerelease.
- `latest.yml` de `v0.2.1`: `version: 0.2.1`, `path/url:
  GoAdminERP-Setup-0.2.1.exe`, `sha512` y `size` coinciden con el asset.
- Feed `https://github.com/Palomo-dev/go-admin-erp/releases.atom`: primera
  entrada `v0.2.1`, luego `v0.2.0`, `v0.1.2`, `v0.1.1` (todas tags semver
  del desktop; ninguna tag ajena que confunda al provider).
- `https://github.com/Palomo-dev/go-admin-erp/releases/download/v0.2.1/latest.yml`
  responde 200 sin token (repo público).
- `updater.ts`: `autoDownload = false` + descarga explícita en
  `update-available`, `autoInstallOnAppQuit = true`, comprobación al arrancar
  y cada 6 h, estados difundidos a la barra y a la web. Con `0.2.0 < 0.2.1`
  el flujo llega a `downloaded` y «Reiniciar e instalar».
- Instalación: 0.2.0 y 0.2.1 son `perMachine: false` / `asInvoker`; el
  `.blockmap` habilita la descarga diferencial.

**Conclusión: una instalación 0.2.0 encuentra e instala la 0.2.1. Nada que
cambiar.** Deuda que sigue abierta (auditoría §2.1): sin firma de código,
SmartScreen avisa en la primera instalación (no en las actualizaciones
silenciosas de electron-updater).

---

## 7. Verificación ejecutada

```
cd print-agent && npx tsc -p . --noEmit            # 0 errores
cd electron    && npx tsc -p . --noEmit            # 0 errores
cd electron    && npm run build                    # sync:agent + tsc + copy:renderer OK
cd electron    && npm install / cd print-agent && npm install   # lock sin printer, con @sentry/electron
NODE_OPTIONS=--max-old-space-size=8192 NEXT_DIST_DIR=.next-hardening npx next build
                                                   # 1/3: «Compiled successfully», tipos rotos solo por una página
                                                   # borrada por otro agente a mitad; 2/3 y 3/3: misma carrera (§4)
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
                                                   # 32 errores, todos en WIP ajeno (§4); 0 en esta zona
```

Arranque real, 60 s, con `--user-data-dir` aparte y `GOADMIN_DESKTOP_LOCAL_WEB=1`
(servidor Next embebido desde `electron/resources/web`), cerrado por PID:

```
[publicEnv] Variables públicas leídas de: …\electron\resources\web\.env
[crashReporter] Inicializado (Sentry activo, minidumps a Sentry)
[web]  ✓ Ready in 8s
[webServer] Servidor Next listo en http://localhost:47800
[updater] Desactivado en desarrollo (app sin empaquetar)
[web] 🔍 [MIDDLEWARE] handleRouteProtection: { pathname: '/auth/login', … }
INFO:CONSOLE "[preload] Bridge expuesto correctamente"      ← preload con sandbox: true
```

Sin errores del main. (Ruido conocido: avisos de DevTools en desarrollo y el
`CacheStorage` del service worker sobre un perfil matado a la fuerza.)

## 8. Deuda restante

- `eslint.ignoreDuringBuilds: true` hasta que el lint esté en 0 (§4.6).
- Migrar `escpos` a `node-thermal-printer` + `networkSocket.ts` (§2.9).
- Firma de código (§2.1): sigue siendo el bloqueante comercial; el updater ya
  está preparado para `publisherName` + `verifyUpdateCodeSignature: true`.
- Lado web, opcional: adoptar `openPrintPreview` en los puntos que hoy usan
  `window.open('') + document.write` (§1).
- El `.env.example` de la raíz sigue siendo la única documentación de
  `NEXT_PUBLIC_SENTRY_DSN`; `build-web.js` ya lo incluye en la allow-list, así
  que basta con tenerlo definido al construir el paquete.
