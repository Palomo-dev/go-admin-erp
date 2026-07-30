import { BrowserWindow, app, globalShortcut, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { wasOpenedHidden } from '../autostart';
import { APP_NAME, WEB_APP_URL } from '../constants';

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
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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

  // En dev, ignorar errores de certificado (localhost)
  if (!app.isPackaged) {
    mainWindow.webContents.session.setCertificateVerifyProc((_req, cb) => cb(0));
  }

  mainWindow.loadURL(loadUrl);

  mainWindow.once('ready-to-show', () => {
    if (!wasOpenedHidden()) {
      mainWindow?.show();
    }
  });

  // Solo mostrar offline si falla el frame principal (no sub-frames/imagenes)
  mainWindow.webContents.on('did-fail-load', (_evt, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error(`[mainWindow] Error cargando ${loadUrl}: ${errorDescription} (${errorCode})`);
    const offlineHtml = `data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><title>Sin conexión</title></head>
      <body style="font-family:system-ui;padding:40px;text-align:center;background:#1a1a2e;color:#eee">
        <h1>Sin conexión</h1>
        <p>No se pudo cargar GO Admin (${errorDescription}).</p>
        <p style="color:#888">URL: ${loadUrl}</p>
        <button onclick="location.href='${loadUrl}'" style="padding:12px 24px;font-size:16px;cursor:pointer;border:none;border-radius:8px;background:#3b82f6;color:white">Reintentar</button>
      </body>
      </html>
    `)}`;
    mainWindow?.loadURL(offlineHtml);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(loadUrl) || url.startsWith('https://app.goadmin.io')) {
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
