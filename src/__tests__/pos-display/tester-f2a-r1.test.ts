/**
 * Tester · Fase 2, parte A (terminales y ajustes completos), ronda 1.
 * Casos borde que las suites del builder (settings.test.ts,
 * posTerminalsService.test.ts, bloque F2-A de emitter.test.ts) no cubren.
 *
 * - settings.ts: matriz de entradas inválidas por campo (presets vacíos,
 *   con strings, NaN, Infinity, 0, 100.5, duplicados, desordenados), locale
 *   con guion bajo / espacios / número, reposo con URLs peligrosas y más de
 *   20, raíz que es array/string/JSON serializado, independencia de
 *   referencias con los defaults, carga y relectura con fila basura en
 *   organization_settings, parche parcial de un bloque (resetea el bloque:
 *   decisión documentada).
 * - emitter.ts: firma de líneas que SÍ ve `tax_excluded`/`tax_included`
 *   (ronda 2; mismo criterio que sameLines), hello.settings con
 *   forzado táctil y propina activada, refresh() apagado con getSettings,
 *   refresh() antes de start, override con firma sobre carrito sin líneas.
 * - posTerminalsService: organización 0 (sin sesión) no viaja a la BD
 *   (ronda 2: lanza antes), código en minúsculas normalizado a mayúsculas y
 *   colisión por mayúsculas, sugerencia de código con tildes/emoji/largo,
 *   terminal vinculada pero inactiva, cambio de terminal sin recargar la
 *   caja (el transporte lee la clave al abrirse).
 * - AjustesPantallaSection (helpers puros): validateDraft coherente con zod;
 *   ronda 2: tope de 20 URLs con su propio error, URLs validadas en cualquier
 *   modo, presets normalizados con la propina apagada.
 * - Carrera de guardado (ronda 2): el interruptor maestro y «Guardar ajustes»
 *   comparten un solo `saving` y se bloquean mutuamente.
 *
 * Fixtures ficticios (org 120, sucursal 7). Sin Supabase real.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter, cartLinesSignature, linesSignature } from '@/lib/pos/display/emitter';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import { PROTOCOL_VERSION, isDownMessage, type DisplayState, type DownMessageDraft, type UpMessage } from '@/lib/pos/display/protocol';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';
import { TERMINAL_ID_STORAGE_KEY, getOrCreateLocalTerminalId, readLocalTerminalId, setLocalTerminalId } from '@/lib/pos/display/terminal';

// ---------------------------------------------------------------------------
// Supabase y contexto simulados (organization_settings + pos_terminals)
// ---------------------------------------------------------------------------

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert';
  columns?: string;
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

const db: {
  calls: Call[];
  settingsRow: { settings: unknown } | null;
  terminalRows: unknown;
  error: { code?: string; message: string } | null;
} = { calls: [], settingsRow: null, terminalRows: [], error: null };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] };
      db.calls.push(call);
      const rows = () => (table === 'organization_settings' ? db.settingsRow : db.terminalRows);
      const result = () => (db.error ? { data: null, error: db.error } : { data: rows(), error: null });
      const chain = {
        select: (columns: string) => {
          call.columns = columns;
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          call.op = 'insert';
          call.payload = payload;
          return chain;
        },
        update: (payload: Record<string, unknown>) => {
          call.op = 'update';
          call.payload = payload;
          return chain;
        },
        upsert: async (payload: Record<string, unknown>) => {
          call.op = 'upsert';
          call.payload = payload;
          return { error: db.error };
        },
        eq: (col: string, value: unknown) => {
          call.filters.push([col, value]);
          return chain;
        },
        order: () => chain,
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return chain;
    },
  },
}));

const ctx = { orgId: 120, branchId: 7 as number | null };
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => ctx.orgId,
  getCurrentBranchId: () => ctx.branchId,
}));

// localStorage simulado (jest corre en node)
const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    },
    configurable: true,
    writable: true,
  });
});

/* eslint-disable @typescript-eslint/no-require-imports */
const settingsMod = require('@/lib/pos/display/settings') as typeof import('@/lib/pos/display/settings');
const terminalsMod = require('@/lib/services/posTerminalsService') as typeof import('@/lib/services/posTerminalsService');
/* eslint-enable @typescript-eslint/no-require-imports */

const {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  IDLE_MEDIA_URLS_MAX,
  clearCustomerDisplaySettingsCache,
  getCachedCustomerDisplaySettings,
  loadCustomerDisplaySettings,
  parseCustomerDisplaySettings,
  primeCustomerDisplaySettings,
  refreshCustomerDisplaySettings,
  saveCustomerDisplaySettings,
  toDisplayPresentationSettings,
} = settingsMod;
const { PosTerminalsService, normalizeTerminalCode, suggestTerminalCode, validateTerminalInput, TERMINAL_CODE_PATTERN } = terminalsMod;

const DEFAULTS = {
  enabled: false,
  tips: { enabled: false, presets: [5, 10, 15], allowCustom: true },
  rating: { enabled: false },
  showTaxBreakdown: false,
  showCustomerName: false,
  idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: 90 },
  locale: null,
  touch: 'auto',
};

beforeEach(() => {
  db.calls = [];
  db.settingsRow = null;
  db.terminalRows = [];
  db.error = null;
  ctx.orgId = 120;
  ctx.branchId = 7;
  store.clear();
  clearCustomerDisplaySettingsCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// settings.ts · matriz de entradas inválidas
// ---------------------------------------------------------------------------

describe('settings.ts · presets de propina: todo lo que no sean 3 enteros distintos en [1, 100] → 5/10/15', () => {
  const valid = { ...DEFAULTS, tips: { enabled: true, presets: [5, 10, 15], allowCustom: true } };

  it.each([
    ['vacío', []],
    ['dos', [5, 10]],
    ['cuatro', [5, 10, 15, 20]],
    ['con 0', [0, 10, 15]],
    ['negativo', [-5, 10, 15]],
    ['más de 100', [101, 10, 15]],
    ['strings numéricos', ['5', '10', '15']],
    ['NaN', [Number.NaN, 10, 15]],
    ['Infinity', [Number.POSITIVE_INFINITY, 10, 15]],
    ['null dentro', [5, null, 15]],
    ['no array (objeto)', { 0: 5, 1: 10, 2: 15 }],
    ['no array (string)', '5,10,15'],
  ])('%s', (_label, presets) => {
    const parsed = parseCustomerDisplaySettings({ ...valid, tips: { ...valid.tips, presets } });
    expect(parsed.tips.presets).toEqual([5, 10, 15]);
    // El resto del bloque no se arrastra.
    expect(parsed.tips.enabled).toBe(true);
    expect(parsed.tips.allowCustom).toBe(true);
  });

  it('ronda 2: los límites son 1 y 100 enteros; 0.01, 100.01 y decimales → defaults', () => {
    expect(parseCustomerDisplaySettings({ tips: { presets: [1, 50, 100] } }).tips.presets).toEqual([1, 50, 100]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [0.01, 50, 100] } }).tips.presets).toEqual([5, 10, 15]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [1, 50, 100.01] } }).tips.presets).toEqual([5, 10, 15]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [7.5, 10, 15] } }).tips.presets).toEqual([5, 10, 15]);
  });

  it('ronda 2: desordenados se ORDENAN; duplicados → defaults (tres botones iguales no ofrecen nada)', () => {
    expect(parseCustomerDisplaySettings({ tips: { presets: [15, 5, 10] } }).tips.presets).toEqual([5, 10, 15]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [10, 10, 10] } }).tips.presets).toEqual([5, 10, 15]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [5, 10, 10] } }).tips.presets).toEqual([5, 10, 15]);
  });

  it('bloque tips parcial: lo que falta toma el valor por defecto sin tocar lo que vino', () => {
    const parsed = parseCustomerDisplaySettings({ tips: { enabled: true } });
    expect(parsed.tips).toEqual({ enabled: true, presets: [5, 10, 15], allowCustom: true });
  });
});

describe('settings.ts · locale', () => {
  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['guion bajo', 'es_CO'],
    ['una letra', 'e'],
    ['palabra larga', 'español'],
    ['número', 123],
    ['objeto', { lang: 'es' }],
    ['guion final', 'es-'],
    ['subetiqueta larga', 'es-CO-abcdefghij'],
    ['con espacio dentro', 'es CO'],
  ])('%s → null', (_label, locale) => {
    expect(parseCustomerDisplaySettings({ locale }).locale).toBeNull();
  });

  it.each([
    ['es', 'es'],
    ['es-CO', 'es-CO'],
    ['pt-BR', 'pt-BR'],
    ['zh-Hant-TW', 'zh-Hant-TW'],
    ['con espacios alrededor', ' es-CO '],
    ['tres letras', 'ast'],
  ])('%s → se conserva recortado', (_label, locale) => {
    expect(parseCustomerDisplaySettings({ locale }).locale).toBe(String(locale).trim());
  });

  it('undefined (clave ausente) → null', () => {
    expect(parseCustomerDisplaySettings({ locale: undefined }).locale).toBeNull();
  });
});

describe('settings.ts · reposo', () => {
  it.each([
    ['string numérico', '90'],
    ['9 (bajo el mínimo)', 9],
    ['3601 (sobre el máximo)', 3601],
    ['decimal', 90.5],
    ['NaN', Number.NaN],
    ['negativo', -90],
    ['null', null],
  ])('idleAfterSeconds %s → 90', (_label, idleAfterSeconds) => {
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds } }).idle.idleAfterSeconds).toBe(90);
  });

  it('idleAfterSeconds en los límites 10 y 3600 se aceptan', () => {
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: 10 } }).idle.idleAfterSeconds).toBe(10);
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: 3600 } }).idle.idleAfterSeconds).toBe(3600);
  });

  it('mode con otra capitalización o desconocido → brand; mediaUrls se conservan', () => {
    const parsed = parseCustomerDisplaySettings({ idle: { mode: 'MEDIA', mediaUrls: ['https://a.example/x.png'] } });
    expect(parsed.idle.mode).toBe('brand');
    expect(parsed.idle.mediaUrls).toEqual(['https://a.example/x.png']);
  });

  it('mediaUrls peligrosas o relativas se descartan una a una; http(s) con espacios alrededor se recorta', () => {
    const parsed = parseCustomerDisplaySettings({
      idle: {
        mode: 'media',
        mediaUrls: [
          'javascript:alert(1)',
          'data:image/png;base64,AAAA',
          'ftp://cdn.example/x.png',
          '//cdn.example/x.png',
          '/x.png',
          'x.png',
          ' https://cdn.example/ok.png ',
          'HTTP://CDN.EXAMPLE/UPPER.PNG',
          42,
          null,
          { url: 'https://cdn.example/obj.png' },
        ],
      },
    });
    expect(parsed.idle.mediaUrls).toEqual(['https://cdn.example/ok.png', 'HTTP://CDN.EXAMPLE/UPPER.PNG']);
    expect(parsed.idle.mode).toBe('media');
  });

  it(`más de ${IDLE_MEDIA_URLS_MAX} URLs válidas: se recortan a ${IDLE_MEDIA_URLS_MAX} (en silencio)`, () => {
    const urls = Array.from({ length: IDLE_MEDIA_URLS_MAX + 5 }, (_, i) => `https://cdn.example/${i}.png`);
    const parsed = parseCustomerDisplaySettings({ idle: { mode: 'media', mediaUrls: urls } });
    expect(parsed.idle.mediaUrls).toHaveLength(IDLE_MEDIA_URLS_MAX);
    expect(parsed.idle.mediaUrls[0]).toBe('https://cdn.example/0.png');
  });

  it('mediaUrls con URLs válidas pero el bloque idle roto en otro campo no las pierde', () => {
    const parsed = parseCustomerDisplaySettings({ idle: { mode: 42, mediaUrls: ['https://cdn.example/a.png'], idleAfterSeconds: 'x' } });
    expect(parsed.idle).toEqual({ mode: 'brand', mediaUrls: ['https://cdn.example/a.png'], idleAfterSeconds: 90 });
  });
});

describe('settings.ts · raíz y booleanos', () => {
  it.each([
    ['array', [1, 2, 3]],
    ['string JSON de un objeto válido', JSON.stringify({ enabled: true })],
    ['número', 1],
    ['null', null],
    ['undefined', undefined],
    ['boolean', true],
  ])('raíz %s → todos los defaults', (_label, raw) => {
    expect(parseCustomerDisplaySettings(raw)).toEqual(DEFAULTS);
  });

  it.each([
    ['"true"', 'true'],
    ['1', 1],
    ['"on"', 'on'],
    ['null', null],
    ['objeto', {}],
  ])('showTaxBreakdown / showCustomerName / rating.enabled = %s → false', (_label, value) => {
    const parsed = parseCustomerDisplaySettings({ showTaxBreakdown: value, showCustomerName: value, rating: { enabled: value } });
    expect(parsed.showTaxBreakdown).toBe(false);
    expect(parsed.showCustomerName).toBe(false);
    expect(parsed.rating.enabled).toBe(false);
  });

  it('touch con otra capitalización o valor cercano → auto', () => {
    expect(parseCustomerDisplaySettings({ touch: 'Touch' }).touch).toBe('auto');
    expect(parseCustomerDisplaySettings({ touch: 'notouch' }).touch).toBe('auto');
    expect(parseCustomerDisplaySettings({ touch: 'no-touch' }).touch).toBe('no-touch');
    expect(parseCustomerDisplaySettings({ touch: true }).touch).toBe('auto');
  });

  it('el resultado nunca comparte referencias con DEFAULT_CUSTOMER_DISPLAY_SETTINGS (mutarlo no contamina)', () => {
    const a = parseCustomerDisplaySettings({});
    const b = parseCustomerDisplaySettings({ tips: { presets: 'x' } });
    expect(a.tips.presets).not.toBe(DEFAULT_CUSTOMER_DISPLAY_SETTINGS.tips.presets);
    expect(b.tips.presets).not.toBe(a.tips.presets);
    a.tips.presets.push(99);
    a.idle.mediaUrls.push('https://x');
    expect(DEFAULT_CUSTOMER_DISPLAY_SETTINGS.tips.presets).toEqual([5, 10, 15]);
    expect(DEFAULT_CUSTOMER_DISPLAY_SETTINGS.idle.mediaUrls).toEqual([]);
    expect(parseCustomerDisplaySettings({}).tips.presets).toEqual([5, 10, 15]);
    expect(() => {
      (DEFAULT_CUSTOMER_DISPLAY_SETTINGS.tips.presets as number[]).push(1);
    }).toThrow(); // congelado
  });

  it('toDisplayPresentationSettings devuelve copias independientes de presets', () => {
    const s = parseCustomerDisplaySettings({ tips: { presets: [7, 8, 9] } });
    const p = toDisplayPresentationSettings(s);
    expect(p.tips.presets).toEqual([7, 8, 9]);
    expect(p.tips.presets).not.toBe(s.tips.presets);
  });
});

// ---------------------------------------------------------------------------
// settings.ts · organization_settings con fila basura
// ---------------------------------------------------------------------------

describe('settings.ts · fila basura en organization_settings', () => {
  it.each([
    ['settings es un string', 'garbage'],
    ['settings es un array', [1, 2]],
    ['settings es null', null],
    ['settings es un número', 7],
  ])('load: %s → defaults cacheados y la caché se conoce (no es fallo de carga)', async (_label, settings) => {
    db.settingsRow = { settings };
    const loaded = await loadCustomerDisplaySettings(120);
    expect(loaded).toEqual(DEFAULTS);
    expect(getCachedCustomerDisplaySettings(120)).toEqual(DEFAULTS);
    expect(settingsMod.hasCustomerDisplaySettingsCache(120)).toBe(true);
  });

  it('load con fila mitad válida mitad basura: campo a campo (enabled true sobrevive a tips roto)', async () => {
    db.settingsRow = { settings: { enabled: true, tips: 'nope', locale: 'xx_YY', touch: 'touch', idle: [] } };
    const loaded = await loadCustomerDisplaySettings(120);
    expect(loaded.enabled).toBe(true);
    expect(loaded.tips).toEqual(DEFAULTS.tips);
    expect(loaded.locale).toBeNull();
    expect(loaded.touch).toBe('touch');
    expect(loaded.idle).toEqual(DEFAULTS.idle);
  });

  it('refresh con fila basura tras una caché válida: la basura MANDA (es el estado real de la BD), degradada a defaults', async () => {
    primeCustomerDisplaySettings(120, { enabled: true, tips: { enabled: true, presets: [1, 2, 3], allowCustom: false } });
    db.settingsRow = { settings: 'garbage' };
    const refreshed = await refreshCustomerDisplaySettings(120);
    expect(refreshed).toEqual(DEFAULTS);
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(false);
  });

  it('save conserva claves desconocidas de la fila y NUNCA escribe un campo inválido (lo que se escribe es lo que parse devuelve)', async () => {
    db.settingsRow = { settings: { enabled: true, futuro: { x: 1 }, tips: { enabled: true, presets: [999, 10, 15], allowCustom: true } } };
    const saved = await saveCustomerDisplaySettings(120, { locale: 'es_CO', touch: 'no-touch' });
    const upsert = db.calls.find((c) => c.op === 'upsert');
    expect(upsert?.table).toBe('organization_settings');
    const written = upsert?.payload?.settings as Record<string, unknown>;
    expect(written.futuro).toEqual({ x: 1 });
    expect(written.enabled).toBe(true);
    expect(written.locale).toBeNull(); // es_CO no es BCP 47: se escribe null, no la basura
    expect(written.touch).toBe('no-touch');
    expect((written.tips as { presets: number[] }).presets).toEqual([5, 10, 15]); // 999 no sobrevive al viaje
    expect(parseCustomerDisplaySettings(written)).toEqual(saved);
  });

  it('save con un bloque parcial RESETEA el resto del bloque (decisión documentada: los bloques viajan enteros)', async () => {
    db.settingsRow = { settings: { tips: { enabled: true, presets: [10, 15, 20], allowCustom: false } } };
    const saved = await saveCustomerDisplaySettings(120, { tips: { enabled: false } as never });
    // Quien mande { tips: { enabled } } pierde presets y allowCustom: la tarjeta manda el bloque completo, pero es un footgun.
    expect(saved.tips).toEqual({ enabled: false, presets: [5, 10, 15], allowCustom: true });
  });

  it('save con organización inválida (0 = sin sesión) lanza sin consultar', async () => {
    await expect(saveCustomerDisplaySettings(0, { enabled: true })).rejects.toThrow();
    expect(db.calls).toHaveLength(0);
  });

  it('prime con parcial basura no rompe la caché: enabled se conoce, el resto default', () => {
    primeCustomerDisplaySettings(120, { enabled: true, tips: 'x' as never });
    expect(getCachedCustomerDisplaySettings(120)).toEqual({ ...DEFAULTS, enabled: true });
  });
});

// ---------------------------------------------------------------------------
// emitter.ts · firma de líneas y hello.settings
// ---------------------------------------------------------------------------

class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  lastDisplaySeenAt: number | null = null;
  closed = false;
  private handlers = new Set<(msg: UpMessage) => void>();
  publish(msg: DownMessageDraft): void {
    this.published.push(msg);
  }
  announce(hello: HelloDraft, state: DisplayState): void {
    this.publish(hello);
    this.publish({ t: 'state', state });
  }
  onUp(handler: (msg: UpMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
  startHeartbeat(): void {}
  stopHeartbeat(): void {}
  close(): void {
    this.closed = true;
  }
  get types(): string[] {
    return this.published.map((m) => m.t);
  }
  get lastState(): DisplayState {
    const states = this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state');
    if (states.length === 0) throw new Error('sin state emitido');
    return states[states.length - 1].state;
  }
  get lastHello(): HelloDraft {
    const hellos = this.published.filter((m): m is HelloDraft => m.t === 'hello');
    if (hellos.length === 0) throw new Error('sin hello emitido');
    return hellos[hellos.length - 1];
  }
}

function manualScheduler() {
  let queued: (() => void) | null = null;
  return {
    schedule: (fn: () => void) => {
      queued = fn;
      return () => {
        queued = null;
      };
    },
    flush: () => {
      const fn = queued;
      queued = null;
      fn?.();
    },
    get pending(): boolean {
      return queued !== null;
    },
  };
}

type Presentation = ReturnType<typeof toDisplayPresentationSettings>;

function harness(opts: { enabled?: boolean; getSettings?: () => Presentation } = {}) {
  const enabled = { value: opts.enabled ?? true };
  const transports: FakeTransport[] = [];
  const sched = manualScheduler();
  const emitter = new DisplayEmitter({
    createTransport: () => {
      const t = new FakeTransport();
      transports.push(t);
      return t;
    },
    isEnabled: () => enabled.value,
    getSettings: opts.getSettings,
    schedule: sched.schedule,
  });
  return {
    emitter,
    transports,
    enabled,
    flush: sched.flush,
    pending: () => sched.pending,
    transport: () => transports[transports.length - 1],
  };
}

function item(overrides: Partial<CartItem> & { id: string }): CartItem {
  return {
    product_id: 1,
    product: { id: 1, name: 'Café' } as CartItem['product'],
    quantity: 1,
    unit_price: 5000,
    discount_amount: 0,
    tax_amount: 0,
    total: 5000,
    tax_included: false,
    ...overrides,
  } as CartItem;
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1',
    organization_id: 120,
    branch_id: 1,
    status: 'active',
    items: [],
    subtotal: 0,
    tax_amount: 0,
    tax_total: 0,
    discount_amount: 0,
    discount_total: 0,
    total: 0,
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

const START = { organizationId: 120, currency: 'COP' };
const L1 = [item({ id: 'l1' })];

describe('emitter.ts · firma de líneas: huecos y bordes', () => {
  it('ronda 2: la firma SÍ cambia al alternar tax_excluded / tax_included (mismo criterio que sameLines): el override viejo se descarta en el recálculo', () => {
    const h = harness();
    h.emitter.start(START);
    const c1 = cart({ items: [item({ id: 'l1', tax_excluded: false })], subtotal: 5000, tax_total: 950, total: 5950 });
    h.emitter.setActiveCart(c1);
    h.flush();
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 950, total: 5950 }, cartLinesSignature(c1));
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(5950);
    // El cajero pulsa «Excluir impuesto de este producto»: la línea cambia (taxExcluded) y desde la
    // ronda 2 sameLines y la firma lo ven. La caja guarda el carrito con tax_total 0.
    const c2 = cart({ items: [item({ id: 'l1', tax_excluded: true })], subtotal: 5000, tax_total: 0, total: 5000 });
    expect(cartLinesSignature(c2)).not.toBe(cartLinesSignature(c1));
    h.emitter.onCartsSaved([c2]);
    h.flush();
    // Durante el recálculo de TaxSummary la pantalla ya muestra el total del Cart (5000), no 5950.
    expect(h.transport().lastState.cart?.lines[0]?.taxExcluded).toBe(true);
    expect(h.transport().lastState.cart?.total).toBe(5000);
    // Efecto colateral documentado: la línea se resalta como cualquier cambio.
    expect(h.transport().lastState.cart?.lastChangedLineId).toBe('l1');
  });

  it('firma de modificadores: solo cuenta el NÚMERO, no el nombre ni el extra (unit_price ya lleva el extra)', () => {
    const a = cart({ items: [item({ id: 'l1', modifiers: [{ groupId: 1, groupName: 'Extras', modifierId: 1, name: 'Sin azúcar', extraPrice: 0 }] })] });
    const b = cart({ items: [item({ id: 'l1', modifiers: [{ groupId: 1, groupName: 'Extras', modifierId: 2, name: 'Con leche', extraPrice: 0 }] })] });
    expect(cartLinesSignature(a)).toBe(cartLinesSignature(b));
  });

  it('firma con carrito inválido (items no array, item null) nunca lanza y es estable', () => {
    expect(cartLinesSignature({ ...cart(), items: null as never })).toBe('cart-1\u001e');
    expect(cartLinesSignature({ ...cart(), items: [null as never, item({ id: 'l1' })] })).toBe(cartLinesSignature(cart({ items: [item({ id: 'l1' })] })));
    expect(cartLinesSignature(undefined)).toBe('');
    expect(linesSignature(null)).toBe('');
  });

  it('la firma no depende de la moneda con la que se proyecta (cartLinesSignature usa COP fijo)', () => {
    const c = cart({ items: [item({ id: 'l1', unit_price: 12.345, quantity: 0.3 })] });
    const usd = linesSignature(projectCartForDisplay(c, { currency: 'USD', lastChangedLineId: null }));
    expect(cartLinesSignature(c)).toBe(usd);
  });

  it('carrito sin líneas: un override con firma no se aplica ni se emite (subtotal 0)', () => {
    const h = harness();
    h.emitter.start(START);
    const empty = cart({ items: [] });
    h.emitter.setActiveCart(empty);
    h.flush();
    const before = h.emitter.emittedStateCount;
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 100, total: 100 }, cartLinesSignature(empty));
    h.flush();
    expect(h.emitter.getState().mode).toBe('idle');
    expect(h.emitter.getState().cart).toBeNull();
    // Y al entrar la primera línea el override de carrito vacío ya no vale.
    h.emitter.onCartsSaved([cart({ items: L1, subtotal: 5000, tax_total: 950, total: 5950 })]);
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(5950);
    expect(h.emitter.emittedStateCount).toBeGreaterThan(before);
  });

  it('firma que llega con un tipo raro (número, objeto) se trata como «sin firma»', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: L1, total: 5950 }));
    h.flush();
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 1, total: 42 }, 123 as never);
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(42);
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 1, total: 43 }, {} as never);
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(43);
  });

  it('override con firma de OTRO carrito (id distinto) se guarda y solo se aplica cuando ese carrito se activa', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ id: 'cart-1', items: L1, total: 5950 }));
    h.flush();
    const c2 = cart({ id: 'cart-2', items: [item({ id: 'l9', unit_price: 100 })], total: 119 });
    h.emitter.setTotals('cart-2', { discountTotal: 0, taxTotal: 19, total: 119 }, cartLinesSignature(c2));
    expect(h.pending()).toBe(false);
    expect(h.emitter.getState().cart?.total).toBe(5950);
    h.emitter.setActiveCart(c2);
    h.flush();
    expect(h.transport().lastState.cart?.id).toBe('cart-2');
    expect(h.transport().lastState.cart?.total).toBe(119);
  });
});

describe('emitter.ts · hello.settings y refresh()', () => {
  const presentation: Presentation = {
    tips: { enabled: true, presets: [5, 10, 15], allowCustom: false },
    rating: { enabled: true },
    showTaxBreakdown: false,
    showCustomerName: true,
    locale: 'en',
    touch: 'no-touch',
  };

  it('pantalla no táctil forzada con propina y calificación activadas: el hello lleva touch no-touch y ambos flags (la pantalla decide, §4.4)', () => {
    const h = harness({ getSettings: () => presentation });
    h.emitter.start(START);
    const hello = h.transport().lastHello;
    expect(hello.settings?.touch).toBe('no-touch');
    expect(hello.settings?.tips.enabled).toBe(true);
    expect(hello.settings?.rating.enabled).toBe(true);
    // El mensaje real (con sobre) pasa isDownMessage.
    expect(isDownMessage({ v: PROTOCOL_VERSION, seq: 1, terminalId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', instanceId: 'i', ...hello })).toBe(true);
  });

  it('refresh() ANTES de start no abre nada aunque haya getSettings', () => {
    const h = harness({ getSettings: () => presentation });
    h.emitter.refresh();
    expect(h.transports).toHaveLength(0);
  });

  it('refresh() con getSettings y el interruptor apagado cierra el transporte (no saluda)', () => {
    const h = harness({ getSettings: () => presentation });
    h.emitter.start(START);
    const t = h.transport();
    h.enabled.value = false;
    h.emitter.refresh();
    expect(t.closed).toBe(true);
    expect(h.emitter.isEmitting).toBe(false);
    expect(t.types.filter((x) => x === 'hello')).toHaveLength(1);
  });

  it('refresh() tras stop() no reabre (started=false)', () => {
    const h = harness({ getSettings: () => presentation });
    h.emitter.start(START);
    h.emitter.stop();
    h.emitter.refresh();
    expect(h.transports).toHaveLength(1);
    expect(h.emitter.isEmitting).toBe(false);
  });

  it('cada refresh() reemite hello + state completos (N guardados seguidos → N saludos) y el state no cambia de contenido', () => {
    const h = harness({ getSettings: () => presentation });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: L1, total: 5950 }));
    h.flush();
    const t = h.transport();
    const before = t.published.length;
    h.emitter.refresh();
    h.emitter.refresh();
    h.emitter.refresh();
    expect(t.types.slice(before)).toEqual(['hello', 'state', 'hello', 'state', 'hello', 'state']);
    expect(t.lastState.mode).toBe('order');
    expect(t.lastState.cart?.total).toBe(5950);
  });

  it('el hello lleva una COPIA de los ajustes: mutar la caché después no altera lo ya publicado', () => {
    const current = { ...presentation, tips: { ...presentation.tips, presets: [5, 10, 15] } };
    const h = harness({ getSettings: () => toDisplayPresentationSettings(parseCustomerDisplaySettings(current)) });
    h.emitter.start(START);
    const hello = h.transport().lastHello;
    current.tips.presets[0] = 99;
    expect(hello.settings?.tips.presets).toEqual([5, 10, 15]);
  });

  it('ronda 2: getSettings que devuelve null/undefined: el hello sale SIN settings y pasa isDownMessage', () => {
    for (const bad of [null, undefined]) {
      const h = harness({ getSettings: () => bad as never });
      h.emitter.start(START);
      const hello = h.transport().lastHello;
      expect(hello).not.toHaveProperty('settings');
      expect(isDownMessage({ v: PROTOCOL_VERSION, seq: 1, terminalId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', instanceId: 'i', ...hello })).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// posTerminalsService · bordes
// ---------------------------------------------------------------------------

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function row(overrides: Partial<import('@/lib/services/posTerminalsService').PosTerminal> = {}) {
  return {
    id: T1,
    organization_id: 120,
    branch_id: 7,
    name: 'Caja 1',
    code: 'CAJA-1',
    is_active: true,
    display_last_seen_at: null,
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T10:00:00.000Z',
    ...overrides,
  };
}

describe('posTerminalsService · organización 0 (sin sesión)', () => {
  it('createTerminal con organización 0 lanza ANTES de viajar (ronda 2)', async () => {
    ctx.orgId = 0;
    db.terminalRows = row({ organization_id: 0 });
    await expect(PosTerminalsService.createTerminal({ name: 'Caja 1', code: 'CAJA-1' })).rejects.toThrow(/organización/);
    expect(db.calls).toHaveLength(0);
  });

  it('listTerminals con organización 0 lanza, no devuelve [] en silencio (ronda 2: la tarjeta avisa con loadError)', async () => {
    ctx.orgId = 0;
    await expect(PosTerminalsService.listTerminals()).rejects.toThrow(/organización/);
    expect(db.calls).toHaveLength(0);
  });

  it('ronda 2: con organización 0 ningún insert viaja (antes viajaba con organization_id 0)', async () => {
    ctx.orgId = 0;
    db.terminalRows = row({ organization_id: 0 });
    await expect(PosTerminalsService.createTerminal({ name: 'Caja 1', code: 'CAJA-1' })).rejects.toThrow();
    expect(db.calls.find((c) => c.op === 'insert')).toBeUndefined();
  });
});

describe('posTerminalsService · código y nombre', () => {
  it('ronda 2: el código en minúsculas pasa la validación y el servicio lo NORMALIZA a mayúsculas: "caja-1" y "CAJA-1" son el mismo código', async () => {
    expect(validateTerminalInput({ name: 'Caja', code: 'caja-1' })).toBeNull();
    expect(TERMINAL_CODE_PATTERN.test('caja-1')).toBe(true);
    expect(normalizeTerminalCode('caja-1')).toBe('CAJA-1');
    db.terminalRows = row();
    await PosTerminalsService.createTerminal({ name: 'Caja', code: 'caja-1' });
    expect(db.calls.find((c) => c.op === 'insert')?.payload?.code).toBe('CAJA-1');
    // La UI fuerza mayúsculas al escribir, pero el servicio no normaliza: otro cliente puede colar minúsculas.
  });

  it('código con espacios internos, tilde, punto o más de 20 caracteres → code_invalid', () => {
    expect(validateTerminalInput({ name: 'Caja', code: 'CAJA 1' })).toBe('code_invalid');
    expect(validateTerminalInput({ name: 'Caja', code: 'CAJÁ' })).toBe('code_invalid');
    expect(validateTerminalInput({ name: 'Caja', code: 'CAJA.1' })).toBe('code_invalid');
    expect(validateTerminalInput({ name: 'Caja', code: 'A'.repeat(21) })).toBe('code_invalid');
    expect(validateTerminalInput({ name: 'Caja', code: 'A'.repeat(20) })).toBeNull();
    expect(validateTerminalInput({ name: 'Caja', code: '' })).toBe('code_invalid');
  });

  it('nombre: solo espacios → name_required; 80 caracteres ok; 81 → name_too_long; con espacios alrededor cuenta recortado', () => {
    expect(validateTerminalInput({ name: '   ', code: 'A' })).toBe('name_required');
    expect(validateTerminalInput({ name: 'x'.repeat(80), code: 'A' })).toBeNull();
    expect(validateTerminalInput({ name: 'x'.repeat(81), code: 'A' })).toBe('name_too_long');
    expect(validateTerminalInput({ name: `  ${'x'.repeat(80)}  `, code: 'A' })).toBeNull();
  });

  it('suggestTerminalCode: tildes, eñe, emoji, símbolos y longitud', () => {
    expect(suggestTerminalCode('Caja Ñoño 1')).toBe('CAJA-NONO-1');
    expect(suggestTerminalCode('  Caja   principal  ')).toBe('CAJA-PRINCIPAL');
    expect(suggestTerminalCode('!!!')).toBe('');
    expect(suggestTerminalCode('')).toBe('');
    expect(suggestTerminalCode('Caja 🛒 1')).toBe('CAJA-1');
    const long = suggestTerminalCode('Caja de la entrada principal del local grande');
    expect(long.length).toBeLessThanOrEqual(20);
    expect(TERMINAL_CODE_PATTERN.test(long)).toBe(true);
  });

  it('ronda 2: suggestTerminalCode ya no termina en guion al recortar a 20', () => {
    // 19 letras + espacio + letra: el recorte a 20 dejaba el guion final; ahora se limpia después del recorte.
    const suggested = suggestTerminalCode(`${'A'.repeat(19)} B`);
    expect(suggested).toBe('A'.repeat(19));
    expect(suggested).not.toMatch(/-$/);
    expect(TERMINAL_CODE_PATTERN.test(suggested)).toBe(true);
  });

  it('createTerminal manda name y code recortados y nunca is_active false ni columnas de emparejamiento', async () => {
    db.terminalRows = row();
    await PosTerminalsService.createTerminal({ name: '  Caja 1  ', code: ' CAJA-1 ' }, 7);
    const insert = db.calls.find((c) => c.op === 'insert');
    expect(insert?.payload).toEqual({ organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true });
    expect(Object.keys(insert?.payload ?? {})).not.toEqual(expect.arrayContaining(['pairing_code', 'display_token_hash']));
  });

  it('branchId explícito no entero (NaN, 0, 3.5, "7") → lanza antes de consultar', async () => {
    for (const bad of [Number.NaN, 0, 3.5, -1]) {
      await expect(PosTerminalsService.listTerminals(bad)).rejects.toThrow();
    }
    await expect(PosTerminalsService.listTerminals('7' as never)).rejects.toThrow();
    expect(db.calls).toHaveLength(0);
  });

  it('branchId explícito null cae al contexto; contexto null → lanza', async () => {
    ctx.branchId = null;
    await expect(PosTerminalsService.listTerminals(null)).rejects.toThrow(/sucursal/i);
    expect(db.calls).toHaveLength(0);
  });
});

describe('posTerminalsService · vínculo local', () => {
  it('terminal vinculada pero INACTIVA: resolveLinkedTerminal la da por vinculada (unlinked false) y la tarjeta la pinta como inactiva (ronda 2)', () => {
    setLocalTerminalId(T1);
    const view = PosTerminalsService.resolveLinkedTerminal([row({ is_active: false })]);
    expect(view.terminal?.is_active).toBe(false);
    expect(view.unlinked).toBe(false);
    const estaCaja = fs.readFileSync(path.resolve(__dirname, '../../../src/components/pos/configuracion/pantalla-cliente/EstaCajaSection.tsx'), 'utf8');
    expect(estaCaja).toMatch(/linkedToInactive/);
    expect(estaCaja).toMatch(/bg-amber-500/);
  });

  it('terminal de OTRA sucursal: la lista de esta sucursal no la trae → «sin registrar», aunque getLinkedTerminal (por id) sí la encuentre', async () => {
    setLocalTerminalId(T2);
    const view = PosTerminalsService.resolveLinkedTerminal([row({ id: T1 })]);
    expect(view).toEqual({ localTerminalId: T2, terminal: null, unlinked: true });
    db.terminalRows = row({ id: T2, branch_id: 99 });
    const linked = await PosTerminalsService.getLinkedTerminal();
    expect(linked?.branch_id).toBe(99);
    const q = db.calls.find((c) => c.table === 'pos_terminals');
    expect(q?.filters).toEqual([
      ['id', T2],
      ['organization_id', 120],
    ]);
  });

  it('sin terminal vinculada (org sin filas) la caja sigue con su UUID local y el transporte lo usaría tal cual', () => {
    const local = getOrCreateLocalTerminalId();
    expect(readLocalTerminalId()).toBe(local);
    const view = PosTerminalsService.resolveLinkedTerminal([]);
    expect(view).toEqual({ localTerminalId: local, terminal: null, unlinked: true });
  });

  it('vincular sustituye el UUID local: la clave pasa a ser el id de la fila y getOrCreate ya no genera otro', () => {
    const local = getOrCreateLocalTerminalId();
    expect(PosTerminalsService.linkThisTerminal({ id: T1 })).toBe(true);
    expect(store.get(TERMINAL_ID_STORAGE_KEY)).toBe(T1);
    expect(getOrCreateLocalTerminalId()).toBe(T1);
    expect(getOrCreateLocalTerminalId()).not.toBe(local);
  });

  it('dos cajas pueden vincularse a la MISMA terminal: nada en el servicio ni en la BD lo impide (no hay columna de caja)', () => {
    // Máquina A
    expect(PosTerminalsService.linkThisTerminal({ id: T1 })).toBe(true);
    const a = readLocalTerminalId();
    // Máquina B (otro localStorage)
    store.clear();
    expect(PosTerminalsService.linkThisTerminal({ id: T1 })).toBe(true);
    expect(readLocalTerminalId()).toBe(a);
    // En F2 (BroadcastChannel por navegador) no chocan; en F3 (pantalla remota por terminal) sí. Pendiente de diseño.
  });

  it('linkThisTerminal con id en mayúsculas (UUID válido) se acepta tal cual; con id vacío se rechaza', () => {
    expect(PosTerminalsService.linkThisTerminal({ id: T1.toUpperCase() })).toBe(true);
    expect(store.get(TERMINAL_ID_STORAGE_KEY)).toBe(T1.toUpperCase());
    expect(PosTerminalsService.linkThisTerminal({ id: '' })).toBe(false);
    expect(store.get(TERMINAL_ID_STORAGE_KEY)).toBe(T1.toUpperCase());
  });
});

// ---------------------------------------------------------------------------
// Tarjeta · helpers puros y contrato estático
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('AjustesPantallaSection · validateDraft coherente con el esquema zod', () => {
  // El archivo es TSX y jest (ts-jest, jsx: preserve) no lo carga: se transpila
  // aquí con el compilador de TypeScript y se ejecuta con un `require` que
  // sustituye la UI (React, shadcn, next-intl, lucide) por stubs y deja pasar
  // settings.ts real. Así se prueban los helpers puros con el código de verdad.
  let helpers: {
    validateDraft: (d: unknown) => string | null;
    parseMediaUrls: (t: string) => string[];
    normalizeDraftForSave: <T>(d: T) => T;
  };
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ts = require('typescript') as typeof import('typescript');
    const source = read('src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    const stub = new Proxy({}, { get: () => () => null });
    const fakeRequire = (id: string) => {
      if (id === '@/lib/pos/display/settings') return settingsMod;
      if (id === '@/lib/pos/display/protocol') return {};
      if (id === '@/i18n/config') return { locales: ['es', 'en'], localeNames: { es: 'Español', en: 'English' } };
      return stub;
    };
    const mod = { exports: {} as Record<string, unknown> };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('require', 'module', 'exports', js)(fakeRequire, mod, mod.exports);
    helpers = mod.exports as typeof helpers;
  });

  const draft = () => ({
    tips: { enabled: true, presets: [5, 10, 15], allowCustom: true },
    rating: { enabled: false },
    showTaxBreakdown: false,
    showCustomerName: false,
    idle: { mode: 'brand' as const, mediaUrls: [] as string[], idleAfterSeconds: 90 },
    locale: null,
    touch: 'auto' as const,
  });

  it('presets vacíos (input borrado → NaN), 0, 101, decimales y duplicados → "presets" antes de que zod los degrade', () => {
    expect(helpers.validateDraft({ ...draft(), tips: { enabled: true, presets: [Number.NaN, 10, 15], allowCustom: true } })).toBe('presets');
    expect(helpers.validateDraft({ ...draft(), tips: { enabled: true, presets: [0, 10, 15], allowCustom: true } })).toBe('presets');
    expect(helpers.validateDraft({ ...draft(), tips: { enabled: true, presets: [101, 10, 15], allowCustom: true } })).toBe('presets');
    expect(helpers.validateDraft({ ...draft(), tips: { enabled: true, presets: [5, 10], allowCustom: true } })).toBe('presets');
    expect(helpers.validateDraft({ ...draft(), tips: { enabled: true, presets: [7.5, 10, 15], allowCustom: true } })).toBe('presets');
    expect(helpers.validateDraft({ ...draft(), tips: { enabled: true, presets: [10, 10, 15], allowCustom: true } })).toBe('presets');
    // Desordenados válidos: pasan (normalizeDraftForSave los ordena).
    expect(helpers.validateDraft({ ...draft(), tips: { enabled: true, presets: [15, 5, 10], allowCustom: true } })).toBeNull();
  });

  it('ronda 2: normalizeDraftForSave ordena los presets válidos y, con la propina APAGADA, sustituye los inválidos por los defaults (no bloquea sobre campos ocultos)', () => {
    const disabledBad = helpers.normalizeDraftForSave({ ...draft(), tips: { enabled: false, presets: [Number.NaN, 10, 15], allowCustom: true } });
    expect(disabledBad.tips.presets).toEqual([5, 10, 15]);
    expect(helpers.validateDraft(disabledBad)).toBeNull();
    // Apagada pero válidos: se conservan (ordenados) para cuando se vuelva a encender.
    expect(helpers.normalizeDraftForSave({ ...draft(), tips: { enabled: false, presets: [20, 8, 12], allowCustom: true } }).tips.presets).toEqual([8, 12, 20]);
    // Encendida e inválidos: NO se maquillan; validateDraft nombra el campo.
    const enabledBad = helpers.normalizeDraftForSave({ ...draft(), tips: { enabled: true, presets: [Number.NaN, 10, 15], allowCustom: true } });
    expect(enabledBad.tips.presets).toEqual([Number.NaN, 10, 15]);
    expect(helpers.validateDraft(enabledBad)).toBe('presets');
    // Ordena sin mutar la entrada.
    const input = { ...draft(), tips: { enabled: true, presets: [15, 5, 10], allowCustom: true } };
    expect(helpers.normalizeDraftForSave(input).tips.presets).toEqual([5, 10, 15]);
    expect(input.tips.presets).toEqual([15, 5, 10]);
  });

  it('idleAfterSeconds fuera de rango o decimal → "idleSeconds"', () => {
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: 9 } })).toBe('idleSeconds');
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: 3601 } })).toBe('idleSeconds');
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: 90.5 } })).toBe('idleSeconds');
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: Number.NaN } })).toBe('idleSeconds');
  });

  it('ronda 2: las URLs inválidas se validan en CUALQUIER modo (antes solo en «media» y zod las descartaba en silencio)', () => {
    const bad = ['javascript:alert(1)'];
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'media', mediaUrls: bad, idleAfterSeconds: 90 } })).toBe('mediaUrls');
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'brand', mediaUrls: bad, idleAfterSeconds: 90 } })).toBe('mediaUrls');
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'promotions', mediaUrls: bad, idleAfterSeconds: 90 } })).toBe('mediaUrls');
    expect(parseCustomerDisplaySettings({ idle: { mode: 'brand', mediaUrls: bad } }).idle.mediaUrls).toEqual([]);
  });

  it(`ronda 2: más de ${IDLE_MEDIA_URLS_MAX} URLs válidas se rechazan en cliente con su propio error (zod recortaría sin avisar)`, () => {
    const urls = Array.from({ length: IDLE_MEDIA_URLS_MAX + 1 }, (_, i) => `https://cdn.example/${i}.png`);
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'media', mediaUrls: urls, idleAfterSeconds: 90 } })).toBe('mediaUrlsTooMany');
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'brand', mediaUrls: urls, idleAfterSeconds: 90 } })).toBe('mediaUrlsTooMany');
    expect(helpers.validateDraft({ ...draft(), idle: { mode: 'media', mediaUrls: urls.slice(0, IDLE_MEDIA_URLS_MAX), idleAfterSeconds: 90 } })).toBeNull();
  });

  it('validateDraft y zod coinciden en qué URL es válida para un lote representativo', () => {
    const samples = ['https://cdn.example/a.png', 'http://localhost:3000/x', 'HTTPS://X.Y/Z', 'https://', 'http://a b', 'ftp://x/y', 'https://x.y/ü'];
    for (const u of samples) {
      const client = helpers.validateDraft({ ...draft(), idle: { mode: 'media', mediaUrls: [u], idleAfterSeconds: 90 } }) === null;
      const server = parseCustomerDisplaySettings({ idle: { mode: 'media', mediaUrls: [u] } }).idle.mediaUrls.length === 1;
      expect({ u, client }).toEqual({ u, client: server });
    }
  });

  it('parseMediaUrls: líneas vacías, CRLF y espacios', () => {
    expect(helpers.parseMediaUrls('https://a\r\n\r\n  https://b  \n\n')).toEqual(['https://a', 'https://b']);
    expect(helpers.parseMediaUrls('')).toEqual([]);
    expect(helpers.parseMediaUrls('   ')).toEqual([]);
  });
});

describe('Tarjeta · contrato estático (fuente)', () => {
  const ajustes = read('src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx');
  const estaCaja = read('src/components/pos/configuracion/pantalla-cliente/EstaCajaSection.tsx');
  const content = read('src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx');

  it('al guardar ajustes se llama a applyPosDisplaySettings (refresh del emisor sin recargar)', () => {
    expect(ajustes).toMatch(/await ConfiguracionService\.saveCustomerDisplayConfig\(toSave\)/);
    expect(ajustes).toMatch(/applyPosDisplaySettings\(\)/);
  });

  it('el guardado de ajustes manda los bloques COMPLETOS (tips, idle) y no el interruptor maestro', () => {
    expect(ajustes).toMatch(/Omit<CustomerDisplaySettings, 'enabled'>/);
    expect(ajustes).not.toMatch(/enabled:\s*settings\.enabled/);
  });

  it('ronda 2: el interruptor maestro y «Guardar ajustes» se bloquean mutuamente mientras uno guarda (un solo `saving` compartido)', () => {
    expect(content).toMatch(/<AjustesPantallaSection[^>]*disabled=\{loadFailed \|\| saving\}/);
    expect(content).toMatch(/onSavingChange=\{setSaving\}/);
    expect(content).toMatch(/disabled=\{saving \|\| loadFailed\}/); // el interruptor
    expect(ajustes).toMatch(/onSavingChange\?\.\(value\)/);
    // El fallo del interruptor revierte SOLO `enabled` sobre el estado actual, no un closure viejo.
    expect(content).toMatch(/setSettings\(\(prev\) => \(\{ \.\.\.prev, enabled: !value \}\)\)/);
    expect(content).not.toMatch(/setSettings\(previous\)/);
  });

  it('EstaCajaSection: vincular escribe SOLO por el servicio (nunca localStorage directo) y avisa que la caja de otra ventana necesita recargar', () => {
    expect(estaCaja).not.toMatch(/localStorage\./);
    expect(estaCaja).toMatch(/PosTerminalsService\.linkThisTerminal/);
    expect(estaCaja).toMatch(/linkedHint/);
  });

  it('ronda 2: EstaCajaSection descarta la selección anterior al cambiar de sucursal', () => {
    expect(estaCaja).toMatch(/setSelectedId\(''\)/);
  });

  it('ronda 2: EstaCajaSection expone «Renombrar» (updateTerminal) y distingue «sin permiso» (isForbiddenError) de otros fallos', () => {
    expect(estaCaja).toMatch(/PosTerminalsService\.updateTerminal/);
    expect(estaCaja).toMatch(/t\('rename'\)/);
    expect(estaCaja).toMatch(/isForbiddenError\(err\) \? t\('forbidden'\)/);
  });

  it('ronda 2: renombrar y activar/desactivar van por la ruta PATCH (rol en servidor), nunca directo a la tabla', () => {
    const service = read('src/lib/services/posTerminalsService.ts');
    const updateBlock = service.slice(service.indexOf('static async updateTerminal'), service.indexOf('static linkThisTerminal'));
    expect(updateBlock).not.toMatch(/supabase\s*\.from\('pos_terminals'\)/);
    expect(service).toMatch(/fetch\(`\/api\/pos\/terminals\/\$\{encodeURIComponent\(id\)\}`/);
    const route = read('src/app/api/pos/terminals/[id]/route.ts');
    expect(route).toMatch(/getServerOrgContext\(request\)/);
    expect(route).toMatch(/readOrgBody\(ctx, request/);
    expect(route).toMatch(/hasOrgAdminOrPermission\(ctx\)/);
    expect(route).not.toMatch(/roleName/); // nunca por nombre de rol (regla dura 6)
    expect(route).not.toMatch(/pos_terminal_secrets/);
    expect(route).not.toMatch(/\.delete\(/);
  });

  it('el hello de la caja se cablea desde la caché (toDisplayPresentationSettings), no desde un JSON crudo', () => {
    const posDisplay = read('src/lib/pos/display/posDisplay.ts');
    expect(posDisplay).toMatch(/getSettings: \(\) => toDisplayPresentationSettings\(getCachedCustomerDisplaySettings\(getOrganizationId\(\)\)\)/);
  });

  it('protocol.ts: hello.settings es opcional (aditivo) y no viaja enabled ni idle', () => {
    const protocol = read('src/lib/pos/display/protocol.ts');
    expect(protocol).toMatch(/settings\?: DisplayPresentationSettings/);
    expect(protocol).toMatch(/export interface DisplayPresentationSettings \{[\s\S]*?touch: DisplayTouchOverride;\s*\}/);
    const block = protocol.slice(protocol.indexOf('export interface DisplayPresentationSettings'), protocol.indexOf('// Mensajes hacia arriba'));
    expect(block).not.toMatch(/\benabled: boolean;\s*$/m);
    expect(block).not.toMatch(/idle:/);
  });
});
