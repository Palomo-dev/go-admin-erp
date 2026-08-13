import { BrowserWindow, app, globalShortcut, nativeImage, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { wasOpenedHidden } from '../autostart';
import { APP_NAME, WEB_APP_URL } from '../constants';
import { getCachedAppShell, hasCachedAppShell, saveAppShell } from '../offlineManager';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

const DEV_URL = process.env.DEV_URL || 'http://localhost:3000';

function getLoadUrl(): string {
  return app.isPackaged ? WEB_APP_URL : DEV_URL;
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
}

function loadWindowState(): Partial<WindowState> {
  try {
    const p = getWindowStatePath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {}
  return {};
}

function saveWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const state: WindowState = {
    width: mainWindow.getBounds().width,
    height: mainWindow.getBounds().height,
    x: mainWindow.getBounds().x,
    y: mainWindow.getBounds().y,
    isMaximized: mainWindow.isMaximized(),
  };
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2));
  } catch {}
}

// ── Splash screen ──
function createSplashWindow(): BrowserWindow {
  const iconPath = path.join(__dirname, '..', '..', '..', 'build', 'icon.ico');
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    icon: iconPath,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const splashHtml = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:system-ui;background:#1e3a8a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px}
      .logo{font-size:28px;font-weight:bold;letter-spacing:1px}
      .spinner{width:40px;height:40px;border:4px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}
      .text{font-size:13px;opacity:0.8}
    </style></head><body>
      <div class="logo">Go Admin Desktop</div>
      <div class="spinner"></div>
      <div class="text">Iniciando agente de impresión...</div>
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

  mainWindow = new BrowserWindow({
    width: saved.width || 1400,
    height: saved.height || 900,
    x: saved.x,
    y: saved.y,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: APP_NAME,
    icon: path.join(__dirname, '..', '..', '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#1e3a8a',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      zoomFactor: 0.75,
    },
  });

  // Restaurar maximizado si estaba maximizado
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
    // Auto-abrir DevTools en dev
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // ── Atajos de zoom para el usuario (Ctrl++ / Ctrl+- / Ctrl+0) ──
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (!ctrl) return;
    if (input.key === '=' || input.key === '+') {
      const current = mainWindow?.webContents.getZoomFactor() ?? 0.9;
      mainWindow?.webContents.setZoomFactor(Math.min(current + 0.1, 2.0));
    } else if (input.key === '-') {
      const current = mainWindow?.webContents.getZoomFactor() ?? 0.9;
      mainWindow?.webContents.setZoomFactor(Math.max(current - 0.1, 0.5));
    } else if (input.key === '0') {
      mainWindow?.webContents.setZoomFactor(0.75);
    }
  });

  // En dev, ignorar errores de certificado (localhost)
  if (!app.isPackaged) {
    mainWindow.webContents.session.setCertificateVerifyProc((_req, cb) => cb(0));
  }

  // Intentar cargar online; si falla, usar app shell cacheado
  loadWithOfflineFallback(loadUrl);

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    if (!wasOpenedHidden()) {
      mainWindow?.show();
    }
  });

  // Cachear el HTML del app shell cuando carga exitosamente
  mainWindow.webContents.on('did-finish-load', async () => {
    if (!app.isPackaged) return; // Solo en producción
    try {
      const html = await mainWindow?.webContents.executeJavaScript('document.documentElement.outerHTML');
      if (html && html.length > 1000) {
        await saveAppShell(html);
      }
    } catch {}
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // about:blank se usa para ventanas de impresión (window.open('', '_blank'))
    // que generan el diálogo de impresión del navegador. Sin esto, reimprimir
    // desde el POS no muestra el diálogo.
    if (url === 'about:blank' || url.startsWith(loadUrl) || url.startsWith('https://app.goadmin.io')) {
      return { action: 'allow' };
    }
    return { action: 'deny' };
  });

  let closing = false;
  mainWindow.on('close', (e) => {
    if (!closing) {
      e.preventDefault();
      saveWindowState();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
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

// ── Carga con fallback offline ──
function loadWithOfflineFallback(url: string): void {
  if (!mainWindow) return;

  // Verificar conexión primero
  const online = net.online;

  if (online) {
    // Intentar cargar online
    mainWindow.loadURL(url);

    // Si falla la carga del frame principal, usar cache
    mainWindow.webContents.once('did-fail-load', (_evt, errorCode, _errorDesc, _validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      console.error(`[mainWindow] Error cargando online (code ${errorCode}), intentando cache offline...`);
      loadCachedShell(url);
    });
  } else {
    // Sin conexión: cargar cache directamente
    loadCachedShell(url);
  }
}

function loadCachedShell(originalUrl: string): void {
  if (!mainWindow) return;

  const cached = getCachedAppShell();
  if (cached) {
    console.log('[mainWindow] Cargando app shell desde cache offline');
    // Cargar el HTML cacheado via data URL
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(cached)}`;
    mainWindow.loadURL(dataUrl);

    // Inyectar script de reintentar conexión periódicamente
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.executeJavaScript(`
        (function() {
          var retryInterval = setInterval(function() {
            if (navigator.onLine) {
              clearInterval(retryInterval);
              location.href = '${originalUrl}';
            }
          }, 5000);
        })();
      `).catch(() => {});
    });
  } else {
    // No hay cache: mostrar página de error con reintentar
    const offlineHtml = `data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><title>Sin conexión</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#1a1a2e;color:#eee;gap:24px}
        .logo{font-size:28px;font-weight:bold;color:#3b82f6}
        .icon{font-size:64px}
        h1{font-size:22px;font-weight:600}
        p{color:#888;font-size:14px;max-width:400px;text-align:center}
        button{padding:12px 32px;font-size:16px;cursor:pointer;border:none;border-radius:8px;background:#3b82f6;color:white;transition:background 0.2s}
        button:hover{background:#2563eb}
        .hint{font-size:12px;color:#555}
      </style></head>
      <body>
        <div class="logo">Go Admin Desktop</div>
        <div class="icon">📡</div>
        <h1>Sin conexión a internet</h1>
        <p>No se pudo cargar la aplicación y no hay contenido cacheado disponible. Conéctate a internet e intenta de nuevo.</p>
        <button onclick="location.href='${originalUrl}'">Reintentar</button>
        <p class="hint">La app se recargará automáticamente cuando vuelva la conexión.</p>
      </body>
      </html>
    `)}`;
    mainWindow.loadURL(offlineHtml);

    // Auto-reintentar cuando vuelva la conexión
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.executeJavaScript(`
        (function() {
          var retryInterval = setInterval(function() {
            if (navigator.onLine) {
              clearInterval(retryInterval);
              location.href = '${originalUrl}';
            }
          }, 5000);
        })();
      `).catch(() => {});
    });
  }
}
