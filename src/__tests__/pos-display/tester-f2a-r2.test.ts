/**
 * TESTER · Fase 2, parte A (terminales y ajustes completos), RONDA 2.
 *
 * Complementa tester-f2a-r1.test.ts (no repite lo que ya cubre). Cada bloque
 * nace de un intento de romper lo entregado en la ronda 2:
 *
 * 1. Emisor · `refresh()` con `getSettings` volvía a saludar SIEMPRE que el
 *    transporte estuviera abierto. Con dos pestañas de /app/pos abiertas,
 *    guardar la tarjeta desde una tercera ventana hacía que las DOS
 *    resaludaran y la pantalla («gana la última que saluda», transport.ts)
 *    podía cambiar a la pestaña de fondo (hallazgo medio de la ronda 2).
 *    Ronda 3: solo resaluda la ventana VISIBLE (`isVisible`); el bloque pasa
 *    a afirmar el contrato nuevo con BroadcastChannel real.
 * 2. settings.ts · huecos del esquema: `z.string().url()` aceptaba URLs con
 *    espacio o salto de línea dentro (WHATWG los tolera), que la tarjeta
 *    rechaza. Ronda 3: `mediaUrlSchema` aplica MEDIA_URL_PATTERN (única
 *    definición, exportada) y las rechaza; presets vacíos, `-0`, `ES-co`;
 *    `Date` como fila.
 * 3. Emisor · firma `''` cuenta como firma (descarta el override); `getSettings`
 *    que lanza o devuelve un array no rompe el saludo.
 * 4. Ruta PATCH · cuerpos límite: `is_active` null / "true", `branch_id` en el
 *    body, nombre de 81, código con espacios alrededor, JSON malformado,
 *    error RLS 42501 (no es 409), `hasOrgAdminOrPermission` que lanza
 *    (fail-closed, 500 y sin escritura).
 * 5. Servicio · `fetch` que rechaza (red) no se disfraza de 403/409; 200 con
 *    `data: null`; parche solo con `code`; nombre de 81 en update. Ronda 3:
 *    un 403 ORG_AMBIGUOUS / FOREIGN_ORGANIZATION ya NO es «sin permiso»
 *    (isOrgMismatchError).
 * 6. Contratos estáticos de la ronda 2 (un solo `saving`, reversión solo de
 *    `enabled`, selección descartada al cambiar de sucursal, ruta hoja).
 *
 * Verificado además contra la base (MCP, solo lectura + DO/RAISE con rollback):
 * pos_terminals tiene las 9 columnas de TERMINAL_COLUMNS; políticas
 * select/insert/update (sin delete); insert con branch de OTRA organización →
 * 42501; delete → 0 filas; y `qa-x` COEXISTÍA con `QA-X` (la CHECK admitía
 * minúsculas y la UNIQUE distingue mayúsculas). Ronda 3: migración
 * 20260921150100 (índice único sobre upper(code) + CHECK code = upper(code)),
 * verificada con DO/RAISE y rollback: `qa-x` → 23514 (CHECK) y, sin la CHECK,
 * 23505 por `pos_terminals_code_unico_ci`. La tabla tenía 0 filas.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Cart, CartItem } from '@/components/pos/types';

// ---------------------------------------------------------------------------
// Dobles compartidos: Supabase (organization_settings + pos_terminals), sesión y fetch
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
      const result = () => {
        if (db.error) return { data: null, error: db.error };
        if (table === 'organization_settings') return { data: db.settingsRow, error: null };
        return { data: db.terminalRows, error: null };
      };
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
        upsert: (payload: Record<string, unknown>) => {
          call.op = 'upsert';
          call.payload = payload;
          return chain;
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

interface ApiCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
const api: { calls: ApiCall[]; response: { status: number; body: unknown } | Error } = { calls: [], response: { status: 200, body: {} } };
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    api.calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    if (api.response instanceof Error) throw api.response;
    const { status, body } = api.response;
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } },
    configurable: true,
    writable: true,
  });
});

// Módulos reales (cargados tras los mocks).
/* eslint-disable @typescript-eslint/no-require-imports */
const settingsMod = require('@/lib/pos/display/settings') as typeof import('@/lib/pos/display/settings');
const svcMod = require('@/lib/services/posTerminalsService') as typeof import('@/lib/services/posTerminalsService');
const emitterMod = require('@/lib/pos/display/emitter') as typeof import('@/lib/pos/display/emitter');
const protocolMod = require('@/lib/pos/display/protocol') as typeof import('@/lib/pos/display/protocol');
const transportMod = require('@/lib/pos/display/transport') as typeof import('@/lib/pos/display/transport');
/* eslint-enable @typescript-eslint/no-require-imports */

const { parseCustomerDisplaySettings, toDisplayPresentationSettings, isValidTipPresets, MEDIA_URL_PATTERN } = settingsMod;
const { PosTerminalsService, PosTerminalsApiError, isDuplicateCodeError, isForbiddenError, isOrgMismatchError } = svcMod;
const { DisplayEmitter, cartLinesSignature } = emitterMod;
const { isDownMessage } = protocolMod;
const { BroadcastChannelReceiver, BroadcastChannelTransport } = transportMod;

type DisplayState = import('@/lib/pos/display/protocol').DisplayState;
type DownMessageDraft = import('@/lib/pos/display/protocol').DownMessageDraft;
type UpMessage = import('@/lib/pos/display/protocol').UpMessage;
type DisplayTransport = import('@/lib/pos/display/transport').DisplayTransport;
type HelloDraft = import('@/lib/pos/display/transport').HelloDraft;

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T1 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const TS = '2026-09-21T10:00:00.000Z';

// ---------------------------------------------------------------------------
// Fixtures y transporte falso (mismo patrón que emitter.test.ts)
// ---------------------------------------------------------------------------

function item(over: Partial<CartItem> & { id: string; product_id: number }): CartItem {
  const quantity = over.quantity ?? 1;
  const unit_price = over.unit_price ?? 1000;
  return {
    cart_id: 'c1',
    product: { id: over.product_id, organization_id: 120, sku: `SKU-${over.product_id}`, name: `Producto ${over.product_id}`, unit_code: 'UND', status: 'active', created_at: TS, updated_at: TS },
    quantity,
    unit_price,
    total: quantity * unit_price,
    discount_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    created_at: TS,
    updated_at: TS,
    ...over,
  };
}
function cart(over: Partial<Cart> = {}): Cart {
  const items = over.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  return {
    id: 'c1', organization_id: 120, branch_id: 7, status: 'active', items,
    subtotal, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: subtotal,
    created_at: TS, updated_at: TS, ...over,
  };
}

class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  closed = false;
  lastDisplaySeenAt: number | null = null;
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
    return () => void this.handlers.delete(handler);
  }
  startHeartbeat(): void {}
  stopHeartbeat(): void {}
  close(): void {
    this.closed = true;
  }
  get hellos(): HelloDraft[] {
    return this.published.filter((m): m is HelloDraft => m.t === 'hello');
  }
  get states(): DisplayState[] {
    return this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state').map((m) => m.state);
  }
}

function manualScheduler() {
  let queued: (() => void) | null = null;
  return {
    schedule: (fn: () => void) => {
      queued = fn;
      return () => void (queued = null);
    },
    flush: () => {
      const fn = queued;
      queued = null;
      fn?.();
    },
  };
}

function harness(opts: { getSettings?: () => unknown; enabled?: boolean } = {}) {
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
    getSettings: opts.getSettings as (() => import('@/lib/pos/display/protocol').DisplayPresentationSettings) | undefined,
    schedule: sched.schedule,
  });
  return { emitter, enabled, transports, flush: sched.flush, transport: () => transports[transports.length - 1] };
}

async function tick(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await tick(1);
  }
}

let warn: jest.SpyInstance;
beforeEach(() => {
  db.calls = [];
  db.settingsRow = null;
  db.terminalRows = [];
  db.error = null;
  api.calls = [];
  api.response = { status: 200, body: {} };
  ctx.orgId = 120;
  ctx.branchId = 7;
  store.clear();
  settingsMod.clearCustomerDisplaySettingsCache();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// 1. Emisor · refresh() con dos pestañas: la pantalla puede cambiar de caja
// ---------------------------------------------------------------------------

describe('emitter.ts · refresh() con getSettings y DOS pestañas de /app/pos (BroadcastChannel real)', () => {
  const opened: Array<{ close(): void }> = [];
  const track = <T extends { close(): void }>(x: T): T => {
    opened.push(x);
    return x;
  };
  afterEach(() => {
    while (opened.length > 0) opened.pop()?.close();
  });

  const presentation = () => toDisplayPresentationSettings(parseCustomerDisplaySettings({ tips: { enabled: true } }));

  function caja(instanceId: string, cartId: string, visible: { value: boolean } = { value: true }) {
    const transport = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId, now: () => 0 }));
    const emitter = new DisplayEmitter({
      createTransport: () => transport,
      isEnabled: () => true,
      getSettings: presentation,
      isVisible: () => visible.value,
      schedule: (fn) => {
        const id = setTimeout(fn, 0);
        return () => clearTimeout(id);
      },
    });
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    emitter.setActiveCart(cart({ id: cartId, items: [item({ id: `${cartId}-l1`, product_id: 1 })] }));
    return emitter;
  }

  it('ronda 3 (era HALLAZGO medio): tras guardar la tarjeta en otra ventana solo resaluda la pestaña VISIBLE; la pantalla sigue con la del cajero aunque la de fondo llame a refresh() la última', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const seen: Array<{ instanceId: string; cartId: string | null }> = [];
    display.onDown((m) => {
      if (m.t === 'state') seen.push({ instanceId: m.instanceId, cartId: m.state.cart?.id ?? null });
    });

    // B (fondo, oculta) arranca primero; A (la del cajero, visible) después: la pantalla sigue a A.
    const fondoVisible = { value: false };
    const fondo = caja(INSTANCE_B, 'cart-fondo', fondoVisible);
    await tick();
    const cajero = caja(INSTANCE_A, 'cart-cajero', { value: true });
    await waitFor(() => display.activeInstanceId === INSTANCE_A && seen[seen.length - 1]?.cartId === 'cart-cajero');
    expect(seen[seen.length - 1]).toEqual({ instanceId: INSTANCE_A, cartId: 'cart-cajero' });

    // Guardar la tarjeta en OTRA ventana → evento `storage` en las dos → refreshPosDisplay → refresh().
    // La de fondo responde la última y AUN ASÍ no releva a la del cajero: está oculta y no saluda.
    const antesRefresh = seen.length;
    cajero.refresh();
    fondo.refresh();
    await waitFor(() => seen.length > antesRefresh && seen[seen.length - 1]?.instanceId === INSTANCE_A);
    await tick(6);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(seen.slice(antesRefresh).every((m) => m.instanceId === INSTANCE_A)).toBe(true);
    expect(seen[seen.length - 1]).toEqual({ instanceId: INSTANCE_A, cartId: 'cart-cajero' });

    // Las mutaciones del cajero siguen llegando.
    const antes = seen.length;
    cajero.setActiveCart(cart({ id: 'cart-cajero', items: [item({ id: 'cart-cajero-l1', product_id: 1 }), item({ id: 'cart-cajero-l2', product_id: 2 })] }));
    await waitFor(() => seen.length > antes);
    expect(seen[seen.length - 1]).toEqual({ instanceId: INSTANCE_A, cartId: 'cart-cajero' });

    // Cuando la de fondo pasa a verse, la página llama a reannounce() y ese saludo (con los ajustes nuevos) sí la hace activa.
    fondoVisible.value = true;
    fondo.reannounce();
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    cajero.stop();
    fondo.stop();
  });

  it('en la Fase 0 (sin getSettings) refresh() con transporte abierto NO resalude; con getSettings y ventana visible (sin document en Node) sí', () => {
    const h = harness();
    h.emitter.start({ organizationId: 120, currency: 'COP' });
    expect(h.transport().hellos).toHaveLength(1);
    h.emitter.refresh();
    h.emitter.refresh();
    expect(h.transport().hellos).toHaveLength(1);
    const h2 = harness({ getSettings: presentation });
    h2.emitter.start({ organizationId: 120, currency: 'COP' });
    h2.emitter.refresh();
    h2.emitter.refresh();
    expect(h2.transport().hellos).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 2. settings.ts · huecos del esquema
// ---------------------------------------------------------------------------

describe('settings.ts · huecos del esquema (ronda 2)', () => {
  it('ronda 3 (era HALLAZGO bajo): URLs con espacio o salto de línea DENTRO se descartan (mismo criterio que la tarjeta: MEDIA_URL_PATTERN exportado); la válida se conserva', () => {
    const conSalto = 'https://a.com\nhttps://b.com';
    const conEspacio = 'https://x.com/a b';
    const parsed = parseCustomerDisplaySettings({ idle: { mode: 'media', mediaUrls: [conSalto, conEspacio, 'https://c.com/ok.png'] } });
    expect(parsed.idle.mediaUrls).toEqual(['https://c.com/ok.png']);
    expect(MEDIA_URL_PATTERN.test(conSalto)).toBe(false);
    expect(MEDIA_URL_PATTERN.test(conEspacio)).toBe(false);
    // Round-trip por el textarea: join('\n') + split(/\r?\n/) conserva el número de URLs.
    expect(parsed.idle.mediaUrls.join('\n').split(/\r?\n/)).toHaveLength(1);
    // La tarjeta no redefine el patrón; ronda 4: tampoco lo aplica directamente,
    // importa el predicado único `isValidMediaUrl` de settings.ts (patrón + new URL).
    const tarjeta = read('src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx');
    expect(tarjeta).not.toMatch(/const MEDIA_URL_PATTERN/);
    expect(tarjeta).not.toContain('MEDIA_URL_PATTERN');
    expect(tarjeta).toMatch(/isValidMediaUrl,[\s\S]*from '@\/lib\/pos\/display\/settings'/);
  });

  it('URL con credenciales (https://u:p@h/) y esquema en mayúsculas (HTTPS://) se aceptan; «https://» sola se descarta', () => {
    const parsed = parseCustomerDisplaySettings({ idle: { mediaUrls: ['https://u:p@h/', 'HTTPS://X.COM', 'https://', 'https://x'] } });
    expect(parsed.idle.mediaUrls).toEqual(['https://u:p@h/', 'HTTPS://X.COM', 'https://x']);
  });

  it('presets vacíos ([]), -0, un solo preset y tres iguales → 5/10/15; [1,2,3] y [100,1,50] (ordenado) son válidos', () => {
    expect(parseCustomerDisplaySettings({ tips: { presets: [] } }).tips.presets).toEqual([5, 10, 15]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [-0, 10, 15] } }).tips.presets).toEqual([5, 10, 15]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [10] } }).tips.presets).toEqual([5, 10, 15]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [10, 10, 10] } }).tips.presets).toEqual([5, 10, 15]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [1, 2, 3] } }).tips.presets).toEqual([1, 2, 3]);
    expect(parseCustomerDisplaySettings({ tips: { presets: [100, 1, 50] } }).tips.presets).toEqual([1, 50, 100]);
    expect(isValidTipPresets([])).toBe(false);
    expect(isValidTipPresets([-0, 10, 15])).toBe(false);
  });

  it('locale: «ES-co» y «es-419» pasan tal cual (no se normaliza la capitalización); «es_CO», «i-klingon», «» y «  » → null', () => {
    expect(parseCustomerDisplaySettings({ locale: 'ES-co' }).locale).toBe('ES-co');
    expect(parseCustomerDisplaySettings({ locale: 'es-419' }).locale).toBe('es-419');
    expect(parseCustomerDisplaySettings({ locale: '  es-CO ' }).locale).toBe('es-CO');
    expect(parseCustomerDisplaySettings({ locale: 'es_CO' }).locale).toBeNull();
    expect(parseCustomerDisplaySettings({ locale: 'i-klingon' }).locale).toBeNull();
    expect(parseCustomerDisplaySettings({ locale: '' }).locale).toBeNull();
    expect(parseCustomerDisplaySettings({ locale: '   ' }).locale).toBeNull();
  });

  it('fila que es un Date, un Object.create(null) o un objeto con prototipo raro → defaults sin lanzar', () => {
    expect(parseCustomerDisplaySettings(new Date())).toEqual(settingsMod.DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
    expect(parseCustomerDisplaySettings(Object.create(null))).toEqual(settingsMod.DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
    expect(parseCustomerDisplaySettings(JSON.parse('{"__proto__":{"enabled":true},"enabled":true}')).enabled).toBe(true);
    expect(parseCustomerDisplaySettings(JSON.parse('{"__proto__":{"enabled":true}}')).enabled).toBe(false);
  });

  it('idleAfterSeconds como texto («90»), 3600.5, -Infinity → 90; 10 y 3600 se aceptan', () => {
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: '90' } }).idle.idleAfterSeconds).toBe(90);
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: 3600.5 } }).idle.idleAfterSeconds).toBe(90);
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: Number.NEGATIVE_INFINITY } }).idle.idleAfterSeconds).toBe(90);
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: 10 } }).idle.idleAfterSeconds).toBe(10);
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: 3600 } }).idle.idleAfterSeconds).toBe(3600);
  });

  it('save: una fila con __proto__ propio no contamina el JSON que se escribe ni el prototipo del resultado', async () => {
    db.settingsRow = { settings: JSON.parse('{"__proto__":{"polluted":true},"enabled":false}') };
    const saved = await settingsMod.saveCustomerDisplaySettings(120, { enabled: true });
    expect(saved.enabled).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const upsert = db.calls.find((c) => c.op === 'upsert');
    const written = upsert?.payload?.settings as Record<string, unknown>;
    expect(Object.getPrototypeOf(written)).toBe(Object.prototype);
    expect(written.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Emisor · firma vacía y getSettings roto
// ---------------------------------------------------------------------------

describe('emitter.ts · firma «» y getSettings roto', () => {
  it('firma «» (cartLinesSignature de un carrito que no proyecta) CUENTA como firma: el override se descarta y la pantalla lleva los totales del Cart', () => {
    const h = harness();
    h.emitter.start({ organizationId: 120, currency: 'COP' });
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1', product_id: 1 })], total: 1000 }));
    h.flush();
    expect(cartLinesSignature(null)).toBe('');
    expect(cartLinesSignature(undefined)).toBe('');
    // (un Cart con items: null NO da '': projectCartForDisplay lo tolera como «sin líneas» → 'c1' + separador)
    expect(cartLinesSignature({ ...cart(), items: null as unknown as CartItem[] })).toMatch(/^c1/);
    h.emitter.setTotals('c1', { discountTotal: 0, taxTotal: 190, total: 1190 }, '');
    h.flush();
    const last = h.transport().states[h.transport().states.length - 1];
    expect(last.cart?.total).toBe(1000);
    // Con la firma buena sí entra.
    h.emitter.setTotals('c1', { discountTotal: 0, taxTotal: 190, total: 1190 }, cartLinesSignature(cart({ items: [item({ id: 'l1', product_id: 1 })] })));
    h.flush();
    expect(h.transport().states[h.transport().states.length - 1].cart?.total).toBe(1190);
  });

  it('getSettings que LANZA: el saludo sale igual (sin settings), pasa isDownMessage y se registra el aviso; el transporte no se cierra', () => {
    const h = harness({
      getSettings: () => {
        throw new Error('caché rota');
      },
    });
    h.emitter.start({ organizationId: 120, currency: 'COP' });
    const hello = h.transport().hellos[0];
    expect(hello).toBeDefined();
    expect('settings' in hello).toBe(false);
    expect(isDownMessage({ ...hello, v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A })).toBe(true);
    expect(h.transport().closed).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/getSettings/), expect.any(Error));
  });

  it('getSettings que devuelve un array o un primitivo: el hello sale sin settings (isDownMessage exige objeto)', () => {
    for (const bad of [[], 'x', 42, true]) {
      const h = harness({ getSettings: () => bad });
      h.emitter.start({ organizationId: 120, currency: 'COP' });
      const hello = h.transport().hellos[0];
      expect('settings' in hello).toBe(false);
    }
  });

  it('subtotal 0 con propina activada: el hello lleva tips.enabled=true y el state no lleva bloque tip (lo decide la parte B/C con el carrito delante)', () => {
    const h = harness({ getSettings: () => toDisplayPresentationSettings(parseCustomerDisplaySettings({ tips: { enabled: true } })) });
    h.emitter.start({ organizationId: 120, currency: 'COP' });
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1', product_id: 1, unit_price: 0 })] }));
    h.flush();
    expect(h.transport().hellos[0].settings?.tips).toEqual({ enabled: true, presets: [5, 10, 15], allowCustom: true });
    const last = h.transport().states[h.transport().states.length - 1];
    expect(last.mode).toBe('order');
    expect(last.cart?.subtotal).toBe(0);
    expect(last.tip).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Servicio · fallos de red y respuestas raras de la ruta
// ---------------------------------------------------------------------------

describe('posTerminalsService · fetch que rechaza y respuestas raras', () => {
  it('red caída (fetch rechaza): el error se propaga tal cual y NO es 403 ni 409 (la tarjeta pinta updateError)', async () => {
    api.response = new TypeError('Failed to fetch');
    await expect(PosTerminalsService.setTerminalActive(T1, false)).rejects.toThrow('Failed to fetch');
    let err: unknown;
    try {
      await PosTerminalsService.updateTerminal(T1, { name: 'X' });
    } catch (e) {
      err = e;
    }
    expect(isForbiddenError(err)).toBe(false);
    expect(isDuplicateCodeError(err)).toBe(false);
    expect(err instanceof PosTerminalsApiError).toBe(false);
  });

  it('200 con { data: null } o sin body → PosTerminalsApiError EMPTY_RESPONSE (nunca devuelve undefined a la tarjeta)', async () => {
    api.response = { status: 200, body: { data: null } };
    await expect(PosTerminalsService.updateTerminal(T1, { name: 'X' })).rejects.toMatchObject({ code: 'EMPTY_RESPONSE', status: 200 });
    api.response = { status: 204, body: {} };
    await expect(PosTerminalsService.setTerminalActive(T1, true)).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });

  it('ronda 3: 403 ORG_AMBIGUOUS (cookie y cabecera distintas) ya NO cuenta como «sin permiso»: es isOrgMismatchError (la tarjeta pide recargar)', async () => {
    api.response = { status: 403, body: { error: 'header y cookie', code: 'ORG_AMBIGUOUS' } };
    let err: unknown;
    try {
      await PosTerminalsService.setTerminalActive(T1, false);
    } catch (e) {
      err = e;
    }
    expect(isForbiddenError(err)).toBe(false);
    expect(isOrgMismatchError(err)).toBe(true);
    expect((err as InstanceType<typeof PosTerminalsApiError>).code).toBe('ORG_AMBIGUOUS');
  });

  it('parche solo con code viaja sin name; nombre de 81 caracteres y código vacío se rechazan antes del viaje', async () => {
    api.response = { status: 200, body: { data: { id: T1, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'X', is_active: true, display_last_seen_at: null, created_at: TS, updated_at: TS } } };
    await PosTerminalsService.updateTerminal(T1, { code: ' x ' });
    expect(api.calls[0].body).toEqual({ code: 'X' });
    await expect(PosTerminalsService.updateTerminal(T1, { name: 'a'.repeat(81) })).rejects.toThrow('name_too_long');
    await expect(PosTerminalsService.updateTerminal(T1, { code: '' })).rejects.toThrow('code_invalid');
    await expect(PosTerminalsService.updateTerminal(T1, { name: undefined, code: undefined })).rejects.toThrow('nada que actualizar');
    expect(api.calls).toHaveLength(1);
  });

  it('createTerminal: nombre de 81 tras recortar → lanza; 80 exactos → viaja; el id NUNCA se manda (lo pone la BD)', async () => {
    await expect(PosTerminalsService.createTerminal({ name: ' ' + 'a'.repeat(81) + ' ', code: 'A' })).rejects.toThrow('name_too_long');
    db.terminalRows = { id: T1 };
    await PosTerminalsService.createTerminal({ name: ' ' + 'a'.repeat(80) + ' ', code: 'A' });
    const insert = db.calls.find((c) => c.op === 'insert');
    expect(insert?.payload).toEqual({ organization_id: 120, branch_id: 7, name: 'a'.repeat(80), code: 'A', is_active: true });
    expect(Object.keys(insert?.payload ?? {})).not.toContain('id');
  });

  it('isDuplicateCodeError exige el código como string («23505»); un 23505 numérico o un objeto sin code no cuentan', () => {
    expect(isDuplicateCodeError({ code: 23505 })).toBe(false);
    expect(isDuplicateCodeError({ code: '23505' })).toBe(true);
    expect(isDuplicateCodeError({ message: 'duplicate key' })).toBe(false);
    expect(isDuplicateCodeError(null)).toBe(false);
    expect(isDuplicateCodeError('23505')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Contratos estáticos de la ronda 2 y de la base
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('contratos estáticos · ronda 2', () => {
  const card = read('src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx');
  const ajustes = read('src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx');
  const estaCaja = read('src/components/pos/configuracion/pantalla-cliente/EstaCajaSection.tsx');
  const route = read('src/app/api/pos/terminals/[id]/route.ts');
  const service = read('src/lib/services/posTerminalsService.ts');
  const identity = read('src/lib/pos/display/terminalIdentity.ts');

  it('un solo `saving`: la sección recibe disabled={loadFailed || saving} y onSavingChange={setSaving}; el interruptor se deshabilita con saving || loadFailed', () => {
    expect(card).toMatch(/<AjustesPantallaSection[^>]*disabled=\{loadFailed \|\| saving\}/);
    expect(card).toMatch(/onSavingChange=\{setSaving\}/);
    expect(card).toMatch(/disabled=\{saving \|\| loadFailed\}/);
    expect(ajustes).toMatch(/const controlsDisabled = disabled \|\| saving/);
    expect(ajustes).toMatch(/onSavingChange\?\.\(value\)/);
  });

  it('la reversión del interruptor toca SOLO enabled sobre el estado actual', () => {
    expect(card).toMatch(/setSettings\(\(prev\) => \(\{ \.\.\.prev, enabled: !value \}\)\)/);
    expect(card).not.toMatch(/setSettings\(previous\)/);
  });

  it('EstaCajaSection descarta la selección y cierra «Renombrar» al cambiar de sucursal; pinta loadError y esconde «Nueva terminal» si la carga falló', () => {
    const effect = estaCaja.slice(estaCaja.indexOf('useEffect(() => {'), estaCaja.indexOf('void reload();'));
    expect(effect).toMatch(/setSelectedId\(''\)/);
    expect(effect).toMatch(/setShowRename\(false\)/);
    expect(estaCaja).toMatch(/loadFailed && \(/);
    expect(estaCaja).toMatch(/disabled=\{loadFailed\}/);
    expect(estaCaja).toMatch(/linkedToInactive/);
    expect(estaCaja).toMatch(/bg-amber-500/);
  });

  it('renombrar y activar van por el servicio (ruta PATCH), nunca por supabase.from en el componente; crear y listar por el servicio', () => {
    expect(estaCaja).not.toMatch(/supabase/);
    expect(estaCaja).toMatch(/PosTerminalsService\.updateTerminal/);
    expect(estaCaja).toMatch(/PosTerminalsService\.setTerminalActive/);
    expect(estaCaja).not.toMatch(/fetch\(/);
  });

  it('la ruta es hoja respecto al navegador: importa terminalIdentity, nunca posTerminalsService ni @/lib/supabase/config; usa ctx.supabase (sesión, RLS) y no getServiceClient', () => {
    expect(route).toMatch(/from '@\/lib\/pos\/display\/terminalIdentity'/);
    expect(route).not.toMatch(/posTerminalsService/);
    expect(route).not.toMatch(/@\/lib\/supabase\/config/);
    expect(route).not.toMatch(/getServiceClient/);
    expect(route).toMatch(/ctx\.supabase\s*\.from\('pos_terminals'\)/);
    expect(identity).not.toMatch(/import /);
  });

  it('la ruta resuelve el rol por id (POS_MANAGER_ROLE_ID = 5, isOrgAdminLike) y nunca por roleName; el servicio manda X-Organization-Id y nunca la organización en el body', () => {
    // El criterio síncrono vive en terminalPermissions.ts (Next no admite exportar helpers desde route.ts).
    const permisos = read('src/lib/pos/display/terminalPermissions.ts');
    expect(permisos).toMatch(/POS_MANAGER_ROLE_ID = 5/);
    expect(route).toMatch(/canManagePosTerminalsSync/);
    expect(route).not.toMatch(/roleName/);
    expect(route).not.toMatch(/['"]Manager['"]/);
    expect(service).toMatch(/'X-Organization-Id': String\(orgId\)/);
    expect(service).toMatch(/body: JSON\.stringify\(patch\)/);
    expect(service).not.toMatch(/organization_id: orgId,\s*name/);
  });

  it('migración y rollback existen, la migración quita DELETE y exige branch de la misma organización; el rollback restaura las tres políticas', () => {
    const mig = read('supabase/migrations/20260921140000_pos_terminals_rls_sucursal_sin_delete.sql');
    const rb = read('supabase/rollbacks/20260921140000_pos_terminals_rls_sucursal_sin_delete_rollback.sql');
    expect(mig).toMatch(/drop policy if exists pos_terminals_delete/);
    expect(mig).not.toMatch(/create policy pos_terminals_delete/);
    expect((mig.match(/b\.organization_id = pos_terminals\.organization_id/g) ?? []).length).toBe(2);
    expect(rb).toMatch(/create policy pos_terminals_delete/);
    expect(rb).toMatch(/create policy pos_terminals_insert/);
    expect(rb).toMatch(/create policy pos_terminals_update/);
    for (const sql of [mig, rb]) {
      expect(sql).not.toMatch(/eyJ|service_role|password/i);
    }
  });

  it('ronda 3 (era HALLAZGO bajo): la base garantiza la unicidad sin distinguir mayúsculas (índice sobre upper(code)) y la forma canónica (CHECK code = upper(code)); el servicio sigue normalizando', () => {
    expect(svcMod.TERMINAL_CODE_PATTERN.test('qa-x')).toBe(true);
    expect(svcMod.normalizeTerminalCode('qa-x')).toBe('QA-X');
    const mig = read('supabase/migrations/20260921150100_pos_terminals_code_unico_ci.sql');
    expect(mig).toMatch(/create unique index if not exists pos_terminals_code_unico_ci[\s\S]*upper\(code\)/i);
    expect(mig).toMatch(/pos_terminals_code_mayusculas check \(code = upper\(code\)\) not valid/i);
    expect(mig).toMatch(/validate constraint pos_terminals_code_mayusculas/i);
    const rb = read('supabase/rollbacks/20260921150100_pos_terminals_code_unico_ci_rollback.sql');
    expect(rb).toMatch(/drop constraint if exists pos_terminals_code_mayusculas/i);
    expect(rb).toMatch(/drop index if exists public\.pos_terminals_code_unico_ci/i);
    // Ambos índices únicos siguen dando 23505: isDuplicateCodeError no cambia.
    expect(svcMod.isDuplicateCodeError({ code: '23505', message: 'duplicate key value violates unique constraint "pos_terminals_code_unico_ci"' })).toBe(true);
  });

  it('ronda 3: la política UPDATE de pos_terminals exige rol 1/2/5, super admin o admin.full_access (defensa en profundidad de la ruta), con rollback', () => {
    const mig = read('supabase/migrations/20260921150000_pos_terminals_update_rol_admin_manager.sql');
    expect(mig).toMatch(/create policy pos_terminals_update on public\.pos_terminals/);
    expect(mig).toMatch(/om\.role_id in \(1, 2, 5\) or om\.is_super_admin = true/);
    expect(mig).toMatch(/public\.check_user_permission\(\(select auth\.uid\(\)\), pos_terminals\.organization_id, 'admin\.full_access'\)/);
    expect(mig).toMatch(/branch_id in \([\s\S]*b\.organization_id = pos_terminals\.organization_id/);
    expect(mig).not.toMatch(/'Manager'|'Admin de organización'/); // por id, nunca por nombre
    const rb = read('supabase/rollbacks/20260921150000_pos_terminals_update_rol_admin_manager_rollback.sql');
    expect(rb).toMatch(/create policy pos_terminals_update/);
    expect(rb).not.toMatch(/check_user_permission/);
    // La ruta sigue con el cliente de sesión y su propio gate: la RLS no lo sustituye.
    const route = read('src/app/api/pos/terminals/[id]/route.ts');
    expect(route).toMatch(/hasOrgAdminOrPermission\(ctx\)/);
    expect(route).toMatch(/ctx\.supabase/);
    expect(route).not.toMatch(/getServiceClient/);
  });
});
