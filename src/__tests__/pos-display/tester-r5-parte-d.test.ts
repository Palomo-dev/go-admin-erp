/**
 * Tester · Parte D (indicador en el POS y tarjeta de Configuración › POS),
 * ronda 5 (verificación de la ronda 4 del builder). Casos que las suites del
 * builder y de las rondas 1-4 no cubren:
 *
 * T1/T2 · Época por organización en settings.ts, como PROPIEDAD y no como
 * casos sueltos:
 * - Tres relecturas con instantáneas distintas resueltas en las 6
 *   permutaciones posibles: la caché final es SIEMPRE la de la última
 *   relectura emitida, y cada llamador recibe exactamente lo que hay en caché
 *   en el instante en que su promesa resuelve (nunca una respuesta superada).
 * - Carga inicial + dos relecturas resueltas en cualquier orden (6
 *   permutaciones): manda la última relectura.
 * - Carga en vuelo + prime(true) + prime(false): manda el último prime, la
 *   carga tardía no lo pisa.
 * - Dos organizaciones con lecturas en vuelo cruzadas: la época de una no
 *   descarta ni pisa la de la otra.
 * - Relectura con error mientras otra relectura más nueva está en vuelo y
 *   sin caché: el fallback se aplica y la nueva lo sustituye al llegar.
 *
 * T3 · `reason` con el emisor REAL, transporte BroadcastChannel real y una
 * pantalla real (Node ≥ 18): el interruptor se apaga y enciende desde OTRA
 * ventana (evento `storage`) y la instantánea pasa null → 'disabled' → null,
 * con `connected` y `lastSeenAt` coherentes en cada paso.
 * - Caché ENCENDIDA (prime tras guardar en Configuración) con el emisor aún
 *   sin arrancar (navegación SPA a /app/pos antes de que resuelva la moneda
 *   base): 'loading', nunca 'disabled'; tras `startPosDisplay` null; tras
 *   prime(false) + `applyPosDisplaySettings` 'disabled'.
 * - 'unsupported' prevalece sobre 'loading' (ambas condiciones a la vez).
 * - Con transporte abierto, `reason` es null aunque el entorno diga «cargando»
 *   (imposible en la práctica, pero el criterio no debe contradecir al emisor).
 *
 * T4 · i18n: `closeFromOpener` y `unsupported` no están vacíos, no se repiten
 * entre locales y ninguna clave de posCustomerDisplay falta en una locale.
 *
 * Fixtures ficticios (org 120 / org 121). Sin Supabase real.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  clearCustomerDisplaySettingsCache,
  getCachedCustomerDisplaySettings,
  loadCustomerDisplaySettings,
  primeCustomerDisplaySettings,
  refreshCustomerDisplaySettings,
  type CustomerDisplaySettings,
} from '@/lib/pos/display/settings';
import { readDisplayPresence, resolvePresenceReason } from '@/lib/pos/display/presence';
import { BroadcastChannelReceiver, STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { TERMINAL_ID_STORAGE_KEY } from '@/lib/pos/display/terminal';

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
} = { row: null, reads: 0, hold: false, pending: [] };

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

const TERMINAL = '11111111-2222-4333-8444-555555555555';
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
    // La caja usa la terminal fija para que la pantalla de prueba la encuentre.
    getItem: (key: string) => (key === TERMINAL_ID_STORAGE_KEY ? TERMINAL : null),
  },
};
const g = globalThis as unknown as { window?: unknown; BroadcastChannel?: unknown };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const posDisplay = require('@/lib/pos/display/posDisplay') as typeof import('@/lib/pos/display/posDisplay');

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

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
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
// T1/T2 · época por organización como propiedad
// ---------------------------------------------------------------------------

// Fase 2 (F2-A): `pos_customer_display` es el esquema completo de settings.ts
// (propina, calificación, reposo, idioma, táctil) y lo que se lee o se escribe
// lleva siempre todos los campos con sus valores por defecto. Estas pruebas
// son del interruptor maestro, así que comparan con objectContaining.
describe('settings.ts · época por organización, todas las permutaciones (T1/T2)', () => {
  const orders = permutations([0, 1, 2]);

  it.each(orders)('tres relecturas (A, B, C) resueltas en orden %j: la caché final es C y cada llamador recibe lo que hay en caché al resolver', async (...order) => {
    primeCustomerDisplaySettings(120, { enabled: false });
    db.hold = true;
    const snapshots: Row[] = [
      { settings: { enabled: true } },
      { settings: { enabled: false } },
      { settings: { enabled: true } },
    ];
    const returned: Array<CustomerDisplaySettings | null> = [null, null, null];
    const cacheAtResolve: Array<CustomerDisplaySettings | null> = [null, null, null];
    const calls = snapshots.map((snapshot, i) => {
      db.row = snapshot;
      const call = refreshCustomerDisplaySettings(120).then((value) => {
        returned[i] = value;
        cacheAtResolve[i] = getCachedCustomerDisplaySettings(120);
      });
      return call;
    });
    await flush();
    expect(db.pending).toHaveLength(3);

    for (const index of order) {
      release(index);
      await flush();
    }
    await Promise.all(calls);

    // La última relectura emitida (C, enabled:true) manda, llegue cuando llegue.
    expect(getCachedCustomerDisplaySettings(120)).toEqual(expect.objectContaining({ enabled: true }));
    // Ningún llamador recibió algo distinto de la caché en su instante.
    for (let i = 0; i < 3; i += 1) expect(returned[i]).toEqual(cacheAtResolve[i]);
  });

  it.each(orders)('carga inicial (fila ausente) + dos relecturas (B=true, C=false) resueltas en orden %j: manda C (apagado)', async (...order) => {
    db.hold = true;
    // #0: carga inicial con la fila ausente (instantánea null → apagado).
    const load = loadCustomerDisplaySettings(120);
    await flush();
    // #1: otra ventana enciende; #2: otra ventana apaga.
    db.row = { settings: { enabled: true } };
    const b = refreshCustomerDisplaySettings(120);
    await flush();
    db.row = { settings: { enabled: false } };
    const c = refreshCustomerDisplaySettings(120);
    await flush();
    expect(db.pending).toHaveLength(3);

    for (const index of order) {
      release(index);
      await flush();
    }
    await Promise.all([load, b, c]);
    expect(getCachedCustomerDisplaySettings(120)).toEqual(expect.objectContaining({ enabled: false }));
  });

  it('carga en vuelo + prime(true) + prime(false): manda el último prime y la carga tardía no lo pisa', async () => {
    db.hold = true;
    db.row = { settings: { enabled: true } };
    const load = loadCustomerDisplaySettings(120);
    await flush();
    primeCustomerDisplaySettings(120, { enabled: true });
    primeCustomerDisplaySettings(120, { enabled: false });
    expect(getCachedCustomerDisplaySettings(120)).toEqual(expect.objectContaining({ enabled: false }));
    release(0);
    await expect(load).resolves.toEqual(expect.objectContaining({ enabled: false }));
    expect(getCachedCustomerDisplaySettings(120)).toEqual(expect.objectContaining({ enabled: false }));
  });

  it('dos organizaciones con lecturas en vuelo cruzadas: cada época solo cuenta en la suya', async () => {
    db.hold = true;
    db.row = { settings: { enabled: true } };
    const load120 = loadCustomerDisplaySettings(120); // #0
    await flush();
    db.row = { settings: { enabled: false } };
    const load121 = loadCustomerDisplaySettings(121); // #1
    await flush();
    // Un prime en la 121 no supera la carga en vuelo de la 120…
    primeCustomerDisplaySettings(121, { enabled: true });
    release(0);
    await expect(load120).resolves.toEqual(expect.objectContaining({ enabled: true }));
    // …y la carga tardía de la 121 no pisa su prime.
    release(1);
    await expect(load121).resolves.toEqual(expect.objectContaining({ enabled: true }));
    expect(getCachedCustomerDisplaySettings(120)).toEqual(expect.objectContaining({ enabled: true }));
    expect(getCachedCustomerDisplaySettings(121)).toEqual(expect.objectContaining({ enabled: true }));
  });

  it('relectura que falla sin caché con otra más nueva en vuelo: el fallback (apagado) se aplica y la nueva lo sustituye', async () => {
    db.hold = true;
    db.row = { settings: { enabled: true } };
    const a = refreshCustomerDisplaySettings(120); // #0, fallará
    await flush();
    const b = refreshCustomerDisplaySettings(120); // #1, responderá encendido
    await flush();
    release(0, 'error');
    await expect(a).resolves.toEqual(expect.objectContaining({ enabled: false }));
    expect(getCachedCustomerDisplaySettings(120)).toEqual(expect.objectContaining({ enabled: false }));
    release(1);
    await expect(b).resolves.toEqual(expect.objectContaining({ enabled: true }));
    expect(getCachedCustomerDisplaySettings(120)).toEqual(expect.objectContaining({ enabled: true }));
  });

  it('relectura que falla DESPUÉS de que una más nueva ya escribió: devuelve lo nuevo y no lo pisa con su fallback', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    db.hold = true;
    const a = refreshCustomerDisplaySettings(120); // #0, fallará tarde
    await flush();
    db.row = { settings: { enabled: true } };
    const b = refreshCustomerDisplaySettings(120); // #1
    await flush();
    release(1);
    await expect(b).resolves.toEqual(expect.objectContaining({ enabled: true }));
    release(0, 'error');
    await expect(a).resolves.toEqual(expect.objectContaining({ enabled: true }));
    expect(getCachedCustomerDisplaySettings(120)).toEqual(expect.objectContaining({ enabled: true }));
  });
});

// ---------------------------------------------------------------------------
// T3 · reason con el emisor real, transporte real y pantalla real
// ---------------------------------------------------------------------------

describe('presencia · reason con caja, transporte y pantalla reales (T3)', () => {
  function presence(now = Date.now()) {
    return readDisplayPresence(posDisplay.getPosDisplayEmitter(), now, STALE_AFTER_MS, posDisplay.getPosDisplayEnvironment());
  }

  it('otra ventana apaga y vuelve a encender: null → disabled (sin señal) → null (gris hasta el siguiente latido) → verde', async () => {
    db.row = { settings: { enabled: true } };
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
    const display = new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 20 });
    opened.push(display);
    display.startPresence({ ...CAPS });
    await waitFor(() => presence().connected);
    expect(presence()).toMatchObject({ connected: true, emitting: true, reason: null });

    // Configuración (otra ventana) apaga.
    db.row = { settings: { enabled: false } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(presence()).toEqual({ connected: false, emitting: false, reason: 'disabled', lastSeenAt: null });

    // La pantalla sigue latiendo pero la caja no tiene transporte: nunca vuelve a verde sola.
    await flush(10);
    expect(presence().connected).toBe(false);

    // Configuración vuelve a encender: emite, sin motivo, y verde en cuanto llega el siguiente latido.
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(presence()).toMatchObject({ emitting: true, reason: null });
    await waitFor(() => presence().connected);
  });

  it('con la pantalla conectada, salir del POS (stopPosDisplay) deja gris; con el interruptor encendido en caché el motivo es «loading», nunca «disabled»', async () => {
    db.row = { settings: { enabled: true } };
    await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    const display = new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 20 });
    opened.push(display);
    display.startPresence({ ...CAPS });
    await waitFor(() => presence().connected);
    posDisplay.stopPosDisplay();
    const snap = presence();
    expect(snap.connected).toBe(false);
    expect(snap.emitting).toBe(false);
    expect(snap.lastSeenAt).toBeNull();
    // La caché sigue en enabled:true y el emisor está parado: es la misma situación que «aún sin arrancar».
    expect(snap.reason).toBe('loading');
  });

  it('caché encendida (tras guardar en Configuración) y emisor sin arrancar: «loading», nunca «disabled»; arranca: null; apaga: «disabled»', async () => {
    // 1) La tarjeta guardó enabled:true y fijó la caché; la caja navega (SPA) a /app/pos.
    primeCustomerDisplaySettings(120, { enabled: true });
    // 2) El indicador monta y lee la presencia ANTES de que la página resuelva la moneda base y arranque el emisor.
    expect(posDisplay.getPosDisplayEmitter().isEmitting).toBe(false);
    expect(posDisplay.getPosDisplayEnvironment()).toEqual({ settingsLoaded: true, enabled: true, transportSupported: true });
    expect(presence()).toEqual({ connected: false, emitting: false, reason: 'loading', lastSeenAt: null });
    // 3) La página arranca el emisor: emite, sin motivo.
    await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(presence()).toMatchObject({ emitting: true, reason: null });
    // 4) La tarjeta (misma ventana) apaga: caché en false + aplicar sin releer → ahora sí «disabled».
    primeCustomerDisplaySettings(120, { enabled: false });
    posDisplay.applyPosDisplaySettings();
    expect(presence()).toEqual({ connected: false, emitting: false, reason: 'disabled', lastSeenAt: null });
    // 5) Y vuelve a encender desde la tarjeta: emite otra vez, sin motivo.
    primeCustomerDisplaySettings(120, { enabled: true });
    posDisplay.applyPosDisplaySettings();
    expect(presence()).toMatchObject({ emitting: true, reason: null });
  });

  it('caché encendida, emisor sin arrancar y entorno sin BroadcastChannel: «unsupported» (manda sobre «loading»)', () => {
    const original = g.BroadcastChannel;
    delete g.BroadcastChannel;
    try {
      primeCustomerDisplaySettings(120, { enabled: true });
      expect(posDisplay.getPosDisplayEnvironment()).toEqual({ settingsLoaded: true, enabled: true, transportSupported: false });
      expect(presence().reason).toBe('unsupported');
    } finally {
      g.BroadcastChannel = original;
    }
  });

  it('unsupported prevalece sobre loading cuando ambas condiciones se dan', () => {
    expect(resolvePresenceReason(false, { settingsLoaded: false, enabled: false, transportSupported: false })).toBe('unsupported');
    expect(resolvePresenceReason(false, { settingsLoaded: true, enabled: true, transportSupported: false })).toBe('unsupported');
  });

  it('con transporte abierto el motivo es null aunque el entorno diga «cargando» o «sin soporte» (el emisor manda)', () => {
    expect(resolvePresenceReason(true, { settingsLoaded: false, enabled: false, transportSupported: true })).toBeNull();
    expect(resolvePresenceReason(true, { settingsLoaded: true, enabled: false, transportSupported: false })).toBeNull();
  });

  it('el entorno no lanza si la organización activa no se puede leer (getOrganizationId lanza): cuenta como «cargando»', async () => {
    const original = orgId;
    // Simula un storage bloqueado: getOrganizationId lanza.
    const hooks = jest.requireMock('@/lib/hooks/useOrganization') as { getOrganizationId: () => number };
    const previous = hooks.getOrganizationId;
    hooks.getOrganizationId = () => {
      throw new Error('storage bloqueado');
    };
    try {
      expect(posDisplay.getPosDisplayEnvironment()).toEqual({ settingsLoaded: false, enabled: false, transportSupported: true });
      expect(presence().reason).toBe('loading');
    } finally {
      hooks.getOrganizationId = previous;
      orgId = original;
    }
  });
});

// ---------------------------------------------------------------------------
// T4 · i18n
// ---------------------------------------------------------------------------

function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}

describe('i18n · posCustomerDisplay tras la ronda 4 (T4)', () => {
  const root = path.resolve(__dirname, '../../..');
  const locales = ['es', 'en', 'fr', 'pt'] as const;
  const read = (locale: string) =>
    (JSON.parse(fs.readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8')) as { posCustomerDisplay: Record<string, unknown> }).posCustomerDisplay;

  it('las cuatro locales tienen exactamente el mismo conjunto de claves (incluida indicator.unsupported)', () => {
    const es = flattenKeys(read('es')).sort();
    expect(es).toContain('indicator.unsupported');
    expect(es).toContain('toast.closeFromOpener');
    for (const locale of locales) expect(flattenKeys(read(locale)).sort()).toEqual(es);
  });

  it.each(locales)('%s: closeFromOpener y unsupported no están vacíos, no citan atajos de teclado y closeFromOpener no promete un cierre desde la caja', (locale) => {
    const m = read(locale) as { toast: { closeFromOpener: string }; indicator: { unsupported: string; notEmitting: string } };
    expect(m.toast.closeFromOpener.trim().length).toBeGreaterThan(20);
    expect(m.indicator.unsupported.trim().length).toBeGreaterThan(20);
    expect(m.toast.closeFromOpener).not.toMatch(/Alt\s*\+\s*F4|Cmd\s*\+|Ctrl\s*\+|⌘/i);
    expect(m.indicator.unsupported).not.toMatch(/Configuraci|Settings|Paramètres|Configuraç/i);
  });

  it('closeFromOpener y unsupported son distintos entre es y en (no copia sin traducir)', () => {
    const es = read('es') as { toast: { closeFromOpener: string }; indicator: { unsupported: string } };
    const en = read('en') as { toast: { closeFromOpener: string }; indicator: { unsupported: string } };
    expect(es.toast.closeFromOpener).not.toBe(en.toast.closeFromOpener);
    expect(es.indicator.unsupported).not.toBe(en.indicator.unsupported);
  });
});
