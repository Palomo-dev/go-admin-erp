/**
 * Fase 1 (Electron en la segunda pantalla), ronda 2: correcciones a la
 * lógica pura de `src/lib/pos/display/desktopDisplay.ts` tras el QA y el
 * tester de la ronda 1. Sin React ni DOM; puente falso en memoria.
 *
 * 1. «Abierta sin señal» solo se acusa si la caja EMITE (`emitting`): con
 *    la organización apagada o cargando, la ventana abierta sin señal es lo
 *    esperado y el indicador debe decir «desactivada», no «canal roto».
 * 2. (Ronda 4, D1) Ya NO hay sincronía hacia abajo: `persistDesktopDisplayChoice`
 *    escribe una vez por acción del usuario, sin memo, y leer la
 *    organización nunca toca el puente.
 * 3. Elección de monitor «desconocida» (sin copia local) viaja como
 *    `undefined` (conserva el monitor del proceso principal); «Automático»
 *    elegido a propósito viaja como `null`.
 * 4. «Cerrar» del indicador: con puente que sabe cerrar pero ventana
 *    cerrada según `status()`, no hay nada que cerrar.
 * 5. Etiquetas: ventana abierta en un monitor que no está en la lista no es
 *    «ventana normal»; monitor elegido que ya no está se pinta
 *    «desconectado» sin volver a automático.
 * 6. (Ronda 4, D1) posDisplay.ts: aplicar el interruptor de la organización,
 *    encendido, apagado o sin caché, no llama a `setEnabled` ni a `close()`.
 */

import {
  DESKTOP_DISPLAY_ID_STORAGE_KEY,
  UNKNOWN_DISPLAY_CHOICE,
  describeSelectedDisplay,
  describeWindowStatus,
  displayChoiceToPersist,
  persistDesktopDisplayChoice,
  readSavedDisplayChoice,
  readSavedDisplayId,
  resolveDesktopWindowSignal,
  resolveNothingToClose,
  saveDisplayChoice,
  saveDisplayId,
  type DisplayIdStorage,
} from '@/lib/pos/display/desktopDisplay';
import { applyPosDisplaySettings, stopPosDisplay } from '@/lib/pos/display/posDisplay';
import { clearCustomerDisplaySettingsCache, primeCustomerDisplaySettings } from '@/lib/pos/display/settings';
import { STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { isDesktop } from '@/lib/utils/desktop';
import type { DesktopDisplayInfo, DesktopPosDisplayBridge, DesktopPosDisplayStatus } from '@/lib/utils/desktop';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));

const PRINCIPAL: DesktopDisplayInfo = { id: 1, label: 'Principal', isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
const SECUNDARIO: DesktopDisplayInfo = { id: 2, label: 'LG TV', isPrimary: false, bounds: { x: 1920, y: 0, width: 1366, height: 768 } };
const DISPLAYS = [PRINCIPAL, SECUNDARIO];

/** Puente falso >= 0.2.1: `setEnabled` y `close` importan aquí; registra cada llamada. */
function fakeBridge(status: DesktopPosDisplayStatus = { open: false, displayId: null }) {
  const saved: Array<[boolean, number | null | undefined]> = [];
  const bridge: DesktopPosDisplayBridge & { setEnabled: jest.Mock; close: jest.Mock } = {
    send: jest.fn(),
    onMessage: jest.fn(() => () => {}),
    open: jest.fn(async () => ({ ok: true })),
    close: jest.fn(async () => undefined),
    status: jest.fn(async () => status),
    onStatus: jest.fn(() => () => {}),
    listDisplays: jest.fn(async () => DISPLAYS),
    setEnabled: jest.fn(async (enabled: boolean, displayId?: number | null) => {
      saved.push([enabled, displayId]);
    }),
  };
  return { bridge, saved };
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

type GlobalConVentana = { window?: { goAdminDesktop?: unknown } };

function instalarPuente(posDisplay: unknown) {
  (globalThis as GlobalConVentana).window = { goAdminDesktop: { posDisplay } };
}

beforeEach(() => {
  clearCustomerDisplaySettingsCache();
});

afterEach(() => {
  delete (globalThis as GlobalConVentana).window;
  expect(isDesktop()).toBe(false);
  stopPosDisplay();
  jest.restoreAllMocks();
});

describe('1 · «abierta sin señal» solo con la caja emitiendo', () => {
  const abierta: DesktopPosDisplayStatus = { open: true, displayId: SECUNDARIO.id };
  const pasadaLaGracia = STALE_AFTER_MS * 2;

  it('organización apagada o cargando (emitting=false): open, no se acusa aunque pase la gracia', () => {
    expect(resolveDesktopWindowSignal(abierta, false, 0, pasadaLaGracia, STALE_AFTER_MS, false)).toBe('open');
    expect(resolveDesktopWindowSignal(abierta, false, 0, 60_000, STALE_AFTER_MS, false)).toBe('open');
  });

  it('caja emitiendo (emitting=true) sin señal pasada la gracia: open-no-signal', () => {
    expect(resolveDesktopWindowSignal(abierta, false, 0, pasadaLaGracia, STALE_AFTER_MS, true)).toBe('open-no-signal');
  });

  it('emitting no cambia el resto: cerrada → none; con presencia → open; dentro de la gracia → open', () => {
    expect(resolveDesktopWindowSignal({ open: false, displayId: null }, false, null, pasadaLaGracia, STALE_AFTER_MS, true)).toBe('none');
    expect(resolveDesktopWindowSignal(abierta, true, 0, pasadaLaGracia, STALE_AFTER_MS, false)).toBe('open');
    expect(resolveDesktopWindowSignal(abierta, false, 0, STALE_AFTER_MS - 1, STALE_AFTER_MS, true)).toBe('open');
  });

  it('escenario: la organización se enciende con la ventana ya abierta → la gracia cuenta desde que la caja EMPEZÓ a emitir (ronda 3)', () => {
    // Antes de encender no se acusa; al encender, la gracia corre desde max(openedAt, emittingSince):
    // el display_alive tarda ≤ 1 s en llegar y contar solo desde la apertura pintaba ámbar falso.
    const openedAt = 1_000;
    const ahora = openedAt + 30_000;
    expect(resolveDesktopWindowSignal(abierta, false, openedAt, ahora, STALE_AFTER_MS, false)).toBe('open');
    expect(resolveDesktopWindowSignal(abierta, false, openedAt, ahora, STALE_AFTER_MS, true, ahora - 500)).toBe('open');
    expect(resolveDesktopWindowSignal(abierta, false, openedAt, ahora, STALE_AFTER_MS, true, ahora - STALE_AFTER_MS)).toBe('open-no-signal');
    expect(resolveDesktopWindowSignal(abierta, true, openedAt, ahora, STALE_AFTER_MS, true, ahora - 500)).toBe('open');
    // emittingSince anterior a la apertura (la caja emitía antes de que abriera la ventana): manda la apertura.
    expect(resolveDesktopWindowSignal(abierta, false, ahora - 1_000, ahora, STALE_AFTER_MS, true, openedAt)).toBe('open');
  });
});

describe('2 · sin sincronía hacia abajo (ronda 4, D1): el puente solo se escribe por acción del usuario', () => {
  it('persistDesktopDisplayChoice escribe UNA vez por llamada, sin memo: dos acciones iguales seguidas mandan dos escrituras', async () => {
    const { bridge, saved } = fakeBridge();
    expect(await persistDesktopDisplayChoice(bridge, false, undefined)).toBe(true);
    expect(await persistDesktopDisplayChoice(bridge, false, undefined)).toBe(true);
    expect(saved).toEqual([
      [false, undefined],
      [false, undefined],
    ]);
    expect(bridge.setEnabled).toHaveBeenCalledTimes(2);
  });

  it('sin puente (navegador) o Desktop < 0.2.1 sin setEnabled: false, sin lanzar', async () => {
    expect(await persistDesktopDisplayChoice(null, false, undefined)).toBe(false);
    expect(await persistDesktopDisplayChoice(undefined, false, undefined)).toBe(false);
    expect(await persistDesktopDisplayChoice({ send: jest.fn(), onMessage: jest.fn(() => () => {}) }, false, undefined)).toBe(false);
  });

  it('encender y apagar desde la tarjeta en esta máquina: cada acción viaja tal cual, en orden', async () => {
    const { bridge, saved } = fakeBridge();
    await persistDesktopDisplayChoice(bridge, true, SECUNDARIO.id); // la tarjeta enciende
    await persistDesktopDisplayChoice(bridge, false, SECUNDARIO.id); // la tarjeta apaga
    expect(saved).toEqual([
      [true, SECUNDARIO.id],
      [false, SECUNDARIO.id],
    ]);
  });

  it('si setEnabled rechaza: false y aviso; la siguiente acción del usuario vuelve a intentarlo', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { bridge, saved } = fakeBridge();
    bridge.setEnabled.mockRejectedValueOnce(new Error('ipc caído'));
    expect(await persistDesktopDisplayChoice(bridge, false, undefined)).toBe(false);
    expect(await persistDesktopDisplayChoice(bridge, false, undefined)).toBe(true);
    expect(saved).toEqual([[false, undefined]]);
  });
});

describe('3 · elección de monitor: desconocida vs automático elegido', () => {
  it('readSavedDisplayChoice: ausente/basura → desconocida; "auto" → conocida y automática; entero → conocida y ese monitor', () => {
    expect(readSavedDisplayChoice(memoryStorage())).toEqual({ known: false, id: null });
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'abc' }))).toEqual({ known: false, id: null });
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '+1' }))).toEqual({ known: false, id: null });
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '-1' }))).toEqual({ known: false, id: null }); // cierre de F1: solo >= 0, como parseDisplayId del IPC
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'auto' }))).toEqual({ known: true, id: null });
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '2' }))).toEqual({ known: true, id: 2 });
    expect(readSavedDisplayChoice(null)).toEqual({ known: false, id: null });
    const broken: DisplayIdStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(readSavedDisplayChoice(broken)).toEqual({ known: false, id: null });
    // readSavedDisplayId sigue siendo el atajo compatible: null tanto para desconocida como para automática.
    expect(readSavedDisplayId(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'auto' }))).toBeNull();
    expect(readSavedDisplayId(memoryStorage())).toBeNull();
  });

  it('saveDisplayChoice: automático elegido guarda "auto"; desconocida borra; saveDisplayId(null) sigue borrando (olvidar, no automático)', () => {
    const storage = memoryStorage();
    saveDisplayChoice(storage, { known: true, id: null });
    expect(storage.data[DESKTOP_DISPLAY_ID_STORAGE_KEY]).toBe('auto');
    saveDisplayChoice(storage, { known: true, id: 2 });
    expect(storage.data[DESKTOP_DISPLAY_ID_STORAGE_KEY]).toBe('2');
    saveDisplayChoice(storage, { ...UNKNOWN_DISPLAY_CHOICE });
    expect(DESKTOP_DISPLAY_ID_STORAGE_KEY in storage.data).toBe(false);
    saveDisplayId(storage, 2);
    saveDisplayId(storage, null);
    expect(DESKTOP_DISPLAY_ID_STORAGE_KEY in storage.data).toBe(false);
    expect(readSavedDisplayChoice(storage).known).toBe(false);
  });

  it('displayChoiceToPersist: desconocida → undefined (conserva); automático → null; monitor → id', () => {
    expect(displayChoiceToPersist({ known: false, id: null })).toBeUndefined();
    expect(displayChoiceToPersist({ known: true, id: null })).toBeNull();
    expect(displayChoiceToPersist({ known: true, id: 2 })).toBe(2);
  });

  it('toggle del interruptor SIN copia local (puerto rotado, datos limpiados) → setEnabled(enabled, undefined): no pisa el monitor guardado', async () => {
    const { bridge, saved } = fakeBridge();
    const choice = readSavedDisplayChoice(memoryStorage()); // lo que hace la tarjeta al montar
    await persistDesktopDisplayChoice(bridge, true, displayChoiceToPersist(choice));
    await persistDesktopDisplayChoice(bridge, false, displayChoiceToPersist(choice));
    expect(saved).toEqual([
      [true, undefined],
      [false, undefined],
    ]);
  });

  it('elección «Automático» explícita → setEnabled(enabled, null), y al volver se lee como conocida', async () => {
    const { bridge, saved } = fakeBridge();
    const storage = memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '2' });
    const choice = { known: true, id: null }; // el usuario elige «Automático» en el selector
    saveDisplayChoice(storage, choice);
    await persistDesktopDisplayChoice(bridge, true, choice.id);
    await persistDesktopDisplayChoice(bridge, true, displayChoiceToPersist(readSavedDisplayChoice(storage))); // toggle después
    expect(saved).toEqual([
      [true, null],
      [true, null],
    ]);
  });
});

describe('4 · «Cerrar» del indicador (resolveNothingToClose)', () => {
  const base = { connected: false, hasOwnWindow: false };

  it('los cuatro cruces puente-sabe-cerrar × ventana-abierta, sin presencia ni ventana propia', () => {
    expect(resolveNothingToClose({ ...base, bridgeCanClose: true, windowOpen: true })).toBe(false); // hay ventana: se puede cerrar
    expect(resolveNothingToClose({ ...base, bridgeCanClose: true, windowOpen: false })).toBe(true); // puente sí, ventana no: nada que cerrar
    expect(resolveNothingToClose({ ...base, bridgeCanClose: false, windowOpen: true })).toBe(true); // ventana según status pero puente sin close (a medias)
    expect(resolveNothingToClose({ ...base, bridgeCanClose: false, windowOpen: false })).toBe(true);
  });

  it('status() sin responder (undefined) NO cuenta como ventana: «Cerrar» deshabilitado hasta que el puente responda (cierre de F1)', () => {
    expect(resolveNothingToClose({ ...base, bridgeCanClose: true, windowOpen: undefined })).toBe(true);
    expect(resolveNothingToClose({ ...base, bridgeCanClose: false, windowOpen: undefined })).toBe(true);
  });

  it('presencia o ventana propia siempre habilitan «Cerrar», diga lo que diga el puente', () => {
    expect(resolveNothingToClose({ connected: true, hasOwnWindow: false, bridgeCanClose: false, windowOpen: false })).toBe(false);
    expect(resolveNothingToClose({ connected: false, hasOwnWindow: true, bridgeCanClose: true, windowOpen: false })).toBe(false);
  });
});

describe('5 · etiquetas de estado de la ventana y del monitor elegido', () => {
  it('describeWindowStatus: cerrada / ventana normal (displayId null) / en monitor listado / en monitor NO listado', () => {
    expect(describeWindowStatus({ open: false, displayId: null }, DISPLAYS)).toEqual({ kind: 'closed' });
    expect(describeWindowStatus({ open: false, displayId: 2 }, DISPLAYS)).toEqual({ kind: 'closed' });
    expect(describeWindowStatus({ open: true, displayId: null }, [PRINCIPAL])).toEqual({ kind: 'windowed' });
    expect(describeWindowStatus({ open: true, displayId: SECUNDARIO.id }, DISPLAYS)).toEqual({ kind: 'on-listed', display: SECUNDARIO });
    expect(describeWindowStatus({ open: true, displayId: 99 }, DISPLAYS)).toEqual({ kind: 'on-unknown', id: 99 });
    // Lista vacía (listDisplays falló) con ventana en un monitor: no es «ventana normal».
    expect(describeWindowStatus({ open: true, displayId: 2 }, [])).toEqual({ kind: 'on-unknown', id: 2 });
  });

  it('describeSelectedDisplay: automático / listado / desconectado (se conserva el id, no se vuelve a automático)', () => {
    expect(describeSelectedDisplay(DISPLAYS, null)).toEqual({ kind: 'auto' });
    expect(describeSelectedDisplay(DISPLAYS, SECUNDARIO.id)).toEqual({ kind: 'listed', display: SECUNDARIO });
    expect(describeSelectedDisplay([PRINCIPAL], SECUNDARIO.id)).toEqual({ kind: 'missing', id: SECUNDARIO.id });
    expect(describeSelectedDisplay([], 7)).toEqual({ kind: 'missing', id: 7 });
  });

  it('display-removed y vuelta: la elección guardada sobrevive al hueco', () => {
    const storage = memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: String(SECUNDARIO.id) });
    const choice = readSavedDisplayChoice(storage);
    expect(describeSelectedDisplay([PRINCIPAL], choice.id).kind).toBe('missing');
    expect(describeSelectedDisplay(DISPLAYS, choice.id)).toEqual({ kind: 'listed', display: SECUNDARIO });
    expect(storage.data[DESKTOP_DISPLAY_ID_STORAGE_KEY]).toBe(String(SECUNDARIO.id));
  });
});

describe('6 · posDisplay.ts NO toca el escritorio al aplicar la organización (ronda 4, D1)', () => {
  it('caché apagada + puente → ni setEnabled ni close, por muchas aplicaciones que haya', async () => {
    const { bridge, saved } = fakeBridge({ open: true, displayId: SECUNDARIO.id });
    instalarPuente(bridge);
    primeCustomerDisplaySettings(120, { enabled: false });
    applyPosDisplaySettings();
    applyPosDisplaySettings();
    await Promise.resolve();
    await Promise.resolve();
    expect(saved).toEqual([]);
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('caché encendida → sin llamada; sin caché (aún cargando) → sin llamada', async () => {
    const { bridge, saved } = fakeBridge();
    instalarPuente(bridge);
    applyPosDisplaySettings(); // sin caché
    primeCustomerDisplaySettings(120, { enabled: true });
    applyPosDisplaySettings();
    await Promise.resolve();
    expect(saved).toEqual([]);
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('sin puente (navegador): aplicar la organización apagada no lanza ni llama nada', () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    expect(() => applyPosDisplaySettings()).not.toThrow();
  });
});
