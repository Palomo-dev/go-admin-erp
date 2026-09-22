/**
 * Abrir y cerrar la ventana de la pantalla del cliente desde la caja
 * (PLAN §5.1, §9 y §10).
 *
 * - Escritorio: si el puente nativo expone `posDisplay.open()` (Go Admin
 *   Desktop >= 0.2.1, `posDisplayWindow.ts`), se usa: coloca la ventana en el
 *   monitor secundario (o en el `displayId` elegido en Configuración) a
 *   pantalla completa. El puente se llama `window.goAdminDesktop.posDisplay`
 *   (contrato en `src/lib/utils/desktop.ts`); no hay ningún otro nombre.
 *   `open()` resuelve `{ ok, reason }`: un `ok: false` (origen no permitido,
 *   opciones inválidas) cuenta como fallo y se cae al camino web, igual que
 *   un rechazo.
 * - Web: `window.open('/pos-display', 'pos-display', 'popup,…')`. El nombre
 *   fijo evita duplicados: si la ventana ya existe se enfoca en vez de abrir
 *   otra. El navegador no puede mover una ventana a otro monitor sin permiso,
 *   así que la primera vez se avisa «arrastre la ventana… y pulse F11». Este
 *   módulo solo INFORMA (`firstTime`) de que toca avisar; quien muestra el
 *   aviso llama después a `markCustomerDisplayHintShown()`, que lo recuerda en
 *   localStorage (`pos_display_hint_shown`). Así el aviso no se da por visto
 *   si la UI no llegó a pintarlo.
 * - El puente nativo es asíncrono (en F1 será `ipcRenderer.invoke`): se
 *   espera su promesa y, si rechaza, se cae al camino web.
 * - Cerrar: puente nativo (solo si sabe cerrar: `canCloseViaNativeBridge`, y
 *   solo si TIENE ventana: `bridgeWindowOpen`, o `status()` del puente si no
 *   se pasa) → referencia propia → 'none'. Si el puente cierra pero además hay una
 *   ventana web propia viva (F1: `open()` del puente falló por monitor ausente
 *   y se cayó al camino web), se cierra también; si no, quedaría huérfana y
 *   «Cerrar» parecería haber funcionado. Sin referencia propia (la caja se
 *   recargó, o la pantalla la abrió otra pestaña) no se intenta reabrir por
 *   nombre: `window.open('', 'pos-display')` solo alcanza ventanas
 *   del mismo grupo de contextos y en el resto de casos crea una emergente en
 *   blanco que parpadea. El cierre real entre pestañas necesita un mensaje de
 *   bajada `close` en el protocolo (Parte A); queda anotado para integración.
 *
 * Sin React: recibe sus dependencias (ventana, storage, puente nativo) para
 * poder probarse en Node; en el navegador usa las reales por defecto.
 */

import { CUSTOMER_DISPLAY_ROUTE } from './route';
import { isDesktopPosDisplayStatus, readSavedDisplayIdFromBrowser } from './desktopDisplay';

// La ruta vive en route.ts (junto a isCustomerDisplayPath, que usa el layout raíz); se reexporta por compatibilidad.
export { CUSTOMER_DISPLAY_ROUTE };
export const CUSTOMER_DISPLAY_WINDOW_NAME = 'pos-display';
export const CUSTOMER_DISPLAY_WINDOW_FEATURES = 'popup,width=1280,height=800';
/** localStorage: '1' cuando ya se mostró el aviso de arrastrar la ventana. */
export const CUSTOMER_DISPLAY_HINT_STORAGE_KEY = 'pos_display_hint_shown';

/** Lo que el puente de escritorio expondrá en F1 (`pos-display:open` / `pos-display:close`). */
export interface NativePosDisplayApi {
  /**
   * `origin` es el de ESTA ventana del POS: en escritorio la web corre en un
   * Next embebido y el proceso principal debe cargar `${origin}/pos-display`
   * con la misma session, no una URL cableada (localhost vs 127.0.0.1 no
   * comparten BroadcastChannel; con el relay del proceso principal da igual,
   * pero la marca y el localStorage del terminal sí dependen del origen).
   */
  open(opts?: { origin?: string; displayId?: number | null }): unknown;
  close?(): unknown;
  /** Estado de la ventana hija (`{ open, displayId }`); `closeCustomerDisplay` lo consulta si no le pasan `bridgeWindowOpen`. */
  status?(): unknown;
}

/** Respuesta de `open()` del puente real (`posDisplayIpc.ts`): `{ ok, reason? }`. Otros valores cuentan como éxito. */
function openWasRejected(result: unknown): result is { ok: false; reason?: string } {
  return typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false;
}

/** Subconjunto de `Window` que se usa; permite inyectar uno en pruebas. */
export interface DisplayWindowHandle {
  closed: boolean;
  focus(): void;
  close(): void;
}

export interface DisplayWindowOpener {
  open(url: string, name: string, features?: string): DisplayWindowHandle | null;
}

export interface HintStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OpenCustomerDisplayDeps {
  win?: DisplayWindowOpener | null;
  storage?: HintStorage | null;
  /** null fuerza el camino web aunque exista puente (pruebas). undefined = detectar. */
  nativeApi?: NativePosDisplayApi | null;
  /**
   * Monitor en el que abrir (solo escritorio). `undefined` = el elegido en
   * Configuración › POS para esta máquina (localStorage, desktopDisplay.ts),
   * o automático si no hay; `null` = automático a la fuerza: el proceso
   * principal elige el secundario. En web se ignora.
   */
  displayId?: number | null;
}

export type OpenCustomerDisplayResult =
  /** La abrió el puente de escritorio; nada que arrastrar. */
  | { via: 'electron' }
  /** Ventana emergente web. `firstTime`: hay que mostrar el aviso de arrastrar y F11. */
  | { via: 'web'; firstTime: boolean }
  /** La ventana ya estaba abierta por esta misma caja: solo se enfocó. */
  | { via: 'focused' }
  /** El navegador bloqueó la emergente (o no hay `window`). */
  | { via: 'blocked' };

export type CloseCustomerDisplayResult = 'electron' | 'handle' | 'none';

/** Referencia a la ventana abierta por ESTA pestaña de caja; se pierde al recargar (entonces vale el nombre fijo). */
let displayWindow: DisplayWindowHandle | null = null;

type BridgeCarrier = {
  goAdminDesktop?: { posDisplay?: Partial<NativePosDisplayApi> };
};

/** Puente nativo (`window.goAdminDesktop.posDisplay`) si existe y sabe abrir; null en el navegador o en un Desktop < 0.2.1. */
export function resolveNativePosDisplayApi(carrier: unknown = typeof window === 'undefined' ? undefined : window): NativePosDisplayApi | null {
  if (typeof carrier !== 'object' || carrier === null) return null;
  const { goAdminDesktop } = carrier as BridgeCarrier;
  const candidate = goAdminDesktop?.posDisplay;
  if (!candidate || typeof candidate.open !== 'function') return null;
  return candidate as NativePosDisplayApi;
}

/**
 * ¿El puente nativo sabe CERRAR? Es el único criterio que usa
 * `closeCustomerDisplay` para ir por el puente, y el que la UI debe usar para
 * habilitar «Cerrar»: un puente que solo sabe abrir no cuenta.
 */
export function canCloseViaNativeBridge(carrier: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  return typeof resolveNativePosDisplayApi(carrier)?.close === 'function';
}

function defaultWindow(): DisplayWindowOpener | null {
  return typeof window === 'undefined' ? null : window;
}

function defaultStorage(): HintStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // storage bloqueado por el navegador
  }
}

/** ¿Hay que mostrar el aviso de arrastrar y F11? Solo lee. Sin storage (o storage roto): se avisa siempre. */
function isFirstTimeHint(storage: HintStorage | null): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(CUSTOMER_DISPLAY_HINT_STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

/**
 * Recuerda que el aviso «arrastre la ventana… y pulse F11» YA se mostró. Lo
 * llama la UI justo después de pintar el toast, nunca este módulo: si el
 * aviso no llega a verse, la siguiente apertura vuelve a avisar.
 */
export function markCustomerDisplayHintShown(storage: HintStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(CUSTOMER_DISPLAY_HINT_STORAGE_KEY, '1');
  } catch {
    // Cuota llena o storage bloqueado: se avisará otra vez; no es grave.
  }
}

/** Ventana abierta por esta pestaña y todavía viva; null si no la hay. */
export function getOpenedCustomerDisplayWindow(): DisplayWindowHandle | null {
  if (displayWindow === null) return null;
  try {
    if (displayWindow.closed) displayWindow = null;
  } catch {
    displayWindow = null;
  }
  return displayWindow;
}

/** Solo para pruebas: olvida la referencia a la ventana abierta. */
export function __resetCustomerDisplayWindowForTests(): void {
  displayWindow = null;
}

/**
 * Origen de la ventana del POS que abre la pantalla, para que el proceso
 * principal cargue exactamente el mismo (`${origin}/pos-display`). Con una
 * ventana inyectada sin `location` (pruebas) o sin `window` (SSR) devuelve
 * undefined y el puente decide.
 */
function currentOrigin(win: DisplayWindowOpener | null | undefined): string | undefined {
  try {
    const candidate = (win === undefined ? (typeof window !== 'undefined' ? window : null) : win) as
      | { location?: { origin?: unknown } }
      | null;
    const origin = candidate?.location?.origin;
    return typeof origin === 'string' && origin.length > 0 ? origin : undefined;
  } catch {
    return undefined;
  }
}

export async function openCustomerDisplay(deps: OpenCustomerDisplayDeps = {}): Promise<OpenCustomerDisplayResult> {
  const nativeApi = deps.nativeApi === undefined ? resolveNativePosDisplayApi() : deps.nativeApi;
  if (nativeApi) {
    try {
      // `await` cubre tanto un puente síncrono como uno que devuelva promesa (IPC de F1).
      // El proceso principal no consulta su monitor guardado al abrir a petición (solo al arrancar),
      // así que se le pasa el elegido en esta máquina; sin elección, automático.
      const displayId = deps.displayId === undefined ? readSavedDisplayIdFromBrowser() : deps.displayId;
      const result = await nativeApi.open({ origin: currentOrigin(deps.win), displayId });
      if (openWasRejected(result)) {
        // El proceso principal contestó, pero no abrió (origen no interno, opciones inválidas): mismo trato que un rechazo.
        console.warn('[pos-display] el puente de escritorio no abrió la pantalla', result.reason ?? 'sin motivo');
      } else {
        return { via: 'electron' };
      }
    } catch (err) {
      // El puente falló: se sigue por el camino web, que en Electron abre una ventana normal (F0).
      console.warn('[pos-display] el puente de escritorio no pudo abrir la pantalla', err);
    }
  }

  const existing = getOpenedCustomerDisplayWindow();
  if (existing) {
    try {
      existing.focus();
    } catch {
      // Enfocar puede fallar sin gesto del usuario; la ventana sigue abierta igual.
    }
    return { via: 'focused' };
  }

  const win = deps.win === undefined ? defaultWindow() : deps.win;
  if (!win) return { via: 'blocked' };
  let handle: DisplayWindowHandle | null = null;
  try {
    handle = win.open(CUSTOMER_DISPLAY_ROUTE, CUSTOMER_DISPLAY_WINDOW_NAME, CUSTOMER_DISPLAY_WINDOW_FEATURES);
  } catch (err) {
    console.warn('[pos-display] window.open falló', err);
  }
  if (!handle) return { via: 'blocked' };
  displayWindow = handle;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  return { via: 'web', firstTime: isFirstTimeHint(storage) };
}

export interface CloseCustomerDisplayDeps {
  /** Se acepta por compatibilidad con la firma anterior; hoy no se usa: ya no se reabre por nombre. */
  win?: DisplayWindowOpener | null;
  nativeApi?: NativePosDisplayApi | null;
  /**
   * Reservado: que el monitor de presencia vea una pantalla NO basta para
   * alcanzarla (puede haberla abierto otra pestaña). Se ignora hasta que el
   * protocolo tenga el mensaje de bajada `close` (Parte A); entonces servirá
   * para decidir si se envía. No confundir con `bridgeWindowOpen`.
   */
  knownOpen?: boolean;
  /**
   * ¿El puente de escritorio TIENE ventana hija (`status().open`)? Lo pasa el
   * indicador, que ya lo sabe por `useDesktopDisplayWindow`. Con `false` no se
   * llama a `close()` del puente (sería un no-op silencioso que se daba por
   * cierre) y se sigue a la referencia propia → 'handle' o 'none' (con el
   * toast «ciérrela donde la abrió»), igual que en el navegador. `undefined`
   * = consultar `status()` del puente si lo tiene; sin `status` se cierra
   * como antes.
   */
  bridgeWindowOpen?: boolean;
}

/** Cierra la ventana abierta por esta pestaña, si sigue viva, y olvida la referencia. Devuelve si había una. */
function closeOwnWindow(): boolean {
  const existing = getOpenedCustomerDisplayWindow();
  if (!existing) return false;
  try {
    existing.close();
  } catch (err) {
    console.warn('[pos-display] no se pudo cerrar la ventana de la pantalla', err);
  }
  displayWindow = null;
  return true;
}

/**
 * ¿El puente tiene ventana que cerrar? `bridgeWindowOpen` explícito manda;
 * si no, se pregunta a `status()` (validado: basura o fallo cuentan como
 * «no se sabe» → se cierra como antes). Nunca lanza.
 */
async function bridgeHasWindow(nativeApi: NativePosDisplayApi, bridgeWindowOpen: boolean | undefined): Promise<boolean> {
  if (typeof bridgeWindowOpen === 'boolean') return bridgeWindowOpen;
  if (typeof nativeApi.status !== 'function') return true;
  try {
    const raw: unknown = await nativeApi.status();
    return isDesktopPosDisplayStatus(raw) ? raw.open : true;
  } catch {
    return true;
  }
}

export async function closeCustomerDisplay(deps: CloseCustomerDisplayDeps = {}): Promise<CloseCustomerDisplayResult> {
  const nativeApi = deps.nativeApi === undefined ? resolveNativePosDisplayApi() : deps.nativeApi;
  // Con presencia por el relay pero sin ventana hija (emergente web abierta como fallback tras un
  // open() rechazado, y la caja recargada), close() del puente no cerraba nada y devolvía 'electron':
  // el cajero no recibía el aviso de cerrarla donde la abrió. Solo se va por el puente si tiene ventana.
  if (nativeApi && typeof nativeApi.close === 'function' && (await bridgeHasWindow(nativeApi, deps.bridgeWindowOpen))) {
    try {
      await nativeApi.close();
      // Si además esta pestaña abrió una ventana web (el puente no pudo abrir y
      // se cayó al camino web), se cierra también: no debe quedar huérfana.
      closeOwnWindow();
      return 'electron';
    } catch (err) {
      console.warn('[pos-display] el puente de escritorio no pudo cerrar la pantalla', err);
    }
  }

  if (closeOwnWindow()) return 'handle';

  // Sin referencia propia no hay forma segura de alcanzar la ventana desde
  // aquí (ver cabecera): la UI avisa al cajero de que la cierre donde se abrió.
  return 'none';
}
