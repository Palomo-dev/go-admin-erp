/**
 * Tester Fase 1 (Electron), ronda 1: pruebas adversariales sobre la
 * integración web del puente `window.goAdminDesktop.posDisplay`
 * (desktopDisplay.ts, openDisplay.ts, desktop.ts). Sin React ni DOM.
 *
 * Complementa desktop-display.test.ts del builder con los huecos que
 * encontré: la elección de monitor guardada en esta máquina llega de verdad
 * a `open()` leyendo `window.localStorage`; un Desktop 0.2.0 (posDisplay
 * solo con relay) o 0.2.1 a medias no habilita nada; `open()` sin respuesta
 * (preload viejo) cuenta como éxito; y valores raros en el storage.
 *
 * Hallazgos de la ronda 1 corregidos en la ronda 2 (ver desktop-display-r2.test.ts):
 * «abierta sin señal» ya no se acusa cuando la caja no emite (interruptor de
 * la organización apagado o aún cargando: `emitting` entra en el criterio),
 * y el toggle de la organización manda `undefined` (conserva el monitor del
 * proceso principal) cuando la copia de localStorage se perdió.
 */

import {
  DESKTOP_DISPLAY_ID_STORAGE_KEY,
  describeDisplay,
  getDesktopPosDisplayBridge,
  isDesktopDisplayInfo,
  listDesktopDisplays,
  nextOpenedAt,
  readDesktopDisplayStatus,
  readSavedDisplayId,
  readSavedDisplayIdFromBrowser,
  resolveDesktopWindowSignal,
  resolveSelectedDisplayId,
  saveDisplayIdInBrowser,
  supportsDesktopDisplayPicker,
  supportsDesktopDisplayStatus,
  type DisplayIdStorage,
} from '@/lib/pos/display/desktopDisplay';
import {
  __resetCustomerDisplayWindowForTests,
  canCloseViaNativeBridge,
  closeCustomerDisplay,
  openCustomerDisplay,
  resolveNativePosDisplayApi,
} from '@/lib/pos/display/openDisplay';
import { STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { getDesktopBridge, isDesktop } from '@/lib/utils/desktop';
import type { DesktopDisplayInfo, DesktopPosDisplayBridge } from '@/lib/utils/desktop';

const PRIMARIO: DesktopDisplayInfo = { id: 10, label: 'Principal', isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
const SECUNDARIO: DesktopDisplayInfo = { id: 20, label: 'TV', isPrimary: false, bounds: { x: 1920, y: 0, width: 1366, height: 768 } };

type GlobalConVentana = { window?: { goAdminDesktop?: unknown; localStorage?: DisplayIdStorage; location?: { origin: string } } };

function memoryStorage(initial: Record<string, string> = {}): DisplayIdStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

/** Instala un `window` mínimo: puente, localStorage y origen. Se borra ENTERO en afterEach (no basta con dejar la clave en undefined). */
function instalarVentana(opts: { bridge?: unknown; storage?: DisplayIdStorage; origin?: string } = {}) {
  const g = globalThis as GlobalConVentana;
  g.window = {
    ...(opts.bridge !== undefined ? { goAdminDesktop: opts.bridge } : {}),
    ...(opts.storage ? { localStorage: opts.storage } : {}),
    location: { origin: opts.origin ?? 'http://localhost:47800' },
  };
}

afterEach(() => {
  delete (globalThis as GlobalConVentana).window;
  __resetCustomerDisplayWindowForTests();
  jest.restoreAllMocks();
});

describe('elección de monitor de esta máquina → open() del puente', () => {
  it('sin displayId en deps, openCustomerDisplay pasa el monitor guardado en localStorage y el origen real de la ventana', async () => {
    const open = jest.fn(async () => ({ ok: true }));
    const storage = memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '20' });
    instalarVentana({ bridge: { posDisplay: { open } }, storage, origin: 'http://localhost:47801' });
    // Sin `win`/`nativeApi` en deps: detecta el puente y el origen del `window` real (aquí, el simulado).
    const result = await openCustomerDisplay({ storage });
    expect(result).toEqual({ via: 'electron' });
    expect(open).toHaveBeenCalledWith({ origin: 'http://localhost:47801', displayId: 20 });
  });

  it('deps.displayId = null fuerza automático aunque haya monitor guardado', async () => {
    const open = jest.fn(async () => ({ ok: true }));
    const storage = memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '20' });
    instalarVentana({ bridge: { posDisplay: { open } }, storage });
    await openCustomerDisplay({ displayId: null });
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ displayId: null }));
  });

  it('localStorage con basura ("abc") → automático (null), sin lanzar', async () => {
    const open = jest.fn(async () => ({ ok: true }));
    instalarVentana({ bridge: { posDisplay: { open } }, storage: memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'abc' }) });
    await openCustomerDisplay();
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ displayId: null }));
  });

  it('open() de un preload que no devuelve nada (undefined) cuenta como éxito: no se cae al camino web', async () => {
    const open = jest.fn(() => undefined);
    const win = { open: jest.fn() };
    const result = await openCustomerDisplay({ nativeApi: { open }, win, storage: null });
    expect(result).toEqual({ via: 'electron' });
    expect(win.open).not.toHaveBeenCalled();
  });

  it('el monitor guardado se conserva en el navegador entre lecturas y null lo borra', () => {
    const storage = memoryStorage();
    instalarVentana({ storage });
    saveDisplayIdInBrowser(20);
    expect(readSavedDisplayIdFromBrowser()).toBe(20);
    saveDisplayIdInBrowser(null);
    expect(readSavedDisplayIdFromBrowser()).toBeNull();
    expect(storage.data).toEqual({});
  });
});

describe('degradación: Desktop 0.2.0 (solo relay) y puentes a medias', () => {
  it('posDisplay con send/onMessage pero sin open/close/status/listDisplays: nada nativo, camino web, «Cerrar» deshabilitado', async () => {
    const bridge: DesktopPosDisplayBridge = { send: jest.fn(), onMessage: jest.fn(() => () => {}) };
    instalarVentana({ bridge: { posDisplay: bridge } });
    expect(isDesktop()).toBe(true);
    expect(getDesktopPosDisplayBridge()).toBe(bridge);
    expect(supportsDesktopDisplayPicker(bridge)).toBe(false);
    expect(supportsDesktopDisplayStatus(bridge)).toBe(false);
    expect(resolveNativePosDisplayApi()).toBeNull();
    expect(canCloseViaNativeBridge()).toBe(false);
    expect(await listDesktopDisplays(bridge)).toEqual([]);
    expect(await readDesktopDisplayStatus(bridge)).toBeNull();

    const win = { open: jest.fn(() => ({ closed: false, focus: jest.fn(), close: jest.fn() })) };
    const result = await openCustomerDisplay({ win, storage: null });
    expect(result).toEqual({ via: 'web', firstTime: true });
    expect(win.open).toHaveBeenCalledTimes(1);
  });

  it('goAdminDesktop sin posDisplay (Desktop 0.1.x): el puente de pantalla es null y openCustomerDisplay va por web', async () => {
    instalarVentana({ bridge: { version: async () => '0.1.3' } });
    expect(getDesktopBridge()).not.toBeNull();
    expect(getDesktopPosDisplayBridge()).toBeNull();
    expect(canCloseViaNativeBridge()).toBe(false);
    const win = { open: jest.fn(() => null) };
    expect(await openCustomerDisplay({ win, storage: null })).toEqual({ via: 'blocked' });
  });

  it('puente que sabe abrir pero no cerrar: closeCustomerDisplay no lo usa y, sin ventana propia, devuelve none', async () => {
    const open = jest.fn(async () => ({ ok: true }));
    instalarVentana({ bridge: { posDisplay: { open } } });
    expect(canCloseViaNativeBridge()).toBe(false);
    expect(await closeCustomerDisplay()).toBe('none');
  });

  it('status/onStatus presentes pero listDisplays ausente: hay estado de ventana (indicador) pero NO selector (tarjeta)', () => {
    const bridge: DesktopPosDisplayBridge = {
      send: jest.fn(),
      onMessage: jest.fn(() => () => {}),
      open: jest.fn(),
      status: jest.fn(),
      onStatus: jest.fn(() => () => {}),
      setEnabled: jest.fn(),
    };
    expect(supportsDesktopDisplayStatus(bridge)).toBe(true);
    expect(supportsDesktopDisplayPicker(bridge)).toBe(false);
  });
});

describe('valores raros que cruzan el storage o el IPC (documentan tolerancias, no bloquean)', () => {
  it('readSavedDisplayId (ronda 3): "", "1e3" y " 5 " ya no se convierten (solo dígitos) → null, sin romper', () => {
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '' }))).toBeNull();
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '1e3' }))).toBeNull();
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: ' 5 ' }))).toBeNull();
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '5' }))).toBe(5);
    // Un id inexistente nunca se preselecciona: resolveSelectedDisplayId exige que esté conectado.
    expect(resolveSelectedDisplayId([PRIMARIO, SECUNDARIO], 0, null)).toBeNull();
  });

  it('isDesktopDisplayInfo acepta bounds con NaN (typeof number) y la etiqueta sale «NaN×NaN»', () => {
    const raro = { id: 3, label: 'X', isPrimary: false, bounds: { x: 0, y: 0, width: Number.NaN, height: Number.NaN } };
    expect(isDesktopDisplayInfo(raro)).toBe(true);
    expect(describeDisplay(raro).size).toBe('NaN×NaN');
  });

  it('un monitor guardado que es el PRINCIPAL se respeta (elección explícita), igual que hace pickDisplay en el proceso principal', () => {
    expect(resolveSelectedDisplayId([PRIMARIO, SECUNDARIO], PRIMARIO.id, null)).toBe(PRIMARIO.id);
  });
});

describe('«abierta sin señal»: bordes del reloj', () => {
  it('justo en la gracia (now − openedAt = STALE_AFTER_MS) ya acusa; un ms antes no', () => {
    const abierta = { open: true, displayId: 20 };
    expect(resolveDesktopWindowSignal(abierta, false, 1000, 1000 + STALE_AFTER_MS - 1)).toBe('open');
    expect(resolveDesktopWindowSignal(abierta, false, 1000, 1000 + STALE_AFTER_MS)).toBe('open-no-signal');
  });

  it('un status repetido «abierta» (el puente reemite al traer al frente) NO reinicia la gracia', () => {
    const abierta = { open: true, displayId: 20 };
    const t0 = nextOpenedAt(null, abierta, null, 1000);
    expect(t0).toBe(1000);
    expect(nextOpenedAt(abierta, abierta, t0, 5000)).toBe(1000);
  });

  it('cerrar y reabrir reinicia la gracia (openedAt nuevo)', () => {
    const abierta = { open: true, displayId: 20 };
    const cerrada = { open: false, displayId: null };
    const t0 = nextOpenedAt(null, abierta, null, 1000);
    const cerradaAt = nextOpenedAt(abierta, cerrada, t0, 2000);
    expect(cerradaAt).toBeNull();
    expect(nextOpenedAt(cerrada, abierta, cerradaAt, 9000)).toBe(9000);
  });

  it('con la caja SIN emitir (organización apagada o cargando) no se acusa «sin señal» aunque la ventana lleve abierta más de la gracia', () => {
    // Con reason === 'disabled' la caja no tiene transporte y `connected` es false por definición:
    // la falta de señal es la esperada, no un canal roto. El indicador dirá «desactivada».
    expect(resolveDesktopWindowSignal({ open: true, displayId: 20 }, false, 0, STALE_AFTER_MS * 2, STALE_AFTER_MS, false)).toBe('open');
  });

  it('con la caja EMITIENDO y la ventana abierta más de la gracia sin señal: open-no-signal (canal roto)', () => {
    expect(resolveDesktopWindowSignal({ open: true, displayId: 20 }, false, 0, STALE_AFTER_MS * 2, STALE_AFTER_MS, true)).toBe('open-no-signal');
  });
});
