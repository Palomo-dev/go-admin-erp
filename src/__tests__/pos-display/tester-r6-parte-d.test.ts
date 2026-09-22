/**
 * Tester · Parte D (indicador en el POS y tarjeta de Configuración › POS),
 * ronda 6 (verificación de la ronda 5 del builder: cierre del residuo de T3,
 * `DisplayPresenceEnvironment.enabled`). Casos que las suites del builder y
 * de las rondas 1-5 no cubren:
 *
 * P1 · `resolvePresenceReason` como TABLA EXHAUSTIVA: las 16 combinaciones
 *     de (emitting, settingsLoaded, enabled, transportSupported) contra el
 *     resultado esperado, más los invariantes «'disabled' exige caché cargada
 *     Y apagada Y soporte Y sin transporte» y «con transporte, siempre null».
 *
 * P2 · Secuencia «Slow 3G + navegación SPA» con emisor, transporte y pantalla
 *     REALES: la caché está encendida (prime tras guardar en Configuración),
 *     la consulta de moneda base sigue en vuelo, y una pantalla ya abierta
 *     late sin parar. Mientras tanto el indicador dice 'loading' y
 *     `connected: false` (la caja aún no tiene transporte: no puede ver la
 *     pantalla). Al resolver la moneda y arrancar: null y verde en cuanto
 *     llega el siguiente latido. El indicador NUNCA pasa por 'disabled'.
 *
 * P3 · Cierre de sesión (`clearCustomerDisplaySettingsCache`) con la caja
 *     emitiendo: hasta la siguiente publicación el motivo es null (manda el
 *     transporte); la publicación cierra el transporte (guarda por
 *     publicación del emisor) y el motivo pasa a 'loading' (sin caché), nunca
 *     a 'disabled'. Una nueva carga que responde apagado sí da 'disabled'.
 *
 * P4 · Cambio de organización activa (`getOrganizationId` pasa a otra) con la
 *     caja aún arrancada para la anterior: el entorno se evalúa sobre la
 *     organización ACTIVA; sin caché → 'loading'; con caché en false →
 *     'disabled'; con caché en true y el emisor cerrado por la guarda →
 *     'loading'.
 *
 * P5 · Organización inválida (0, NaN, negativa): el entorno no lanza, cuenta
 *     como «cargando» y `prime` sobre ella no la convierte en «cargada».
 *
 * P6 · El entorno es una instantánea nueva en cada lectura: refleja el prime
 *     más reciente y no comparte identidad con DEFAULT_PRESENCE_ENVIRONMENT
 *     (que está congelado).
 *
 * Fixtures ficticios (org 120 / org 121). Sin Supabase real.
 */

import {
  clearCustomerDisplaySettingsCache,
  hasCustomerDisplaySettingsCache,
  primeCustomerDisplaySettings,
} from '@/lib/pos/display/settings';
import {
  DEFAULT_PRESENCE_ENVIRONMENT,
  isSamePresence,
  readDisplayPresence,
  resolvePresenceReason,
  type DisplayPresenceEnvironment,
  type DisplayPresenceReason,
} from '@/lib/pos/display/presence';
import { BroadcastChannelReceiver, STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { TERMINAL_ID_STORAGE_KEY } from '@/lib/pos/display/terminal';

// ---------------------------------------------------------------------------
// Supabase simulado (solo la lectura de organization_settings)
// ---------------------------------------------------------------------------

type Row = { settings: unknown } | null;
const db: { row: Row; reads: number } = { row: null, reads: 0 };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          db.reads += 1;
          return { data: db.row, error: null };
        },
      };
      return chain;
    },
  },
}));

let orgId: number = 120;
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => orgId,
  getCurrentBranchId: () => 7,
}));

const TERMINAL = '66666666-7777-4888-8999-aaaaaaaaaaaa';
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
  localStorage: {
    setItem: () => undefined,
    getItem: (key: string) => (key === TERMINAL_ID_STORAGE_KEY ? TERMINAL : null),
  },
};
const g = globalThis as unknown as { window?: unknown };

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

/** Lo mismo que hace el hook `useCustomerDisplayPresence` en cada latido. */
function presence(now = Date.now()) {
  return readDisplayPresence(posDisplay.getPosDisplayEmitter(), now, STALE_AFTER_MS, posDisplay.getPosDisplayEnvironment());
}

const opened: Array<{ close(): void }> = [];

beforeEach(() => {
  g.window = fakeWindow;
  fakeWindow.listeners = [];
  orgId = 120;
  db.row = null;
  db.reads = 0;
  clearCustomerDisplaySettingsCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  posDisplay.stopPosDisplay();
  while (opened.length > 0) opened.pop()?.close();
  delete g.window;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// P1 · tabla exhaustiva del criterio
// ---------------------------------------------------------------------------

describe('resolvePresenceReason · tabla exhaustiva (P1)', () => {
  const bools = [false, true] as const;
  const table: Array<[boolean, boolean, boolean, boolean, DisplayPresenceReason]> = [];
  for (const emitting of bools) {
    for (const settingsLoaded of bools) {
      for (const enabled of bools) {
        for (const transportSupported of bools) {
          let expected: DisplayPresenceReason;
          if (emitting) expected = null;
          else if (!transportSupported) expected = 'unsupported';
          else if (!settingsLoaded) expected = 'loading';
          else if (enabled) expected = 'loading';
          else expected = 'disabled';
          table.push([emitting, settingsLoaded, enabled, transportSupported, expected]);
        }
      }
    }
  }

  it.each(table)('emitting=%s settingsLoaded=%s enabled=%s transportSupported=%s → %s', (emitting, settingsLoaded, enabled, transportSupported, expected) => {
    const env: DisplayPresenceEnvironment = { settingsLoaded, enabled, transportSupported };
    expect(resolvePresenceReason(emitting, env)).toBe(expected);
  });

  it('invariante: «disabled» solo con caché cargada, apagada, soporte y sin transporte; con transporte siempre null', () => {
    let disabledCount = 0;
    for (const [emitting, settingsLoaded, enabled, transportSupported] of table) {
      const reason = resolvePresenceReason(emitting, { settingsLoaded, enabled, transportSupported });
      if (reason === 'disabled') {
        disabledCount += 1;
        expect(emitting).toBe(false);
        expect(settingsLoaded).toBe(true);
        expect(enabled).toBe(false);
        expect(transportSupported).toBe(true);
      }
      if (emitting) expect(reason).toBeNull();
      // «Apagada» nunca se afirma con el interruptor encendido.
      if (enabled) expect(reason).not.toBe('disabled');
    }
    expect(disabledCount).toBe(1);
  });

  it('el default congelado equivale a «cargado, apagado y compatible» y nadie puede mutarlo', () => {
    expect(Object.isFrozen(DEFAULT_PRESENCE_ENVIRONMENT)).toBe(true);
    expect(resolvePresenceReason(false)).toBe('disabled');
    expect(resolvePresenceReason(false, DEFAULT_PRESENCE_ENVIRONMENT)).toBe('disabled');
  });
});

// ---------------------------------------------------------------------------
// P2 · Slow 3G + navegación SPA con caja, transporte y pantalla reales
// ---------------------------------------------------------------------------

describe('secuencia «Slow 3G + navegación SPA» (P2)', () => {
  it('caché encendida, moneda en vuelo y pantalla latiendo: loading + gris; al arrancar: null + verde; nunca disabled', async () => {
    // 1) La tarjeta acaba de guardar enabled:true (prime) y la caja navega a /app/pos.
    primeCustomerDisplaySettings(120, { enabled: true });
    // 2) Una pantalla ya estaba abierta y late cada 20 ms.
    const display = new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 20 });
    opened.push(display);
    display.startPresence({ ...CAPS });
    await flush(6);

    // 3) El indicador monta y lee cada latido mientras la moneda base no responde.
    let resolveCurrency: (c: { code: string }) => void = () => undefined;
    const currencyPromise = new Promise<{ code: string }>((resolve) => {
      resolveCurrency = resolve;
    });
    const seen: DisplayPresenceReason[] = [];
    const startFlow = posDisplay
      .resolveDisplayCurrency(() => currencyPromise)
      .then((currency) => posDisplay.startPosDisplay({ organizationId: 120, currency }));

    for (let tick = 0; tick < 5; tick += 1) {
      await flush(3);
      const snap = presence();
      seen.push(snap.reason);
      expect(snap).toEqual({ connected: false, emitting: false, reason: 'loading', lastSeenAt: null });
    }

    // 4) La moneda responde: la página arranca el emisor.
    resolveCurrency({ code: 'COP' });
    const emitter = await startFlow;
    expect(emitter.isEmitting).toBe(true);
    expect(presence()).toMatchObject({ emitting: true, reason: null });
    await waitFor(() => presence().connected);
    seen.push(presence().reason);

    // 5) En toda la secuencia el motivo fue loading → null; jamás disabled.
    expect(seen).not.toContain('disabled');
    expect(seen[0]).toBe('loading');
    expect(seen[seen.length - 1]).toBeNull();
    // La instantánea sí cambia de identidad al arrancar (el indicador se repinta).
    expect(isSamePresence({ connected: false, emitting: false, reason: 'loading', lastSeenAt: null }, presence())).toBe(false);
  });

  it('con la moneda en vuelo el cajero sale del POS (cancelado): el arranque no abre transporte y el motivo sigue siendo loading, no disabled', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    let cancelled = false;
    let resolveCurrency: (c: { code: string }) => void = () => undefined;
    const currencyPromise = new Promise<{ code: string }>((resolve) => {
      resolveCurrency = resolve;
    });
    const startFlow = posDisplay.resolveDisplayCurrency(() => currencyPromise).then((currency) => {
      if (cancelled) return null;
      return posDisplay.startPosDisplay({ organizationId: 120, currency, isCancelled: () => cancelled });
    });
    await flush();
    expect(presence().reason).toBe('loading');

    // Cleanup del efecto de la página.
    cancelled = true;
    posDisplay.stopPosDisplay();
    resolveCurrency({ code: 'COP' });
    await startFlow;
    await flush();
    expect(posDisplay.getPosDisplayEmitter().isEmitting).toBe(false);
    expect(presence()).toEqual({ connected: false, emitting: false, reason: 'loading', lastSeenAt: null });
  });
});

// ---------------------------------------------------------------------------
// P3 · cierre de sesión con la caja emitiendo
// ---------------------------------------------------------------------------

describe('cierre de sesión (clearCustomerDisplaySettingsCache) con la caja emitiendo (P3)', () => {
  it('hasta la siguiente publicación manda el transporte (null); tras ella, loading (sin caché), nunca disabled', async () => {
    db.row = { settings: { enabled: true } };
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
    expect(presence().reason).toBeNull();

    clearCustomerDisplaySettingsCache();
    // La caché desapareció pero el transporte sigue abierto: el emisor manda.
    expect(posDisplay.getPosDisplayEnvironment()).toEqual({ settingsLoaded: false, enabled: false, transportSupported: true });
    expect(presence()).toMatchObject({ emitting: true, reason: null });

    // La siguiente publicación (la guarda por publicación del emisor) cierra el transporte.
    emitter.reannounce();
    expect(emitter.isEmitting).toBe(false);
    expect(presence()).toEqual({ connected: false, emitting: false, reason: 'loading', lastSeenAt: null });

    // Una carga posterior que responde apagado sí justifica «disabled».
    db.row = { settings: { enabled: false } };
    await posDisplay.refreshPosDisplay(120);
    expect(presence()).toEqual({ connected: false, emitting: false, reason: 'disabled', lastSeenAt: null });
  });
});

// ---------------------------------------------------------------------------
// P4 · cambio de organización activa
// ---------------------------------------------------------------------------

describe('cambio de organización activa con la caja arrancada para la anterior (P4)', () => {
  it('el entorno mira la organización ACTIVA: sin caché → loading; caché false → disabled; caché true con emisor cerrado → loading', async () => {
    db.row = { settings: { enabled: true } };
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(presence().reason).toBeNull();

    // La organización activa cambia a la 121 (sin caché). El transporte sigue abierto hasta publicar.
    orgId = 121;
    expect(hasCustomerDisplaySettingsCache(121)).toBe(false);
    expect(presence()).toMatchObject({ emitting: true, reason: null });
    emitter.reannounce(); // isEnabled() lee la 121 → false → cierra
    expect(emitter.isEmitting).toBe(false);
    expect(presence().reason).toBe('loading');

    primeCustomerDisplaySettings(121, { enabled: false });
    expect(presence().reason).toBe('disabled');

    primeCustomerDisplaySettings(121, { enabled: true });
    // La caja sigue arrancada para la 120 y cerrada: caché encendida sin transporte = «aún sin arrancar».
    expect(presence().reason).toBe('loading');
    // Cuando la página rearranca para la 121, emite y el motivo desaparece.
    await posDisplay.startPosDisplay({ organizationId: 121, currency: 'COP' });
    expect(presence()).toMatchObject({ emitting: true, reason: null });
  });
});

// ---------------------------------------------------------------------------
// P5 · organización inválida
// ---------------------------------------------------------------------------

describe('organización inválida (P5)', () => {
  it.each([0, -1, NaN, 1.5])('getOrganizationId() = %p: el entorno no lanza y cuenta como cargando; prime no la convierte en cargada', (bad) => {
    orgId = bad;
    primeCustomerDisplaySettings(bad, { enabled: true });
    expect(hasCustomerDisplaySettingsCache(bad)).toBe(false);
    expect(posDisplay.getPosDisplayEnvironment()).toEqual({ settingsLoaded: false, enabled: false, transportSupported: true });
    expect(presence()).toEqual({ connected: false, emitting: false, reason: 'loading', lastSeenAt: null });
  });
});

// ---------------------------------------------------------------------------
// P6 · instantánea nueva por lectura
// ---------------------------------------------------------------------------

describe('getPosDisplayEnvironment es una instantánea nueva por lectura (P6)', () => {
  it('refleja el prime más reciente y no es el objeto congelado por defecto', () => {
    const first = posDisplay.getPosDisplayEnvironment();
    expect(first).not.toBe(DEFAULT_PRESENCE_ENVIRONMENT);
    expect(first).toEqual({ settingsLoaded: false, enabled: false, transportSupported: true });

    primeCustomerDisplaySettings(120, { enabled: true });
    const second = posDisplay.getPosDisplayEnvironment();
    expect(second).not.toBe(first);
    expect(second).toEqual({ settingsLoaded: true, enabled: true, transportSupported: true });
    expect(first.enabled).toBe(false); // la lectura anterior no cambió

    primeCustomerDisplaySettings(120, { enabled: false });
    expect(posDisplay.getPosDisplayEnvironment()).toEqual({ settingsLoaded: true, enabled: false, transportSupported: true });
    // JSON malformado en un prime degrada a apagado (parse tolerante): cargada y en false → «disabled».
    primeCustomerDisplaySettings(120, { enabled: 'sí' as unknown as boolean });
    expect(posDisplay.getPosDisplayEnvironment()).toEqual({ settingsLoaded: true, enabled: false, transportSupported: true });
    expect(presence().reason).toBe('disabled');
  });
});
