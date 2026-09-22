import { BrowserWindow, WebContents } from 'electron';
import { getLoadUrl, getMainWindow, isInternalUrl } from './windows/mainWindow';

/**
 * Ventana de impresión creada por el proceso principal (auditoría §4.3).
 *
 * La web imprime tickets, guías y recibos abriendo una ventana en blanco y
 * escribiéndole HTML (`window.open('', '_blank')` + `document.write()` +
 * `print()`). Eso sigue funcionando con la vista sandboxed (ver
 * installExternalLinkGuards en windows/mainWindow.ts). Este módulo ofrece a
 * la web una segunda vía, `window.goAdminDesktop.openPrintPreview(html)`,
 * que no depende de `window.open` ni del bloqueador de ventanas emergentes:
 * el main crea una BrowserWindow sandboxed, sin preload y sin ningún
 * privilegio, con el HTML recibido, y la página se imprime a sí misma con su
 * propio `<script>window.print()</script>` (o el main llama a `print()` si se
 * pide `autoPrint`).
 *
 * La ventana no puede navegar ni abrir otras: la única página que muestra es
 * el HTML que le entregó la web.
 */

export interface PrintPreviewOptions {
  /** Título de la ventana. */
  title?: string;
  width?: number;
  height?: number;
  /**
   * true → el main llama a `webContents.print()` al terminar de cargar y
   * cierra la ventana al acabar. false (default) → la página decide (su
   * propio `window.print()` / `window.close()`, como con `window.open`).
   */
  autoPrint?: boolean;
  /** Con `autoPrint`: imprimir sin diálogo en `deviceName` (o la predeterminada). */
  silent?: boolean;
  deviceName?: string;
}

export interface PrintPreviewResult {
  success: boolean;
  error?: string;
}

/** Los `data:` URL de navegación tienen tope en Chromium (~2 MB); un ticket ocupa KB. */
const MAX_HTML_CHARS = 1_500_000;
const DEFAULT_WIDTH = 460;
const DEFAULT_HEIGHT = 720;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(Math.max(n, min), max);
}

/** true si el webContents que llama es la web propia (vista principal, pantalla del cliente o una hija interna). */
export function isTrustedPrintSender(sender: WebContents): boolean {
  try {
    const url = sender.getURL();
    if (url === 'about:blank') return true;
    return isInternalUrl(url, getLoadUrl());
  } catch {
    return false;
  }
}

export function openPrintPreview(sender: WebContents, html: unknown, opts: unknown): PrintPreviewResult {
  if (!isTrustedPrintSender(sender)) {
    console.warn(`[printPreview] Rechazado desde webContents #${sender.id}: origen no interno`);
    return { success: false, error: 'Origen no permitido' };
  }
  if (typeof html !== 'string' || !html.trim()) {
    return { success: false, error: 'html debe ser una cadena no vacía' };
  }
  if (html.length > MAX_HTML_CHARS) {
    return { success: false, error: `El HTML supera el máximo (${MAX_HTML_CHARS} caracteres)` };
  }
  const o: PrintPreviewOptions = opts && typeof opts === 'object' ? (opts as PrintPreviewOptions) : {};

  const parent = BrowserWindow.fromWebContents(sender) ?? getMainWindow() ?? undefined;
  const win = new BrowserWindow({
    ...(parent && !parent.isDestroyed() ? { parent } : {}),
    width: clampInt(o.width, DEFAULT_WIDTH, 200, 2000),
    height: clampInt(o.height, DEFAULT_HEIGHT, 200, 2000),
    title: typeof o.title === 'string' && o.title.trim() ? o.title.slice(0, 120) : 'Imprimir',
    autoHideMenuBar: true,
    show: !o.silent,
    webPreferences: {
      // Sin preload: esta ventana no tiene acceso a window.goAdminDesktop.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);

  // Solo muestra el HTML recibido: ni navega ni abre ventanas.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (o.autoPrint) {
    win.webContents.once('did-finish-load', () => {
      if (win.isDestroyed()) return;
      win.webContents.print(
        {
          silent: !!o.silent,
          ...(typeof o.deviceName === 'string' && o.deviceName ? { deviceName: o.deviceName } : {}),
        },
        (ok, failureReason) => {
          if (!ok && failureReason && failureReason !== 'cancelled') {
            console.warn(`[printPreview] print() falló: ${failureReason}`);
          }
          if (!win.isDestroyed()) win.close();
        }
      );
    });
  }

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err) => {
    console.error('[printPreview] No se pudo cargar el HTML:', err);
    if (!win.isDestroyed()) win.close();
  });

  return { success: true };
}
