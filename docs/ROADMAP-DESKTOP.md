# Roadmap Go Admin Desktop

Basado en `docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md`.
Decisiones tomadas: offline vía **servidor Next embebido**, y **POS local-first** como objetivo real.

| Fase | Contenido | Esfuerzo | Estado |
|---|---|---|---|
| 0 | Quick wins y bugs críticos | 2-3 días | **Hecha** |
| 1 | Instalador + firma de código | 3-5 días | Pendiente |
| 2 | UI nativa | 4-6 días | Pendiente |
| 3 | Offline real: Next embebido en 127.0.0.1 | 1-2 semanas | Pendiente |
| 4 | POS local-first + impresión local | 6-10 semanas | Pendiente |

Las fases 1, 2 y 3 son independientes entre sí y se pueden llevar en paralelo.
La fase 4 depende de la 3.

---

## Fase 0 — Quick wins (HECHA)

- `windows/mainWindow.ts` reescrito: `prepareQuit()` exportado, `will-navigate` que bloquea la
  navegación fuera de `app.goadmin.io` (antes cualquier dominio externo heredaba el bridge),
  zoom por defecto 1.0 persistido en `window-state.json` con `Ctrl+0` → 100 %, `F5`/`Ctrl+R` para
  recargar, validación de la posición guardada contra los monitores conectados, splash con marca, y
  **eliminado el "app shell" servido como `data:` URL** (origen opaco: nunca pudo funcionar) a favor
  de una pantalla offline honesta con reintento.
- `main/connectivity.ts` nuevo: health-check real contra `${SUPABASE_URL}/rest/v1/` cada 15 s con
  histéresis (2 fallos → offline, 1 éxito → online), en lugar de `navigator.onLine`. Se emite por
  IPC (`connectivity:state`) y se expone en el bridge como `isOnline()`, `checkConnectivity()` y
  `onConnectivity(cb)`. La ventana se recarga sola cuando vuelve la conexión de verdad.
- `main/index.ts`: llama `prepareQuit()` en `before-quit` — **"Salir" del tray ahora cierra la app**
  (antes `close` hacía `preventDefault()` y Electron cancelaba el quit).
- `main/tray.ts`: el `setInterval` de refresco se guarda y se limpia en `destroyTray()`.
- Eliminados `main/offlineCache.ts` y `main/offlineManager.ts` (código muerto: `initOfflineCache()`
  no se llamaba desde ningún sitio y `goadmin-cache://` nunca se usó).
- `src/lib/utils/desktop.ts`: tipos del bridge actualizados.

`npx tsc -p .` en `electron/` compila sin errores.

**Pendiente de la fase 0 (lado web, requiere probar la app):** que `src/lib/supabase/config.ts`,
`src/lib/utils/offlineCache.ts` y `OfflineIndicator.tsx` usen `window.goAdminDesktop.isOnline()` /
`onConnectivity()` en vez de `navigator.onLine`, y que se elimine el banner duplicado.

---

## Fase 1 — Instalador y firma de código

**Arrancar hoy el trámite del certificado: tarda días y bloquea todo lo demás del instalador.**

### Prompt listo para pegar

```
Trabaja en electron/ del repo go-admin-erp. Lee primero
docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md sección 2.

Objetivo: dejar el instalador de Windows listo para distribuir a clientes.

1. electron/electron-builder.yml:
   - artifactName: GoAdminERP-Setup-${version}.${ext} (hoy no lleva versión y todos los
     releases de GitHub se pisan entre sí).
   - Congelar nsis.perMachine: false + win.requestedExecutionLevel: asInvoker. El build 0.1.2
     publicado se generó con perMachine: true + requireAdministrator (ver
     electron/release/builder-effective-config.yaml), así que los clientes que ya lo tengan
     instalado no pueden actualizar limpio. Añadir en el NSIS una comprobación que detecte la
     instalación per-machine anterior (clave de registro de la desinstalación de electron-builder)
     y la desinstale antes de continuar.
   - Quitar "node_modules/**/*" del bloque files: desactiva el filtrado automático de
     devDependencies de electron-builder. Verificar el resultado con `npx asar list app.asar`.
   - Mover publish a un repo de releases separado y público (por ejemplo
     Palomo-dev/go-admin-desktop-releases) o a provider: generic sobre Supabase Storage / R2.
     Hoy apunta al repo de código; si es privado, electron-updater no puede descargar y no se
     puede embeber un token en el .exe.
   - Añadir la configuración de firma (certificado o Azure Trusted Signing) leyendo las
     credenciales de variables de entorno, nunca de archivos en el repo.

2. electron/build/installer.nsh:
   - El icono de los accesos directos apunta a $INSTDIR\resources\build\icon.ico, ruta que NO
     existe (comprobado en release/win-unpacked/resources/: solo app.asar, app-update.yml y
     elevate.exe). Usar el propio ejecutable como fuente del icono:
     CreateShortCut "$DESKTOP\Go Admin ERP.lnk" "$INSTDIR\Go Admin ERP.exe" "" "$INSTDIR\Go Admin ERP.exe" 0
   - Añadir la Section un. que borre los accesos directos creados a mano (hoy quedan huérfanos
     al desinstalar, porque electron-builder no los registra).
   - Sustituir el "Page custom ShowOptionsPage LeaveOptionsPage" suelto por las macros soportadas
     de electron-builder (customPageAfterChangeDir / customInstall / customUnInstall). Declarar
     páginas en un .nsh incluido es frágil y puede colocarlas en orden incorrecto.

3. Nuevo .github/workflows/desktop-release.yml:
   - Se dispara con tags v*. Corre en windows-latest.
   - Buildea print-agent, luego electron (npm run package), firma con los secrets del repo y
     publica el .exe, el .blockmap y latest.yml en el repo de releases.

No toques el código del proceso main en esta tarea. Al terminar, ejecuta
`cd electron && npm run package:dir` y confirma que resources/app.asar.unpacked/build/icon.ico
existe en la salida.
```

---

## Fase 2 — UI nativa

### Prompt listo para pegar

```
Trabaja en electron/src/main/ del repo go-admin-erp. Lee primero
docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md sección 3. La fase 0 ya está aplicada:
mainWindow.ts tiene zoom persistido, will-navigate, validación de monitores y pantalla offline.

Objetivo: que la app deje de parecer un navegador sin barra.

1. Barra de aplicación propia (BrowserView o ventana con titleBarStyle: 'hidden' +
   titleBarOverlay en Windows) con: atrás, adelante, recargar, inicio, indicador de conexión
   (suscrito a 'connectivity:state', que ya emite main/connectivity.ts) e indicador de
   actualización disponible (estado de main/updater.ts, que ya se emite por 'update:state').
   Los controles de ventana deben seguir siendo los nativos de Windows.

2. Menú de aplicación en español con Menu.setApplicationMenu(), o Menu.setApplicationMenu(null)
   si la barra propia ya cubre todo. Hoy se ve el menú por defecto de Electron en inglés al
   pulsar Alt.

3. Sincronizar el tema con nativeTheme: backgroundColor de la ventana y colores de la barra
   propia deben seguir el modo claro/oscuro del sistema, y reaccionar a
   nativeTheme.on('updated').

4. UI nativa de actualización: cuando updater.ts llegue a status 'downloaded', mostrar un aviso
   en la barra con un botón "Reiniciar e instalar" que llame al IPC 'update:install'.

5. En el lado web, src/components/app-layout/OfflineIndicator.tsx debe ser la ÚNICA fuente del
   banner offline y debe usar window.goAdminDesktop.onConnectivity() / isOnline() en vez de
   navigator.onLine. Añadirle la hora de la última sincronización correcta.

Verifica con `cd electron && npm run dev` en 1366x768 y en 1920x1080, y comprueba que el texto
se lee bien sin tocar el zoom.
```

---

## Fase 3 — Offline real: servidor Next embebido

Esta es la que hace que la app **abra y navegue sin internet**.

### Prompt listo para pegar

```
Trabaja en el repo go-admin-erp. Lee primero
docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md secciones 1 y 5 (opción B2).

Contexto: hoy electron/src/main/windows/mainWindow.ts carga https://app.goadmin.io. Como la web
es Next.js 15 App Router con middleware, cada navegación es una petición al servidor, así que sin
internet no hay a dónde navegar por muchos datos cacheados que haya.

Objetivo: embeber el servidor de Next dentro del .exe y que la ventana cargue
http://127.0.0.1:<puerto libre>.

1. Añadir un script de build que produzca el standalone de Next (output: 'standalone' en
   next.config.js) y lo copie a electron/resources/web/ como extraResource de electron-builder.
   No meterlo en el asar: Next necesita leer archivos reales del disco.

2. Nuevo electron/src/main/webServer.ts: arranca el servidor de Next en un puerto libre de
   127.0.0.1 como child_process (fork del server.js del standalone), con las variables de entorno
   NEXT_PUBLIC_* necesarias. Debe exponer start(), stop() y getUrl(), reintentar si el puerto está
   ocupado, y emitir un evento cuando el servidor responda al primer request.

3. mainWindow.getLoadUrl() debe devolver la URL local cuando app.isPackaged. Actualizar
   isInternalUrl() para aceptar 127.0.0.1 además de app.goadmin.io, y el setWindowOpenHandler
   igual. El will-navigate debe seguir bloqueando todo lo demás.

4. index.ts: arrancar el servidor ANTES de crear la ventana; el splash se mantiene visible
   mientras tanto. Pararlo en before-quit (ya existe el hook con prepareQuit()).

5. Auth en desktop: el middleware sigue corriendo, así que no hay que tocarlo, pero las llamadas
   de src/lib/supabase/config.ts a Supabase siguen necesitando internet. Verificar que con el
   servidor local arriba y sin internet la app carga, navega entre rutas, y muestra la UI con los
   datos cacheados de IndexedDB (esto último ya funciona: el origen deja de ser opaco y por fin es
   estable).

6. El instalador crece a ~200-250 MB. Confirmar que las actualizaciones diferenciales
   (.blockmap) siguen funcionando.

Criterio de aceptación: apagar el WiFi, abrir la app, y poder navegar entre /app/pos,
/app/inventario y /app/crm viendo los datos que se visitaron con conexión.
```

---

## Fase 4 — POS local-first

Es lo único que permite vender e imprimir sin internet sin perder nada.
Depende de la fase 3.

### Prompt listo para pegar

```
Trabaja en el repo go-admin-erp. Lee primero
docs/AUDITORIA-DESKTOP-OFFLINE-UI-INSTALADOR.md secciones 1.7, 1.8 y 5 (opción C).
Prerequisito: la fase 3 (servidor Next embebido) debe estar terminada.

Problemas a resolver:
- El POS inserta los tickets en la tabla print_jobs de Supabase y el agente los lee de ahí
  (electron/src/main/agentRunner.ts). Sin internet no sale el recibo, aunque el camino local ya
  existe y funciona: IPC 'printing:print-raw' -> discovery server /print -> printToDevice().
- src/lib/utils/offlineCache.ts encola peticiones HTTP sueltas, no operaciones de negocio.
  config.ts devuelve 202 con data: null, así que la UI no recibe el id de la fila creada y
  cualquier flujo encadenado (venta -> líneas -> pagos) se rompe en el segundo paso. Y a los 5
  reintentos syncQueue() borra la acción en silencio: venta perdida sin aviso.

Alcance: SOLO POS + impresión. El resto de módulos queda en modo solo-lectura cacheada con aviso
explícito.

1. Impresión local primero: en desktop, src/lib/services/printJobsService.ts debe llamar
   window.goAdminDesktop.printRaw() directamente. print_jobs pasa a ser el registro de auditoría,
   que se sincroniza después y nunca bloquea la impresión.
   [HECHO 2026-09-15 — ver docs/desktop/IMPRESION-LOCAL-DESKTOP.md]

2. Base de datos local en el proceso main: better-sqlite3 expuesto por IPC (o PGlite en el
   renderer si prefieres SQL idéntico al de Postgres). Esquema mínimo: sales, sale_items,
   payments, inventory_movements, cash_sessions, y el catálogo de productos/precios replicado.

3. IDs UUID v7 generados en cliente para toda operación de venta. Esto da idempotencia natural:
   reenviar el mismo sobre dos veces no duplica nada.

4. Outbox por operación de negocio, no por petición HTTP. Una venta es un sobre atómico
   (cabecera + líneas + pagos + movimientos de inventario) que se sincroniza entero vía una RPC
   de Postgres transaccional, o no se sincroniza.

5. NUNCA borrar una operación tras N reintentos. Moverla a una bandeja "requiere revisión"
   visible para el administrador, con el error y el payload completo.

6. Replicación del catálogo al iniciar sesión y en background: productos, precios, impuestos,
   categorías, clientes frecuentes, métodos de pago, sucursal y configuración de impresoras.

7. UI: estado claro de "operando sin conexión — N ventas pendientes de sincronizar", con detalle.

Criterio de aceptación: apagar el WiFi, hacer 10 ventas con impresión de ticket, cerrar la app,
volver a abrirla todavía sin internet (las ventas deben seguir ahí), encender el WiFi y verificar
que las 10 ventas llegan a Supabase exactamente una vez.
```
