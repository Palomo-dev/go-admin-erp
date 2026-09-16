/**
 * Tester · ronda 10 · Parte B (emisión desde posService y CheckoutDialog).
 *
 * Casos que emitter.test.ts, tester-r8-parte-b y tester-r9-parte-b no
 * cubren tras la ronda 3 del builder. Los defectos van como `it.failing`
 * con el defecto descrito en el propio test: la suite queda verde y, al
 * corregirlos, el builder los pasa a `it`.
 *
 * Los helpers (transporte falso, planificador manual, carrito) se copian de
 * emitter.test.ts a propósito: un test no importa de otro test.
 */

import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import { isDownMessage, type DisplayState, type DownMessage, type DownMessageDraft, type UpMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName, type DisplayTransport, type HelloDraft } from '@/lib/pos/display/transport';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = '11111111-2222-4333-8444-555555555555';

class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  closed = false;
  heartbeats = 0;
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
    this.heartbeats += 1;
  }
  stopHeartbeat(): void {
    this.heartbeats -= 1;
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const START = { organizationId: 120, currency: 'COP' };

const tick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function untilReceived<T>(list: T[], pred: (list: T[]) => boolean, timeoutMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred(list)) {
    if (Date.now() > deadline) throw new Error('timeout esperando mensajes');
    await tick(5);
  }
}

// ---------------------------------------------------------------------------
// Estados del carrito que la caja guarda y que NO son un pedido pendiente
// ---------------------------------------------------------------------------

describe('Parte B · carritos que ya no son un pedido (PLAN §4.1 «Nunca miente»)', () => {
  it('«Anular deuda» deja el carrito en status cancelled con sus líneas; la pantalla NO lo proyecta como «Pedido» (corregido en la ronda 4: lista blanca active/hold)', () => {
    // Flujo real: CartView.handleCancelDebt → POSService.cancelDebtWithCreditNote
    // → cart.status = 'cancelled' (posService.ts:2923) → saveCartsToStorage
    // (onCartsSaved) → onCartUpdate → la página lo mantiene como pestaña
    // activa → setActiveCart(cancelado). project() solo proyecta active/hold.
    const h = harness({ thanksDurationMs: 5 });
    h.emitter.start(START);
    const debt = cart({ id: 'c-deuda', status: 'hold_with_debt', items: [item({ id: 'l1', quantity: 2 })], subtotal: 10000, total: 10000 });
    h.emitter.setActiveCart(debt);
    h.flush();
    expect(h.transport().lastState.mode).toBe('idle'); // con deuda no se proyecta (decisión ronda 3)

    const cancelled = clone({ ...debt, status: 'cancelled' as const, hold_reason: 'Deuda anulada con nota de crédito' });
    h.emitter.onCartsSaved([cancelled]);
    h.emitter.setActiveCart(clone(cancelled));
    h.flush();
    const state = h.transport().lastState;
    // Esperado: una venta anulada no es un pedido pendiente → reposo.
    expect(state.mode).toBe('idle');
    expect(state.cart).toBeNull();
  });

  it('un carrito en espera (status hold) con líneas sigue siendo un pedido y se proyecta (el cajero puede retomarlo)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ status: 'hold', items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    expect(h.transport().lastState.mode).toBe('order');
  });
});

// ---------------------------------------------------------------------------
// Carritos corruptos en localStorage
// ---------------------------------------------------------------------------

describe('Parte B · carrito corrupto en pos_carts_<org>', () => {
  it('items que no es array (undefined / null / objeto) no rompe la caja: se trata como carrito vacío', () => {
    const h = harness();
    h.emitter.start(START);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      for (const items of [undefined, null, { l1: 1 }, 'x', 7]) {
        expect(() => h.emitter.setActiveCart({ ...cart(), items: items as unknown as CartItem[] })).not.toThrow();
        h.flush();
      }
      const last = h.transport().lastState;
      expect(last.mode).toBe('idle');
      expect(last.cart).toBeNull();
      expect(() => h.emitter.onCartsSaved([{ ...cart(), items: 'nope' as unknown as CartItem[] }])).not.toThrow();
    } finally {
      warn.mockRestore();
    }
  });

  it('onCartsSaved con una lista que no es array, o con entradas null, no lanza y no cambia lo proyectado', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    const before = h.transport().states.length;
    expect(() => h.emitter.onCartsSaved(null as unknown as Cart[])).not.toThrow();
    expect(() => h.emitter.onCartsSaved('[]' as unknown as Cart[])).not.toThrow();
    expect(() => h.emitter.onCartsSaved([null as unknown as Cart, undefined as unknown as Cart, cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 })])).not.toThrow();
    h.flush();
    expect(h.transport().states.length).toBe(before); // mismo contenido: no se repite
    expect(h.transport().lastState.mode).toBe('order');
  });
});

// ---------------------------------------------------------------------------
// Ciclo de vida fuera de orden
// ---------------------------------------------------------------------------

describe('Parte B · llamadas fuera de orden', () => {
  it('stop(), reannounce(), refresh(), setTotals(), onCartsSaved() antes de start no lanzan ni abren transporte', () => {
    const h = harness();
    expect(() => h.emitter.stop()).not.toThrow();
    expect(() => h.emitter.reannounce()).not.toThrow();
    expect(() => h.emitter.refresh()).not.toThrow();
    expect(() => h.emitter.setTotals('c', { discountTotal: 0, taxTotal: 0, total: 1 })).not.toThrow();
    expect(() => h.emitter.onCartsSaved([cart()])).not.toThrow();
    expect(() => h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })] }))).not.toThrow();
    expect(h.transports).toHaveLength(0);
    expect(h.emitter.isEmitting).toBe(false);
    // Lo fijado antes de start sobrevive al arranque (la página puede fijar el carrito antes de que cargue el interruptor).
    h.emitter.start(START);
    expect(h.transport().lastState.mode).toBe('order');
  });

  it('stop() dos veces seguidas cierra un solo transporte y deja el latido en cero', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.stop();
    h.emitter.stop();
    expect(t.closed).toBe(true);
    expect(t.heartbeats).toBe(0);
    expect(h.transports).toHaveLength(1);
  });

  it('start() repetido con la misma organización y el interruptor encendido no abre un segundo transporte ni duplica el latido', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.start(START);
    h.emitter.start({ ...START, cashier: { name: 'Andrea' } });
    expect(h.transports).toHaveLength(1);
    expect(h.transport().heartbeats).toBe(1);
  });

  it('setMode(thanks) con total NaN / Infinity / string usa el total proyectado', () => {
    const h = harness({ thanksDurationMs: 60000 });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1', quantity: 3 })], subtotal: 15000, total: 15000 }));
    h.flush();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '15000' as unknown as number]) {
      h.emitter.setMode('thanks', { total: bad });
      h.flush();
      expect(h.transport().lastState.thanks?.total).toBe(15000);
      h.emitter.setMode('order');
      h.flush();
    }
  });

  it('abrir un cobro durante «Gracias» (siguiente cliente antes de los 8 s) corta el agradecimiento y muestra el cobro', () => {
    const h = harness({ thanksDurationMs: 60000 });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ id: 'a', items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    h.emitter.setMode('thanks', { total: 5000 });
    h.flush();
    expect(h.transport().lastState.mode).toBe('thanks');
    h.emitter.setActiveCart(cart({ id: 'b', items: [item({ id: 'l9' })], subtotal: 5000, total: 5000 }));
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 5000 }));
    h.flush();
    const last = h.transport().lastState;
    expect(last.mode).toBe('payment');
    expect(last.thanks).toBeNull();
    expect(last.cart?.id).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// Interruptor maestro: se relee en cada publicación (ronda 4, opción A)
// ---------------------------------------------------------------------------

describe('Parte B · interruptor maestro apagado sin refresh()', () => {
  it('si la caché pasa a enabled=false y nadie llama a refresh(), la siguiente publicación NO sale: la caja cierra el transporte y deja de emitir', () => {
    // En producción configuracionService → primeCustomerDisplaySettings +
    // applyPosDisplaySettings()/evento storage → refresh(). Si otra ruta
    // escribe la caché sin avisar (clearCustomerDisplaySettingsCache al
    // cerrar sesión), flush()/announce() releen el interruptor igualmente.
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const before = t.published.length;
    h.enabled.value = false;
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    expect(t.published).toHaveLength(before);
    expect(t.states.some((s) => s.mode === 'order')).toBe(false);
    expect(t.closed).toBe(true);
    expect(h.emitter.isEmitting).toBe(false);
    h.emitter.refresh(); // idempotente: ya está cerrado
    expect(h.emitter.isEmitting).toBe(false);
    expect(h.transports).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Extremo a extremo: subidas malformadas por el canal real
// ---------------------------------------------------------------------------

describe('Parte B · subidas malformadas por BroadcastChannel (JSON raro, versión desconocida, terminal ajena)', () => {
  const hasBC = typeof BroadcastChannel === 'function';
  const itBC = hasBC ? it : it.skip;

  itBC('la caja ignora sin lanzar: string, número, null, sobre sin v, v=2, need_snapshot de otra terminal; y responde al need_snapshot válido', async () => {
    const emitter = new DisplayEmitter({
      createTransport: () => new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 60000 }),
      isEnabled: () => true,
    });
    const receiver = new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0, presenceIntervalMs: 60000 });
    const received: DownMessage[] = [];
    receiver.onDown((m) => received.push(m));
    const raw = new BroadcastChannel(displayChannelName(TERMINAL));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      emitter.start(START);
      emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
      await untilReceived(received, (ms) => ms.some((m) => m.t === 'state' && m.state.mode === 'order'));
      const before = received.length;

      const caps = { touch: false, width: 1024, height: 768 };
      const garbage: unknown[] = [
        '{"v":1,"t":"need_snapshot"}',
        42,
        null,
        [],
        { t: 'need_snapshot', terminalId: TERMINAL, capabilities: caps }, // sin v
        { v: 2, t: 'need_snapshot', terminalId: TERMINAL, capabilities: caps }, // versión desconocida
        { v: 1, t: 'need_snapshot', terminalId: OTHER_TERMINAL, capabilities: caps }, // terminal ajena
        { v: 1, t: 'need_snapshot', terminalId: TERMINAL }, // sin capabilities
        { v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: caps, toInstanceId: 'no-existe' }, // dirigido a otra instancia
        { v: 1, t: 'state', seq: 99, terminalId: TERMINAL, instanceId: 'x', state: null }, // una bajada falsa por el mismo canal
      ];
      for (const g of garbage) raw.postMessage(g);
      await tick(80);
      // Ninguna de las anteriores produce hello+state.
      expect(received.slice(before).filter((m) => m.t === 'hello')).toHaveLength(0);

      const before2 = received.length;
      raw.postMessage({ v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: caps });
      await untilReceived(received, (ms) => ms.slice(before2).some((m) => m.t === 'state'));
      const tail = received.slice(before2).map((m) => m.t);
      expect(tail.slice(0, 2)).toEqual(['hello', 'state']);
      const last = received[received.length - 1];
      expect(isDownMessage(last)).toBe(true);
      expect(last.t === 'state' && last.state.mode).toBe('order');
    } finally {
      raw.close();
      emitter.stop();
      receiver.close(false);
      warn.mockRestore();
      error.mockRestore();
    }
  });

  itBC('tras stop() un need_snapshot válido por el canal ya no obtiene respuesta (la caja se despidió con bye)', async () => {
    const emitter = new DisplayEmitter({
      createTransport: () => new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 60000 }),
      isEnabled: () => true,
    });
    const receiver = new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0, presenceIntervalMs: 60000 });
    const received: DownMessage[] = [];
    receiver.onDown((m) => received.push(m));
    const raw = new BroadcastChannel(displayChannelName(TERMINAL));
    try {
      emitter.start(START);
      await untilReceived(received, (ms) => ms.some((m) => m.t === 'state'));
      emitter.stop();
      await untilReceived(received, (ms) => ms.some((m) => m.t === 'bye'));
      const before = received.length;
      raw.postMessage({ v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: false, width: 1, height: 1 } });
      await tick(60);
      expect(received.slice(before)).toHaveLength(0);
    } finally {
      raw.close();
      emitter.stop();
      receiver.close(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Cobro: secuencia real de CheckoutDialog con el planificador manual
// ---------------------------------------------------------------------------

describe('Parte B · secuencia real del cobro en efectivo', () => {
  it('abrir → teclear 20.000 (total 15.000) → confirmar → 8 s → reposo: un state por paso, sin cobro residual', () => {
    const h = harness({ thanksDurationMs: 5 });
    h.emitter.start(START);
    const sold = cart({ id: 'venta', items: [item({ id: 'l1', quantity: 3 })], subtotal: 15000, total: 15000 });
    h.emitter.setActiveCart(sold);
    h.flush();
    // Abrir el cobro: primera entrada pre-rellenada, sin tocar → received null.
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 15000, received: null, change: null }));
    h.flush();
    let s = h.transport().lastState;
    expect(s.mode).toBe('payment');
    expect(s.payment).toEqual({ method: 'cash', total: 15000, received: null, change: null });
    // Teclear «2», «20», «200», … en la misma vuelta → un solo state con el último valor.
    const n = h.transport().states.length;
    for (const typed of [2, 20, 200, 2000, 20000]) {
      h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 15000, received: typed, change: Math.max(0, typed - 15000) }));
    }
    h.flush();
    expect(h.transport().states.length).toBe(n + 1);
    s = h.transport().lastState;
    expect(s.payment).toEqual({ method: 'cash', total: 15000, received: 20000, change: 5000 });
    // Confirmar: posService quita el carrito de pos_carts y CheckoutDialog pide «Gracias».
    h.emitter.onCartsSaved([]);
    h.emitter.setMode('thanks', { total: 15000 });
    h.flush();
    s = h.transport().lastState;
    expect(s.mode).toBe('thanks');
    expect(s.payment).toBeNull();
    expect(s.cart).toBeNull();
    // La página crea un carrito vacío nuevo mientras dura «Gracias».
    h.emitter.setActiveCart(cart({ id: 'nuevo' }));
    h.flush();
    expect(h.transport().lastState.mode).toBe('thanks');
    return tick(20).then(() => {
      h.flush();
      const final = h.transport().lastState;
      expect(final.mode).toBe('idle');
      expect(final.payment).toBeNull();
      expect(final.thanks).toBeNull();
    });
  });

  it('cambiar el medio de efectivo a QR y luego a tarjeta durante el cobro: cada cambio emite el estado del medio y ninguno arrastra recibido/cambio', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 5000, received: 10000, change: 5000 }));
    h.flush();
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000 }));
    h.flush();
    expect(h.transport().lastState.payment).toEqual({ method: 'qr', total: 5000, provider: 'Bre-B', qr: null, expiresAt: null });
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'bold_card', methodName: 'Datáfono Bold', total: 5000 }));
    h.flush();
    expect(h.transport().lastState.payment).toEqual({ method: 'card', total: 5000, provider: 'Datáfono Bold' });
    expect(h.transport().lastState.cart?.lines).toHaveLength(1);
  });
});
