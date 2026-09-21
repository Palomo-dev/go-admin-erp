/**
 * Tester · Parte D (indicador en el POS y tarjeta de Configuración › POS),
 * ronda 7 (verificación de la ronda 4 del builder desde el punto de vista
 * de la PANTALLA). Las rondas 4-6 ya prueban la época de settings.ts como
 * propiedad y el `reason` con tablas exhaustivas; aquí se cierra lo que
 * ninguna cubre: que el efecto de descartar una respuesta superada llegue
 * de verdad a la ventana de /pos-display.
 *
 * T1 · Relecturas fuera de orden con una PANTALLA REAL escuchando
 *      (BroadcastChannelReceiver sobre BroadcastChannel de Node ≥ 18):
 *      encender y apagar seguidos en Configuración; la respuesta «encendido»
 *      llega la última. La pantalla debe quedarse con el `bye` del apagado y
 *      NO recibir un `hello` posterior (un hello tardío la haría salir de
 *      «Conectando…» y pintar el pedido con el interruptor apagado).
 * T2 · Prime que gana a la carga lenta, visto desde la pantalla: tras la
 *      navegación POS → Configuración (encender) → POS, la pantalla recibe
 *      `hello` + `state` del segundo arranque, y la caja no vuelve a leer la
 *      fila.
 * T1 · Cierre de sesión con una carga en vuelo: tras
 *      `clearCustomerDisplaySettingsCache()` una NUEVA carga de la misma
 *      organización que responde ANTES que la vieja manda; la vieja llega
 *      después y se descarta. (El orden inverso —la vieja responde antes—
 *      no se cubre aquí: la limpieza reinicia las épocas y ambas cargas
 *      comparten la época 1; queda anotado en el informe de la ronda.)
 * Bordes de settings.ts sin cubrir: organización inválida en `refresh` no
 *      consulta ni escribe; `prime` con JSON malformado degrada a apagado y
 *      la caja no emite; `refresh` que responde con fila malformada apaga
 *      una caja encendida (la BD manda, aunque el JSON sea raro).
 * Indicador (estático): «Activar y abrir» guarda ANTES de aplicar y de
 *      abrir, y el orden save → apply → open está en el código; la etiqueta
 *      del botón nunca dice «desactivada» sin `reason === 'disabled'`.
 *
 * Fixtures ficticios (org 120 / org 121). Sin Supabase real.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  clearCustomerDisplaySettingsCache,
  getCachedCustomerDisplaySettings,
  hasCustomerDisplaySettingsCache,
  loadCustomerDisplaySettings,
  primeCustomerDisplaySettings,
  refreshCustomerDisplaySettings,
  type CustomerDisplaySettings,
} from '@/lib/pos/display/settings';
import { BroadcastChannelReceiver } from '@/lib/pos/display/transport';
import { TERMINAL_ID_STORAGE_KEY } from '@/lib/pos/display/terminal';
import type { DownMessage } from '@/lib/pos/display/protocol';

// ---------------------------------------------------------------------------
// Supabase simulado con lecturas demorables una a una
// ---------------------------------------------------------------------------

type Row = { settings: unknown } | null;

interface PendingRead {
  snapshot: Row;
  resolve: (outcome: 'ok' | 'error') => void;
}

const db: {
  row: Row;
  reads: number;
  hold: boolean;
  pending: PendingRead[];
  upserts: number;
} = { row: null, reads: 0, hold: false, pending: [], upserts: 0 };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          db.reads += 1;
          const snapshot = db.row;
          if (!db.hold) return { data: snapshot, error: null };
          const outcome = await new Promise<'ok' | 'error'>((resolve) => {
            db.pending.push({ snapshot, resolve });
          });
          if (outcome === 'error') return { data: null, error: { message: 'red caída' } };
          return { data: snapshot, error: null };
        },
        upsert: async (payload: { settings: unknown }) => {
          db.upserts += 1;
          db.row = { settings: payload.settings };
          return { error: null };
        },
      };
      return chain;
    },
  },
}));

let orgId = 120;
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => orgId,
  getCurrentBranchId: () => 7,
}));

const TERMINAL = '77777777-8888-4999-8aaa-bbbbbbbbbbbb';
const CAPS = { touch: false, width: 1280, height: 800 } as const;

type StorageListener = (event: { key: string | null }) => void;
const fakeWindow = {
  listeners: [] as StorageListener[],
  addEventListener(_type: 'storage', listener: StorageListener) {
    this.listeners.push(listener);
  },
  removeEventListener(_type: 'storage', listener: StorageListener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  },
  fire(key: string | null) {
    for (const l of [...this.listeners]) l({ key });
  },
  localStorage: {
    setItem: () => undefined,
    getItem: (key: string) => (key === TERMINAL_ID_STORAGE_KEY ? TERMINAL : null),
  },
};
const g = globalThis as unknown as { window?: unknown };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const posDisplay = require('@/lib/pos/display/posDisplay') as typeof import('@/lib/pos/display/posDisplay');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ConfiguracionService } = require('@/components/pos/configuracion/configuracionService') as typeof import('@/components/pos/configuracion/configuracionService');

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}

async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await flush(1);
  }
}

function release(index: number, outcome: 'ok' | 'error' = 'ok'): void {
  const read = db.pending[index];
  if (!read) throw new Error(`no hay lectura pendiente #${index}`);
  read.resolve(outcome);
}

/** Pantalla real que anota cada mensaje de bajada por tipo. */
function openDisplay(): { receiver: BroadcastChannelReceiver; log: DownMessage['t'][] } {
  const receiver = new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 20 });
  const log: DownMessage['t'][] = [];
  receiver.onDown((msg) => {
    log.push(msg.t);
  });
  opened.push(receiver);
  return { receiver, log };
}

const opened: Array<{ close(): void }> = [];

beforeEach(() => {
  g.window = fakeWindow;
  fakeWindow.listeners = [];
  orgId = 120;
  db.row = null;
  db.reads = 0;
  db.hold = false;
  db.pending = [];
  db.upserts = 0;
  clearCustomerDisplaySettingsCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  posDisplay.stopPosDisplay();
  while (opened.length > 0) opened.pop()?.close();
  for (const read of db.pending) read.resolve('ok');
  delete g.window;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// T1 · fuera de orden visto desde la pantalla
// ---------------------------------------------------------------------------

describe('T1 · relecturas fuera de orden con una pantalla real escuchando', () => {
  it('encender y apagar seguidos; «encendido» responde la última: la pantalla no recibe NINGÚN hello y la caja sigue apagada', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(false);

    const { receiver, log } = openDisplay();
    receiver.startPresence({ ...CAPS });
    await flush(6);
    // Con la caja apagada la pantalla no recibe nada.
    expect(log).toEqual([]);

    db.hold = true;
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY); // lectura #0: true
    await flush();
    db.row = { settings: { enabled: false } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY); // lectura #1: false
    await flush();
    expect(db.pending).toHaveLength(2);

    // La más reciente (apagado) responde primero: la caja sigue apagada y la pantalla no oye nada.
    release(1);
    await flush(6);
    expect(emitter.isEmitting).toBe(false);
    const heardBeforeStale = log.length;

    // Llega la respuesta superada (encendido): debe descartarse.
    release(0);
    await flush(10);
    expect(getCachedCustomerDisplaySettings(120)).toEqual({ enabled: false });
    expect(emitter.isEmitting).toBe(false);
    // La pantalla no recibió ningún hello ni state: sigue sin instancia activa.
    expect(log.slice(heardBeforeStale)).toEqual([]);
    expect(log).not.toContain('hello');
    expect(receiver.activeInstanceId).toBeNull();
  });

  it('apagar y encender seguidos; «apagado» responde la última: la pantalla acaba con hello + state y la caja emitiendo', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
    const { receiver, log } = openDisplay();
    receiver.startPresence({ ...CAPS });
    receiver.send({ t: 'need_snapshot', capabilities: { ...CAPS } });
    await waitFor(() => log.includes('state'));

    db.hold = true;
    db.row = { settings: { enabled: false } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY); // #0: false
    await flush();
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY); // #1: true
    await flush();

    release(1); // encendido (más reciente) primero: la caja ya emitía, sigue emitiendo
    await flush(6);
    expect(emitter.isEmitting).toBe(true);
    const beforeStale = log.length;
    release(0); // apagado (superado): se descarta
    await flush(10);
    expect(emitter.isEmitting).toBe(true);
    expect(log.slice(beforeStale)).not.toContain('bye');
    expect(getCachedCustomerDisplaySettings(120)).toEqual({ enabled: true });
    // La pantalla sigue con la caja como instancia activa.
    expect(receiver.activeInstanceId).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T2 · prime que gana a la carga lenta, visto desde la pantalla
// ---------------------------------------------------------------------------

describe('T2 · POS → Configuración (encender) → POS con la carga del POS en vuelo, con pantalla real', () => {
  it('al volver al POS la pantalla recibe hello + state sin que la caja vuelva a leer la fila', async () => {
    const { receiver, log } = openDisplay();
    receiver.startPresence({ ...CAPS });

    db.hold = true;
    const first = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await flush();
    expect(db.pending).toHaveLength(1); // lectura #0 (sin fila)

    posDisplay.stopPosDisplay(); // el cajero se va a Configuración
    const save = ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    await flush();
    release(1); // lectura previa al upsert
    await save;
    expect(db.upserts).toBe(1);
    expect(getCachedCustomerDisplaySettings(120)).toEqual({ enabled: true });

    release(0); // la carga vieja responde «sin fila»
    await first;
    await flush();
    expect(getCachedCustomerDisplaySettings(120)).toEqual({ enabled: true });
    expect(log).not.toContain('hello'); // el primer arranque quedó cancelado por stop

    db.hold = false;
    const readsBefore = db.reads;
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
    expect(db.reads).toBe(readsBefore); // sin consulta nueva
    await waitFor(() => log.includes('hello') && log.includes('state'));
    expect(receiver.activeInstanceId).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T1 · cierre de sesión con carga en vuelo
// ---------------------------------------------------------------------------

describe('T1 · clearCustomerDisplaySettingsCache con una carga en vuelo', () => {
  it('tras limpiar, la NUEVA carga de la misma organización manda aunque la vieja responda después', async () => {
    db.hold = true;
    db.row = { settings: { enabled: true } };
    const stale = loadCustomerDisplaySettings(120); // lectura #0: true
    await flush();
    expect(db.pending).toHaveLength(1);

    clearCustomerDisplaySettingsCache(); // cierre de sesión / cambio de organización
    db.row = { settings: { enabled: false } };
    const fresh = loadCustomerDisplaySettings(120); // lectura #1: false (la fila cambió entre medias)
    await flush();
    expect(db.pending).toHaveLength(2);

    release(1);
    await expect(fresh).resolves.toEqual({ enabled: false });
    release(0);
    await stale;
    await flush();
    // La respuesta vieja pertenece a una sesión anterior y no debe imponerse a la nueva.
    expect(getCachedCustomerDisplaySettings(120)).toEqual({ enabled: false });
  });
});

// ---------------------------------------------------------------------------
// Bordes de settings.ts
// ---------------------------------------------------------------------------

describe('settings.ts · bordes', () => {
  it.each([0, -3, NaN, 2.5])('refreshCustomerDisplaySettings(%p): no consulta, no escribe caché y devuelve apagado', async (bad) => {
    await expect(refreshCustomerDisplaySettings(bad)).resolves.toEqual({ enabled: false });
    expect(db.reads).toBe(0);
    expect(hasCustomerDisplaySettingsCache(bad)).toBe(false);
  });

  it.each([
    ['enabled como texto', { enabled: 'true' }],
    ['enabled numérico', { enabled: 1 }],
    ['array', [true]],
    ['null', null],
    ['string', 'enabled'],
  ])('prime con JSON malformado (%s) degrada a apagado y la caja no emite', async (_label, raw) => {
    primeCustomerDisplaySettings(120, raw as unknown as CustomerDisplaySettings);
    expect(getCachedCustomerDisplaySettings(120)).toEqual({ enabled: false });
    expect(hasCustomerDisplaySettingsCache(120)).toBe(true);
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(false);
    expect(db.reads).toBe(0);
  });

  it('relectura que responde con una fila malformada apaga una caja encendida (la BD manda) y la pantalla recibe bye', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    const { receiver, log } = openDisplay();
    receiver.startPresence({ ...CAPS });
    receiver.send({ t: 'need_snapshot', capabilities: { ...CAPS } });
    await waitFor(() => log.includes('state'));
    expect(emitter.isEmitting).toBe(true);
    db.row = { settings: 'garbage' };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush(6);
    expect(getCachedCustomerDisplaySettings(120)).toEqual({ enabled: false });
    expect(emitter.isEmitting).toBe(false);
    expect(log).toContain('bye');
  });

  it('relectura con error y caché vacía mientras hay un prime posterior: el fallback no pisa el prime', async () => {
    db.hold = true;
    const refresh = refreshCustomerDisplaySettings(120); // #0 (fallará)
    await flush();
    primeCustomerDisplaySettings(120, { enabled: true });
    release(0, 'error');
    await expect(refresh).resolves.toEqual({ enabled: true });
    expect(getCachedCustomerDisplaySettings(120)).toEqual({ enabled: true });
  });
});

// ---------------------------------------------------------------------------
// Indicador · comprobaciones estáticas
// ---------------------------------------------------------------------------

describe('indicador · comprobaciones estáticas', () => {
  const root = path.resolve(__dirname, '../../..');
  const indicator = fs.readFileSync(path.join(root, 'src/components/pos/display/CustomerDisplayIndicator.tsx'), 'utf8');

  it('«Activar y abrir» guarda, aplica y abre en ese orden, y solo se ofrece con reason === "disabled"', () => {
    const save = indicator.indexOf("saveCustomerDisplayConfig({ enabled: true })");
    const apply = indicator.indexOf('applyPosDisplaySettings()');
    const open = indicator.indexOf('await handleOpen()');
    expect(save).toBeGreaterThan(-1);
    expect(apply).toBeGreaterThan(save);
    expect(open).toBeGreaterThan(apply);
    expect(indicator).toMatch(/reason === 'disabled' && \(\s*<DropdownMenuItem onSelect=\{\(\) => void handleEnableAndOpen\(\)\}/);
  });

  it('la etiqueta del botón solo dice «desactivada» con reason === "disabled"; con "loading" o "unsupported" dice «sin pantalla»', () => {
    // F1 ronda 2: «desactivada» va ANTES que «abierta sin señal» (solo escritorio) y esta antes que «sin pantalla».
    // F1 ronda 4 (D3): el orden lo decide el criterio puro resolveIndicatorState; el indicador solo lo pinta.
    expect(indicator).toMatch(
      /indicatorState === 'disabled'\s*\?\s*t\('indicator\.disabled'\)\s*:\s*indicatorState === 'open-no-signal'\s*\?\s*t\('indicator\.openNoSignal'\)\s*:\s*t\('indicator\.disconnected'\)/,
    );
    expect(indicator).toMatch(/resolveIndicatorState\(\{ connected, reason, signal: windowSignal \}\)/);
    // Ninguna otra rama pinta indicator.disabled ni indicator.notEmitting.
    expect(indicator.match(/t\('indicator\.disabled'\)/g)).toHaveLength(1);
    expect(indicator.match(/t\('indicator\.notEmitting'\)/g)).toHaveLength(1);
    expect(indicator).toMatch(/reason === 'disabled' \? t\('indicator\.notEmitting'\)/);
  });

  it('el error al activar desde el indicador no deja «enabling» colgado (finally) y no abre la pantalla', () => {
    expect(indicator).toMatch(/finally \{\s*setEnabling\(false\);\s*\}/);
    // handleOpen va DESPUÉS del await del guardado, dentro del try: si el guardado falla no se abre.
    const tryStart = indicator.indexOf('try {', indicator.indexOf('const handleEnableAndOpen'));
    const catchStart = indicator.indexOf('} catch (err) {', tryStart);
    const openCall = indicator.indexOf('await handleOpen()', tryStart);
    expect(openCall).toBeGreaterThan(tryStart);
    expect(openCall).toBeLessThan(catchStart);
  });
});
