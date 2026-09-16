/**
 * Tester · Parte A (ronda de cierre D1-D9). Casos que NO repiten las suites
 * del builder: la proyección se contrasta con el motor REAL de totales que ve
 * el cajero (`calculateCartTaxes`, el que la Parte B usará para el override),
 * y los tres criterios de aceptación de la Fase 0 (PLAN §12) se ejercitan
 * sobre el canal real: teclear una venta, caja que muere sin bye (≤ 3 s) y
 * pantalla recargada a mitad de venta.
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { projectCartForDisplay, type DisplayTotalsOverride } from '@/lib/pos/display/projection';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  isUpMessage,
  type DisplayState,
  type DownMessage,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, BroadcastChannelTransport, STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { calculateCartTaxes, type OrganizationTax, type TaxCalculationItem } from '@/lib/utils/taxCalculations';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = 'ffffffff-0000-4111-8222-333333333333';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const CAPS = { touch: false, width: 1280, height: 800 } as const;
const TS = '2026-09-15T15:00:00.000Z';
const IVA: OrganizationTax = { id: 'iva', name: 'IVA', rate: 19, is_default: true, is_active: true };
const APPLIED = { iva: true };

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
const fakeTimers = () => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function product(id: number): Product {
  return { id, organization_id: 1, sku: `SKU-${id}`, name: `Producto ${id}`, unit_code: 'UND', status: 'active', created_at: TS, updated_at: TS };
}
function item(over: Partial<CartItem> & { id: string; product_id: number }): CartItem {
  const quantity = over.quantity ?? 1;
  const unit_price = over.unit_price ?? 1000;
  return {
    cart_id: 'cart-1', product: product(over.product_id), quantity, unit_price, total: quantity * unit_price,
    discount_amount: 0, tax_amount: 0, tax_rate: 0, created_at: TS, updated_at: TS, ...over,
  };
}
function cart(over: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1', organization_id: 1, branch_id: 1, status: 'active', items: [],
    subtotal: 0, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 0,
    created_at: TS, updated_at: TS, ...over,
  };
}

/**
 * Lo que hará la Parte B: pasar el carrito por el mismo motor que TaxSummary /
 * CheckoutDialog (calculateCartTaxes con el `tax_included` de cada línea) y
 * entregar { discountTotal, taxTotal, total } como override.
 */
function overrideFromMotor(c: Cart): DisplayTotalsOverride {
  const taxItems: TaxCalculationItem[] = c.items.map((i) => ({
    quantity: i.quantity,
    unit_price: i.unit_price,
    product_id: i.product_id,
    discount_amount: i.discount_amount || 0,
    tax_included: i.tax_excluded ? false : i.tax_included,
  }));
  const r = calculateCartTaxes(taxItems, APPLIED, [IVA], false);
  return {
    discountTotal: c.items.reduce((s, i) => s + (i.discount_amount || 0), 0),
    taxTotal: r.totalTaxAmount,
    total: r.finalTotal,
  };
}

const IDLE: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };
const HELLO = { t: 'hello', cashier: { name: 'Cajero' }, sessionOpen: true, organizationId: 1 } as const;
const raw = {
  hello: (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'hello', seq, terminalId: TERMINAL, instanceId, cashier: null, sessionOpen: true, organizationId: 1 }),
  state: (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'state', seq, terminalId: TERMINAL, instanceId, state: IDLE }),
};

// ---------------------------------------------------------------------------
// D1 contra el motor real del cajero
// ---------------------------------------------------------------------------

describe('tester · D1 contra calculateCartTaxes (el motor que ve el cajero)', () => {
  it('impuesto EXCLUIDO con descuento: total = finalTotal del motor y subtotal − descuento + impuesto = total', () => {
    const c = cart({
      items: [
        item({ id: 'a', product_id: 1, quantity: 2, unit_price: 50_000, tax_included: false }),
        item({ id: 'b', product_id: 2, quantity: 1, unit_price: 20_000, discount_amount: 5_000, tax_included: false }),
      ],
    });
    const totals = overrideFromMotor(c);
    const out = projectCartForDisplay(c, { currency: 'COP', totals });

    expect(out.subtotal).toBe(120_000);
    expect(out.lines.map((l) => l.total)).toEqual([100_000, 20_000]);
    expect(out.discountTotal).toBe(5_000);
    // base gravable 115.000 × 19 % = 21.850
    expect(out.taxTotal).toBe(21_850);
    expect(out.total).toBe(136_850);
    expect(out.taxIncluded).toBe(false);
    expect(out.subtotal - out.discountTotal + out.taxTotal).toBeCloseTo(out.total, 2);
  });

  it('impuesto INCLUIDO con descuento: total = subtotal − descuento (el IVA va dentro) y taxTotal es la porción del motor', () => {
    const c = cart({
      items: [
        item({ id: 'a', product_id: 1, quantity: 1, unit_price: 119_000, tax_included: true }),
        item({ id: 'b', product_id: 2, quantity: 3, unit_price: 10_000, discount_amount: 2_000, tax_included: true }),
      ],
    });
    const totals = overrideFromMotor(c);
    const out = projectCartForDisplay(c, { currency: 'COP', totals });

    expect(out.subtotal).toBe(149_000);
    expect(out.discountTotal).toBe(2_000);
    expect(out.total).toBe(147_000);
    expect(out.taxIncluded).toBe(true);
    expect(out.lines.every((l) => l.taxIncluded && !l.taxExcluded)).toBe(true);
    // 147.000 − 147.000 / 1,19 = 23.470,59
    expect(out.taxTotal).toBeCloseTo(23_470.59, 2);
    expect(out.subtotal - out.discountTotal).toBe(out.total);
  });

  it('carrito MIXTO + una línea con «Excluir impuesto»: cada línea declara lo suyo y el total es el del motor', () => {
    const c = cart({
      items: [
        item({ id: 'inc', product_id: 1, unit_price: 119_000, tax_included: true }),
        item({ id: 'exc', product_id: 2, unit_price: 100_000, tax_included: false }),
        item({ id: 'sin', product_id: 3, unit_price: 30_000, tax_included: false, tax_excluded: true }),
      ],
    });
    const totals = overrideFromMotor(c);
    const out = projectCartForDisplay(c, { currency: 'COP', totals });

    expect(out.subtotal).toBe(249_000);
    expect(out.taxIncluded).toBe(true);
    expect(out.lines.map((l) => [l.id, l.taxIncluded, l.taxExcluded])).toEqual([
      ['inc', true, false],
      ['exc', false, false],
      ['sin', false, true],
    ]);
    // Nota: calculateCartTaxes sin tax_excluded en su item cobra IVA a «sin» si
    // la Parte B no lo mapea a tax_included:false + sin impuestos; aquí se
    // comprueba solo que la proyección repite lo que el motor devuelve.
    expect(out.total).toBe(totals.total);
    expect(out.taxTotal).toBe(totals.taxTotal);
  });

  it('descuento mayor que el subtotal: el motor devuelve total negativo y la pantalla lo refleja; discountTotal sigue positivo', () => {
    const c = cart({ items: [item({ id: 'a', product_id: 1, unit_price: 10_000, discount_amount: 15_000, tax_included: false })] });
    const totals = overrideFromMotor(c);
    const out = projectCartForDisplay(c, { currency: 'COP', totals });

    expect(out.subtotal).toBe(10_000);
    expect(out.discountTotal).toBe(15_000);
    expect(out.lines[0].discount).toBe(15_000);
    expect(out.total).toBeLessThan(0);
    expect(out.total).toBe(totals.total);
  });

  it('cantidad 0 y modificador sin precio: línea con total 0, extraPrice 0, y el motor no aporta impuesto', () => {
    const c = cart({
      items: [
        item({
          id: 'a', product_id: 1, quantity: 0, unit_price: 5_000, tax_included: false,
          modifiers: [{ groupId: 1, groupName: 'Extras', modifierId: 11, name: 'Sin cebolla', extraPrice: undefined as unknown as number }],
        }),
      ],
    });
    const out = projectCartForDisplay(c, { currency: 'COP', totals: overrideFromMotor(c) });
    expect(out.lines[0]).toMatchObject({ qty: 0, total: 0, modifiers: [{ name: 'Sin cebolla', extraPrice: 0 }] });
    expect(out.subtotal).toBe(0);
    expect(out.taxTotal).toBe(0);
    expect(out.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Aceptación Fase 0 sobre el canal real
// ---------------------------------------------------------------------------

describe('tester · aceptación Fase 0 (PLAN §12) sobre BroadcastChannel', () => {
  it('teclear una venta: 25 estados seguidos llegan todos, en orden, cada uno con su lastChangedLineId', async () => {
    const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const r = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const got: DownMessage[] = [];
    r.onDown((m) => got.push(m));

    const items: CartItem[] = [];
    const drafts: DisplayState[] = [];
    for (let i = 1; i <= 25; i += 1) {
      items.push(item({ id: `l-${i}`, product_id: i, quantity: i, unit_price: 1_000 * i }));
      const c = cart({ items: [...items] });
      drafts.push({ mode: 'order', cart: projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: `l-${i}` }), payment: null, tip: null, thanks: null });
    }
    t.publish(HELLO);
    for (const s of drafts) t.publish({ t: 'state', state: s });
    await flush(6);

    expect(got).toHaveLength(26);
    expect(got.map((m) => m.seq)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    const states = got.filter((m): m is Extract<DownMessage, { t: 'state' }> => m.t === 'state');
    expect(states.map((m) => m.state.cart?.lastChangedLineId)).toEqual(drafts.map((_, i) => `l-${i + 1}`));
    expect(states[24].state.cart?.lines).toHaveLength(25);
    expect(states[24].state.cart?.subtotal).toBe(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
  });

  it('la caja muere sin bye: a 2.999 ms la pantalla sigue con la activa; a 3.000 ms la suelta (Conectando en ≤ 3 s)', async () => {
    fakeTimers();
    let clock = 0;
    const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A, now: () => clock }));
    const r = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    t.publish(HELLO);
    await flush();
    expect(r.activeInstanceId).toBe(INSTANCE_A);

    t.close(false); // crash: sin bye
    await flush();
    clock = STALE_AFTER_MS - 1;
    jest.advanceTimersByTime(STALE_AFTER_MS - 1);
    expect(r.activeInstanceId).toBe(INSTANCE_A);
    expect(r.lastStaleAt).toBeNull();

    clock = STALE_AFTER_MS;
    jest.advanceTimersByTime(1);
    expect(r.activeInstanceId).toBeNull();
    expect(r.lastStaleAt).toBe(STALE_AFTER_MS);
    expect(r.lastByeAt).toBeNull();
    expect(r.lastReceivedAt).toBe(0);
  });

  it('recargar la pantalla a mitad de venta: need_snapshot → announce → 200 líneas idénticas a la proyección de la caja', async () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({ id: `l-${i}`, product_id: i + 1, quantity: (i % 5) + 1, unit_price: 1_500 + i, discount_amount: i % 7 === 0 ? 100 : 0, tax_included: i % 2 === 0 }),
    );
    const c = cart({ items });
    const projected = projectCartForDisplay(c, { currency: 'COP', totals: overrideFromMotor(c) });
    const state: DisplayState = { mode: 'order', cart: projected, payment: null, tip: null, thanks: null };

    const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    t.onUp((m) => {
      if (m.t === 'need_snapshot') t.announce(HELLO, state);
    });
    t.publish(HELLO);
    t.publish({ t: 'state', state });
    await flush();

    // La pantalla se recarga: receptor nuevo, sin nada.
    const r = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const got: DownMessage[] = [];
    r.onDown((m) => got.push(m));
    r.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush(6);

    expect(got.map((m) => m.t)).toEqual(['hello', 'state']);
    const recovered = got[1] as Extract<DownMessage, { t: 'state' }>;
    expect(recovered.state.cart?.lines).toHaveLength(200);
    expect(recovered.state.cart).toEqual(projected);
    expect(isDownMessage(recovered)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Errores: basura, versión desconocida, rezagados
// ---------------------------------------------------------------------------

describe('tester · basura, versión desconocida y rezagados', () => {
  it('JSON malformado o de otra forma por el canal: no adopta, no entrega, no cuenta como incompatible; el siguiente válido sí pasa', async () => {
    const r = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const got: DownMessage[] = [];
    r.onDown((m) => got.push(m));
    const ch = new BroadcastChannel(`pos-display:${TERMINAL}`);
    try {
      const garbage: unknown[] = [
        '{"v":1,"t":"hello"}', // string JSON sin parsear
        '', 0, 1, null, true, [], [1, 2], {},
        { v: 1 }, { v: 1, t: 'hello' }, { v: 1, t: 'nope', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A },
        { v: 1, t: 'state', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, state: null },
        { v: 1, t: 'state', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, state: { mode: 'order' } },
        { v: 1, t: 'state', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, state: { mode: 'order', cart: [], payment: null, tip: null, thanks: null } },
      ];
      for (const g of garbage) ch.postMessage(g);
      await flush(6);
      expect(got).toHaveLength(0);
      expect(r.activeInstanceId).toBeNull();
      expect(r.incompatibleVersionCount).toBe(0);
      expect(r.lastReceivedAt).toBeNull();

      ch.postMessage(raw.hello(1, INSTANCE_A));
      await flush();
      expect(got.map((m) => m.t)).toEqual(['hello']);
      expect(r.activeInstanceId).toBe(INSTANCE_A);
    } finally {
      ch.close();
    }
  });

  it('versión desconocida (v: 2) con un state por lo demás perfecto: se descarta, cuenta 1 y no mueve lastReceivedAt; de otra terminal no cuenta', async () => {
    let clock = 500;
    const r = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0, now: () => clock }));
    const got: DownMessage[] = [];
    r.onDown((m) => got.push(m));
    const ch = new BroadcastChannel(`pos-display:${TERMINAL}`);
    try {
      ch.postMessage({ ...raw.state(1, INSTANCE_A), v: 2 });
      ch.postMessage({ ...raw.state(2, INSTANCE_A), v: 2, terminalId: OTHER_TERMINAL });
      ch.postMessage({ ...raw.state(3, INSTANCE_A), v: '1' }); // no numérica: basura, no «otra versión»
      await flush(6);
      expect(got).toHaveLength(0);
      expect(r.incompatibleVersionCount).toBe(1);
      expect(r.incompatibleVersionAt).toBe(500);
      expect(r.lastReceivedAt).toBeNull();
      expect(r.activeInstanceId).toBeNull();

      clock = 900;
      ch.postMessage(raw.hello(1, INSTANCE_A));
      await flush();
      expect(r.lastReceivedAt).toBe(900);
      expect(r.incompatibleVersionCount).toBe(1);
    } finally {
      ch.close();
    }
  });

  it('rezagados tras un relevo: el state de la instancia anterior con seq mayor que el de la nueva se descarta', async () => {
    const r = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const got: DownMessage[] = [];
    r.onDown((m) => got.push(m));
    const ch = new BroadcastChannel(`pos-display:${TERMINAL}`);
    try {
      ch.postMessage(raw.hello(10, INSTANCE_A));
      ch.postMessage(raw.state(11, INSTANCE_A));
      ch.postMessage(raw.hello(1, INSTANCE_B)); // relevo (fuera de ventana: gana la última que saluda)
      ch.postMessage(raw.state(12, INSTANCE_A)); // rezagado de A
      ch.postMessage(raw.state(2, INSTANCE_B));
      ch.postMessage(raw.state(1, INSTANCE_B)); // viejo de B
      await flush(6);
      expect(got.map((m) => [m.t, m.instanceId, m.seq])).toEqual([
        ['hello', INSTANCE_A, 10],
        ['state', INSTANCE_A, 11],
        ['hello', INSTANCE_B, 1],
        ['state', INSTANCE_B, 2],
      ]);
      expect(r.activeInstanceId).toBe(INSTANCE_B);
      expect(r.lastSeq).toBe(2);
    } finally {
      ch.close();
    }
  });

  it('latido: llega cada segundo con `at` del reloj de la caja y refresca lastReceivedAt; tras stopHeartbeat no llega ninguno más', async () => {
    fakeTimers();
    let clock = 0;
    const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A, now: () => clock }));
    const r = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0, now: () => clock }));
    const beats: number[] = [];
    r.onDown((m) => {
      if (m.t === 'heartbeat') beats.push(m.at);
    });
    t.publish(HELLO);
    t.startHeartbeat();
    for (let i = 1; i <= 3; i += 1) {
      clock = i * 1000;
      jest.advanceTimersByTime(1000);
      await flush();
    }
    expect(beats).toEqual([1000, 2000, 3000]);
    expect(r.lastReceivedAt).toBe(3000);

    t.stopHeartbeat();
    clock = 6000;
    jest.advanceTimersByTime(3000);
    await flush();
    expect(beats).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Type guards: ida y vuelta por JSON de todos los tipos
// ---------------------------------------------------------------------------

describe('tester · type guards sobreviven a JSON en todos los tipos de mensaje', () => {
  it('los cuatro tipos de bajada y los seis de subida pasan el guard tras JSON.parse(JSON.stringify())', () => {
    const env = { v: PROTOCOL_VERSION, terminalId: TERMINAL, instanceId: INSTANCE_A };
    const downs: DownMessage[] = [
      { ...env, t: 'hello', seq: 0, organizationId: 1, cashier: null, sessionOpen: false },
      { ...env, t: 'state', seq: 1, state: IDLE },
      { ...env, t: 'heartbeat', seq: 2, at: 123 },
      { ...env, t: 'bye', seq: 3 },
    ];
    const upEnv = { v: PROTOCOL_VERSION, terminalId: TERMINAL };
    const ups: UpMessage[] = [
      { ...upEnv, t: 'need_snapshot', capabilities: CAPS },
      { ...upEnv, t: 'tip_selected', cartId: 'c', kind: 'percent', value: 10, toInstanceId: INSTANCE_A },
      { ...upEnv, t: 'qr_paid_claim', cartId: 'c' },
      { ...upEnv, t: 'rating', saleId: null, rating: 5 },
      { ...upEnv, t: 'display_alive', at: 1, capabilities: CAPS },
      { ...upEnv, t: 'display_bye' },
    ];
    for (const d of downs) {
      expect(isDownMessage(JSON.parse(JSON.stringify(d)))).toBe(true);
      expect(isUpMessage(JSON.parse(JSON.stringify(d)))).toBe(false);
    }
    for (const u of ups) {
      expect(isUpMessage(JSON.parse(JSON.stringify(u)))).toBe(true);
      expect(isDownMessage(JSON.parse(JSON.stringify(u)))).toBe(false);
    }
  });
});
