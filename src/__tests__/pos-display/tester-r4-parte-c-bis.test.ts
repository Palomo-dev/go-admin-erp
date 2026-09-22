/**
 * Tester · ronda 4 · Parte C (/pos-display) · segunda pasada.
 *
 * Complementa tester-r4-parte-c.test.ts con los huecos que quedaban tras
 * verificar la lista de feedback de la ronda 3 contra el código:
 *
 *  - Cambio de organización EN CALIENTE en la misma caja (selector de
 *    organización): el `hello` nuevo trae la moneda nueva y «Gracias» de la
 *    segunda organización se pinta en esa moneda, no en la recordada de la
 *    anterior (PLAN §4.1.3 «nunca miente»).
 *  - Cadencia del need_snapshot repetido a una caja viva sin estado: cada
 *    RESNAPSHOT_MS, no en cada tick de salud (ni ráfaga ni silencio).
 *  - Un sobre de OTRA versión mezclado con una caja válida en vivo no
 *    cambia la vista ni la vuelve «Actualice la pantalla».
 *  - Aritmética de 1366×768 anotada en SCALE_STYLE (CustomerDisplay.tsx):
 *    5 filas simples con o sin contador, 4 con descuento en los totales,
 *    siempre ≥ 4. Se fija aquí como cálculo (no medida en navegador) para
 *    que un cambio de escala tipográfica lo delate.
 *  - Modificadores sin precio (extraPrice 0 o ausente) y cantidad 0 cruzan
 *    el emisor real y el saneado sin perder la línea.
 *
 * Tiempos a escala (latido 100 ms, silencio 300 ms, need_snapshot cada
 * 200 ms, salud cada 50 ms), esperas por sondeo. Organizaciones ficticias
 * (org 120 y org 121). Sin nombres reales.
 */

import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import type { DisplayLine } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName } from '@/lib/pos/display/transport';
import {
  counterReservePx,
  estimateRowHeightPx,
  fitLastLines,
  resolveDisplayCurrency,
  resolveView,
  viewShowsAmounts,
  type DisplayView,
} from '@/components/pos-display/logic';
import { startDisplayLink, type DisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_RAW = 'dddddddd-0000-4000-8000-00000000000d';

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
// Fixtures
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

function displayLine(overrides: Partial<DisplayLine> & { id: string }): DisplayLine {
  return {
    name: `Producto ${overrides.id}`,
    variant: null,
    qty: 1,
    unitPrice: 1000,
    total: 1000,
    modifiers: [],
    discount: null,
    note: null,
    taxExcluded: false,
    taxIncluded: true,
    ...overrides,
  };
}

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
});

function cashier(opts: { currency?: string; organizationId?: number } = {}) {
  const emitter = new DisplayEmitter({
    createTransport: () => new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: HEARTBEAT_MS }),
    isEnabled: () => true,
    thanksDurationMs: 60_000,
  });
  opened.push({ close: () => emitter.stop() });
  emitter.start({
    organizationId: opts.organizationId ?? 120,
    currency: opts.currency ?? 'USD',
    cashier: { name: 'Andrea' },
    sessionOpen: true,
  });
  return emitter;
}

interface Screen {
  link: DisplayLink;
  receiver: BroadcastChannelReceiver;
  snapshots: DisplayLinkSnapshot[];
  latest(): DisplayLinkSnapshot;
  view(): DisplayView;
  views(): DisplayView[];
  /** Moneda como la resuelve CustomerDisplay, con el recuerdo de la última pintada (useRef). */
  currency(): string;
}

function screen(): Screen {
  const receiver = track(
    new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: STALE_MS, presenceIntervalMs: 60_000, adoptionWindowMs: 50 }),
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
  let remembered: string | null = null;
  const currencyOf = (s: DisplayLinkSnapshot) => {
    const c = resolveDisplayCurrency({ cartCurrency: s.state?.cart?.currency, helloCurrency: s.hello?.currency, remembered });
    remembered = c;
    return c;
  };
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

function upObserver() {
  const ch = track(new BroadcastChannel(displayChannelName(TERMINAL)));
  const stamps: number[] = [];
  ch.onmessage = (event: MessageEvent) => {
    if ((event.data as { t?: unknown })?.t === 'need_snapshot') stamps.push(Date.now());
  };
  return { stamps };
}

// ---------------------------------------------------------------------------
// Cambio de organización en caliente en la misma caja
// ---------------------------------------------------------------------------

describe('Parte C · cambio de organización en la misma caja (selector de organización)', () => {
  itBC('la org 120 (USD) cobra y pasa a Gracias; la caja arranca la org 121 (COP): el hello nuevo trae COP y su Gracias se pinta en COP, no en la USD recordada', async () => {
    const emitter = cashier({ currency: 'USD', organizationId: 120 });
    const s = screen();
    await until(() => s.latest().state !== null, 2000, 'snapshot inicial');

    emitter.setActiveCart(cart({ id: 'c-120', items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    await until(() => s.view() === 'order', 2000, 'pedido de la org 120');
    expect(s.currency()).toBe('USD');
    emitter.setMode('thanks', { total: 5000 });
    await until(() => s.view() === 'thanks', 2000, 'gracias de la org 120');
    expect(s.currency()).toBe('USD'); // queda recordada

    // La página del POS para y vuelve a arrancar el emisor con la organización nueva.
    emitter.start({ organizationId: 121, currency: 'COP', cashier: { name: 'Andrea' }, sessionOpen: true });
    await until(() => s.latest().hello?.organizationId === 121, 2000, 'hello de la org 121');
    expect(s.latest().hello?.currency).toBe('COP');
    // Se olvidó todo lo de la 120: ni pedido ni gracias de la anterior.
    await until(() => s.latest().state !== null && s.latest().state?.mode !== 'thanks', 2000, 'estado de la org 121');
    expect(s.view()).toBe('idle');

    emitter.setActiveCart(cart({ id: 'c-121', organization_id: 121, items: [item({ id: 'm1', unit_price: 9000, total: 9000 })], subtotal: 9000, total: 9000 }));
    await until(() => s.view() === 'order', 2000, 'pedido de la org 121');
    expect(s.latest().state?.cart?.currency).toBe('COP');
    emitter.setMode('thanks', { total: 9000 });
    await until(() => s.view() === 'thanks', 2000, 'gracias de la org 121');
    expect(s.latest().state?.cart).toBeNull();
    expect(s.currency()).toBe('COP');
  });
});

// ---------------------------------------------------------------------------
// Cadencia del need_snapshot repetido
// ---------------------------------------------------------------------------

describe('Parte C · need_snapshot repetido a una caja viva sin estado', () => {
  itBC('se pide cada RESNAPSHOT_MS (ni en cada tick de salud ni nunca) y para en cuanto llega el state', async () => {
    const obs = upObserver();
    const s = screen();
    await until(() => obs.stamps.length >= 1, 1000, 'need_snapshot inicial');

    // Caja cruda que solo late (nunca anuncia hasta que se lo pidamos).
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    let seq = 0;
    const post = (extra: Record<string, unknown>) =>
      raw.postMessage({ v: 1, seq: seq++, terminalId: TERMINAL, instanceId: INSTANCE_RAW, ...extra });
    const beat = setInterval(() => post({ t: 'heartbeat', at: Date.now() }), HEARTBEAT_MS);
    opened.push({ close: () => clearInterval(beat) });
    await until(() => s.latest().connected, 1000, 'viva por latido');
    expect(s.view()).toBe('connecting');
    expect(viewShowsAmounts(s.view())).toBe(false);

    const from = obs.stamps.length;
    const window = RESNAPSHOT_MS * 5;
    await tick(window);
    const repeated = obs.stamps.length - from;
    // 5 ventanas de RESNAPSHOT_MS: entre 3 y 6 peticiones (tolerancia a la carga), nunca una por tick de salud (serían ~20).
    expect(repeated).toBeGreaterThanOrEqual(3);
    expect(repeated).toBeLessThanOrEqual(6);
    // Separación mínima entre dos peticiones consecutivas: ≥ RESNAPSHOT_MS menos el jitter del intervalo de salud.
    const gaps = obs.stamps.slice(from).slice(1).map((t, i) => t - obs.stamps[from + i]);
    expect(gaps.every((g) => g >= RESNAPSHOT_MS - HEALTH_MS)).toBe(true);

    // Al contestar con hello + state deja de preguntar.
    post({ t: 'hello', organizationId: 120, cashier: null, sessionOpen: true, currency: 'USD' });
    post({ t: 'state', state: { mode: 'idle', cart: null, payment: null, tip: null, thanks: null } });
    await until(() => s.latest().state !== null, 1000, 'state aceptado');
    const afterState = obs.stamps.length;
    await tick(RESNAPSHOT_MS * 3);
    expect(obs.stamps.length).toBe(afterState);
    expect(s.view()).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Otra versión mezclada con una caja válida
// ---------------------------------------------------------------------------

describe('Parte C · sobre de otra versión mezclado con una caja válida en vivo', () => {
  itBC('un v=2 suelto no cambia la vista (sigue Pedido) ni activa «Actualice la pantalla»', async () => {
    const emitter = cashier({ currency: 'USD' });
    const s = screen();
    await until(() => s.latest().state !== null, 2000, 'snapshot inicial');
    emitter.setActiveCart(cart({ id: 'c1', items: [item({ id: 'l1' })], subtotal: 5000, total: 5000 }));
    await until(() => s.view() === 'order', 2000, 'pedido');

    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: 2, seq: 99, terminalId: TERMINAL, instanceId: INSTANCE_RAW, t: 'state', state: { mode: 'idle' } });
    await tick(HEALTH_MS * 3);
    expect(s.view()).toBe('order');
    expect(s.latest().updateRequired).toBe(false);
    // Y la caja válida sigue mandando: una línea nueva se pinta.
    emitter.onCartsSaved([cart({ id: 'c1', items: [item({ id: 'l1' }), item({ id: 'l2' })], subtotal: 10000, total: 10000 })]);
    await until(() => s.latest().state?.cart?.lines.length === 2, 2000, 'segunda línea');
    expect(s.views()).not.toContain('update_required');
  });
});

// ---------------------------------------------------------------------------
// Modificadores sin precio y cantidad 0 con el emisor real
// ---------------------------------------------------------------------------

describe('Parte C · líneas raras con el emisor real', () => {
  itBC('modificador sin extraPrice y cantidad 0 llegan a la pantalla como línea válida (extraPrice 0, qty 0)', async () => {
    const emitter = cashier({ currency: 'USD' });
    const s = screen();
    await until(() => s.latest().state !== null, 2000, 'snapshot inicial');
    const line = item({
      id: 'l1',
      quantity: 0,
      total: 0,
      modifiers: [{ name: 'Sin azúcar' } as unknown as NonNullable<CartItem['modifiers']>[number]],
    });
    emitter.setActiveCart(cart({ id: 'c1', items: [line], subtotal: 0, total: 0 }));
    await until(() => s.view() === 'order', 2000, 'pedido con qty 0');
    const painted = s.latest().state?.cart?.lines[0];
    expect(painted?.qty).toBe(0);
    expect(painted?.modifiers).toEqual([{ name: 'Sin azúcar', extraPrice: 0 }]);
    expect(s.latest().state?.cart?.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 1366×768: la aritmética anotada en SCALE_STYLE
// ---------------------------------------------------------------------------

describe('Parte C · 1366×768 según la aritmética de SCALE_STYLE (calculada, no medida)', () => {
  // clamp(28px, 2.2vw, 44px) a 1366 → 30,052 px; clamp(18px, 1.3vw, 26px) → 17,76 → 18 px (mínimo).
  const lineFontPx = Math.max(28, Math.min(44, 1366 * 0.022));
  const smallFontPx = Math.max(18, Math.min(26, 1366 * 0.013));
  const USEFUL_PX = 351; // contenedor ≈ 385 de clientHeight menos py 34
  const DISCOUNT_ROW_PX = 49; // fila de descuento en el bloque de totales
  const heightOf = (line: DisplayLine) => estimateRowHeightPx(line, { lineFontPx, smallFontPx });
  const simple = (n: number) => Array.from({ length: n }, (_, i) => displayLine({ id: `l${i}` }));

  it('fuentes resueltas: línea ≈ 30,05 px y sublínea 18 px; fila simple ≈ 61,1 px', () => {
    expect(lineFontPx).toBeCloseTo(30.052, 2);
    expect(smallFontPx).toBe(18);
    expect(heightOf(displayLine({ id: 'x' }))).toBeCloseTo(61.078, 2);
  });

  it('con 4 filas simples caben todas sin contador; con 12 se ven 5 y el contador cabe', () => {
    const four = fitLastLines(simple(4), heightOf, USEFUL_PX, counterReservePx(smallFontPx));
    expect(four).toEqual({ visible: simple(4), hidden: 0 });
    const twelve = fitLastLines(simple(12), heightOf, USEFUL_PX, counterReservePx(smallFontPx));
    expect(twelve.visible.length).toBe(5);
    expect(twelve.hidden).toBe(7);
    const used = twelve.visible.reduce((sum, l) => sum + heightOf(l), 0) + counterReservePx(smallFontPx);
    expect(used).toBeLessThanOrEqual(USEFUL_PX);
  });

  it('con descuento en el bloque de totales quedan 4 filas simples: nunca menos de 4', () => {
    const r = fitLastLines(simple(12), heightOf, USEFUL_PX - DISCOUNT_ROW_PX, counterReservePx(smallFontPx));
    expect(r.visible.length).toBe(4);
    expect(r.hidden).toBe(8);
  });
});
