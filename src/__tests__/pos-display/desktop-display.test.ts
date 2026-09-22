/**
 * Fase 1 (Electron en la segunda pantalla): lógica pura de
 * `src/lib/pos/display/desktopDisplay.ts` con un puente FALSO que imita
 * `window.goAdminDesktop.posDisplay` (electron/src/main/posDisplayIpc.ts).
 * Sin React ni DOM: se prueba lo que el hook `useDesktopDisplayWindow` y la
 * tarjeta «Pantalla del cliente» consumen.
 *
 * Cubre: capacidad (puente completo vs Desktop < 0.2.1 vs navegador),
 * etiqueta del monitor, monitor preseleccionado, «abierta sin señal», y las
 * lecturas seguras (status/listDisplays/onStatus que fallan o devuelven
 * basura nunca lanzan).
 */

import {
  DESKTOP_DISPLAY_ID_STORAGE_KEY,
  describeDisplay,
  findDisplay,
  formatDisplayOption,
  getDesktopPosDisplayBridge,
  isDesktopDisplayInfo,
  isDesktopPosDisplayStatus,
  listDesktopDisplays,
  nextOpenedAt,
  persistDesktopDisplayChoice,
  readDesktopDisplayStatus,
  readSavedDisplayId,
  resolveDesktopWindowSignal,
  resolveSelectedDisplayId,
  saveDisplayId,
  subscribeDesktopDisplayStatus,
  supportsDesktopDisplayPicker,
  supportsDesktopDisplayStatus,
  type DisplayIdStorage,
} from '@/lib/pos/display/desktopDisplay';
import { openCustomerDisplay, __resetCustomerDisplayWindowForTests } from '@/lib/pos/display/openDisplay';
import { STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { isDesktop } from '@/lib/utils/desktop';
import type { DesktopDisplayInfo, DesktopPosDisplayBridge, DesktopPosDisplayStatus } from '@/lib/utils/desktop';

const PRINCIPAL: DesktopDisplayInfo = { id: 2528732444, label: 'DELL U2412M', isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1200 } };
const SECUNDARIO: DesktopDisplayInfo = { id: 2779098405, label: 'LG TV', isPrimary: false, bounds: { x: 1920, y: 0, width: 1366, height: 768 } };
const SIN_NOMBRE: DesktopDisplayInfo = { id: 7, label: '  ', isPrimary: false, bounds: { x: 0, y: 0, width: 1024.4, height: 768.6 } };

/** Puente falso completo (Desktop >= 0.2.1) con estado en memoria y `onStatus` que avisa. */
function fakeBridge(displays: DesktopDisplayInfo[] = [PRINCIPAL, SECUNDARIO]) {
  const listeners = new Set<(s: DesktopPosDisplayStatus) => void>();
  let status: DesktopPosDisplayStatus = { open: false, displayId: null };
  const saved: Array<[boolean, number | null | undefined]> = [];
  const bridge = {
    send: jest.fn(),
    onMessage: jest.fn(() => () => {}),
    open: jest.fn(async (opts?: { origin?: string; displayId?: number | null }) => {
      status = { open: true, displayId: opts?.displayId ?? (displays.find((d) => !d.isPrimary)?.id ?? null) };
      for (const l of listeners) l(status);
      return { ok: true };
    }),
    close: jest.fn(async () => {
      status = { open: false, displayId: null };
      for (const l of listeners) l(status);
    }),
    status: jest.fn(async () => status),
    onStatus: jest.fn((handler: (s: DesktopPosDisplayStatus) => void) => {
      listeners.add(handler);
      return () => listeners.delete(handler);
    }),
    listDisplays: jest.fn(async () => displays),
    setEnabled: jest.fn(async (enabled: boolean, displayId?: number | null) => {
      saved.push([enabled, displayId]);
    }),
  };
  return { bridge: bridge as DesktopPosDisplayBridge & typeof bridge, saved, listeners };
}

/** Desktop < 0.2.1: solo el relay de mensajes, sin ventana. */
function oldBridge(): DesktopPosDisplayBridge {
  return { send: jest.fn(), onMessage: jest.fn(() => () => {}) };
}

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

/**
 * Instala (o, con undefined, RETIRA) el puente. Retirar es `delete`, no asignar
 * undefined: `isDesktop()` mira `'goAdminDesktop' in window`, y una clave
 * presente con valor undefined hacía que los tests siguientes creyeran estar
 * en el escritorio.
 */
function instalarPuente(posDisplay: unknown) {
  const w = globalThis as unknown as { window?: { goAdminDesktop?: { posDisplay?: unknown } } };
  if (!w.window) w.window = {};
  if (posDisplay === undefined) delete w.window.goAdminDesktop;
  else w.window.goAdminDesktop = { posDisplay };
}

afterEach(() => {
  instalarPuente(undefined);
  expect(isDesktop()).toBe(false);
  __resetCustomerDisplayWindowForTests();
  jest.restoreAllMocks();
});

describe('capacidad del puente', () => {
  it('navegador (sin goAdminDesktop): no hay puente, ni selector ni estado', () => {
    instalarPuente(undefined);
    expect(isDesktop()).toBe(false);
    expect(getDesktopPosDisplayBridge()).toBeNull();
    expect(supportsDesktopDisplayPicker(null)).toBe(false);
    expect(supportsDesktopDisplayStatus(undefined)).toBe(false);
  });

  it('Desktop < 0.2.1 (puente sin listDisplays): comportamiento web, sin lanzar', async () => {
    const bridge = oldBridge();
    instalarPuente(bridge);
    expect(getDesktopPosDisplayBridge()).toBe(bridge);
    expect(supportsDesktopDisplayPicker(bridge)).toBe(false);
    expect(supportsDesktopDisplayStatus(bridge)).toBe(false);
    expect(await listDesktopDisplays(bridge)).toEqual([]);
    expect(await readDesktopDisplayStatus(bridge)).toBeNull();
    expect(await persistDesktopDisplayChoice(bridge, true, 1)).toBe(false);
    const off = subscribeDesktopDisplayStatus(bridge, () => undefined);
    expect(() => off()).not.toThrow();
  });

  it('Desktop >= 0.2.1 (listDisplays + open + setEnabled + status): selector y estado disponibles', () => {
    const { bridge } = fakeBridge();
    instalarPuente(bridge);
    expect(getDesktopPosDisplayBridge()).toBe(bridge);
    expect(supportsDesktopDisplayPicker(bridge)).toBe(true);
    expect(supportsDesktopDisplayStatus(bridge)).toBe(true);
  });

  it('un puente a medias (listDisplays sin setEnabled) no habilita el selector', () => {
    const { bridge } = fakeBridge();
    const parcial = { ...bridge, setEnabled: undefined };
    expect(supportsDesktopDisplayPicker(parcial)).toBe(false);
    // …pero sí el estado, que solo necesita status + onStatus.
    expect(supportsDesktopDisplayStatus(parcial)).toBe(true);
  });

  it('goAdminDesktop.posDisplay que no es un objeto: null', () => {
    instalarPuente('x');
    expect(getDesktopPosDisplayBridge()).toBeNull();
  });
});

describe('etiqueta del monitor', () => {
  it('nombre · tamaño, y «principal» (palabra traducida que pasa la UI) solo en el primario', () => {
    expect(formatDisplayOption(PRINCIPAL, 'principal')).toBe('DELL U2412M · 1920×1200 · principal');
    expect(formatDisplayOption(SECUNDARIO, 'principal')).toBe('LG TV · 1366×768');
    expect(formatDisplayOption(PRINCIPAL, 'primary')).toBe('DELL U2412M · 1920×1200 · primary');
  });

  it('sin nombre del SO cae a #id; el tamaño se redondea (bounds con escala fraccional)', () => {
    expect(describeDisplay(SIN_NOMBRE)).toEqual({ name: '#7', size: '1024×769', isPrimary: false });
    expect(formatDisplayOption(SIN_NOMBRE, 'principal')).toBe('#7 · 1024×769');
  });

  it('con la palabra «principal» vacía no deja un «·» colgando', () => {
    expect(formatDisplayOption(PRINCIPAL, '  ')).toBe('DELL U2412M · 1920×1200');
  });
});

describe('monitor preseleccionado (resolveSelectedDisplayId)', () => {
  const displays = [PRINCIPAL, SECUNDARIO];
  it('el guardado en esta máquina manda si sigue conectado', () => {
    expect(resolveSelectedDisplayId(displays, PRINCIPAL.id, { open: true, displayId: SECUNDARIO.id })).toBe(PRINCIPAL.id);
  });
  it('guardado desconectado → el de la ventana abierta', () => {
    expect(resolveSelectedDisplayId(displays, 999, { open: true, displayId: SECUNDARIO.id })).toBe(SECUNDARIO.id);
  });
  it('sin guardado ni ventana abierta → automático (null), nunca se adivina el secundario', () => {
    expect(resolveSelectedDisplayId(displays, null, { open: false, displayId: null })).toBeNull();
    expect(resolveSelectedDisplayId(displays, null, null)).toBeNull();
    // Ventana abierta en modo ventana normal (un solo monitor): displayId null → automático.
    expect(resolveSelectedDisplayId([PRINCIPAL], null, { open: true, displayId: null })).toBeNull();
  });
  it('findDisplay: por id, undefined para null/desconocido', () => {
    expect(findDisplay(displays, SECUNDARIO.id)).toBe(SECUNDARIO);
    expect(findDisplay(displays, null)).toBeUndefined();
    expect(findDisplay(displays, 1)).toBeUndefined();
  });
});

describe('persistencia local del monitor', () => {
  it('guarda el id, null borra (automático) y lee lo guardado', () => {
    const storage = memoryStorage();
    saveDisplayId(storage, SECUNDARIO.id);
    expect(storage.data[DESKTOP_DISPLAY_ID_STORAGE_KEY]).toBe(String(SECUNDARIO.id));
    expect(readSavedDisplayId(storage)).toBe(SECUNDARIO.id);
    saveDisplayId(storage, null);
    expect(DESKTOP_DISPLAY_ID_STORAGE_KEY in storage.data).toBe(false);
    expect(readSavedDisplayId(storage)).toBeNull();
  });
  it('valores raros ("auto", "abc", "+1", decimales) y storage roto → null sin lanzar; "-1" también es desconocido (cierre de F1: solo enteros >= 0)', () => {
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'auto' }))).toBeNull();
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'abc' }))).toBeNull();
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '+1' }))).toBeNull();
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '-1' }))).toBeNull();
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '1.5' }))).toBeNull();
    expect(readSavedDisplayId(null)).toBeNull();
    const broken: DisplayIdStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readSavedDisplayId(broken)).toBeNull();
    expect(() => saveDisplayId(broken, 1)).not.toThrow();
    expect(() => saveDisplayId(broken, null)).not.toThrow();
  });
});

describe('persistDesktopDisplayChoice (setEnabled del puente)', () => {
  it('pasa el interruptor de la organización y el monitor de esta máquina; null = automático elegido a propósito', async () => {
    const { bridge, saved } = fakeBridge();
    expect(await persistDesktopDisplayChoice(bridge, true, SECUNDARIO.id)).toBe(true);
    expect(await persistDesktopDisplayChoice(bridge, false, null)).toBe(true);
    expect(saved).toEqual([
      [true, SECUNDARIO.id],
      [false, null],
    ]);
  });
  it('setEnabled que rechaza (displayId no entero, IPC caído): false y aviso, nunca excepción', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { bridge } = fakeBridge();
    bridge.setEnabled.mockRejectedValueOnce(new Error('displayId debe ser un entero'));
    expect(await persistDesktopDisplayChoice(bridge, true, 1)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('lecturas seguras del puente', () => {
  it('listDisplays filtra entradas mal formadas y status descarta basura', async () => {
    const { bridge } = fakeBridge();
    bridge.listDisplays.mockResolvedValueOnce([PRINCIPAL, { id: 'x' }, null, SECUNDARIO] as unknown as DesktopDisplayInfo[]);
    expect(await listDesktopDisplays(bridge)).toEqual([PRINCIPAL, SECUNDARIO]);
    bridge.listDisplays.mockResolvedValueOnce('nada' as unknown as DesktopDisplayInfo[]);
    expect(await listDesktopDisplays(bridge)).toEqual([]);
    bridge.status.mockResolvedValueOnce({ open: 'sí' } as unknown as DesktopPosDisplayStatus);
    expect(await readDesktopDisplayStatus(bridge)).toBeNull();
    bridge.status.mockResolvedValueOnce({ open: true, displayId: 1.5 } as unknown as DesktopPosDisplayStatus);
    expect(await readDesktopDisplayStatus(bridge)).toBeNull();
    expect(isDesktopDisplayInfo(PRINCIPAL)).toBe(true);
    expect(isDesktopDisplayInfo({ ...PRINCIPAL, bounds: null })).toBe(false);
    expect(isDesktopPosDisplayStatus({ open: false, displayId: null })).toBe(true);
    expect(isDesktopPosDisplayStatus({ open: true, displayId: 3 })).toBe(true);
    expect(isDesktopPosDisplayStatus({ open: true })).toBe(false);
  });

  it('listDisplays / status que rechazan: [] y null con aviso', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { bridge } = fakeBridge();
    bridge.listDisplays.mockRejectedValueOnce(new Error('ipc'));
    bridge.status.mockRejectedValueOnce(new Error('ipc'));
    expect(await listDesktopDisplays(bridge)).toEqual([]);
    expect(await readDesktopDisplayStatus(bridge)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('onStatus: entrega solo estados válidos y la baja quita el listener', async () => {
    const { bridge, listeners } = fakeBridge();
    const seen: DesktopPosDisplayStatus[] = [];
    const off = subscribeDesktopDisplayStatus(bridge, (s) => seen.push(s));
    expect(listeners.size).toBe(1);
    for (const l of listeners) l({ open: 'x' } as unknown as DesktopPosDisplayStatus);
    await bridge.open({ displayId: SECUNDARIO.id });
    expect(seen).toEqual([{ open: true, displayId: SECUNDARIO.id }]);
    off();
    expect(listeners.size).toBe(0);
    await bridge.close();
    expect(seen).toHaveLength(1);
  });

  it('onStatus que lanza al suscribir: no-op sin excepción', () => {
    const { bridge } = fakeBridge();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    bridge.onStatus.mockImplementationOnce(() => {
      throw new Error('ipc');
    });
    expect(() => subscribeDesktopDisplayStatus(bridge, () => undefined)()).not.toThrow();
  });
});

describe('«Pantalla abierta, sin señal» (resolveDesktopWindowSignal + nextOpenedAt)', () => {
  const abierta: DesktopPosDisplayStatus = { open: true, displayId: SECUNDARIO.id };
  const cerrada: DesktopPosDisplayStatus = { open: false, displayId: null };

  it('sin puente o ventana cerrada: none, haya o no presencia', () => {
    expect(resolveDesktopWindowSignal(null, false, null, 10_000)).toBe('none');
    expect(resolveDesktopWindowSignal(cerrada, true, null, 10_000)).toBe('none');
  });

  it('abierta con presencia: open', () => {
    expect(resolveDesktopWindowSignal(abierta, true, 0, 60_000)).toBe('open');
  });

  it('abierta sin presencia: gracia de STALE_AFTER_MS (3 s) desde la apertura, y después open-no-signal', () => {
    const openedAt = 10_000;
    expect(resolveDesktopWindowSignal(abierta, false, openedAt, openedAt)).toBe('open');
    expect(resolveDesktopWindowSignal(abierta, false, openedAt, openedAt + STALE_AFTER_MS - 1)).toBe('open');
    expect(resolveDesktopWindowSignal(abierta, false, openedAt, openedAt + STALE_AFTER_MS)).toBe('open-no-signal');
    expect(STALE_AFTER_MS).toBe(3000);
  });

  it('abierta sin presencia y sin instante de apertura conocido: open (no se acusa sin reloj)', () => {
    expect(resolveDesktopWindowSignal(abierta, false, null, 99_999)).toBe('open');
  });

  it('la presencia vuelve: deja de acusar aunque la ventana lleve mucho abierta', () => {
    expect(resolveDesktopWindowSignal(abierta, false, 0, 60_000)).toBe('open-no-signal');
    expect(resolveDesktopWindowSignal(abierta, true, 0, 60_000)).toBe('open');
  });

  it('nextOpenedAt: se fija al pasar a abierta, se conserva mientras siga abierta y se borra al cerrar', () => {
    expect(nextOpenedAt(null, abierta, null, 100)).toBe(100); // primera lectura, ya abierta
    expect(nextOpenedAt(abierta, abierta, 100, 5_000)).toBe(100); // sigue abierta: mismo instante
    expect(nextOpenedAt(abierta, cerrada, 100, 6_000)).toBeNull();
    expect(nextOpenedAt(cerrada, abierta, null, 7_000)).toBe(7_000); // reabierta: nuevo instante
    expect(nextOpenedAt(cerrada, null, null, 8_000)).toBeNull();
  });

  it('escenario completo: abre por el puente, 3 s sin display_alive → acusa; llega la señal → open; cierra → none', async () => {
    const { bridge } = fakeBridge();
    let status: DesktopPosDisplayStatus | null = null;
    let openedAt: number | null = null;
    subscribeDesktopDisplayStatus(bridge, (s) => {
      openedAt = nextOpenedAt(status, s, openedAt, 1_000);
      status = s;
    });
    await bridge.open({ displayId: SECUNDARIO.id });
    expect(resolveDesktopWindowSignal(status, false, openedAt, 2_000)).toBe('open');
    expect(resolveDesktopWindowSignal(status, false, openedAt, 4_000)).toBe('open-no-signal');
    expect(resolveDesktopWindowSignal(status, true, openedAt, 4_500)).toBe('open');
    await bridge.close();
    expect(openedAt).toBeNull();
    expect(resolveDesktopWindowSignal(status, false, openedAt, 9_000)).toBe('none');
  });
});

describe('openCustomerDisplay en escritorio usa el monitor elegido en esta máquina', () => {
  it('con el puente real (open resuelve { ok: true }) y displayId explícito, abre en ese monitor', async () => {
    const { bridge } = fakeBridge();
    const result = await openCustomerDisplay({ nativeApi: bridge, win: null, storage: null, displayId: PRINCIPAL.id });
    expect(result).toEqual({ via: 'electron' });
    expect(bridge.open).toHaveBeenCalledWith({ origin: undefined, displayId: PRINCIPAL.id });
    expect(await bridge.status()).toEqual({ open: true, displayId: PRINCIPAL.id });
  });

  it('sin elección (undefined) y sin localStorage (Node): automático (null), y el puente elige el secundario', async () => {
    const { bridge } = fakeBridge();
    expect(await openCustomerDisplay({ nativeApi: bridge, win: null, storage: null })).toEqual({ via: 'electron' });
    expect(bridge.open).toHaveBeenCalledWith({ origin: undefined, displayId: null });
    expect(await bridge.status()).toEqual({ open: true, displayId: SECUNDARIO.id });
  });

  it('Desktop < 0.2.1 (sin open): el puente no se detecta y se sigue el camino web sin errores', async () => {
    instalarPuente(oldBridge());
    const handle = { closed: false, focus: jest.fn(), close: jest.fn() };
    const win = { open: jest.fn(() => handle) };
    expect(await openCustomerDisplay({ win, storage: null })).toEqual({ via: 'web', firstTime: true });
    expect(win.open).toHaveBeenCalledTimes(1);
  });
});
