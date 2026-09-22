/**
 * Tester · ronda 12 · Parte B (emisión desde posService y CheckoutDialog).
 *
 * Sondas sobre la lista de feedback de la ronda 3 (override obsoleto, lista
 * blanca active/hold, «Gracias» con el total de la factura, interruptor
 * releído en cada publicación) desde ángulos que las pruebas del builder no
 * recorren:
 *
 * - El override de TaxSummary frente a las mutaciones REALES de POSService
 *   (cantidad, quitar línea, línea gratis) y frente al orden real de avisos
 *   de la página (optimista → TaxSummary → posService).
 * - La lista blanca con un estado desconocido (prueba que es blanca, no negra).
 * - El temporizador de «Gracias» venciendo con el interruptor ya apagado.
 * - `isEnabled` que lanza: la caja no rompe y no publica.
 * - Mutaciones mientras la caja está parada (otra página usa posService) y
 *   lo que sale en el primer saludo al volver.
 *
 * Ningún test aquí falla a propósito: todos afirman el comportamiento correcto.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { PROTOCOL_VERSION, isDownMessage, type DisplayState, type DownMessageDraft, type UpMessage } from '@/lib/pos/display/protocol';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';

// ---------------------------------------------------------------------------
// Transporte falso y emisor compartido (posService lo obtiene por
// getPosDisplayEmitter, mockeado abajo)
// ---------------------------------------------------------------------------

class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  closed = false;
  heartbeatStarted = 0;
  heartbeatStopped = 0;
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
  get states(): DisplayState[] {
    return this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state').map((m) => m.state);
  }
  get lastState(): DisplayState {
    const s = this.states;
    if (s.length === 0) throw new Error('sin state emitido');
    return s[s.length - 1];
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

const sched = manualScheduler();
const transports: FakeTransport[] = [];
let enabled: () => boolean = () => true;
const emitter = new DisplayEmitter({
  createTransport: () => {
    const t = new FakeTransport();
    transports.push(t);
    return t;
  },
  isEnabled: () => enabled(),
  schedule: sched.schedule,
  thanksDurationMs: 60000,
});

// ---------------------------------------------------------------------------
// Mocks de las dependencias de posService (mismo patrón que la ronda 11)
// ---------------------------------------------------------------------------

jest.mock('@/lib/pos/display/posDisplay', () => ({
  getPosDisplayEmitter: () => emitter,
}));

const ORG = 120;
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => ORG,
  getCurrentBranchId: () => 1,
  getCurrentBranchIdWithFallback: async () => 1,
  getCurrentUserId: async () => 'user-1',
}));

function chain(): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'single' || prop === 'maybeSingle') return async () => ({ data: null, error: null });
      if (prop === 'getPublicUrl') return () => ({ data: { publicUrl: '' } });
      return () => proxy;
    },
  });
  return proxy;
}
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => chain(),
    storage: { from: () => chain() },
    auth: { getSession: async () => ({ data: { session: null } }) },
    rpc: async () => ({ data: null, error: null }),
  },
}));
jest.mock('@/lib/utils/invoiceUtils', () => ({ generateInvoiceNumber: async () => 'FACT-1' }));
jest.mock('@/lib/utils/taxCalculations', () => ({
  calculateCartTaxesComplete: async () => ({ subtotal: 0, totalTaxAmount: 0, finalTotal: 0, taxBreakdown: [] }),
  getTaxIncludedSetting: async () => false,
  formatTaxCalculationForLog: () => '',
}));
jest.mock('@/lib/services/creditNoteNumberService', () => ({ CreditNoteNumberService: {} }));
jest.mock('@/lib/services/stockMovementService', () => ({ stockMovementService: {} }));
jest.mock('@/lib/services/serialTrackingService', () => ({ serialTrackingService: {} }));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: async () => ({ discountTotal: 0, itemDiscounts: {} }) },
}));
jest.mock('@/lib/offline/salesOutbox', () => ({
  enqueueOfflineSale: async () => {
    throw new Error('no en este test');
  },
  shouldCheckoutOffline: () => false,
}));
jest.mock('@/lib/offline/posOfflineReads', () => ({ posOfflineReads: {} }));
jest.mock('@/lib/utils/desktop', () => ({ isDesktop: () => false }));
jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: () => true }));

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-require-imports -- tras los jest.mock, para que los tome
const { POSService } = require('@/lib/services/posService') as typeof import('@/lib/services/posService');

type PosInternals = {
  getProductPrice: (productId: number) => Promise<number>;
  getProductTaxes: (productId: number) => Promise<unknown[]>;
};
const internals = POSService as unknown as PosInternals;
/** Producto 1: 5.000; producto 9: gratis (0). IVA 19 % no incluido en todos. */
jest.spyOn(internals, 'getProductPrice').mockImplementation(async (id) => (id === 9 ? 0 : 5000));
jest.spyOn(internals, 'getProductTaxes').mockImplementation(async () => [
  { product_id: 1, tax_id: 't1', organization_taxes: { id: 't1', name: 'IVA', rate: 19, is_active: true } },
]);

function product(id = 1, name = 'Café'): Product {
  return { id, name, sku: `SKU-${id}` } as unknown as Product;
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
    organization_id: ORG,
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

const START = { organizationId: ORG, currency: 'COP' };
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

let consoleSpies: jest.SpyInstance[] = [];

beforeEach(() => {
  store.clear();
  transports.length = 0;
  enabled = () => true;
  consoleSpies = [
    jest.spyOn(console, 'log').mockImplementation(() => undefined),
    jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    jest.spyOn(console, 'error').mockImplementation(() => undefined),
  ];
});

afterEach(() => {
  emitter.stop();
  emitter.setActiveCart(null);
  emitter.setTotals('x', null);
  sched.flush();
  for (const spy of consoleSpies) spy.mockRestore();
});

const transport = () => transports[transports.length - 1];

/** Envuelve un draft como lo haría el transporte real para validarlo con el guard del receptor. */
function envelope(draft: DownMessageDraft, seq: number): unknown {
  return { ...draft, v: PROTOCOL_VERSION, seq, terminalId: TERMINAL, instanceId: INSTANCE };
}

// ---------------------------------------------------------------------------
// 1. [qa 1] Override de totales frente a mutaciones REALES de POSService
// ---------------------------------------------------------------------------

describe('Parte B · r12 · override de TaxSummary contra POSService real', () => {
  async function cartWithTwoLines(): Promise<Cart> {
    const created = await POSService.createCart(1);
    emitter.setActiveCart(created);
    await POSService.addItemToCart(created.id, product(1, 'Café'));
    const c = await POSService.addItemToCart(created.id, product(2, 'Croissant'));
    sched.flush();
    return c;
  }

  it('cambiar la cantidad por POSService.updateCartItemQuantity caduca el override: el frame lleva el total del Cart recalculado, nunca el del recibo anterior', async () => {
    emitter.start(START);
    const c = await cartWithTwoLines();
    // TaxSummary del recibo: 10.000 + 19 % = 11.900
    emitter.setTotals(c.id, { discountTotal: 0, taxTotal: 1900, total: 11900 });
    sched.flush();
    expect(transport().lastState.cart?.total).toBe(11900);

    const updated = await POSService.updateCartItemQuantity(c.id, c.items[0].id, 3);
    sched.flush();
    const shown = transport().lastState.cart;
    expect(shown?.lines[0].qty).toBe(3);
    expect(shown?.subtotal).toBe(20000);
    expect(shown?.total).toBe(updated.total); // lo que calculó posService para ESTAS líneas
    expect(shown?.total).not.toBe(11900);
    // Cuando TaxSummary reenvía para las líneas nuevas, se aplica.
    emitter.setTotals(c.id, { discountTotal: 0, taxTotal: 3800, total: 23800 });
    sched.flush();
    expect(transport().lastState.cart?.total).toBe(23800);
  });

  it('quitar una línea por POSService.removeItemFromCart caduca el override (menos líneas nunca puede costar lo mismo)', async () => {
    emitter.start(START);
    const c = await cartWithTwoLines();
    emitter.setTotals(c.id, { discountTotal: 0, taxTotal: 1900, total: 11900 });
    sched.flush();
    const updated = await POSService.removeItemFromCart(c.id, c.items[1].id);
    sched.flush();
    const shown = transport().lastState.cart;
    expect(shown?.lines).toHaveLength(1);
    expect(shown?.total).toBe(updated.total);
    expect(shown?.total).not.toBe(11900);
    expect(shown?.total).toBeLessThan(11900);
  });

  it('línea GRATIS (precio 0) añadida: el override caduca y, cuando TaxSummary reenvía los MISMOS importes, vuelven a aplicarse (el atajo «same» no los traga)', async () => {
    emitter.start(START);
    const c = await cartWithTwoLines();
    emitter.setTotals(c.id, { discountTotal: 0, taxTotal: 1900, total: 11900 });
    sched.flush();
    await POSService.addItemToCart(c.id, product(9, 'Vaso de agua'));
    sched.flush();
    const between = transport().lastState.cart;
    expect(between?.lines).toHaveLength(3);
    // Sin override: total del Cart (posService recalcula con impuestos por producto mockeados: 10.000 + 19 %).
    expect(between?.total).toBe(11900);
    // TaxSummary reenvía exactamente lo mismo (la línea gratis no cambia el recibo).
    emitter.setTotals(c.id, { discountTotal: 0, taxTotal: 1900, total: 11900 });
    sched.flush();
    const after = transport().lastState.cart;
    expect(after?.lines).toHaveLength(3);
    expect(after?.total).toBe(11900);
    expect(after?.taxTotal).toBe(1900);
  });

  it('orden real de la página al alternar «impuesto incluido» por línea: optimista (setActiveCart) → TaxSummary (setTotals) → posService (onCartsSaved con las mismas líneas): el override del recibo sobrevive', async () => {
    emitter.start(START);
    const c = await cartWithTwoLines();
    // CartView.handleToggleItemTaxIncluded: primero onCartUpdate({...cart, items con tax_included}), luego posService.
    const optimistic: Cart = { ...c, items: c.items.map((i, idx) => (idx === 0 ? { ...i, tax_included: true } : i)) };
    emitter.setActiveCart(optimistic);
    emitter.setTotals(c.id, { discountTotal: 0, taxTotal: 1698.32, total: 10798.32 }); // TaxSummary con la línea 1 con IVA incluido
    const persisted = await POSService.updateItemTaxIncluded(c.id, c.items[0].id, true);
    sched.flush();
    const shown = transport().lastState.cart;
    expect(persisted.items[0].tax_included).toBe(true);
    expect(shown?.lines[0].taxIncluded).toBe(true);
    expect(shown?.total).toBe(10798.32);
    expect(shown?.taxTotal).toBe(1698.32);
  });

  it('con 200 líneas reales el override aplica y la línea 201 lo caduca', async () => {
    emitter.start(START);
    const created = await POSService.createCart(1);
    emitter.setActiveCart(created);
    let c = created;
    for (let i = 0; i < 200; i += 1) c = await POSService.addItemToCart(created.id, product(1000 + i, `P${i}`));
    sched.flush();
    emitter.setTotals(c.id, { discountTotal: 0, taxTotal: 1, total: 1000001 });
    sched.flush();
    expect(transport().lastState.cart?.lines).toHaveLength(200);
    expect(transport().lastState.cart?.total).toBe(1000001);
    c = await POSService.addItemToCart(created.id, product(5000, 'P200'));
    sched.flush();
    expect(transport().lastState.cart?.lines).toHaveLength(201);
    expect(transport().lastState.cart?.total).toBe(c.total);
    expect(transport().lastState.cart?.total).not.toBe(1000001);
  });
});

// ---------------------------------------------------------------------------
// 2. [qa 2] Lista blanca: es blanca, no negra
// ---------------------------------------------------------------------------

describe('Parte B · r12 · lista blanca de estados proyectables', () => {
  it('un estado DESCONOCIDO (futuro) con líneas no se proyecta: reposo con cart null; active y hold sí', () => {
    emitter.start(START);
    const t = transport();
    const lines = [item({ id: 'l1' })];
    emitter.setActiveCart(cart({ id: 'c-x', status: 'estado_futuro' as Cart['status'], items: lines, subtotal: 5000, total: 5000 }));
    sched.flush();
    expect(t.lastState).toMatchObject({ mode: 'idle', cart: null });
    emitter.setActiveCart(cart({ id: 'c-h', status: 'hold', items: lines, subtotal: 5000, total: 5000 }));
    sched.flush();
    expect(t.lastState.mode).toBe('order');
    emitter.setActiveCart(cart({ id: 'c-a', status: 'active', items: lines, subtotal: 5000, total: 5000 }));
    sched.flush();
    expect(t.lastState.mode).toBe('order');
  });

  it('el override de totales de un carrito que pasa a cancelled se descarta; el siguiente carrito no hereda nada', () => {
    emitter.start(START);
    const t = transport();
    const a = cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5000 });
    emitter.setActiveCart(a);
    emitter.setTotals('A', { discountTotal: 0, taxTotal: 950, total: 5950 });
    sched.flush();
    expect(t.lastState.cart?.total).toBe(5950);
    emitter.onCartsSaved([{ ...a, status: 'cancelled' }]);
    sched.flush();
    expect(t.lastState).toMatchObject({ mode: 'idle', cart: null });
    // Vuelve el mismo id como activo (la página lo mantuvo como pestaña) y luego se reactiva: sin override.
    emitter.onCartsSaved([{ ...a, status: 'active', items: [item({ id: 'a1' }), item({ id: 'a2', product_id: 2 })], subtotal: 10000, total: 10000 }]);
    sched.flush();
    expect(t.lastState.mode).toBe('order');
    expect(t.lastState.cart?.total).toBe(10000);
  });

  it('un cobro abierto sobre un carrito que pasa a hold_with_debt (guardar con deuda desde el modal) se descarta: nunca un «Cobro» sobre una venta ya facturada', () => {
    emitter.start(START);
    const t = transport();
    const a = cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5000 });
    emitter.setActiveCart(a);
    emitter.setPayment({ method: 'cash', total: 5000, received: null, change: null });
    sched.flush();
    expect(t.lastState.mode).toBe('payment');
    emitter.onCartsSaved([{ ...a, status: 'hold_with_debt' }]);
    emitter.setMode('thanks', { total: 5000 });
    sched.flush();
    expect(t.lastState.mode).toBe('thanks');
    expect(t.lastState.payment).toBeNull();
    // Sin setMode (por si CartView no llegara a llamarlo): tampoco queda un cobro colgado.
    emitter.setMode('order');
    sched.flush();
    expect(t.lastState).toMatchObject({ mode: 'idle', cart: null, payment: null });
  });
});

// ---------------------------------------------------------------------------
// 3. [T2] «Gracias» con el total de la factura (Number() sobre numeric de la BD)
// ---------------------------------------------------------------------------

describe('Parte B · r12 · «Gracias» con el total de la factura', () => {
  /** La expresión exacta de CartView.tsx: `Number(result.invoice.total) || cart.total`. */
  const thanksTotal = (invoiceTotal: unknown, cartTotal: number) => Number(invoiceTotal) || cartTotal;

  it('numeric como string ("11900.00") → 11900; null/undefined/NaN/"" → total del carrito; 0 legítimo cae al carrito (documentado)', () => {
    expect(thanksTotal('11900.00', 5000)).toBe(11900);
    expect(thanksTotal(11900, 5000)).toBe(11900);
    expect(thanksTotal(null, 5000)).toBe(5000);
    expect(thanksTotal(undefined, 5000)).toBe(5000);
    expect(thanksTotal('abc', 5000)).toBe(5000);
    expect(thanksTotal('', 5000)).toBe(5000);
    expect(thanksTotal(0, 5000)).toBe(5000); // factura de 0: se muestra el total proyectado (caso teórico)
  });

  it('el emisor muestra en «Gracias» exactamente ese total aunque el carrito proyectado tenga otro (excluir impuesto / override de organization_taxes)', () => {
    emitter.start(START);
    const t = transport();
    const a = cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5950 });
    emitter.setActiveCart(a);
    sched.flush();
    emitter.onCartsSaved([{ ...a, status: 'hold_with_debt' }]);
    emitter.setMode('thanks', { total: thanksTotal('5000.00', a.total) });
    sched.flush();
    expect(t.lastState.mode).toBe('thanks');
    expect(t.lastState.thanks?.total).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// 4. [T3] Interruptor releído en cada publicación: caminos que no pasan por setCart
// ---------------------------------------------------------------------------

describe('Parte B · r12 · interruptor maestro releído', () => {
  it('el temporizador de «Gracias» vence con el interruptor YA apagado: no publica, cierra el transporte y para el latido; al reencender el saludo es reposo, no «Gracias»', () => {
    jest.useFakeTimers();
    try {
      let on = true;
      enabled = () => on;
      emitter.start(START);
      const t = transport();
      emitter.setActiveCart(cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5000 }));
      sched.flush();
      emitter.setMode('thanks', { total: 5000 });
      sched.flush();
      expect(t.lastState.mode).toBe('thanks');
      const before = t.published.length;
      on = false; // clearCustomerDisplaySettingsCache() sin refresh()
      jest.advanceTimersByTime(60000);
      sched.flush();
      expect(t.published).toHaveLength(before);
      expect(t.closed).toBe(true);
      expect(t.heartbeatStopped).toBe(1);
      expect(emitter.isEmitting).toBe(false);
      on = true;
      emitter.refresh();
      expect(transports).toHaveLength(2);
      expect(transport().lastState.mode).toBe('order'); // el carrito sigue vivo; «Gracias» ya venció
      expect(transport().lastState.thanks).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('isEnabled que LANZA en plena venta: la caja no rompe, no publica, y cuando deja de lanzar vuelve a emitir sin transporte duplicado', () => {
    emitter.start(START);
    const t = transport();
    const before = t.published.length;
    enabled = () => {
      throw new Error('storage bloqueado');
    };
    expect(() => {
      emitter.setActiveCart(cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5000 }));
      sched.flush();
      emitter.reannounce();
      t.emitUp({ v: PROTOCOL_VERSION, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: false, width: 1, height: 1 } });
      emitter.refresh();
    }).not.toThrow();
    expect(t.published).toHaveLength(before);
    enabled = () => true;
    emitter.reannounce();
    expect(transports).toHaveLength(1);
    expect(t.published.length).toBeGreaterThan(before);
    expect(t.lastState.mode).toBe('order');
  });

  it('apagar mientras hay un cobro abierto y reencender: el saludo lleva el cobro vivo (setPayment se conserva) y pasa el guard del receptor', () => {
    let on = true;
    enabled = () => on;
    emitter.start(START);
    emitter.setActiveCart(cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5000 }));
    emitter.setPayment({ method: 'qr', total: 5000, provider: 'Nequi', qr: null, expiresAt: null });
    sched.flush();
    on = false;
    emitter.setPayment({ method: 'qr', total: 5000, provider: 'Bre-B', qr: null, expiresAt: null });
    sched.flush();
    expect(transport().closed).toBe(true);
    on = true;
    emitter.refresh();
    const last = transport();
    expect(last.lastState.mode).toBe('payment');
    expect(last.lastState.payment).toMatchObject({ method: 'qr', provider: 'Bre-B' });
    last.published.forEach((draft, i) => expect(isDownMessage(envelope(draft, i))).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// 5. Caja parada: otra página usa posService (mesas) y luego se vuelve al POS
// ---------------------------------------------------------------------------

describe('Parte B · r12 · mutaciones con la caja parada', () => {
  it('stop() → posService añade líneas (otra página) → start() con la misma organización: el primer state lleva el carrito actualizado, no el de antes de parar', async () => {
    emitter.start(START);
    const created = await POSService.createCart(1);
    emitter.setActiveCart(created);
    await POSService.addItemToCart(created.id, product(1));
    sched.flush();
    expect(transport().lastState.cart?.lines).toHaveLength(1);
    emitter.stop();
    expect(transport().closed).toBe(true);
    const c = await POSService.addItemToCart(created.id, product(2));
    await POSService.addItemToCart(created.id, product(3));
    sched.flush(); // nada que publicar: sin transporte
    expect(transports).toHaveLength(1);
    emitter.start(START);
    expect(transports).toHaveLength(2);
    const first = transport().states[0];
    expect(first.mode).toBe('order');
    expect(first.cart?.lines).toHaveLength(3);
    expect(first.cart?.id).toBe(c.id);
  });

  it('stop() con un override vivo y el carrito COBRADO desde otra página (desaparece de pos_carts): al volver, reposo, sin override ni cobro', async () => {
    emitter.start(START);
    const created = await POSService.createCart(1);
    emitter.setActiveCart(created);
    const c = await POSService.addItemToCart(created.id, product(1));
    emitter.setTotals(c.id, { discountTotal: 0, taxTotal: 950, total: 5950 });
    emitter.setPayment({ method: 'card', total: 5950, provider: null });
    sched.flush();
    emitter.stop();
    // Cobro desde otra página: removeCart es privado; su efecto observable es una lista sin el carrito.
    localStorage.setItem(`pos_carts_${ORG}`, '[]');
    emitter.onCartsSaved([]);
    emitter.start(START);
    const first = transport().states[0];
    expect(first).toMatchObject({ mode: 'idle', cart: null, payment: null });
    // Un carrito nuevo con el MISMO id (imposible en producción, pero prueba que el override murió).
    emitter.setActiveCart(cart({ id: c.id, items: [item({ id: 'z' })], subtotal: 5000, total: 5000 }));
    sched.flush();
    expect(transport().lastState.cart?.total).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// 6. Cobro en efectivo con el carrito real: la cifra del cliente es la del cajero
// ---------------------------------------------------------------------------

describe('Parte B · r12 · cifras del cobro', () => {
  it('efectivo parcial y luego completo: total constante = total del carrito real; recibido y cambio siguen al cajero; thanks lleva el total cobrado', async () => {
    emitter.start(START);
    const created = await POSService.createCart(1);
    emitter.setActiveCart(created);
    const c = await POSService.addItemToCart(created.id, product(1), 2);
    sched.flush();
    const total = c.total;
    expect(total).toBeGreaterThan(0);
    // CheckoutDialog: abrir → recibido null; teclear 10.000 (< total) → change 0; teclear 20.000 → change.
    emitter.setPayment({ method: 'cash', total, received: null, change: null });
    sched.flush();
    expect(transport().lastState.payment).toEqual({ method: 'cash', total, received: null, change: null });
    emitter.setPayment({ method: 'cash', total, received: 10000, change: Math.max(0, 10000 - total) });
    sched.flush();
    expect(transport().lastState.payment).toMatchObject({ received: 10000, change: 0 });
    emitter.setPayment({ method: 'cash', total, received: 20000, change: Math.max(0, 20000 - total) });
    sched.flush();
    expect(transport().lastState.payment).toMatchObject({ received: 20000, change: 20000 - total });
    // Confirmar: posService quita el carrito y CheckoutDialog pide «Gracias» con cartTotal.
    localStorage.setItem(`pos_carts_${ORG}`, '[]');
    emitter.onCartsSaved([]);
    emitter.setMode('thanks', { total });
    sched.flush();
    expect(transport().lastState).toMatchObject({ mode: 'thanks', thanks: { total }, payment: null, cart: null });
  });

  it('el total del state en «Pedido» y el total del cobro son la misma cifra cuando no hay propina ni domicilio', async () => {
    emitter.start(START);
    const created = await POSService.createCart(1);
    emitter.setActiveCart(created);
    const c = await POSService.addItemToCart(created.id, product(1), 3);
    sched.flush();
    const shownOrder = transport().lastState.cart?.total;
    emitter.setPayment({ method: 'card', total: c.total, provider: null });
    sched.flush();
    expect(transport().lastState.payment?.total).toBe(shownOrder);
  });
});
