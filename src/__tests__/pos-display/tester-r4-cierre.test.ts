/**
 * TESTER ronda 4 (cierre de la Parte A) — ataques que las 13 suites previas no
 * cubren. Los tests que documentan un HALLAZGO (no un bug de código, sino una
 * consecuencia de la regla implementada) están marcados en el nombre con
 * «HALLAZGO» y fijan el comportamiento actual para que quien lo cambie lo
 * haga a sabiendas.
 *
 * Fixtures con organización ficticia. Sin nombres de clientes reales.
 */

import type { Cart, CartItem, Product } from '@/components/pos/types';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import {
  isDownMessage,
  isUpMessage,
  type DisplayState,
  type DownMessage,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import { getOrCreateLocalTerminalId, readLocalTerminalId, type TerminalIdStorage } from '@/lib/pos/display/terminal';
import {
  ADOPTION_WINDOW_MS,
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  displayChannelName,
} from '@/lib/pos/display/transport';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const CAPS = { touch: false, width: 1280, height: 800 } as const;
const TS = '2026-09-15T15:00:00.000Z';

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

const emptyState: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };
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

/**
 * Caja simulada: un transporte real que responde a need_snapshot con hello +
 * state, como hará la Parte B. `seq0` publica latidos previos para dejar el
 * contador donde se quiera (una pestaña que lleva horas abierta).
 */
async function caja(opts: { instanceId: string; sessionOpen: boolean; seq0: number; cartId: string }): Promise<BroadcastChannelTransport> {
  const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, instanceId: opts.instanceId, now: () => 0 }));
  for (let i = 0; i < opts.seq0; i += 1) t.publish({ t: 'heartbeat', at: i });
  t.onUp((m) => {
    if (m.t !== 'need_snapshot') return;
    t.publish({ t: 'hello', cashier: { name: 'Cajero' }, sessionOpen: opts.sessionOpen });
    t.publish({ t: 'state', state: orderState(opts.cartId) });
  });
  return t;
}

describe('TESTER r4 · HALLAZGO: la elección por seq prefiere la pestaña más antigua, no la que se usa', () => {
  it('dos pestañas con caja abierta: la vieja e inactiva (seq alto) gana la elección y los states de la pestaña en uso se descartan', async () => {
    // A: pestaña de fondo, abierta hace horas (seq ≈ 5000), caja abierta, sin venta.
    // B: pestaña recién recargada donde el cajero vende (seq bajo), caja abierta.
    const a = await caja({ instanceId: INSTANCE_A, sessionOpen: true, seq0: 5000, cartId: 'cart-A-vacio' });
    const b = await caja({ instanceId: INSTANCE_B, sessionOpen: true, seq0: 2, cartId: 'cart-B-en-curso' });
    await flush();

    // La pantalla se recarga a mitad de venta y pregunta.
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => got.filter((m) => m.t === 'state').length >= 1);
    await flush(5);

    // Gana A por seq (5000 > 3), aunque B es la que vende.
    expect(display.activeInstanceId).toBe(INSTANCE_A);

    // El cajero sigue tecleando en B: sus states no llegan a la pantalla.
    const before = got.length;
    b.publish({ t: 'state', state: orderState('cart-B-en-curso') });
    b.publish({ t: 'state', state: orderState('cart-B-en-curso') });
    await flush(5);
    expect(got.length).toBe(before);
    const lastState = [...got].reverse().find((m): m is Extract<DownMessage, { t: 'state' }> => m.t === 'state');
    expect(lastState?.state.cart?.id).toBe('cart-A-vacio');

    // Solo un hello de B FUERA de la ventana (foco) recupera la pantalla; B ya
    // tiene el foco, así que en la práctica el cajero debe cambiar de pestaña y volver.
    await new Promise<void>((r) => setTimeout(r, ADOPTION_WINDOW_MS + 50));
    b.publish({ t: 'hello', cashier: { name: 'Cajero' }, sessionOpen: true });
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    expect(a.isClosed).toBe(false);
  });

  it('HALLAZGO: durante la elección la pantalla ENTREGA el state de la perdedora antes que el de la ganadora (parpadeo Pedido→otro→Pedido)', async () => {
    const clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();

    // A (sin caja) responde primero con hello + state; B (con caja) después.
    const env = (seq: number, instanceId: string) => ({ v: 1 as const, seq, terminalId: TERMINAL, instanceId });
    raw.postMessage({ ...env(1, INSTANCE_A), t: 'hello', cashier: null, sessionOpen: false });
    raw.postMessage({ ...env(2, INSTANCE_A), t: 'state', state: emptyState });
    raw.postMessage({ ...env(1, INSTANCE_B), t: 'hello', cashier: null, sessionOpen: true });
    raw.postMessage({ ...env(2, INSTANCE_B), t: 'state', state: orderState('cart-B') });
    await waitFor(() => got.length >= 4);

    // La UI ve: hello A, state A (idle), hello B, state B (order). Con fundidos
    // de 200 ms, eso es un parpadeo visible al abrir/recargar la pantalla.
    expect(got.map((m) => `${m.t}:${m.instanceId === INSTANCE_A ? 'A' : 'B'}`)).toEqual(['hello:A', 'state:A', 'hello:B', 'state:B']);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });
});

describe('TESTER r4 · protocolo: lo que no viaja y la caja no puede saber', () => {
  it('HALLAZGO: no hay mensaje de subida periódico ni bye de la pantalla: la caja no puede distinguir «pantalla conectada» de «sin pantalla» (PLAN §5.1)', async () => {
    const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, instanceId: INSTANCE_A }));
    const ups: UpMessage[] = [];
    t.onUp((m) => ups.push(m));
    const display = new BroadcastChannelReceiver({ terminalId: TERMINAL });
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => ups.length === 1);
    // La pantalla se cierra: nada sube. La caja solo tiene el need_snapshot de hace un rato.
    display.close();
    await flush(5);
    expect(ups.map((m) => m.t)).toEqual(['need_snapshot']);
    // Y tampoco existe un tipo de subida que lo exprese: el guard rechaza cualquier intento.
    expect(isUpMessage({ v: 1, t: 'display_alive', terminalId: TERMINAL })).toBe(false);
    expect(isUpMessage({ v: 1, t: 'bye', terminalId: TERMINAL })).toBe(false);
  });

  it('HALLAZGO: la caja que pierde la elección no se entera y sigue publicando al vacío', async () => {
    const a = await caja({ instanceId: INSTANCE_A, sessionOpen: false, seq0: 0, cartId: 'A' });
    const b = await caja({ instanceId: INSTANCE_B, sessionOpen: true, seq0: 0, cartId: 'B' });
    const upsA: UpMessage[] = [];
    a.onUp((m) => upsA.push(m));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    await flush(5);
    // Una intención posterior va dirigida a B; A no la ve, pero nada le dice que perdió.
    display.send({ t: 'qr_paid_claim', cartId: 'B' });
    await flush(5);
    expect(upsA.map((m) => m.t)).toEqual(['need_snapshot']);
    expect(b.isClosed).toBe(false);
    expect(a.lastSeq).toBeGreaterThan(0); // sigue con su contador, sin señal de que no proyecta
  });

  it('ningún mensaje lleva organización: una pantalla de la org 1 acepta el state de una caja de la org 2 con el mismo terminalId', async () => {
    // localStorage es por origen, no por organización: si el mismo navegador
    // cambia de organización, `pos_terminal_id` se comparte y el canal también.
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const cajaOrg2 = track(new BroadcastChannelTransport({ terminalId: TERMINAL, instanceId: INSTANCE_B }));
    cajaOrg2.publish({ t: 'state', state: orderState('cart-org-2') });
    await waitFor(() => got.length === 1);
    const st = got[0] as Extract<DownMessage, { t: 'state' }>;
    expect(st.state.cart?.id).toBe('cart-org-2');
    expect('organizationId' in st).toBe(false);
    expect(st.state.cart !== null && 'organizationId' in st.state.cart).toBe(false);
  });
});

describe('TESTER r4 · receptor: ventana de elección y watchdog combinados', () => {
  it('el watchdog vence dentro de la ventana: la siguiente que hable se adopta (regla 1) aunque sea peor', async () => {
    let clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock, staleAfterMs: 20 }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    raw.postMessage({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_B, t: 'hello', cashier: null, sessionOpen: true });
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    // B muere sin bye; el watchdog (20 ms) la suelta.
    await new Promise<void>((r) => setTimeout(r, 40));
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastStaleAt).toBe(clock);
    // La ventana (reloj fijo) sigue abierta, pero sin activa se adopta la primera que hable, aunque tenga sessionOpen=false.
    clock += 10;
    raw.postMessage({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'hello', cashier: null, sessionOpen: false });
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
  });

  it('releaseActiveInstance() en plena ventana no cierra la ventana: un hello peor que llegue después se adopta (no hay activa) y uno mejor la releva', async () => {
    const clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    raw.postMessage({ v: 1, seq: 9, terminalId: TERMINAL, instanceId: INSTANCE_B, t: 'hello', cashier: null, sessionOpen: true });
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    display.releaseActiveInstance();
    raw.postMessage({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'hello', cashier: null, sessionOpen: false });
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    raw.postMessage({ v: 1, seq: 10, terminalId: TERMINAL, instanceId: INSTANCE_B, t: 'hello', cashier: null, sessionOpen: true });
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    expect(display.lastSeq).toBe(10);
  });

  it('un state de la ganadora que llega ANTES que su hello (misma vuelta) no se pierde: la adopta provisionalmente y el hello la confirma', async () => {
    const clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    raw.postMessage({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_B, t: 'state', state: orderState('B') });
    raw.postMessage({ v: 1, seq: 2, terminalId: TERMINAL, instanceId: INSTANCE_B, t: 'hello', cashier: null, sessionOpen: true });
    raw.postMessage({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'hello', cashier: null, sessionOpen: false });
    await waitFor(() => got.length >= 2);
    await flush(5);
    expect(got.map((m) => m.t)).toEqual(['state', 'hello']);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('mensajes fuera de orden de la activa: seq 3, 1, 2, 5, 4 → solo pasan 3 y 5', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: number[] = [];
    display.onDown((m) => got.push(m.seq));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    for (const seq of [3, 1, 2, 5, 4]) {
      raw.postMessage({ v: 1, seq, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'heartbeat', at: seq });
    }
    await flush(6);
    expect(got).toEqual([3, 5]);
    expect(display.lastSeq).toBe(5);
  });

  it('un bye de la activa con seq viejo se descarta y NO la libera', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: 1, seq: 5, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'heartbeat', at: 5 });
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    raw.postMessage({ v: 1, seq: 4, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'bye' });
    await flush(5);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(display.lastByeAt).toBeNull();
  });
});

describe('TESTER r4 · guards: entradas que solo pasan por la cadena de prototipos', () => {
  it('un objeto cuyas claves viven en el prototipo pasa el guard en memoria, pero no sobrevive al canal (structuredClone lo vacía)', async () => {
    const proto = { v: 1, t: 'bye', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A };
    const hostile = Object.create(proto) as Record<string, unknown>;
    // Documentado: hasEnvelope lee propiedades, no comprueba `hasOwnProperty`.
    expect(isDownMessage(hostile)).toBe(true);
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage(hostile);
    await flush(5);
    expect(got).toEqual([]);
  });

  it('un string JSON (Realtime sin parsear) no pasa; parseado sí: la Fase 3 debe parsear antes del guard', () => {
    const msg = { v: 1, t: 'heartbeat', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, at: 0 };
    const json = JSON.stringify(msg);
    expect(isDownMessage(json)).toBe(false);
    expect(isDownMessage(JSON.parse(json))).toBe(true);
  });

  it('seq como BigInt, string numérica o booleano se rechaza', () => {
    const base = { v: 1, t: 'bye', terminalId: TERMINAL, instanceId: INSTANCE_A };
    expect(isDownMessage({ ...base, seq: '1' })).toBe(false);
    expect(isDownMessage({ ...base, seq: true })).toBe(false);
    expect(isDownMessage({ ...base, seq: BigInt(1) })).toBe(false);
  });

  it('state con cart.lines array pero cart.id ausente pasa el guard: la UI no puede usar cart.id como key sin defensa', () => {
    const state = { mode: 'order', cart: { lines: [] }, payment: null, tip: null, thanks: null };
    expect(isDownMessage({ v: 1, t: 'state', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, state })).toBe(true);
  });
});

describe('TESTER r4 · proyección: bordes que la caja real puede producir', () => {
  it('HALLAZGO: cart.id no se normaliza: con id no string la proyección lo copia tal cual y la pantalla no podrá enviar tip_selected/qr_paid_claim válidos', () => {
    const c = cart({ id: undefined as unknown as string, items: [item({ id: 'l1', product_id: 1 })] });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.id).toBeUndefined();
    expect(isUpMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: out.id })).toBe(false);
  });

  it('dos ítems con el mismo id (carrito corrupto) producen dos líneas con la misma key; lastChangedLineId resalta ambas', () => {
    const c = cart({ items: [item({ id: 'dup', product_id: 1 }), item({ id: 'dup', product_id: 2 })] });
    const out = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'dup' });
    expect(out.lines.map((l) => l.id)).toEqual(['dup', 'dup']);
    expect(out.lastChangedLineId).toBe('dup');
  });

  it('descuento mayor que el subtotal: discountTotal > subtotal y total negativo se copian; la línea muestra su descuento', () => {
    const c = cart({
      items: [item({ id: 'l1', product_id: 1, quantity: 1, unit_price: 1000, discount_amount: 1500 })],
      subtotal: 1000, discount_total: 1500, tax_total: 0, total: -500,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.subtotal).toBe(1000);
    expect(out.discountTotal).toBe(1500);
    expect(out.total).toBe(-500);
    expect(out.lines[0].discount).toBe(1500);
    expect(out.lines[0].total).toBe(1000);
  });

  it('mezcla incluido/excluido: taxIncluded=true pero el total de la caja lleva sumado el impuesto de las líneas excluidas (la pantalla no puede explicarlo)', () => {
    // calculateCartTotals: total = subtotal + extraTax(excluidas) - descuento; tax_total = Σ tax_amount de TODAS.
    const c = cart({
      items: [
        item({ id: 'inc', product_id: 1, unit_price: 1190, tax_included: true, tax_amount: 190 }),
        item({ id: 'exc', product_id: 2, unit_price: 1000, tax_included: false, tax_amount: 190 }),
      ],
      subtotal: 2190, tax_total: 380, discount_total: 0, total: 2380,
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.taxIncluded).toBe(true);
    expect(out.taxTotal).toBe(380);
    // Con "IVA incluido 380" y subtotal 2190 el cliente esperaría total 2190, pero es 2380.
    expect(out.total).toBe(2380);
    expect(out.total).not.toBe(out.subtotal - out.discountTotal);
  });

  it('modificadores sin precio con nombre largo y notas con saltos de línea se conservan (solo se recortan extremos)', () => {
    const c = cart({
      items: [item({ id: 'l1', product_id: 1, notes: '  sin cebolla\n  bien caliente  ', modifiers: [{ groupId: 1, groupName: 'g', modifierId: 1, name: 'x'.repeat(500), extraPrice: 0 }] })],
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines[0].note).toBe('sin cebolla\n  bien caliente');
    expect(out.lines[0].modifiers[0].name.length).toBe(500);
    expect(out.lines[0].modifiers[0].extraPrice).toBe(0);
  });

  it('cantidad 0 con precio: total 0; cantidad NaN o Infinity: qty 0 y total 0 (toAmount solo deja finitos)', () => {
    const c = cart({
      items: [
        item({ id: 'a', product_id: 1, quantity: 0, unit_price: 1000 }),
        item({ id: 'b', product_id: 2, quantity: NaN, unit_price: 1000 }),
        item({ id: 'c', product_id: 3, quantity: Infinity, unit_price: 1000 }),
      ],
    });
    const out = projectCartForDisplay(c, { currency: 'COP' });
    expect(out.lines.map((l) => l.total)).toEqual([0, 0, 0]);
    expect(out.lines[2].qty).toBe(0); // Infinity no es finito → 0
  });

  it('200 líneas con 5 modificadores cada una: el resultado sobrevive al canal y pesa < 100 KB', async () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item({
        id: `l${i}`, product_id: i + 1, quantity: 2, unit_price: 1000 + i,
        modifiers: Array.from({ length: 5 }, (_, m) => ({ groupId: m, groupName: `g${m}`, modifierId: m, name: `Mod ${m}`, extraPrice: 100 })),
      }),
    );
    const c = cart({ items, subtotal: items.reduce((s, it) => s + it.quantity * it.unit_price, 0) });
    const out = projectCartForDisplay(c, { currency: 'COP', lastChangedLineId: 'l199' });
    expect(out.lines).toHaveLength(200);
    expect(out.lines.reduce((s, l) => s + l.total, 0)).toBe(out.subtotal);
    expect(JSON.stringify(out).length).toBeLessThan(100_000);

    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, instanceId: INSTANCE_A }));
    t.publish({ t: 'state', state: { mode: 'order', cart: out, payment: null, tip: null, thanks: null } });
    await waitFor(() => got.length === 1);
    expect((got[0] as Extract<DownMessage, { t: 'state' }>).state.cart?.lastChangedLineId).toBe('l199');
  });
});

describe('TESTER r4 · terminal: carrera de dos pestañas en el primer arranque', () => {
  it('HALLAZGO: si dos pestañas crean el id a la vez, la primera se queda con un id que ya no está en storage (canal distinto al de la pantalla)', () => {
    // Emula el entrelazado: ambas leen null antes de que ninguna escriba.
    const backing = new Map<string, string>();
    const staleRead = (): TerminalIdStorage => ({ getItem: () => null, setItem: (k, v) => backing.set(k, v) });
    const tab1 = getOrCreateLocalTerminalId(staleRead());
    const tab2 = getOrCreateLocalTerminalId(staleRead());
    const real: TerminalIdStorage = { getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => backing.set(k, v) };
    expect(tab1).not.toBe(tab2);
    expect(readLocalTerminalId(real)).toBe(tab2);
    // La pantalla leerá tab2; la caja de la pestaña 1 publica en pos-display:<tab1> y nunca se ve.
    expect(displayChannelName(tab1)).not.toBe(displayChannelName(readLocalTerminalId(real) ?? ''));
  });
});
