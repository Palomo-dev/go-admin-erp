import { BrowserWindow, Display, Session, WebContents, globalShortcut, screen } from 'electron';
import { getWindowIcon } from '../icon';
import { getThemeColors } from '../theme';
import { broadcast } from '../broadcast';
import { loadConfig, saveConfig, PosDisplayConfig } from '../store';
import { getLoadUrl, getMainWindow, getPreloadPath, getWebContents, installExternalLinkGuards, isInternalUrl } from './mainWindow';

/**
 * Pantalla del cliente del POS (ventana secundaria de Go Admin Desktop).
 *
 * POR QUÉ
 * -------
 * En el navegador la caja abre `/pos-display` con `window.open` y habla con
 * ella por BroadcastChannel. En escritorio eso falla de dos formas: la
 * emergente hereda el foco y hay que arrastrarla a mano al segundo monitor,
 * y BroadcastChannel no cruza orígenes (la web embebida vive en
 * `localhost:<puerto>`, la pantalla podría acabar en `127.0.0.1`). Aquí la
 * ventana la crea el proceso principal —misma sesión, mismo preload, misma
 * URL base que la caja— y la mensajería va por IPC (`posDisplayIpc.ts`), que
 * no depende de red ni de origen: la pantalla enlaza sin internet.
 *
 * MONITOR
 * -------
 * Si hay un monitor secundario (o la caja pidió un `displayId` válido) la
 * ventana va a pantalla completa, sin marco, en ese monitor y se muestra sin
 * robar el foco de la caja (`showInactive`). Si solo hay un monitor, es una
 * ventana normal de 1280×800 para que el cajero pueda moverla o cerrarla.
 * Nunca hay dos: si ya está abierta, se trae al frente.
 *
 * CICLO DE VIDA
 * -------------
 * - `posDisplay.enabled` en config.json: se abre sola cuando la web principal
 *   termina de cargar (con el origen real de esa web) y se reabre si su
 *   monitor vuelve (`display-added`).
 * - Se cierra si su monitor desaparece (`display-removed`), al cerrar u
 *   ocultar la ventana principal, al salir de la app y con `Ctrl+Shift+D`
 *   desde cualquier ventana (atajo global: la pantalla es frameless y a veces
 *   táctil, sin barra de título que cerrar).
 * - Cada apertura y cierre emite `pos-display:status` a todos los renderers.
 */

const DISPLAY_PATH = '/pos-display';
const WINDOWED_SIZE = { width: 1280, height: 800 };
export const CLOSE_SHORTCUT = 'CommandOrControl+Shift+D';

export interface OpenPosDisplayOptions {
  /** Origen (`scheme://host[:puerto]`) de la web que llama. Ya validado por el IPC. */
  origin: string;
  /** Monitor pedido; si no existe se elige uno automáticamente. */
  displayId?: number | null;
  /** Sesión/partición de la web que llama: la pantalla comparte cookies e IndexedDB. */
  session?: Session;
}

export interface OpenPosDisplayResult {
  ok: boolean;
  reason?: string;
}

export interface PosDisplayStatus {
  open: boolean;
  displayId: number | null;
}

export interface DisplayInfo {
  id: number;
  label: string;
  isPrimary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

/** Resultado de la elección de monitor (pura, ver `pickDisplay`). */
export interface DisplayChoice {
  display: Display | null;
  /** true = pantalla completa sin marco en `display`; false = ventana normal. */
  fullscreen: boolean;
}

let displayWindow: BrowserWindow | null = null;
/** Monitor sobre el que se abrió (null en modo ventana). */
let currentDisplayId: number | null = null;
let screenListenersInstalled = false;
let shortcutRegistered = false;

// ── Elección de monitor ──

/**
 * Elige el monitor de la pantalla del cliente. Función pura para poder
 * razonar (y probar) sin Electron:
 *
 *  1. Si `requestedId` es un monitor conectado, ese, a pantalla completa
 *     (aunque sea el principal: el usuario lo pidió explícitamente).
 *  2. Si no, el primer monitor que no sea el principal, a pantalla completa.
 *  3. Si solo hay uno, ventana normal (display = null, fullscreen = false).
 */
export function pickDisplay(
  displays: readonly Display[],
  primaryId: number,
  requestedId: number | null | undefined,
): DisplayChoice {
  if (typeof requestedId === 'number' && Number.isInteger(requestedId)) {
    const requested = displays.find((d) => d.id === requestedId);
    if (requested) return { display: requested, fullscreen: true };
  }
  const secondary = displays.find((d) => d.id !== primaryId);
  if (secondary) return { display: secondary, fullscreen: true };
  return { display: null, fullscreen: false };
}

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: d.label || `Monitor ${d.id}`,
    isPrimary: d.id === primaryId,
    bounds: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height },
  }));
}

function displayExists(displayId: number | null | undefined): boolean {
  if (typeof displayId !== 'number') return false;
  return screen.getAllDisplays().some((d) => d.id === displayId);
}

// ── Configuración persistida ──

export function getPosDisplayConfig(): PosDisplayConfig {
  const cfg = loadConfig().posDisplay;
  return {
    enabled: cfg?.enabled === true,
    displayId: typeof cfg?.displayId === 'number' && Number.isInteger(cfg.displayId) ? cfg.displayId : null,
  };
}

export function setPosDisplayEnabled(enabled: boolean, displayId?: number | null): PosDisplayConfig {
  const current = getPosDisplayConfig();
  const next: PosDisplayConfig = {
    enabled,
    displayId: displayId === undefined ? current.displayId : displayId,
  };
  saveConfig({ posDisplay: next });
  return next;
}

// ── Estado ──

function isOpen(): boolean {
  return displayWindow !== null && !displayWindow.isDestroyed();
}

export function getPosDisplayStatus(): PosDisplayStatus {
  if (!isOpen()) return { open: false, displayId: null };
  return { open: true, displayId: currentDisplayId };
}

export function getPosDisplayWebContents(): WebContents | null {
  if (!isOpen() || displayWindow!.webContents.isDestroyed()) return null;
  return displayWindow!.webContents;
}

function emitStatus(): void {
  broadcast('pos-display:status', getPosDisplayStatus());
}

// ── Apertura / cierre ──

/**
 * Abre la pantalla (o la trae al frente si ya está). `origin` debe venir ya
 * validado como interno (`isInternalUrl`): aquí se vuelve a comprobar por
 * defensa en profundidad, porque de esta URL depende que el preload con el
 * bridge solo se inyecte en la web propia.
 */
export function openPosDisplay(opts: OpenPosDisplayOptions): OpenPosDisplayResult {
  const targetUrl = buildDisplayUrl(opts.origin);
  if (!targetUrl) return { ok: false, reason: 'origen no permitido' };

  if (isOpen()) {
    bringToFront();
    return { ok: true };
  }

  const choice = pickDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay().id, opts.displayId);
  const theme = getThemeColors();
  const windowIcon = getWindowIcon();

  const win = new BrowserWindow({
    ...(choice.display
      ? { x: choice.display.bounds.x, y: choice.display.bounds.y, width: choice.display.bounds.width, height: choice.display.bounds.height }
      : WINDOWED_SIZE),
    fullscreen: choice.fullscreen,
    frame: !choice.fullscreen,
    // En pantalla completa no tiene sentido en la barra de tareas: se cierra
    // con Ctrl+Shift+D o desde la caja.
    skipTaskbar: choice.fullscreen,
    show: false,
    title: 'Pantalla del cliente — Go Admin',
    autoHideMenuBar: true,
    backgroundColor: theme.background,
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      // MISMO preload y MISMAS opciones que la vista de la web (mainWindow.ts):
      // la pantalla es la web propia, con window.goAdminDesktop.
      preload: getPreloadPath('index'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      ...(opts.session ? { session: opts.session } : {}),
    },
  });

  displayWindow = win;
  currentDisplayId = choice.display?.id ?? null;

  const loadUrl = getLoadUrl();
  installExternalLinkGuards(win.webContents, loadUrl);

  // Sin menú: F5/Ctrl+R de la principal no aplican aquí.
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    if (!win || win.isDestroyed()) return;
    if (choice.display) {
      // Belt-and-braces: Windows a veces ignora x/y del constructor cuando
      // `fullscreen: true`; recolocar antes de mostrar lo deja en su monitor.
      win.setBounds(choice.display.bounds);
      if (!win.isFullScreen()) win.setFullScreen(true);
    }
    // showInactive: la caja conserva el foco (el cajero sigue tecleando).
    win.showInactive();
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    console.error(`[posDisplay] Error cargando ${url} (${code} ${desc})`);
  });

  win.on('closed', () => {
    if (displayWindow === win) {
      displayWindow = null;
      currentDisplayId = null;
    }
    emitStatus();
  });

  win.loadURL(targetUrl).catch((err) => {
    console.error('[posDisplay] loadURL falló:', err);
  });

  console.log(
    `[posDisplay] Abierta en ${choice.display ? `monitor ${choice.display.id} (pantalla completa)` : 'ventana 1280×800'}: ${targetUrl}`,
  );
  emitStatus();
  return { ok: true };
}

export function closePosDisplay(): void {
  if (!isOpen()) return;
  const win = displayWindow!;
  displayWindow = null;
  currentDisplayId = null;
  try {
    // El evento `closed` de la ventana es quien emite `pos-display:status`.
    win.close();
  } catch (err) {
    console.warn('[posDisplay] No se pudo cerrar la ventana:', err);
    emitStatus();
  }
}

function bringToFront(): void {
  const win = displayWindow!;
  if (win.isMinimized()) win.restore();
  if (win.isFullScreen()) {
    // Sin robar el foco de la caja: solo se asegura de que esté visible.
    win.showInactive();
    win.moveTop();
  } else {
    win.show();
    win.focus();
  }
}

/** `${origin}/pos-display` si el origen es interno; null si no. */
function buildDisplayUrl(origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (!isInternalUrl(parsed.origin, getLoadUrl())) return null;
  return `${parsed.origin}${DISPLAY_PATH}`;
}

// ── Apertura automática ──

/** Origen real de la web cargada en la ventana principal, o null si no es interna (offline, data:). */
function getMainWebOrigin(): string | null {
  const wc = getWebContents();
  if (!wc) return null;
  const url = wc.getURL();
  if (!url || !isInternalUrl(url, getLoadUrl())) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Abre la pantalla si `posDisplay.enabled` y (si hay monitor elegido) ese
 * monitor está conectado. No hace nada si ya está abierta o si la web
 * principal aún no ha cargado una URL interna (sin origen no hay a dónde ir).
 */
export function autoOpenIfEnabled(reason: string): void {
  if (isOpen()) return;
  const cfg = getPosDisplayConfig();
  if (!cfg.enabled) return;
  if (cfg.displayId !== null && !displayExists(cfg.displayId)) {
    console.log(`[posDisplay] ${reason}: habilitada pero el monitor ${cfg.displayId} no está conectado; no se abre`);
    return;
  }
  const origin = getMainWebOrigin();
  if (!origin) return;
  const wc = getWebContents();
  const result = openPosDisplay({ origin, displayId: cfg.displayId, session: wc?.session });
  if (!result.ok) console.warn(`[posDisplay] ${reason}: no se pudo abrir (${result.reason})`);
}

/**
 * Cableado del ciclo de vida. Se llama una vez desde index.ts con la ventana
 * principal ya creada.
 */
export function initPosDisplay(): void {
  const main = getMainWindow();
  const wc = getWebContents();

  // Apertura automática cuando la web principal ha cargado (y en cada
  // recarga: es idempotente, no abre dos veces).
  wc?.on('did-finish-load', () => autoOpenIfEnabled('web cargada'));

  // Cerrar la principal (o esconderla en la bandeja) cierra la pantalla: sin
  // caja no hay nada que mostrar y una ventana a pantalla completa huérfana
  // en el segundo monitor confunde. Al volver a mostrarla, se reabre si toca.
  main?.on('close', () => closePosDisplay());
  main?.on('show', () => autoOpenIfEnabled('ventana principal visible'));

  if (!screenListenersInstalled) {
    screenListenersInstalled = true;
    screen.on('display-removed', (_e, removed) => {
      if (isOpen() && currentDisplayId !== null && removed.id === currentDisplayId) {
        console.log(`[posDisplay] Monitor ${removed.id} desconectado: se cierra la pantalla`);
        closePosDisplay();
      }
    });
    screen.on('display-added', (_e, added) => {
      console.log(`[posDisplay] Monitor ${added.id} conectado`);
      autoOpenIfEnabled('monitor conectado');
    });
  }

  if (!shortcutRegistered) {
    try {
      shortcutRegistered = globalShortcut.register(CLOSE_SHORTCUT, () => {
        if (isOpen()) {
          console.log('[posDisplay] Cerrada con el atajo global');
          closePosDisplay();
        }
      });
      if (!shortcutRegistered) console.warn(`[posDisplay] No se pudo registrar el atajo ${CLOSE_SHORTCUT}`);
    } catch (err) {
      console.warn('[posDisplay] Error registrando el atajo global:', err);
    }
  }
}

/** Al salir: soltar el atajo global y cerrar la pantalla. */
export function shutdownPosDisplay(): void {
  if (shortcutRegistered) {
    try {
      globalShortcut.unregister(CLOSE_SHORTCUT);
    } catch {
      // ya desregistrado
    }
    shortcutRegistered = false;
  }
  closePosDisplay();
}
