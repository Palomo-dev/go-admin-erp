/**
 * Fase 1 (Electron en la segunda pantalla), ronda 4 (cierre): decisiones
 * D1–D8 del orquestador. Lógica pura con puente falso en memoria; sin React
 * ni DOM. Los tests de lectura de fuente son guardarraíles contra reincidir
 * en la sincronía hacia abajo.
 *
 * D1. Sin sincronía hacia abajo: `config.json` solo se escribe por acción
 *     del usuario en esta máquina; ningún cierre automático de ventana.
 * D2. «No se pudo leer» ≠ «apagado» (ver tester-f1-r3-electron.test.ts A/B).
 * D3. «Abierta sin señal»: gracia desde max(openedAt, emittingSince), nunca
 *     antes que 'disabled' ni 'loading'; reabrir reinicia openedAt.
 * D4. `closeCustomerDisplay` → 'none' sin ventana del puente ni propia, y
 *     «Cerrar» deshabilitado.
 * D5. `readSavedDisplayChoice` entero decimal estricto.
 * D6. Apagar desde la tarjeta = un solo setEnabled; relectura de monitores
 *     en focus/visibilitychange y onStatus.
 * D7. Cabecera de `needsReopenForDisplayChange` coherente con el código.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESKTOP_DISPLAY_ID_STORAGE_KEY,
  UNKNOWN_DISPLAY_CHOICE,
  enableDesktopDisplayHere,
  nextOpenedAt,
  persistDesktopDisplayChoice,
  readSavedDisplayChoice,
  resolveDesktopWindowSignal,
  resolveIndicatorState,
  resolveNothingToClose,
  type DisplayIdStorage,
} from '@/lib/pos/display/desktopDisplay';
import { __resetCustomerDisplayWindowForTests, closeCustomerDisplay, openCustomerDisplay } from '@/lib/pos/display/openDisplay';
import { applyPosDisplaySettings, getPosDisplayEmitter, stopPosDisplay } from '@/lib/pos/display/posDisplay';
import { clearCustomerDisplaySettingsCache, primeCustomerDisplaySettings } from '@/lib/pos/display/settings';
import { STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { isDesktop } from '@/lib/utils/desktop';
import type { DesktopPosDisplayBridge, DesktopPosDisplayStatus } from '@/lib/utils/desktop';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));

const ORG = 120;
const ABIERTA_EN_2: DesktopPosDisplayStatus = { open: true, displayId: 2 };
const ABIERTA_EN_1: DesktopPosDisplayStatus = { open: true, displayId: 1 };
const ABIERTA_VENTANA: DesktopPosDisplayStatus = { open: true, displayId: null };
const CERRADA: DesktopPosDisplayStatus = { open: false, displayId: null };

const SRC = join(process.cwd(), 'src');
// El fuente se lee normalizado a LF: en Windows con core.autocrlf=true un
// checkout o stash deja el árbol en CRLF y las regex con `\n` de este archivo
// (D6) fallaban aunque el índice estuviera bien. Lo que importa es el índice.
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const desktopDisplaySrc = read('lib/pos/display/desktopDisplay.ts');
const posDisplaySrc = read('lib/pos/display/posDisplay.ts');
const openDisplaySrc = read('lib/pos/display/openDisplay.ts');
const settingsSrc = read('lib/pos/display/settings.ts');
const indexSrc = read('lib/pos/display/index.ts');
const card = read('components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx');
const indicator = read('components/pos/display/CustomerDisplayIndicator.tsx');
const hook = read('components/pos/display/useDesktopDisplayWindow.ts');
const fullscreen = read('components/pos-display/FullscreenButton.tsx');
const service = read('components/pos/configuracion/configuracionService.ts');

function fakeBridge(initialStatus: DesktopPosDisplayStatus = CERRADA) {
  const saved: Array<[boolean, number | null | undefined]> = [];
  let status = initialStatus;
  const statusListeners: Array<(s: DesktopPosDisplayStatus) => void> = [];
  const bridge: DesktopPosDisplayBridge & { setEnabled: jest.Mock; close: jest.Mock; open: jest.Mock; status: jest.Mock } = {
    send: jest.fn(),
    onMessage: jest.fn(() => () => {}),
    open: jest.fn(async (opts?: { displayId?: number | null }) => {
      status = { open: true, displayId: opts?.displayId ?? 2 };
      statusListeners.forEach((l) => l(status));
      return { ok: true };
    }),
    close: jest.fn(async () => {
      status = CERRADA;
      statusListeners.forEach((l) => l(status));
    }),
    status: jest.fn(async () => status),
    onStatus: jest.fn((listener: (s: DesktopPosDisplayStatus) => void) => {
      statusListeners.push(listener);
      return () => {
        const i = statusListeners.indexOf(listener);
        if (i >= 0) statusListeners.splice(i, 1);
      };
    }),
    listDisplays: jest.fn(async () => []),
    setEnabled: jest.fn(async (enabled: boolean, displayId?: number | null) => {
      saved.push([enabled, displayId]);
    }),
  };
  return { bridge, saved };
}

function memoryStorage(initial: Record<string, string> = {}): DisplayIdStorage {
  const data = { ...initial };
  return {
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

async function drenar(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
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
describe('D1 · sin sincronía hacia abajo', () => {
  it('guardarraíl: ningún módulo web conserva la sincronía ni su estado de módulo', () => {
    // Los nombres se componen para que `grep -rn <nombre> src/` (compuerta de la ronda) siga dando cero incluyendo este test.
    const prohibido = new RegExp(
      [
        ['sync', 'DesktopDisplayEnabledDown'],
        ['opened', 'ManuallyHere'],
        ['last', 'PersistedEnabled'],
        ['shouldClose', 'OrphanDesktopWindow'],
        ['markDesktopDisplay', 'OpenedManually'],
        ['__resetDesktopDisplay', 'SyncForTests'],
        ['has', 'Emitted'],
      ]
        .map((parts) => parts.join(''))
        .join('|'),
    );
    for (const src of [posDisplaySrc, openDisplaySrc, settingsSrc, indexSrc, card, indicator, hook, service]) expect(src).not.toMatch(prohibido);
    // desktopDisplay.ts solo la menciona en la cabecera que documenta la decisión (punto 4), nunca en código.
    const codigo = desktopDisplaySrc.slice(desktopDisplaySrc.indexOf('*/') + 2);
    expect(codigo).not.toMatch(prohibido);
    expect(desktopDisplaySrc).toMatch(/4\. SIN SINCRONÍA HACIA ABAJO/);
  });

  it('config.json solo se escribe por acción del usuario: tarjeta (interruptor y monitor) y «Activar y abrir»; leer la organización no escribe', async () => {
    const { bridge, saved } = fakeBridge(ABIERTA_EN_2);
    instalarVentana({ posDisplay: bridge });
    for (const enabled of [true, false]) {
      primeCustomerDisplaySettings(ORG, { enabled });
      applyPosDisplaySettings();
    }
    await drenar();
    expect(saved).toEqual([]);
    expect(bridge.close).not.toHaveBeenCalled();

    await persistDesktopDisplayChoice(bridge, true, 2); // interruptor ON en la tarjeta
    await persistDesktopDisplayChoice(bridge, true, 1); // cambio de monitor en la tarjeta
    await persistDesktopDisplayChoice(bridge, false, 1); // interruptor OFF en la tarjeta (una sola escritura, D6)
    await enableDesktopDisplayHere(bridge, memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '1' })); // «Activar y abrir» persiste enabled=true
    expect(saved).toEqual([
      [true, 2],
      [true, 1],
      [false, 1],
      [true, 1],
    ]);
  });

  it('la organización se apaga desde otra máquina con la ventana abierta: sigue abierta (la pantalla dirá «Conectando…») y solo «Cerrar» la cierra', async () => {
    const { bridge } = fakeBridge(ABIERTA_EN_2);
    instalarVentana({ posDisplay: bridge });
    primeCustomerDisplaySettings(ORG, { enabled: true });
    getPosDisplayEmitter().start({ organizationId: ORG, currency: 'COP' });
    primeCustomerDisplaySettings(ORG, { enabled: false });
    applyPosDisplaySettings();
    await drenar();
    expect(getPosDisplayEmitter().isEmitting).toBe(false);
    expect((await bridge.status()).open).toBe(true);
    expect(bridge.close).not.toHaveBeenCalled();
    expect(await closeCustomerDisplay({ bridgeWindowOpen: true })).toBe('electron');
    expect((await bridge.status()).open).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D3 · «Pantalla abierta, sin señal»', () => {
  const ahora = 100_000;

  it('la gracia corre desde max(openedAt, emittingSince)', () => {
    const openedAt = ahora - 10_000;
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, openedAt, ahora, STALE_AFTER_MS, true, ahora - 1_000)).toBe('open');
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, openedAt, ahora, STALE_AFTER_MS, true, ahora - STALE_AFTER_MS)).toBe('open-no-signal');
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, ahora - 1_000, ahora, STALE_AFTER_MS, true, ahora - 10_000)).toBe('open');
  });

  it('nunca se antepone a reason disabled ni loading: con la organización apagada el indicador dice «desactivada»', () => {
    // El criterio de señal ya calla sin emitir (emitting=false)…
    expect(resolveDesktopWindowSignal(ABIERTA_EN_2, false, ahora - 60_000, ahora, STALE_AFTER_MS, false, null)).toBe('open');
    // …y aunque llegara 'open-no-signal', el estado del indicador antepone disabled y loading.
    expect(resolveIndicatorState({ connected: false, reason: 'disabled', signal: 'open-no-signal' })).toBe('disabled');
    expect(resolveIndicatorState({ connected: false, reason: 'loading', signal: 'open-no-signal' })).toBe('disconnected');
    expect(resolveIndicatorState({ connected: false, reason: 'unsupported', signal: 'open-no-signal' })).toBe('disconnected');
    expect(resolveIndicatorState({ connected: false, reason: null, signal: 'open-no-signal' })).toBe('open-no-signal');
    expect(resolveIndicatorState({ connected: false, reason: null, signal: 'open' })).toBe('disconnected');
    expect(resolveIndicatorState({ connected: false, reason: null, signal: 'none' })).toBe('disconnected');
    expect(resolveIndicatorState({ connected: true, reason: null, signal: 'open-no-signal' })).toBe('connected');
    expect(resolveIndicatorState({ connected: true, reason: 'disabled', signal: 'none' })).toBe('connected');
  });

  it('«Abrir ahora» que cierra y reabre reinicia openedAt: open→open con displayId distinto (lectura) o cualquier onStatus abierto (evento)', () => {
    const t0 = nextOpenedAt(null, ABIERTA_EN_2, null, 1_000);
    expect(t0).toBe(1_000);
    // Misma ventana, misma lectura: se conserva.
    expect(nextOpenedAt(ABIERTA_EN_2, ABIERTA_EN_2, t0, 5_000)).toBe(1_000);
    expect(nextOpenedAt(ABIERTA_EN_2, ABIERTA_EN_2, t0, 5_000, 'read')).toBe(1_000);
    // Reabierta en otro monitor sin ver el cierre: reinicia.
    expect(nextOpenedAt(ABIERTA_EN_2, ABIERTA_EN_1, t0, 5_000)).toBe(5_000);
    // De modo ventana a un monitor (o al revés): reinicia.
    expect(nextOpenedAt(ABIERTA_VENTANA, ABIERTA_EN_1, t0, 6_000)).toBe(6_000);
    // onStatus abierto: el proceso principal solo lo emite al abrir → reapertura aunque el monitor coincida.
    expect(nextOpenedAt(ABIERTA_EN_2, ABIERTA_EN_2, t0, 7_000, 'event')).toBe(7_000);
    // Cierre por cualquier vía: null.
    expect(nextOpenedAt(ABIERTA_EN_2, CERRADA, t0, 8_000, 'event')).toBeNull();
    expect(nextOpenedAt(ABIERTA_EN_2, CERRADA, t0, 8_000)).toBeNull();
  });

  it('escenario: ventana abierta hace mucho sin señal → ámbar; cerrar+reabrir por «Abrir ahora» → vuelve a la gracia', async () => {
    const { bridge } = fakeBridge(ABIERTA_EN_2);
    instalarVentana({ posDisplay: bridge, storage: memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '1' }) });
    let status: DesktopPosDisplayStatus | null = ABIERTA_EN_2;
    let openedAt: number | null = 1_000;
    let now = 1_000;
    bridge.onStatus!((s) => {
      openedAt = nextOpenedAt(status, s, openedAt, now, 'event');
      status = s;
    });
    now = 60_000;
    expect(resolveDesktopWindowSignal(status, false, openedAt, now, STALE_AFTER_MS, true, 2_000)).toBe('open-no-signal');
    expect(await closeCustomerDisplay({ bridgeWindowOpen: true })).toBe('electron');
    expect(resolveDesktopWindowSignal(status, false, openedAt, now, STALE_AFTER_MS, true, 2_000)).toBe('none');
    expect(await openCustomerDisplay()).toEqual({ via: 'electron' });
    expect(status).toEqual(ABIERTA_EN_1);
    expect(openedAt).toBe(60_000);
    expect(resolveDesktopWindowSignal(status, false, openedAt, now + 1_000, STALE_AFTER_MS, true, 2_000)).toBe('open');
    expect(resolveDesktopWindowSignal(status, false, openedAt, now + STALE_AFTER_MS, STALE_AFTER_MS, true, 2_000)).toBe('open-no-signal');
  });

  it('el hook pasa la fuente: lectura inicial = read, onStatus = event', () => {
    expect(hook).toMatch(/applyStatus\(status, 'read'\)/);
    expect(hook).toMatch(/applyStatus\(status, 'event'\)/);
    expect(hook).toMatch(/nextOpenedAt\(statusRef\.current, next, openedAtRef\.current, Date\.now\(\), source\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D4 · «Cerrar» sin nada que cerrar', () => {
  it('closeCustomerDisplay → none con status().open === false y sin ventana propia; el puente no se llama', async () => {
    const { bridge } = fakeBridge(CERRADA);
    instalarVentana({ posDisplay: bridge });
    expect(await closeCustomerDisplay()).toBe('none'); // consulta status()
    expect(await closeCustomerDisplay({ bridgeWindowOpen: false })).toBe('none'); // dato del hook
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('el ítem «Cerrar» del indicador va deshabilitado en ese caso, y habilitado en cuanto hay ventana, referencia propia o presencia', () => {
    const base = { connected: false, hasOwnWindow: false, bridgeCanClose: true, windowOpen: false };
    expect(resolveNothingToClose(base)).toBe(true);
    expect(resolveNothingToClose({ ...base, windowOpen: true })).toBe(false);
    expect(resolveNothingToClose({ ...base, hasOwnWindow: true })).toBe(false);
    expect(resolveNothingToClose({ ...base, connected: true })).toBe(false);
    expect(indicator).toMatch(/disabled=\{nothingToClose\}/);
    expect(indicator).toMatch(/closeCustomerDisplay\(\{ bridgeWindowOpen: windowStatus\?\.open \}\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D5 · readSavedDisplayChoice: entero decimal estricto', () => {
  it('"", " ", "1e3", "0x10", "-7" → desconocido; "7", "auto" → conocido (cierre de F1)', () => {
    for (const raw of ['', ' ', '1e3', '0x10', '+7', '7.0', '07', '-0', '-7', 'siete']) {
      expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: raw }))).toEqual(UNKNOWN_DISPLAY_CHOICE);
    }
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: '7' }))).toEqual({ known: true, id: 7 });
    expect(readSavedDisplayChoice(memoryStorage({ [DESKTOP_DISPLAY_ID_STORAGE_KEY]: 'auto' }))).toEqual({ known: true, id: null });
    expect(desktopDisplaySrc).toMatch(/if \(!\/\^\\d\+\$\/\.test\(raw\)\) return/);
    expect(desktopDisplaySrc).toMatch(/Number\.parseInt\(raw, 10\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D6 · tarjeta: una escritura al apagar y relectura de monitores al volver', () => {
  it('handleToggleEnabled persiste una vez y luego aplica a la caja (que ya no escribe nada); relee listDisplays en onStatus, focus y visibilitychange', () => {
    expect(card.match(/persistDesktopDisplayChoice\(/g)).toHaveLength(2); // interruptor + monitor
    const persistIdx = card.indexOf('await persistDesktopDisplayChoice(desktopBridge, saved.enabled');
    expect(persistIdx).toBeGreaterThan(0);
    expect(card.indexOf('applyPosDisplaySettings();', persistIdx)).toBeGreaterThan(persistIdx);
    expect(posDisplaySrc).toMatch(/export function applyPosDisplaySettings\(\): void \{\n\s*getPosDisplayEmitter\(\)\.refresh\(\);\n\}/);
    expect(card).toMatch(/window\.addEventListener\('focus', refreshOnReturn\)/);
    expect(card).toMatch(/document\.addEventListener\('visibilitychange', refreshOnReturn\)/);
    expect(card.match(/listDesktopDisplays\(bridge\)/g)).toHaveLength(3); // carga + onStatus + al volver
  });

  it('D2 en la tarjeta: con loadFailed se avisa y se deshabilitan interruptor y selector; «Abrir ahora» sigue', () => {
    expect(service).toMatch(/loadFailed: boolean/);
    expect(card).toMatch(/disabled=\{saving \|\| loadFailed\}/);
    expect(card).toMatch(/disabled=\{savingDisplay \|\| loadFailed\}/);
    expect(card).not.toMatch(/onClick=\{\(\) => void handleOpenNow\(\)\} className="shrink-0 gap-2" disabled/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D7 / limpieza', () => {
  it('la cabecera de needsReopenForDisplayChange dice lo que hace el código', () => {
    const at = desktopDisplaySrc.indexOf('export function needsReopenForDisplayChange');
    const header = desktopDisplaySrc.slice(desktopDisplaySrc.lastIndexOf('/**', at), at);
    expect(header).toMatch(/SÍ se cierra y reabre/);
    expect(header).not.toMatch(/tampoco se mueve/);
  });

  it('ningún archivo web menciona el nombre viejo del puente; FullscreenButton se oculta con isDesktop()', () => {
    const nombreViejo = new RegExp(['electron', 'API'].join(''));
    for (const src of [desktopDisplaySrc, posDisplaySrc, openDisplaySrc, card, indicator, hook, fullscreen]) expect(src).not.toMatch(nombreViejo);
    expect(fullscreen).toMatch(/if \(isDesktop\(\) \|\|/);
  });
});
