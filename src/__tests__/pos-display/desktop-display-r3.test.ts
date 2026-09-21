/**
 * Fase 1 (Electron en la segunda pantalla), ronda 3: correcciones al QA y al
 * tester de la ronda 2. Lógica pura con puente falso en memoria; sin React
 * ni DOM.
 *
 * 2. «Abierta sin señal»: la gracia corre desde max(apertura, inicio de la
 *    emisión), no solo desde la apertura (`emittingSince`).
 * 3. «Cerrar» con puente que sabe cerrar pero SIN ventana hija: no se llama
 *    a close() del puente; 'handle' si hay referencia propia, 'none' si no.
 * 4. (Ronda 4, D1) La sincronía hacia abajo y el cierre de la «ventana
 *    huérfana» se ELIMINARON: leer la organización, entre por donde entre,
 *    no llama a `setEnabled` ni a `close()`; solo el usuario lo hace.
 * 5. `readSavedDisplayChoice` solo acepta un entero decimal estricto (D5).
 * 6. «Activar y abrir» del indicador persiste `enabled = true` en esta
 *    máquina con la elección local (`enableDesktopDisplayHere`).
 * 8. «Abrir ahora» con la ventana abierta en OTRO monitor: cerrar y reabrir
 *    (`needsReopenForDisplayChange`).
 */

import {
  DESKTOP_DISPLAY_ID_STORAGE_KEY,
  UNKNOWN_DISPLAY_CHOICE,
  enableDesktopDisplayHere,
  needsReopenForDisplayChange,
  persistDesktopDisplayChoice,
  readSavedDisplayChoice,
  resolveDesktopWindowSignal,
  type DisplayIdStorage,
} from '@/lib/pos/display/desktopDisplay';
import { __resetCustomerDisplayWindowForTests, closeCustomerDisplay, openCustomerDisplay } from '@/lib/pos/display/openDisplay';
import { applyPosDisplaySettings, getPosDisplayEmitter, stopPosDisplay } from '@/lib/pos/display/posDisplay';
import { clearCustomerDisplaySettingsCache, primeCustomerDisplaySettings } from '@/lib/pos/display/settings';
import { STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { isDesktop } from '@/lib/utils/desktop';
import type { DesktopDisplayInfo, DesktopPosDisplayBridge, DesktopPosDisplayStatus } from '@/lib/utils/desktop';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));

const ORG = 120;
const PRINCIPAL: DesktopDisplayInfo = { id: 1, label: 'Principal', isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
const SECUNDARIO: DesktopDisplayInfo = { id: 2, label: 'TV', isPrimary: false, bounds: { x: 1920, y: 0, width: 1366, height: 768 } };
const DISPLAYS = [PRINCIPAL, SECUNDARIO];
const ABIERTA_EN_2: DesktopPosDisplayStatus = { open: true, displayId: 2 };
const CERRADA: DesktopPosDisplayStatus = { open: false, displayId: null };

function fakeBridge(initialStatus: DesktopPosDisplayStatus = CERRADA) {
  const saved: Array<[boolean, number | null | undefined]> = [];
  let status = initialStatus;
  const bridge: DesktopPosDisplayBridge & { setEnabled: jest.Mock; close: jest.Mock; open: jest.Mock; status: jest.Mock } = {
    send: jest.fn(),
    onMessage: jest.fn(() => () => {}),
    open: jest.fn(async () => {
      status = ABIERTA_EN_2;
      return { ok: true };
    }),
    close: jest.fn(async () => {
      status = CERRADA;
    }),
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

type GlobalConVentana = { window?: { goAdminDesktop?: unknown; localStorage?: DisplayIdStorage; location?: { origin: string } } };

function instalarVentana(opts: { posDisplay?: unknown; storage?: DisplayIdStorage } = {}) {
  (globalThis as GlobalConVentana).window = {
    ...(opts.posDisplay !== undefined ? { goAdminDesktop: { posDisplay: opts.posDisplay } } : {}),
    ...(opts.storage ? { localStorage: opts.storage } : {}),
    location: { origin: 'http://localhost:47800' },
  };
}

beforeEach(() => {
  __resetCustomerDisplayWindowForTests();
  clearCustomerDisplaySettingsCache();
});

afterEach(() => {
  delete (globalThis as GlobalConVentana).window;
  expect(isDesktop()).toBe(false);
  stopPosDisplay();
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('2 · la gracia de «sin señal» corre desde max(apertura, inicio de la emisión)', () => {
  const openedAt = 1_000;
  const ahora = 31_000;

  it('caso verificable del QA: emittingSince=30500 → open; emittingSince=27000 → open-no-signal', () => {
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, openedAt, ahora, 3_000, true, 30_500)).toBe('open');
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, openedAt, ahora, 3_000, true, 27_000)).toBe('open-no-signal');
  });

  it('el límite es inclusivo en la gracia: justo a graceMs desde emittingSince ya acusa; un ms antes no', () => {
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, openedAt, ahora, STALE_AFTER_MS, true, ahora - STALE_AFTER_MS + 1)).toBe('open');
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, openedAt, ahora, STALE_AFTER_MS, true, ahora - STALE_AFTER_MS)).toBe('open-no-signal');
  });

  it('la caja emitía ANTES de que abriera la ventana (emittingSince < openedAt): manda la apertura', () => {
    // Arranque normal con la organización encendida: el emisor arranca y luego «Abrir» abre la ventana.
    const abrioHace1s = ahora - 1_000;
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, abrioHace1s, ahora, STALE_AFTER_MS, true, 5_000)).toBe('open');
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, ahora - STALE_AFTER_MS, ahora, STALE_AFTER_MS, true, 5_000)).toBe('open-no-signal');
  });

  it('emittingSince no altera el resto: cerrada → none; con presencia → open; sin emitir → open; sin apertura conocida → open', () => {
    expect(resolveDesktopWindowSignal(CERRADA, false, openedAt, ahora, STALE_AFTER_MS, true, 5_000)).toBe('none');
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, true, openedAt, ahora, STALE_AFTER_MS, true, 5_000)).toBe('open');
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, openedAt, ahora, STALE_AFTER_MS, false, 5_000)).toBe('open');
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, null, ahora, STALE_AFTER_MS, true, 5_000)).toBe('open');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('3 · «Cerrar» con puente que sabe cerrar pero sin ventana hija', () => {
  it('bridgeWindowOpen:false y sin referencia propia → none, sin llamar a close() del puente', async () => {
    const { bridge } = fakeBridge(CERRADA);
    instalarVentana({ posDisplay: bridge });
    expect(await closeCustomerDisplay({ bridgeWindowOpen: false })).toBe('none');
    expect(bridge.close).not.toHaveBeenCalled();
    expect(bridge.status).not.toHaveBeenCalled(); // el dato explícito manda: no se consulta
  });

  it('bridgeWindowOpen:false pero HAY emergente web propia (fallback tras un open() rechazado) → handle y la cierra', async () => {
    const { bridge } = fakeBridge(CERRADA);
    bridge.open.mockResolvedValueOnce({ ok: false, reason: 'origen no permitido' });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = { closed: false, focus: jest.fn(), close: jest.fn() };
    instalarVentana({ posDisplay: bridge });
    expect(await openCustomerDisplay({ win: { open: () => handle }, storage: null })).toEqual({ via: 'web', firstTime: true });
    expect(await closeCustomerDisplay({ bridgeWindowOpen: false })).toBe('handle');
    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('bridgeWindowOpen:true → electron como antes (y cierra también la emergente propia si la hubiera)', async () => {
    const { bridge } = fakeBridge(ABIERTA_EN_2);
    instalarVentana({ posDisplay: bridge });
    expect(await closeCustomerDisplay({ bridgeWindowOpen: true })).toBe('electron');
    expect(bridge.close).toHaveBeenCalledTimes(1);
  });

  it('sin bridgeWindowOpen se consulta status(): cerrada → none; abierta → electron; status roto o basura → se cierra como antes', async () => {
    const { bridge } = fakeBridge(CERRADA);
    instalarVentana({ posDisplay: bridge });
    expect(await closeCustomerDisplay()).toBe('none');
    expect(bridge.close).not.toHaveBeenCalled();

    const abierta = fakeBridge(ABIERTA_EN_2);
    instalarVentana({ posDisplay: abierta.bridge });
    expect(await closeCustomerDisplay()).toBe('electron');
    expect(abierta.bridge.close).toHaveBeenCalledTimes(1);

    const roto = fakeBridge();
    roto.bridge.status.mockRejectedValueOnce(new Error('ipc'));
    instalarVentana({ posDisplay: roto.bridge });
    expect(await closeCustomerDisplay()).toBe('electron');

    const basura = fakeBridge();
    basura.bridge.status.mockResolvedValueOnce('abierta');
    instalarVentana({ posDisplay: basura.bridge });
    expect(await closeCustomerDisplay()).toBe('electron');
  });

  it('puente sin status (Desktop intermedio) y sin dato explícito: se cierra por el puente como antes', async () => {
    const close = jest.fn(async () => undefined);
    instalarVentana({ posDisplay: { open: jest.fn(), close } });
    expect(await closeCustomerDisplay()).toBe('electron');
    expect(close).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('4 · sin sincronía hacia abajo (ronda 4, D1): leer la organización nunca escribe ni cierra', () => {
  it('organización apagada + ventana abierta por el arranque: applyPosDisplaySettings ni manda setEnabled ni cierra, por muchas veces que se aplique', async () => {
    const { bridge, saved } = fakeBridge(ABIERTA_EN_2);
    instalarVentana({ posDisplay: bridge });
    primeCustomerDisplaySettings(ORG, { enabled: false });
    applyPosDisplaySettings();
    applyPosDisplaySettings();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(saved).toEqual([]);
    expect(bridge.close).not.toHaveBeenCalled();
    expect(bridge.status).not.toHaveBeenCalled();
  });

  it('misma ventana, misma organización apagada, la caja YA emitió: tampoco (el criterio no depende de por dónde se entere la máquina)', async () => {
    const { bridge, saved } = fakeBridge(ABIERTA_EN_2);
    instalarVentana({ posDisplay: bridge });
    primeCustomerDisplaySettings(ORG, { enabled: true });
    getPosDisplayEmitter().start({ organizationId: ORG, currency: 'COP' });
    expect(getPosDisplayEmitter().isEmitting).toBe(true);
    // Otra caja apaga la organización en caliente y esta la relee.
    primeCustomerDisplaySettings(ORG, { enabled: false });
    applyPosDisplaySettings();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(getPosDisplayEmitter().isEmitting).toBe(false); // la caja deja de emitir…
    expect(saved).toEqual([]); // …pero config.json y la ventana no se tocan
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('el usuario la abrió a mano por el puente con la organización apagada (para probarla): sigue abierta tras cualquier relectura, con o sin «recarga» del módulo', async () => {
    const { bridge, saved } = fakeBridge(CERRADA);
    instalarVentana({ posDisplay: bridge, storage: memoryStorage() });
    expect(await openCustomerDisplay()).toEqual({ via: 'electron' });
    primeCustomerDisplaySettings(ORG, { enabled: false });
    applyPosDisplaySettings();
    // «Recarga dura»: no hay estado de módulo que perder; se vuelve a aplicar y sigue sin cerrarse.
    __resetCustomerDisplayWindowForTests();
    applyPosDisplaySettings();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(bridge.close).not.toHaveBeenCalled();
    expect(saved).toEqual([]); // abrir a mano no persiste nada en config.json
  });

  it('un open() que el puente rechaza (cae al camino web) tampoco escribe nada en el proceso principal', async () => {
    const { bridge, saved } = fakeBridge(ABIERTA_EN_2);
    bridge.open.mockResolvedValueOnce({ ok: false, reason: 'origen no permitido' });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    instalarVentana({ posDisplay: bridge, storage: memoryStorage() });
    expect((await openCustomerDisplay({ win: null })).via).toBe('blocked');
    expect(saved).toEqual([]);
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('solo el usuario escribe: interruptor de la tarjeta (persistDesktopDisplayChoice) y «Activar y abrir» (enableDesktopDisplayHere), una escritura por acción', async () => {
    const { bridge, saved } = fakeBridge(ABIERTA_EN_2);
    await persistDesktopDisplayChoice(bridge, false, 2); // apagar desde la tarjeta
    await enableDesktopDisplayHere(bridge, memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '2' })); // «Activar y abrir»
    expect(saved).toEqual([
      [false, 2],
      [true, 2],
    ]);
    expect(bridge.close).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('5 · readSavedDisplayChoice solo acepta dígitos', () => {
  it('caso verificable del QA: "" → { known: false, id: null }', () => {
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '' }))).toEqual({ known: false, id: null });
  });

  it('" ", "1e3", "0x10", "+1", "1.0", " 2", "2 ", "-0", "Infinity", "NaN" → desconocida', () => {
    for (const raw of [' ', '1e3', '0x10', '+1', '1.0', ' 2', '2 ', '-0', '- 1', 'Infinity', 'NaN', 'auto ', '0b1']) {
      expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: raw }))).toEqual(UNKNOWN_DISPLAY_CHOICE);
    }
  });

  it('D5: entero decimal estricto y no negativo: "-1" y "-02" son desconocidos (cierre de F1: el IPC exige >= 0)', () => {
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '-1' }))).toEqual(UNKNOWN_DISPLAY_CHOICE);
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '-02' }))).toEqual(UNKNOWN_DISPLAY_CHOICE);
  });

  it('"0", "2", "2528732444" (id real de Electron) → conocida; "auto" → conocida y automática', () => {
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '0' }))).toEqual({ known: true, id: 0 });
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '2' }))).toEqual({ known: true, id: 2 });
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '2528732444' }))).toEqual({ known: true, id: 2528732444 });
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'auto' }))).toEqual({ known: true, id: null });
  });

  it('dígitos con ceros a la izquierda o fuera del rango seguro → desconocida (no se «normaliza» a otro id)', () => {
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '02' }))).toEqual(UNKNOWN_DISPLAY_CHOICE);
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '99999999999999999999' }))).toEqual(UNKNOWN_DISPLAY_CHOICE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('6 · «Activar y abrir» del indicador persiste «abrir sola al arrancar» en esta máquina', () => {
  it('con copia local numérica → setEnabled(true, id) exactamente una vez', async () => {
    const { bridge, saved } = fakeBridge();
    primeCustomerDisplaySettings(ORG, { enabled: true });
    expect(await enableDesktopDisplayHere(bridge, memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '2' }))).toBe(true);
    expect(saved).toEqual([[true, 2]]);
    expect(bridge.setEnabled).toHaveBeenCalledTimes(1);
  });

  it('sin copia local → setEnabled(true, undefined): conserva el monitor del proceso principal; "auto" → null', async () => {
    const { bridge, saved } = fakeBridge();
    await enableDesktopDisplayHere(bridge, memoryStorage());
    await enableDesktopDisplayHere(bridge, memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'auto' }));
    await enableDesktopDisplayHere(bridge, null);
    expect(saved).toEqual([
      [true, undefined],
      [true, null],
      [true, undefined],
    ]);
  });

  it('tras encender desde el indicador, una organización apagada desde otra caja NO degrada nada (ronda 4, D1): queda [true, 2]', async () => {
    const { bridge, saved } = fakeBridge();
    instalarVentana({ posDisplay: bridge });
    await enableDesktopDisplayHere(bridge, memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '2' }));
    primeCustomerDisplaySettings(ORG, { enabled: false });
    applyPosDisplaySettings();
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(saved).toEqual([[true, 2]]);
  });

  it('sin puente (navegador) o puente sin setEnabled → false sin lanzar; con setEnabled que rechaza → false y no bloquea', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await enableDesktopDisplayHere(null, memoryStorage())).toBe(false);
    expect(await enableDesktopDisplayHere({ open: jest.fn() }, memoryStorage())).toBe(false);
    const { bridge } = fakeBridge();
    bridge.setEnabled.mockRejectedValueOnce(new Error('ipc'));
    expect(await enableDesktopDisplayHere(bridge, memoryStorage())).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('8 · «Abrir ahora» con la ventana abierta en otro monitor', () => {
  it('abierta en el 2 y elegido el 1 → reabrir; elegido el 2 → no', () => {
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, { known: true, id: 1 })).toBe(true);
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, { known: true, id: 2 })).toBe(false);
  });

  it('elección automática o desconocida no pide monitor concreto → no; ventana cerrada o sin status → no', () => {
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, { known: true, id: null })).toBe(false);
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, { known: false, id: 1 })).toBe(false);
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, { ...UNKNOWN_DISPLAY_CHOICE })).toBe(false);
    expect(needsReopenForDisplayChange(CERRADA, { known: true, id: 1 })).toBe(false);
    expect(needsReopenForDisplayChange(null, { known: true, id: 1 })).toBe(false);
    expect(needsReopenForDisplayChange(undefined, { known: true, id: 1 })).toBe(false);
  });

  it('ventana en modo normal (displayId null, un solo monitor) y elegido un monitor concreto → reabrir: el monitor pudo conectarse después (D7, cabecera y código coinciden)', () => {
    expect(needsReopenForDisplayChange({ open: true, displayId: null }, { known: true, id: 2 })).toBe(true);
    // «Automático» o desconocida no mueven una ventana en modo normal.
    expect(needsReopenForDisplayChange({ open: true, displayId: null }, { known: true, id: null })).toBe(false);
    expect(needsReopenForDisplayChange({ open: true, displayId: null }, { ...UNKNOWN_DISPLAY_CHOICE })).toBe(false);
  });

  it('flujo de la tarjeta: cerrar por el puente y reabrir → open() viaja con el monitor elegido', async () => {
    const { bridge } = fakeBridge(ABIERTA_EN_2);
    instalarVentana({ posDisplay: bridge, storage: memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '1' }) });
    const choice = readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '1' }));
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, choice)).toBe(true);
    expect(await closeCustomerDisplay({ bridgeWindowOpen: true })).toBe('electron');
    expect(await openCustomerDisplay()).toEqual({ via: 'electron' });
    expect(bridge.close).toHaveBeenCalledTimes(1);
    expect(bridge.open).toHaveBeenCalledWith({ origin: 'http://localhost:47800', displayId: 1 });
  });
});
