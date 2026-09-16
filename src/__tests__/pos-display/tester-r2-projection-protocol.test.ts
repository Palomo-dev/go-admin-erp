/**
 * TESTER ronda 2 — proyección y protocolo: extremo a extremo por el canal y
 * bordes numéricos que las suites del builder no tocan.
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import { isDownMessage, type DisplayState, type DownMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, BroadcastChannelTransport } from '@/lib/pos/display/transport';

const TS = '2026-09-15T15:00:00.000Z';
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE = '11111111-1111-4111-8111-111111111111';

function product(id: number, name: string): Product {
  return { id, organization_id: 1, sku: `SKU-${id}`, name, unit_code: 'UND', status: 'active', created_at: TS, updated_at: TS };
}
function item(over: Partial<CartItem> & { id: string; product_id: number }): CartItem {
  const quantity = over.quantity ?? 1;
  const unit_price = over.unit_price ?? 1000;
  return {
    cart_id: 'cart-1', product: product(over.product_id, `Producto ${over.product_id}`), quantity, unit_price,
    total: quantity * unit_price, discount_amount: 0, tax_amount: 0, tax_rate: 0, created_at: TS, updated_at: TS, ...over,
  };
}
function cart(over: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1', organization_id: 1, branch_id: 1, status: 'active', items: [],
    subtotal: 0, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 0,
    created_at: TS, updated_at: TS, ...over,
  };
}

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await flush(1);
  }
}
const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
});

describe('TESTER proyección: Σ líneas vs subtotal con cantidades fraccionarias', () => {
  /**
   * calculateCartTotals NO redondea el subtotal (reduce de qty × unit_price).
   * Corregido en ronda 3: projectLine tampoco redondea, así la suma de líneas
   * cuadra con el subtotal también con productos por peso (kg).
   */
  it('con 3 líneas de 0.3 × 3333.33 la suma de líneas cuadra con el subtotal de la caja (2999.997)', () => {
    const items = [1, 2, 3].map((i) => item({ id: `l${i}`, product_id: i, quantity: 0.3, unit_price: 3333.33 }));
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0); // igual que calculateCartTotals
    const out = projectCartForDisplay(cart({ items, subtotal, total: subtotal }), { currency: 'COP' });
    const sumLines = out.lines.reduce((s, l) => s + l.total, 0);
    expect(out.subtotal).toBeCloseTo(2999.997, 3);
    expect(sumLines).toBe(out.subtotal);
  });

  it('cantidad y precio como string (CartView hace parseFloat(item.unit_price)) se proyectan como número', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, quantity: '2' as unknown as number, unit_price: '1500.5' as unknown as number })] });
    const line = projectCartForDisplay(c, { currency: 'COP' }).lines[0];
    expect(line.qty).toBe(2);
    expect(line.unitPrice).toBe(1500.5);
    expect(line.total).toBe(3001);
  });

  it('booleanos en importes se coaccionan a 1/0 (Number(true) === 1): documentado, no se valida', () => {
    const c = cart({ items: [item({ id: 'l1', product_id: 1, discount_amount: true as unknown as number })] });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines[0].discount).toBe(1);
  });

  it('product.name no string → "" (mismo criterio que el nombre de un modificador: DisplayLine.name siempre es string)', () => {
    const broken = item({ id: 'l1', product_id: 1 });
    (broken.product as unknown as { name: unknown }).name = 42;
    const out = projectCartForDisplay(cart({ items: [broken] }), { currency: 'COP' });
    expect(out.lines[0].name).toBe('');
  });

  it('tax_included truthy no booleano (1, "true") cuenta como incluido, igual que calculateCartTotals (items.some truthy)', () => {
    // posService.ts:2407 usa `item.tax_included` truthy; la proyección aplica la misma regla (ronda 3).
    const c = cart({ items: [item({ id: 'l1', product_id: 1, tax_included: 1 as unknown as boolean })] });
    expect(projectCartForDisplay(c, { currency: 'COP' }).taxIncluded).toBe(true);
    const c2 = cart({ items: [item({ id: 'l1', product_id: 1, tax_included: 'true' as unknown as boolean })] });
    expect(projectCartForDisplay(c2, { currency: 'COP' }).taxIncluded).toBe(true);
  });
});

describe('TESTER extremo a extremo: proyección → transporte → pantalla', () => {
  it('un carrito de 200 líneas con modificadores y notas cruza el canal intacto y pasa el guard', async () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({
        id: `l${i}`, product_id: 1000 + i, quantity: (i % 4) + 1, unit_price: 2500 + i, discount_amount: i % 7 === 0 ? 100 : 0,
        notes: i % 11 === 0 ? `nota ${i}` : undefined, tax_included: i % 2 === 0,
        modifiers: i % 3 === 0 ? [{ groupId: 1, groupName: 'Extra', modifierId: i, name: `Extra ${i}`, extraPrice: 500 }] : undefined,
      }),
    );
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    const c = cart({ items, subtotal, total: subtotal });
    const projected = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l199' });
    const state: DisplayState = { mode: 'order', cart: projected, payment: null, tip: null, thanks: null };

    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    cashier.publish({ t: 'state', state });
    await waitFor(() => got.length === 1);
    const msg = got[0];
    expect(msg.t).toBe('state');
    if (msg.t !== 'state') return;
    expect(msg.state.cart).toEqual(projected);
    expect(msg.state.cart?.lines).toHaveLength(200);
    expect(msg.state.cart?.taxIncluded).toBe(true);
    expect(msg.state.cart?.lastChangedLineId).toBe('l199');
  });

  it('un state de cobro en efectivo con cambio cruza el canal y conserva el discriminante del método', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.publish({
      t: 'state',
      state: { mode: 'payment', cart: null, payment: { method: 'cash', total: 20250, received: 50000, change: 29750 }, tip: null, thanks: null },
    });
    await waitFor(() => got.length === 1);
    const m = got[0];
    expect(m.t === 'state' && m.state.payment?.method === 'cash' && m.state.payment.change).toBe(29750);
  });

  it('un DownMessage no clonable (con función) no hace lanzar a publish: se avisa y el flujo de venta sigue', () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const poison = { t: 'heartbeat', at: 1, fn: () => undefined } as unknown as Parameters<typeof cashier.publish>[0];
    // structuredClone rechaza funciones: publish captura el DataCloneError (ronda 3); el seq consumido queda como hueco inocuo.
    expect(() => cashier.publish(poison)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    expect(cashier.lastSeq).toBe(1);
    warnSpy.mockRestore();
  });
});

describe('TESTER protocolo: lo que el guard deja pasar y la UI debe tolerar', () => {
  const base = { v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, t: 'state' } as const;
  const empty: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };

  it('mode=thanks con thanks={} (sin total) NO pasa el guard: thanks.total debe ser número finito (ronda 3)', () => {
    expect(isDownMessage({ ...base, state: { ...empty, mode: 'thanks', thanks: {} } })).toBe(false);
    expect(isDownMessage({ ...base, state: { ...empty, mode: 'thanks', thanks: { total: 1000 } } })).toBe(true);
  });

  it('mode=tip con tip={} (sin presets) NO pasa el guard: tip.presets debe ser array (ronda 3)', () => {
    expect(isDownMessage({ ...base, state: { ...empty, mode: 'tip', tip: {} } })).toBe(false);
    expect(isDownMessage({ ...base, state: { ...empty, mode: 'tip', tip: { presets: [] } } })).toBe(true);
  });

  it('cart con lines=[{}] (línea sin id/name/qty) pasa el guard: la Parte C debe defenderse', () => {
    expect(isDownMessage({ ...base, state: { ...empty, mode: 'order', cart: { lines: [{}] } } })).toBe(true);
  });

  it('payment.method=cash sin total ni received pasa el guard', () => {
    expect(isDownMessage({ ...base, state: { ...empty, mode: 'payment', payment: { method: 'cash' } } })).toBe(true);
  });

  it('mode=order con cart=null (incoherente) pasa el guard: la Parte C debe caer a Reposo', () => {
    expect(isDownMessage({ ...base, state: { ...empty, mode: 'order', cart: null } })).toBe(true);
  });

  it('instanceId acepta cualquier string no vacío (no se exige UUID): "x" pasa', () => {
    expect(isDownMessage({ ...base, instanceId: 'x', state: empty })).toBe(true);
  });

  it('un objeto con getters que lanzan no pasa sin lanzar (el guard no captura excepciones)', () => {
    const trap = { v: 1, t: 'bye', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE };
    Object.defineProperty(trap, 'seq', {
      get() {
        throw new Error('getter hostil');
      },
      enumerable: true,
    });
    // Documenta: el guard propaga. Por BroadcastChannel llega siempre un clon estructurado sin getters, así que no aplica en producción.
    expect(() => isDownMessage(trap)).toThrow('getter hostil');
  });
});
