/**
 * Tester · ronda 11 · Parte B (emisión desde posService y CheckoutDialog).
 *
 * Lo que ninguna ronda anterior había probado: el cableado REAL entre
 * `POSService` (la clase de producción, con `saveCartsToStorage` como único
 * punto de escritura de `pos_carts_<org>`) y el `DisplayEmitter`. Los tests
 * previos simulaban `onCartsSaved` a mano; aquí se importa el servicio de
 * verdad, se le mockean Supabase y los servicios externos, y se comprueba que
 * CADA mutación del carrito (crear, agregar, cantidad, cantidad 0, descuento,
 * descuento mayor que la línea, impuesto incluido, espera, activar, eliminar
 * línea) llega a la pantalla del cliente sin tocar cómo se guarda el carrito.
 *
 * Además: sondas de casos borde del emisor que no estaban cubiertas
 * (200 líneas por posService real, carrito de otra organización, el emisor
 * no muta el carrito guardado, setMode antes de que la página fije el
 * carrito).
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import type { DisplayState, DownMessageDraft, UpMessage } from '@/lib/pos/display/protocol';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';

// ---------------------------------------------------------------------------
// Transporte falso y emisor compartido (el que posService obtiene por
// getPosDisplayEmitter, mockeado abajo)
// ---------------------------------------------------------------------------

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
    return () => {
      this.handlers.delete(handler);
    };
  }
  startHeartbeat(): void {}
  stopHeartbeat(): void {}
  close(): void {
    this.closed = true;
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

const sched = (() => {
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
})();

const transports: FakeTransport[] = [];
let enabled = true;
const emitter = new DisplayEmitter({
  createTransport: () => {
    const t = new FakeTransport();
    transports.push(t);
    return t;
  },
  isEnabled: () => enabled,
  schedule: sched.schedule,
  thanksDurationMs: 60000,
});
let onCartsSavedSpy: jest.SpyInstance<void, [ReadonlyArray<Cart>]>;

// ---------------------------------------------------------------------------
// Mocks de las dependencias pesadas de posService
// ---------------------------------------------------------------------------

jest.mock('@/lib/pos/display/posDisplay', () => ({
  getPosDisplayEmitter: () => emitter,
}));

const ORG = 120;
let currentOrg = ORG;
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => currentOrg,
  getCurrentBranchId: () => 1,
  getCurrentBranchIdWithFallback: async () => 1,
  getCurrentUserId: async () => 'user-1',
}));

/** Cliente Supabase falso: cualquier cadena termina en { data: null, error: null }. */
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

// localStorage en Node (testEnvironment node no lo trae).
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

// Precio e impuestos del producto: sin red. Precio 5.000; IVA 19 % no incluido.
type PosInternals = {
  getProductPrice: (productId: number) => Promise<number>;
  getProductTaxes: (productId: number) => Promise<unknown[]>;
};
const internals = POSService as unknown as PosInternals;
jest.spyOn(internals, 'getProductPrice').mockImplementation(async () => 5000);
jest.spyOn(internals, 'getProductTaxes').mockImplementation(async () => [
  { product_id: 1, tax_id: 't1', organization_taxes: { id: 't1', name: 'IVA', rate: 19, is_active: true } },
]);

function product(id = 1, name = 'Café'): Product {
  return { id, name, sku: `SKU-${id}` } as unknown as Product;
}

function storedCarts(org = ORG): Cart[] {
  return JSON.parse(store.get(`pos_carts_${org}`) ?? '[]') as Cart[];
}

const START = { organizationId: ORG, currency: 'COP' };

let consoleSpies: jest.SpyInstance[] = [];

beforeEach(() => {
  store.clear();
  transports.length = 0;
  enabled = true;
  currentOrg = ORG;
  onCartsSavedSpy = jest.spyOn(emitter, 'onCartsSaved');
  consoleSpies = [
    jest.spyOn(console, 'log').mockImplementation(() => undefined),
    jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    jest.spyOn(console, 'error').mockImplementation(() => undefined),
  ];
});

afterEach(() => {
  emitter.stop();
  emitter.setActiveCart(null);
  sched.flush();
  onCartsSavedSpy.mockRestore();
  for (const spy of consoleSpies) spy.mockRestore();
});

const transport = () => transports[transports.length - 1];

// ---------------------------------------------------------------------------
// 1. Punto único: TODAS las mutaciones del POSService real llegan al emisor
// ---------------------------------------------------------------------------

describe('Parte B · cableado real POSService.saveCartsToStorage → emitter.onCartsSaved', () => {
  it('createCart avisa al emisor con la lista completa y sin cambiar cómo se guarda (pos_carts_<org> sigue siendo el JSON de siempre)', async () => {
    emitter.start(START);
    const cart = await POSService.createCart(1);
    expect(onCartsSavedSpy).toHaveBeenCalledTimes(1);
    expect(onCartsSavedSpy.mock.calls[0][0]).toEqual([cart]);
    expect(storedCarts()).toEqual([cart]);
    expect(store.has(`pos_carts_${ORG}`)).toBe(true);
  });

  it('camino feliz: crear → 3 agregar → cantidad → descuento → quitar; cada mutación avisa una vez y la pantalla refleja la última', async () => {
    emitter.start(START);
    const t = transport();
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    sched.flush();
    expect(t.lastState.mode).toBe('idle');

    await POSService.addItemToCart(cart.id, product(1, 'Café'), 2);
    await POSService.addItemToCart(cart.id, product(2, 'Croissant'), 1);
    await POSService.addItemToCart(cart.id, product(1, 'Café'), 1); // mismo producto → suma cantidad
    expect(onCartsSavedSpy).toHaveBeenCalledTimes(4); // create + 3
    // Tres mutaciones con awaits reales entre medias pero SIN frame: un solo state pendiente.
    expect(sched.pending).toBe(true);
    const before = t.states.length;
    sched.flush();
    expect(t.states.length).toBe(before + 1);
    let s = t.lastState;
    expect(s.mode).toBe('order');
    expect(s.cart?.lines).toHaveLength(2);
    expect(s.cart?.lines[0]).toMatchObject({ name: 'Café', qty: 3, unitPrice: 5000, total: 15000 });
    expect(s.cart?.lines[1]).toMatchObject({ name: 'Croissant', qty: 1, unitPrice: 5000, total: 5000 });
    // Σ líneas === subtotal; los totales sin override son los del Cart (calculateCartTotals).
    expect(s.cart?.subtotal).toBe(20000);
    expect(s.cart?.taxTotal).toBe(3800);
    expect(s.cart?.total).toBe(23800);
    // La cifra que viaja es EXACTAMENTE la que posService guardó.
    expect(s.cart?.total).toBe(storedCarts()[0].total);

    const lineId = storedCarts()[0].items[0].id;
    await POSService.updateCartItemQuantity(cart.id, lineId, 5);
    sched.flush();
    s = t.lastState;
    expect(s.cart?.lines[0]).toMatchObject({ qty: 5, total: 25000 });
    expect(s.cart?.lastChangedLineId).toBe(lineId);
    expect(s.cart?.total).toBe(storedCarts()[0].total);

    await POSService.updateCartItemDiscount(cart.id, lineId, 1000);
    sched.flush();
    s = t.lastState;
    expect(s.cart?.lines[0].discount).toBe(1000);
    expect(s.cart?.discountTotal).toBe(1000);
    expect(s.cart?.total).toBe(storedCarts()[0].total);

    await POSService.removeItemFromCart(cart.id, lineId);
    sched.flush();
    s = t.lastState;
    expect(s.cart?.lines).toHaveLength(1);
    expect(s.cart?.lines[0].name).toBe('Croissant');
    expect(s.cart?.lastChangedLineId).toBeNull(); // una línea eliminada no resalta nada
  });

  it('cantidad 0 elimina la línea (posService) y la pantalla la deja de mostrar; con la última línea fuera → reposo', async () => {
    emitter.start(START);
    const t = transport();
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1), 1);
    sched.flush();
    expect(t.lastState.mode).toBe('order');
    const lineId = storedCarts()[0].items[0].id;
    await POSService.updateCartItemQuantity(cart.id, lineId, 0);
    sched.flush();
    expect(t.lastState).toMatchObject({ mode: 'idle', cart: null });
    expect(storedCarts()[0].items).toHaveLength(0);
  });

  it('descuento mayor que la línea: posService lo recorta al máximo y la pantalla nunca muestra un total negativo', async () => {
    emitter.start(START);
    const t = transport();
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1), 2); // 10.000
    const lineId = storedCarts()[0].items[0].id;
    await POSService.updateCartItemDiscount(cart.id, lineId, 999999);
    sched.flush();
    const s = t.lastState;
    expect(s.cart?.lines[0].discount).toBe(10000);
    expect(s.cart?.discountTotal).toBe(10000);
    expect(s.cart?.total).toBe(0);
    expect(s.cart?.total).toBeGreaterThanOrEqual(0);
    expect(s.cart?.total).toBe(storedCarts()[0].total);
  });

  it('impuesto incluido vs excluido por línea (updateItemTaxIncluded): viaja la bandera y el total del Cart cambia como en la caja', async () => {
    emitter.start(START);
    const t = transport();
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1), 1); // 5.000 + 19 % = 5.950
    sched.flush();
    expect(t.lastState.cart?.lines[0].taxIncluded).toBe(false);
    expect(t.lastState.cart?.total).toBe(5950);
    const lineId = storedCarts()[0].items[0].id;
    await POSService.updateItemTaxIncluded(cart.id, lineId, true);
    sched.flush();
    expect(t.lastState.cart?.lines[0].taxIncluded).toBe(true);
    expect(t.lastState.cart?.taxIncluded).toBe(true);
    expect(t.lastState.cart?.total).toBe(5000); // el IVA ya va dentro del precio
    expect(t.lastState.cart?.total).toBe(storedCarts()[0].total);
  });

  it('modificadores sin precio y con precio: unit_price ya incluye el extra; los modificadores viajan como información', async () => {
    emitter.start(START);
    const t = transport();
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1), 1, [
      { modifierId: 'm1', name: 'Leche de almendras', extraPrice: 1500 } as unknown as CartItem['modifiers'] extends (infer M)[] | undefined ? M : never,
      { modifierId: 'm2', name: 'Sin azúcar' } as unknown as CartItem['modifiers'] extends (infer M)[] | undefined ? M : never,
    ]);
    sched.flush();
    const line = t.lastState.cart?.lines[0];
    expect(line?.unitPrice).toBe(6500);
    expect(line?.total).toBe(6500);
    expect(line?.modifiers).toEqual([
      { name: 'Leche de almendras', extraPrice: 1500 },
      { name: 'Sin azúcar', extraPrice: 0 },
    ]);
  });

  it('hold (en espera) y activateCart: el carrito en espera sigue proyectándose; activarlo lo mantiene; la lista completa viaja en cada aviso', async () => {
    emitter.start(START);
    const t = transport();
    const a = await POSService.createCart(1);
    const b = await POSService.createCart(1);
    emitter.setActiveCart(a);
    await POSService.addItemToCart(a.id, product(1), 1);
    sched.flush();
    expect(t.lastState.mode).toBe('order');
    await POSService.holdCart(a.id, 'cliente fue al cajero');
    sched.flush();
    expect(t.lastState.mode).toBe('order'); // hold = pedido vivo (lista blanca active/hold)
    expect(storedCarts().map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    await POSService.activateCart(a.id);
    sched.flush();
    expect(t.lastState.mode).toBe('order');
    // Mutar el carrito B (no activo) no cambia lo que ve el cliente.
    const before = t.states.length;
    await POSService.addItemToCart(b.id, product(2), 3);
    sched.flush();
    expect(t.states.length).toBe(before);
    expect(t.lastState.cart?.id).toBe(a.id);
  });

  it('el emisor NO muta el carrito que posService guarda: lo que hay en pos_carts_<org> tras proyectar es exactamente lo que devolvió posService', async () => {
    emitter.start(START);
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    const returned = await POSService.addItemToCart(cart.id, product(1), 2);
    sched.flush();
    const snapshotBefore = JSON.stringify(returned);
    emitter.setTotals(cart.id, { discountTotal: 0, taxTotal: 1, total: 2 });
    sched.flush();
    // Ni la proyección ni el override tocan el objeto guardado ni el JSON.
    expect(JSON.stringify(returned)).toBe(snapshotBefore);
    expect(JSON.stringify(storedCarts()[0])).toBe(snapshotBefore);
    expect(storedCarts()[0]).not.toHaveProperty('lines');
    expect(storedCarts()[0]).not.toHaveProperty('lastChangedLineId');
  });

  it('con el interruptor apagado la venta funciona igual (todas las mutaciones se guardan) y no sale NADA por el transporte', async () => {
    enabled = false;
    emitter.start(START);
    expect(transports).toHaveLength(0);
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1), 1);
    await POSService.updateCartItemQuantity(cart.id, storedCarts()[0].items[0].id, 4);
    sched.flush();
    expect(transports).toHaveLength(0);
    expect(sched.pending).toBe(false);
    expect(storedCarts()[0].items[0].quantity).toBe(4);
    expect(onCartsSavedSpy).toHaveBeenCalledTimes(3);
  });

  it('si el emisor lanza por dentro (onCartsSaved explota), la venta se guarda igual: la pantalla nunca rompe la caja', async () => {
    emitter.start(START);
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    onCartsSavedSpy.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    // saveCartsToStorage no envuelve la llamada: si el emisor lanzara de verdad,
    // addItemToCart rechazaría DESPUÉS de haber escrito localStorage. Se
    // comprueba que el carrito se guardó aunque la llamada lance, y que el
    // DisplayEmitter real (sin el mock) nunca lanza (todos sus puntos de
    // entrada están envueltos en try/catch).
    let threw = false;
    try {
      await POSService.addItemToCart(cart.id, product(1), 1);
    } catch {
      threw = true;
    }
    expect(storedCarts()[0].items).toHaveLength(1);
    expect(threw).toBe(true); // documenta: la excepción del emisor se propaga; por eso el emisor no lanza jamás
    // El emisor real, sin mock, con una lista corrupta no lanza.
    onCartsSavedSpy.mockRestore();
    expect(() => emitter.onCartsSaved(null as unknown as Cart[])).not.toThrow();
    expect(() => emitter.onCartsSaved([null as unknown as Cart])).not.toThrow();
  });

  it('200 líneas por posService real → un solo state coalescido con 200 líneas, Σ líneas === subtotal, mismo total que el Cart', async () => {
    emitter.start(START);
    const t = transport();
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    for (let i = 0; i < 200; i += 1) {
      await POSService.addItemToCart(cart.id, product(100 + i, `Producto ${i}`), (i % 4) + 1);
    }
    expect(onCartsSavedSpy).toHaveBeenCalledTimes(201);
    const before = t.states.length;
    sched.flush();
    expect(t.states.length).toBe(before + 1);
    const s = t.lastState;
    expect(s.cart?.lines).toHaveLength(200);
    const sum = s.cart!.lines.reduce((acc, l) => acc + l.total, 0);
    expect(sum).toBe(s.cart!.subtotal);
    expect(s.cart!.subtotal).toBe(storedCarts()[0].subtotal);
    expect(s.cart!.total).toBe(storedCarts()[0].total);
    // 200 mutaciones secuenciales: cada una cambia UNA línea respecto a la proyección anterior,
    // así que el state coalescido resalta la última que entró (la que el cajero acaba de teclear).
    expect(s.cart!.lastChangedLineId).toBe(storedCarts()[0].items[199].id);
    expect(JSON.stringify(s).length).toBeLessThan(120_000);
  });

  it('carrito de OTRA organización: cambiar de organización en caliente hace que posService escriba otra clave y el emisor arrancado con la nueva org no muestre el pedido viejo', async () => {
    emitter.start(START);
    const t = transport();
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1), 1);
    sched.flush();
    expect(t.lastState.mode).toBe('order');
    // Cambio de organización: la página para y vuelve a arrancar con la nueva.
    currentOrg = 121;
    emitter.stop();
    emitter.start({ organizationId: 121, currency: 'USD' });
    const t2 = transport();
    expect(t2.lastState).toMatchObject({ mode: 'idle', cart: null });
    // Las mutaciones de la org 121 van a su propia clave y el carrito de la 120 queda intacto.
    const other = await POSService.createCart(1);
    emitter.setActiveCart(other);
    await POSService.addItemToCart(other.id, product(9, 'Otro'), 1);
    sched.flush();
    expect(t2.lastState.cart?.currency).toBe('USD');
    expect(t2.lastState.cart?.lines[0].name).toBe('Otro');
    expect(storedCarts(120)[0].items).toHaveLength(1);
    expect(storedCarts(121)[0].items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Cobro real sobre el carrito de posService (la secuencia de CheckoutDialog)
// ---------------------------------------------------------------------------

describe('Parte B · cobro sobre un carrito real de posService', () => {
  it('efectivo en vivo: total del carrito real, recibido tecleado, cambio; el total que ve el cliente en «Cobro» coincide con el del carrito', async () => {
    emitter.start(START);
    const t = transport();
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    const saved = await POSService.addItemToCart(cart.id, product(1), 3); // 15.000 + 2.850 = 17.850
    sched.flush();
    const total = saved.total;
    expect(total).toBe(17850);
    emitter.setPayment({ method: 'cash', total, received: null, change: null });
    sched.flush();
    expect(t.lastState).toMatchObject({ mode: 'payment', payment: { method: 'cash', total, received: null, change: null } });
    expect(t.lastState.cart?.total).toBe(total);
    emitter.setPayment({ method: 'cash', total, received: 20000, change: 2150 });
    sched.flush();
    expect(t.lastState.payment).toEqual({ method: 'cash', total, received: 20000, change: 2150 });
    // Confirmar: posService elimina el carrito (removeCart → saveCartsToStorage sin él) y CheckoutDialog pide «Gracias».
    const internalsRemove = POSService as unknown as { removeCart: (id: string) => Promise<void> };
    await internalsRemove.removeCart(cart.id);
    emitter.setMode('thanks', { total });
    sched.flush();
    expect(t.lastState).toEqual({ mode: 'thanks', cart: null, payment: null, tip: null, thanks: { total, askRating: false } });
    expect(storedCarts()).toHaveLength(0);
    // Ningún frame «payment» con cart null se emitió.
    expect(t.states.some((s) => s.mode === 'payment' && s.cart === null)).toBe(false);
  });

  it('cancelar el cobro (setMode order) con el carrito real vivo vuelve a «Pedido» con las mismas líneas y total', async () => {
    emitter.start(START);
    const t = transport();
    const cart = await POSService.createCart(1);
    emitter.setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1), 1);
    sched.flush();
    const orderState = t.lastState;
    emitter.setPayment({ method: 'qr', total: 5950, provider: 'Nequi', qr: null, expiresAt: null });
    sched.flush();
    expect(t.lastState.mode).toBe('payment');
    emitter.setMode('order');
    sched.flush();
    expect(t.lastState.mode).toBe('order');
    expect(t.lastState.cart).toEqual({ ...orderState.cart, lastChangedLineId: null });
  });
});
