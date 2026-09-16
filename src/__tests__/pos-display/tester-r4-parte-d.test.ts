/**
 * Tester · Parte D (indicador en el POS y tarjeta de Configuración › POS),
 * ronda 4. Verifica la lista de feedback de la ronda 3 con casos que las
 * suites del builder y de las rondas 1-3 no cubren:
 *
 * T1/T2 · Época por organización en settings.ts:
 * - Carga inicial y relectura (`load` + `refresh`) que responden fuera de
 *   orden: manda la más reciente, y el llamador de la superada recibe lo que
 *   quedó en caché (nunca su propia respuesta vieja).
 * - Tres relecturas que responden 0, 2, 1: gana la 2 (la más reciente), la 1
 *   llega tarde y se descarta.
 * - Un `prime` con una relectura en vuelo: la relectura que llega después no
 *   lo pisa y devuelve lo primado.
 * - Relectura que FALLA con un prime o una carga más nuevos ya aplicados: no
 *   escribe su fallback por encima.
 * - Relectura que falla sin caché, seguida de la carga más nueva que sí
 *   responde: el fallback no bloquea a la respuesta nueva.
 * - Las épocas son por organización: un prime en la 120 no supera una carga
 *   en vuelo de la 121.
 * - `clearCustomerDisplaySettingsCache` reinicia las épocas: tras limpiar,
 *   una carga con época 1 vuelve a escribir.
 *
 * T3 · `reason` de la presencia con el entorno REAL (getPosDisplayEnvironment
 * + emisor de posDisplay.ts):
 * - Sin caché del interruptor → 'loading' (nunca 'disabled').
 * - Fila ausente cargada → 'disabled'.
 * - Encendida y emitiendo → null; otra ventana apaga → 'disabled'.
 * - Sin BroadcastChannel en el entorno y con el interruptor ENCENDIDO → 'unsupported'.
 * - Sin organización en sesión (0) → 'loading'.
 *
 * T4 · i18n: `indicator.unsupported` no manda a Configuración (no lo arregla)
 * y `closeFromOpener` no cita atajos de SO en ninguna locale.
 *
 * Estático: el indicador solo pinta `notEmitting` con reason 'disabled' y el
 * hook pasa el entorno al criterio de presencia.
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
} from '@/lib/pos/display/settings';
import { readDisplayPresence } from '@/lib/pos/display/presence';
import { STALE_AFTER_MS } from '@/lib/pos/display/transport';

// ---------------------------------------------------------------------------
// Supabase simulado con lecturas demorables una a una (y error por lectura)
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
  upserts: Array<Record<string, unknown>>;
} = { row: null, reads: 0, hold: false, pending: [], upserts: [] };

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
        upsert: async (payload: Record<string, unknown>) => {
          db.upserts.push(payload);
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
    getItem: () => null,
  },
};
const g = globalThis as unknown as { window?: unknown; BroadcastChannel?: unknown };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const posDisplay = require('@/lib/pos/display/posDisplay') as typeof import('@/lib/pos/display/posDisplay');

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}

function release(index: number, outcome: 'ok' | 'error' = 'ok'): void {
  const read = db.pending[index];
  if (!read) throw new Error(`no hay lectura pendiente #${index}`);
  read.resolve(outcome);
}

beforeEach(() => {
  g.window = fakeWindow;
  fakeWindow.listeners = [];
  orgId = 120;
  db.row = null;
  db.reads = 0;
  db.hold = false;
  db.pending = [];
  db.upserts = [];
  clearCustomerDisplaySettingsCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  posDisplay.stopPosDisplay();
  for (const read of db.pending) read.resolve('ok');
  delete g.window;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// T1/T2 · época por organización
// ---------------------------------------------------------------------------

describe('settings.ts · época por organización (T1/T2)', () => {
  it('carga inicial y relectura fuera de orden: manda la relectura (más reciente) y la carga superada devuelve lo cacheado', async () => {
    db.hold = true;
    db.row = null; // instantánea de la carga: sin fila (apagado)
    const load = loadCustomerDisplaySettings(120);
    await flush();
    db.row = { settings: { enabled: true } }; // otra ventana encendió: relectura con instantánea true
    const refresh = refreshCustomerDisplaySettings(120);
    await flush();
    expect(db.pending).toHaveLength(2);

    release(1); // la relectura responde primero
    await flush();
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
    release(0); // la carga vieja llega después
    const [fromLoad, fromRefresh] = await Promise.all([load, refresh]);
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
    // La carga superada NO devuelve su propia respuesta vieja (apagado): devuelve lo que hay.
    expect(fromLoad).toEqual({ enabled: true });
    expect(fromRefresh).toEqual({ enabled: true });
  });

  it('tres relecturas que responden 0, 2, 1: gana la 2 y la 1 (tardía) se descarta', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    db.hold = true;
    db.row = { settings: { enabled: true } };
    const r0 = refreshCustomerDisplaySettings(120);
    await flush();
    db.row = { settings: { enabled: false } };
    const r1 = refreshCustomerDisplaySettings(120);
    await flush();
    db.row = { settings: { enabled: true } };
    const r2 = refreshCustomerDisplaySettings(120);
    await flush();
    expect(db.pending).toHaveLength(3);

    release(0);
    await flush();
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
    release(2);
    await flush();
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
    release(1); // superada: su «apagado» no debe pisar el «encendido» de la 2
    await Promise.all([r0, r1, r2]);
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
    expect(await r1).toEqual({ enabled: true }); // devuelve lo vigente, no su instantánea
  });

  it('prime con una relectura en vuelo: la relectura que llega después no lo pisa y devuelve lo primado', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    db.hold = true;
    db.row = { settings: { enabled: false } };
    const refresh = refreshCustomerDisplaySettings(120);
    await flush();
    primeCustomerDisplaySettings(120, { enabled: true }); // esta ventana acaba de guardar «encendido»
    release(0);
    expect(await refresh).toEqual({ enabled: true });
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
  });

  it('relectura que FALLA con un prime más nuevo ya aplicado: no escribe su fallback encima', async () => {
    // Sin caché previa: el fallback de la relectura sería «apagado».
    db.hold = true;
    const refresh = refreshCustomerDisplaySettings(120);
    await flush();
    primeCustomerDisplaySettings(120, { enabled: true });
    release(0, 'error');
    expect(await refresh).toEqual({ enabled: true });
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
  });

  it('relectura que falla sin caché y luego responde la carga más nueva: el fallback no bloquea la respuesta nueva', async () => {
    db.hold = true;
    const refresh = refreshCustomerDisplaySettings(120); // época 1, fallará
    await flush();
    db.row = { settings: { enabled: true } };
    const load = loadCustomerDisplaySettings(120); // época 2 (no hay inflight de la relectura)
    await flush();
    expect(db.pending).toHaveLength(2);
    release(0, 'error');
    await refresh;
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(false); // fallback provisional
    release(1);
    expect(await load).toEqual({ enabled: true });
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
  });

  it('las épocas son por organización: un prime en la 120 no supera una carga en vuelo de la 121', async () => {
    db.hold = true;
    db.row = { settings: { enabled: true } };
    const load121 = loadCustomerDisplaySettings(121);
    await flush();
    primeCustomerDisplaySettings(120, { enabled: false });
    release(0);
    expect(await load121).toEqual({ enabled: true });
    expect(getCachedCustomerDisplaySettings(121).enabled).toBe(true);
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(false);
  });

  it('clearCustomerDisplaySettingsCache reinicia las épocas: tras limpiar, una carga nueva vuelve a escribir', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    primeCustomerDisplaySettings(120, { enabled: true }); // época 2 aplicada
    clearCustomerDisplaySettingsCache();
    expect(hasCustomerDisplaySettingsCache(120)).toBe(false);
    db.row = { settings: { enabled: false } };
    expect(await loadCustomerDisplaySettings(120)).toEqual({ enabled: false }); // época 1 > applied 0
    expect(hasCustomerDisplaySettingsCache(120)).toBe(true);
  });

  it('prime borra la promesa en vuelo: una carga posterior no espera a la consulta vieja ni la consulta', async () => {
    db.hold = true;
    const first = loadCustomerDisplaySettings(120);
    await flush();
    primeCustomerDisplaySettings(120, { enabled: true });
    // Nueva carga: resuelve al instante con la caché, sin encolar otra lectura.
    expect(await loadCustomerDisplaySettings(120)).toEqual({ enabled: true });
    expect(db.reads).toBe(1);
    release(0);
    expect(await first).toEqual({ enabled: true });
  });
});

// ---------------------------------------------------------------------------
// T3 · reason con el entorno real
// ---------------------------------------------------------------------------

describe('presencia · reason con getPosDisplayEnvironment y el emisor real (T3)', () => {
  function presence() {
    return readDisplayPresence(posDisplay.getPosDisplayEmitter(), Date.now(), STALE_AFTER_MS, posDisplay.getPosDisplayEnvironment());
  }

  it('sin caché del interruptor (la caja aún carga): reason «loading», nunca «disabled»', async () => {
    db.hold = true;
    const start = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await flush();
    expect(posDisplay.getPosDisplayEnvironment()).toEqual({ settingsLoaded: false, transportSupported: true });
    expect(presence().reason).toBe('loading');
    release(0);
    await start;
  });

  it('fila ausente ya cargada: reason «disabled» (ahora sí se sabe que está apagada)', async () => {
    await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(posDisplay.getPosDisplayEnvironment().settingsLoaded).toBe(true);
    expect(presence()).toMatchObject({ connected: false, emitting: false, reason: 'disabled' });
  });

  it('encendida y emitiendo: reason null; otra ventana apaga: reason «disabled»', async () => {
    db.row = { settings: { enabled: true } };
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
    expect(presence().reason).toBeNull();
    db.row = { settings: { enabled: false } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(emitter.isEmitting).toBe(false);
    expect(presence().reason).toBe('disabled');
  });

  it('entorno sin BroadcastChannel con el interruptor ENCENDIDO: no emite y reason «unsupported» (no manda a Configuración)', async () => {
    const original = g.BroadcastChannel;
    delete g.BroadcastChannel;
    try {
      db.row = { settings: { enabled: true } };
      const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
      expect(posDisplay.isBroadcastChannelSupported()).toBe(false);
      expect(emitter.isEmitting).toBe(false);
      expect(posDisplay.getPosDisplayEnvironment()).toEqual({ settingsLoaded: true, transportSupported: false });
      expect(presence().reason).toBe('unsupported');
    } finally {
      g.BroadcastChannel = original;
    }
  });

  it('sin organización en sesión (0): reason «loading», no «disabled»', () => {
    orgId = 0;
    expect(posDisplay.getPosDisplayEnvironment().settingsLoaded).toBe(false);
    expect(presence().reason).toBe('loading');
  });
});

// ---------------------------------------------------------------------------
// T4 · i18n
// ---------------------------------------------------------------------------

describe('i18n · unsupported y closeFromOpener (T3/T4)', () => {
  const root = path.resolve(__dirname, '../../..');
  const locales = ['es', 'en', 'fr', 'pt'] as const;
  type Messages = {
    posCustomerDisplay: { indicator: { unsupported: string; notEmitting: string }; toast: { closeFromOpener: string }; menu: { open: string } };
  };
  const read = (locale: string) => JSON.parse(fs.readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8')) as Messages;

  it.each(locales)('%s: indicator.unsupported existe, es distinto de notEmitting y no manda a Configuración', (locale) => {
    const { indicator } = read(locale).posCustomerDisplay;
    expect(indicator.unsupported.trim().length).toBeGreaterThan(0);
    expect(indicator.unsupported).not.toBe(indicator.notEmitting);
    expect(indicator.unsupported).not.toMatch(/Configuraci[oó]n|Settings|Configurações|Paramètres|Réglages/i);
  });

  it.each(locales)('%s: closeFromOpener sin atajos de SO y condicionado a «antes de recargar»', (locale) => {
    const { toast } = read(locale).posCustomerDisplay;
    expect(toast.closeFromOpener).not.toMatch(/Alt\s*\+|Cmd\s*\+|Ctrl\s*\+|⌘/i);
    expect(toast.closeFromOpener).toMatch(/recargar|reloading|recharger|recarregar/i);
  });

  it('las cuatro locales traducen unsupported de forma distinta (no copia sin traducir)', () => {
    const texts = locales.map((l) => read(l).posCustomerDisplay.indicator.unsupported);
    expect(new Set(texts).size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Estático · indicador y hook
// ---------------------------------------------------------------------------

describe('estático · el indicador y el hook usan reason', () => {
  const root = path.resolve(__dirname, '../../..');
  const indicator = fs.readFileSync(path.join(root, 'src/components/pos/display/CustomerDisplayIndicator.tsx'), 'utf8');
  const hook = fs.readFileSync(path.join(root, 'src/components/pos/display/useCustomerDisplayPresence.ts'), 'utf8');

  it('el indicador pinta notEmitting SOLO con reason disabled, unsupported con su clave y nada con loading', () => {
    expect(indicator).toMatch(/reason === 'disabled' \? t\('indicator\.notEmitting'\)/);
    expect(indicator).toMatch(/reason === 'unsupported' \? t\('indicator\.unsupported'\)/);
    expect(indicator).not.toMatch(/!emitting\s*&&/);
  });

  it('el hook pasa el entorno (getPosDisplayEnvironment) al criterio de presencia', () => {
    expect(hook).toMatch(/readDisplayPresence\(getPosDisplayEmitter\(\), Date\.now\(\), STALE_AFTER_MS, getPosDisplayEnvironment\(\)\)/);
  });
});
