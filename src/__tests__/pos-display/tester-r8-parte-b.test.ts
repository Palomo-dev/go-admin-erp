/**
 * Tester · ronda 8 · Parte B (emisor desde posService y CheckoutDialog).
 *
 * Complementa emitter.test.ts del builder con lo que allí no se ejercita:
 * - coalescencia con el planificador REAL de Node (setTimeout 0), no manual;
 * - extremo a extremo con BroadcastChannel real: emisor → receptor de la
 *   Parte A, con need_snapshot de vuelta, terminal ajena y 200 líneas;
 * - flush pendiente cuando el interruptor se apaga, stop() con «Gracias»
 *   armado, doble start, sesión;
 * - casos límite del carrito a través del emisor (cantidad 0, descuento
 *   mayor que el subtotal, modificadores sin precio, impuesto incluido /
 *   excluido, líneas corruptas);
 * - mapeo de pagos con entradas raras (código vacío, mayúsculas, NaN).
 *
 * Los defectos documentados en la ronda 8 (bloque «defectos documentados»
 * y el de handleUp) se corrigieron en la ronda 9: sus `it.failing` pasaron a
 * `it` normales y ahora vigilan que no reincidan.
 */

import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter, THANKS_DURATION_MS } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  type DisplayState,
  type DownMessage,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  type DisplayTransport,
  type HelloDraft,
} from '@/lib/pos/display/transport';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const START = { organizationId: 120, currency: 'COP' };

const tick = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Espera (hasta `timeoutMs`) a que se cumpla la condición; evita ventanas fijas que fallan bajo carga (ronda 4: sin tick(n) fijos). */
async function until(done: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error('until: condición no cumplida a tiempo');
    await tick(5);
  }
}

/** Igual que `until`, sobre lo recibido por el receptor. */
async function untilReceived(received: DownMessage[], done: (ms: DownMessage[]) => boolean, timeoutMs = 2000): Promise<void> {
  await until(() => done(received), timeoutMs);
}

const lastState = (ms: DownMessage[]): DisplayState | null => {
  const last = ms.at(-1);
  return last && last.t === 'state' ? last.state : null;
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  closed = false;
  heartbeatStarted = 0;
  heartbeatStopped = 0;
  lastDisplaySeenAt: number | null = null;
  private handlers = new Set<(msg: UpMessage) => void>();
  publish(msg: DownMessageDraft): void {
    if (this.closed) throw new Error('publish tras close');
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
    for (const h of Array.from(this.handlers)) h(msg);
  }
  get types(): string[] {
    return this.published.map((m) => m.t);
  }
  get states(): DisplayState[] {
    return this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state').map((m) => m.state);
  }
  get lastState(): DisplayState {
    const s = this.states;
    if (s.length === 0) throw new Error('sin state');
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
    get pending() {
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

function needSnapshot(): UpMessage {
  return { v: PROTOCOL_VERSION, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: false, width: 1280, height: 800 } };
}

// ---------------------------------------------------------------------------
// Coalescencia con el planificador real (setTimeout 0 en Node)
// ---------------------------------------------------------------------------

describe('Parte B · coalescencia con el planificador por defecto', () => {
  it('N mutaciones síncronas → un solo state en la siguiente vuelta, con el último carrito', async () => {
    const transports: FakeTransport[] = [];
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      isEnabled: () => true,
    });
    emitter.start(START);
    const t = transports[0];
    const base = cart({ items: [item({ id: 'l1' })], total: 5000 });
    emitter.setActiveCart(base);
    for (let q = 2; q <= 20; q++) emitter.setCart({ ...base, items: [item({ id: 'l1', quantity: q })], total: 5000 * q });
    emitter.setPayment({ method: 'cash', total: 100000, received: null, change: null });
    expect(t.states).toHaveLength(1);
    await tick(0);
    expect(t.states).toHaveLength(2);
    expect(t.lastState.mode).toBe('payment');
    expect(t.lastState.cart?.lines[0].qty).toBe(20);
    await tick(5);
    expect(t.states).toHaveLength(2); // nada más pendiente
    emitter.stop();
  });

  it('dos vueltas distintas emiten dos states', async () => {
    const transports: FakeTransport[] = [];
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      isEnabled: () => true,
    });
    emitter.start(START);
    emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    await tick(0);
    emitter.setCart(cart({ items: [item({ id: 'l1', quantity: 2 })], total: 10000 }));
    await tick(0);
    expect(transports[0].states).toHaveLength(3);
    emitter.stop();
  });
});

// ---------------------------------------------------------------------------
// Interruptor, ciclo de vida
// ---------------------------------------------------------------------------

describe('Parte B · interruptor y ciclo de vida', () => {
  it('apagar el interruptor con un state pendiente no publica sobre el transporte cerrado', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    expect(h.pending()).toBe(true);
    h.enabled.value = false;
    h.emitter.refresh();
    expect(t.closed).toBe(true);
    expect(h.pending()).toBe(false);
    expect(() => h.flush()).not.toThrow();
    expect(t.states).toHaveLength(1);
  });

  it('stop() con «Gracias» armado: el temporizador no publica nada después; el siguiente start saluda sin thanks', async () => {
    const h = harness({ thanksDurationMs: 15 });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    h.emitter.setMode('thanks', { total: 5000 });
    h.flush();
    const first = h.transport();
    expect(first.lastState.mode).toBe('thanks');
    h.emitter.stop();
    // Aserción negativa (stop canceló el temporizador de 15 ms): se deja pasar
    // holgadamente su plazo; una espera más larga solo la hace más estricta.
    await tick(15 * 4);
    expect(h.pending()).toBe(false);
    h.emitter.start(START);
    const second = h.transport();
    expect(second).not.toBe(first);
    expect(second.types).toEqual(['hello', 'state']);
    expect(second.lastState.mode).toBe('order'); // el carrito se conserva; thanks se olvidó
    expect(second.lastState.thanks).toBeNull();
  });

  it('start() con transporte abierto vuelve a saludar con la moneda nueva sin abrir otro transporte', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    h.emitter.start({ organizationId: 120, currency: 'USD' });
    expect(h.transports).toHaveLength(1);
    const t = h.transport();
    expect(t.types.slice(-2)).toEqual(['hello', 'state']);
    expect(t.lastState.cart?.currency).toBe('USD');
  });

  it('cambiar de organización en start() cambia el organizationId del hello', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.start({ organizationId: 121, currency: 'COP' });
    const t = h.transport();
    const hellos = t.published.filter((m) => m.t === 'hello') as HelloDraft[];
    expect(hellos.map((m) => m.organizationId)).toEqual([120, 121]);
  });

  it('createTransport que lanza no rompe start() ni las mutaciones posteriores', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const emitter = new DisplayEmitter({
        createTransport: () => {
          throw new Error('sin canal');
        },
        isEnabled: () => true,
        schedule: (fn) => {
          fn();
          return () => undefined;
        },
      });
      expect(() => emitter.start(START)).not.toThrow();
      expect(emitter.isEmitting).toBe(false);
      expect(() => emitter.setActiveCart(cart({ items: [item({ id: 'l1' })] }))).not.toThrow();
      expect(() => emitter.setPayment({ method: 'card', total: 1, provider: null })).not.toThrow();
      expect(() => emitter.setMode('thanks', { total: 1 })).not.toThrow();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('un transporte cuyo publish lanza no propaga el error a la caja', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const t = new FakeTransport();
      t.publish = () => {
        throw new Error('DataCloneError');
      };
      const sched = manualScheduler();
      const emitter = new DisplayEmitter({ createTransport: () => t, isEnabled: () => true, schedule: sched.schedule });
      expect(() => emitter.start(START)).not.toThrow();
      expect(() => emitter.setActiveCart(cart({ items: [item({ id: 'l1' })] }))).not.toThrow();
      expect(() => sched.flush()).not.toThrow();
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * DEFECTO 3 (bajo, corregido en la ronda 9). handleUp → announce() no
   * estaba envuelto en try/catch: un transporte cuyo publish lanzara
   * propagaba la excepción al handler de subida. Con BroadcastChannelTransport
   * (Parte A) no ocurría porque postSafely traga el DataCloneError y dispatch
   * aísla los handlers, pero la cabecera de emitter.ts promete «cada punto de
   * entrada está envuelto» y un transporte futuro (Realtime, F3) sí lanzaría.
   */
  it('need_snapshot con un transporte cuyo publish lanza no debe propagar la excepción', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const t = new FakeTransport();
      const sched = manualScheduler();
      const emitter = new DisplayEmitter({ createTransport: () => t, isEnabled: () => true, schedule: sched.schedule });
      emitter.start(START);
      t.publish = () => {
        throw new Error('DataCloneError');
      };
      expect(() => t.emitUp(needSnapshot())).not.toThrow();
    } finally {
      warn.mockRestore();
    }
  });

  it('setSession sin cambio real (mismo nombre, objeto nuevo) no repite el hello', () => {
    const h = harness();
    h.emitter.setSession({ cashier: { name: 'Andrea' }, sessionOpen: true });
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setSession({ cashier: { name: 'Andrea' } });
    h.emitter.setSession({ sessionOpen: true });
    expect(t.types).toEqual(['hello', 'state']);
    h.emitter.setSession({ cashier: null });
    expect(t.types).toEqual(['hello', 'state', 'hello', 'state']);
    expect(t.published[2]).toMatchObject({ t: 'hello', cashier: null, sessionOpen: true });
  });
});

// ---------------------------------------------------------------------------
// Defectos encontrados en la ronda 8 (corregidos en la 9: ahora son `it`)
// ---------------------------------------------------------------------------

describe('Parte B · defectos documentados en la ronda 8', () => {
  /**
   * DEFECTO 1 (alto, corregido en la ronda 9). Flujo real: CheckoutDialog
   * confirma la venta → posService.checkout elimina el carrito de pos_carts →
   * setMode('thanks'). La página solo llama a setActiveCart(nuevo) cuando el
   * cajero cierra el recibo. Antes, onCartsSaved no tocaba nada si el activo
   * no venía en la lista, y si el recibo seguía abierto más de 8 s (imprimir,
   * factura electrónica) el temporizador de «Gracias» vencía y el emisor
   * volvía a proyectar el carrito YA COBRADO como «Pedido». Ahora onCartsSaved
   * trata la ausencia del activo como eliminación (setCart(null)).
   */
  it('tras vencer «Gracias» sin que la página cambie de carrito, la pantalla no debe volver a mostrar la venta cobrada', async () => {
    const h = harness({ thanksDurationMs: 10 });
    h.emitter.start(START);
    const sold = cart({ id: 'vendido', items: [item({ id: 'l1', quantity: 2 })], total: 10000 });
    h.emitter.setActiveCart(sold);
    h.flush();
    h.emitter.setPayment({ method: 'cash', total: 10000, received: 10000, change: 0 });
    h.flush();
    // posService.checkout → removeCart → saveCartsToStorage([]) → onCartsSaved([]) (activo ausente: no hace nada)
    h.emitter.onCartsSaved([]);
    h.emitter.setMode('thanks', { total: 10000 });
    h.flush();
    expect(h.transport().lastState.mode).toBe('thanks');
    await until(() => h.pending()); // el temporizador de «Gracias» (10 ms) encola la emisión siguiente
    h.flush();
    const last = h.transport().lastState;
    expect(last.mode).not.toBe('order');
    expect(last.cart?.id).not.toBe('vendido');
  });

  /**
   * DEFECTO 2 (medio, corregido en la ronda 9). CartView solo reenvía los
   * totales de TaxSummary si subtotal > 0, así que al vaciar el carrito el
   * override anterior quedaba vivo en el emisor y la primera línea nueva se
   * proyectaba con el total de la venta anterior durante un frame. Ahora
   * setCart descarta el override cuando el carrito queda sin líneas o cambia
   * de id.
   */
  it('vaciar el carrito debe descartar el override de totales para que una línea nueva no herede el total anterior', () => {
    const h = harness();
    h.emitter.start(START);
    const a = cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 });
    h.emitter.setActiveCart(a);
    h.emitter.setTotals('a', { discountTotal: 0, taxTotal: 950, total: 5950 });
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(5950);
    h.emitter.onCartsSaved([{ ...a, items: [], total: 0 }]);
    h.flush();
    expect(h.transport().lastState.mode).toBe('idle');
    h.emitter.onCartsSaved([{ ...a, items: [item({ id: 'l2', unit_price: 900, total: 900 })], total: 900 }]);
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// Casos límite del carrito a través del emisor
// ---------------------------------------------------------------------------

describe('Parte B · casos límite del carrito', () => {
  it('cantidad 0 → línea con total 0 y modo order (la línea existe)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1', quantity: 0, total: 0 })], total: 0 }));
    h.flush();
    const s = h.transport().lastState;
    expect(s.mode).toBe('order');
    expect(s.cart?.lines[0]).toMatchObject({ qty: 0, total: 0 });
    expect(s.cart?.subtotal).toBe(0);
  });

  it('descuento mayor que el subtotal: no lanza; total negativo viaja tal cual (la caja lo calculó así) y el descuento no se clampa por encima', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1', discount_amount: 8000 })], discount_total: 8000, total: -3000 }));
    h.flush();
    const c = h.transport().lastState.cart!;
    expect(c.subtotal).toBe(5000);
    expect(c.discountTotal).toBe(8000);
    expect(c.lines[0].discount).toBe(8000);
    expect(c.total).toBe(-3000);
  });

  it('modificadores sin precio (extraPrice undefined / null / string) → extraPrice 0, nombre vacío tolerado', () => {
    const h = harness();
    h.emitter.start(START);
    const mods = [
      { name: 'Sin azúcar' },
      { name: 'Leche', extraPrice: null },
      { name: 'Grande', extraPrice: 'abc' },
      null,
      { extraPrice: 500 },
    ] as unknown as CartItem['modifiers'];
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1', modifiers: mods })], total: 5000 }));
    h.flush();
    const line = h.transport().lastState.cart!.lines[0];
    expect(line.modifiers).toEqual([
      { name: 'Sin azúcar', extraPrice: 0 },
      { name: 'Leche', extraPrice: 0 },
      { name: 'Grande', extraPrice: 0 },
      { name: '', extraPrice: 500 },
    ]);
  });

  it('impuesto incluido vs excluido por línea: viaja por línea y taxIncluded del carrito es «alguna incluida»', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(
      cart({
        items: [item({ id: 'l1', tax_included: true }), item({ id: 'l2', product_id: 2, tax_included: false, tax_excluded: true })],
        tax_included: false,
        tax_total: 798,
        total: 10000,
      }),
    );
    h.flush();
    const c = h.transport().lastState.cart!;
    expect(c.taxIncluded).toBe(true);
    expect(c.lines.map((l) => [l.taxIncluded, l.taxExcluded])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(c.taxTotal).toBe(798);
  });

  it('carrito guardado corrupto (items con null, sin id, sin product) no rompe la caja', () => {
    const h = harness();
    h.emitter.start(START);
    const corrupt = cart({ items: [null, item({ id: 'l1' }), { product_id: 7, quantity: 'x', unit_price: null } as unknown as CartItem] as unknown as CartItem[] });
    expect(() => h.emitter.setActiveCart(corrupt)).not.toThrow();
    h.flush();
    const c = h.transport().lastState.cart!;
    expect(c.lines).toHaveLength(2);
    expect(c.lines[1]).toMatchObject({ id: 'linea:7:1', qty: 0, unitPrice: 0, name: '' });
  });

  it('setTotals con valores no numéricos no lanza y degrada a 0', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    h.emitter.setTotals('a', { discountTotal: Number.NaN, taxTotal: Number.POSITIVE_INFINITY, total: 'x' as unknown as number });
    h.flush();
    const c = h.transport().lastState.cart!;
    expect(c.discountTotal).toBe(0);
    expect(c.taxTotal).toBe(0);
    expect(c.total).toBe(0);
  });

  it('setTotals con cartId vacío o cart null se ignora sin lanzar', () => {
    const h = harness();
    h.emitter.start(START);
    expect(() => h.emitter.setTotals('', { discountTotal: 0, taxTotal: 0, total: 1 })).not.toThrow();
    expect(() => h.emitter.setTotals('a', { discountTotal: 0, taxTotal: 0, total: 1 })).not.toThrow();
    h.flush();
    expect(h.transport().states).toHaveLength(1);
  });

  it('cambiar de pestaña a un carrito con líneas durante «Gracias» NO corta el agradecimiento; una línea nueva vía posService sí (regla «siguiente venta», ronda 3)', () => {
    // Decisión de la ronda 3 (emitter.ts, «Modo resultante»): la «siguiente
    // venta» es una mutación real de líneas avisada por onCartsSaved, no un
    // cambio de pestaña (tras cobrar, la página activa la primera pestaña que
    // queda y el cliente que acaba de pagar no debe ver el pedido de otro).
    const h = harness({ thanksDurationMs: 60000 });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    h.emitter.setMode('thanks', { total: 5000 });
    h.flush();
    const b = cart({ id: 'b', items: [item({ id: 'l2' })], total: 5000 });
    h.emitter.setActiveCart(b);
    h.flush();
    expect(h.transport().lastState.mode).toBe('thanks');
    h.emitter.onCartsSaved([{ ...b, items: [...b.items, item({ id: 'l3', product_id: 3 })], total: 10000 }]);
    h.flush();
    expect(h.transport().lastState.mode).toBe('order');
    expect(h.transport().lastState.cart?.id).toBe('b');
    expect(h.transport().lastState.cart?.lastChangedLineId).toBe('l3');
  });

  it('carrito activo nuevo VACÍO durante «Gracias» no corta el agradecimiento', () => {
    const h = harness({ thanksDurationMs: 60000 });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    h.emitter.setMode('thanks', { total: 5000 });
    h.flush();
    h.emitter.setActiveCart(cart({ id: 'nuevo', items: [] }));
    h.flush();
    expect(h.transport().lastState.mode).toBe('thanks');
  });
});

// ---------------------------------------------------------------------------
// Mapeo de pagos: entradas raras
// ---------------------------------------------------------------------------

describe('Parte B · toDisplayPayment con entradas raras', () => {
  it('código vacío / undefined cae a card (no lanza)', () => {
    expect(toDisplayPayment({ methodCode: '', methodName: null, total: 10 }).method).toBe('card');
    expect(toDisplayPayment({ methodCode: undefined as unknown as string, methodName: null, total: 10 }).method).toBe('card');
  });

  it('efectivo con recibido NaN o string → recibido 0 (no null) y cambio numérico: documenta el comportamiento actual', () => {
    const p = toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 10, received: Number.NaN, change: 0 });
    expect(p).toEqual({ method: 'cash', total: 10, received: 0, change: 0 });
  });

  it('mayúsculas y espacios en el código se normalizan', () => {
    expect(toDisplayPayment({ methodCode: '  CASH ', methodName: null, total: 10, received: 10, change: 0 }).method).toBe('cash');
    expect(toDisplayPayment({ methodCode: 'Bold_QR', methodName: null, total: 10 }).method).toBe('qr');
  });

  it('el estado emitido por el emisor con cada método pasa el guard isDownMessage del receptor', () => {
    for (const code of ['cash', 'card', 'bold_card', 'nequi', 'breb_qr', 'bold_link', '']) {
      const payment = toDisplayPayment({ methodCode: code, methodName: 'X', total: 10, received: 10, change: 0 });
      const state: DisplayState = { mode: 'payment', cart: null, payment, tip: null, thanks: null };
      const msg = { v: PROTOCOL_VERSION, t: 'state', seq: 1, terminalId: TERMINAL, instanceId: 'i', state };
      expect(isDownMessage(msg)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Extremo a extremo con BroadcastChannel real (Node ≥ 18)
// ---------------------------------------------------------------------------

describe('Parte B · extremo a extremo con BroadcastChannel', () => {
  const hasBC = typeof BroadcastChannel === 'function';
  const itBC = hasBC ? it : it.skip;

  function e2e() {
    const emitter = new DisplayEmitter({
      createTransport: () => new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 60000 }),
      isEnabled: () => true,
      thanksDurationMs: 20,
    });
    const receiver = new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0, presenceIntervalMs: 60000 });
    const received: DownMessage[] = [];
    receiver.onDown((m) => received.push(m));
    return {
      emitter,
      receiver,
      received,
      states: () => received.filter((m): m is Extract<DownMessage, { t: 'state' }> => m.t === 'state').map((m) => m.state),
      close: () => {
        emitter.stop();
        receiver.close(false);
      },
    };
  }

  itBC('la pantalla recibe hello + state, y una ráfaga de mutaciones llega como UN state con seq creciente', async () => {
    const x = e2e();
    try {
      x.emitter.start(START);
      await untilReceived(x.received, (ms) => ms.length >= 2);
      expect(x.received.map((m) => m.t)).toEqual(['hello', 'state']);
      const base = cart({ items: [item({ id: 'l1' })], total: 5000 });
      x.emitter.setActiveCart(base);
      for (let q = 2; q <= 10; q++) x.emitter.setCart({ ...base, items: [item({ id: 'l1', quantity: q })], total: 5000 * q });
      await untilReceived(x.received, (ms) => lastState(ms)?.cart?.lines[0]?.qty === 10);
      const states = x.states();
      expect(states).toHaveLength(2);
      expect(states[1].cart?.lines[0].qty).toBe(10);
      const seqs = x.received.map((m) => m.seq);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      expect(new Set(seqs).size).toBe(seqs.length);
    } finally {
      x.close();
    }
  });

  itBC('need_snapshot de la pantalla → hello + state completo, dirigido a la instancia activa', async () => {
    const x = e2e();
    try {
      x.emitter.start(START);
      x.emitter.setActiveCart(cart({ items: [item({ id: 'l1', quantity: 3 })], total: 15000 }));
      // Esperar al state COALESCIDO del setActiveCart (bajo carga tarda más de 20 ms) en vez de
      // contar mensajes en una ventana fija: así el snapshot no se mezcla con el de la mutación.
      await untilReceived(x.received, (ms) => ms.some((m) => m.t === 'state' && m.state.mode === 'order'));
      const before = x.received.length;
      x.receiver.send({ t: 'need_snapshot', capabilities: { touch: true, width: 1920, height: 1080 } });
      await untilReceived(x.received, (ms) => ms.slice(before).some((m) => m.t === 'state'));
      expect(x.received.slice(before).map((m) => m.t)).toEqual(['hello', 'state']);
      const last = x.states().at(-1)!;
      expect(last.mode).toBe('order');
      expect(last.cart?.lines[0].qty).toBe(3);
      expect(x.emitter.lastDisplaySeenAt).not.toBeNull();
    } finally {
      x.close();
    }
  });

  itBC('una pantalla de OTRA terminal no recibe nada de esta caja', async () => {
    const x = e2e();
    const foreign = new BroadcastChannelReceiver({ terminalId: OTHER_TERMINAL, staleAfterMs: 0, presenceIntervalMs: 60000 });
    const foreignReceived: DownMessage[] = [];
    foreign.onDown((m) => foreignReceived.push(m));
    try {
      x.emitter.start(START);
      x.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
      await untilReceived(x.received, (ms) => lastState(ms)?.mode === 'order');
      expect(foreignReceived).toHaveLength(0);
      expect(x.received.length).toBeGreaterThan(0);
    } finally {
      foreign.close(false);
      x.close();
    }
  });

  itBC('200 líneas con modificadores y variantes viajan enteras y en un tamaño razonable', async () => {
    const x = e2e();
    try {
      x.emitter.start(START);
      const items: CartItem[] = [];
      for (let i = 0; i < 200; i++) {
        items.push(
          item({
            id: `l${i}`,
            product_id: i,
            product: { id: i, name: `Producto ${i}`, variant_data: { Talla: 'M', Color: 'Azul' } } as unknown as CartItem['product'],
            quantity: (i % 5) + 1,
            unit_price: 1000 + i,
            modifiers: [{ name: 'Extra', extraPrice: 100 }] as unknown as CartItem['modifiers'],
            notes: 'sin cebolla',
          }),
        );
      }
      const t0 = Date.now();
      x.emitter.setActiveCart(cart({ items, total: 999 }));
      await untilReceived(x.received, (ms) => lastState(ms)?.cart?.lines.length === 200);
      const last = x.states().at(-1)!;
      expect(last.cart?.lines).toHaveLength(200);
      expect(last.cart?.lines[199].variant).toEqual([
        { attr: 'Talla', value: 'M' },
        { attr: 'Color', value: 'Azul' },
      ]);
      const bytes = JSON.stringify(last).length;
      expect(bytes).toBeLessThan(120_000);
      expect(Date.now() - t0).toBeLessThan(500);
    } finally {
      x.close();
    }
  });

  itBC('stop() de la caja manda bye y la pantalla lo recibe; «Gracias» vence y vuelve a idle si el carrito activo ya no tiene líneas', async () => {
    const x = e2e();
    try {
      x.emitter.start(START);
      x.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
      await untilReceived(x.received, (ms) => lastState(ms)?.mode === 'order');
      x.emitter.setActiveCart(cart({ id: 'nuevo', items: [] }));
      x.emitter.setMode('thanks', { total: 5000 });
      await untilReceived(x.received, (ms) => lastState(ms)?.mode === 'thanks');
      expect(x.states().at(-1)!.mode).toBe('thanks');
      // e2e() arma thanksDurationMs = 20; tope holgado por si la máquina va cargada.
      await untilReceived(x.received, (ms) => lastState(ms)?.mode === 'idle', 20 + 500);
      expect(x.states().at(-1)!.mode).toBe('idle');
      x.emitter.stop();
      await untilReceived(x.received, (ms) => ms.at(-1)?.t === 'bye');
      expect(x.received.at(-1)!.t).toBe('bye');
    } finally {
      x.close();
    }
  });

  it('THANKS_DURATION_MS sigue siendo 8 s', () => {
    expect(THANKS_DURATION_MS).toBe(8000);
  });
});
