# Go Admin Desktop — Fase 2: UI nativa

Estado: **hecha en el árbol de trabajo (sin commit), 2026-09-15.**
Origen: `docs/ROADMAP-DESKTOP.md` §Fase 2 y `docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md` §3
(puntos 3.2, 3.4, 3.5, 3.7 y 3.9).

Objetivo: que la app deje de parecer un navegador sin barra. Todo lo de esta fase vive en
`electron/` salvo el punto 5 (lado web).

---

## 1. Qué se entrega

| Punto del roadmap | Estado | Dónde |
|---|---|---|
| 1. Barra de aplicación propia (atrás, adelante, recargar, inicio, conexión, actualización) con controles de ventana nativos | Hecho | `electron/src/renderer/toolbar/{index.html,toolbar.css,toolbar.ts}`, `electron/src/preload/toolbar.ts`, `electron/src/main/toolbarIpc.ts`, `electron/src/main/windows/mainWindow.ts` |
| 2. Menú de aplicación en español (`Menu.setApplicationMenu`) | Hecho | `electron/src/main/menu.ts` (se instala en `index.ts`) |
| 3. Tema por `nativeTheme` (fondo de ventana, overlay nativo y barra), sin flash `#1e3a8a` | Hecho | `electron/src/main/theme.ts` |
| 4. UI nativa de actualización: «Reiniciar e instalar» al llegar `update:state` a `downloaded` → `update:install` | Hecho | `toolbar.ts` (`renderUpdate`), `updater.ts` (difunde por `broadcast`) |
| 5. `OfflineIndicator.tsx` única fuente del banner, con `window.goAdminDesktop.onConnectivity()/isOnline()` y hora de la última sincronización correcta | Hecho | `src/components/app-layout/OfflineIndicator.tsx`, `src/lib/utils/offlineCache.ts`, `src/lib/utils/desktop.ts`, `src/lib/supabase/config.ts` |

### 1.1 Arquitectura de la ventana

```
BrowserWindow (titleBarStyle: 'hidden' + titleBarOverlay {color, symbolColor, height: 40})
├─ webContents propio  → dist/renderer/toolbar/index.html   (la BARRA, preload/toolbar.js, sandbox: true)
└─ WebContentsView     → https://app.goadmin.io             (la WEB,   preload/index.js, bounds y=40, sandbox: true desde 2026-09-21)
```

- Los botones minimizar/maximizar/cerrar los dibuja Windows (Window Controls Overlay). La barra
  ocupa `env(titlebar-area-width)` para no pisarlos y es zona de arrastre (`app-region: drag`),
  con los controles excluidos.
- Se descartó `BrowserView` (deprecado en Electron 30+) y meter la barra dentro de la web: la barra
  tiene que existir precisamente cuando la web no carga («recargar» e «inicio»).
- `main/broadcast.ts` envía cada estado (`connectivity:state`, `update:state`, `theme:state`,
  `toolbar:nav-state`) a **todos** los renderers. Antes `win.webContents.send` llegaba solo a uno,
  y desde esta fase `win.webContents` es la barra, no la web.
- `getWebContents()` (web) y `getToolbarWebContents()` (barra) están separados; `index.ts` y
  `ipc.ts` usan el primero para `deep-link`, `agent:autostarted`, etc.

### 1.2 Seguridad de la barra

- Preload distinto (`preload/toolbar.ts`, `window.goAdminToolbar`): expone navegación, menú y
  suscripciones de estado. **No** expone nada del agente de impresión ni de configuración.
- Todos los canales `toolbar:*` comprueban en main que el remitente es el `webContents` de la
  barra (`toolbarIpc.ts` → `isFromToolbar`). Una llamada desde otro renderer se rechaza y se
  registra.
- CSP de la barra: `default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:`.
  `will-navigate` bloqueado y `setWindowOpenHandler` → `deny`.
- `scripts/copy-renderer.js` copia HTML/CSS a `dist/renderer` (tsc solo emite `.ts`);
  `npm run build` y `npm run dev` lo ejecutan. `tsconfig.json` lleva
  `moduleDetection: "legacy"` para que `toolbar.ts` (script clásico sin `import`) compile con
  CSP `script-src 'self'`.

### 1.3 Menú en español

`menu.ts`: Aplicación (Inicio `Alt+Inicio`, Recargar `Ctrl+R`/`F5`, Comprobar conexión, Salir
`Ctrl+Q`) · Edición (roles nativos) · Navegación (Atrás `Alt+←`, Adelante `Alt+→`) · Ver (zoom
`Ctrl+±`, `Ctrl+0` = 100 %, pantalla completa, DevTools solo en desarrollo) · Ayuda (Buscar
actualizaciones, Ver registro, Acerca de). Con la barra oculta el menú sigue instalado por los
aceleradores, y el botón «⋯» de la barra lo abre como popup (`toolbar:menu`).

### 1.4 Tema

`theme.ts`: `LIGHT {background #f8fafc, bar #ffffff, symbol #0f172a}` /
`DARK {background #0f172a, bar #0b1220, symbol #e2e8f0}`. `applyTheme()` fija
`win.setBackgroundColor`, `win.setTitleBarOverlay` y difunde `theme:state`; `watchTheme()` se
suscribe una vez a `nativeTheme.on('updated')`. El splash y la pantalla offline usan los mismos
colores (`prefers-color-scheme` deriva de `nativeTheme`). El `#1e3a8a` desapareció.

### 1.5 Lado web (punto 5)

- `src/lib/utils/desktop.ts`: `onDesktopConnectivity(cb)` (fan-out: el preload solo admite un
  listener porque `onConnectivity` hace `removeAllListeners`) y `desktopReportsConnectivity()`.
- `src/lib/utils/offlineCache.ts`: en Desktop el estado `isOnline` lo alimenta **solo** el
  bridge (`isOnline()` inicial + `onConnectivity`); `isAppOnline()` y el TTL de
  `getCachedResponse` ya no leen `navigator.onLine` en Desktop. Nuevo `markSynced()` /
  `getLastSyncAt()` (persistido en `localStorage` con límite de 1 escritura/5 s, evento
  `goadmin:last-sync`): se marca al cachear una respuesta fresca del servidor y al vaciar la cola
  offline.
- `src/lib/supabase/config.ts`: `useOfflineLogic` usa `isAppOnline()` en Desktop.
- `src/components/app-layout/OfflineIndicator.tsx`: única fuente del banner (el
  `offlineManager.ts` de Electron se retiró en la fase 0). En Desktop: estado inicial por
  `isOnline()`, cambios por `onConnectivity`; móvil: plugin Network; Desktop antiguo sin bridge:
  eventos `online`/`offline`. Muestra «Última sincronización correcta: HH:mm» (fecha y hora si no
  fue hoy) en la zona horaria de la organización (`useFormatDate`). `role="status"`,
  `aria-live="polite"`.

---

## 2. Verificación

Entorno: Windows 11, pantalla 1920x1080 @1x (área útil 1920x1032), Electron de `electron/`,
web remota `https://app.goadmin.io` (`DEV_URL`), sin sesión (pantalla de login).

| Comprobación | Resultado |
|---|---|
| `cd electron && npx tsc -p .` | Limpio (0 errores) |
| `cd electron && npm run build` | OK: `sync-agent`, `tsc`, `copy-renderer` → `dist/renderer/toolbar/{index.html,toolbar.css,toolbar.js}` |
| `npx electron .` con `GOADMIN_UI_CAPTURE` | Arranca, la barra pinta con estado inicial (`toolbar:init`), capturas abajo, `GOADMIN_UI_CAPTURE_QUIT=1` cierra la app; sin procesos `electron` residuales |
| 1366x768 claro | `docs/desktop/evidencia/fase-2/light-1366x768.png` — barra 40 px, texto legible sin tocar el zoom, controles nativos a la derecha |
| 1920x1080 oscuro | `docs/desktop/evidencia/fase-2/dark-1920x1080.png` — la ventana queda en 1920x1032 (área útil); overlay nativo con símbolos claros |
| Indicador offline < 40 s | Con `GOADMIN_HEALTHCHECK_URL=http://127.0.0.1:9/` (puerto cerrado): **OFFLINE detectado a los 15 913 ms del arranque** (2 fallos × 15 s de intervalo, con el primer sondeo inmediato). Pill «Sin conexión» en rojo: `docs/desktop/evidencia/fase-2/offline-1366x768.png` |
| `npx jest src/components/app-layout src/lib/utils src/__tests__/guardrails.test.ts` | 3 suites, **102 tests verdes**, 0 rojos |
| `npx eslint` sobre `OfflineIndicator.tsx`, `offlineCache.ts`, `desktop.ts` | Limpio |

Registro literal de la prueba offline (`reporte.txt` de `devCapture`):

```
Pantalla: 1920x1080 @1x, área útil 1920x1032
Health-check forzado a http://127.0.0.1:9/; esperando OFFLINE…
OFFLINE detectado a los 15913 ms del arranque
```

Cómo reproducirlo:

```powershell
cd electron
npm run build
$env:GOADMIN_UI_CAPTURE = "$env:TEMP\goadmin-ui"     # carpeta de salida
$env:GOADMIN_UI_CAPTURE_QUIT = "1"                    # cerrar al terminar
$env:DEV_URL = "https://app.goadmin.io"               # o el Next local en :3000
npx electron .                                        # capturas claro/oscuro 1366x768 y 1920x1080
$env:GOADMIN_HEALTHCHECK_URL = "http://127.0.0.1:9/"  # simular caída del servidor
npx electron .                                        # espera OFFLINE y captura la barra
```

`devCapture.ts` solo actúa en desarrollo (`app.isPackaged` → no hace nada). En modo captura no se
abren las DevTools (taparían la ventana). Si `desktopCapturer` no lista la ventana (pasa en
Windows: el id de `getMediaSourceId()` lleva sufijo `:1` y el de `desktopCapturer` `:0`), se
recorta la captura de pantalla a los límites de la ventana; como último recurso guarda barra y web
por separado.

### 2.1 Lo que NO se pudo verificar aquí

- El banner web (`OfflineIndicator.tsx`) con la hora de última sincronización solo se ve con la web
  desplegada o con `next dev` local: la web remota de producción aún no lleva estos cambios y la
  captura offline muestra la pantalla de login (sin `AppLayout`). Los tests de `src/lib/utils` y
  `guardrails` pasan; falta la prueba visual tras el despliegue.
- El estado `downloaded` del updater no se puede forzar sin un release publicado; la lógica de la
  barra (`renderUpdate` → botón «Reiniciar e instalar» → `update:install`) está cableada y el
  handler `update:install` de `ipc.ts` es el mismo que ya usaba la web.
- `npx next build` no se ejecutó en esta ronda: la máquina tenía en paralelo otro `next build` y
  varios `tsc` de la fase 3. Los cambios web son 4 archivos con lint limpio y tests verdes.

---

## 3. Cambios respecto a lo que había en el árbol al retomar

El agente anterior dejó hechos la barra, el menú, el tema, `toolbarIpc`, `broadcast`,
`devCapture`, `copy-renderer` y la reestructuración de `mainWindow.ts`/`index.ts`. En esta
ronda se añadió:

- `electron/src/main/devCapture.ts`: captura real de la ventana compuesta (recorte de pantalla
  cuando `desktopCapturer` no encuentra la ventana; antes solo guardaba barra y web por separado) y
  traer la ventana al frente antes de capturar.
- `electron/src/main/windows/mainWindow.ts`: no abrir DevTools en modo captura (una sola línea;
  no se tocaron `getLoadUrl`, `isInternalUrl`, `setWindowOpenHandler` ni el arranque del servidor,
  que son de la fase 3).
- Lado web completo (punto 5): `desktop.ts`, `offlineCache.ts`, `config.ts`,
  `OfflineIndicator.tsx`.

Fuera de alcance y sin tocar: `electron/src/agent/**` (sincronizado desde `print-agent/`),
`webServer.ts`, `build-web.js`, `electron-builder.yml` (fase 3).

---

## 4. Pendientes que deja esta fase

- Probar visualmente el banner web en Desktop con la web desplegada (o `DEV_URL=http://localhost:3000`
  con `next dev`): texto, hora de última sincronización y botón «Sincronizar».
- Mejorar `preload/index.ts` para que `onConnectivity`/`onUpdateState` admitan varios listeners y
  devuelvan la baja (hoy la web lo resuelve con el fan-out de `desktop.ts`; los Desktop antiguos
  seguirán con el preload viejo, así que el fan-out debe quedarse).
- Accesibilidad de la barra: los botones tienen `aria-label`/`title` y foco visible; falta probar
  con lector de pantalla y navegación por teclado entre barra y web (`Ctrl+L`-style para saltar a
  la web no existe).
- Actualizar la tabla de `docs/ROADMAP-DESKTOP.md` (fila «2 · UI nativa» → Hecha) y retirar el
  «Pendiente de la fase 0 (lado web)» cuando esto se commitee.
