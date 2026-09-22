/**
 * Emisor de la caja hacia la pantalla del cliente (Parte B, Fase 0).
 * Transporte falso: aquí se prueba la coalescencia, el hello inicial, la
 * respuesta a need_snapshot y el interruptor maestro, no BroadcastChannel.
 */

import type { Cart, CartItem } from '@/components/pos/types';
import {
  DisplayEmitter,
  RAF_FALLBACK_MS,
  THANKS_DURATION_MS,
  cartLinesSignature,
  defaultIsVisible,
  defaultScheduler,
  findChangedLineId,
  linesSignature,
  sameLines,
} from '@/lib/pos/display/emitter';
import { isQrPaymentCode, resolveCashReceived, toDisplayPayment } from '@/lib/pos/display/payment';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import { PROTOCOL_VERSION, isDownMessage, type DisplayState, type DownMessageDraft, type UpMessage } from '@/lib/pos/display/protocol';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

// ---------------------------------------------------------------------------
// Transporte falso
// ---------------------------------------------------------------------------

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
  /** Simula un mensaje de la pantalla. */
  emitUp(msg: UpMessage): void {
    for (const handler of Array.from(this.handlers)) handler(msg);
  }
  get types(): string[] {
    return this.published.map((m) => m.t);
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

/** Planificador manual: nada se emite hasta llamar a flush(). */
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

interface Harness {
  emitter: DisplayEmitter;
  transports: FakeTransport[];
  enabled: { value: boolean };
  flush: () => void;
  pending: () => boolean;
  /** Último transporte creado (el vivo). */
  transport: () => FakeTransport;
}

function harness(opts: { enabled?: boolean; thanksDurationMs?: number } = {}): Harness {
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
    transport: () => {
      if (transports.length === 0) throw new Error('no se creó ningún transporte');
      return transports[transports.length - 1];
    },
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
  return {
    v: PROTOCOL_VERSION,
    t: 'need_snapshot',
    terminalId: TERMINAL,
    capabilities: { touch: false, width: 1280, height: 800 },
  };
}

const START = { organizationId: 120, currency: 'COP' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DisplayEmitter · arranque', () => {
  it('emite hello y luego state al arrancar (contrato hello → state)', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    expect(t.types).toEqual(['hello', 'state']);
    // F2-B: el hello lleva `visible` (isVisible por defecto: sin document → true).
    expect(t.published[0]).toEqual({ t: 'hello', organizationId: 120, cashier: null, sessionOpen: false, currency: 'COP', visible: true });
    expect(t.lastState).toEqual({ mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
    expect(t.heartbeatStarted).toBe(1);
    expect(h.emitter.isEmitting).toBe(true);
  });

  it('el hello lleva cajero y sesión si se fijan antes o en start', () => {
    const h = harness();
    h.emitter.setSession({ cashier: { name: 'Andrea' } });
    expect(h.transports).toHaveLength(0); // sin transporte aún: no se emite nada
    h.emitter.start({ ...START, sessionOpen: true });
    expect(h.transport().published[0]).toEqual({
      t: 'hello',
      organizationId: 120,
      cashier: { name: 'Andrea' },
      sessionOpen: true,
      currency: 'COP',
      visible: true,
    });
  });

  it('start con organizationId inválido no abre transporte', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const h = harness();
      h.emitter.start({ organizationId: 0, currency: 'COP' });
      expect(h.transports).toHaveLength(0);
      expect(h.emitter.isEmitting).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('setSession con transporte abierto vuelve a saludar (hello + state), y no repite si nada cambió', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setSession({ sessionOpen: true });
    expect(t.types).toEqual(['hello', 'state', 'hello', 'state']);
    expect(t.published[2]).toMatchObject({ t: 'hello', sessionOpen: true });
    h.emitter.setSession({ sessionOpen: true });
    expect(t.types).toHaveLength(4);
  });

  it('start con OTRA organización olvida carrito, totales, cobro y gracias de la anterior; con la misma los conserva', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ id: 'c120', items: [item({ id: 'l1' })], total: 5000 }));
    h.emitter.setTotals('c120', { discountTotal: 0, taxTotal: 950, total: 5950 });
    h.flush();
    h.emitter.stop();
    h.emitter.start(START); // misma organización: recupera el carrito
    expect(h.transport().lastState).toMatchObject({ mode: 'order', cart: { id: 'c120', total: 5950 } });
    h.emitter.stop();
    h.emitter.start({ organizationId: 121, currency: 'USD' });
    const t = h.transport();
    expect(t.published[t.published.length - 2]).toMatchObject({ t: 'hello', organizationId: 121 });
    expect(t.lastState).toEqual({ mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
    // onCartsSaved de la organización anterior ya no sigue a ningún carrito.
    h.emitter.onCartsSaved([cart({ id: 'c120', items: [item({ id: 'l1' })], total: 5000 })]);
    expect(h.pending()).toBe(false);
  });

  it('stop cierra el transporte y para el latido; volver a start abre otro', () => {
    const h = harness();
    h.emitter.start(START);
    const first = h.transport();
    h.emitter.stop();
    expect(first.closed).toBe(true);
    expect(first.heartbeatStopped).toBe(1);
    expect(h.emitter.isEmitting).toBe(false);
    h.emitter.start(START);
    expect(h.transports).toHaveLength(2);
    expect(h.transport().types).toEqual(['hello', 'state']);
  });
});

describe('DisplayEmitter · coalescencia', () => {
  it('tres setCart seguidos en la misma vuelta emiten UN solo state, con el último carrito', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const base = cart({ items: [item({ id: 'l1', quantity: 1 })], total: 5000 });
    h.emitter.setActiveCart(base);
    h.emitter.setCart({ ...base, items: [item({ id: 'l1', quantity: 12 })], total: 60000 });
    h.emitter.setCart({ ...base, items: [item({ id: 'l1', quantity: 123 })], total: 615000 });
    expect(t.states).toHaveLength(1); // solo el del arranque
    expect(h.pending()).toBe(true);
    h.flush();
    expect(t.states).toHaveLength(2);
    expect(t.lastState.mode).toBe('order');
    expect(t.lastState.cart?.lines[0].qty).toBe(123);
    expect(t.lastState.cart?.total).toBe(615000);
    expect(h.emitter.emittedStateCount).toBe(2);
  });

  it('el mismo cambio avisado por dos caminos (página y posService) no se repite', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const c = cart({ items: [item({ id: 'l1' })], total: 5000 });
    h.emitter.setActiveCart(c);
    h.flush();
    expect(t.states).toHaveLength(2);
    h.emitter.onCartsSaved([c]);
    h.flush();
    expect(t.states).toHaveLength(2); // idéntico al último emitido: se descarta
  });

  it('sin cambios no programa nada; con cambio real emite el siguiente frame', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setMode('order'); // sin cobro ni gracias: no cambia nada
    h.flush();
    expect(h.transport().states).toHaveLength(1);
  });
});

describe('DisplayEmitter · need_snapshot', () => {
  it('responde hello + state completo con el carrito actual', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1', quantity: 2 })], total: 10000 }));
    h.flush();
    const before = t.published.length;
    t.emitUp(needSnapshot());
    expect(t.types.slice(before)).toEqual(['hello', 'state']);
    expect(t.lastState.mode).toBe('order');
    expect(t.lastState.cart?.lines).toHaveLength(1);
    expect(t.lastState.cart?.lines[0].qty).toBe(2);
  });

  it('un need_snapshot con state pendiente lo incluye en la respuesta y cancela la emisión programada', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    expect(h.pending()).toBe(true);
    t.emitUp(needSnapshot());
    expect(h.pending()).toBe(false);
    expect(t.lastState.mode).toBe('order');
    const count = t.published.length;
    h.flush();
    expect(t.published).toHaveLength(count);
  });

  it('need_snapshot con un transporte cuyo publish lanza no propaga la excepción al handler de subida (se registra con warn)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const h = harness();
      h.emitter.start(START);
      const t = h.transport();
      t.publish = () => {
        throw new Error('publish falló (Realtime)');
      };
      expect(() => t.emitUp(needSnapshot())).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('handleUp'), expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });

  it('ignora otras intenciones en Fase 0 (tip_selected, display_alive) sin emitir nada', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const count = t.published.length;
    t.emitUp({ v: PROTOCOL_VERSION, t: 'tip_selected', terminalId: TERMINAL, cartId: 'cart-1', kind: 'percent', value: 10 });
    t.emitUp({ v: PROTOCOL_VERSION, t: 'display_alive', terminalId: TERMINAL, at: 1, capabilities: { touch: true, width: 1, height: 1 } });
    expect(t.published).toHaveLength(count);
  });
});

describe('DisplayEmitter · interruptor maestro', () => {
  it('con enabled=false no crea transporte ni emite nada, ni siquiera al mutar el carrito', () => {
    const h = harness({ enabled: false });
    h.emitter.start(START);
    expect(h.transports).toHaveLength(0);
    expect(h.emitter.isEmitting).toBe(false);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    h.emitter.setPayment({ method: 'cash', total: 5000, received: null, change: null });
    expect(h.pending()).toBe(false);
    h.flush();
    expect(h.transports).toHaveLength(0);
  });

  it('refresh tras encender abre el transporte y saluda con el estado actual; tras apagar lo cierra', () => {
    const h = harness({ enabled: false });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    h.enabled.value = true;
    h.emitter.refresh();
    const t = h.transport();
    expect(t.types).toEqual(['hello', 'state']);
    expect(t.lastState.mode).toBe('order');
    h.enabled.value = false;
    h.emitter.refresh();
    expect(t.closed).toBe(true);
    expect(h.emitter.isEmitting).toBe(false);
    h.emitter.setCart(cart({ items: [item({ id: 'l1', quantity: 3 })], total: 15000 }));
    h.flush();
    expect(t.states).toHaveLength(1);
  });

  it('refresh sin start no hace nada', () => {
    const h = harness();
    h.emitter.refresh();
    expect(h.transports).toHaveLength(0);
  });

  it('cada publicación relee el interruptor: si la caché pasa a enabled=false sin refresh(), flush no publica, cierra el transporte y deja de emitir', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const before = t.published.length;
    h.enabled.value = false; // clearCustomerDisplaySettingsCache() al cerrar sesión, o una ruta que escriba la caché sin avisar
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    expect(t.published).toHaveLength(before);
    expect(t.closed).toBe(true);
    expect(h.emitter.isEmitting).toBe(false);
    expect(h.pending()).toBe(false);
    // Nada más se programa mientras siga apagado.
    h.emitter.setPayment({ method: 'cash', total: 5000, received: null, change: null });
    expect(h.pending()).toBe(false);
    // Al volver a encender, refresh abre otro transporte con el estado acumulado.
    h.enabled.value = true;
    h.emitter.refresh();
    expect(h.transports).toHaveLength(2);
    expect(h.transport().lastState.mode).toBe('payment');
  });

  it('cada publicación relee el interruptor: un need_snapshot, setSession o reannounce con enabled=false tampoco publican', () => {
    for (const trigger of ['need_snapshot', 'setSession', 'reannounce'] as const) {
      const h = harness();
      h.emitter.start(START);
      const t = h.transport();
      const before = t.published.length;
      h.enabled.value = false;
      if (trigger === 'need_snapshot') t.emitUp(needSnapshot());
      else if (trigger === 'setSession') h.emitter.setSession({ cashier: { name: 'Andrea' } });
      else h.emitter.reannounce();
      expect(t.published).toHaveLength(before);
      expect(t.closed).toBe(true);
      expect(h.emitter.isEmitting).toBe(false);
    }
  });

  it('createTransport que devuelve null (sin BroadcastChannel) deja la caja muda y sin error', () => {
    const emitter = new DisplayEmitter({ createTransport: () => null, isEnabled: () => true, schedule: () => () => undefined });
    emitter.start(START);
    expect(emitter.isEmitting).toBe(false);
    expect(() => emitter.setActiveCart(cart({ items: [item({ id: 'l1' })] }))).not.toThrow();
  });
});

describe('DisplayEmitter · carrito activo y onCartsSaved', () => {
  it('onCartsSaved proyecta solo el carrito activo; otro carrito de la lista no cambia la pantalla', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const a = cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 });
    const b = cart({ id: 'b', items: [item({ id: 'l2', unit_price: 900 })], total: 900 });
    h.emitter.setActiveCart(a);
    h.flush();
    h.emitter.onCartsSaved([{ ...a, items: [item({ id: 'l1', quantity: 4 })], total: 20000 }, b]);
    h.flush();
    expect(t.lastState.cart?.id).toBe('a');
    expect(t.lastState.cart?.lines[0].qty).toBe(4);
  });

  it('onCartsSaved sin carrito activo no emite; si el activo ya no está en la lista (se eliminó) deja de proyectarlo', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.onCartsSaved([cart({ id: 'x', items: [item({ id: 'l1' })] })]);
    h.flush();
    expect(t.states).toHaveLength(1);
    h.emitter.setActiveCart(cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    expect(t.states).toHaveLength(2);
    h.emitter.onCartsSaved([cart({ id: 'z' })]); // el activo ya no está (se cobró o se descartó): reposo
    h.flush();
    expect(t.states).toHaveLength(3);
    expect(t.lastState).toEqual({ mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
    h.emitter.onCartsSaved([cart({ id: 'z' })]); // repetido: nada nuevo que emitir
    h.flush();
    expect(t.states).toHaveLength(3);
    // La página fija el carrito nuevo y se ve.
    h.emitter.setActiveCart(cart({ id: 'z', items: [item({ id: 'l2' })], total: 5000 }));
    h.flush();
    expect(t.lastState.mode).toBe('order');
    expect(t.lastState.cart?.id).toBe('z');
  });

  it('un carrito eliminado deja de proyectarse aunque la página no haya fijado otro (activeCartId se conserva)', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    h.emitter.onCartsSaved([]);
    h.flush();
    expect(t.lastState.mode).toBe('idle');
    // Si el mismo id vuelve a aparecer (no ocurre en la práctica, pero es coherente) se vuelve a proyectar.
    h.emitter.onCartsSaved([cart({ id: 'a', items: [item({ id: 'l1', quantity: 2 })], total: 10000 })]);
    h.flush();
    expect(t.lastState.mode).toBe('order');
    expect(t.lastState.cart?.lines[0].qty).toBe(2);
  });

  it('carrito vacío o null → idle con cart null', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    expect(t.lastState.mode).toBe('order');
    h.emitter.setActiveCart(cart({ items: [] }));
    h.flush();
    expect(t.lastState).toEqual({ mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
    h.emitter.setActiveCart(null);
    h.flush();
    expect(t.states).toHaveLength(3);
  });

  it('la proyección es la de projectCartForDisplay con la moneda de start', () => {
    const h = harness();
    h.emitter.start({ organizationId: 120, currency: 'USD' });
    const c = cart({ items: [item({ id: 'l1', quantity: 2, unit_price: 1.5 })], total: 3 });
    h.emitter.setActiveCart(c);
    h.flush();
    const expected = projectCartForDisplay(c, { currency: 'USD' });
    expect(h.transport().lastState.cart).toEqual({ ...expected, lastChangedLineId: null });
  });

  it('resalta la línea que acaba de entrar o cambiar; con varias a la vez, ninguna', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    expect(t.lastState.cart?.lastChangedLineId).toBeNull(); // primera proyección de este carrito
    h.emitter.setCart(cart({ items: [item({ id: 'l1' }), item({ id: 'l2', product_id: 2 })], total: 10000 }));
    h.flush();
    expect(t.lastState.cart?.lastChangedLineId).toBe('l2');
    h.emitter.setCart(cart({ items: [item({ id: 'l1', quantity: 3 }), item({ id: 'l2', product_id: 2 })], total: 20000 }));
    h.flush();
    expect(t.lastState.cart?.lastChangedLineId).toBe('l1');
    h.emitter.setCart(cart({ items: [item({ id: 'l1', quantity: 4 }), item({ id: 'l2', product_id: 2, quantity: 4 })], total: 40000 }));
    h.flush();
    expect(t.lastState.cart?.lastChangedLineId).toBeNull();
  });

  it('flujo real: posService avisa la línea nueva y la página reenvía el mismo carrito (otro objeto) antes del rAF → UN state con lastChangedLineId', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const one = cart({ items: [item({ id: 'l1' })], total: 5000 });
    h.emitter.setActiveCart(one);
    h.flush();
    const before = t.states.length;
    const two = cart({ items: [item({ id: 'l1' }), item({ id: 'l2', product_id: 2 })], total: 10000 });
    h.emitter.onCartsSaved([two]); // addItemToCart → saveCartsToStorage
    h.emitter.setActiveCart(JSON.parse(JSON.stringify(two)) as Cart); // updateCartInState → efecto [activeCart]
    h.flush();
    expect(t.states.length).toBe(before + 1);
    expect(t.lastState.cart?.lastChangedLineId).toBe('l2');
  });

  it('el resaltado se limpia al publicar: una emisión posterior solo por totales (setTotals) no vuelve a resaltar', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    h.emitter.onCartsSaved([cart({ items: [item({ id: 'l1' }), item({ id: 'l2', product_id: 2 })], total: 10000 })]);
    h.flush();
    expect(t.lastState.cart?.lastChangedLineId).toBe('l2');
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 1900, total: 11900 });
    h.flush();
    expect(t.lastState.cart?.total).toBe(11900);
    expect(t.lastState.cart?.lastChangedLineId).toBeNull();
  });

  it('setTotals aplica los totales del recibo al carrito con ese id y los ignora para otro', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ id: 'a', items: [item({ id: 'l1' })], tax_total: 0, total: 5000 }));
    h.flush();
    h.emitter.setTotals('otro', { discountTotal: 0, taxTotal: 999, total: 999 });
    h.flush();
    expect(t.lastState.cart?.total).toBe(5000);
    h.emitter.setTotals('a', { discountTotal: 0, taxTotal: 950, total: 5950 });
    h.flush();
    expect(t.lastState.cart?.taxTotal).toBe(950);
    expect(t.lastState.cart?.total).toBe(5950);
    expect(t.lastState.cart?.subtotal).toBe(5000); // Σ líneas, nunca el override
    // El reenvío del MISMO carrito (otro objeto, mismas líneas) conserva el override.
    h.emitter.setCart(cart({ id: 'a', items: [item({ id: 'l1' })], tax_total: 0, total: 5000 }));
    h.flush();
    expect(t.lastState.cart?.total).toBe(5950);
    h.emitter.setTotals('a', null);
    h.flush();
    expect(t.lastState.cart?.total).toBe(5000);
  });

  it('el override CADUCA al mutar las líneas del mismo carrito: una línea más → el frame lleva el total del Cart, nunca el de la venta anterior (sonda qa ronda 4)', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const one = cart({ id: 'c1', items: [item({ id: 'l1' })], subtotal: 5000, tax_total: 0, total: 5000 });
    h.emitter.setActiveCart(one);
    h.emitter.setTotals('c1', { discountTotal: 0, taxTotal: 950, total: 5950 });
    h.flush();
    expect(t.lastState.cart?.total).toBe(5950);
    // posService añade una línea y recalcula con calculateCartTotals; TaxSummary aún no ha reenviado.
    const two = cart({
      id: 'c1',
      items: [item({ id: 'l1' }), item({ id: 'l2', product_id: 2, unit_price: 7500, total: 7500 })],
      subtotal: 12500,
      tax_total: 2375,
      total: 14875,
    });
    h.emitter.onCartsSaved([two]);
    h.flush();
    expect(t.lastState.cart?.lines).toHaveLength(2);
    expect(t.lastState.cart?.subtotal).toBe(12500);
    expect(t.lastState.cart?.total).toBe(14875);
    expect(t.lastState.cart?.total).not.toBe(5950);
    expect(t.lastState.cart?.taxTotal).toBe(2375);
    // Cambiar una cantidad también caduca el override.
    h.emitter.setTotals('c1', { discountTotal: 0, taxTotal: 2375, total: 14875 });
    h.flush();
    h.emitter.onCartsSaved([{ ...two, items: [item({ id: 'l1', quantity: 2, total: 10000 }), two.items[1]], subtotal: 17500, tax_total: 3325, total: 20825 }]);
    h.flush();
    expect(t.lastState.cart?.total).toBe(20825);
    // Inverso: cuando TaxSummary reenvía, el override vuelve a aplicarse sobre las líneas nuevas.
    h.emitter.setTotals('c1', { discountTotal: 0, taxTotal: 3300, total: 20800 });
    h.flush();
    expect(t.lastState.cart?.lines).toHaveLength(2);
    expect(t.lastState.cart?.total).toBe(20800);
    expect(t.lastState.cart?.taxTotal).toBe(3300);
    // Y el reenvío del mismo carrito por la página (mismas líneas) no lo pierde.
    h.emitter.setActiveCart({ ...two, items: [item({ id: 'l1', quantity: 2, total: 10000 }), two.items[1]], subtotal: 17500, tax_total: 3325, total: 20825 });
    h.flush();
    expect(t.lastState.cart?.total).toBe(20800);
  });

  it('vaciar el carrito descarta el override de totales: la primera línea nueva no hereda el total de la venta anterior', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const a = cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 });
    h.emitter.setActiveCart(a);
    h.emitter.setTotals('a', { discountTotal: 0, taxTotal: 950, total: 5950 });
    h.flush();
    expect(t.lastState.cart?.total).toBe(5950);
    // CartView no reenvía totales con subtotal 0: el emisor debe olvidarlos solo.
    h.emitter.onCartsSaved([{ ...a, items: [], total: 0 }]);
    h.flush();
    expect(t.lastState.mode).toBe('idle');
    h.emitter.onCartsSaved([{ ...a, items: [item({ id: 'l2', unit_price: 900, total: 900 })], total: 900 }]);
    h.flush();
    expect(t.lastState.cart?.total).toBe(900);
    expect(t.lastState.cart?.taxTotal).toBe(0);
  });

  it('cambiar de carrito descarta el override del anterior; volver a él usa los totales del carrito hasta que TaxSummary reenvíe', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    const a = cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 });
    const b = cart({ id: 'b', items: [item({ id: 'l2', unit_price: 900, total: 900 })], total: 900 });
    h.emitter.setActiveCart(a);
    h.emitter.setTotals('a', { discountTotal: 0, taxTotal: 950, total: 5950 });
    h.flush();
    expect(t.lastState.cart?.total).toBe(5950);
    h.emitter.setActiveCart(b);
    h.flush();
    expect(t.lastState.cart).toMatchObject({ id: 'b', total: 900 });
    h.emitter.setActiveCart(a);
    h.flush();
    expect(t.lastState.cart).toMatchObject({ id: 'a', total: 5000 }); // el override viejo ya no está
    h.emitter.setTotals('a', { discountTotal: 0, taxTotal: 950, total: 5950 });
    h.flush();
    expect(t.lastState.cart?.total).toBe(5950);
  });

  it('un override recibido para el carrito al que se va a cambiar se aplica al cambiar (TaxSummary puede adelantarse a setActiveCart)', () => {
    const h = harness();
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ id: 'a', items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    h.emitter.setTotals('b', { discountTotal: 0, taxTotal: 171, total: 1071 });
    h.emitter.setActiveCart(cart({ id: 'b', items: [item({ id: 'l2', unit_price: 900, total: 900 })], total: 900 }));
    h.flush();
    expect(t.lastState.cart).toMatchObject({ id: 'b', total: 1071, taxTotal: 171 });
  });
});

describe('DisplayEmitter · cobro, gracias y cancelación', () => {
  const withCart = () => {
    const h = harness({ thanksDurationMs: 50 });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1', quantity: 2 })], total: 10000 }));
    h.flush();
    return h;
  };

  it('setPayment pasa a payment con el carrito visible; efectivo en vivo actualiza recibido y cambio', () => {
    const h = withCart();
    const t = h.transport();
    h.emitter.setPayment({ method: 'cash', total: 10000, received: null, change: null });
    h.flush();
    expect(t.lastState.mode).toBe('payment');
    expect(t.lastState.cart?.lines).toHaveLength(1);
    expect(t.lastState.payment).toEqual({ method: 'cash', total: 10000, received: null, change: null });
    h.emitter.setPayment({ method: 'cash', total: 10000, received: 20000, change: 10000 });
    h.flush();
    expect(t.lastState.payment).toEqual({ method: 'cash', total: 10000, received: 20000, change: 10000 });
  });

  it('setPayment(null) o setMode(order) al cancelar vuelve a order', () => {
    const h = withCart();
    const t = h.transport();
    h.emitter.setPayment({ method: 'card', total: 10000, provider: null });
    h.flush();
    expect(t.lastState.mode).toBe('payment');
    h.emitter.setMode('order');
    h.flush();
    expect(t.lastState.mode).toBe('order');
    expect(t.lastState.payment).toBeNull();
  });

  it('thanks muestra el total pagado, sin cobro ni carrito, y vuelve a idle al vencer el temporizador', async () => {
    const h = withCart();
    const t = h.transport();
    h.emitter.setPayment({ method: 'qr', total: 10000, provider: 'Nequi', qr: null, expiresAt: null });
    h.flush();
    h.emitter.setActiveCart(cart({ items: [] })); // la caja creó un carrito nuevo tras cobrar
    h.emitter.setMode('thanks', { total: 10000 });
    h.flush();
    expect(t.lastState).toEqual({ mode: 'thanks', cart: null, payment: null, tip: null, thanks: { total: 10000, askRating: false } });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(h.pending()).toBe(true);
    h.flush();
    expect(t.lastState.mode).toBe('idle');
  });

  it('flujo real de cobro: el carrito vendido desaparece de pos_carts y, al vencer «Gracias», la pantalla pasa a reposo, nunca al carrito cobrado', async () => {
    const h = harness({ thanksDurationMs: 30 });
    h.emitter.start(START);
    const t = h.transport();
    const sold = cart({ id: 'vendido', items: [item({ id: 'l1', quantity: 2 })], total: 10000 });
    h.emitter.setActiveCart(sold);
    h.flush();
    h.emitter.setPayment({ method: 'cash', total: 10000, received: 20000, change: 10000 });
    h.flush();
    // POSService.checkout → removeCart → saveCartsToStorage([]) → onCartsSaved([]).
    h.emitter.onCartsSaved([]);
    h.emitter.setMode('thanks', { total: 10000 });
    h.flush();
    expect(t.lastState).toEqual({ mode: 'thanks', cart: null, payment: null, tip: null, thanks: { total: 10000, askRating: false } });
    // El cajero deja el recibo abierto (imprimir, factura electrónica) más de lo que dura «Gracias».
    await new Promise((resolve) => setTimeout(resolve, 60));
    h.flush();
    expect(t.lastState.mode).toBe('idle');
    expect(t.lastState.cart).toBeNull();
    // Al cerrar el recibo la página fija el carrito nuevo.
    h.emitter.setActiveCart(cart({ id: 'nuevo', items: [] }));
    h.flush();
    expect(t.lastState.mode).toBe('idle');
    h.emitter.setActiveCart(cart({ id: 'nuevo', items: [item({ id: 'l9' })], total: 5000 }));
    h.flush();
    expect(t.lastState).toMatchObject({ mode: 'order', cart: { id: 'nuevo' } });
  });

  it('la siguiente venta (una línea nueva avisada por posService) cierra el agradecimiento antes de los 8 s', () => {
    const h = withCart();
    const t = h.transport();
    h.emitter.onCartsSaved([]); // el carrito cobrado se eliminó
    h.emitter.setMode('thanks', { total: 10000 });
    h.flush();
    expect(t.lastState.mode).toBe('thanks');
    h.emitter.setActiveCart(cart({ id: 'cart-2', items: [] })); // la página fija el carrito nuevo, vacío
    h.flush();
    expect(t.lastState.mode).toBe('thanks');
    h.emitter.onCartsSaved([cart({ id: 'cart-2', items: [item({ id: 'l9' })], total: 5000 })]); // addItemToCart
    h.flush();
    expect(t.lastState.mode).toBe('order');
    expect(t.lastState.thanks).toBeNull();
    expect(t.lastState.cart?.lastChangedLineId).toBe('l9');
  });

  it('cambiar de pestaña (setActiveCart) a un carrito con líneas durante «Gracias» NO lo corta; al vencer se proyecta la pestaña activa (decisión ronda 3)', () => {
    jest.useFakeTimers();
    try {
      const h = harness({ thanksDurationMs: 8000 });
      h.emitter.start(START);
      const t = h.transport();
      h.emitter.setActiveCart(cart({ id: 'A', items: [item({ id: 'a1' })], total: 5000 }));
      h.flush();
      const b = cart({ id: 'B', status: 'hold', items: [item({ id: 'b1' })], total: 5000 });
      h.emitter.onCartsSaved([b]); // removeCart(A) tras cobrar
      h.emitter.setMode('thanks', { total: 5000 });
      h.flush();
      h.emitter.setActiveCart(b); // handleCheckoutComplete activa updatedCarts[0]
      h.flush();
      expect(t.lastState.mode).toBe('thanks');
      jest.advanceTimersByTime(8000);
      h.flush();
      expect(t.lastState).toMatchObject({ mode: 'order', cart: { id: 'B' } });
    } finally {
      jest.useRealTimers();
    }
  });

  it('un carrito con status hold_with_debt (facturado a crédito) no se proyecta: «Gracias» y luego reposo, nunca «Pedido»', () => {
    jest.useFakeTimers();
    try {
      const h = harness({ thanksDurationMs: 8000 });
      h.emitter.start(START);
      const t = h.transport();
      const a = cart({ id: 'A', items: [item({ id: 'a1' })], total: 5000 });
      h.emitter.setActiveCart(a);
      h.flush();
      h.emitter.onCartsSaved([{ ...a, status: 'hold_with_debt' }]); // holdCartWithDebt guarda el carrito
      h.emitter.setMode('thanks', { total: 5000 }); // CartView.handleHoldWithDebt
      h.flush();
      expect(t.lastState.mode).toBe('thanks');
      jest.advanceTimersByTime(8000);
      h.flush();
      expect(t.lastState).toMatchObject({ mode: 'idle', cart: null });
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['cancelled', 'completed'] as const)(
    'un carrito con status %s y líneas no se proyecta (lista blanca active/hold, como POSService.getActiveCarts): reposo con cart null',
    (status) => {
      const h = harness();
      h.emitter.start(START);
      const t = h.transport();
      const debt = cart({ id: 'c-deuda', status: 'hold_with_debt', items: [item({ id: 'l1', quantity: 2 })], subtotal: 10000, total: 10000 });
      h.emitter.setActiveCart(debt);
      h.flush();
      expect(t.lastState.mode).toBe('idle');
      // «Anular deuda»: cancelDebtWithCreditNote guarda el carrito con status cancelled y la página lo mantiene como pestaña activa.
      const ended = { ...debt, status };
      h.emitter.onCartsSaved([ended]);
      h.emitter.setActiveCart({ ...ended });
      h.flush();
      expect(t.lastState.mode).toBe('idle');
      expect(t.lastState.cart).toBeNull();
      // Y desde un pedido vivo con líneas también deja de verse.
      h.emitter.setActiveCart(cart({ id: 'vivo', items: [item({ id: 'l9' })], subtotal: 5000, total: 5000 }));
      h.flush();
      expect(t.lastState.mode).toBe('order');
      h.emitter.onCartsSaved([cart({ id: 'vivo', status, items: [item({ id: 'l9' })], subtotal: 5000, total: 5000 })]);
      h.flush();
      expect(t.lastState).toMatchObject({ mode: 'idle', cart: null });
    },
  );

  it('secuencia real de cobro con la línea temporal del navegador (setTimeout 0 en Node): removeCart → onCartsSaved([]) y setMode(thanks) en la misma vuelta ⇒ UN solo state y es «Gracias»', async () => {
    const transports: FakeTransport[] = [];
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      isEnabled: () => true,
      thanksDurationMs: 60000,
      // sin `schedule`: planificador por defecto (rAF en navegador, setTimeout(0) aquí)
    });
    emitter.start(START);
    const t = transports[0];
    emitter.setActiveCart(cart({ id: 'venta', items: [item({ id: 'l1', quantity: 3 })], subtotal: 15000, total: 15000 }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    emitter.setPayment({ method: 'cash', total: 15000, received: 20000, change: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(t.lastState.mode).toBe('payment');
    const before = t.states.length;
    // POSService.checkout: removeCart → saveCartsToStorage([]) → onCartsSaved([]); CheckoutDialog: setMode('thanks') tras el await (microtareas, sin macrotarea entre medias).
    await Promise.resolve().then(() => emitter.onCartsSaved([]));
    await Promise.resolve();
    emitter.setMode('thanks', { total: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(t.states.length).toBe(before + 1);
    expect(t.lastState).toEqual({ mode: 'thanks', cart: null, payment: null, tip: null, thanks: { total: 15000, askRating: false } });
    emitter.stop();
  });

  it('si un await real separa removeCart de setMode(thanks), el frame intermedio es «Reposo», nunca un «Cobro» con cart null', () => {
    const h = harness({ thanksDurationMs: 60000 });
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ id: 'venta', items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    h.flush();
    h.emitter.setPayment({ method: 'cash', total: 5000, received: 5000, change: 0 });
    h.flush();
    expect(t.lastState.mode).toBe('payment');
    h.emitter.onCartsSaved([]); // el carrito cobrado desapareció
    h.flush(); // …y pasó un frame antes de que CheckoutDialog pidiera «Gracias»
    expect(t.lastState).toMatchObject({ mode: 'idle', cart: null, payment: null });
    expect(t.states.some((s) => s.mode === 'payment' && s.cart === null)).toBe(false);
    h.emitter.setMode('thanks', { total: 5000 });
    h.flush();
    expect(t.lastState.mode).toBe('thanks');
    // Cancelar el cobro (setPayment(null)) con el carrito aún vivo sigue devolviendo a «Pedido»: la regla solo actúa cuando el carrito desaparece.
    h.emitter.setMode('order');
    h.emitter.setActiveCart(cart({ id: 'otra', items: [item({ id: 'l2' })], subtotal: 5000, total: 5000 }));
    h.emitter.setPayment({ method: 'card', total: 5000, provider: null });
    h.flush();
    expect(t.lastState.mode).toBe('payment');
    h.emitter.onCartsSaved([cart({ id: 'otra', items: [item({ id: 'l2' })], subtotal: 5000, total: 5000 })]); // reenvío sin cambios: el cobro sigue
    h.flush();
    expect(t.lastState.mode).toBe('payment');
    h.emitter.setPayment(null);
    h.flush();
    expect(t.lastState.mode).toBe('order');
  });

  it('setPayment y setMode antes de start se ignoran: el primer state de la caja no sale en payment ni thanks (CheckoutDialog fuera de /app/pos)', () => {
    const h = harness();
    h.emitter.setPayment({ method: 'cash', total: 9999, received: null, change: null });
    h.emitter.setMode('thanks', { total: 9999 });
    h.emitter.start(START);
    const t = h.transport();
    expect(t.lastState.mode).toBe('idle');
    expect(t.lastState.payment).toBeNull();
    expect(t.lastState.thanks).toBeNull();
    // Tras stop() (salir de /app/pos) tampoco quedan residentes.
    h.emitter.stop();
    h.emitter.setMode('thanks', { total: 1 });
    h.emitter.start(START);
    expect(h.transport().lastState.mode).toBe('idle');
  });

  it('thanks sin total explícito usa el total proyectado', () => {
    const h = withCart();
    h.emitter.setMode('thanks');
    h.flush();
    expect(h.transport().lastState.thanks).toEqual({ total: 10000, askRating: false });
  });

  it('closed manda sobre todo hasta order/idle', () => {
    const h = withCart();
    const t = h.transport();
    h.emitter.setMode('closed');
    h.flush();
    expect(t.lastState).toEqual({ mode: 'closed', cart: null, payment: null, tip: null, thanks: null });
    h.emitter.setPayment({ method: 'cash', total: 1, received: null, change: null });
    h.flush();
    expect(t.lastState.mode).toBe('closed');
    h.emitter.setMode('idle');
    h.flush();
    expect(t.lastState.mode).toBe('order'); // el carrito tiene líneas
  });

  it('THANKS_DURATION_MS es 8 s (PLAN §4.2)', () => {
    expect(THANKS_DURATION_MS).toBe(8000);
  });
});

describe('findChangedLineId', () => {
  const line = (id: string, qty = 1) => ({
    id,
    name: id,
    variant: null,
    qty,
    unitPrice: 1,
    total: qty,
    modifiers: [],
    discount: null,
    note: null,
    taxExcluded: false,
    taxIncluded: false,
  });
  const dc = (id: string, lines: ReturnType<typeof line>[]) => ({
    ...projectCartForDisplay(null, { currency: 'COP' }),
    id,
    lines,
  });

  it('null sin previo, con otro carrito, o sin cambios', () => {
    expect(findChangedLineId(null, dc('a', [line('x')]))).toBeNull();
    expect(findChangedLineId(dc('a', [line('x')]), dc('b', [line('x')]))).toBeNull();
    expect(findChangedLineId(dc('a', [line('x')]), dc('a', [line('x')]))).toBeNull();
    expect(findChangedLineId(dc('a', [line('x')]), null)).toBeNull();
  });

  it('la línea nueva o con cantidad distinta; una línea eliminada no resalta nada', () => {
    expect(findChangedLineId(dc('a', [line('x')]), dc('a', [line('x'), line('y')]))).toBe('y');
    expect(findChangedLineId(dc('a', [line('x', 1)]), dc('a', [line('x', 2)]))).toBe('x');
    expect(findChangedLineId(dc('a', [line('x'), line('y')]), dc('a', [line('x')]))).toBeNull();
  });
});

describe('sameLines', () => {
  const base = cart({ items: [item({ id: 'l1' }), item({ id: 'l2', product_id: 2 })], total: 10000 });
  const project = (c: Cart) => projectCartForDisplay(c, { currency: 'COP' });

  it('null/null iguales; null frente a carrito, otro id, otra cantidad de líneas u otro orden → distintos', () => {
    expect(sameLines(null, null)).toBe(true);
    expect(sameLines(null, project(base))).toBe(false);
    expect(sameLines(project(base), null)).toBe(false);
    expect(sameLines(project(base), project({ ...base, id: 'otro' }))).toBe(false);
    expect(sameLines(project(base), project({ ...base, items: [base.items[0]] }))).toBe(false);
    expect(sameLines(project(base), project({ ...base, items: [base.items[1], base.items[0]] }))).toBe(false);
  });

  it('mismo contenido en otro objeto → iguales; cambio de qty, precio, descuento, nota o modificadores → distintos', () => {
    expect(sameLines(project(base), project(JSON.parse(JSON.stringify(base)) as Cart))).toBe(true);
    const withL2 = (over: Partial<CartItem>) => project({ ...base, items: [base.items[0], { ...base.items[1], ...over }] });
    expect(sameLines(project(base), withL2({ quantity: 2 }))).toBe(false);
    expect(sameLines(project(base), withL2({ unit_price: 1 }))).toBe(false);
    expect(sameLines(project(base), withL2({ discount_amount: 100 }))).toBe(false);
    expect(sameLines(project(base), withL2({ notes: 'sin azúcar' } as Partial<CartItem>))).toBe(false);
    expect(sameLines(project(base), withL2({ modifiers: [{ groupId: 1, groupName: 'Extras', modifierId: 1, name: 'Extra', extraPrice: 0 }] } as Partial<CartItem>))).toBe(false);
  });
});

describe('toDisplayPayment', () => {
  it('cash: total, recibido y cambio; sin recibido, cambio null', () => {
    expect(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 10000, received: 20000, change: 10000 })).toEqual({
      method: 'cash',
      total: 10000,
      received: 20000,
      change: 10000,
    });
    expect(toDisplayPayment({ methodCode: 'cash', methodName: null, total: 10000, received: null, change: 5 })).toEqual({
      method: 'cash',
      total: 10000,
      received: null,
      change: null,
    });
  });

  it('card y bold_card → card; card sin proveedor, bold_card con el nombre del medio', () => {
    expect(toDisplayPayment({ methodCode: 'card', methodName: 'Tarjeta', total: 1 })).toEqual({ method: 'card', total: 1, provider: null });
    expect(toDisplayPayment({ methodCode: 'bold_card', methodName: 'Datáfono Bold', total: 1 })).toEqual({ method: 'card', total: 1, provider: 'Datáfono Bold' });
  });

  it('todos los medios QR → qr con qr null (la imagen llega en F2) y el nombre del medio', () => {
    for (const code of ['nequi', 'daviplata', 'breb_qr', 'bold_qr', 'bancolombia_qr', 'bancolombia_qr_wompi', 'redeban_qr', 'qr', 'transfer']) {
      expect(isQrPaymentCode(code)).toBe(true);
      expect(toDisplayPayment({ methodCode: code, methodName: 'Medio', total: 7 })).toEqual({
        method: 'qr',
        total: 7,
        provider: 'Medio',
        qr: null,
        expiresAt: null,
      });
    }
    expect(toDisplayPayment({ methodCode: 'NEQUI', methodName: null, total: 7 }).method).toBe('qr');
    expect(toDisplayPayment({ methodCode: 'nequi', methodName: null, total: 7 })).toMatchObject({ provider: 'nequi' });
  });

  it('un medio desconocido cae a card con el nombre del medio; total no numérico → 0', () => {
    expect(toDisplayPayment({ methodCode: 'bold_link', methodName: 'Enlace Bold', total: Number.NaN })).toEqual({
      method: 'card',
      total: 0,
      provider: 'Enlace Bold',
    });
    expect(isQrPaymentCode('bold_link')).toBe(false);
    expect(isQrPaymentCode('card')).toBe(false);
  });
});

describe('defaultScheduler · respaldo cuando requestAnimationFrame no dispara', () => {
  type RafGlobal = { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
  const g = globalThis as RafGlobal;
  let savedRaf: unknown;
  let savedCaf: unknown;

  beforeEach(() => {
    savedRaf = g.requestAnimationFrame;
    savedCaf = g.cancelAnimationFrame;
  });

  afterEach(() => {
    if (savedRaf === undefined) delete g.requestAnimationFrame;
    else g.requestAnimationFrame = savedRaf;
    if (savedCaf === undefined) delete g.cancelAnimationFrame;
    else g.cancelAnimationFrame = savedCaf;
  });

  it('sin rAF (Node) usa setTimeout(0)', async () => {
    delete g.requestAnimationFrame;
    delete g.cancelAnimationFrame;
    const schedule = defaultScheduler();
    let runs = 0;
    schedule(() => {
      runs += 1;
    });
    expect(runs).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(runs).toBe(1);
  });

  it('con un rAF que nunca dispara (pestaña oculta / ventana ocluida) el state sale igualmente por el respaldo', async () => {
    let cancelledRaf = 0;
    g.requestAnimationFrame = () => 42; // nunca invoca el callback
    g.cancelAnimationFrame = () => {
      cancelledRaf += 1;
    };
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
    emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    expect(transports[0].states).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, RAF_FALLBACK_MS + 40));
    expect(transports[0].states).toHaveLength(2);
    expect(transports[0].lastState.mode).toBe('order');
    expect(cancelledRaf).toBe(1); // el respaldo canceló el rAF pendiente
    emitter.stop();
  });

  it('si rAF dispara primero, fn corre UNA vez y el temporizador de respaldo se cancela', async () => {
    const callbacks: Array<() => void> = [];
    g.requestAnimationFrame = (cb: () => void) => {
      callbacks.push(cb);
      return callbacks.length;
    };
    g.cancelAnimationFrame = () => undefined;
    const schedule = defaultScheduler();
    let runs = 0;
    schedule(() => {
      runs += 1;
    });
    callbacks[0]();
    expect(runs).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, RAF_FALLBACK_MS + 40));
    expect(runs).toBe(1);
  });

  it('la cancelación devuelta cancela rAF y respaldo', async () => {
    const callbacks: Array<() => void> = [];
    let cancelledRaf = 0;
    g.requestAnimationFrame = (cb: () => void) => {
      callbacks.push(cb);
      return callbacks.length;
    };
    g.cancelAnimationFrame = () => {
      cancelledRaf += 1;
    };
    const schedule = defaultScheduler();
    let runs = 0;
    const cancel = schedule(() => {
      runs += 1;
    });
    cancel();
    expect(cancelledRaf).toBe(1);
    callbacks[0](); // un rAF que aun así dispara no ejecuta fn
    await new Promise((resolve) => setTimeout(resolve, RAF_FALLBACK_MS + 40));
    expect(runs).toBe(0);
  });
});

describe('resolveCashReceived (CheckoutDialog → pantalla del cliente)', () => {
  const none: ReadonlySet<string> = new Set();

  it('recién abierto (primer pago pre-rellenado con el total, sin tocar) → null: la pantalla muestra solo el total', () => {
    const payments = [{ id: 'p1', method: 'cash', amount: 20250 }];
    expect(resolveCashReceived(payments, none)).toBeNull();
    const payment = toDisplayPayment({
      methodCode: 'cash',
      methodName: 'Efectivo',
      total: 20250,
      received: resolveCashReceived(payments, none),
      change: null,
    });
    expect(payment).toEqual({ method: 'cash', total: 20250, received: null, change: null });
  });

  it('mixto: tarjeta tecleada 10.000 + efectivo pre-rellenado 10.250 → null (el cliente no ha entregado nada)', () => {
    const payments = [
      { id: 'p-card', method: 'card', amount: 10000 },
      { id: 'p-cash', method: 'cash', amount: 10250 },
    ];
    expect(resolveCashReceived(payments, new Set(['p-card']))).toBeNull();
    const payment = toDisplayPayment({
      methodCode: 'cash',
      methodName: 'Efectivo',
      total: 20250,
      received: resolveCashReceived(payments, new Set(['p-card'])),
      change: null,
    });
    expect(payment).toEqual({ method: 'cash', total: 20250, received: null, change: null });
  });

  it('mixto: efectivo tecleado 15.000 + tarjeta 10.000 → recibido 15.000 (solo el efectivo tocado)', () => {
    const payments = [
      { id: 'p-cash', method: 'cash', amount: 15000 },
      { id: 'p-card', method: 'card', amount: 10000 },
    ];
    expect(resolveCashReceived(payments, new Set(['p-cash']))).toBe(15000);
    expect(resolveCashReceived(payments, new Set(['p-cash', 'p-card']))).toBe(15000);
    const payment = toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 20250, received: 15000, change: 4750 });
    expect(payment).toEqual({ method: 'cash', total: 20250, received: 15000, change: 4750 });
  });

  it('reapertura del cobro reinicia el conjunto: con el id viejo y entradas nuevas → null', () => {
    const stale = new Set(['p-venta-anterior']);
    expect(resolveCashReceived([{ id: 'p-nueva', method: 'cash', amount: 5000 }], stale)).toBeNull();
    expect(resolveCashReceived([], stale)).toBeNull();
    // Lo que hace el efecto [open]: un Set vacío nuevo.
    expect(resolveCashReceived([{ id: 'p-nueva', method: 'cash', amount: 5000 }], new Set())).toBeNull();
  });

  it('solo se suman las entradas en efectivo tocadas; importes raros → 0; código en mayúsculas cuenta; entradas nulas o sin Set → null', () => {
    expect(
      resolveCashReceived(
        [
          { id: 'a', method: 'cash', amount: 5000 },
          { id: 'b', method: 'CASH ', amount: 2000 },
          { id: 'c', method: 'cash', amount: 100000 }, // pre-rellenada, sin tocar
          { id: 'd', method: 'nequi', amount: 999 },
        ],
        new Set(['a', 'b', 'd']),
      ),
    ).toBe(7000);
    expect(resolveCashReceived([{ id: 'a', method: 'card', amount: 10 }], new Set(['a']))).toBeNull();
    expect(resolveCashReceived([{ id: 'a', method: 'cash', amount: Number.NaN }], new Set(['a']))).toBe(0);
    expect(resolveCashReceived([], new Set(['a']))).toBeNull();
    expect(resolveCashReceived(null as unknown as [], new Set(['a']))).toBeNull();
    expect(resolveCashReceived([{ id: 'a', method: 'cash', amount: 1 }], null as unknown as ReadonlySet<string>)).toBeNull();
  });
});

describe('DisplayEmitter · reannounce (foco entre pestañas)', () => {
  it('vuelve a emitir hello + state con el estado actual; sin transporte no hace nada', () => {
    const h = harness();
    h.emitter.reannounce();
    expect(h.transports).toHaveLength(0);
    h.emitter.start(START);
    const t = h.transport();
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], total: 5000 }));
    h.flush();
    const before = t.published.length;
    h.emitter.reannounce();
    expect(t.types.slice(before)).toEqual(['hello', 'state']);
    expect(t.lastState.mode).toBe('order');
  });
});

// ---------------------------------------------------------------------------
// Fase 2 (parte A): firma de líneas en setTotals (deuda del QA de F0) y
// ajustes de presentación en hello.settings.
// ---------------------------------------------------------------------------

describe('DisplayEmitter · setTotals con firma de líneas (F2-A, deuda QA F0)', () => {
  const L1 = [item({ id: 'l1', quantity: 1, unit_price: 5000, total: 5000 })];
  const L2 = [item({ id: 'l1', quantity: 1, unit_price: 5000, total: 5000 }), item({ id: 'l2', quantity: 2, unit_price: 3000, total: 6000 })];

  it('linesSignature: misma firma ⇔ sameLines; cambia con cantidad, precio, descuento, nota o modificadores', () => {
    const a = projectCartForDisplay(cart({ items: L1 }), { currency: 'COP' });
    const b = projectCartForDisplay(cart({ items: [item({ id: 'l1', quantity: 1, unit_price: 5000, total: 5000 })] }), { currency: 'COP' });
    expect(linesSignature(a)).toBe(linesSignature(b));
    expect(sameLines(a, b)).toBe(true);
    const variants: Array<Partial<CartItem>> = [
      { quantity: 2 },
      { unit_price: 5100 },
      { discount_amount: 500 },
      { notes: 'sin azúcar' },
      { modifiers: [{ name: 'Leche', extra_price: 0 }] as unknown as CartItem['modifiers'] },
    ];
    for (const v of variants) {
      const c = projectCartForDisplay(cart({ items: [item({ id: 'l1', quantity: 1, unit_price: 5000, total: 5000, ...v })] }), { currency: 'COP' });
      expect(sameLines(a, c)).toBe(false);
      expect(linesSignature(a)).not.toBe(linesSignature(c));
    }
    expect(linesSignature(null)).toBe('');
    expect(cartLinesSignature(null)).toBe('');
    expect(cartLinesSignature(cart({ items: L1 }))).toBe(linesSignature(a));
    // Otro carrito con las mismas líneas: distinta firma (lleva el id del carrito).
    expect(cartLinesSignature(cart({ id: 'otro', items: L1 }))).not.toBe(linesSignature(a));
  });

  it('setCart(L1) → setCart(L2, mutación) → setTotals(id, totales de L1 con firma L1) ⇒ el state lleva los totales del Cart', () => {
    const h = harness();
    h.emitter.start(START);
    const c1 = cart({ items: L1, subtotal: 5000, tax_total: 950, total: 5950 });
    h.emitter.setActiveCart(c1);
    h.flush();
    const sigL1 = cartLinesSignature(c1);
    // Mutación real: entra l2 (posService acaba de guardar).
    const c2 = cart({ items: L2, subtotal: 11000, tax_total: 2090, total: 13090 });
    h.emitter.onCartsSaved([c2]);
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(13090);
    const before = h.transport().published.length;
    // TaxSummary reenvía sus totales VIEJOS (calculados con L1) tras cambiar la identidad del callback.
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 950, total: 5950 }, sigL1);
    expect(h.pending()).toBe(false); // ni siquiera se programa una emisión
    h.flush();
    expect(h.transport().published.length).toBe(before);
    const state = h.emitter.getState();
    expect(state.cart?.total).toBe(13090);
    expect(state.cart?.taxTotal).toBe(2090);
    // Con la firma correcta (L2) sí se aplican.
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 2100, total: 13100 }, cartLinesSignature(c2));
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(13100);
  });

  it('ronda 2: la firma y sameLines ven tax_excluded / tax_included (DisplayLine los lleva)', () => {
    const base = projectCartForDisplay(cart({ items: [item({ id: 'l1', tax_excluded: false, tax_included: false })] }), { currency: 'COP' });
    const excluded = projectCartForDisplay(cart({ items: [item({ id: 'l1', tax_excluded: true, tax_included: false })] }), { currency: 'COP' });
    const included = projectCartForDisplay(cart({ items: [item({ id: 'l1', tax_excluded: false, tax_included: true })] }), { currency: 'COP' });
    expect(sameLines(base, excluded)).toBe(false);
    expect(sameLines(base, included)).toBe(false);
    expect(linesSignature(base)).not.toBe(linesSignature(excluded));
    expect(linesSignature(base)).not.toBe(linesSignature(included));
    expect(linesSignature(excluded)).not.toBe(linesSignature(included));
    // Documentado: alternar el impuesto cuenta como cambio de línea → se resalta esa línea (600 ms).
    expect(findChangedLineId(base, excluded)).toBe('l1');
  });

  it('ronda 2: setActiveCart(l1) → setTotals(firma) → onCartsSaved(l1 con tax_excluded=true) ⇒ el state lleva el total del Cart, no el override con impuesto', () => {
    const h = harness();
    h.emitter.start(START);
    const c1 = cart({ items: [item({ id: 'l1', tax_excluded: false })], subtotal: 5000, tax_total: 950, total: 5950 });
    h.emitter.setActiveCart(c1);
    h.flush();
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 950, total: 5950 }, cartLinesSignature(c1));
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(5950);
    // El cajero pulsa «Excluir impuesto de este producto»: posService guarda el carrito con tax_total 0.
    const c2 = cart({ items: [item({ id: 'l1', tax_excluded: true })], subtotal: 5000, tax_total: 0, total: 5000 });
    expect(cartLinesSignature(c2)).not.toBe(cartLinesSignature(c1));
    h.emitter.onCartsSaved([c2]);
    h.flush();
    const state = h.transport().lastState;
    expect(state.cart?.lines[0]?.taxExcluded).toBe(true);
    expect(state.cart?.total).toBe(5000); // el override con el impuesto que ya no existe se descartó
    expect(state.cart?.taxTotal).toBe(0);
    // Y el reenvío de los totales VIEJOS de TaxSummary (firma de c1) tampoco entra.
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 950, total: 5950 }, cartLinesSignature(c1));
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(5000);
  });

  it('sin firma se comporta como antes: solo se comprueba el id del carrito', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: L2, total: 13090 }));
    h.flush();
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 1, total: 42 });
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(42);
  });

  it('override con firma que llega ANTES del carrito: se conserva si casa con las líneas reales y se descarta si no', () => {
    const h = harness();
    h.emitter.start(START);
    const c2 = cart({ items: L2, subtotal: 11000, tax_total: 2090, total: 13090 });
    // Firma de L2 antes de activar el carrito (TaxSummary se adelanta a setActiveCart): casa → se aplica.
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 2100, total: 13100 }, cartLinesSignature(c2));
    h.emitter.setActiveCart(c2);
    h.flush();
    expect(h.transport().lastState.cart?.total).toBe(13100);

    const h2 = harness();
    h2.emitter.start(START);
    // Firma de L1 pero el carrito que llega tiene L2: no casa → totales del Cart.
    h2.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 950, total: 5950 }, cartLinesSignature(cart({ items: L1 })));
    h2.emitter.setActiveCart(c2);
    h2.flush();
    expect(h2.transport().lastState.cart?.total).toBe(13090);
  });

  it('la misma firma con los mismos totales no reemite (deduplicación)', () => {
    const h = harness();
    h.emitter.start(START);
    const c = cart({ items: L1, total: 5950 });
    h.emitter.setActiveCart(c);
    h.flush();
    const sig = cartLinesSignature(c);
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 950, total: 5950 }, sig);
    h.flush();
    const count = h.emitter.emittedStateCount;
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 950, total: 5950 }, sig);
    expect(h.pending()).toBe(false);
    expect(h.emitter.emittedStateCount).toBe(count);
  });
});

describe('DisplayEmitter · hello.settings y refresh() con el transporte abierto (F2-A)', () => {
  const settings = {
    tips: { enabled: true, presets: [5, 10, 15], allowCustom: true },
    rating: { enabled: false },
    showTaxBreakdown: true,
    showCustomerName: false,
    locale: null,
    touch: 'auto' as const,
  };

  function harnessWithSettings(get: () => typeof settings) {
    const enabled = { value: true };
    const transports: FakeTransport[] = [];
    const sched = manualScheduler();
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      isEnabled: () => enabled.value,
      getSettings: get,
      schedule: sched.schedule,
    });
    return { emitter, transports, enabled, flush: sched.flush, transport: () => transports[transports.length - 1] };
  }

  it('sin getSettings el hello no lleva settings (forma de la Fase 0); con getSettings los lleva en cada saludo', () => {
    const h0 = harness();
    h0.emitter.start(START);
    expect(h0.transport().published[0]).not.toHaveProperty('settings');

    const h = harnessWithSettings(() => settings);
    h.emitter.start(START);
    const hello = h.transport().published[0] as HelloDraft;
    expect(hello.t).toBe('hello');
    expect(hello.settings).toEqual(settings);
    h.transport().emitUp(needSnapshot());
    const again = h.transport().published[h.transport().published.length - 2] as HelloDraft;
    expect(again.settings).toEqual(settings);
  });

  it('refresh() con el transporte YA abierto vuelve a saludar con los ajustes nuevos (la tarjeta guardó)', () => {
    let current = settings;
    const h = harnessWithSettings(() => current);
    h.emitter.start(START);
    const t = h.transport();
    const before = t.published.length;
    current = { ...settings, tips: { enabled: true, presets: [8, 12, 18], allowCustom: false } };
    h.emitter.refresh();
    expect(t.types.slice(before)).toEqual(['hello', 'state']);
    expect((t.published[before] as HelloDraft).settings?.tips.presets).toEqual([8, 12, 18]);
    expect(h.transports).toHaveLength(1); // no reabre el transporte
  });

  it('start() repetido con getSettings saluda UNA sola vez (refresh ya lo hizo)', () => {
    const h = harnessWithSettings(() => settings);
    h.emitter.start(START);
    const t = h.transport();
    const before = t.published.length;
    h.emitter.start({ ...START, cashier: { name: 'Andrea' } });
    expect(t.types.slice(before)).toEqual(['hello', 'state']);
    expect((t.published[before] as HelloDraft).cashier).toEqual({ name: 'Andrea' });
  });

  it('refresh() sin getSettings y con transporte abierto no reemite nada (comportamiento de la Fase 0)', () => {
    const h = harness();
    h.emitter.start(START);
    const before = h.transport().published.length;
    h.emitter.refresh();
    expect(h.transport().published.length).toBe(before);
  });

  it('getSettings que lanza: el hello sale igual, sin settings, y se avisa', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harnessWithSettings(() => {
      throw new Error('caché rota');
    });
    h.emitter.start(START);
    const hello = h.transport().published[0] as HelloDraft;
    expect(hello.t).toBe('hello');
    expect(hello).not.toHaveProperty('settings');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ronda 2: getSettings que devuelve null/undefined/array: el hello sale SIN settings (isDownMessage lo acepta)', () => {
    for (const bad of [null, undefined, [], 'x', 42]) {
      const h = harnessWithSettings(() => bad as never);
      h.emitter.start(START);
      const hello = h.transport().published[0] as HelloDraft;
      expect(hello.t).toBe('hello');
      expect(hello).not.toHaveProperty('settings');
      expect(isDownMessage({ v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: 'i1', ...hello })).toBe(true);
    }
  });

  it('isDownMessage acepta hello con settings objeto y rechaza settings que no sea objeto', () => {
    const base = { v: PROTOCOL_VERSION, t: 'hello', seq: 0, terminalId: TERMINAL, instanceId: 'i1', organizationId: 120, cashier: null, sessionOpen: true };
    expect(isDownMessage({ ...base })).toBe(true);
    expect(isDownMessage({ ...base, settings })).toBe(true);
    expect(isDownMessage({ ...base, settings: 'x' })).toBe(false);
    expect(isDownMessage({ ...base, settings: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ronda 3 de F2-A (QA medio #1): refresh() con el transporte abierto solo
// resaluda desde una ventana VISIBLE. Guardar la tarjeta en otra ventana
// dispara refresh() en TODAS las pestañas de /app/pos; sin esta regla la
// pantalla seguía a la última en saludar, que podía ser la de fondo.
// ---------------------------------------------------------------------------

describe('DisplayEmitter · refresh() solo saluda si la ventana está visible: resaludo (F2-A ronda 3) y apertura del transporte (ronda 4)', () => {
  const settings = {
    tips: { enabled: true, presets: [5, 10, 15], allowCustom: true },
    rating: { enabled: false },
    showTaxBreakdown: false,
    showCustomerName: false,
    locale: null,
    touch: 'auto' as const,
  };

  /** `document` falso: el emisor no lo lee directamente, se inyecta `isVisible` como hace posDisplay.ts con defaultIsVisible. */
  function harnessVisible(doc: { visibilityState: 'visible' | 'hidden' }, withSettings = true) {
    const transports: FakeTransport[] = [];
    const sched = manualScheduler();
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      isEnabled: () => true,
      getSettings: withSettings ? () => settings : undefined,
      isVisible: () => doc.visibilityState === 'visible',
      schedule: sched.schedule,
    });
    return { emitter, transports, transport: () => transports[transports.length - 1] };
  }

  it('ventana VISIBLE (ronda 4): encender desde refresh() abre el transporte Y saluda (la rama de apertura solo calla cuando la ventana está oculta)', () => {
    const doc = { visibilityState: 'visible' as 'visible' | 'hidden' };
    const enabled = { value: false };
    const transports: FakeTransport[] = [];
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      isEnabled: () => enabled.value,
      getSettings: () => settings,
      isVisible: () => doc.visibilityState === 'visible',
      schedule: manualScheduler().schedule,
    });
    emitter.start(START);
    enabled.value = true;
    emitter.refresh();
    expect(transports).toHaveLength(1);
    expect(transports[0].types).toEqual(['hello', 'state']);
  });

  it('ventana oculta: refresh() con el transporte abierto NO reemite hello ni state; visible: sí', () => {
    const doc = { visibilityState: 'hidden' as 'visible' | 'hidden' };
    const h = harnessVisible(doc);
    h.emitter.start(START);
    expect(h.transport().types).toEqual(['hello', 'state']); // abrir el transporte desde start() no depende de la visibilidad
    h.emitter.refresh();
    h.emitter.refresh();
    expect(h.transport().types).toEqual(['hello', 'state']);

    doc.visibilityState = 'visible';
    h.emitter.refresh();
    expect(h.transport().types).toEqual(['hello', 'state', 'hello', 'state']);
    expect(h.transports).toHaveLength(1);
  });

  it('ventana oculta: reannounce() (visibilitychange/focus de la página) sí saluda y lleva los ajustes de la caché en ese momento', () => {
    const doc = { visibilityState: 'hidden' as 'visible' | 'hidden' };
    const h = harnessVisible(doc);
    h.emitter.start(START);
    h.emitter.refresh(); // ignorado: oculta
    h.emitter.reannounce();
    expect(h.transport().types).toEqual(['hello', 'state', 'hello', 'state']);
    expect((h.transport().published[2] as HelloDraft).settings).toEqual(settings);
  });

  it('ventana oculta (ronda 4): encender abre el transporte (latido incluido) pero NO saluda; need_snapshot de la pantalla sí obtiene hello + state; apagar cierra igual', () => {
    const doc = { visibilityState: 'hidden' as 'visible' | 'hidden' };
    const enabled = { value: false };
    const transports: FakeTransport[] = [];
    const sched = manualScheduler();
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      isEnabled: () => enabled.value,
      getSettings: () => settings,
      isVisible: () => doc.visibilityState === 'visible',
      schedule: sched.schedule,
    });
    emitter.start(START);
    expect(transports).toHaveLength(0);
    enabled.value = true;
    emitter.refresh();
    expect(transports).toHaveLength(1);
    expect(emitter.isEmitting).toBe(true);
    expect(transports[0].heartbeatStarted).toBe(1); // el latido sale aunque no salude
    expect(transports[0].types).toEqual([]); // oculta: no releva a la pestaña que el cajero tiene delante
    // Una pestaña única en segundo plano: la pantalla la adopta por latido y pide snapshot; se responde sin mirar la visibilidad.
    transports[0].emitUp({ v: PROTOCOL_VERSION, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: false, width: 1280, height: 800 } });
    expect(transports[0].types).toEqual(['hello', 'state']);
    expect((transports[0].published[0] as HelloDraft).settings).toEqual(settings);
    enabled.value = false;
    emitter.refresh();
    expect(transports[0].closed).toBe(true);
    expect(emitter.isEmitting).toBe(false);
  });

  it('ventana oculta: start() repetido (datos de ESTA caja) sigue resaludando, como en la Fase 0', () => {
    const doc = { visibilityState: 'hidden' as 'visible' | 'hidden' };
    const h = harnessVisible(doc);
    h.emitter.start(START);
    h.emitter.start({ ...START, cashier: { name: 'Andrea' } });
    expect(h.transport().types).toEqual(['hello', 'state', 'hello', 'state']);
    expect((h.transport().published[2] as HelloDraft).cashier).toEqual({ name: 'Andrea' });
  });

  it('isVisible que lanza cuenta como visible (se avisa) y nunca rompe refresh()', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const transports: FakeTransport[] = [];
    const sched = manualScheduler();
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = new FakeTransport();
        transports.push(t);
        return t;
      },
      isEnabled: () => true,
      getSettings: () => settings,
      isVisible: () => {
        throw new Error('document roto');
      },
      schedule: sched.schedule,
    });
    emitter.start(START);
    emitter.refresh();
    expect(transports[0].types).toEqual(['hello', 'state', 'hello', 'state']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('defaultIsVisible: sin document → true; con document lee visibilityState; si lanza → true', () => {
    const g = globalThis as { document?: unknown };
    const original = Object.getOwnPropertyDescriptor(g, 'document');
    try {
      delete g.document;
      expect(defaultIsVisible()).toBe(true);
      Object.defineProperty(g, 'document', { value: { visibilityState: 'hidden' }, configurable: true, writable: true });
      expect(defaultIsVisible()).toBe(false);
      Object.defineProperty(g, 'document', { value: { visibilityState: 'visible' }, configurable: true, writable: true });
      expect(defaultIsVisible()).toBe(true);
      Object.defineProperty(g, 'document', {
        get() {
          throw new Error('sin acceso');
        },
        configurable: true,
      });
      expect(defaultIsVisible()).toBe(true);
    } finally {
      if (original) Object.defineProperty(g, 'document', original);
      else delete g.document;
    }
  });
});
