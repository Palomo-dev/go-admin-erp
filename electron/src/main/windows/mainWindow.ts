import { BrowserWindow, app, globalShortcut, screen, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { wasOpenedHidden } from '../autostart';
import { APP_NAME, WEB_APP_URL } from '../constants';
import { getIconImage } from '../icon';
import { isOnline, onConnectivityChange, checkNow } from '../connectivity';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let closing = false;
let showingOfflineScreen = false;
let unsubscribeConnectivity: (() => void) | null = null;

const DEV_URL = process.env.DEV_URL || 'http://localhost:3000';

const DEFAULT_ZOOM = 1.0;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

function getLoadUrl(): string {
  return app.isPackaged ? WEB_APP_URL : DEV_URL;
}

/**
 * Marca que la app se está cerrando de verdad.
 *
 * Sin esto el handler de `close` hace `preventDefault()` siempre, Electron
 * cancela la secuencia de quit y el proceso se queda vivo en la bandeja
 * aunque el usuario haya pulsado "Salir".
 */
export function prepareQuit(): void {
  closing = true;
}

// ── Persistencia de estado de ventana ──
function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

interface WindowState {
  width: number;
  height: number;
  x: number | undefined;
  y: number | undefined;
  isMaximized: boolean;
  zoomFactor: number;
}

function loadWindowState(): Partial<WindowState> {
  try {
    const p = getWindowStatePath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {}
  return {};
}

/**
 * Descarta la posición guardada si ya no cae dentro de ningún monitor
 * conectado. Sin esta validación, al desconectar un segundo monitor la ventana
 * reaparece fuera de pantalla y el usuario cree que la app no abre.
 */
function isPositionVisible(x: number | undefined, y: number | undefined, width: number, height: number): boolean {
  if (typeof x !== 'number' || typeof y !== 'number') return false;
  return screen.getAllDisplays().some((display) => {
    const b = display.workArea;
    const intersects =
      x < b.x + b.width && x + width > b.x && y < b.y + b.height && y + height > b.y;
    // Exigir que al menos la barra de título quede accesible.
    return intersects && y >= b.y - 8 && y < b.y + b.height - 40;
  });
}

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM;
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

function saveWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: mainWindow.isMaximized(),
    zoomFactor: clampZoom(mainWindow.webContents.getZoomFactor()),
  };
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2));
  } catch {}
}

// ── Splash screen ──
function createSplashWindow(): BrowserWindow {
  const iconImage = getIconImage();
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    ...(iconImage ? { icon: iconImage } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const splashHtml = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:22px;border-radius:12px}
      .logo{font-size:26px;font-weight:700;letter-spacing:-0.5px}
      .logo span{color:#3b82f6}
      .spinner{width:34px;height:34px;border:3px solid rgba(248,250,252,0.18);border-top-color:#3b82f6;border-radius:50%;animation:spin 0.9s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}
      .text{font-size:12px;color:#94a3b8;letter-spacing:0.3px}
    </style></head><body>
      <div class="logo">GO <span>Admin</span> ERP</div>
      <div class="spinner"></div>
      <div class="text">Abriendo tu espacio de trabajo...</div>
    </body></html>
  `)}`;
  splashWindow.loadURL(splashHtml);
  return splashWindow;
}

export function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

export function createMainWindow(_webUrl?: string): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const loadUrl = getLoadUrl();
  const saved = loadWindowState();

  const width = saved.width || 1400;
  const height = saved.height || 900;
  const positionIsVisible = isPositionVisible(saved.x, saved.y, width, height);
  const zoomFactor = clampZoom(saved.zoomFactor ?? DEFAULT_ZOOM);

  const iconImage = getIconImage();
  mainWindow = new BrowserWindow({
    width,
    height,
    ...(positionIsVisible ? { x: saved.x, y: saved.y } : {}),
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: APP_NAME,
    ...(iconImage ? { icon: iconImage } : {}),
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      zoomFactor,
    },
  });

  if (saved.isMaximized) {
    mainWindow.maximize();
  }

  // ── DevTools solo en desarrollo (F12 / Ctrl+Shift+I) ──
  if (!app.isPackaged) {
    globalShortcut.register('F12', () => {
      mainWindow?.webContents.toggleDevTools();
    });
    globalShortcut.register('Ctrl+Shift+I', () => {
      mainWindow?.webContents.toggleDevTools();
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // ── Atajos del usuario: zoom (Ctrl++ / Ctrl+- / Ctrl+0) y recargar (F5) ──
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'F5' && !input.control && !input.meta) {
      reloadApp();
      return;
    }

    const ctrl = input.control || input.meta;
    if (!ctrl) return;

    if (input.key === 'r' || input.key === 'R') {
      reloadApp();
    } else if (input.key === '=' || input.key === '+') {
      applyZoom((mainWindow?.webContents.getZoomFactor() ?? DEFAULT_ZOOM) + 0.1);
    } else if (input.key === '-') {
      applyZoom((mainWindow?.webContents.getZoomFactor() ?? DEFAULT_ZOOM) - 0.1);
    } else if (input.key === '0') {
      applyZoom(DEFAULT_ZOOM);
    }
  });

  // En dev, ignorar errores de certificado (localhost)
  if (!app.isPackaged) {
    mainWindow.webContents.session.setCertificateVerifyProc((_req, cb) => cb(0));
  }

  // ── Seguridad: el preload expone window.goAdminDesktop en este webContents.
  // Si la ventana navegara a un dominio externo, ese sitio heredaría el bridge
  // (impresión, autostart, configuración). Se bloquea y se abre en el navegador.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url, loadUrl)) return;
    event.preventDefault();
    shell.openExternal(url).catch(() => {});
  });

  loadApp(loadUrl);

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    if (!wasOpenedHidden()) {
      mainWindow?.show();
    }
  });

  // Si la carga del frame principal falla, mostrar la pantalla offline.
  mainWindow.webContents.on('did-fail-load', (_evt, errorCode, errorDesc, _url, isMainFrame) => {
    if (!isMainFrame) return;
    // -3 = ERR_ABORTED: ocurre en navegaciones canceladas, no es un fallo real.
    if (errorCode === -3) return;
    console.error(`[mainWindow] Error cargando (${errorCode} ${errorDesc}), mostrando pantalla offline`);
    showOfflineScreen();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!showingOfflineScreen) {
      mainWindow?.webContents.setZoomFactor(clampZoom(loadWindowState().zoomFactor ?? DEFAULT_ZOOM));
    }
  });

  // Reintentar automáticamente cuando vuelva la conexión de verdad.
  unsubscribeConnectivity?.();
  unsubscribeConnectivity = onConnectivityChange((online) => {
    if (online && showingOfflineScreen) reloadApp();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // about:blank se usa para ventanas de impresión (window.open('', '_blank'))
    // que generan el diálogo de impresión del navegador. Sin esto, reimprimir
    // desde el POS no muestra el diálogo.
    if (url === 'about:blank' || isInternalUrl(url, loadUrl)) {
      // CRÍTICO: la ventana principal tiene sandbox: false. Por defecto, las
      // ventanas hijas se crean sandboxed, lo que hace que window.open() retorne
      // null (mismatch de sandbox entre opener e hija) y el diálogo de impresión
      // nunca aparece. Se debe heredar sandbox: false para que la hija comparta
      // el proceso del opener y window.open() funcione.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            sandbox: false,
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!closing) {
      e.preventDefault();
      saveWindowState();
      mainWindow?.hide();
      return;
    }
    saveWindowState();
  });

  mainWindow.on('closed', () => {
    unsubscribeConnectivity?.();
    unsubscribeConnectivity = null;
    mainWindow = null;
  });

  return mainWindow;
}

export { createSplashWindow };

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

export function reloadApp(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  showingOfflineScreen = false;
  loadApp(getLoadUrl());
}

function applyZoom(value: number): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.setZoomFactor(clampZoom(value));
  saveWindowState();
}

function isInternalUrl(url: string, loadUrl: string): boolean {
  try {
    const target = new URL(url);
    const base = new URL(loadUrl);
    const allowedHosts = new Set([base.host, new URL(WEB_APP_URL).host]);
    return (target.protocol === 'https:' || target.protocol === 'http:') && allowedHosts.has(target.host);
  } catch {
    return false;
  }
}

function loadApp(url: string): void {
  if (!mainWindow) return;
  showingOfflineScreen = false;
  mainWindow.loadURL(url).catch(() => showOfflineScreen());
}

/**
 * Pantalla offline honesta.
 *
 * Antes se intentaba rehidratar un `outerHTML` cacheado servido como `data:`
 * URL. Eso nunca podía funcionar: un `data:` URL es un origen opaco, así que
 * localStorage está vacío (no hay sesión de Supabase) y el IndexedDB es otro
 * (no hay cache de queries ni cola de acciones). El resultado era una pantalla
 * en blanco. Hasta que la UI se empaquete dentro del .exe, lo correcto es
 * decirle la verdad al usuario.
 */
function showOfflineScreen(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  showingOfflineScreen = true;

  const html = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="utf-8"><title>Sin conexión</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#e2e8f0;gap:18px;padding:32px}
      .logo{font-size:22px;font-weight:700;letter-spacing:-0.5px}
      .logo span{color:#3b82f6}
      .icon{font-size:52px;line-height:1;margin-top:8px}
      h1{font-size:19px;font-weight:600}
      p{color:#94a3b8;font-size:13.5px;max-width:460px;text-align:center;line-height:1.6}
      button{margin-top:6px;padding:11px 30px;font-size:14px;font-weight:600;cursor:pointer;border:none;border-radius:8px;background:#3b82f6;color:#fff;transition:background .15s}
      button:hover{background:#2563eb}
      .hint{font-size:11.5px;color:#64748b}
    </style></head>
    <body>
      <div class="logo">GO <span>Admin</span> ERP</div>
      <div class="icon">&#128246;</div>
      <h1>Sin conexión a internet</h1>
      <p>No se pudo abrir Go Admin ERP. Revisa tu conexión — la aplicación se recargará sola en cuanto vuelva.</p>
      <button id="retry">Reintentar ahora</button>
      <p class="hint">El agente de impresión sigue corriendo en segundo plano.</p>
      <script>
        document.getElementById('retry').addEventListener('click', function () {
          this.disabled = true;
          this.textContent = 'Reintentando...';
          if (window.goAdminDesktop && window.goAdminDesktop.reload) {
            window.goAdminDesktop.reload();
          } else {
            location.reload();
          }
        });
      </script>
    </body>
    </html>
  `)}`;

  mainWindow.loadURL(html).catch(() => {});
  void checkNow();
}
