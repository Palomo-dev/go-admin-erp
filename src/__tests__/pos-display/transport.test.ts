/**
 * BroadcastChannelTransport / BroadcastChannelReceiver en el mismo proceso
 * (Node ≥ 18 expone BroadcastChannel como global). Emisor y receptor son dos
 * canales distintos con el mismo nombre, igual que dos ventanas del navegador.
 * Suite única del transporte (fusión de las rondas 1-7 de la Parte A):
 * sobre y seq, adopción de instancia, ventana de elección, watchdog,
 * presencia de la pantalla, announce, versión incompatible.
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import { isDownMessage, type DisplayState, type DownMessage, type DownMessageDraft, type UpMessage } from '@/lib/pos/display/protocol';
import {
  ADOPTION_WINDOW_MS,
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  HEARTBEAT_INTERVAL_MS,
  STALE_AFTER_MS,
  displayChannelName,
  isBroadcastChannelSupported,
  type DisplayReceiver,
  type DisplayTransport,
} from '@/lib/pos/display/transport';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = 'ffffffff-0000-4111-8222-333333333333';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const INSTANCE_C = '33333333-3333-4333-8333-333333333333';
const CAPS = { touch: false, width: 1280, height: 800 } as const;
const TS = '2026-09-15T15:00:00.000Z';

/**
 * BroadcastChannel entrega en el siguiente giro del bucle de eventos; se
 * espera un par de vueltas. setImmediate se deja real también con fake
 * timers: la entrega del canal en Node no depende de los timers de JS.
 */
async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await flush(1);
  }
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

const IDLE: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };
const idle: DownMessageDraft = { t: 'state', state: IDLE };
const HELLO = { t: 'hello', cashier: { name: 'Cajero' }, sessionOpen: true, organizationId: 1 } as const;
function orderState(cartId: string): DisplayState {
  return {
    mode: 'order',
    cart: {
      id: cartId, currency: 'COP', lines: [], subtotal: 0, discountTotal: 0, discountLabel: null,
      taxTotal: 0, taxIncluded: true, total: 0, lastChangedLineId: null,
    },
    payment: null, tip: null, thanks: null,
  };
}

/** Mensajes crudos para simular cajas con seq e instancia elegidos. */
const hb = (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'heartbeat', seq, terminalId: TERMINAL, instanceId, at: seq });
const hello = (seq: number, instanceId: string, sessionOpen = true): DownMessage => ({
  v: 1, t: 'hello', seq, terminalId: TERMINAL, instanceId, cashier: null, sessionOpen, organizationId: 1,
});
const bye = (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'bye', seq, terminalId: TERMINAL, instanceId });
const stateOf = (seq: number, instanceId: string, state: DisplayState = IDLE): DownMessage => ({ v: 1, t: 'state', seq, terminalId: TERMINAL, instanceId, state });

/** Caja simulada: un transporte real que responde a need_snapshot con hello + state, como hará la Parte B. */
function caja(opts: { instanceId: string; sessionOpen: boolean; seq0?: number; cartId: string }): BroadcastChannelTransport {
  const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: opts.instanceId, now: () => 0 }));
  for (let i = 0; i < (opts.seq0 ?? 0); i += 1) t.publish({ t: 'heartbeat', at: i });
  t.onUp((m) => {
    if (m.t === 'need_snapshot') t.announce({ ...HELLO, sessionOpen: opts.sessionOpen }, orderState(opts.cartId));
  });
  return t;
}

/** Fixtures mínimos del carrito para las pruebas extremo a extremo. */
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

// ---------------------------------------------------------------------------
// Entorno y construcción
// ---------------------------------------------------------------------------

describe('transporte · entorno y construcción', () => {
  it('BroadcastChannel está disponible en Node para las pruebas y el nombre del canal es por terminal', () => {
    expect(isBroadcastChannelSupported()).toBe(true);
    expect(displayChannelName(TERMINAL)).toBe(`pos-display:${TERMINAL}`);
  });

  it('las constantes: latido 1 s, silencio 3 latidos, ventana de elección 500 ms', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(1000);
    expect(STALE_AFTER_MS).toBe(3 * HEARTBEAT_INTERVAL_MS);
    expect(ADOPTION_WINDOW_MS).toBe(500);
  });

  it('terminalId vacío o no string: los dos constructores lanzan "[pos-display] terminalId vacío" (nadie aceptaría esos mensajes)', () => {
    for (const bad of ['', undefined, null, 7]) {
      const opts = { terminalId: bad } as unknown as { terminalId: string };
      expect(() => new BroadcastChannelTransport(opts)).toThrow('[pos-display] terminalId vacío');
      expect(() => new BroadcastChannelReceiver(opts)).toThrow('[pos-display] terminalId vacío');
    }
  });

  it('instanceId se genera por construcción con forma de UUID y distinto por transporte; __testInstanceId lo fija solo en pruebas', () => {
    const a = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const b = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    expect(a.instanceId).not.toBe(b.instanceId);
    expect(a.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    const fijo = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    expect(fijo.instanceId).toBe(INSTANCE_A);
    // Quien todavía pase `instanceId` (p. ej. desde JSON) no fija nada: se genera uno propio.
    const opts = { terminalId: TERMINAL, instanceId: INSTANCE_B } as unknown as ConstructorParameters<typeof BroadcastChannelTransport>[0];
    expect(track(new BroadcastChannelTransport(opts)).instanceId).not.toBe(INSTANCE_B);
  });

  it('un instanceId reutilizado (si alguien lo persistiera) deja muda a la ventana recargada hasta superar el seq anterior: por eso nunca se persiste', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(50, INSTANCE_A));
    await waitFor(() => got.length === 1);
    raw.postMessage(hello(1, INSTANCE_A)); // «misma» instancia recargada: seq vuelve a 1
    raw.postMessage(stateOf(2, INSTANCE_A, orderState('nuevo')));
    await flush(6);
    expect(got).toHaveLength(1);
    expect(display.lastSeq).toBe(50);
  });

  it('las interfaces DisplayTransport / DisplayReceiver exponen lo que la Parte B y la Parte C necesitan (no dependen de la clase)', async () => {
    const t: DisplayTransport = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const r: DisplayReceiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    expect(t.lastDisplaySeenAt).toBeNull();
    expect(typeof t.announce).toBe('function');
    expect(typeof t.startHeartbeat).toBe('function');
    expect(typeof r.startPresence).toBe('function');
    expect(typeof r.stopPresence).toBe('function');
    expect(r.incompatibleVersionAt).toBeNull();
    expect(r.incompatibleVersionCount).toBe(0);
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(3, INSTANCE_A));
    await waitFor(() => r.activeInstanceId === INSTANCE_A);
    expect(r.lastSeq).toBe(3);
    expect(typeof r.lastReceivedAt).toBe('number');
    expect(r.lastByeAt).toBeNull();
    expect(r.lastStaleAt).toBeNull();
    r.releaseActiveInstance();
    expect(r.activeInstanceId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Caja → pantalla: sobre, seq y filtros
// ---------------------------------------------------------------------------

describe('transporte · caja → pantalla', () => {
  it('la pantalla recibe hello, state y bye con seq creciente, v 1, terminalId e instanceId de la caja; el bye libera la instancia', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    cashier.publish({ t: 'hello', cashier: { name: 'Andrea' }, sessionOpen: true, organizationId: 1 });
    cashier.publish(idle);
    cashier.close(); // emite bye

    await waitFor(() => got.length === 3);
    expect(got.map((m) => m.t)).toEqual(['hello', 'state', 'bye']);
    expect(got.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(got.every((m) => m.v === 1 && m.terminalId === TERMINAL && m.instanceId === cashier.instanceId)).toBe(true);
    expect(cashier.lastSeq).toBe(3);
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastSeq).toBe(-1);
    expect(display.lastReceivedAt).not.toBeNull();
  });

  it('el emisor no recibe sus propios mensajes ni los de bajada de otra caja (no pasan isUpMessage)', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const other = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_B }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    cashier.publish({ t: 'heartbeat', at: 1 });
    other.publish(HELLO);
    other.publish({ t: 'state', state: orderState('x') });
    await flush(6);
    expect(ups).toEqual([]);
  });

  it('descarta mensajes de otra terminal aunque lleguen por el mismo canal, incluso si son los primeros (no adoptan)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ ...hello(1, INSTANCE_B), terminalId: OTHER_TERMINAL });
    await flush(6);
    expect(got).toEqual([]);
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastReceivedAt).toBeNull();
    raw.postMessage({ ...hb(1, INSTANCE_A), terminalId: OTHER_TERMINAL });
    raw.postMessage(hb(2, INSTANCE_A));
    await waitFor(() => got.length === 1);
    await flush();
    expect(got).toHaveLength(1);
    expect(got[0].terminalId).toBe(TERMINAL);
  });

  it('descarta seq repetido o viejo; mensajes fuera de orden 3, 1, 2, 5, 4 → solo pasan 3 y 5', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: number[] = [];
    display.onDown((m) => got.push(m.seq));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    for (const seq of [3, 1, 2, 5, 4]) raw.postMessage(hb(seq, INSTANCE_A));
    await flush(6);
    expect(got).toEqual([3, 5]);
    expect(display.lastSeq).toBe(5);
  });

  it('seq 0 se acepta como primer mensaje; seq 1.5 se rechaza; un seq gigante bloquea solo su instancia hasta el siguiente hello ajeno', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hb(0, INSTANCE_A));
    await waitFor(() => got.length === 1);
    expect(display.lastSeq).toBe(0);
    raw.postMessage({ ...hb(1, INSTANCE_A), seq: 1.5 }); // rechazado por el guard
    raw.postMessage(hb(Number.MAX_SAFE_INTEGER, INSTANCE_A));
    raw.postMessage(hb(2, INSTANCE_A)); // bloqueado
    await waitFor(() => got.length === 2);
    await flush();
    expect(got.map((m) => m.seq)).toEqual([0, Number.MAX_SAFE_INTEGER]);
    raw.postMessage(hello(1, INSTANCE_B)); // otra instancia saluda y recupera la pantalla
    await waitFor(() => got.length === 3);
    expect(display.lastSeq).toBe(1);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('descarta mensajes malformados, con state inválido o sin instanceId, sin afectar a los válidos', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage('basura');
    raw.postMessage(null);
    raw.postMessage(42);
    raw.postMessage([1, 2]);
    raw.postMessage({ ...stateOf(1, INSTANCE_A), state: null });
    raw.postMessage({ ...stateOf(1, INSTANCE_A), state: { mode: 'order', cart: { lines: 'no-es-array' }, payment: null, tip: null, thanks: null } });
    raw.postMessage({ ...stateOf(2, INSTANCE_A), state: { mode: 'payment', cart: null, payment: { method: 'bitcoin' }, tip: null, thanks: null } });
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 2, terminalId: TERMINAL, at: 1 }); // sin instanceId
    raw.postMessage(hb(3, INSTANCE_A)); // válido: adopta
    raw.postMessage(bye(4, INSTANCE_A));
    await waitFor(() => got.length === 2);
    await flush();
    expect(got.map((m) => m.t)).toEqual(['heartbeat', 'bye']);
    expect(display.incompatibleVersionCount).toBe(0); // basura no es «otra versión»
  });

  it('un objeto cuyas claves viven en el prototipo pasa el guard en memoria pero no sobrevive al canal (structuredClone lo vacía)', async () => {
    const proto = { v: 1, t: 'bye', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A };
    const hostile = Object.create(proto) as Record<string, unknown>;
    expect(isDownMessage(hostile)).toBe(true);
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hostile);
    await flush(5);
    expect(got).toEqual([]);
  });

  it('el sobre es del transporte: un draft con v/seq/terminalId/instanceId propios no lo pisa y no silencia los siguientes', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const tampered = { t: 'heartbeat', at: 1, seq: 500, terminalId: OTHER_TERMINAL, v: 7, instanceId: 'ajena' } as unknown as DownMessageDraft;
    cashier.publish(tampered);
    cashier.publish({ t: 'heartbeat', at: 2 });
    cashier.publish(idle);
    await waitFor(() => got.length === 3);
    expect(got.map((m) => [m.seq, m.terminalId, m.v, m.instanceId])).toEqual([
      [1, TERMINAL, 1, cashier.instanceId],
      [2, TERMINAL, 1, cashier.instanceId],
      [3, TERMINAL, 1, cashier.instanceId],
    ]);
    expect(cashier.lastSeq).toBe(3);
  });

  it('publish nunca lanza: un mensaje no clonable se avisa con console.warn, consume el seq (hueco inocuo) y el siguiente llega', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const roto = { ...IDLE, thanks: { total: 1, askRating: false, fn: () => 1 } } as unknown as DisplayState;
    expect(() => cashier.publish({ t: 'state', state: roto })).not.toThrow();
    expect(warn).toHaveBeenCalledWith('[pos-display] no se pudo publicar', expect.anything());
    expect(cashier.lastSeq).toBe(1);
    cashier.publish({ t: 'heartbeat', at: 1 });
    await waitFor(() => got.length === 1);
    expect(got[0].seq).toBe(2);
  });

  it('500 states publicados en la misma vuelta llegan todos, en orden y con seq 1..500', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    for (let i = 1; i <= 500; i += 1) cashier.publish({ t: 'state', state: orderState(`c-${i}`) });
    await waitFor(() => got.length === 500, 5000);
    expect(got.map((m) => m.seq)).toEqual(Array.from({ length: 500 }, (_, i) => i + 1));
    expect((got[499] as Extract<DownMessage, { t: 'state' }>).state.cart?.id).toBe('c-500');
    expect(display.lastSeq).toBe(500);
  });

  it('hello de la MISMA instancia con otro organizationId (cambio de organización sin recargar) se acepta: la Parte C re-lee la marca en cada hello', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const orgs: number[] = [];
    display.onDown((m) => {
      if (m.t === 'hello') orgs.push(m.organizationId);
    });
    cashier.publish({ ...HELLO, organizationId: 120 });
    cashier.publish({ ...HELLO, organizationId: 145 });
    await waitFor(() => orgs.length === 2);
    expect(orgs).toEqual([120, 145]);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
  });

  it('un hello crudo sin organizationId no pasa el guard y no adopta; el hello del transporte llega con él', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    const sinOrg = { ...hello(1, INSTANCE_B) } as Record<string, unknown>;
    delete sinOrg.organizationId;
    raw.postMessage(sinOrg);
    await flush(5);
    expect(got).toEqual([]);
    expect(display.activeInstanceId).toBeNull();
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    cashier.publish({ ...HELLO, organizationId: 120 });
    await waitFor(() => got.length === 1);
    expect((got[0] as Extract<DownMessage, { t: 'hello' }>).organizationId).toBe(120);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
  });
});

// ---------------------------------------------------------------------------
// D3 · versión incompatible
// ---------------------------------------------------------------------------

describe('transporte · versión incompatible', () => {
  it('un sobre de esta terminal con v ≠ 1 se descarta pero deja incompatibleVersionAt (reloj del receptor) e incrementa incompatibleVersionCount', async () => {
    let clock = 5_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ ...hello(1, INSTANCE_A), v: 2 });
    await waitFor(() => display.incompatibleVersionCount === 1);
    expect(display.incompatibleVersionAt).toBe(5_000);
    expect(got).toEqual([]);
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastReceivedAt).toBeNull(); // nada válido: la UI puede decir «Actualice la pantalla»
    clock = 6_000;
    raw.postMessage({ ...stateOf(2, INSTANCE_A), v: 2 });
    raw.postMessage({ ...hb(3, INSTANCE_A), v: 0 });
    await waitFor(() => display.incompatibleVersionCount === 3);
    expect(display.incompatibleVersionAt).toBe(6_000);
  });

  it('otra terminal, basura, v no numérica o mensajes válidos no cuentan como versión incompatible', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ ...hello(1, INSTANCE_A), v: 2, terminalId: OTHER_TERMINAL });
    raw.postMessage({ ...hello(1, INSTANCE_A), v: '2' });
    raw.postMessage('basura');
    raw.postMessage({ terminalId: TERMINAL, t: 'hello' }); // sin v
    raw.postMessage(hello(1, INSTANCE_A));
    await waitFor(() => got.length === 1);
    await flush();
    expect(display.incompatibleVersionCount).toBe(0);
    expect(display.incompatibleVersionAt).toBeNull();
  });

  it('con caja actual y pantalla vieja conviviendo: los válidos siguen llegando y el contador solo cuenta los de otra versión', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(1, INSTANCE_A));
    raw.postMessage({ ...hb(2, INSTANCE_A), v: 2 });
    raw.postMessage(hb(3, INSTANCE_A));
    await waitFor(() => got.length === 2);
    expect(got.map((m) => m.seq)).toEqual([1, 3]);
    expect(display.incompatibleVersionCount).toBe(1);
    expect(display.lastReceivedAt).not.toBeNull();
  });

  it('la caja también descarta mensajes de subida de otra versión, sin contarlos ni lanzar', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: 2, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' });
    raw.postMessage(hb(1, INSTANCE_A)); // de bajada: no es para la caja
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c2' });
    await waitFor(() => ups.length === 1);
    await flush();
    expect(ups.map((m) => (m.t === 'qr_paid_claim' ? m.cartId : null))).toEqual(['c2']);
  });
});

// ---------------------------------------------------------------------------
// Latido de la caja
// ---------------------------------------------------------------------------

describe('transporte · latido', () => {
  it('emite cada intervalo con `at` del reloj inyectado, es idempotente y se detiene con stopHeartbeat (vía la interfaz)', async () => {
    let clock = 1000;
    const concrete = track(new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 15, now: () => (clock += 1) }));
    const cashier: DisplayTransport = concrete;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const beats: number[] = [];
    display.onDown((m) => {
      if (m.t === 'heartbeat') beats.push(m.at);
    });
    cashier.startHeartbeat();
    cashier.startHeartbeat();
    await waitFor(() => beats.length >= 3, 2000);
    cashier.stopHeartbeat();
    const countAtStop = beats.length;
    await new Promise<void>((r) => setTimeout(r, 60));
    await flush();
    expect(beats.length).toBe(countAtStop);
    expect(beats.every((at, i) => i === 0 || at > beats[i - 1])).toBe(true);
    expect(concrete.lastSeq).toBe(countAtStop);
  });

  it('si postMessage lanza en algunos ticks, el intervalo sigue vivo y los siguientes latidos llegan (seq con huecos)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 5 }));
    const channel = (cashier as unknown as { channel: BroadcastChannel }).channel;
    const original = channel.postMessage.bind(channel);
    let calls = 0;
    channel.postMessage = (m: unknown) => {
      calls += 1;
      if (calls <= 2) throw new Error('DataCloneError simulado');
      original(m);
    };
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.startHeartbeat();
    await waitFor(() => got.length >= 2, 2000);
    cashier.stopHeartbeat();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(got[0].seq).toBe(3);
  });

  it('stopHeartbeat sin start no lanza; startHeartbeat tras close es no-op y no deja timers vivos', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 5 }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    expect(() => cashier.stopHeartbeat()).not.toThrow();
    cashier.close(false);
    expect(() => cashier.startHeartbeat()).not.toThrow();
    await new Promise<void>((r) => setTimeout(r, 30));
    await flush();
    expect(got).toEqual([]);
    expect(cashier.lastSeq).toBe(0);
    expect((cashier as unknown as { heartbeatTimer: unknown }).heartbeatTimer).toBeNull();
  });

  it('close() con bye por defecto detiene el latido y deja la pantalla con un bye final; close() dos veces no emite dos bye', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 10 }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.startHeartbeat();
    await waitFor(() => got.length >= 1, 2000);
    cashier.close();
    cashier.close();
    await waitFor(() => got[got.length - 1]?.t === 'bye', 2000);
    const total = got.length;
    await new Promise<void>((r) => setTimeout(r, 40));
    await flush();
    expect(got.length).toBe(total);
    expect(got.filter((m) => m.t === 'bye')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Pantalla → caja: intenciones y destinatario
// ---------------------------------------------------------------------------

describe('transporte · pantalla → caja', () => {
  it('la caja recibe need_snapshot y tip_selected con v y terminalId añadidos por el receptor', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    display.send({ t: 'tip_selected', cartId: 'c1', kind: 'percent', value: 10 });
    await waitFor(() => ups.length === 2);
    expect(ups[0]).toEqual({ v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: CAPS });
    expect(ups[1]).toEqual({ v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'percent', value: 10 });
  });

  it('la caja descarta intenciones de otra terminal, payloads inválidos y las dirigidas a otra instancia o con toInstanceId malformado', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: OTHER_TERMINAL, cartId: 'c0' });
    raw.postMessage({ v: 1, t: 'rating', terminalId: TERMINAL, saleId: null, rating: 9 });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1', toInstanceId: INSTANCE_A });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c2', toInstanceId: '' });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c3', toInstanceId: 7 });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c4', toInstanceId: cashier.instanceId });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c5' });
    await waitFor(() => ups.length === 2);
    await flush();
    expect(ups.map((m) => (m.t === 'qr_paid_claim' ? m.cartId : null))).toEqual(['c4', 'c5']);
  });

  it('el receptor no deja que un draft de subida hable por otra terminal ni decida el destinatario', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    const spoofed = { t: 'qr_paid_claim', cartId: 'c1', terminalId: OTHER_TERMINAL, v: 9, toInstanceId: 'otra-instancia' } as unknown as UpMessage;
    display.send(spoofed); // sin activa: llega sin toInstanceId y con el sobre propio
    await waitFor(() => ups.length === 1);
    expect(ups[0]).toEqual({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' });
    cashier.publish(HELLO);
    await waitFor(() => display.activeInstanceId === cashier.instanceId);
    display.send(spoofed); // con activa: el sobre gana
    await waitFor(() => ups.length === 2);
    expect(ups[1].toInstanceId).toBe(cashier.instanceId);
  });

  it('con dos pestañas, las intenciones van dirigidas a la que la pantalla sigue (la última que saludó)', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const upsA: UpMessage[] = [];
    const upsB: UpMessage[] = [];
    tabA.onUp((m) => upsA.push(m));
    tabB.onUp((m) => upsB.push(m));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    tabA.publish(HELLO);
    tabB.publish(HELLO); // el último hello gana: B es la activa
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(tabB.instanceId);
    display.send({ t: 'tip_selected', cartId: 'c1', kind: 'percent', value: 10 });
    await waitFor(() => upsB.length === 1);
    await flush();
    expect(upsA).toEqual([]);
    expect(upsB[0]).toEqual({ v: 1, t: 'tip_selected', terminalId: TERMINAL, toInstanceId: tabB.instanceId, cartId: 'c1', kind: 'percent', value: 10 });
  });

  it('sin instancia activa, need_snapshot no lleva destinatario y lo reciben todas las pestañas', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const upsA: UpMessage[] = [];
    const upsB: UpMessage[] = [];
    tabA.onUp((m) => upsA.push(m));
    tabB.onUp((m) => upsB.push(m));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => upsA.length === 1 && upsB.length === 1);
    expect(upsA[0]).not.toHaveProperty('toInstanceId');
    expect(upsA[0]).toEqual(upsB[0]);
  });

  it('la pantalla no recibe mensajes de subida de otra pantalla (solo de bajada)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const other = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    other.send({ t: 'qr_paid_claim', cartId: 'c1' });
    await flush();
    expect(got).toEqual([]);
  });

  it('dos pantallas sobre la misma terminal siguen a la misma caja y cada need_snapshot llega a la caja', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => {
      ups.push(m);
      if (m.t === 'need_snapshot') cashier.announce({ ...HELLO, cashier: { name: 'Andrea' } }, orderState('c-1'));
    });
    const d1 = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const d2 = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got1: DownMessage[] = [];
    const got2: DownMessage[] = [];
    d1.onDown((m) => got1.push(m));
    d2.onDown((m) => got2.push(m));
    d1.send({ t: 'need_snapshot', capabilities: CAPS });
    d2.send({ t: 'need_snapshot', capabilities: { touch: true, width: 2, height: 2 } });
    await waitFor(() => ups.length === 2 && got1.length >= 4 && got2.length >= 4);
    expect(d1.activeInstanceId).toBe(INSTANCE_A);
    expect(d2.activeInstanceId).toBe(INSTANCE_A);
    expect(got1).toEqual(got2);
    expect(ups.every((m) => m.t === 'need_snapshot')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Adopción de instancia: dos pestañas de /app/pos
// ---------------------------------------------------------------------------

describe('transporte · adopción de instancia', () => {
  it('el estado de una segunda pestaña llega aunque la primera tenga un seq mayor: cada instancia lleva su contador', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    for (let i = 0; i < 20; i += 1) tabA.publish({ t: 'heartbeat', at: i });
    await waitFor(() => got.length === 20);
    tabB.publish(HELLO); // seq 1 de B: B pasa a ser la activa
    tabA.publish({ t: 'heartbeat', at: 99 }); // seq 21 de A: descartado
    tabB.publish(idle); // seq 2 de B: aceptado
    await flush(5);
    const states = got.filter((m) => m.t === 'state');
    expect(states).toHaveLength(1);
    expect(states[0].instanceId).toBe(tabB.instanceId);
    expect(display.activeInstanceId).toBe(tabB.instanceId);
    expect(display.lastSeq).toBe(2);
  });

  it('los latidos de la pestaña de fondo no bloquean los estados de la activa, por muchos que sean', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    for (let i = 0; i < 20; i += 1) tabA.publish({ t: 'heartbeat', at: i });
    await waitFor(() => got.length === 20);
    tabB.publish(HELLO);
    await waitFor(() => got.length === 21);
    for (let i = 0; i < 10; i += 1) {
      tabA.publish({ t: 'heartbeat', at: 100 + i });
      tabB.publish(idle);
    }
    await flush(5);
    const fromB = got.filter((m) => m.instanceId === tabB.instanceId);
    expect(got.filter((m) => m.instanceId === tabA.instanceId)).toHaveLength(20);
    expect(fromB.map((m) => m.t)).toEqual(['hello', ...Array<string>(10).fill('state')]);
    expect(fromB.map((m) => m.seq)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
    expect(display.lastSeq).toBe(11);
  });

  it('la pestaña que recupera el foco vuelve a proyectar con un nuevo hello («gana la última que saluda»)', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    tabA.publish(HELLO);
    tabB.publish(HELLO);
    tabA.publish(idle); // A ya no es la activa
    tabA.publish(HELLO); // A recupera el foco y saluda
    tabA.publish(idle); // ahora sí
    tabB.publish(idle); // B ha perdido la pantalla
    await flush(5);
    expect(got.map((m) => [m.t, m.instanceId === tabA.instanceId ? 'A' : 'B'])).toEqual([
      ['hello', 'A'],
      ['hello', 'B'],
      ['hello', 'A'],
      ['state', 'A'],
    ]);
  });

  it('un hello con seq 0 de una instancia nueva releva a una activa con seq alto (la marca se reinicia por instancia)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hb(5000, INSTANCE_A));
    raw.postMessage(hello(0, INSTANCE_B));
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    expect(display.lastSeq).toBe(0);
  });

  it('un hello repetido de la misma instancia (mismo seq) se descarta; uno con seq mayor no reinicia la marca', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(1, INSTANCE_A));
    raw.postMessage(hb(9, INSTANCE_A));
    raw.postMessage(hello(1, INSTANCE_A)); // duplicado exacto
    raw.postMessage(hello(10, INSTANCE_A)); // re-saludo (focus)
    raw.postMessage(hb(5, INSTANCE_A)); // viejo: la marca sigue en 10
    await flush(5);
    expect(got.map((m) => [m.t, m.seq])).toEqual([['hello', 1], ['heartbeat', 9], ['hello', 10]]);
    expect(display.lastSeq).toBe(10);
  });

  it('tras recargar sin bye, la nueva instancia que no saluda primero es ignorada; con hello se adopta (contrato de la Parte B)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hb(500, INSTANCE_A)); // instancia vieja, sin bye (pestaña matada)
    await waitFor(() => got.length === 1);
    raw.postMessage(hb(1, INSTANCE_B)); // nueva instancia, sin hello: descartado
    raw.postMessage(stateOf(2, INSTANCE_B));
    await flush(5);
    expect(got).toHaveLength(1);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    raw.postMessage(hello(3, INSTANCE_B));
    raw.postMessage(hb(4, INSTANCE_B));
    await waitFor(() => got.length === 3);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    expect(display.lastSeq).toBe(4);
  });

  it('la pantalla recargada a mitad de venta adopta la instancia en curso por su latido y recibe hello+state al pedir need_snapshot', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    for (let i = 0; i < 50; i += 1) cashier.publish({ t: 'heartbeat', at: i }); // la caja ya lleva rato
    await flush(3);
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.onUp((m) => {
      if (m.t === 'need_snapshot') cashier.announce(HELLO, orderState('c'));
    });
    cashier.publish({ t: 'heartbeat', at: 50 }); // seq 51: la pantalla adopta sin hello
    await waitFor(() => got.length === 1);
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => got.length === 3);
    expect(got.map((m) => m.t)).toEqual(['heartbeat', 'hello', 'state']);
    expect(got.map((m) => m.seq)).toEqual([51, 52, 53]);
  });
});

// ---------------------------------------------------------------------------
// bye: liberación y relevo
// ---------------------------------------------------------------------------

describe('transporte · bye', () => {
  it('el bye de la activa la libera con la marca limpia: la siguiente que hable es adoptada aunque traiga seq menor', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    // B saluda y trabaja un rato (seq alto), luego se despide.
    raw.postMessage(hello(1, INSTANCE_B));
    for (let s = 2; s <= 100; s += 1) raw.postMessage(hb(s, INSTANCE_B));
    raw.postMessage(bye(101, INSTANCE_B));
    await waitFor(() => got.length === 101);
    expect(display.activeInstanceId).toBeNull();
    // A (pestaña en segundo plano, estrangulada) late con seq 5 → adoptada sin hello, con marca limpia.
    raw.postMessage(hb(5, INSTANCE_A));
    await waitFor(() => got.length === 102);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    raw.postMessage(hello(6, INSTANCE_A)); // A recupera el foco y saluda
    raw.postMessage(stateOf(7, INSTANCE_A));
    await flush(5);
    const fromA = got.filter((m) => m.instanceId === INSTANCE_A);
    expect(fromA.map((m) => [m.t, m.seq])).toEqual([['heartbeat', 5], ['hello', 6], ['state', 7]]);
    expect(display.lastSeq).toBe(7);
  });

  it('variante con transportes reales: tras cerrar B, A releva y vuelve a proyectar', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    tabA.publish(HELLO); // A seq 1
    tabB.publish(HELLO); // B seq 1 → B activa
    for (let i = 0; i < 30; i += 1) tabB.publish({ t: 'heartbeat', at: i });
    tabB.close(); // bye → libera
    await waitFor(() => got.some((m) => m.t === 'bye'));
    tabA.publish({ t: 'heartbeat', at: 99 }); // A seq 2: adoptada con marca limpia
    tabA.announce(HELLO, IDLE); // A seq 3, 4
    await waitFor(() => got.filter((m) => m.instanceId === tabA.instanceId).length === 4);
    const fromAAfterBye = got.slice(got.findIndex((m) => m.t === 'bye') + 1).filter((m) => m.instanceId === tabA.instanceId);
    expect(display.activeInstanceId).toBe(tabA.instanceId);
    expect(fromAAfterBye.map((m) => m.t)).toEqual(['heartbeat', 'hello', 'state']);
  });

  it('el bye de una pestaña NO activa no libera a la activa ni se entrega; un bye huérfano (sin activa) se ignora sin entregarlo', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(bye(7, INSTANCE_C)); // huérfano
    await flush(5);
    expect(got).toEqual([]);
    expect(display.lastByeAt).toBeNull();
    raw.postMessage(hello(1, INSTANCE_A));
    raw.postMessage(hello(1, INSTANCE_B)); // B activa
    raw.postMessage(bye(2, INSTANCE_A)); // A se cierra: no es la activa
    raw.postMessage(hb(2, INSTANCE_B));
    await waitFor(() => got.length === 3);
    await flush();
    expect(got.map((m) => [m.t, m.instanceId])).toEqual([['hello', INSTANCE_A], ['hello', INSTANCE_B], ['heartbeat', INSTANCE_B]]);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('un bye de la activa con seq viejo se descarta y NO la libera', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hb(5, INSTANCE_A));
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    raw.postMessage(bye(4, INSTANCE_A));
    await flush(5);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(display.lastByeAt).toBeNull();
  });

  it('bye de la activa deja lastByeAt y actualiza lastReceivedAt, no lastStaleAt; desarma el watchdog', async () => {
    fakeTimers();
    let clock = 1_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(1, INSTANCE_A));
    await waitFor(() => got.length === 1);
    clock = 2_000;
    raw.postMessage(bye(2, INSTANCE_A));
    await waitFor(() => got.length === 2);
    expect(display.lastByeAt).toBe(2_000);
    expect(display.lastReceivedAt).toBe(2_000);
    expect(display.lastStaleAt).toBeNull();
    expect(display.activeInstanceId).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('close(false) de la caja no emite bye: la pantalla sigue con la activa hasta que el watchdog la suelte', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 30 }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const cashier = new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A });
    cashier.publish(HELLO);
    await waitFor(() => got.length === 1);
    cashier.close(false);
    await flush(5);
    expect(got.map((m) => m.t)).toEqual(['hello']);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(display.lastByeAt).toBeNull();
    await waitFor(() => display.activeInstanceId === null, 500);
    expect(display.lastStaleAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Watchdog de silencio y releaseActiveInstance
// ---------------------------------------------------------------------------

describe('transporte · watchdog y releaseActiveInstance', () => {
  it('releaseActiveInstance() suelta la activa con la marca limpia, no entrega nada y es idempotente', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(4, INSTANCE_A));
    await waitFor(() => got.length === 1);
    display.releaseActiveInstance();
    display.releaseActiveInstance();
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastSeq).toBe(-1);
    expect(got).toHaveLength(1);
    expect(display.lastByeAt).toBeNull();
    expect(display.lastStaleAt).toBeNull();
    raw.postMessage(hb(1, INSTANCE_B)); // se adopta aunque traiga seq menor
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('el watchdog suelta la activa a STALE_AFTER_MS sin mensajes aceptados y deja lastStaleAt; lastReceivedAt se conserva', async () => {
    fakeTimers();
    let clock = 10_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(1, INSTANCE_A));
    await waitFor(() => got.length === 1);
    jest.advanceTimersByTime(STALE_AFTER_MS - 1);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    clock = 13_500;
    jest.advanceTimersByTime(1);
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastSeq).toBe(-1);
    expect(display.lastStaleAt).toBe(13_500);
    expect(display.lastByeAt).toBeNull();
    expect(display.lastReceivedAt).toBe(10_000);
    expect(got).toHaveLength(1);
  });

  it('cada mensaje aceptado rearma el watchdog; uno descartado (seq viejo u otra instancia) no', async () => {
    fakeTimers();
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(1, INSTANCE_A));
    await waitFor(() => got.length === 1);
    jest.advanceTimersByTime(STALE_AFTER_MS - 500);
    raw.postMessage(hb(2, INSTANCE_A)); // aceptado: rearma
    await waitFor(() => got.length === 2);
    jest.advanceTimersByTime(STALE_AFTER_MS - 500);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    raw.postMessage(hb(2, INSTANCE_A)); // duplicado: no rearma
    raw.postMessage(hb(50, INSTANCE_B)); // otra instancia: no rearma
    await flush(5);
    jest.advanceTimersByTime(500);
    expect(display.activeInstanceId).toBeNull();
    expect(got).toHaveLength(2);
  });

  it('tras el silencio (o releaseActiveInstance), el siguiente need_snapshot sale sin destinatario y la pestaña viva lo atiende', async () => {
    fakeTimers();
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const upsB: UpMessage[] = [];
    tabB.onUp((m) => upsB.push(m));
    tabA.publish(HELLO);
    await waitFor(() => display.activeInstanceId === tabA.instanceId);
    tabA.close(false); // muere sin bye
    display.send({ t: 'need_snapshot', capabilities: CAPS }); // aún dirigido a la muerta
    await flush(5);
    expect(upsB).toEqual([]);
    jest.advanceTimersByTime(STALE_AFTER_MS);
    expect(display.activeInstanceId).toBeNull();
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => upsB.length === 1);
    expect(upsB[0]).not.toHaveProperty('toInstanceId');
  });

  it('antes de que venza el watchdog, releaseActiveInstance() (la UI al entrar en Conectando) libera en el acto', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const upsB: UpMessage[] = [];
    tabB.onUp((m) => upsB.push(m));
    tabA.publish(HELLO);
    await waitFor(() => display.activeInstanceId === tabA.instanceId);
    tabA.close(false);
    display.releaseActiveInstance();
    expect(display.activeInstanceId).toBeNull();
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => upsB.length === 1);
    expect(upsB[0]).not.toHaveProperty('toInstanceId');
  });

  it('staleAfterMs: 0 desactiva el watchdog; close() apaga el watchdog sin dejar timers vivos', async () => {
    fakeTimers();
    const sinWatchdog = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(1, INSTANCE_A));
    await waitFor(() => sinWatchdog.activeInstanceId === INSTANCE_A);
    jest.advanceTimersByTime(STALE_AFTER_MS * 10);
    expect(sinWatchdog.activeInstanceId).toBe(INSTANCE_A);
    expect(jest.getTimerCount()).toBe(0);

    const display = new BroadcastChannelReceiver({ terminalId: TERMINAL });
    raw.postMessage(hello(2, INSTANCE_A));
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    expect(jest.getTimerCount()).toBe(1);
    display.close(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('el watchdog vence dentro de la ventana de elección: la siguiente que hable se adopta (regla 1) aunque sea peor', async () => {
    let clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock, staleAfterMs: 20 }));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    raw.postMessage(hello(1, INSTANCE_B, true));
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    await new Promise<void>((r) => setTimeout(r, 40)); // B muere sin bye; el watchdog (20 ms) la suelta
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastStaleAt).toBe(clock);
    clock += 10; // la ventana sigue abierta, pero sin activa se adopta la primera que hable
    raw.postMessage(hello(1, INSTANCE_A, false));
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
  });

  it('releaseActiveInstance() en plena ventana no la cierra: un hello peor se adopta (no hay activa) y uno mejor la releva', async () => {
    const clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    raw.postMessage(hello(9, INSTANCE_B, true));
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    display.releaseActiveInstance();
    raw.postMessage(hello(1, INSTANCE_A, false));
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    raw.postMessage(hello(10, INSTANCE_B, true));
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    expect(display.lastSeq).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Ventana de elección tras need_snapshot sin destinatario
// ---------------------------------------------------------------------------

describe('transporte · ventana de elección', () => {
  /** Receptor con reloj inyectado, sin instancia activa y con la ventana abierta por un need_snapshot. */
  async function openElection(): Promise<{ display: BroadcastChannelReceiver; raw: BroadcastChannel; got: DownMessage[]; ups: UpMessage[]; tick(ms: number): void }> {
    let clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    const ups: UpMessage[] = [];
    raw.onmessage = (ev: MessageEvent<unknown>) => {
      const data = ev.data as { t?: unknown };
      if (typeof data === 'object' && data !== null && typeof data.t === 'string' && !('seq' in data)) ups.push(ev.data as UpMessage);
    };
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    return {
      display,
      raw,
      got,
      ups,
      tick: (ms) => {
        clock += ms;
      },
    };
  }

  it('sessionOpen=true releva a sessionOpen=false aunque llegue después y con seq menor', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(hello(40, INSTANCE_A, false));
    raw.postMessage(hello(1, INSTANCE_B, true));
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    expect(display.lastSeq).toBe(1);
  });

  it('sessionOpen=false NO releva a sessionOpen=true: su hello y su state se descartan', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(hello(1, INSTANCE_A, true));
    raw.postMessage(hello(99, INSTANCE_B, false));
    raw.postMessage(stateOf(100, INSTANCE_B));
    await flush(5);
    expect(got.map((m) => m.instanceId)).toEqual([INSTANCE_A]);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
  });

  it('a igual sessionOpen gana el seq mayor; en empate total se conserva la que ya está', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(hello(5, INSTANCE_A));
    raw.postMessage(hello(5, INSTANCE_B)); // empate total: no releva
    await flush(5);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    raw.postMessage(hello(6, INSTANCE_C)); // seq mayor: releva
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_C);
    raw.postMessage(hello(6, INSTANCE_B)); // igual que la actual: no releva
    await flush(5);
    expect(display.activeInstanceId).toBe(INSTANCE_C);
    expect(got.map((m) => m.instanceId)).toEqual([INSTANCE_A, INSTANCE_C]);
  });

  it('una instancia adoptada por latido (sin hello) la releva cualquier hello, incluso con sessionOpen=false', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(hb(300, INSTANCE_A));
    raw.postMessage(hello(1, INSTANCE_B, false));
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('un re-hello de la propia activa actualiza lo que se compara (pasa a sessionOpen=true y ya no la releva una con false)', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(hello(1, INSTANCE_A, false));
    raw.postMessage(hello(2, INSTANCE_A, true)); // abre caja
    raw.postMessage(hello(9, INSTANCE_B, false));
    await flush(5);
    expect(got.map((m) => [m.instanceId, m.seq])).toEqual([[INSTANCE_A, 1], [INSTANCE_A, 2]]);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
  });

  it('pasada la ventana vuelve a regir «gana la última que saluda» (foco): una peor releva', async () => {
    const { display, raw, got, tick } = await openElection();
    raw.postMessage(hello(50, INSTANCE_A, true));
    await waitFor(() => got.length === 1);
    tick(ADOPTION_WINDOW_MS);
    raw.postMessage(hello(1, INSTANCE_B, false));
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('sin need_snapshot previo no hay ventana, y un need_snapshot CON destinatario (ya hay activa confirmada) tampoco la abre', async () => {
    let clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(50, INSTANCE_A, true));
    raw.postMessage(hello(1, INSTANCE_B, false)); // regla general: releva
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    raw.postMessage(hello(1, INSTANCE_A, true));
    await waitFor(() => got.length === 3);
    display.send({ t: 'need_snapshot', capabilities: CAPS }); // dirigido a A: no abre ventana
    await flush();
    clock += 1;
    raw.postMessage(hello(1, INSTANCE_C, false)); // regla general: releva
    await waitFor(() => got.length === 4);
    expect(display.activeInstanceId).toBe(INSTANCE_C);
  });

  it('la ventana se reabre con cada need_snapshot sin destinatario (tras un bye, por ejemplo)', async () => {
    const { display, raw, got, tick } = await openElection();
    raw.postMessage(hello(1, INSTANCE_A, true));
    await waitFor(() => got.length === 1);
    tick(ADOPTION_WINDOW_MS + 1);
    raw.postMessage(bye(2, INSTANCE_A));
    await waitFor(() => got.length === 2);
    display.send({ t: 'need_snapshot', capabilities: CAPS }); // sin activa: reabre
    await flush();
    raw.postMessage(hello(1, INSTANCE_B, true));
    raw.postMessage(hello(1, INSTANCE_C, false)); // peor: no releva dentro de la ventana
    await waitFor(() => got.length === 3);
    await flush(3);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('con activa PROVISIONAL (adoptada por latido, sin hello) el need_snapshot sale sin destinatario y abre la elección', async () => {
    const { display, raw, got, ups } = await openElection();
    raw.postMessage(hb(7, INSTANCE_B)); // la pestaña sin caja late primero
    await waitFor(() => got.length === 1);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => ups.length === 2);
    expect(ups[1]).not.toHaveProperty('toInstanceId');
    raw.postMessage(hello(8, INSTANCE_B, false)); // B responde primero, sin caja
    raw.postMessage(hello(1, INSTANCE_A, true)); // A responde después, con caja abierta
    await waitFor(() => got.length === 3);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(display.lastSeq).toBe(1);
  });

  it('el orden inverso da el mismo resultado: A (caja abierta) responde primero y el hello de B no la releva', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(hb(7, INSTANCE_B));
    await waitFor(() => got.length === 1);
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    raw.postMessage(hello(1, INSTANCE_A, true));
    raw.postMessage(hello(8, INSTANCE_B, false));
    await waitFor(() => got.length === 2);
    await flush(3);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(got.map((m) => m.instanceId)).toEqual([INSTANCE_B, INSTANCE_A]);
  });

  it('con la activa CONFIRMADA por su hello, el need_snapshot sí va dirigido a ella; las demás intenciones van dirigidas aunque sea provisional', async () => {
    const { display, raw, got, ups } = await openElection();
    raw.postMessage(hb(3, INSTANCE_B));
    await waitFor(() => got.length === 1);
    display.send({ t: 'tip_selected', cartId: 'c1', kind: 'percent', value: 10 });
    display.send({ t: 'qr_paid_claim', cartId: 'c1' });
    display.send({ t: 'rating', saleId: null, rating: 5 });
    await waitFor(() => ups.length === 4);
    expect(ups.slice(1).every((m) => m.toInstanceId === INSTANCE_B)).toBe(true);
    raw.postMessage(hello(4, INSTANCE_B, true));
    await waitFor(() => got.length === 2);
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => ups.length === 5);
    expect(ups[4].toInstanceId).toBe(INSTANCE_B);
  });

  it('un state de la ganadora que llega ANTES que su hello (misma vuelta) no se pierde: la adopta provisionalmente y el hello la confirma', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(stateOf(1, INSTANCE_B, orderState('B')));
    raw.postMessage(hello(2, INSTANCE_B, true));
    raw.postMessage(hello(1, INSTANCE_A, false));
    await waitFor(() => got.length >= 2);
    await flush(5);
    expect(got.map((m) => m.t)).toEqual(['state', 'hello']);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('extremo a extremo con dos cajas reales: gana la de caja abierta aunque la otra responda antes, y la propina va a la que proyecta', async () => {
    const tabClosed = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabOpen = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    tabClosed.onUp((m) => {
      if (m.t === 'need_snapshot') tabClosed.announce({ ...HELLO, sessionOpen: false }, IDLE);
    });
    const snapshotsOpen: UpMessage[] = [];
    tabOpen.onUp((m) => {
      if (m.t !== 'need_snapshot') return;
      snapshotsOpen.push(m);
      setTimeout(() => tabOpen.announce({ ...HELLO, cashier: { name: 'Caja 1' } }, orderState('en-curso')), 15);
    });
    tabClosed.publish({ t: 'heartbeat', at: 1 }); // la pantalla adopta a la cerrada, provisionalmente
    await waitFor(() => display.activeInstanceId === tabClosed.instanceId);
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => got.some((m) => m.t === 'state' && m.instanceId === tabOpen.instanceId), 2000);
    await flush(5);
    expect(snapshotsOpen).toHaveLength(1); // la pestaña con caja SÍ oyó la pregunta
    expect(display.activeInstanceId).toBe(tabOpen.instanceId);
    tabClosed.publish({ t: 'state', state: orderState('perdedora') });
    tabOpen.publish({ t: 'state', state: orderState('ganadora') });
    await flush(5);
    const orders = got.filter((m): m is Extract<DownMessage, { t: 'state' }> => m.t === 'state' && m.state.mode === 'order');
    expect(orders.map((m) => m.state.cart?.id)).toEqual(['en-curso', 'ganadora']);
    // Y la propina va dirigida a la que proyecta.
    const upsOpen: UpMessage[] = [];
    const upsClosed: UpMessage[] = [];
    tabOpen.onUp((m) => upsOpen.push(m));
    tabClosed.onUp((m) => upsClosed.push(m));
    display.send({ t: 'tip_selected', cartId: 'en-curso', kind: 'percent', value: 10 });
    await waitFor(() => upsOpen.length === 1);
    await flush();
    expect(upsClosed.filter((m) => m.t === 'tip_selected')).toEqual([]);
  });

  it('con caja abierta en las dos, la que saluda primero se conserva si después saluda una igual (empate)', async () => {
    const tabFirst = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabLater = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    tabFirst.onUp((m) => {
      if (m.t === 'need_snapshot') tabFirst.announce(HELLO, IDLE);
    });
    tabLater.onUp((m) => {
      if (m.t === 'need_snapshot') setTimeout(() => tabLater.announce(HELLO, IDLE), 20); // mismo sessionOpen, mismo seq (1)
    });
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => got.filter((m) => m.t === 'state').length === 1, 2000);
    await new Promise<void>((r) => setTimeout(r, 60));
    await flush(5);
    expect(display.activeInstanceId).toBe(tabFirst.instanceId);
    expect(got.filter((m) => m.instanceId === tabLater.instanceId)).toEqual([]);
  });

  it('carrera al abrir, sea cual sea el orden de entrega: termina siguiendo a la que tiene sesión y su state es el último entregado', async () => {
    let now = 10_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0, now: () => now }));
    const seen: string[] = [];
    display.onDown((m) => seen.push(`${m.instanceId === INSTANCE_A ? 'A' : 'B'}:${m.t}`));
    caja({ instanceId: INSTANCE_A, sessionOpen: false, cartId: 'A' });
    const tB = caja({ instanceId: INSTANCE_B, sessionOpen: true, cartId: 'B' });
    tB.onUp((m) => {
      if (m.t === 'need_snapshot') now += 100; // sigue dentro de la ventana de 500 ms
    });
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => seen.includes('B:state'));
    await flush(5);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    expect(seen[seen.length - 1]).toBe('B:state');
    // Si A llegó primero se entregó y luego B la relevó (parpadeo transitorio); si B llegó primero, A no se entregó nunca.
    expect(seen.slice(seen.indexOf('B:hello')).some((s) => s.startsWith('A:'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D6 · announce: hello siempre antes que state
// ---------------------------------------------------------------------------

describe('transporte · announce(hello, state)', () => {
  it('un state publicado ANTES del hello de la instancia que releva se descarta (regla 3); announce() lo evita', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_B }));
    const tabC = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_C }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const tag = (m: DownMessage) => `${m.instanceId === INSTANCE_A ? 'A' : m.instanceId === INSTANCE_B ? 'B' : 'C'}:${m.t}`;

    tabA.announce(HELLO, orderState('cart-A'));
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_A);

    tabB.publish({ t: 'state', state: orderState('cart-B') }); // orden equivocado: el state se pierde
    tabB.publish(HELLO);
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    await flush(5);
    expect(got.map(tag)).toEqual(['A:hello', 'A:state', 'B:hello']);

    tabC.announce({ ...HELLO, cashier: { name: 'Relevo' } }, orderState('cart-C')); // orden correcto, misma vuelta
    await waitFor(() => got.length === 5);
    expect(got.slice(3).map(tag)).toEqual(['C:hello', 'C:state']);
    expect(got.slice(3).map((m) => m.seq)).toEqual([1, 2]);
    expect((got[4] as Extract<DownMessage, { t: 'state' }>).state.cart?.id).toBe('cart-C');
    expect((got[3] as Extract<DownMessage, { t: 'hello' }>).cashier).toEqual({ name: 'Relevo' });
    expect(display.activeInstanceId).toBe(INSTANCE_C);
  });

  it('announce responde a need_snapshot en la misma vuelta: la pantalla recién abierta adopta y recibe el carrito', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    cashier.onUp((m) => {
      if (m.t === 'need_snapshot') cashier.announce(HELLO, orderState('en-curso'));
    });
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => got.length === 2);
    expect(got.map((m) => m.t)).toEqual(['hello', 'state']);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
  });

  it('announce() seguido de un latido en la misma vuelta llega en orden hello, state, heartbeat con seq 1, 2, 3', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, now: () => 42 }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.announce({ ...HELLO, cashier: { name: 'Cajera' } }, IDLE);
    cashier.publish({ t: 'heartbeat', at: 42 });
    await waitFor(() => got.length === 3);
    expect(got.map((m) => [m.t, m.seq])).toEqual([['hello', 1], ['state', 2], ['heartbeat', 3]]);
  });

  it('announce tras close() no publica nada, no consume seq y no lanza', async () => {
    const cashier = new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A });
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.close(false);
    expect(() => cashier.announce(HELLO, IDLE)).not.toThrow();
    await flush(5);
    expect(got).toEqual([]);
    expect(cashier.lastSeq).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Presencia pantalla → caja
// ---------------------------------------------------------------------------

describe('transporte · presencia (display_alive / display_bye / lastDisplaySeenAt)', () => {
  it('la caja recibe display_alive al arrancar y cada HEARTBEAT_INTERVAL_MS; startPresence es idempotente; stopPresence lo detiene sin borrar la marca', async () => {
    fakeTimers();
    let clock = 10_000;
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A, now: () => clock }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const alive: Array<Extract<UpMessage, { t: 'display_alive' }>> = [];
    cashier.onUp((m) => {
      if (m.t === 'display_alive') alive.push(m);
    });
    expect(cashier.lastDisplaySeenAt).toBeNull();
    display.startPresence({ ...CAPS });
    display.startPresence({ ...CAPS });
    await flush(4);
    expect(alive).toHaveLength(1); // el primero sale al arrancar
    expect(alive[0].at).toBe(10_000);
    expect(alive[0].capabilities).toEqual(CAPS);
    expect(cashier.lastDisplaySeenAt).toBe(10_000);
    clock = 11_000;
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    await flush(4);
    clock = 12_000;
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    await flush(4);
    expect(alive.map((m) => m.at)).toEqual([10_000, 11_000, 12_000]);
    expect(cashier.lastDisplaySeenAt).toBe(12_000);
    display.stopPresence();
    display.stopPresence();
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 5);
    await flush(4);
    expect(alive).toHaveLength(3);
    expect(cashier.lastDisplaySeenAt).toBe(12_000); // la caja la deja caducar con STALE_AFTER_MS
  });

  it('un segundo startPresence actualiza las capacidades (resize) sin abrir otro intervalo', async () => {
    fakeTimers();
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const alive: Array<Extract<UpMessage, { t: 'display_alive' }>> = [];
    cashier.onUp((m) => {
      if (m.t === 'display_alive') alive.push(m);
    });
    display.startPresence({ touch: false, width: 800, height: 600 });
    await flush(4);
    display.startPresence({ touch: false, width: 1920, height: 1080 });
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    await flush(4);
    expect(alive.map((m) => m.capabilities.width)).toEqual([800, 1920]);
  });

  it('receiver.close() → la caja recibe display_bye y lastDisplaySeenAt vuelve a null; close(false) no se despide; need_snapshot también cuenta como presencia', async () => {
    fakeTimers();
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A, now: () => 5000 }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    const display = new BroadcastChannelReceiver({ terminalId: TERMINAL });
    display.startPresence({ ...CAPS });
    await flush(4);
    expect(cashier.lastDisplaySeenAt).toBe(5000);
    display.close();
    display.close(); // idempotente: un solo bye
    await flush(4);
    expect(ups.map((m) => m.t)).toEqual(['display_alive', 'display_bye']);
    expect(cashier.lastDisplaySeenAt).toBeNull();
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
    await flush(4);
    expect(ups).toHaveLength(2);
    const muda = new BroadcastChannelReceiver({ terminalId: TERMINAL });
    muda.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush(4);
    expect(cashier.lastDisplaySeenAt).toBe(5000);
    muda.close(false);
    await flush(4);
    expect(ups.map((m) => m.t)).toEqual(['display_alive', 'display_bye', 'need_snapshot']);
    expect(cashier.lastDisplaySeenAt).toBe(5000);
  });

  it('la presencia va a TODAS las pestañas de la terminal (sin toInstanceId) aunque la pantalla siga a una; las intenciones siguen dirigidas', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_B }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 10 }));
    const upsA: UpMessage[] = [];
    const upsB: UpMessage[] = [];
    tabA.onUp((m) => upsA.push(m));
    tabB.onUp((m) => upsB.push(m));
    tabA.publish(HELLO);
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    display.startPresence({ ...CAPS });
    display.send({ t: 'qr_paid_claim', cartId: 'c-1' });
    await waitFor(() => upsA.some((m) => m.t === 'qr_paid_claim') && upsB.some((m) => m.t === 'display_alive'));
    display.stopPresence();
    display.close();
    await flush(5);
    const aliveA = upsA.filter((m) => m.t === 'display_alive');
    const aliveB = upsB.filter((m) => m.t === 'display_alive');
    expect(aliveA.length).toBeGreaterThan(0);
    expect(aliveB.length).toBeGreaterThan(0);
    expect(aliveA.every((m) => m.toInstanceId === undefined)).toBe(true);
    expect(upsB.map((m) => m.t)).not.toContain('qr_paid_claim');
    expect(upsA.filter((m) => m.t === 'qr_paid_claim')[0].toInstanceId).toBe(INSTANCE_A);
    expect(upsB.map((m) => m.t)).toContain('display_bye');
    expect(tabA.lastDisplaySeenAt).toBeNull();
    expect(tabB.lastDisplaySeenAt).toBeNull();
  });

  it('lastDisplaySeenAt usa el reloj del transporte, no el `at` del mensaje: una pantalla con reloj desfasado no pinta el indicador en el futuro', async () => {
    let clock = 100;
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A, now: () => clock }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => 999_999_999 }));
    cashier.onUp(() => undefined);
    display.startPresence({ ...CAPS });
    await waitFor(() => cashier.lastDisplaySeenAt !== null);
    expect(cashier.lastDisplaySeenAt).toBe(100);
    clock = 200;
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => cashier.lastDisplaySeenAt === 200);
  });

  it('F0: una pantalla por terminal. Con dos, el display_bye de una deja lastDisplaySeenAt en null hasta el siguiente display_alive de la otra (≤ 1 s)', async () => {
    let now = 1_000;
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, now: () => now }));
    const d1 = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const d2 = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    d1.send({ t: 'need_snapshot', capabilities: CAPS });
    d2.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => cashier.lastDisplaySeenAt === 1_000);
    now = 2_000;
    d1.close(); // display_bye
    await waitFor(() => cashier.lastDisplaySeenAt === null);
    now = 2_500;
    d2.send({ t: 'display_alive', at: now, capabilities: CAPS });
    await waitFor(() => cashier.lastDisplaySeenAt === 2_500);
  });
});

// ---------------------------------------------------------------------------
// Suscripción y cierre
// ---------------------------------------------------------------------------

describe('transporte · suscripción y cierre', () => {
  it('onUp/onDown devuelven una función para darse de baja; un handler que se desuscribe durante el despacho no rompe a los demás', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const calls: string[] = [];
    const off = display.onDown(() => {
      calls.push('uno');
      off();
    });
    display.onDown(() => calls.push('dos'));
    cashier.publish({ t: 'heartbeat', at: 1 });
    cashier.publish({ t: 'heartbeat', at: 2 });
    await waitFor(() => calls.length === 3);
    expect(calls).toEqual(['uno', 'dos', 'dos']);
  });

  it('un handler que lanza no impide que los demás reciban, y el receptor avanza seq y lastReceivedAt igual', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let clock = 5000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const got: DownMessage[] = [];
    display.onDown(() => {
      throw new Error('handler roto');
    });
    display.onDown((m) => got.push(m));
    cashier.publish(idle);
    await waitFor(() => got.length === 1);
    expect(display.lastSeq).toBe(1);
    expect(display.lastReceivedAt).toBe(5000);
    clock = 6000;
    cashier.publish(idle);
    await waitFor(() => got.length === 2);
    expect(display.lastReceivedAt).toBe(6000);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('tras close, publicar/enviar/startPresence es no-op, nada llega y nada lanza', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    const ups: UpMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.onUp((m) => ups.push(m));
    cashier.close(false); // sin bye
    display.close(false);
    expect(cashier.isClosed).toBe(true);
    expect(display.isClosed).toBe(true);
    expect(() => display.close()).not.toThrow();
    expect(() => cashier.publish({ t: 'heartbeat', at: 1 })).not.toThrow();
    expect(() => display.send({ t: 'qr_paid_claim', cartId: 'c1' })).not.toThrow();
    expect(() => display.startPresence(CAPS)).not.toThrow();
    await flush();
    expect(got).toEqual([]);
    expect(ups).toEqual([]);
    expect(cashier.lastSeq).toBe(0);
    expect(display.lastReceivedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Extremo a extremo: proyección → transporte → pantalla
// ---------------------------------------------------------------------------

describe('transporte · extremo a extremo con la proyección', () => {
  it('un carrito de 200 líneas con modificadores, variantes y notas cruza el canal intacto y pasa el guard', async () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({
        id: `l${i}`, product_id: 1000 + i, quantity: (i % 4) + 1, unit_price: 2500 + i, discount_amount: i % 7 === 0 ? 100 : 0,
        notes: i % 11 === 0 ? `nota ${i}` : undefined, tax_included: i % 2 === 0,
        modifiers: i % 3 === 0 ? [{ groupId: 1, groupName: 'Extra', modifierId: i, name: `Extra ${i}`, extraPrice: 500 }] : undefined,
        product: { ...product(1000 + i), ...(i % 5 === 0 ? { variant_data: { Talla: 'M' } } : {}) } as Product,
      }),
    );
    const projected = projectCartForDisplay(cart({ items }), { currency: 'COP', lastChangedLineId: 'l199' });
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
    expect(msg.state.cart?.lines[0].variant).toEqual([{ attr: 'Talla', value: 'M' }]);
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
});
