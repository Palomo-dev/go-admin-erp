import { BrowserWindow, nativeTheme } from 'electron';
import { broadcast } from './broadcast';

/**
 * Tema de la ventana y de la barra de aplicación.
 *
 * Sigue `nativeTheme.shouldUseDarkColors` (modo claro/oscuro del sistema) y
 * reacciona a `nativeTheme.on('updated')`. Los mismos colores se usan para:
 *  - `backgroundColor` de la ventana (lo que se ve antes de que pinte la web:
 *    sin esto aparecía el flash azul `#1e3a8a` de la primera versión),
 *  - el fondo del WebContentsView de la web,
 *  - el Window Controls Overlay de Windows (botones nativos min/max/cerrar),
 *  - la barra propia, que recibe `theme:state` por IPC.
 */

export interface ThemeColors {
  dark: boolean;
  /** Fondo de la ventana y de la web mientras carga. */
  background: string;
  /** Fondo de la barra de aplicación y del overlay de controles nativos. */
  bar: string;
  /** Color de los símbolos (min/max/cerrar) del overlay nativo. */
  symbol: string;
}

/** Altura de la barra de aplicación, en px. Debe coincidir con toolbar.css. */
export const TOOLBAR_HEIGHT = 40;

const LIGHT: ThemeColors = { dark: false, background: '#f8fafc', bar: '#ffffff', symbol: '#0f172a' };
const DARK: ThemeColors = { dark: true, background: '#0f172a', bar: '#0b1220', symbol: '#e2e8f0' };

export function getThemeColors(): ThemeColors {
  return nativeTheme.shouldUseDarkColors ? DARK : LIGHT;
}

/**
 * Aplica el tema actual a la ventana (fondo + overlay nativo) y lo difunde a
 * los renderers. Idempotente: se llama al crear la ventana y en cada cambio.
 */
export function applyTheme(win: BrowserWindow | null): ThemeColors {
  const colors = getThemeColors();
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(colors.background);
    // Solo Windows/Linux; en otras plataformas no existe el overlay.
    if (process.platform === 'win32' || process.platform === 'linux') {
      try {
        win.setTitleBarOverlay({ color: colors.bar, symbolColor: colors.symbol, height: TOOLBAR_HEIGHT });
      } catch {
        // La ventana pudo crearse sin titleBarOverlay (p. ej. en tests).
      }
    }
  }
  broadcast('theme:state', colors);
  return colors;
}

let subscribed = false;

/**
 * Suscribe una sola vez al cambio de tema del sistema. `getWindow` se resuelve
 * en cada evento porque la ventana puede recrearse.
 */
export function watchTheme(getWindow: () => BrowserWindow | null): void {
  if (subscribed) return;
  subscribed = true;
  nativeTheme.on('updated', () => {
    const colors = applyTheme(getWindow());
    console.log(`[theme] Sistema en modo ${colors.dark ? 'oscuro' : 'claro'}`);
  });
}
