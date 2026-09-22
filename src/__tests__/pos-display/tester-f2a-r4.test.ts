/**
 * TESTER · Fase 2, parte A (terminales y ajustes completos), RONDA 4 (cierre).
 *
 * Complementa tester-f2a-r1/r2/r3 (no repite lo que ya cubren). Cada bloque
 * nace de un intento de romper la lista congelada A1–A4 de la ronda 4:
 *
 * 1. A1 · emisor: las ramas nuevas de `applySwitch(fromStart)` con un
 *    transporte falso: refresh() oculto es idempotente (un solo transporte,
 *    latido arrancado, ningún hello); `createTransport` que devuelve null o
 *    lanza no deja el emisor a medias y el siguiente refresh() reintenta;
 *    `isVisible` que LANZA cuenta como visible (saluda y avisa); apagar
 *    mientras el transporte abierto-sin-hello está vivo lo cierra sin haber
 *    saludado nunca; encender + ver → un único hello con settings; start()
 *    con la ventana oculta y sin transporte disponible no lanza.
 * 2. A1 · receptor real (BroadcastChannel): la ronda 4 se apoya en que «la
 *    ventana de elección resuelve por sessionOpen/seq». Se comprueba el caso
 *    en que eso elige MAL: una pestaña de la mañana (mucho seq) que quedó
 *    oculta y una pestaña nueva del cajero (poco seq). Al recargar la
 *    pantalla ambas responden al need_snapshot y gana la OCULTA; las teclas
 *    del cajero no llegan hasta que cambie de ventana. HALLAZGO (medio,
 *    preexistente de la parte D; la ronda 4 lo hereda al hacer que la
 *    oculta responda al need_snapshot). El test lo documenta tal cual.
 * 3. A2 · `isValidMediaUrl`: tipos que no son cadena, puerto fuera de rango,
 *    espacio duro (NBSP) dentro, IDN, y equivalencia exacta predicado ↔
 *    esquema ↔ validateDraft sobre un lote (ninguna URL cae en un lado sí y
 *    en el otro no).
 * 4. Tarjeta · tras «Guardar» con presets DESORDENADOS (o inválidos con la
 *    propina apagada) el guardado los normaliza y `saved` es igual a
 *    `settings`: `presentationKey` no cambia, el borrador no se rehace y la
 *    tarjeta sigue en «cambios sin guardar» con el botón activo. HALLAZGO
 *    (bajo), demostrado con los helpers reales y el contrato estático.
 * 5. settings.ts · dos ventanas (o dos administradores) que guardan a la vez
 *    hacen lectura-mezcla-upsert sin condición: el segundo upsert pisa el
 *    campo del primero. HALLAZGO (bajo, ventana de milisegundos entre dos
 *    navegadores; dentro de una ventana la tarjeta ya lo serializa).
 * 6. i18n · TODAS las claves literales usadas en las tres tarjetas
 *    (AjustesPantallaSection, EstaCajaSection, PantallaClienteContent) y
 *    los mapas INVALID_KEY / IDLE_MODE_KEY / TOUCH_MODE_KEY existen en
 *    es/en/pt/fr (más general que la comprobación puntual de r3).
 *
 * Verificado además contra la base (MCP, solo lectura) el 2026-09-21:
 * `pos_terminals` tiene exactamente las 9 columnas de TERMINAL_COLUMNS, RLS
 * activa sin política DELETE, insert con `with_check` = pertenencia a la
 * organización + sucursal de la misma organización, update = rol 1/2/5,
 * super admin o `admin.full_access`; 0 filas (el servicio del navegador no
 * se puede ejecutar desde aquí: ver noProbado del informe).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Cart, CartItem } from '@/components/pos/types';
import type { DisplayState, DownMessageDraft, UpMessage } from '@/lib/pos/display/protocol';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';

// ---------------------------------------------------------------------------
// Dobles compartidos (mismo patrón que tester-f2a-r3), con una compuerta para
// retrasar la LECTURA de organization_settings (bloque 5).
// ---------------------------------------------------------------------------

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert';
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

const db: {
  calls: Call[];
  settingsRow: { settings: unknown } | null;
  error: { code?: string; message: string } | null;
  /** Si está, cada lectura de organization_settings espera a que se resuelva. */
  readGate: Promise<void> | null;
} = { calls: [], settingsRow: null, error: null, readGate: null };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] };
      db.calls.push(call);
      const result = async () => {
        if (call.op === 'select' && table === 'organization_settings' && db.readGate) await db.readGate;
        if (db.error) return { data: null, error: db.error };
        if (call.op === 'upsert' && table === 'organization_settings') {
          // Simula la fila real: el upsert sustituye `settings` entero.
          db.settingsRow = { settings: call.payload?.settings };
          return { data: null, error: null };
        }
        if (table === 'organization_settings') return { data: db.settingsRow, error: null };
        return { data: [], error: null };
      };
      const chain = {
        select: () => chain,
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
        single: () => result(),
        maybeSingle: () => result(),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => result().then(resolve, reject),
      };
      return chain;
    },
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const settingsMod = require('@/lib/pos/display/settings') as typeof import('@/lib/pos/display/settings');
const emitterMod = require('@/lib/pos/display/emitter') as typeof import('@/lib/pos/display/emitter');
const protocolMod = require('@/lib/pos/display/protocol') as typeof import('@/lib/pos/display/protocol');
const transportMod = require('@/lib/pos/display/transport') as typeof import('@/lib/pos/display/transport');
/* eslint-enable @typescript-eslint/no-require-imports */

const { parseCustomerDisplaySettings, toDisplayPresentationSettings, isValidMediaUrl, saveCustomerDisplaySettings, DEFAULT_CUSTOMER_DISPLAY_SETTINGS } = settingsMod;
const { DisplayEmitter } = emitterMod;
const { isDownMessage } = protocolMod;
const { BroadcastChannelReceiver, BroadcastChannelTransport } = transportMod;

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const TS = '2026-09-21T10:00:00.000Z';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

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

/** Transporte falso mínimo (mismo contrato que el de emitter.test.ts). */
class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  heartbeatStarted = 0;
  heartbeatStopped = 0;
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
    return () => {
      this.handlers.delete(handler);
    };
  }
  startHeartbeat(): void {
    this.heartbeatStarted += 1;
  }
  stopHeartbeat(): void {
    this.heartbeatStopped += 1;
  }
  close(): void {
    this.closed = true;
  }
  emitUp(msg: UpMessage): void {
    for (const handler of Array.from(this.handlers)) handler(msg);
  }
  get types(): string[] {
    return this.published.map((m) => m.t);
  }
  get hellos(): HelloDraft[] {
    return this.published.filter((m): m is HelloDraft => m.t === 'hello');
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
  };
}

const presentation = () => toDisplayPresentationSettings(parseCustomerDisplaySettings({ tips: { enabled: true, presets: [10, 15, 20] }, rating: { enabled: true } }));

beforeEach(() => {
  db.calls = [];
  db.settingsRow = null;
  db.error = null;
  db.readGate = null;
  settingsMod.clearCustomerDisplaySettingsCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// 1. A1 · ramas de applySwitch(fromStart) con transporte falso
// ---------------------------------------------------------------------------

describe('emitter.ts · A1: apertura sin saludo (ronda 4) con transporte falso', () => {
  function build(opts: { visible: { value: boolean }; enabled: { value: boolean }; create?: () => DisplayTransport | null; isVisible?: () => boolean }) {
    const transports: FakeTransport[] = [];
    const sched = manualScheduler();
    const emitter = new DisplayEmitter({
      createTransport:
        opts.create ??
        (() => {
          const t = new FakeTransport();
          transports.push(t);
          return t;
        }),
      isEnabled: () => opts.enabled.value,
      getSettings: presentation,
      isVisible: opts.isVisible ?? (() => opts.visible.value),
      schedule: sched.schedule,
    });
    return { emitter, transports, flush: sched.flush };
  }

  it('refresh() oculto con el interruptor recién encendido: UN transporte, latido arrancado, ningún hello; un segundo refresh() oculto no crea otro ni saluda', () => {
    const enabled = { value: false };
    const visible = { value: false };
    const { emitter, transports } = build({ enabled, visible });
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    expect(transports).toHaveLength(0);

    enabled.value = true;
    emitter.refresh();
    emitter.refresh();
    emitter.refresh();
    expect(transports).toHaveLength(1);
    expect(transports[0].heartbeatStarted).toBe(1);
    expect(transports[0].types).toEqual([]);
    expect(emitter.isEmitting).toBe(true);
  });

  it('abierto-sin-hello y la pantalla pide snapshot: hello (con settings) + state en ese orden; el hello pasa isDownMessage con el sobre', () => {
    const enabled = { value: true };
    const visible = { value: false };
    const { emitter, transports } = build({ enabled, visible });
    // Arranca apagado para que start() no salude; luego se enciende desde otra ventana.
    enabled.value = false;
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    enabled.value = true;
    emitter.refresh();
    const t = transports[0];
    expect(t.types).toEqual([]);
    t.emitUp({ t: 'need_snapshot', v: 1, terminalId: TERMINAL, capabilities: { touch: false, width: 1, height: 1 } });
    expect(t.types).toEqual(['hello', 'state']);
    expect(t.hellos[0].settings?.tips.presets).toEqual([10, 15, 20]);
    expect(t.hellos[0].settings?.rating.enabled).toBe(true);
    expect(isDownMessage({ ...t.hellos[0], v: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, seq: 1 })).toBe(true);
  });

  it('abierto-sin-hello y luego APAGADO desde otra ventana: se cierra (bye por el transporte) sin haber saludado nunca; encender + ver → un único hello', () => {
    const enabled = { value: false };
    const visible = { value: false };
    const { emitter, transports } = build({ enabled, visible });
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    enabled.value = true;
    emitter.refresh(); // abre sin saludar
    enabled.value = false;
    emitter.refresh(); // cierra
    expect(transports[0].closed).toBe(true);
    expect(transports[0].heartbeatStopped).toBe(1);
    expect(transports[0].types).toEqual([]);
    expect(emitter.isEmitting).toBe(false);

    enabled.value = true;
    visible.value = true;
    emitter.refresh();
    expect(transports).toHaveLength(2);
    expect(transports[1].types).toEqual(['hello', 'state']);
  });

  it('createTransport que devuelve null (sin BroadcastChannel) desde start() oculto: no lanza, no saluda; cuando vuelve a haber transporte el siguiente refresh() lo abre', () => {
    const enabled = { value: true };
    const visible = { value: false };
    let available = false;
    const transports: FakeTransport[] = [];
    const { emitter } = build({
      enabled,
      visible,
      create: () => {
        if (!available) return null;
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
    });
    expect(() => emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true })).not.toThrow();
    expect(emitter.isEmitting).toBe(false);
    available = true;
    emitter.refresh(); // oculto: abre sin saludar
    expect(transports).toHaveLength(1);
    expect(transports[0].types).toEqual([]);
    visible.value = true;
    emitter.reannounce();
    expect(transports[0].types).toEqual(['hello', 'state']);
  });

  it('createTransport que LANZA en refresh(): se avisa, el emisor no queda a medias y el siguiente refresh() reintenta', () => {
    const enabled = { value: false };
    const visible = { value: true };
    let shouldThrow = true;
    const transports: FakeTransport[] = [];
    const { emitter } = build({
      enabled,
      visible,
      create: () => {
        if (shouldThrow) throw new Error('canal roto');
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
    });
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    enabled.value = true;
    expect(() => emitter.refresh()).not.toThrow();
    expect(emitter.isEmitting).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('createTransport'), expect.any(Error));
    shouldThrow = false;
    emitter.refresh();
    expect(emitter.isEmitting).toBe(true);
    expect(transports[0].types).toEqual(['hello', 'state']);
  });

  it('isVisible que LANZA cuenta como visible en las DOS ramas (apertura y resaludo): saluda y registra el aviso, nunca deja de saludar por no poder averiguarlo', () => {
    const enabled = { value: false };
    const { emitter, transports } = build({
      enabled,
      visible: { value: true },
      isVisible: () => {
        throw new Error('document inaccesible');
      },
    });
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    enabled.value = true;
    emitter.refresh(); // rama de apertura
    expect(transports[0].types).toEqual(['hello', 'state']);
    emitter.refresh(); // rama de resaludo
    expect(transports[0].types).toEqual(['hello', 'state', 'hello', 'state']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('isVisible'), expect.any(Error));
  });

  it('start() con la ventana OCULTA y el interruptor encendido sí saluda (fromStart), y un refresh() oculto inmediato no repite el hello', () => {
    const enabled = { value: true };
    const visible = { value: false };
    const { emitter, transports } = build({ enabled, visible });
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    expect(transports[0].types).toEqual(['hello', 'state']);
    emitter.refresh();
    expect(transports[0].types).toEqual(['hello', 'state']);
  });

  it('abierto-sin-hello: una mutación del carrito sale como state (sin hello previo) y el override de totales con firma sigue aplicándose', () => {
    const enabled = { value: false };
    const visible = { value: false };
    const { emitter, transports, flush } = build({ enabled, visible });
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    enabled.value = true;
    emitter.refresh();
    const c = cart({ id: 'c9', items: [item({ id: 'l1', product_id: 1, unit_price: 1000 })] });
    emitter.setActiveCart(c);
    flush();
    expect(transports[0].types).toEqual(['state']);
    const sig = emitterMod.cartLinesSignature(c);
    emitter.setTotals('c9', { discountTotal: 0, taxTotal: 190, total: 1190 }, sig);
    flush();
    expect(transports[0].types).toEqual(['state', 'state']);
    const last = transports[0].published[1];
    expect(last.t === 'state' && last.state.cart?.total).toBe(1190);
  });
});

// ---------------------------------------------------------------------------
// 2. A1 · receptor real: la elección por seq elige la pestaña OCULTA
// ---------------------------------------------------------------------------

describe('transport.ts + emitter.ts · elección tras need_snapshot con dos pestañas (BroadcastChannel real)', () => {
  const opened: Array<{ close(): void }> = [];
  const track = <T extends { close(): void }>(x: T): T => {
    opened.push(x);
    return x;
  };
  afterEach(() => {
    while (opened.length > 0) opened.pop()?.close();
  });

  function caja(instanceId: string, visible: { value: boolean }, enabled: { value: boolean }) {
    const emitter = new DisplayEmitter({
      createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId, now: () => 0 })),
      isEnabled: () => enabled.value,
      getSettings: presentation,
      isVisible: () => visible.value,
      schedule: (fn) => {
        const id = setTimeout(fn, 0);
        return () => clearTimeout(id);
      },
    });
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    return emitter;
  }

  it('RESUELTO en F2-B (era HALLAZGO medio de la parte D): la pestaña de la mañana (seq alto) queda OCULTA y el cajero trabaja en una pestaña nueva (seq bajo); al recargar la pantalla ambas responden al need_snapshot y gana la VISIBLE (hello.visible): las teclas del cajero llegan', async () => {
    const enabled = { value: true };
    const fondoVisible = { value: true };
    // Pestaña B: la de la mañana. Trabaja un rato (muchos states → seq alto) y luego queda oculta.
    const fondo = caja(INSTANCE_B, fondoVisible, enabled);
    for (let i = 1; i <= 30; i += 1) {
      fondo.setActiveCart(cart({ id: 'cart-fondo', items: Array.from({ length: (i % 3) + 1 }, (_, k) => item({ id: `f-${k}`, product_id: k + 1, quantity: i })) }));
      await tick(2);
    }
    fondoVisible.value = false;
    // Pestaña A: la nueva del cajero, con su propio carrito (pocos mensajes → seq bajo).
    const cajero = caja(INSTANCE_A, { value: true }, enabled);
    cajero.setActiveCart(cart({ id: 'cart-cajero', items: [item({ id: 'a-1', product_id: 9 })] }));
    await tick(4);

    // La pantalla se recarga: sin activa, pregunta a todas.
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const seen: Array<{ instanceId: string; cartId: string | null }> = [];
    display.onDown((m) => {
      if (m.t === 'state') seen.push({ instanceId: m.instanceId, cartId: m.state.cart?.id ?? null });
    });
    display.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    await waitFor(() => seen.length >= 1);
    await tick(8);

    // Contrato F2-B (transport.ts · isBetterHello): `visible: true` manda antes que sessionOpen y seq → la VISIBLE.
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    expect(seen[seen.length - 1]).toEqual({ instanceId: INSTANCE_A, cartId: 'cart-cajero' });

    // El cajero teclea en su pestaña visible y la pantalla SÍ se entera (es la activa).
    const antes = seen.length;
    cajero.setActiveCart(cart({ id: 'cart-cajero', items: [item({ id: 'a-1', product_id: 9 }), item({ id: 'a-2', product_id: 10 })] }));
    await waitFor(() => seen.length > antes);
    expect(display.activeInstanceId).toBe(INSTANCE_A);

    // Dentro de la ventana de elección un reannounce de la OCULTA no la recupera (visible:false no es «mejor»).
    fondo.reannounce();
    await tick(8);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    cajero.stop();
    fondo.stop();
  });
});

// ---------------------------------------------------------------------------
// 3. A2 · isValidMediaUrl y equivalencia predicado ↔ esquema ↔ validateDraft
// ---------------------------------------------------------------------------

describe('settings.ts · A2: isValidMediaUrl como ÚNICO predicado', () => {
  let validateDraft: (d: unknown) => string | null;
  let firstInvalidMediaUrl: (d: unknown) => string | null;
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
    validateDraft = mod.exports.validateDraft as typeof validateDraft;
    firstInvalidMediaUrl = mod.exports.firstInvalidMediaUrl as typeof firstInvalidMediaUrl;
  });

  const draftWith = (urls: unknown[]) => ({
    tips: { enabled: false, presets: [5, 10, 15], allowCustom: true },
    rating: { enabled: false },
    showTaxBreakdown: false,
    showCustomerName: false,
    idle: { mode: 'media', mediaUrls: urls, idleAfterSeconds: 90 },
    locale: null,
    touch: 'auto',
  });

  it('entradas que no son cadena (número, null, undefined, objeto, array, URL) → false sin lanzar', () => {
    for (const bad of [123, null, undefined, {}, ['https://x.com/a.png'], new URL('https://x.com/a.png'), true, Symbol('u')]) {
      expect(isValidMediaUrl(bad)).toBe(false);
    }
  });

  it('puerto fuera de rango (https://x.com:99999), espacio duro NBSP dentro y «https://.» se rechazan; IDN, percent-encoding y query/fragmento se aceptan', () => {
    expect(isValidMediaUrl('https://x.com:99999/a.png')).toBe(false);
    expect(isValidMediaUrl('https://x.com/a b.png')).toBe(false);
    expect(isValidMediaUrl('https://x.com/a%20b.png')).toBe(true);
    expect(isValidMediaUrl('https://ñandú.co/logo.png')).toBe(true);
    expect(isValidMediaUrl('https://x.com/a.png?v=1#top')).toBe(true);
    expect(isValidMediaUrl('http://localhost:3000/a.png')).toBe(true);
    expect(isValidMediaUrl('https://x.com:65535/a.png')).toBe(true);
  });

  it('equivalencia exacta sobre un lote: para CADA candidata, predicado, esquema zod y validateDraft/firstInvalidMediaUrl dicen lo mismo', () => {
    const lote = [
      'https://x.com/a.png',
      ' https://x.com/b.png ',
      'https://%',
      'http://[',
      'https://x.com:99999/a.png',
      'https://x.com/a b.png',
      'https://a.com\nhttps://b.com',
      'ftp://x.com/a.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '//x.com/a.png',
      '/a.png',
      'https://',
      'HTTPS://X.COM/A.PNG',
      'https://u:p@x.com/a.png',
      'https://x.com/a b.png',
      'https://ñandú.co/logo.png',
      'https://x.com/%E2%9C%93.png',
      'https://x.com/a\tb.png',
      'https://[::1]/a.png',
      'https://[::1',
      'https://x.com:0/a.png',
      'https://x.com/a.png\r',
      'https://x.com/a.png#',
    ];
    for (const raw of lote) {
      const byPredicate = isValidMediaUrl(raw);
      const bySchema = parseCustomerDisplaySettings({ idle: { mode: 'media', mediaUrls: [raw] } }).idle.mediaUrls.length === 1;
      const byDraft = validateDraft(draftWith([raw])) === null;
      const named = firstInvalidMediaUrl(draftWith([raw]));
      expect({ raw, bySchema, byDraft, named }).toEqual({ raw, bySchema: byPredicate, byDraft: byPredicate, named: byPredicate ? null : raw });
    }
  });

  it('el aviso nombra la PRIMERA URL mal formada y solo esa (las válidas de antes no cuentan)', () => {
    expect(firstInvalidMediaUrl(draftWith(['https://ok.com/1.png', 'https://%', 'http://[']))).toBe('https://%');
    expect(firstInvalidMediaUrl(draftWith(['https://ok.com/1.png']))).toBeNull();
    expect(validateDraft(draftWith(['https://ok.com/1.png', 'https://%']))).toBe('mediaUrls');
  });

  it('20 válidas + 1 inválida al final: la tarjeta avisa «demasiadas» ANTES que «mal formada» (mediaUrlsTooMany tiene prioridad); zod recortaría a 20 sin la inválida', () => {
    const urls = [...Array.from({ length: 20 }, (_, i) => `https://x.com/${i}.png`), 'https://%'];
    expect(validateDraft(draftWith(urls))).toBe('mediaUrlsTooMany');
    expect(parseCustomerDisplaySettings({ idle: { mediaUrls: urls } }).idle.mediaUrls).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// 4. Tarjeta · «guardado» pero sigue «sin guardar» (presentationKey no cambia)
// ---------------------------------------------------------------------------

describe('AjustesPantallaSection · el borrador no se rehace cuando lo guardado es igual a lo que ya había', () => {
  let normalizeDraftForSave: <T>(d: T) => T;
  let source = '';
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ts = require('typescript') as typeof import('typescript');
    source = read('src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText;
    const stub = new Proxy({}, { get: () => () => null });
    const fakeRequire = (id: string) => {
      if (id === '@/lib/pos/display/settings') return settingsMod;
      if (id === '@/lib/pos/display/protocol') return {};
      if (id === '@/i18n/config') return { locales: ['es'], localeNames: { es: 'Español' } };
      return stub;
    };
    const mod = { exports: {} as Record<string, unknown> };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('require', 'module', 'exports', js)(fakeRequire, mod, mod.exports);
    normalizeDraftForSave = mod.exports.normalizeDraftForSave as typeof normalizeDraftForSave;
  });

  /** Copia literal de `toDraft` (no se exporta): lo que la tarjeta compara. */
  const toDraft = (s: ReturnType<typeof parseCustomerDisplaySettings>) => ({
    tips: { ...s.tips, presets: [...s.tips.presets] },
    rating: { ...s.rating },
    showTaxBreakdown: s.showTaxBreakdown,
    showCustomerName: s.showCustomerName,
    idle: { ...s.idle, mediaUrls: [...s.idle.mediaUrls] },
    locale: s.locale,
    touch: s.touch,
  });

  it('CORREGIDO (cierre F2-A): presets tecleados en otro orden (15/10/5) sobre 5/10/15 guardados → se guarda normalizado, saved == settings, presentationKey NO cambia, pero handleSave rehace el borrador con `saved` y dirty vuelve a false', async () => {
    db.settingsRow = { settings: { enabled: true, tips: { enabled: true, presets: [5, 10, 15], allowCustom: true } } };
    const settings = parseCustomerDisplaySettings(db.settingsRow.settings);
    const presentationKeyBefore = JSON.stringify(toDraft(settings));

    // El usuario reordena los tres campos.
    const draft = { ...toDraft(settings), tips: { ...settings.tips, presets: [15, 10, 5] } };
    const dirtyBefore = JSON.stringify(draft) !== JSON.stringify(toDraft(settings));
    expect(dirtyBefore).toBe(true);

    // handleSave: normaliza y guarda por el servicio real (settings.ts) → saved.
    const toSave = normalizeDraftForSave(draft);
    const saved = await saveCustomerDisplaySettings(120, toSave);
    expect(saved.tips.presets).toEqual([5, 10, 15]);

    // onSaved(saved) → settings nuevo pero IGUAL: la clave no cambia y el efecto que rehace el borrador no corre.
    const presentationKeyAfter = JSON.stringify(toDraft(saved));
    expect(presentationKeyAfter).toBe(presentationKeyBefore);
    // handleSave hace setDraft(toDraft(saved)): el borrador queda igual a lo guardado y dirty vuelve a false.
    const dirtyAfter = JSON.stringify(toDraft(saved)) !== JSON.stringify(toDraft(saved)); // lo que queda en el borrador tras setDraft(toDraft(saved))
    expect(dirtyAfter).toBe(false);
  });

  it('HALLAZGO (bajo, mismo mecanismo): propina APAGADA con un preset borrado (NaN) sobre unos guardados por defecto → se guarda 5/10/15, saved == settings y el NaN sigue en el borrador', async () => {
    db.settingsRow = { settings: { enabled: true } };
    const settings = parseCustomerDisplaySettings(db.settingsRow.settings);
    const draft = { ...toDraft(settings), tips: { enabled: false, presets: [Number.NaN, 10, 15], allowCustom: true } };
    const toSave = normalizeDraftForSave(draft);
    expect(toSave.tips.presets).toEqual([...DEFAULT_CUSTOMER_DISPLAY_SETTINGS.tips.presets]);
    const saved = await saveCustomerDisplaySettings(120, toSave);
    expect(JSON.stringify(toDraft(saved))).toBe(JSON.stringify(toDraft(settings)));
    expect(JSON.stringify(toDraft(saved)) !== JSON.stringify(toDraft(saved))).toBe(false); // ídem: el borrador se rehace con saved
  });

  it('contrato estático: presentationKey depende solo de settings, el efecto que rehace el borrador depende solo de [presentationKey] y dirty compara borrador contra settings', () => {
    expect(source).toContain("const presentationKey = useMemo(() => JSON.stringify(toDraft(settings)), [settings]);");
    expect(source).toMatch(/useEffect\(\(\) => \{\s*const parsed = JSON\.parse\(presentationKey\)[\s\S]*?\}, \[presentationKey\]\);/);
    expect(source).toContain("!== JSON.stringify(toDraft(settings))");
    // handleSave no rehace el borrador con `saved` (ni setDraft ni setMediaText tras onSaved).
    const handleSave = source.slice(source.indexOf('const handleSave'), source.indexOf('const controlsDisabled'));
    expect(handleSave).toContain('onSaved(saved)');
    expect(handleSave).toContain('setDraft(toDraft(saved))');
    expect(handleSave).toContain('setMediaText(saved.idle.mediaUrls');
  });
});

// ---------------------------------------------------------------------------
// 5. settings.ts · lectura-mezcla-upsert sin condición entre dos ventanas
// ---------------------------------------------------------------------------

describe('settings.ts · saveCustomerDisplaySettings desde dos ventanas a la vez', () => {
  it('HALLAZGO (bajo): dos guardados que leen la misma fila antes de que ninguno escriba: el segundo upsert pisa el campo del primero (se pierde el encendido)', async () => {
    db.settingsRow = { settings: { enabled: false, showTaxBreakdown: false } };
    let openGate: () => void = () => undefined;
    db.readGate = new Promise<void>((r) => {
      openGate = r;
    });
    // Ventana 1 (Configuración, otro administrador): enciende el interruptor.
    const p1 = saveCustomerDisplaySettings(120, { enabled: true });
    // Ventana 2: guarda la presentación (bloques completos, sin `enabled`).
    const p2 = saveCustomerDisplaySettings(120, { showTaxBreakdown: true });
    await tick(2);
    // Las dos lecturas ya están en vuelo con la fila vieja; se sueltan a la vez.
    openGate();
    await Promise.all([p1, p2]);

    const upserts = db.calls.filter((c) => c.op === 'upsert').map((c) => c.payload?.settings as { enabled: boolean; showTaxBreakdown: boolean });
    expect(upserts).toHaveLength(2);
    // Lo que queda en la fila es el ÚLTIMO upsert, que no vio el `enabled: true` del otro.
    const final = db.settingsRow?.settings as { enabled: boolean; showTaxBreakdown: boolean };
    expect(final.showTaxBreakdown).toBe(true);
    expect(final.enabled).toBe(false); // ← el encendido de la ventana 1 se perdió
    // Y la caché de la ventana 2 cree que sigue apagado mientras la 1 cree que está encendido.
    expect(upserts.some((u) => u.enabled === true)).toBe(true);
  });

  it('en la MISMA ventana la tarjeta lo serializa (un solo `saving`): contrato estático de PantallaClienteContent y AjustesPantallaSection', () => {
    const content = read('src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx');
    expect(content).toContain('disabled={loadFailed || saving}');
    expect(content).toContain('onSavingChange={setSaving}');
    const ajustes = read('src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx');
    expect(ajustes).toContain('const controlsDisabled = disabled || saving;');
  });
});

// ---------------------------------------------------------------------------
// 6. i18n · todas las claves literales de las tres tarjetas
// ---------------------------------------------------------------------------

describe('i18n · cada clave literal usada por las tarjetas existe en es/en/pt/fr', () => {
  const get = (o: unknown, p: string): unknown => p.split('.').reduce<unknown>((a, k) => (typeof a === 'object' && a !== null ? (a as Record<string, unknown>)[k] : undefined), o);
  const cards: Array<{ file: string; ns: Record<string, string>; extra?: Record<string, string[]> }> = [
    {
      file: 'src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx',
      ns: { t: 'posCustomerDisplay.config', tPres: 'posCustomerDisplay.presentation' },
      extra: {
        tPres: ['invalidPresets', 'invalidIdleSeconds', 'invalidMediaUrls', 'invalidMediaUrlsTooMany', 'idleModeBrand', 'idleModePromotions', 'idleModeMedia', 'touchModeAuto', 'touchModeTouch', 'touchModeNoTouch'],
      },
    },
    {
      file: 'src/components/pos/configuracion/pantalla-cliente/EstaCajaSection.tsx',
      ns: { t: 'posCustomerDisplay.terminals' },
      extra: { t: ['invalidNameRequired', 'invalidNameTooLong', 'invalidCodeInvalid'] },
    },
    {
      file: 'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx',
      ns: { t: 'posCustomerDisplay.config', tToast: 'posCustomerDisplay.toast' },
    },
  ];

  it.each(['es', 'en', 'pt', 'fr'])('%s', (lang) => {
    const msgs = JSON.parse(read(`messages/${lang}.json`)) as unknown;
    const missing: string[] = [];
    let total = 0;
    for (const card of cards) {
      const src = read(card.file);
      for (const [fn, base] of Object.entries(card.ns)) {
        const re = new RegExp('\\b' + fn + "\\('([A-Za-z0-9_.]+)'", 'g');
        const keys = new Set<string>(card.extra?.[fn] ?? []);
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) keys.add(m[1]);
        expect(keys.size).toBeGreaterThan(0);
        for (const key of keys) {
          total += 1;
          if (typeof get(msgs, `${base}.${key}`) !== 'string') missing.push(`${base}.${key} (${path.basename(card.file)})`);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(100);
    expect(missing).toEqual([]);
  });

  it('los mapas INVALID_KEY / IDLE_MODE_KEY / TOUCH_MODE_KEY de la tarjeta cubren todos los valores de los enums de settings.ts', () => {
    const src = read('src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx');
    for (const mode of settingsMod.IDLE_MODES) expect(src).toMatch(new RegExp(`${mode}: 'idleMode`));
    for (const touch of settingsMod.TOUCH_OVERRIDES) expect(src).toMatch(new RegExp(`'?${touch}'?: 'touchMode`));
  });
});
