/**
 * Tester Fase 1 (Electron), ronda 2: pruebas adversariales sobre las
 * correcciones de la ronda (desktopDisplay.ts, posDisplay.ts, openDisplay.ts,
 * tarjeta e indicador). Sin React ni DOM; puente falso en memoria.
 *
 * Ronda 3: los hallazgos A, B y C se corrigieron y sus `it.failing` pasaron a
 * aserciones normales; los tests «documenta lo que hoy pasa» se voltearon al
 * comportamiento corregido (D, E y G también).
 *
 * Ronda 4 (D1): la sincronía hacia abajo se eliminó; el bloque E ahora
 * afirma que apagar desde la tarjeta manda `setEnabled` UNA vez y que leer
 * la organización no escribe nada en el puente.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESKTOP_DISPLAY_ID_STORAGE_KEY,
  enableDesktopDisplayHere,
  UNKNOWN_DISPLAY_CHOICE,
  describeSelectedDisplay,
  displayChoiceToPersist,
  persistDesktopDisplayChoice,
  readSavedDisplayChoice,
  resolveDesktopWindowSignal,
  resolveIndicatorState,
  resolveNothingToClose,
  saveDisplayChoice,
  type DisplayIdStorage,
} from '@/lib/pos/display/desktopDisplay';
import { __resetCustomerDisplayWindowForTests, closeCustomerDisplay, openCustomerDisplay } from '@/lib/pos/display/openDisplay';
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

const ORG = 120;
const PRINCIPAL: DesktopDisplayInfo = { id: 1, label: 'Principal', isPrimary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
const SECUNDARIO: DesktopDisplayInfo = { id: 2, label: 'TV', isPrimary: false, bounds: { x: 1920, y: 0, width: 1366, height: 768 } };
const DISPLAYS = [PRINCIPAL, SECUNDARIO];
const ABIERTA: DesktopPosDisplayStatus = { open: true, displayId: 2 };

function fakeBridge(status: DesktopPosDisplayStatus = { open: false, displayId: null }) {
  const saved: Array<[boolean, number | null | undefined]> = [];
  const bridge: DesktopPosDisplayBridge & { setEnabled: jest.Mock; close: jest.Mock; open: jest.Mock } = {
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

type GlobalConVentana = { window?: { goAdminDesktop?: unknown; localStorage?: DisplayIdStorage; location?: { origin: string } } };

function instalarVentana(opts: { posDisplay?: unknown; storage?: DisplayIdStorage } = {}) {
  (globalThis as GlobalConVentana).window = {
    ...(opts.posDisplay !== undefined ? { goAdminDesktop: { posDisplay: opts.posDisplay } } : {}),
    ...(opts.storage ? { localStorage: opts.storage } : {}),
    location: { origin: 'http://localhost:47800' },
  };
}

const SRC = join(process.cwd(), 'src');
const indicator = readFileSync(join(SRC, 'components/pos/display/CustomerDisplayIndicator.tsx'), 'utf8');
const card = readFileSync(join(SRC, 'components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx'), 'utf8');
const hook = readFileSync(join(SRC, 'components/pos/display/useDesktopDisplayWindow.ts'), 'utf8');
const fullscreen = readFileSync(join(SRC, 'components/pos-display/FullscreenButton.tsx'), 'utf8');

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
describe('A · copia local del monitor: valores raros que Number() acepta', () => {
  it('corregido: cadena vacía en localStorage → «desconocida», no el monitor #0', () => {
    // Un `setItem(clave, '')` (limpieza a medias, extensión, consola) dejaba la elección como
    // «conocida, monitor 0»: al alternar el interruptor viajaba setEnabled(enabled, 0) y
    // autoOpenIfEnabled del proceso principal decía «monitor 0 no está conectado; no se abre».
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '' }))).toEqual({ known: false, id: null });
  });

  it('corregido: "", " ", "1e3" y "0x10" ya no se convierten: solo dígitos cuentan como monitor conocido', () => {
    for (const raw of ['', ' ', '1e3', '0x10', '+2', '2.0', '２']) {
      expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: raw }))).toEqual(UNKNOWN_DISPLAY_CHOICE);
    }
    // Con "" el toggle del interruptor manda undefined (conserva el monitor guardado), no 0.
    expect(displayChoiceToPersist(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '' })))).toBeUndefined();
  });

  it('ida y vuelta sana: lo que guarda saveDisplayChoice siempre se relee igual (número, auto, desconocida)', () => {
    const s = memoryStorage();
    saveDisplayChoice(s, { known: true, id: 2528732444 });
    expect(readSavedDisplayChoice(s)).toEqual({ known: true, id: 2528732444 });
    saveDisplayChoice(s, { known: true, id: null });
    expect(readSavedDisplayChoice(s)).toEqual({ known: true, id: null });
    saveDisplayChoice(s, { known: false, id: 99 }); // id se ignora: desconocida borra
    expect(readSavedDisplayChoice(s)).toEqual({ known: false, id: null });
    expect(s.data).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B · «abierta sin señal» cuando la caja EMPIEZA a emitir con la ventana ya abierta', () => {
  it('corregido: la gracia se cuenta desde max(apertura, inicio de la emisión) → sin ámbar falso el primer latido tras activar', () => {
    // Ventana auto-abierta al arrancar hace 30 s (organización apagada). El cajero pulsa
    // «Activar y abrir»: emitting pasa a true hace 0,5 s. La pantalla no puede haber contestado
    // aún (presencia cada 1 s): 'open' hasta que pase la gracia desde que la caja emite.
    const openedAt = 1_000;
    const ahora = openedAt + 30_000;
    expect(resolveDesktopWindowSignal(ABIERTA, false, openedAt, ahora, STALE_AFTER_MS, true, ahora - 500)).toBe('open');
    // Emitiendo desde hace 4 s sin señal: ahora sí, canal roto.
    expect(resolveDesktopWindowSignal(ABIERTA, false, openedAt, ahora, STALE_AFTER_MS, true, ahora - 4_000)).toBe('open-no-signal');
  });

  it('sin emittingSince (llamada antigua) se conserva el criterio por apertura', () => {
    const openedAt = 1_000;
    expect(resolveDesktopWindowSignal(ABIERTA, false, openedAt, openedAt + 30_000, STALE_AFTER_MS, true)).toBe('open-no-signal');
    expect(resolveDesktopWindowSignal(ABIERTA, false, openedAt, openedAt + STALE_AFTER_MS - 1, STALE_AFTER_MS, true)).toBe('open');
  });

  it('el hook registra cuándo empezó a emitir (emittingSinceRef) además de openedAt, y se lo pasa al criterio', () => {
    expect(hook).toMatch(/openedAtRef/);
    expect(hook).toMatch(/emittingSinceRef\.current = emitting \? Date\.now\(\) : null/);
    expect(hook).toMatch(/emittingRef\.current,\s*emittingSinceRef\.current,\s*\)/);
    expect(hook).toMatch(/\[connected, emitting, evaluate, state\.available, state\.status\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('C · «Cerrar» en escritorio sin ventana del puente pero con presencia', () => {
  it('corregido: puente que sabe cerrar + status cerrada + sin referencia propia → closeCustomerDisplay devuelve "none" (toast «ciérrela donde la abrió»)', async () => {
    // Ronda 1 del puente: open() rechazó (origen no permitido) → cayó a window.open (emergente
    // web). La caja se recargó: se perdió la referencia. La pantalla sigue conectada por el relay.
    // El indicador habilita «Cerrar» (connected) y al pulsarlo: nativeApi.close() → no-op en el
    // proceso principal (no hay ventana hija) → 'electron' → sin toast «ciérrela donde la abrió».
    // En el navegador el mismo caso devuelve 'none' y avisa. `knownOpen` existe reservado en deps
    // y `resolveNothingToClose` ya conoce `windowOpen`: close debería usarlos.
    const { bridge } = fakeBridge({ open: false, displayId: null });
    instalarVentana({ posDisplay: bridge });
    const result = await closeCustomerDisplay({ knownOpen: true });
    expect(result).toBe('none');
  });

  it('corregido: sin ventana hija ni propia, close() del puente NO se llama; con ventana hija sigue siendo "electron"', async () => {
    const { bridge } = fakeBridge({ open: false, displayId: null });
    instalarVentana({ posDisplay: bridge });
    expect(await closeCustomerDisplay()).toBe('none');
    expect(bridge.close).not.toHaveBeenCalled();
    // El indicador SÍ habilita «Cerrar» en ese caso (presencia): el aviso es alcanzable y ahora se muestra.
    expect(resolveNothingToClose({ connected: true, hasOwnWindow: false, bridgeCanClose: true, windowOpen: false })).toBe(false);
    // Con el dato explícito del hook (bridgeWindowOpen) no se consulta status().
    expect(await closeCustomerDisplay({ bridgeWindowOpen: false })).toBe('none');
    expect(bridge.status).toHaveBeenCalledTimes(1);
    const abierta = fakeBridge({ open: true, displayId: 2 });
    instalarVentana({ posDisplay: abierta.bridge });
    expect(await closeCustomerDisplay()).toBe('electron');
    expect(abierta.bridge.close).toHaveBeenCalledTimes(1);
    expect(await closeCustomerDisplay({ bridgeWindowOpen: true })).toBe('electron');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D · «Activar y abrir» desde el indicador persiste «abrir sola al arrancar» en esta máquina', () => {
  it('corregido: applyPosDisplaySettings() sigue sin encender por sincronía, pero el indicador llama a enableDesktopDisplayHere → setEnabled(true, elección) una vez', async () => {
    const { bridge, saved } = fakeBridge();
    instalarVentana({ posDisplay: bridge });
    primeCustomerDisplaySettings(ORG, { enabled: true });
    applyPosDisplaySettings();
    expect(saved).toEqual([]); // nunca se enciende por sincronía
    // Lo que hace handleEnableAndOpen tras guardar la organización: acción explícita del usuario aquí.
    expect(await enableDesktopDisplayHere(bridge, memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '2' }))).toBe(true);
    expect(saved).toEqual([[true, 2]]);
    expect(await enableDesktopDisplayHere(bridge, memoryStorage())).toBe(true);
    expect(saved).toEqual([
      [true, 2],
      [true, undefined],
    ]);
    expect(indicator).toMatch(/void enableDesktopDisplayHere\(getDesktopPosDisplayBridge\(\), readLocalStorage\(\)\);/);
    expect(card).toMatch(/persistDesktopDisplayChoice\(desktopBridge, saved\.enabled, displayChoiceToPersist\(displayChoice\)\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('E · sin sincronía hacia abajo (ronda 4, D1): una escritura por acción del usuario y ninguna por lectura', () => {
  it('apagar desde la tarjeta manda setEnabled UNA vez (persist explícito ANTES de applyPosDisplaySettings, que ya no escribe nada)', async () => {
    const { bridge, saved } = fakeBridge();
    instalarVentana({ posDisplay: bridge });
    // Simula handleToggleEnabled(false): el servicio fija la caché, la tarjeta persiste con la
    // elección de esta máquina y DESPUÉS aplica a la caja.
    primeCustomerDisplaySettings(ORG, { enabled: false });
    expect(await persistDesktopDisplayChoice(bridge, false, 2)).toBe(true);
    applyPosDisplaySettings();
    await Promise.resolve();
    await Promise.resolve();
    expect(saved).toEqual([[false, 2]]);
    // La tarjeta persiste antes de aplicar (orden en el código).
    const persistIdx = card.indexOf('await persistDesktopDisplayChoice(desktopBridge, saved.enabled');
    const applyIdx = card.indexOf('applyPosDisplaySettings();', persistIdx);
    expect(persistIdx).toBeGreaterThan(0);
    expect(applyIdx).toBeGreaterThan(persistIdx);
  });

  it('sin memo: si el IPC falla, la siguiente acción del usuario vuelve a escribir; dos acciones seguidas son dos escrituras', async () => {
    let rejectFirst: (e: Error) => void = () => undefined;
    const calls: Array<[boolean, number | null | undefined]> = [];
    const bridge: DesktopPosDisplayBridge = {
      setEnabled: jest.fn((enabled: boolean, displayId?: number | null) => {
        calls.push([enabled, displayId]);
        if (calls.length === 1) return new Promise<void>((_, reject) => (rejectFirst = reject));
        return Promise.resolve();
      }),
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p1 = persistDesktopDisplayChoice(bridge, false, undefined);
    const p2 = persistDesktopDisplayChoice(bridge, true, 2);
    rejectFirst(new Error('IPC'));
    expect(await p1).toBe(false);
    expect(await p2).toBe(true);
    expect(await persistDesktopDisplayChoice(bridge, false, undefined)).toBe(true);
    expect(calls).toEqual([
      [false, undefined],
      [true, 2],
      [false, undefined],
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('setEnabled que LANZA síncronamente (no rechaza): persist devuelve false y no lanza', async () => {
    const bridge: DesktopPosDisplayBridge = {
      setEnabled: () => {
        throw new Error('bridge roto');
      },
    };
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(persistDesktopDisplayChoice(bridge, false, undefined)).resolves.toBe(false);
  });

  it('leer la organización en apagado con copia local "auto" no escribe nada: la copia local solo viaja con una acción del usuario', async () => {
    const { bridge, saved } = fakeBridge();
    instalarVentana({ posDisplay: bridge, storage: memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'auto' }) });
    primeCustomerDisplaySettings(ORG, { enabled: false });
    applyPosDisplaySettings();
    await Promise.resolve();
    expect(saved).toEqual([]);
  });

  it('un Desktop con posDisplay = null o un puente que no es objeto no rompe applyPosDisplaySettings', () => {
    instalarVentana({ posDisplay: null });
    primeCustomerDisplaySettings(ORG, { enabled: false });
    expect(() => applyPosDisplaySettings()).not.toThrow();
    instalarVentana({ posDisplay: 'basura' });
    expect(() => applyPosDisplaySettings()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('F · «Abrir ahora» y el monitor elegido', () => {
  it('con copia local "auto" explícita, open() viaja con displayId null (automático), no undefined', async () => {
    const { bridge } = fakeBridge();
    instalarVentana({ posDisplay: bridge, storage: memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'auto' }) });
    expect(await openCustomerDisplay()).toEqual({ via: 'electron' });
    expect(bridge.open).toHaveBeenCalledWith({ origin: 'http://localhost:47800', displayId: null });
  });

  it('sin copia local (desconocida), open() viaja con displayId null: el proceso principal NO consulta su config.json a petición (pendiente del puente)', async () => {
    const { bridge } = fakeBridge();
    instalarVentana({ posDisplay: bridge, storage: memoryStorage() });
    await openCustomerDisplay();
    expect(bridge.open).toHaveBeenCalledWith({ origin: 'http://localhost:47800', displayId: null });
  });

  it('con copia local "" (hallazgo A, corregido) open() viaja con displayId null (desconocida → automático), no 0', async () => {
    const { bridge } = fakeBridge();
    instalarVentana({ posDisplay: bridge, storage: memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '' }) });
    await openCustomerDisplay();
    expect(bridge.open).toHaveBeenCalledWith({ origin: 'http://localhost:47800', displayId: null });
  });

  it('la tarjeta abre con openCustomerDisplay() sin displayId: la elección sale de localStorage, así que estado y copia deben ir siempre juntos', () => {
    expect(card).toMatch(/const result = await openCustomerDisplay\(\);/);
    // Cada cambio de elección guarda la copia ANTES de persistir en el proceso principal y la revierte si falla.
    expect(card).toMatch(/setDisplayChoice\(choice\);\s*saveDisplayChoiceInBrowser\(choice\);/);
    expect(card).toMatch(/setDisplayChoice\(previous\);\s*saveDisplayChoiceInBrowser\(previous\);/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('G · selector: elección desconocida pintada con el monitor de la ventana (orientativa)', () => {
  it('known=false con id de la ventana abierta → describeSelectedDisplay lo pinta como listado; al alternar el interruptor viaja undefined', () => {
    const choice = { known: false, id: 2 };
    expect(describeSelectedDisplay(DISPLAYS, choice.id)).toEqual({ kind: 'listed', display: SECUNDARIO });
    expect(displayChoiceToPersist(choice)).toBeUndefined();
  });

  it('corregido: la tarjeta relee la lista en onStatus, al desplegar el selector (onOpenChange) y al volver a la ventana (focus/visibilitychange)', () => {
    // display-added sin auto-apertura (organización apagada o displayId ajeno) no emite pos-display:status.
    const bloque = card.slice(card.indexOf('subscribeDesktopDisplayStatus(bridge'), card.indexOf('return () => {', card.indexOf('subscribeDesktopDisplayStatus(bridge')));
    expect(bloque).toMatch(/listDesktopDisplays\(bridge\)/);
    expect(card.match(/listDesktopDisplays\(bridge\)/g)).toHaveLength(3); // carga + onStatus + al volver a la ventana
    expect(card).toMatch(/window\.addEventListener\('focus', refreshOnReturn\)/);
    expect(card).toMatch(/document\.addEventListener\('visibilitychange', refreshOnReturn\)/);
    expect(card).toMatch(/window\.removeEventListener\('focus', refreshOnReturn\)/);
    expect(card).toMatch(/onOpenChange=\{handleSelectOpenChange\}/);
    expect(card).toMatch(/listDesktopDisplays\(desktopBridge\)\.then\(setDisplays\)/);
    expect(card).not.toMatch(/setInterval/);
    // «Abrir ahora» con la ventana en otro monitor: cierra y reabre por el puente.
    expect(card).toMatch(/needsReopenForDisplayChange\(windowStatus, displayChoice\)/);
    expect(card).toMatch(/closeCustomerDisplay\(\{ bridgeWindowOpen: true \}\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('H · contrato con el proceso principal y limpieza', () => {
  it('ningún archivo web menciona el nombre viejo del puente (electron + API); el puente es goAdminDesktop', () => {
    // El nombre se compone para que `grep -rn <nombre> src/` siga dando cero incluyendo este test.
    const nombreViejo = new RegExp(['electron', 'API'].join(''));
    for (const src of [indicator, card, hook, fullscreen]) expect(src).not.toMatch(nombreViejo);
  });

  it('FullscreenButton se oculta con isDesktop() y no depende de la existencia de listDisplays (Desktop 0.2.0 también lo esconde)', () => {
    expect(fullscreen).toMatch(/if \(isDesktop\(\) \|\|/);
    expect(fullscreen).not.toMatch(/goAdminDesktop|listDisplays|getDesktopBridge/);
  });

  it('el indicador ordena conectada → desactivada → abierta sin señal → sin pantalla por el criterio puro resolveIndicatorState (ronda 4, D3)', () => {
    expect(indicator).toMatch(/resolveIndicatorState\(\{ connected, reason, signal: windowSignal \}\)/);
    expect(indicator).toMatch(
      /indicatorState === 'connected'\s*\?\s*t\('indicator\.connected'\)\s*:\s*indicatorState === 'disabled'\s*\?\s*t\('indicator\.disabled'\)\s*:\s*indicatorState === 'open-no-signal'\s*\?\s*t\('indicator\.openNoSignal'\)\s*:\s*t\('indicator\.disconnected'\)/,
    );
    expect(indicator).toMatch(/const openNoSignal = indicatorState === 'open-no-signal'/);
    expect(resolveIndicatorState({ connected: false, reason: 'disabled', signal: 'open-no-signal' })).toBe('disabled');
    expect(resolveIndicatorState({ connected: false, reason: 'loading', signal: 'open-no-signal' })).toBe('disconnected');
  });

  it('la tarjeta NO sincroniza hacia abajo (ronda 4, D1): al cargar la organización solo pinta y avisa si la lectura falló', () => {
    expect(card).not.toMatch(new RegExp(['sync', 'DesktopDisplayEnabledDown'].join(''))); // nombre compuesto: grep de la compuerta = 0
    expect(card).toMatch(/loadFailed/);
    expect(card.match(/persistDesktopDisplayChoice\(/g)).toHaveLength(2); // interruptor + selector de monitor: las dos acciones del usuario
  });
});
