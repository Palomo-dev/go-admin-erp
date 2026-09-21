/**
 * Tester · ronda 4 · Parte C (/pos-display).
 *
 * Extremo a extremo con el emisor REAL de la Parte B (DisplayEmitter +
 * BroadcastChannelTransport) y el enlace REAL de la Parte C
 * (BroadcastChannelReceiver + startDisplayLink + resolveView +
 * resolveDisplayCurrency), sobre un BroadcastChannel de Node ≥ 18. Es lo
 * más cerca del navegador que se puede llegar sin DOM: los tests de
 * display-link.test.ts simulan la caja a mano; aquí habla la caja de verdad.
 *
 * Cubre la lista de feedback de la ronda 3 tal como la ve el cliente:
 *  - qa-1 / T1: moneda del hello en «Gracias» (state sin carrito) con una
 *    pantalla abierta DESPUÉS de confirmar la venta.
 *  - qa-2 / T2: caja viva sin estado → Conectando, nunca Reposo.
 *  - Aceptación de la Fase 0 (PLAN §12): cerrar la caja deja la pantalla en
 *    Conectando de inmediato (bye), y recargar la pantalla recupera la venta
 *    completa sin resaltar nada.
 * Y los casos de error del protocolo a nivel de enlace: basura en el canal,
 * versión desconocida, `seq` fuera de orden, terminal ajena e interruptor
 * apagado (`enabled=false`).
 *
 * Tiempos a escala (latido 100 ms, silencio 300 ms, need_snapshot cada
 * 200 ms, salud cada 50 ms), esperas por sondeo. Organización ficticia
 * (org 120). Sin nombres reales.
 */

import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import type { DisplayState, DownMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName } from '@/lib/pos/display/transport';
import { resolveDisplayCurrency, resolveView, viewShowsAmounts, type DisplayView } from '@/components/pos-display/logic';
import { startDisplayLink, type DisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_X = 'cccccccc-0000-4000-8000-00000000000c';

const HEARTBEAT_MS = 100;
const STALE_MS = 300;
const RESNAPSHOT_MS = 200;
const HEALTH_MS = 50;
const TO_IDLE_MS = 400;

const hasBC = typeof BroadcastChannel === 'function';
const itBC = hasBC ? it : it.skip;

const tick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(done: () => boolean, timeoutMs = 3000, what = 'condición'): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`until: ${what} no cumplida a tiempo`);
    await tick(5);
  }
}

// ---------------------------------------------------------------------------
// Fixtures del carrito de la caja (tipos reales del POS)
// ---------------------------------------------------------------------------

function item(overrides: Partial<CartItem> & { id: string }): CartItem {
  return {
    product_id: 1,
    product: { id: 1, name: `Producto ${overrides.id}` } as CartItem['product'],
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

// ---------------------------------------------------------------------------
// Arneses
// ---------------------------------------------------------------------------

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
});

/** La caja real: emisor de la Parte B sobre el transporte real, con latido a escala. */
function cashier(opts: { enabled?: boolean; terminalId?: string; currency?: string } = {}) {
  const enabled = { value: opts.enabled ?? true };
  const emitter = new DisplayEmitter({
    createTransport: () => new BroadcastChannelTransport({ terminalId: opts.terminalId ?? TERMINAL, heartbeatIntervalMs: HEARTBEAT_MS }),
    isEnabled: () => enabled.value,
    thanksDurationMs: 60_000,
  });
  opened.push({ close: () => emitter.stop() });
  emitter.start({ organizationId: 120, currency: opts.currency ?? 'USD', cashier: { name: 'Andrea' }, sessionOpen: true });
  return { emitter, enabled };
}

interface Screen {
  link: DisplayLink;
  receiver: BroadcastChannelReceiver;
  snapshots: DisplayLinkSnapshot[];
  latest(): DisplayLinkSnapshot;
  view(): DisplayView;
  views(): DisplayView[];
  currency(): string;
}

/** La pantalla real: receptor de la Parte A + enlace de la Parte C. */
function screen(opts: { terminalId?: string } = {}): Screen {
  const receiver = track(
    new BroadcastChannelReceiver({
      terminalId: opts.terminalId ?? TERMINAL,
      staleAfterMs: STALE_MS,
      presenceIntervalMs: 60_000,
      adoptionWindowMs: 50,
    }),
  );
  const snapshots: DisplayLinkSnapshot[] = [];
  const link = startDisplayLink({
    receiver,
    capabilities: () => ({ touch: false, width: 1366, height: 768 }),
    onChange: (s) => snapshots.push(s),
    staleAfterMs: STALE_MS,
    resnapshotIntervalMs: RESNAPSHOT_MS,
    healthIntervalMs: HEALTH_MS,
    disconnectedToIdleMs: TO_IDLE_MS,
  });
  opened.push({ close: () => link.stop() });
  const toView = (s: DisplayLinkSnapshot) =>
    resolveView({ connected: s.connected, disconnectedTooLong: s.disconnectedTooLong, updateRequired: s.updateRequired, state: s.state });
  /** Lo mismo que hace CustomerDisplay.tsx para elegir moneda (sin el recuerdo entre renders). */
  const currencyOf = (s: DisplayLinkSnapshot) =>
    resolveDisplayCurrency({ cartCurrency: s.state?.cart?.currency, helloCurrency: s.hello?.currency, remembered: null });
  return {
    link,
    receiver,
    snapshots,
    latest: () => link.snapshot,
    view: () => toView(link.snapshot),
    views: () => snapshots.map(toView),
    currency: () => currencyOf(link.snapshot),
  };
}

/** Un emisor crudo en el canal de la terminal para meter sobres arbitrarios (basura, otra versión, seq manual). */
function rawChannel(terminalId = TERMINAL): BroadcastChannel {
  return track(new BroadcastChannel(displayChannelName(terminalId)));
}

/** Observa lo que sube por el canal (need_snapshot, display_alive…). */
function upObserver(terminalId = TERMINAL) {
  const ch = rawChannel(terminalId);
  const ups: string[] = [];
  ch.onmessage = (event: MessageEvent) => {
    const t = (event.data as { t?: unknown })?.t;
    if (typeof t === 'string') ups.push(t);
  };
  return { needSnapshots: () => ups.filter((t) => t === 'need_snapshot').length };
}

// ---------------------------------------------------------------------------
// Camino feliz con la caja real
// ---------------------------------------------------------------------------

describe('Parte C · camino feliz con el emisor real', () => {
  itBC('reposo → pedido → cobro efectivo → gracias: vista, importes y moneda coherentes con la caja', async () => {
    const c = cashier({ currency: 'USD' });
    const s = screen();

    // Snapshot inicial: hello con moneda y state en reposo.
    await until(() => s.latest().state !== null, 2000, 'snapshot inicial');
    expect(s.latest().hello).toEqual({ organizationId: 120, cashier: { name: 'Andrea' }, sessionOpen: true, currency: 'USD' });
    expect(s.view()).toBe('idle');
    expect(s.latest().highlightUntil).toBe(0);

    // Como en el POS real: primero se activa el carrito vacío (pestaña nueva) y
    // después posService guarda la primera línea (onCartsSaved). Pedido,
    // resaltado (Reposo → primera línea), total igual al de la caja.
    c.emitter.setActiveCart(cart({ id: 'cart-1' }));
    await tick(20);
    expect(s.view()).toBe('idle');
    c.emitter.onCartsSaved([cart({ id: 'cart-1', items: [item({ id: 'l1', quantity: 2, total: 10000 })], subtotal: 10000, total: 10000 })]);
    await until(() => s.view() === 'order', 2000, 'pedido');
    const order = s.latest();
    expect(order.state?.cart?.lines.map((l) => [l.id, l.qty])).toEqual([['l1', 2]]);
    expect(order.state?.cart?.total).toBe(10000);
    expect(order.state?.cart?.currency).toBe('USD');
    expect(order.state?.cart?.lastChangedLineId).toBe('l1');
    expect(s.currency()).toBe('USD');
    expect(order.highlightUntil).toBeGreaterThan(0);

    // Cobro en efectivo: total, recibido y cambio tal cual los mandó la caja.
    c.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 10000, received: 20000, change: 10000 }));
    await until(() => s.view() === 'payment_cash', 2000, 'cobro efectivo');
    expect(s.latest().state?.payment).toEqual({ method: 'cash', total: 10000, received: 20000, change: 10000 });
    expect(viewShowsAmounts(s.view())).toBe(true);

    // Gracias: el state no trae carrito y la moneda sale del hello (qa-1).
    c.emitter.setMode('thanks', { total: 10000 });
    await until(() => s.view() === 'thanks', 2000, 'gracias');
    expect(s.latest().state?.cart).toBeNull();
    expect(s.latest().state?.thanks).toEqual({ total: 10000, askRating: false });
    expect(s.currency()).toBe('USD');
    // Desde que llegó el primer estado no se volvió a pasar por Conectando ni por «Actualice»
    // (antes del primer state la pantalla está, correctamente, en Conectando).
    const views = s.views();
    const firstPainted = views.findIndex((v) => v !== 'connecting');
    expect(firstPainted).toBeGreaterThanOrEqual(0);
    expect(views.slice(firstPainted)).toEqual(['idle', 'order', 'payment_cash', 'thanks']);
  });

  itBC('qa-1 / T1: pantalla abierta DESPUÉS de confirmar la venta (durante Gracias) pinta la moneda de la caja, no el respaldo', async () => {
    const c = cashier({ currency: 'USD' });
    c.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    c.emitter.setMode('thanks', { total: 5000 });
    await tick(20);

    const s = screen();
    await until(() => s.latest().state?.mode === 'thanks', 2000, 'snapshot en Gracias');
    expect(s.latest().state?.cart).toBeNull();
    expect(s.latest().hello?.currency).toBe('USD');
    expect(s.currency()).toBe('USD');
    expect(s.view()).toBe('thanks');
    expect(s.latest().highlightUntil).toBe(0);
  });

  itBC('qa-1 / T1: pantalla abierta durante un cobro con carrito vacío (sin líneas) también toma la moneda del hello', async () => {
    const c = cashier({ currency: 'EUR' });
    // Cobro sin carrito (p. ej. venta rápida sin líneas proyectadas): el state lleva payment y cart null.
    c.emitter.setPayment(toDisplayPayment({ methodCode: 'card', methodName: 'Tarjeta', total: 12.5 }));
    await tick(20);

    const s = screen();
    await until(() => s.latest().state?.mode === 'payment', 2000, 'snapshot en cobro');
    expect(s.latest().state?.cart).toBeNull();
    expect(s.view()).toBe('payment_card');
    expect(s.currency()).toBe('EUR');
  });
});

// ---------------------------------------------------------------------------
// Aceptación de la Fase 0 (PLAN §12)
// ---------------------------------------------------------------------------

describe('Parte C · aceptación de la Fase 0 con la caja real', () => {
  itBC('cerrar la caja (stop → bye) deja la pantalla en Conectando de inmediato y oculta importes', async () => {
    const c = cashier();
    const s = screen();
    c.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    await until(() => s.view() === 'order', 2000, 'pedido');

    const t0 = Date.now();
    c.emitter.stop();
    await until(() => s.view() === 'connecting', STALE_MS, 'Conectando tras bye');
    // Por el bye, no por el silencio: mucho antes de STALE_MS.
    expect(Date.now() - t0).toBeLessThan(STALE_MS);
    expect(viewShowsAmounts(s.view())).toBe(false);
    expect(s.latest().state).toBeNull();
    expect(s.latest().hello).toBeNull();
  });

  itBC('recargar la pantalla (stop + enlace nuevo) recupera la venta completa sin resaltar', async () => {
    const c = cashier();
    const first = screen();
    const full = cart({
      items: [item({ id: 'l1', quantity: 2, total: 10000 }), item({ id: 'l2', unit_price: 7500, total: 7500 })],
      subtotal: 17500,
      total: 17500,
    });
    c.emitter.setActiveCart(full);
    await until(() => first.latest().state?.cart?.lines.length === 2, 2000, 'pedido en la primera pantalla');
    first.link.stop();

    const second = screen();
    await until(() => second.latest().state?.cart?.lines.length === 2, 2000, 'pedido recuperado');
    expect(second.view()).toBe('order');
    expect(second.latest().state?.cart?.lines.map((l) => [l.id, l.qty, l.total])).toEqual([
      ['l1', 2, 10000],
      ['l2', 1, 7500],
    ]);
    expect(second.latest().state?.cart?.total).toBe(17500);
    // Es el snapshot de lo que la caja ya tenía: no resalta (PLAN §4.1.2).
    expect(second.latest().highlightUntil).toBe(0);
    // Y nunca pasó por Reposo con datos desconocidos.
    expect(second.views()).not.toContain('idle');
  });

  itBC('qa-2 / T2: caja real que solo late (transporte abierto, sin announce) → Conectando y need_snapshot repetido; al anunciar, Pedido', async () => {
    const up = upObserver();
    const s = screen();
    await until(() => up.needSnapshots() >= 1, 1000, 'need_snapshot inicial');

    // Un transporte crudo con latido y sin hello/state: la pantalla lo adopta por el latido.
    const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: HEARTBEAT_MS }));
    t.startHeartbeat();
    await until(() => s.latest().connected === true, 2000, 'viva por el latido');
    expect(s.latest().state).toBeNull();
    expect(s.view()).toBe('connecting');
    const before = up.needSnapshots();
    await until(() => up.needSnapshots() >= before + 2, RESNAPSHOT_MS * 4, 'need_snapshot repetido a la caja muda');
    expect(s.views()).not.toContain('idle');

    // Cuando por fin anuncia, se pinta el pedido.
    const state: DisplayState = {
      mode: 'order',
      cart: {
        id: 'c-x',
        currency: 'USD',
        lines: [{ id: 'x1', name: 'Producto', variant: null, qty: 1, unitPrice: 1, total: 1, modifiers: [], discount: null, note: null, taxExcluded: false, taxIncluded: false }],
        subtotal: 1,
        discountTotal: 0,
        discountLabel: null,
        taxTotal: 0,
        taxIncluded: false,
        total: 1,
        lastChangedLineId: 'x1',
      },
      payment: null,
      tip: null,
      thanks: null,
    };
    t.announce({ t: 'hello', organizationId: 120, cashier: null, sessionOpen: true, currency: 'USD' }, state);
    await until(() => s.view() === 'order', 2000, 'pedido tras announce');
    expect(s.latest().highlightUntil).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Casos de error del protocolo, vistos desde el enlace
// ---------------------------------------------------------------------------

describe('Parte C · errores de protocolo a nivel de enlace', () => {
  itBC('interruptor apagado (enabled=false): la caja no emite; la pantalla pide snapshot en bucle y cae a Reposo tras el plazo; al encender, conecta', async () => {
    const up = upObserver();
    const c = cashier({ enabled: false });
    const s = screen();
    expect(c.emitter.isEmitting).toBe(false);

    await until(() => up.needSnapshots() >= 3, RESNAPSHOT_MS * 6, 'need_snapshot en bucle');
    expect(s.latest().connected).toBe(false);
    await until(() => s.latest().disconnectedTooLong === true, TO_IDLE_MS * 3, 'plazo sin caja');
    expect(s.view()).toBe('idle');
    expect(viewShowsAmounts(s.view())).toBe(false);

    c.enabled.value = true;
    c.emitter.refresh();
    await until(() => s.latest().state !== null, 2000, 'conecta al encender');
    expect(s.latest().connected).toBe(true);
    expect(s.latest().disconnectedTooLong).toBe(false);
    expect(s.latest().hello?.organizationId).toBe(120);
  });

  itBC('solo sobres de otra versión (v=2) → «Actualice la pantalla»; un hello+state válido lo levanta', async () => {
    const raw = rawChannel();
    const s = screen();
    await tick(HEALTH_MS);
    const v2 = setInterval(() => {
      raw.postMessage({ v: 2, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_X, t: 'heartbeat', at: Date.now() });
    }, HEARTBEAT_MS);
    opened.push({ close: () => clearInterval(v2) });
    await until(() => s.latest().updateRequired === true, 2000, 'updateRequired');
    expect(s.view()).toBe('update_required');
    expect(s.latest().connected).toBe(false);
    expect(viewShowsAmounts(s.view())).toBe(false);

    clearInterval(v2);
    const c = cashier();
    await until(() => s.latest().state !== null, 2000, 'caja válida');
    expect(s.latest().updateRequired).toBe(false);
    expect(s.view()).toBe('idle');
    expect(c.emitter.isEmitting).toBe(true);
  });

  itBC('basura en el canal (string, null, número, objeto sin t, state que no es objeto, seq no entero) no conecta, no lanza y no notifica', async () => {
    const raw = rawChannel();
    const s = screen();
    await tick(HEALTH_MS * 2);
    const notified = s.snapshots.length;
    const garbage: unknown[] = [
      'hola',
      null,
      42,
      {},
      { t: 'state' },
      { v: 1, seq: 0, terminalId: TERMINAL, instanceId: INSTANCE_X, t: 'state', state: 'no soy un objeto' },
      { v: 1, seq: 0, terminalId: TERMINAL, instanceId: INSTANCE_X, t: 'state', state: { mode: 'order', cart: { lines: 'x' }, payment: null, tip: null, thanks: null } },
      { v: 1, seq: 1.5, terminalId: TERMINAL, instanceId: INSTANCE_X, t: 'hello', organizationId: 120, cashier: null, sessionOpen: true },
      { v: '1', seq: 0, terminalId: TERMINAL, instanceId: INSTANCE_X, t: 'hello', organizationId: 120, cashier: null, sessionOpen: true },
      { v: 1, seq: 0, terminalId: TERMINAL, instanceId: '', t: 'hello', organizationId: 120, cashier: null, sessionOpen: true },
    ];
    for (const g of garbage) raw.postMessage(g);
    await tick(HEALTH_MS * 4);
    expect(s.latest().connected).toBe(false);
    expect(s.latest().state).toBeNull();
    expect(s.latest().hello).toBeNull();
    expect(s.latest().updateRequired).toBe(false);
    expect(s.view()).toBe('connecting');
    expect(s.snapshots.length).toBe(notified);
  });

  itBC('seq fuera de orden: un state más viejo de la misma instancia no pisa al nuevo; uno más nuevo sí', async () => {
    const raw = rawChannel();
    const s = screen();
    const post = (seq: number, lines: number) =>
      raw.postMessage({
        v: 1,
        seq,
        terminalId: TERMINAL,
        instanceId: INSTANCE_X,
        t: 'state',
        state: {
          mode: 'order',
          cart: {
            id: 'c-x',
            currency: 'USD',
            lines: Array.from({ length: lines }, (_, i) => ({
              id: `x${i + 1}`,
              name: `Producto ${i + 1}`,
              variant: null,
              qty: 1,
              unitPrice: 1,
              total: 1,
              modifiers: [],
              discount: null,
              note: null,
              taxExcluded: false,
              taxIncluded: false,
            })),
            subtotal: lines,
            discountTotal: 0,
            discountLabel: null,
            taxTotal: 0,
            taxIncluded: false,
            total: lines,
            lastChangedLineId: null,
          },
          payment: null,
          tip: null,
          thanks: null,
        },
      });
    post(10, 2);
    await until(() => s.latest().state?.cart?.lines.length === 2, 2000, 'state seq 10');
    post(3, 1); // viejo: se descarta
    await tick(HEALTH_MS * 2);
    expect(s.latest().state?.cart?.lines.length).toBe(2);
    expect(s.latest().state?.cart?.total).toBe(2);
    post(11, 3); // nuevo: se acepta
    await until(() => s.latest().state?.cart?.lines.length === 3, 2000, 'state seq 11');
    expect(s.latest().state?.cart?.total).toBe(3);
  });

  itBC('terminal ajena: una caja real de OTRA terminal nunca conecta esta pantalla', async () => {
    const foreign = cashier({ terminalId: OTHER_TERMINAL });
    foreign.emitter.setActiveCart(cart({ items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    const s = screen();
    await tick(HEARTBEAT_MS * 4);
    expect(s.latest().connected).toBe(false);
    expect(s.latest().state).toBeNull();
    expect(s.latest().hello).toBeNull();
    expect(s.view()).toBe('connecting');
    expect(s.receiver.lastReceivedAt).toBeNull();
    expect(foreign.emitter.isEmitting).toBe(true);
  });

  itBC('mensajes fuera de orden entre tipos: un state que llega ANTES del hello se acepta igual y la moneda cae al carrito', async () => {
    const raw = rawChannel();
    const s = screen();
    // state primero (seq 0), hello después (seq 1): el receptor adopta por el state.
    raw.postMessage({
      v: 1,
      seq: 0,
      terminalId: TERMINAL,
      instanceId: INSTANCE_X,
      t: 'state',
      state: {
        mode: 'order',
        cart: {
          id: 'c-x',
          currency: 'MXN',
          lines: [{ id: 'x1', name: 'Producto', variant: null, qty: 1, unitPrice: 1, total: 1, modifiers: [], discount: null, note: null, taxExcluded: false, taxIncluded: false }],
          subtotal: 1,
          discountTotal: 0,
          discountLabel: null,
          taxTotal: 0,
          taxIncluded: false,
          total: 1,
          lastChangedLineId: 'x1',
        },
        payment: null,
        tip: null,
        thanks: null,
      },
    });
    await until(() => s.latest().state !== null, 2000, 'state sin hello');
    expect(s.view()).toBe('order');
    expect(s.latest().hello).toBeNull();
    expect(s.currency()).toBe('MXN');
    raw.postMessage({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_X, t: 'hello', organizationId: 120, cashier: null, sessionOpen: true, currency: 'MXN' });
    await until(() => s.latest().hello !== null, 2000, 'hello tardío');
    expect(s.view()).toBe('order');
    expect(s.latest().state?.cart?.lines).toHaveLength(1);
  });
});

/** Ayuda de tipos: lo que la caja simulada mete en el canal es un DownMessage válido cuando debe serlo. */
it('los sobres válidos usados aquí tienen la forma de DownMessage', () => {
  const sample: DownMessage = { v: 1, seq: 0, terminalId: TERMINAL, instanceId: INSTANCE_X, t: 'heartbeat', at: 0 };
  expect(sample.t).toBe('heartbeat');
});
