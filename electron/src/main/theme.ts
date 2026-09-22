import { BrowserWindow, nativeTheme } from 'electron';
import { broadcast } from './broadcast';
import { loadConfig, saveConfig } from './store';

/**
 * Tema de la ventana y de la barra de aplicación.
 *
 * La fuente de verdad es `nativeTheme`: `themeSource` guarda la preferencia
 * (`light` | `dark` | `system`) y `shouldUseDarkColors` el resultado. Hasta la
 * 0.2.2 `themeSource` se quedaba en `system`, así que la barra, el fondo de la
 * ventana, el splash y la pantalla sin conexión seguían al sistema operativo
 * aunque el usuario cambiara claro/oscuro en el header de la web («tomaba no
 * sé de dónde el light y el dark»). Ahora la web manda su preferencia por IPC
 * (`theme:set`, ver ipc.ts y `DesktopThemeSync.tsx` en el ERP), se persiste en
 * config.json y se aplica al arrancar ANTES de crear el splash y la ventana.
 *
 * Todo lo que pinta el proceso principal reacciona a `nativeTheme.on('updated')`
 * con los mismos colores:
 *  - `backgroundColor` de la ventana (lo que se ve antes de que pinte la web:
 *    sin esto aparecía el flash azul `#1e3a8a` de la primera versión),
 *  - el fondo del WebContentsView de la web,
 *  - el Window Controls Overlay de Windows (botones nativos min/max/cerrar),
 *  - la barra propia, que recibe `theme:state` por IPC,
 *  - el splash y la pantalla sin conexión (`prefers-color-scheme` deriva de
 *    `nativeTheme`), y la ventana hija de la pantalla del cliente, que hereda
 *    el mismo `nativeTheme` del proceso.
 */

/** Preferencia de tema, con los mismos valores que `next-themes` en la web. */
export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeColors {
  dark: boolean;
  /** Preferencia vigente (`nativeTheme.themeSource`). */
  source: ThemePreference;
  /** Fondo de la ventana y de la web mientras carga. */
  background: string;
  /** Fondo de la barra de aplicación y del overlay de controles nativos. */
  bar: string;
  /** Color de los símbolos (min/max/cerrar) del overlay nativo. */
  symbol: string;
}

/** Altura de la barra de aplicación, en px. Debe coincidir con toolbar.css. */
export const TOOLBAR_HEIGHT = 40;

const LIGHT = { background: '#f8fafc', bar: '#ffffff', symbol: '#0f172a' };
const DARK = { background: '#0f172a', bar: '#0b1220', symbol: '#e2e8f0' };

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value);
}

export function getThemePreference(): ThemePreference {
  const source: string = nativeTheme.themeSource;
  return isThemePreference(source) ? source : 'system';
}

export function getThemeColors(): ThemeColors {
  const dark = nativeTheme.shouldUseDarkColors;
  return { dark, source: getThemePreference(), ...(dark ? DARK : LIGHT) };
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
let resolveWindow: () => BrowserWindow | null = () => null;

/**
 * Suscribe una sola vez al cambio de tema (del sistema o por `themeSource`).
 * `getWindow` se resuelve en cada evento porque la ventana puede recrearse.
 */
export function watchTheme(getWindow: () => BrowserWindow | null): void {
  resolveWindow = getWindow;
  if (subscribed) return;
  subscribed = true;
  nativeTheme.on('updated', () => {
    const colors = applyTheme(resolveWindow());
    console.log(`[theme] Modo ${colors.dark ? 'oscuro' : 'claro'} (preferencia: ${colors.source})`);
  });
}

/**
 * Aplica la preferencia guardada en config.json a `nativeTheme.themeSource`.
 * Se llama en el arranque, antes de crear el splash y la ventana, para que
 * ambos nazcan ya del color correcto. Sin preferencia guardada (o con un
 * valor inválido) se sigue al sistema, como hasta ahora.
 */
export function initTheme(): ThemePreference {
  const saved: unknown = loadConfig().theme;
  const preference: ThemePreference = isThemePreference(saved) ? saved : 'system';
  nativeTheme.themeSource = preference;
  console.log(`[theme] Preferencia al arrancar: ${preference}`);
  return preference;
}

/**
 * Cambia la preferencia (viene de la web por `theme:set`), la persiste y
 * devuelve el estado resultante. Si el color efectivo cambia, `nativeTheme`
 * emite `updated` y `watchTheme` recolorea ventana y barra; si no cambia (p.
 * ej. sistema ya en oscuro y el usuario elige «oscuro»), se difunde igual el
 * estado para que `getTheme`/`onTheme` vean la nueva preferencia.
 */
export function setThemePreference(value: unknown): ThemeColors {
  if (!isThemePreference(value)) {
    throw new TypeError(`Tema inválido: ${String(value)} (se esperaba light | dark | system)`);
  }
  const changed = nativeTheme.themeSource !== value;
  if (changed) {
    nativeTheme.themeSource = value;
    try {
      saveConfig({ theme: value });
    } catch (err) {
      console.warn('[theme] No se pudo guardar la preferencia de tema:', err);
    }
  }
  // applyTheme es idempotente: si `updated` ya corrió, solo repite el broadcast.
  return applyTheme(resolveWindow());
}
