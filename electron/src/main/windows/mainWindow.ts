import { BrowserWindow, WebContents, WebContentsView, app, screen, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { wasOpenedHidden } from '../autostart';
import { APP_NAME, WEB_APP_URL } from '../constants';
import { getWindowIcon } from '../icon';
import { isOnline, onConnectivityChange, checkNow } from '../connectivity';
import { webServer } from '../webServer';
import { TOOLBAR_HEIGHT, applyTheme, getThemeColors, watchTheme } from '../theme';
import { broadcast } from '../broadcast';

/**
 * Ventana principal = barra de aplicación propia + vista de la web.
 *
 * Estructura (fase 2, UI nativa):
 *
 *   BrowserWindow (titleBarStyle: 'hidden' + titleBarOverlay)
 *   ├─ webContents propio → src/renderer/toolbar (barra: atrás, adelante,
 *   │  recargar, inicio, conexión, actualización). Se carga por file:// desde
 *   │  dist/, nunca desde la web, y tiene su propio preload (preload/toolbar).
 *   └─ WebContentsView → https://app.goadmin.io con el preload de siempre
 *      (preload/index), ocupando todo lo que queda bajo la barra.
 *
 * Los controles de ventana (minimizar, maximizar, cerrar) siguen siendo los
 * nativos de Windows: los dibuja el Window Controls Overlay sobre la barra.
 *
 * Decisión: se descartó `BrowserView` (deprecado en Electron 30+) y también
 * meter la barra en la propia web (la barra debe existir aunque la web no
 * cargue: es justo cuando más falta hace «recargar» e «inicio»).
 */

let mainWindow: BrowserWindow | null = null;
let webView: WebContentsView | null = null;
let splashWindow: BrowserWindow | null = null;
let closing = false;
let showingOfflineScreen = false;
let unsubscribeConnectivity: (() => void) | null = null;

const DEV_URL = process.env.DEV_URL || 'http://localhost:3000';

const DEFAULT_ZOOM = 1.0;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

/**
 * URL que carga la vista de la web.
 *
 * Fase 3 (servidor Next embebido): si el servidor local arrancó
 * (`webServer.start()` en index.ts, antes de crear la ventana), la web se
 * sirve desde `http://127.0.0.1:<puerto>` y la app abre sin internet. Si no
 * arrancó (build no empaquetado, error), se cae a la web remota como antes.
 * En desarrollo solo se usa el local con `GOADMIN_DESKTOP_LOCAL_WEB=1`.
 */
export function getLoadUrl(): string {
  const localUrl = webServer.shouldUseLocalWeb() ? webServer.getUrl() : null;
  if (localUrl) return localUrl;
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
    zoomFactor: clampZoom(getWebContents()?.getZoomFactor() ?? DEFAULT_ZOOM),
  };
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2));
  } catch {}
}

// ── Splash screen ──
function createSplashWindow(): BrowserWindow {
  const windowIcon = getWindowIcon();
  const theme = getThemeColors();
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const splashHtml = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',system-ui,sans-serif;background:${theme.background};color:${theme.dark ? '#f8fafc' : '#0f172a'};display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:22px;border-radius:12px}
      .logo{font-size:26px;font-weight:700;letter-spacing:-0.5px}
      .logo span{color:#3b82f6}
      .spinner{width:34px;height:34px;border:3px solid ${theme.dark ? 'rgba(248,250,252,0.18)' : 'rgba(15,23,42,0.15)'};border-top-color:#3b82f6;border-radius:50%;animation:spin 0.9s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}
      .text{font-size:12px;color:${theme.dark ? '#94a3b8' : '#475569'};letter-spacing:0.3px}
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

// ── Rutas de los renderers locales ──
function getToolbarHtmlPath(): string {
  // dist/main/windows → dist/renderer/toolbar/index.html
  return path.join(__dirname, '..', '..', 'renderer', 'toolbar', 'index.html');
}

export function getPreloadPath(name: 'index' | 'toolbar'): string {
  return path.join(__dirname, '..', '..', 'preload', `${name}.js`);
}

/** Recoloca la vista de la web bajo la barra cada vez que cambia el tamaño. */
function layoutWebView(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !webView) return;
  const { width, height } = mainWindow.getContentBounds();
  webView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
}

export function createMainWindow(_webUrl?: string): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const loadUrl = getLoadUrl();
  const saved = loadWindowState();
  const theme = getThemeColors();

  const width = saved.width || 1400;
  const height = saved.height || 900;
  const positionIsVisible = isPositionVisible(saved.x, saved.y, width, height);
  const zoomFactor = clampZoom(saved.zoomFactor ?? DEFAULT_ZOOM);

  const windowIcon = getWindowIcon();
  mainWindow = new BrowserWindow({
    width,
    height,
    ...(positionIsVisible ? { x: saved.x, y: saved.y } : {}),
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: APP_NAME,
    ...(windowIcon ? { icon: windowIcon } : {}),
    // Barra de título propia: la dibuja renderer/toolbar; los botones de
    // ventana siguen siendo nativos (Window Controls Overlay).
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: theme.bar, symbolColor: theme.symbol, height: TOOLBAR_HEIGHT },
    autoHideMenuBar: true,
    backgroundColor: theme.background,
    webPreferences: {
      // Preload de la BARRA: solo navegación, estado y tema. No expone nada
      // del bridge de la web (impresión, agente, configuración).
      preload: getPreloadPath('toolbar'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // La barra nunca navega ni abre ventanas.
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.loadFile(getToolbarHtmlPath()).catch((err) => {
    console.error('[mainWindow] No se pudo cargar la barra de aplicación:', err);
  });

  // ── Vista de la web ──
  webView = new WebContentsView({
    webPreferences: {
      preload: getPreloadPath('index'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      zoomFactor,
    },
  });
  webView.setBackgroundColor(theme.background);
  mainWindow.contentView.addChildView(webView);
  layoutWebView();
  mainWindow.on('resize', layoutWebView);
  mainWindow.on('maximize', layoutWebView);
  mainWindow.on('unmaximize', layoutWebView);
  mainWindow.on('enter-full-screen', layoutWebView);
  mainWindow.on('leave-full-screen', layoutWebView);

  const wc = webView.webContents;

  if (saved.isMaximized) {
    mainWindow.maximize();
  }

  // ── DevTools solo en desarrollo (F12 / Ctrl+Shift+I vía menú) ──
  // No se abren en modo captura (GOADMIN_UI_CAPTURE): la ventana separada
  // taparía la ventana principal en las capturas de pantalla.
  if (!app.isPackaged && !process.env.GOADMIN_UI_CAPTURE) {
    wc.openDevTools({ mode: 'detach' });
  }

  // En dev, ignorar errores de certificado (localhost)
  if (!app.isPackaged) {
    wc.session.setCertificateVerifyProc((_req, cb) => cb(0));
  }

  // Seguridad: bloquear navegaciones y ventanas hacia dominios externos
  // (heredarían window.goAdminDesktop). Compartido con la pantalla del cliente.
  installExternalLinkGuards(wc, loadUrl);

  // ── Estado de navegación → barra ──
  const pushNav = () => broadcast('toolbar:nav-state', getNavState());
  wc.on('did-start-loading', pushNav);
  wc.on('did-stop-loading', pushNav);
  wc.on('did-navigate', pushNav);
  wc.on('did-navigate-in-page', pushNav);
  wc.on('page-title-updated', (_e, title) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(title && !showingOfflineScreen ? `${title} — ${APP_NAME}` : APP_NAME);
    }
    pushNav();
  });

  loadApp(loadUrl);

  // La ventana se muestra cuando la web (no la barra) tiene algo que enseñar.
  const showWhenReady = () => {
    closeSplash();
    if (!wasOpenedHidden() && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  };
  wc.once('did-finish-load', showWhenReady);

  // Si la carga del frame principal falla, mostrar la pantalla offline.
  wc.on('did-fail-load', (_evt, errorCode, errorDesc, _url, isMainFrame) => {
    if (!isMainFrame) return;
    // -3 = ERR_ABORTED: ocurre en navegaciones canceladas, no es un fallo real.
    if (errorCode === -3) return;
    console.error(`[mainWindow] Error cargando (${errorCode} ${errorDesc}), mostrando pantalla offline`);
    showOfflineScreen();
    showWhenReady();
  });

  wc.on('did-finish-load', () => {
    if (!showingOfflineScreen) {
      wc.setZoomFactor(clampZoom(loadWindowState().zoomFactor ?? DEFAULT_ZOOM));
    }
  });

  // Reintentar automáticamente cuando vuelva la conexión de verdad.
  unsubscribeConnectivity?.();
  unsubscribeConnectivity = onConnectivityChange((online) => {
    if (online && showingOfflineScreen) reloadApp();
  });

  // Tema: aplicar ahora y seguir al sistema.
  applyTheme(mainWindow);
  watchTheme(() => mainWindow);

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
    webView = null;
    mainWindow = null;
  });

  return mainWindow;
}

export { createSplashWindow };

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** webContents de la WEB (no de la barra). Es donde vive window.goAdminDesktop. */
export function getWebContents(): WebContents | null {
  if (!webView || webView.webContents.isDestroyed()) return null;
  return webView.webContents;
}

/** webContents de la BARRA. Se usa para validar el remitente de los IPC `toolbar:*`. */
export function getToolbarWebContents(): WebContents | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow.webContents;
}

export function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ── Navegación (barra + menú) ──

export interface NavState {
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  title: string;
  offline: boolean;
}

export function getNavState(): NavState {
  const wc = getWebContents();
  if (!wc) return { canGoBack: false, canGoForward: false, loading: false, title: '', offline: showingOfflineScreen };
  return {
    canGoBack: !showingOfflineScreen && wc.navigationHistory.canGoBack(),
    canGoForward: !showingOfflineScreen && wc.navigationHistory.canGoForward(),
    loading: wc.isLoading(),
    title: showingOfflineScreen ? 'Sin conexión' : wc.getTitle(),
    offline: showingOfflineScreen,
  };
}

export function goBack(): void {
  const wc = getWebContents();
  if (wc && !showingOfflineScreen && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
}

export function goForward(): void {
  const wc = getWebContents();
  if (wc && !showingOfflineScreen && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
}

export function goHome(): void {
  loadApp(getLoadUrl());
}

/**
 * Recarga la página actual sin perder la ruta (F5 / Ctrl+R / botón de la
 * barra). Si lo que se ve es la pantalla offline, vuelve a intentar la web.
 */
export function reloadCurrent(): void {
  const wc = getWebContents();
  if (!wc) return;
  if (showingOfflineScreen) {
    reloadApp();
    return;
  }
  wc.reload();
}

/** Recarga desde la raíz de la web (IPC `app:reload`, botón «Reintentar»). */
export function reloadApp(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  showingOfflineScreen = false;
  loadApp(getLoadUrl());
}

export function toggleDevTools(): void {
  if (app.isPackaged) return;
  getWebContents()?.toggleDevTools();
}

function applyZoom(value: number): void {
  const wc = getWebContents();
  if (!wc) return;
  wc.setZoomFactor(clampZoom(value));
  saveWindowState();
}

export function zoomIn(): void {
  applyZoom((getWebContents()?.getZoomFactor() ?? DEFAULT_ZOOM) + ZOOM_STEP);
}

export function zoomOut(): void {
  applyZoom((getWebContents()?.getZoomFactor() ?? DEFAULT_ZOOM) - ZOOM_STEP);
}

export function zoomReset(): void {
  applyZoom(DEFAULT_ZOOM);
}

/**
 * URLs que pueden navegar dentro de la vista (y abrir hijas con el bridge):
 * la URL cargada, app.goadmin.io y el servidor Next embebido
 * (`localhost:<puerto>` y `127.0.0.1:<puerto>`, solo el puerto que arrancó
 * este proceso). Todo lo
 * demás lo bloquea `will-navigate` y se abre en el navegador del sistema.
 */
export function isInternalUrl(url: string, loadUrl: string): boolean {
  try {
    const target = new URL(url);
    const base = new URL(loadUrl);
    const allowedHosts = new Set([base.host, new URL(WEB_APP_URL).host]);
    for (const host of webServer.getHosts()) allowedHosts.add(host);
    return (target.protocol === 'https:' || target.protocol === 'http:') && allowedHosts.has(target.host);
  } catch {
    return false;
  }
}

/**
 * Guardas de seguridad de un webContents que lleva el preload de la web
 * (`window.goAdminDesktop`): la vista principal y la pantalla del cliente.
 *
 * - `will-navigate`: si la página navegara a un dominio externo, ese sitio
 *   heredaría el bridge (impresión, agente, configuración). Se bloquea y se
 *   abre en el navegador del sistema.
 * - `setWindowOpenHandler`: los enlaces externos van al navegador. Se permite
 *   `about:blank` porque las ventanas de impresión (`window.open('', '_blank')`)
 *   lo usan para mostrar el diálogo de impresión; sin esto reimprimir desde el
 *   POS no muestra nada.
 *
 * CRÍTICO: la vista de la web tiene `sandbox: false`. Por defecto las ventanas
 * hijas se crean sandboxed, lo que hace que `window.open()` devuelva null
 * (desajuste de sandbox entre opener e hija). Se hereda `sandbox: false` para
 * que la hija comparta el proceso del opener y `window.open()` funcione.
 */
export function installExternalLinkGuards(wc: WebContents, loadUrl: string): void {
  wc.on('will-navigate', (event, url) => {
    if (isInternalUrl(url, loadUrl)) return;
    event.preventDefault();
    shell.openExternal(url).catch(() => {});
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || isInternalUrl(url, loadUrl)) {
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
}

function loadApp(url: string): void {
  const wc = getWebContents();
  if (!wc) return;
  showingOfflineScreen = false;
  wc.loadURL(url).catch(() => showOfflineScreen());
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
 *
 * Los colores siguen `prefers-color-scheme`, que Chromium deriva de
 * `nativeTheme`, así que la pantalla cambia con el tema del sistema.
 */
function showOfflineScreen(): void {
  const wc = getWebContents();
  if (!wc) return;
  showingOfflineScreen = true;
  broadcast('toolbar:nav-state', getNavState());

  const html = `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="utf-8"><title>Sin conexión</title>
    <style>
      :root{color-scheme:light dark;--bg:#f8fafc;--fg:#0f172a;--muted:#475569;--hint:#64748b}
      @media (prefers-color-scheme: dark){:root{--bg:#0f172a;--fg:#e2e8f0;--muted:#94a3b8;--hint:#64748b}}
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:var(--bg);color:var(--fg);gap:18px;padding:32px}
      .logo{font-size:22px;font-weight:700;letter-spacing:-0.5px}
      .logo span{color:#3b82f6}
      .icon{font-size:52px;line-height:1;margin-top:8px}
      h1{font-size:19px;font-weight:600}
      p{color:var(--muted);font-size:13.5px;max-width:460px;text-align:center;line-height:1.6}
      button{margin-top:6px;padding:11px 30px;font-size:14px;font-weight:600;cursor:pointer;border:none;border-radius:8px;background:#3b82f6;color:#fff;transition:background .15s}
      button:hover{background:#2563eb}
      .hint{font-size:11.5px;color:var(--hint)}
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

  wc.loadURL(html).catch(() => {});
  void checkNow();
}

// isOnline se reexporta para el menú/tray sin que importen connectivity a través de aquí.
export { isOnline };
