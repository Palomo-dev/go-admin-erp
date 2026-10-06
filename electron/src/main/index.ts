import { app, session, systemPreferences } from 'electron';
import {
  createMainWindow,
  getLoadUrl,
  getMainWindow,
  getWebContents,
  createSplashWindow,
  closeSplash,
  prepareQuit,
  reloadCurrent,
} from './windows/mainWindow';
import { installPermissionHandlers, resolveAllowedOrigins } from './permissions';
import { WEB_APP_URL } from './constants';
import { createTray, destroyTray } from './tray';
import { getUpdateState, initUpdater, stopUpdater } from './updater';
import { registerIpcHandlers } from './ipc';
import { registerToolbarIpc } from './toolbarIpc';
import { registerPosDisplayIpc } from './posDisplayIpc';
import { registerScaleIpc, shutdownScale } from './scale/scaleIpc';
import { initPosDisplay, shutdownPosDisplay } from './windows/posDisplayWindow';
import { installAppMenu } from './menu';
import { initDevCapture } from './devCapture';
import { tryAutoStart, stopAgent, markOffline } from './agentRunner';
import { wasOpenedHidden } from './autostart';
import { appendLog, flushLog, initCrashReporter } from './crashReporter';
import { initConnectivity, stopConnectivity } from './connectivity';
import { webServer } from './webServer';
import { initTheme } from './theme';
import { decidirSegundaInstancia, ejecutarCierre, lineaArranque, registrarCicloDeVida } from './lifecycle';

let quitting = false;
/** Una segunda instancia llegó antes de que existiera la ventana: mostrarla al crearla. */
let mostrarAlCrear = false;
/** Una segunda instancia llegó mientras la app salía: relanzar al terminar. */
let relanzarProgramado = false;

/** Tope de toda la limpieza de `before-quit` (ver lifecycle.ts, punto 1). */
const LIMITE_CIERRE_MS = 10_000;

// Setear icono de la app antes de que se cree cualquier ventana
app.on('ready', () => {
  app.setAppUserModelId('io.goadmin.desktop');
  // Registrar protocolo goadmin:// para deep links
  if (!app.isDefaultProtocolClient('goadmin')) {
    app.setAsDefaultProtocolClient('goadmin');
  }
});

// Manejar deep links goadmin://accion/parametro
app.on('open-url', (_event, url) => {
  const win = getMainWindow();
  if (win) {
    win.show();
    win.focus();
    // La web vive en el WebContentsView, no en win.webContents (que es la barra).
    getWebContents()?.send('deep-link', url);
  }
});

const gotLock = app.requestSingleInstanceLock();
// Primera línea de cada arranque en agent.log (también en la instancia que
// sale por no obtener el bloqueo: es la pista de «se abre y se cierra»).
appendLog(
  lineaArranque({ version: app.getVersion(), pid: process.pid, argv: process.argv, empaquetada: app.isPackaged, bloqueo: gotLock }),
);
if (!gotLock) {
  flushLog();
  app.quit();
} else {
  registrarCicloDeVida(app, appendLog);

  app.on('second-instance', () => {
    const win = getMainWindow();
    const accion = decidirSegundaInstancia({
      hayVentana: !!win && !win.isDestroyed(),
      saliendo: quitting,
      actualizacionPendiente: getUpdateState().status === 'downloaded',
    });
    appendLog(`[app] second-instance: se abrió otra vez la app → ${accion}`);
    switch (accion) {
      case 'mostrar':
        if (win!.isMinimized()) win!.restore();
        win!.show();
        win!.focus();
        break;
      case 'mostrarAlCrear':
        mostrarAlCrear = true;
        break;
      case 'relanzarTrasSalir':
        // No se resucita una ventana que está a punto de cerrarse: la app
        // vuelve a abrirse sola en cuanto este proceso suelte el bloqueo.
        if (!relanzarProgramado) {
          relanzarProgramado = true;
          // Sin `--hidden`: si esta instancia fue la de autoarranque, la
          // relanzada debe verse (la pidió alguien con doble clic).
          app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--hidden') });
        }
        break;
      case 'esperarInstalacion':
        // El instalador de la actualización cierra cualquier instancia; la
        // nueva versión se abre desde el acceso directo cuando termine.
        break;
    }
  });

  // Informe de errores ANTES de `ready` (y solo en la instancia que se queda):
  // Sentry exige inicializarse antes de `ready` y el crashReporter nativo tiene
  // que existir antes de que nazca cualquier proceso hijo (renderers, servidor
  // Next). Sin DSN queda en modo solo-log-local.
  initCrashReporter();

  app.whenReady().then(async () => {
    initConnectivity();

    // ── Optimizaciones de rendimiento ──
    // Desactivar spellcheck para reducir overhead en inputs
    session.defaultSession.setSpellCheckerEnabled(false);

    // ── Permisos del WebContents (F5/F15-B) ──
    // Sin esto Electron concede micrófono, cámara, geolocalización, etc. a
    // cualquier página. Lista blanca (permissions.ts) solo para el origen de
    // la web; el puerto del servidor embebido se conoce tras `start()`, por
    // eso los orígenes se resuelven en cada petición. En macOS el micrófono
    // pasa antes por el prompt del sistema (TCC).
    installPermissionHandlers(
      session.defaultSession,
      () => resolveAllowedOrigins(getLoadUrl(), WEB_APP_URL, webServer.getHosts()),
      // Solo se invoca en darwin (permissions.ts lo comprueba): en Windows/Linux la API no existe.
      { askForMicrophone: () => systemPreferences.askForMediaAccess('microphone') },
    );

    registerIpcHandlers();
    registerToolbarIpc();
    // Pantalla del cliente del POS: relé de mensajes + ventana secundaria.
    registerPosDisplayIpc();
    // Báscula del POS (serialport): bytes crudos a la web, que interpreta el protocolo.
    registerScaleIpc();
    // Menú en español (aceleradores + popup del botón «⋯» de la barra).
    installAppMenu();

    // Tema guardado (el que eligió el usuario en el header de la web) ANTES
    // del splash y de la ventana: así nacen ya del color correcto.
    initTheme();

    // Splash screen mientras carga
    if (!wasOpenedHidden()) {
      createSplashWindow();
      // Safety: cerrar splash pasado un tiempo sin importar qué. Cubre el
      // arranque del servidor Next embebido (hasta 30 s) más la carga.
      setTimeout(() => closeSplash(), 45000);
    }

    // ── Fase 3: servidor Next embebido ──
    // Arranca ANTES de crear la ventana (el splash sigue visible) para que
    // getLoadUrl() ya conozca el puerto. Si falla, se registra y la ventana
    // carga https://app.goadmin.io como hasta ahora: nunca se bloquea el
    // arranque de la app por esto.
    if (webServer.shouldUseLocalWeb()) {
      try {
        await webServer.start();
      } catch (err) {
        console.error('[index] No se pudo arrancar el servidor Next embebido; se usa la web remota:', err);
      }
      // Si el servidor cae con la app abierta, webServer lo reinicia solo;
      // cuando vuelve a responder se recarga la vista (misma ruta si se puede).
      webServer.on('restarted', () => reloadCurrent());
    }

    const mainWindow = createMainWindow();
    appendLog(`[app] Ventana principal creada (${webServer.getUrl() ? 'web embebida' : 'web remota'})`);
    if (mostrarAlCrear) {
      // Alguien abrió la app mientras esta instancia (p. ej. la de
      // autoarranque, oculta) aún arrancaba: se muestra ya, sin esperar.
      mostrarAlCrear = false;
      mainWindow.show();
    }
    createTray(mainWindow);
    // Con la ventana ya creada: apertura automática si está habilitada,
    // seguimiento de monitores y atajo global Ctrl+Shift+D.
    initPosDisplay();

    initUpdater();

    const started = await tryAutoStart();
    if (started) {
      getWebContents()?.send('agent:autostarted');
    }

    // Solo desarrollo: capturas automáticas de la UI si GOADMIN_UI_CAPTURE está definida.
    initDevCapture(mainWindow);

    // closeSplash ya se llamó en ready-to-show; esto es fallback
    closeSplash();
    if (!wasOpenedHidden()) {
      mainWindow.show();
    }
  });

  app.on('before-quit', (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    // CRÍTICO: sin esto, mainWindow.on('close') hace preventDefault() y
    // Electron cancela la secuencia de quit: la app nunca se cierra.
    prepareQuit();
    // La ventana desaparece YA: una app que está saliendo no debe seguir en
    // pantalla mientras limpia (y una segunda instancia no la resucita, ver
    // second-instance → relanzarTrasSalir).
    getMainWindow()?.hide();
    // Limpieza con tope por paso y total (lifecycle.ts, punto 1): antes
    // `markOffline()` esperaba a la red sin límite y el proceso viejo
    // retenía el bloqueo de instancia única.
    void ejecutarCierre(
      [
        { nombre: 'pantalla del cliente', limiteMs: 1_000, ejecutar: () => shutdownPosDisplay() },
        { nombre: 'báscula', limiteMs: 2_000, ejecutar: () => shutdownScale() },
        { nombre: 'actualizador', limiteMs: 500, ejecutar: () => stopUpdater() },
        { nombre: 'conectividad', limiteMs: 500, ejecutar: () => stopConnectivity() },
        { nombre: 'agente offline en Supabase', limiteMs: 3_000, ejecutar: () => markOffline() },
        { nombre: 'agente', limiteMs: 1_000, ejecutar: () => stopAgent() },
        // Parar el servidor Next embebido: si quedara vivo, el puerto seguiría
        // ocupado y el proceso hijo sobreviviría al cierre de la app.
        { nombre: 'servidor Next embebido', limiteMs: 6_000, ejecutar: () => webServer.stop() },
        { nombre: 'bandeja', limiteMs: 500, ejecutar: () => destroyTray() },
      ],
      { limiteTotalMs: LIMITE_CIERRE_MS, log: appendLog },
    ).finally(() => {
      flushLog();
      app.quit();
    });
  });

  // globalShortcut debe soltarse antes de salir; shutdownPosDisplay ya lo
  // hace en before-quit, esto cubre salidas que no pasan por ahí.
  app.on('will-quit', () => {
    shutdownPosDisplay();
  });

  app.on('window-all-closed', () => {
    // La app vive en la bandeja del sistema
  });
}
