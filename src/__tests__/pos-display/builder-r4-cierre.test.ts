/**
 * BUILDER ronda 4 (cierre) — lo que fijó el feedback de las rondas 1-3:
 * - proyección: entradas nulas en items/modifiers se filtran; id derivado si falta;
 * - receptor: releaseActiveInstance(), watchdog de silencio (STALE_AFTER_MS),
 *   regla de adopción en la ventana de elección, bye huérfano ignorado,
 *   lastByeAt / lastStaleAt para distinguir despedida de silencio.
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import type { DownMessage, UpMessage } from '@/lib/pos/display/protocol';
import {
  ADOPTION_WINDOW_MS,
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  STALE_AFTER_MS,
  displayChannelName,
  type DisplayReceiver,
} from '@/lib/pos/display/transport';

const TS = '2026-09-15T15:00:00.000Z';
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const INSTANCE_C = '33333333-3333-4333-8333-333333333333';

// setImmediate se deja real en los tests con fake timers: es lo que usa flush()
// y la entrega de BroadcastChannel en Node no depende de los timers de JS.
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
  jest.useRealTimers();
});

const hb = (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'heartbeat', seq, terminalId: TERMINAL, instanceId, at: seq });
const hello = (seq: number, instanceId: string, sessionOpen = true): DownMessage => ({
  v: 1, t: 'hello', seq, terminalId: TERMINAL, instanceId, cashier: null, sessionOpen,
});
const bye = (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'bye', seq, terminalId: TERMINAL, instanceId });
const CAPS = { touch: false, width: 1280, height: 800 } as const;

// ---------------------------------------------------------------------------
// Proyección
// ---------------------------------------------------------------------------

function product(id: number, name = `Producto ${id}`): Product {
  return { id, organization_id: 1, sku: `SKU-${id}`, name, unit_code: 'UND', status: 'active', created_at: TS, updated_at: TS };
}
function item(over: Partial<CartItem> & { id: string; product_id: number }): CartItem {
  const quantity = over.quantity ?? 1;
  const unit_price = over.unit_price ?? 1000;
  return {
    cart_id: 'cart-1', product: product(over.product_id), quantity, unit_price,
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
function corrupt<T>(value: unknown): T {
  return value as T;
}

describe('BUILDER r4 proyección: carritos viejos de localStorage', () => {
  it('items con null, undefined y primitivos → solo las entradas objeto se proyectan, en su orden', () => {
    const c = cart({ items: corrupt([null, item({ id: 'l1', product_id: 1 }), undefined, 7, 'x', item({ id: 'l2', product_id: 2 })]) });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines.map((l) => l.id)).toEqual(['l1', 'l2']);
  });

  it('modifiers con null y primitivos → solo los objeto se proyectan; la línea conserva el resto', () => {
    const c = cart({
      items: [item({ id: 'l1', product_id: 1, notes: 'sin sal', modifiers: corrupt([null, { name: 'Grande', extraPrice: 500 }, 0, false, { name: 'Sin hielo', extraPrice: 0 }]) })],
    });
    const line = projectCartForDisplay(c, { currency: 'COP' }).lines[0];
    expect(line.modifiers).toEqual([{ name: 'Grande', extraPrice: 500 }, { name: 'Sin hielo', extraPrice: 0 }]);
    expect(line.note).toBe('sin sal');
  });

  it('taxIncluded se decide solo con los ítems válidos (los nulos no cuentan)', () => {
    const c = cart({ items: corrupt([null, item({ id: 'l1', product_id: 1, tax_included: true })]) });
    expect(projectCartForDisplay(c, { currency: 'COP' }).taxIncluded).toBe(true);
    expect(projectCartForDisplay(cart({ items: corrupt([null]), tax_included: false }), { currency: 'COP' }).taxIncluded).toBe(false);
  });

  it('id derivado: el índice es la posición entre las líneas proyectadas, y es determinista', () => {
    const noId1 = item({ id: '', product_id: 5 });
    const noId2 = item({ id: corrupt(undefined), product_id: 6 });
    const c = cart({ items: corrupt([null, noId1, item({ id: 'l', product_id: 1 }), noId2]) });
    const a = projectCartForDisplay(c, { currency: 'COP' });
    const b = projectCartForDisplay(c, { currency: 'COP' });
    expect(a.lines.map((l) => l.id)).toEqual(['linea:5:0', 'l', 'linea:6:2']);
    expect(a).toEqual(b);
  });

  it('id derivado sin product_id → "x" como marcador, sigue siendo string no vacío', () => {
    const c = cart({ items: [item({ id: '', product_id: corrupt(undefined) })] });
    expect(projectCartForDisplay(c, { currency: 'COP' }).lines[0].id).toBe('linea:x:0');
  });

  it('lastChangedLineId puede apuntar a un id derivado', () => {
    const c = cart({ items: [item({ id: '', product_id: 9 })] });
    expect(projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'linea:9:0' }).lastChangedLineId).toBe('linea:9:0');
  });
});

// ---------------------------------------------------------------------------
// Receptor: liberación y watchdog
// ---------------------------------------------------------------------------

describe('BUILDER r4 receptor: releaseActiveInstance y watchdog', () => {
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

    // La siguiente que hable se adopta aunque traiga seq menor (contador por instancia).
    raw.postMessage(hb(1, INSTANCE_B));
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('el watchdog suelta la activa a STALE_AFTER_MS sin mensajes aceptados y deja lastStaleAt', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    let clock = 10_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage(hello(1, INSTANCE_A));
    await waitFor(() => got.length === 1);
    expect(display.activeInstanceId).toBe(INSTANCE_A);

    jest.advanceTimersByTime(STALE_AFTER_MS - 1);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    clock = 13_500;
    jest.advanceTimersByTime(1);
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastSeq).toBe(-1);
    expect(display.lastStaleAt).toBe(13_500);
    expect(display.lastByeAt).toBeNull();
    expect(display.lastReceivedAt).toBe(10_000); // se conserva: la UI mide el silencio con él
    expect(got).toHaveLength(1); // nada se entrega por el silencio
  });

  it('cada mensaje aceptado rearma el watchdog; uno descartado (seq viejo u otra instancia) no', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
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

  it('tras el silencio, el siguiente need_snapshot sale sin destinatario y la pestaña viva lo atiende', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const upsB: UpMessage[] = [];
    tabB.onUp((m) => upsB.push(m));

    tabA.publish({ t: 'hello', cashier: null, sessionOpen: true });
    await waitFor(() => display.activeInstanceId === tabA.instanceId);
    tabA.close(false); // muere sin bye
    jest.advanceTimersByTime(STALE_AFTER_MS);
    expect(display.activeInstanceId).toBeNull();

    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => upsB.length === 1);
    expect(upsB[0]).not.toHaveProperty('toInstanceId');
  });

  it('staleAfterMs: 0 desactiva el watchdog', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: 0 }));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(1, INSTANCE_A));
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    jest.advanceTimersByTime(STALE_AFTER_MS * 10);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('close() apaga el watchdog: no queda timer vivo', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const display = new BroadcastChannelReceiver({ terminalId: TERMINAL });
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(1, INSTANCE_A));
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    expect(jest.getTimerCount()).toBe(1);
    display.close();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bye de la activa deja lastByeAt y no lastStaleAt: la UI distingue «caja cerrada» de «sin señal»', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
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
    // El bye desarma el watchdog: no hay nada que soltar y no debe quedar timer.
    expect(jest.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Receptor: ventana de elección
// ---------------------------------------------------------------------------

describe('BUILDER r4 receptor: regla de adopción en la ventana de elección', () => {
  /** Receptor con reloj inyectado, sin instancia activa y con la ventana abierta por un need_snapshot. */
  async function openElection(): Promise<{ display: BroadcastChannelReceiver; raw: BroadcastChannel; got: DownMessage[]; tick(ms: number): void }> {
    let clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    return { display, raw, got, tick: (ms) => { clock += ms; } };
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
    raw.postMessage({ v: 1, t: 'state', seq: 100, terminalId: TERMINAL, instanceId: INSTANCE_B, state: { mode: 'idle', cart: null, payment: null, tip: null, thanks: null } });
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

  it('sin need_snapshot previo no hay ventana: la regla general aplica desde el principio', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(50, INSTANCE_A, true));
    raw.postMessage(hello(1, INSTANCE_B, false));
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('un need_snapshot CON destinatario (ya hay activa) no abre ventana', async () => {
    let clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(50, INSTANCE_A, true));
    await waitFor(() => got.length === 1);
    display.send({ t: 'need_snapshot', capabilities: CAPS }); // dirigido a A
    await flush();
    clock += 1;
    raw.postMessage(hello(1, INSTANCE_B, false)); // regla general: releva
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
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

  it('extremo a extremo con dos cajas reales: la de caja abierta gana la elección aunque la otra responda antes', async () => {
    const tabClosed = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabOpen = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    tabClosed.onUp((m) => {
      if (m.t === 'need_snapshot') tabClosed.publish({ t: 'hello', cashier: null, sessionOpen: false });
    });
    tabOpen.onUp((m) => {
      if (m.t === 'need_snapshot') setTimeout(() => tabOpen.publish({ t: 'hello', cashier: { name: 'Caja 1' }, sessionOpen: true }), 15);
    });

    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => got.some((m) => m.instanceId === tabOpen.instanceId), 2000);
    expect(display.activeInstanceId).toBe(tabOpen.instanceId);

    // Y la propina va dirigida a la que proyecta.
    const upsOpen: UpMessage[] = [];
    const upsClosed: UpMessage[] = [];
    tabOpen.onUp((m) => upsOpen.push(m));
    tabClosed.onUp((m) => upsClosed.push(m));
    display.send({ t: 'tip_selected', cartId: 'c1', kind: 'percent', value: 10 });
    await waitFor(() => upsOpen.length === 1);
    await flush();
    expect(upsClosed.filter((m) => m.t === 'tip_selected')).toEqual([]);
  });
});

describe('BUILDER r4 receptor: la interfaz DisplayReceiver expone lo que la Parte C necesita', () => {
  it('releaseActiveInstance y los getters están en la interfaz, no solo en la clase', async () => {
    const concrete = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const receiver: DisplayReceiver = concrete;
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hello(3, INSTANCE_A));
    await waitFor(() => receiver.activeInstanceId === INSTANCE_A);
    expect(receiver.lastSeq).toBe(3);
    expect(typeof receiver.lastReceivedAt).toBe('number');
    expect(receiver.lastByeAt).toBeNull();
    expect(receiver.lastStaleAt).toBeNull();
    receiver.releaseActiveInstance();
    expect(receiver.activeInstanceId).toBeNull();
  });
});
