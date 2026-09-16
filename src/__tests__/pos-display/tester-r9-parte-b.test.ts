/**
 * Tester · ronda 9 · Parte B (emisión desde posService y CheckoutDialog).
 *
 * Casos que los tests del builder (emitter.test.ts, tester-r8-parte-b) no
 * cubren. Los defectos encontrados van como `it.failing` con el defecto
 * descrito en el propio test: la suite queda verde y al corregirlos el
 * builder los pasa a `it`.
 *
 * Los helpers (transporte falso, planificador manual, carrito) se copian de
 * emitter.test.ts a propósito: un test no importa de otro test.
 */

import type { Cart, CartItem } from '@/components/pos/types';
import { shouldHighlightLine } from '@/components/pos-display/logic';
import { DisplayEmitter, defaultScheduler } from '@/lib/pos/display/emitter';
import { resolveCashReceived, toDisplayPayment } from '@/lib/pos/display/payment';
import { PROTOCOL_VERSION, isDownMessage, type DisplayState, type DownMessageDraft, type UpMessage } from '@/lib/pos/display/protocol';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE = 'ffffffff-0000-4000-8000-000000000001';

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
  emitUp(msg: UpMessage): void {
    for (const handler of Array.from(this.handlers)) handler(msg);
  }
  get states(): DisplayState[] {
    return this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state').map((m) => m.state);
  }
  get hellos(): HelloDraft[] {
    return this.published.filter((m): m is HelloDraft => m.t === 'hello');
  }
  get lastState(): DisplayState {
    const states = this.states;
    if (states.length === 0) throw new Error('sin state emitido');
    return states[states.length - 1];
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

function harness(opts: { enabled?: boolean; thanksDurationMs?: number } = {}) {
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
    schedule: sched.schedule,
    thanksDurationMs: opts.thanksDurationMs,
  });
  return {
    emitter,
    enabled,
    flush: sched.flush,
    pending: () => sched.pending,
    transport: () => transports[transports.length - 1],
    transports,
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

/** Copia profunda: posService guarda en localStorage y la página recibe otro objeto con el mismo contenido. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const START = { organizationId: 120, currency: 'COP' };

// ---------------------------------------------------------------------------
// Resaltado de la línea que acaba de entrar (PLAN §4.1 «cada cambio se nota»)
// ---------------------------------------------------------------------------

describe('Parte B · resaltado con los dos caminos de aviso reales', () => {
  /**
   * Orden real en el navegador al agregar un producto:
   *   1. posService.addItemToCart → saveCartsToStorage → onCartsSaved(carts)   (síncrono)
   *   2. la promesa resuelve → page.updateCartInState → re-render → useEffect
   *      [activeCart] → setActiveCart(activeCart)                              (mismo frame)
   *   3. rAF → flush → UN state.
   * En el paso 2 el carrito es el mismo que en el 1 (otro objeto): el emisor
   * conserva lastChangedLineId cuando la proyección nueva es equivalente a la
   * anterior (sameLines) y solo lo limpia al publicar. Corregido en la ronda 3.
   */
  it('posService avisa la línea nueva y la página reenvía el mismo carrito en el mismo frame → el state conserva lastChangedLineId', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const one = cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 });
    h.emitter.setActiveCart(one);
    h.flush();

    const two = cart({ items: [item({ id: 'l1' }), item({ id: 'l2', product_id: 2 })], subtotal: 10000, total: 10000 });
    h.emitter.onCartsSaved([two]); // 1. posService
    h.emitter.setActiveCart(clone(two)); // 2. página, mismo frame
    h.flush(); // 3. rAF

    expect(t.lastState.cart?.lines.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(t.lastState.cart?.lastChangedLineId).toBe('l2');
  });

  it('en frames distintos la segunda emisión lleva lastChangedLineId null; el receptor (shouldHighlightLine) no corta el resaltado ya iniciado', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const one = cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 });
    h.emitter.setActiveCart(one);
    h.flush();

    const two = cart({ items: [item({ id: 'l1' }), item({ id: 'l2', product_id: 2 })], subtotal: 10000, total: 10000 });
    h.emitter.onCartsSaved([two]);
    h.flush();
    const first = t.lastState.cart;
    expect(first?.lastChangedLineId).toBe('l2');

    h.emitter.setActiveCart(clone(two));
    h.flush();
    const second = t.lastState.cart;
    // Documenta el comportamiento actual: se emite un segundo state solo por el resaltado.
    expect(second?.lastChangedLineId).toBeNull();
    expect(t.states).toHaveLength(4);
    // La Parte C solo resalta cuando el nuevo state señala una línea: el null no reinicia ni corta nada.
    expect(shouldHighlightLine(one ? first : null, second)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cambio de organización sin recargar
// ---------------------------------------------------------------------------

describe('Parte B · cambio de organización en caliente', () => {
  /**
   * page.tsx: el efecto de arranque depende de organization?.id; al cambiar,
   * stopPosDisplay() y startPosDisplay() con la nueva. stop() conserva el
   * carrito «por si se vuelve a arrancar» con la MISMA organización; start()
   * con OTRA lo olvida (carrito, totales, cobro, gracias). Corregido en la
   * ronda 3.
   */
  it('tras stop() y start() con OTRA organización, el primer state no lleva el carrito de la anterior', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ id: 'cart-org120', items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    h.emitter.stop();

    h.emitter.start({ organizationId: 121, currency: 'USD' });
    const t = h.transport();
    expect(t.hellos[t.hellos.length - 1].organizationId).toBe(121);
    expect(t.lastState.cart).toBeNull();
  });

  it('con la MISMA organización, stop() + start() recupera el carrito (comportamiento buscado por el builder)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    h.emitter.stop();
    h.emitter.start(START);
    expect(h.transport().lastState.mode).toBe('order');
  });
});

// ---------------------------------------------------------------------------
// CheckoutDialog: secuencias reales de setPayment
// ---------------------------------------------------------------------------

describe('Parte B · secuencias de setPayment que produce CheckoutDialog', () => {
  it('reapertura del cobro con touchedIds viejo: el primer render emite received null (sin entradas) y el segundo null en la misma vuelta → un solo state con received null', () => {
    // Render 1 al abrir: payments=[] (se vaciaron al cerrar) pero touchedIds aún con el id de la venta anterior.
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    const t = h.transport();
    const before = t.states.length;

    const staleTouched = new Set(['p-anterior']);
    h.emitter.setPayment(
      toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 5000, received: resolveCashReceived([], staleTouched), change: null }),
    );
    // Render 2: el efecto [open] vació touchedIds y addPayment pre-rellenó el efectivo con el total.
    h.emitter.setPayment(
      toDisplayPayment({
        methodCode: 'cash',
        methodName: 'Efectivo',
        total: 5000,
        received: resolveCashReceived([{ id: 'p1', method: 'cash', amount: 5000 }], new Set()),
        change: null,
      }),
    );
    h.flush();
    expect(t.states.length).toBe(before + 1);
    expect(t.lastState.payment).toEqual({ method: 'cash', total: 5000, received: null, change: null });
  });

  it('el «tocado» es por entrada: teclear el importe de la TARJETA no convierte en «recibido» el efectivo pre-rellenado que el cliente no ha entregado', () => {
    // Corregido en la ronda 3: payments = [card 10.000 tecleado, cash 10.250 pre-rellenado con `remaining`].
    const payments = [
      { id: 'p-card', method: 'card', amount: 10000 },
      { id: 'p-cash', method: 'cash', amount: 10250 },
    ];
    expect(resolveCashReceived(payments, new Set(['p-card']))).toBeNull();
    // Solo cuando el cajero teclea el efectivo real cuenta como recibido.
    expect(resolveCashReceived([payments[0], { ...payments[1], amount: 15000 }], new Set(['p-card', 'p-cash']))).toBe(15000);
  });

  it('efectivo parcial (recibido < total): la caja manda change 0, y así viaja; la pantalla lo mostrará como «Cambio $0»', () => {
    const p = toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 20250, received: 5000, change: Math.max(0, 5000 - 20250) });
    expect(p).toEqual({ method: 'cash', total: 20250, received: 5000, change: 0 });
  });

  it('el «último medio elegido» decide: efectivo + tarjeta añadida después → card, aunque el efectivo siga sin cobrarse', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'card', methodName: 'Tarjeta', total: 20250 }));
    h.flush();
    expect(h.transport().lastState.payment?.method).toBe('card');
  });

  it('cancelar el cobro tras teclear efectivo → setMode(order): cobro fuera y carrito visible sin resaltado fantasma', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 5000, received: 10000, change: 5000 }));
    h.flush();
    h.emitter.setMode('order');
    h.flush();
    const s = h.transport().lastState;
    expect(s.mode).toBe('order');
    expect(s.payment).toBeNull();
    expect(s.cart?.lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Flujo completo con varias pestañas (bar/restaurante)
// ---------------------------------------------------------------------------

describe('Parte B · «Gracias» con varias pestañas abiertas', () => {
  /**
   * handleCheckoutComplete en page.tsx activa updatedCarts[0] tras cobrar. Si
   * esa pestaña es un pedido en espera con líneas, antes setActiveCart cortaba
   * «Gracias» y el cliente que acababa de pagar veía el pedido de OTRO cliente
   * en el acto. Decisión de la ronda 3 (emitter.ts, «Modo resultante»): solo
   * una mutación real de líneas avisada por posService cierra «Gracias»;
   * cambiar de pestaña no. Al vencer los 8 s se proyecta la pestaña activa.
   */
  it('cobrar la pestaña A y que la página active la pestaña B (en espera, con líneas) mantiene «Gracias» hasta los 8 s y luego muestra B', () => {
    jest.useFakeTimers();
    try {
      const h = harness({ thanksDurationMs: 8000 });
      h.emitter.start(START);
      const a = cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5000 });
      const b = cart({ id: 'B', status: 'hold', items: [item({ id: 'b1', unit_price: 7000, total: 7000 })], subtotal: 7000, total: 7000 });
      h.emitter.setActiveCart(a);
      h.flush();
      h.emitter.onCartsSaved([b]); // removeCart(A) tras checkout
      h.emitter.setMode('thanks', { total: 5000 });
      h.flush();
      expect(h.transport().lastState.mode).toBe('thanks');
      h.emitter.setActiveCart(b); // la página activa updatedCarts[0]
      h.emitter.onCartsSaved([b]); // activateCart escribe la lista completa sin cambios de líneas
      h.flush();
      expect(h.transport().lastState.mode).toBe('thanks');
      expect(h.transport().lastState.thanks).toEqual({ total: 5000, askRating: false });
      jest.advanceTimersByTime(8000);
      h.flush();
      expect(h.transport().lastState.mode).toBe('order');
      expect(h.transport().lastState.cart?.id).toBe('B');
    } finally {
      jest.useRealTimers();
    }
  });

  it('durante «Gracias», una línea nueva en la pestaña activa (mutación real vía posService) sí cierra el agradecimiento: «siguiente venta»', () => {
    const h = harness({ thanksDurationMs: 8000 });
    h.emitter.start(START);
    const a = cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5000 });
    const b = cart({ id: 'B', status: 'hold', items: [item({ id: 'b1', unit_price: 7000, total: 7000 })], subtotal: 7000, total: 7000 });
    h.emitter.setActiveCart(a);
    h.flush();
    h.emitter.onCartsSaved([b]);
    h.emitter.setMode('thanks', { total: 5000 });
    h.flush();
    h.emitter.setActiveCart(b);
    h.flush();
    expect(h.transport().lastState.mode).toBe('thanks');
    const b2 = { ...b, items: [...b.items, item({ id: 'b2', product_id: 2 })], subtotal: 12000, total: 12000 };
    h.emitter.onCartsSaved([b2]); // addItemToCart → saveCartsToStorage
    h.flush();
    expect(h.transport().lastState.mode).toBe('order');
    expect(h.transport().lastState.cart?.lastChangedLineId).toBe('b2');
  });

  it('con una única pestaña, tras cobrar la página crea un carrito VACÍO: «Gracias» se mantiene los 8 s y luego reposo', () => {
    jest.useFakeTimers();
    try {
      const h = harness({ thanksDurationMs: 8000 });
      h.emitter.start(START);
      const a = cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5000 });
      h.emitter.setActiveCart(a);
      h.flush();
      h.emitter.onCartsSaved([]);
      h.emitter.setMode('thanks', { total: 5000 });
      h.flush();
      const nuevo = cart({ id: 'N' });
      h.emitter.onCartsSaved([nuevo]); // createCart → saveCartToStorage
      h.emitter.setActiveCart(nuevo);
      h.flush();
      expect(h.transport().lastState.mode).toBe('thanks');
      jest.advanceTimersByTime(7999);
      h.flush();
      expect(h.transport().lastState.mode).toBe('thanks');
      jest.advanceTimersByTime(1);
      h.flush();
      expect(h.transport().lastState.mode).toBe('idle');
      expect(h.transport().lastState.cart).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('guardar con deuda (hold_with_debt): posService guarda el carrito facturado, CartView pide «Gracias» y a los 8 s la pantalla pasa a reposo, nunca a «Pedido»', () => {
    // Decisión de la ronda 3: un carrito con deuda ya está facturado a crédito y no se proyecta como pedido pendiente.
    jest.useFakeTimers();
    try {
      const h = harness({ thanksDurationMs: 8000 });
      h.emitter.start(START);
      const a = cart({ id: 'A', items: [item({ id: 'a1' })], subtotal: 5000, total: 5000 });
      h.emitter.setActiveCart(a);
      h.flush();
      const conDeuda = { ...a, status: 'hold_with_debt', sale_id: 'sale-1', invoice_id: 'inv-1' } as Cart;
      h.emitter.onCartsSaved([conDeuda]); // holdCartWithDebt → saveCartsToStorage
      h.emitter.setMode('thanks', { total: a.total }); // CartView.handleHoldWithDebt
      h.emitter.setActiveCart(clone(conDeuda)); // onCartUpdate → efecto [activeCart]
      h.flush();
      expect(h.transport().lastState.mode).toBe('thanks');
      expect(h.transport().lastState.thanks).toEqual({ total: 5000, askRating: false });
      jest.advanceTimersByTime(8000);
      h.flush();
      expect(h.transport().lastState.mode).toBe('idle');
      expect(h.transport().lastState.cart).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Entradas hostiles por el canal de subida
// ---------------------------------------------------------------------------

describe('Parte B · subidas malformadas', () => {
  it('un mensaje de subida null/undefined/sin t no rompe la caja (handleUp captura y avisa)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const h = harness();
      h.emitter.start(START);
      const t = h.transport();
      const before = t.published.length;
      expect(() => t.emitUp(null as unknown as UpMessage)).not.toThrow();
      expect(() => t.emitUp(undefined as unknown as UpMessage)).not.toThrow();
      expect(() => t.emitUp({} as UpMessage)).not.toThrow();
      expect(() => t.emitUp({ v: 99, t: 'need_snapshot' } as unknown as UpMessage)).not.toThrow();
      // Los tres primeros no emiten; el cuarto (t correcto aunque v rara: el transporte real ya la filtró) responde.
      expect(t.published.length).toBe(before + 2);
    } finally {
      warn.mockRestore();
    }
  });

  it('need_snapshot repetido 50 veces seguidas responde 50 veces (la caja no limita; lo hace el receptor con su ventana de adopción)', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const before = t.published.length;
    for (let i = 0; i < 50; i += 1) {
      t.emitUp({ v: PROTOCOL_VERSION, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: false, width: 1, height: 1 } });
    }
    expect(t.published.length).toBe(before + 100);
  });
});

// ---------------------------------------------------------------------------
// Volumen: 200 líneas
// ---------------------------------------------------------------------------

describe('Parte B · 200 líneas', () => {
  it('200 mutaciones síncronas (una línea cada vez) → un solo state con 200 líneas, < 100 KB, válido para el receptor', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart()); // la página fija la pestaña (vacía): idéntico al idle ya emitido, no emite
    h.flush();
    const before = t.states.length;
    const items: CartItem[] = [];
    const started = Date.now();
    for (let i = 1; i <= 200; i += 1) {
      items.push(
        item({
          id: `l${i}`,
          product_id: i,
          product: { id: i, name: `Producto ${i}`, variant_data: { Talla: 'M' } } as unknown as CartItem['product'],
          modifiers: [{ groupId: 1, groupName: 'Extras', modifierId: i, name: 'Extra', extraPrice: 500 }],
          unit_price: 1000 + i,
          total: 1000 + i,
        }),
      );
      h.emitter.onCartsSaved([cart({ items: [...items], subtotal: items.reduce((s, x) => s + x.total, 0) })]);
    }
    h.flush();
    const elapsed = Date.now() - started;
    expect(t.states.length).toBe(before + 1);
    const last = t.lastState;
    expect(last.cart?.lines).toHaveLength(200);
    expect(last.cart?.lastChangedLineId).toBe('l200');
    const json = JSON.stringify({ v: PROTOCOL_VERSION, t: 'state', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, state: last });
    expect(json.length).toBeLessThan(100_000);
    expect(isDownMessage(JSON.parse(json))).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// Planificador por defecto en Node: coalescencia real sin planificador manual
// ---------------------------------------------------------------------------

describe('Parte B · defaultScheduler en Node coalesce setCart + setTotals + setPayment', () => {
  it('carrito, totales del recibo y cobro en la misma vuelta → un único state con las tres cosas', async () => {
    const transports: FakeTransport[] = [];
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      isEnabled: () => true,
      schedule: defaultScheduler(),
    });
    emitter.start(START);
    const t = transports[0];
    const before = t.states.length;
    const c = cart({ items: [item({ id: 'l1' })], subtotal: 5000, tax_total: 950, total: 5950 });
    emitter.setActiveCart(c);
    emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 800, total: 5800 });
    emitter.setPayment(toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 5800 }));
    await new Promise((r) => setTimeout(r, 5));
    expect(t.states.length).toBe(before + 1);
    const s = t.lastState;
    expect(s.mode).toBe('payment');
    expect(s.cart?.total).toBe(5800);
    expect(s.payment).toEqual({ method: 'qr', total: 5800, provider: 'Nequi', qr: null, expiresAt: null });
    emitter.stop();
  });
});
