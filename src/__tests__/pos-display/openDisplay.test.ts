/**
 * openCustomerDisplay / closeCustomerDisplay (Parte D): abrir la pantalla del
 * cliente desde la caja en web (window.open con nombre fijo, aviso de
 * arrastrar la primera vez) y en escritorio (puente nativo, F1). Sin DOM: se
 * inyectan ventana, storage y puente.
 *
 * Ronda 2: el aviso de arrastrar solo se marca como visto cuando la UI llama
 * a `markCustomerDisplayHintShown` (después de pintarlo); el puente nativo
 * se espera (puede ser IPC asíncrono) y si rechaza se cae al camino web; ya
 * no se reabre por nombre para cerrar (parpadeaba y no alcanzaba la ventana
 * de otra pestaña).
 *
 * Ronda 3: `canCloseViaNativeBridge` es el único criterio (puente que SABE
 * cerrar) para ir por el puente y para habilitar «Cerrar» en la UI; y si el
 * puente cierra pero esta pestaña abrió además una ventana web de respaldo
 * (F1: `open()` del puente falló), se cierra también.
 */

import {
  CUSTOMER_DISPLAY_HINT_STORAGE_KEY,
  CUSTOMER_DISPLAY_ROUTE,
  CUSTOMER_DISPLAY_WINDOW_FEATURES,
  CUSTOMER_DISPLAY_WINDOW_NAME,
  __resetCustomerDisplayWindowForTests,
  canCloseViaNativeBridge,
  closeCustomerDisplay,
  getOpenedCustomerDisplayWindow,
  markCustomerDisplayHintShown,
  openCustomerDisplay,
  resolveNativePosDisplayApi,
  type DisplayWindowHandle,
  type DisplayWindowOpener,
  type HintStorage,
} from '@/lib/pos/display/openDisplay';

function fakeHandle(): DisplayWindowHandle & { focus: jest.Mock; close: jest.Mock } {
  const handle = {
    closed: false,
    focus: jest.fn(),
    close: jest.fn(() => {
      handle.closed = true;
    }),
  };
  return handle;
}

function fakeWindow(handle: DisplayWindowHandle | null): DisplayWindowOpener & { open: jest.Mock } {
  return { open: jest.fn(() => handle) };
}

function memoryStorage(initial: Record<string, string> = {}): HintStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

beforeEach(() => {
  __resetCustomerDisplayWindowForTests();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('constantes del PLAN §10', () => {
  it('ruta, nombre fijo y tamaño de la emergente', async () => {
    expect(CUSTOMER_DISPLAY_ROUTE).toBe('/pos-display');
    expect(CUSTOMER_DISPLAY_WINDOW_NAME).toBe('pos-display');
    expect(CUSTOMER_DISPLAY_WINDOW_FEATURES).toBe('popup,width=1280,height=800');
  });
});

describe('resolveNativePosDisplayApi', () => {
  it('sin ventana ni puente: null', async () => {
    expect(resolveNativePosDisplayApi(undefined)).toBeNull();
    expect(resolveNativePosDisplayApi({})).toBeNull();
    expect(resolveNativePosDisplayApi({ goAdminDesktop: {} })).toBeNull();
    expect(resolveNativePosDisplayApi({ goAdminDesktop: { posDisplay: {} } })).toBeNull(); // sin open(): Desktop < 0.2.1
  });
  it('acepta SOLO window.goAdminDesktop.posDisplay (el puente real del preload); ningún otro nombre', async () => {
    const api = { open: jest.fn() };
    expect(resolveNativePosDisplayApi({ goAdminDesktop: { posDisplay: api } })).toBe(api);
    expect(resolveNativePosDisplayApi({ otroPuente: { posDisplay: api } })).toBeNull();
  });
});

describe('canCloseViaNativeBridge', () => {
  it('solo es true con un puente que sabe abrir Y cerrar', () => {
    expect(canCloseViaNativeBridge(undefined)).toBe(false);
    expect(canCloseViaNativeBridge({})).toBe(false);
    expect(canCloseViaNativeBridge({ goAdminDesktop: { posDisplay: { open: jest.fn() } } })).toBe(false); // solo abre
    expect(canCloseViaNativeBridge({ goAdminDesktop: { posDisplay: { close: jest.fn() } } })).toBe(false); // sin open(): no es puente
    expect(canCloseViaNativeBridge({ goAdminDesktop: { posDisplay: { open: jest.fn(), close: jest.fn() } } })).toBe(true);
  });

  it('sin window (SSR): false', () => {
    expect(canCloseViaNativeBridge()).toBe(false);
  });
});

describe('openCustomerDisplay en web', () => {
  it('primera vez: abre con nombre fijo e informa de que toca avisar; NO escribe el flag (lo hace la UI tras pintar el toast)', async () => {
    const handle = fakeHandle();
    const win = fakeWindow(handle);
    const storage = memoryStorage();
    const result = await openCustomerDisplay({ win, storage, nativeApi: null });
    expect(result).toEqual({ via: 'web', firstTime: true });
    expect(win.open).toHaveBeenCalledWith(CUSTOMER_DISPLAY_ROUTE, CUSTOMER_DISPLAY_WINDOW_NAME, CUSTOMER_DISPLAY_WINDOW_FEATURES);
    expect(storage.getItem(CUSTOMER_DISPLAY_HINT_STORAGE_KEY)).toBeNull();
    expect(getOpenedCustomerDisplayWindow()).toBe(handle);
    // Si la UI no llegó a pintar el aviso, la siguiente apertura vuelve a pedirlo.
    handle.closed = true;
    expect(await openCustomerDisplay({ win: fakeWindow(fakeHandle()), storage, nativeApi: null })).toEqual({ via: 'web', firstTime: true });
    markCustomerDisplayHintShown(storage);
    expect(storage.getItem(CUSTOMER_DISPLAY_HINT_STORAGE_KEY)).toBe('1');
  });

  it('markCustomerDisplayHintShown sin storage o con storage que lanza: no lanza', () => {
    expect(() => markCustomerDisplayHintShown(null)).not.toThrow();
    const broken: HintStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(() => markCustomerDisplayHintShown(broken)).not.toThrow();
  });

  it('segunda vez con la ventana viva: solo enfoca, no abre otra', async () => {
    const handle = fakeHandle();
    const win = fakeWindow(handle);
    const storage = memoryStorage();
    await openCustomerDisplay({ win, storage, nativeApi: null });
    const again = await openCustomerDisplay({ win, storage, nativeApi: null });
    expect(again).toEqual({ via: 'focused' });
    expect(win.open).toHaveBeenCalledTimes(1);
    expect(handle.focus).toHaveBeenCalledTimes(1);
  });

  it('si el cajero cerró la ventana, se vuelve a abrir y ya no avisa (aviso recordado)', async () => {
    const first = fakeHandle();
    const storage = memoryStorage();
    await openCustomerDisplay({ win: fakeWindow(first), storage, nativeApi: null });
    markCustomerDisplayHintShown(storage);
    first.closed = true;
    const second = fakeHandle();
    const win = fakeWindow(second);
    expect(await openCustomerDisplay({ win, storage, nativeApi: null })).toEqual({ via: 'web', firstTime: false });
    expect(win.open).toHaveBeenCalledTimes(1);
    expect(getOpenedCustomerDisplayWindow()).toBe(second);
  });

  it('aviso ya recordado en otra sesión: firstTime false', async () => {
    const storage = memoryStorage({ [CUSTOMER_DISPLAY_HINT_STORAGE_KEY]: '1' });
    expect(await openCustomerDisplay({ win: fakeWindow(fakeHandle()), storage, nativeApi: null })).toEqual({ via: 'web', firstTime: false });
  });

  it('sin storage (modo privado bloqueado): abre igual y avisa siempre', async () => {
    expect(await openCustomerDisplay({ win: fakeWindow(fakeHandle()), storage: null, nativeApi: null })).toEqual({ via: 'web', firstTime: true });
  });

  it('storage que lanza: abre igual y avisa', async () => {
    const broken: HintStorage = {
      getItem: () => {
        throw new Error('QuotaExceeded');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(await openCustomerDisplay({ win: fakeWindow(fakeHandle()), storage: broken, nativeApi: null })).toEqual({ via: 'web', firstTime: true });
  });

  it('emergente bloqueada por el navegador: blocked, sin marcar el aviso y sin referencia', async () => {
    const storage = memoryStorage();
    expect(await openCustomerDisplay({ win: fakeWindow(null), storage, nativeApi: null })).toEqual({ via: 'blocked' });
    expect(storage.data[CUSTOMER_DISPLAY_HINT_STORAGE_KEY]).toBeUndefined();
    expect(getOpenedCustomerDisplayWindow()).toBeNull();
  });

  it('window.open que lanza: blocked y aviso por consola, nunca excepción', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const win: DisplayWindowOpener = {
      open: () => {
        throw new Error('SecurityError');
      },
    };
    expect(await openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: null })).toEqual({ via: 'blocked' });
    expect(warn).toHaveBeenCalled();
  });

  it('sin window (SSR): blocked', async () => {
    expect(await openCustomerDisplay({ win: null, storage: null, nativeApi: null })).toEqual({ via: 'blocked' });
  });
});

describe('openCustomerDisplay en escritorio (puente F1)', () => {
  it('usa el puente y no toca window.open ni el aviso', async () => {
    const api = { open: jest.fn(), close: jest.fn() };
    const win = fakeWindow(fakeHandle());
    const storage = memoryStorage();
    expect(await openCustomerDisplay({ win, storage, nativeApi: api })).toEqual({ via: 'electron' });
    expect(api.open).toHaveBeenCalledTimes(1);
    expect(win.open).not.toHaveBeenCalled();
    expect(storage.data[CUSTOMER_DISPLAY_HINT_STORAGE_KEY]).toBeUndefined();
  });

  it('si el puente falla (síncrono), cae al camino web (ventana normal en Electron, F0)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = {
      open: () => {
        throw new Error('ipc caído');
      },
    };
    const win = fakeWindow(fakeHandle());
    expect(await openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api })).toEqual({ via: 'web', firstTime: true });
    expect(win.open).toHaveBeenCalledTimes(1);
  });

  it('puente asíncrono (ipcRenderer.invoke) que rechaza: se espera, se avisa por consola y cae al camino web', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = { open: () => Promise.reject(new Error('monitor no disponible')) };
    const win = fakeWindow(fakeHandle());
    expect(await openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api })).toEqual({ via: 'web', firstTime: true });
    expect(win.open).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('puente asíncrono que resuelve: electron, sin window.open', async () => {
    const api = { open: () => Promise.resolve() };
    const win = fakeWindow(fakeHandle());
    expect(await openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api })).toEqual({ via: 'electron' });
    expect(win.open).not.toHaveBeenCalled();
  });

  it('puente real que resuelve { ok: true }: electron; y pasa displayId (o null = automático) junto al origen', async () => {
    const api = { open: jest.fn(() => Promise.resolve({ ok: true })) };
    const win = fakeWindow(fakeHandle());
    expect(await openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api, displayId: 2528732444 })).toEqual({ via: 'electron' });
    expect(api.open).toHaveBeenCalledWith({ origin: undefined, displayId: 2528732444 });
    expect(await openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api })).toEqual({ via: 'electron' });
    expect(api.open).toHaveBeenLastCalledWith({ origin: undefined, displayId: null });
    expect(win.open).not.toHaveBeenCalled();
  });

  it('puente real que contesta { ok: false, reason } (origen no permitido): se avisa y cae al camino web, como un rechazo', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = { open: jest.fn(() => Promise.resolve({ ok: false, reason: 'origen no permitido' })) };
    const win = fakeWindow(fakeHandle());
    expect(await openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api })).toEqual({ via: 'web', firstTime: true });
    expect(win.open).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][1])).toContain('origen no permitido');
  });
});

describe('closeCustomerDisplay', () => {
  it('escritorio: cierra por el puente si sabe cerrar', async () => {
    const api = { open: jest.fn(), close: jest.fn() };
    expect(await closeCustomerDisplay({ nativeApi: api, win: fakeWindow(null) })).toBe('electron');
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('puente sin close(): sigue por el camino web', async () => {
    const handle = fakeHandle();
    await openCustomerDisplay({ win: fakeWindow(handle), storage: memoryStorage(), nativeApi: null });
    expect(await closeCustomerDisplay({ nativeApi: { open: jest.fn() }, win: fakeWindow(null) })).toBe('handle');
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it('con referencia propia: la cierra y la olvida', async () => {
    const handle = fakeHandle();
    await openCustomerDisplay({ win: fakeWindow(handle), storage: memoryStorage(), nativeApi: null });
    expect(await closeCustomerDisplay({ nativeApi: null, win: fakeWindow(null) })).toBe('handle');
    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(getOpenedCustomerDisplayWindow()).toBeNull();
    expect(await closeCustomerDisplay({ nativeApi: null, win: fakeWindow(null) })).toBe('none');
  });

  it('sin referencia propia: none y NUNCA reabre por nombre (aunque el monitor de presencia vea una pantalla)', async () => {
    const win = fakeWindow(fakeHandle());
    expect(await closeCustomerDisplay({ nativeApi: null, win })).toBe('none');
    expect(await closeCustomerDisplay({ nativeApi: null, win, knownOpen: false })).toBe('none');
    expect(await closeCustomerDisplay({ nativeApi: null, win, knownOpen: true })).toBe('none');
    expect(win.open).not.toHaveBeenCalled();
  });

  it('puente asíncrono con close() que rechaza: se avisa y sigue por el camino web', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = fakeHandle();
    await openCustomerDisplay({ win: fakeWindow(handle), storage: memoryStorage(), nativeApi: null });
    const api = { open: jest.fn(), close: () => Promise.reject(new Error('ipc')) };
    expect(await closeCustomerDisplay({ nativeApi: api, win: fakeWindow(null) })).toBe('handle');
    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('sin window (SSR) y sin referencia: none, sin excepción', async () => {
    expect(await closeCustomerDisplay({ nativeApi: null, win: null })).toBe('none');
  });

  it('puente parcial (open() falló y se abrió la web de respaldo): cerrar por el puente cierra TAMBIÉN la ventana web', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = fakeHandle();
    const api = { open: () => Promise.reject(new Error('monitor no disponible')), close: jest.fn(() => Promise.resolve()) };
    expect(await openCustomerDisplay({ win: fakeWindow(handle), storage: memoryStorage(), nativeApi: api })).toEqual({ via: 'web', firstTime: true });
    expect(await closeCustomerDisplay({ nativeApi: api })).toBe('electron');
    expect(api.close).toHaveBeenCalledTimes(1);
    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(getOpenedCustomerDisplayWindow()).toBeNull();
  });

  it('puente que cierra y sin ventana web propia: electron y nada más que cerrar', async () => {
    const api = { open: jest.fn(), close: jest.fn(() => Promise.resolve()) };
    expect(await closeCustomerDisplay({ nativeApi: api })).toBe('electron');
    expect(getOpenedCustomerDisplayWindow()).toBeNull();
  });
});
