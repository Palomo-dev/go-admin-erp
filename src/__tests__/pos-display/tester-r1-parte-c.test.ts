/**
 * Tester · Parte C (ruta /pos-display) · ronda 1.
 *
 * Casos borde y de error que el builder no cubrió, agrupados en cuatro
 * bloques:
 *  1. Lógica pura de src/components/pos-display/logic.ts (contraste, recorte,
 *     impuestos, resolución de vista) con entradas degeneradas.
 *  2. `readCapabilities()` del receptor (touch / tamaño) con y sin ventana.
 *  3. Paridad i18n: el namespace `posDisplay` existe en los cuatro idiomas,
 *     con las mismas claves y los mismos marcadores ICU, y toda clave que
 *     usan los componentes existe en `messages/es.json`.
 *  4. Contrato del receptor de la Parte A del que depende
 *     `useDisplayReceiver` (bye, silencio, versión ajena, terminal ajena,
 *     seq fuera de orden, carrito de 200 líneas), con BroadcastChannel real
 *     de Node.
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import fs from 'fs';
import path from 'path';
import type { DisplayCart, DisplayLine, DisplayPayment, DisplayState, DownMessage } from '@/lib/pos/display/protocol';
import { isDownMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, displayChannelName } from '@/lib/pos/display/transport';
import {
  AA_CONTRAST,
  FALLBACK_BRAND_COLOR,
  contrastRatio,
  ensureAaOnWhite,
  fitLastLines,
  parseHexColor,
  relativeLuminance,
  resolveView,
  taxLabelKind,
  trimLines,
  type DisplayView,
} from '@/components/pos-display/logic';
import { readCapabilities } from '@/components/pos-display/useDisplayReceiver';

const WHITE = { r: 255, g: 255, b: 255 };
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = 'ffffffff-0000-4111-8222-333333333333';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';

function line(overrides: Partial<DisplayLine> & { id: string }): DisplayLine {
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

function cart(lines: DisplayLine[], overrides: Partial<DisplayCart> = {}): DisplayCart {
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  return {
    id: 'carrito-1',
    currency: 'COP',
    lines,
    subtotal,
    discountTotal: 0,
    discountLabel: null,
    taxTotal: 190,
    taxIncluded: true,
    total: subtotal,
    lastChangedLineId: lines.length ? lines[lines.length - 1].id : null,
    ...overrides,
  };
}

function state(overrides: Partial<DisplayState>): DisplayState {
  return { mode: 'idle', cart: null, payment: null, tip: null, thanks: null, ...overrides };
}

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Lógica pura: contraste
// ---------------------------------------------------------------------------

describe('contraste · entradas degeneradas', () => {
  it('blanco puro (#fff y #ffffff) converge a un color con AA y el resultado es idempotente', () => {
    for (const input of ['#fff', '#FFFFFF', 'ffffff']) {
      const fixed = ensureAaOnWhite(input);
      expect(fixed).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastRatio(parseHexColor(fixed)!, WHITE)).toBeGreaterThanOrEqual(AA_CONTRAST);
      // Aplicarlo dos veces no cambia nada: lo que ya cumple se devuelve tal cual.
      expect(ensureAaOnWhite(fixed)).toBe(fixed);
    }
  });

  it('negro y colores ya oscuros no se tocan; nunca se aclara un color', () => {
    expect(ensureAaOnWhite('#000')).toBe('#000000');
    expect(ensureAaOnWhite('#000000')).toBe('#000000');
    const samples = ['#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ff00ff', '#ffff00', '#808080', '#123456', '#abcdef'];
    for (const input of samples) {
      const before = relativeLuminance(parseHexColor(input)!);
      const after = relativeLuminance(parseHexColor(ensureAaOnWhite(input))!);
      expect(after).toBeLessThanOrEqual(before + 1e-9);
      expect(contrastRatio(parseHexColor(ensureAaOnWhite(input))!, WHITE)).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
  });

  it('un canal en 0 se queda en 0 al oscurecer (el tono no se desplaza hacia el gris)', () => {
    const cyan = parseHexColor(ensureAaOnWhite('#00ffff'))!;
    expect(cyan.r).toBe(0);
    expect(cyan.g).toBe(cyan.b);
  });

  it('hex con alfa (#rrggbbaa), 4 dígitos, nombres CSS y objetos caen al neutro', () => {
    for (const bad of ['#2563eb80', '#abcd', 'rebeccapurple', 'hsl(0 0% 0%)', {}, [], 0x2563eb, true]) {
      expect(ensureAaOnWhite(bad)).toBe(FALLBACK_BRAND_COLOR);
    }
  });

  it('el fallback se devuelve sin corregir aunque no cumpla AA (responsabilidad de quien lo pasa)', () => {
    // Documenta el contrato: el fallback no pasa por el bucle de oscurecimiento.
    expect(ensureAaOnWhite('no-es-color', '#ffffff')).toBe('#ffffff');
  });
});

// ---------------------------------------------------------------------------
// 1. Lógica pura: recorte
// ---------------------------------------------------------------------------

describe('recorte · 200 líneas y alturas raras', () => {
  const twoHundred = Array.from({ length: 200 }, (_, i) => line({ id: `l${i}` }));

  it('con 200 líneas y sitio para ~10 se muestran las últimas y el contador cuadra', () => {
    const rowHeight = 48;
    const budget = 500;
    const reserve = 38;
    const { visible, hidden } = fitLastLines(twoHundred, () => rowHeight, budget, reserve);
    expect(visible.length + hidden).toBe(200);
    expect(visible[visible.length - 1].id).toBe('l199');
    expect(visible[0].id).toBe(`l${200 - visible.length}`);
    // Lo mostrado (más el contador) cabe en el presupuesto.
    expect(visible.length * rowHeight + reserve).toBeLessThanOrEqual(budget);
    // Y una línea más no cabría.
    expect((visible.length + 1) * rowHeight + reserve).toBeGreaterThan(budget);
  });

  it('con reserva mayor que el presupuesto sigue mostrándose al menos la última línea', () => {
    const r = fitLastLines(twoHundred, () => 48, 100, 1000);
    expect(r.visible.map((l) => l.id)).toEqual(['l199']);
    expect(r.hidden).toBe(199);
  });

  it('alturas negativas cuentan como 0 (todas caben); alturas NaN NO recortan nada', () => {
    expect(fitLastLines(twoHundred, () => -10, 100).hidden).toBe(0);
    // Documenta el hueco: si la medida del DOM diera NaN, no se recortaría y
    // el contenedor overflow-hidden ocultaría las líneas MÁS RECIENTES.
    expect(fitLastLines(twoHundred, () => Number.NaN, 100).hidden).toBe(0);
  });

  it('trimLines con max Infinity muestra TODAS las líneas (ronda 2: antes caía al mínimo de 1)', () => {
    expect(trimLines([1, 2, 3], Number.POSITIVE_INFINITY)).toEqual({ visible: [1, 2, 3], hidden: 0 });
    // -Infinity y NaN siguen siendo «al menos una».
    expect(trimLines([1, 2, 3], Number.NEGATIVE_INFINITY)).toEqual({ visible: [3], hidden: 2 });
  });

  it('preserva el orden y la identidad de los objetos (no clona líneas)', () => {
    const r = fitLastLines(twoHundred, () => 10, 35, 0);
    expect(r.visible[0]).toBe(twoHundred[197]);
    expect(r.visible[2]).toBe(twoHundred[199]);
  });
});

// ---------------------------------------------------------------------------
// 1. Lógica pura: impuestos
// ---------------------------------------------------------------------------

describe('impuestos · casos borde', () => {
  it('taxTotal NaN, Infinity negativo o 0 → none', () => {
    expect(taxLabelKind(cart([line({ id: '1' })], { taxTotal: Number.NaN }))).toBe('none');
    expect(taxLabelKind(cart([line({ id: '1' })], { taxTotal: Number.NEGATIVE_INFINITY }))).toBe('none');
    expect(taxLabelKind(cart([line({ id: '1' })], { taxTotal: 0 }))).toBe('none');
  });

  it('carrito sin líneas pero con taxTotal > 0 decide por la bandera global', () => {
    expect(taxLabelKind(cart([], { taxTotal: 100, taxIncluded: true }))).toBe('included');
    expect(taxLabelKind(cart([], { taxTotal: 100, taxIncluded: false }))).toBe('breakdown');
  });

  it('la bandera global no manda si hay líneas: taxIncluded=true con todas las líneas excluidas de inclusión → desglose', () => {
    const c = cart([line({ id: '1', taxIncluded: false }), line({ id: '2', taxIncluded: false })], { taxIncluded: true });
    expect(taxLabelKind(c)).toBe('breakdown');
  });

  it('una sola línea gravada decide aunque las demás estén excluidas', () => {
    const c = cart([
      line({ id: '1', taxExcluded: true, taxIncluded: true }),
      line({ id: '2', taxExcluded: true, taxIncluded: true }),
      line({ id: '3', taxIncluded: false }),
    ]);
    expect(taxLabelKind(c)).toBe('breakdown');
  });
});

// ---------------------------------------------------------------------------
// 1. Lógica pura: resolución de vista
// ---------------------------------------------------------------------------

describe('resolución de vista · prioridades y bloques degenerados', () => {
  const base = { connected: true, updateRequired: false };

  it('sin caja, «Actualice» gana a «demasiado tiempo sin caja»', () => {
    expect(resolveView({ connected: false, updateRequired: true, disconnectedTooLong: true, state: null })).toBe('update_required');
  });

  it('con caja viva, disconnectedTooLong y thanksExpired residuales no cambian nada', () => {
    const c = cart([line({ id: '1' })]);
    expect(resolveView({ ...base, disconnectedTooLong: true, state: state({ mode: 'order', cart: c }) })).toBe('order');
    expect(resolveView({ ...base, thanksExpired: true, state: state({ mode: 'order', cart: c }) })).toBe('order');
  });

  it('cart.lines que no es array (pasó por encima del guard) → Reposo sin lanzar', () => {
    const broken = state({ mode: 'order', cart: { ...cart([]), lines: null as unknown as DisplayLine[] } });
    expect(resolveView({ ...base, state: broken })).toBe('idle');
  });

  it('payment con method desconocido → Reposo (ronda 2: resolveView es total, ya no devuelve undefined)', () => {
    const c = cart([line({ id: '1' })]);
    const weird = { method: 'nequi', total: 1000 } as unknown as DisplayPayment;
    const view: DisplayView = resolveView({ ...base, state: state({ mode: 'payment', cart: c, payment: weird }) });
    expect(view).toBe('idle');
    // …y el guard sigue parándolo antes de llegar aquí.
    const msg = { v: 1, t: 'state', seq: 0, terminalId: TERMINAL, instanceId: INSTANCE_A, state: state({ mode: 'payment', cart: c, payment: weird }) };
    expect(isDownMessage(msg)).toBe(false);
  });

  it('cobro en efectivo sin recibido ni cambio sigue siendo Cobro·efectivo (la vista pinta «—»)', () => {
    const c = cart([line({ id: '1' })]);
    const p: DisplayPayment = { method: 'cash', total: 1000, received: null, change: null };
    expect(resolveView({ ...base, state: state({ mode: 'payment', cart: c, payment: p }) })).toBe('payment_cash');
  });

  it('cobro con carrito vacío pero payment presente → se cobra igual (el importe viene en payment)', () => {
    const p: DisplayPayment = { method: 'card', total: 1000, provider: null };
    expect(resolveView({ ...base, state: state({ mode: 'payment', cart: null, payment: p }) })).toBe('payment_card');
  });

  it('gracias con total 0 (venta 100 % descontada) sigue siendo Gracias', () => {
    expect(resolveView({ ...base, state: state({ mode: 'thanks', thanks: { total: 0, askRating: false } }) })).toBe('thanks');
  });
});

// ---------------------------------------------------------------------------
// 2. readCapabilities
// ---------------------------------------------------------------------------

describe('readCapabilities', () => {
  const g = globalThis as unknown as { window?: unknown; navigator?: unknown };
  const originalWindow = g.window;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (originalWindow === undefined) delete g.window;
    else g.window = originalWindow;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete g.navigator;
  });

  it('sin window devuelve touch=false y 0×0 (SSR)', () => {
    delete g.window;
    expect(readCapabilities()).toEqual({ touch: false, width: 0, height: 0 });
  });

  it('con window: touch = maxTouchPoints > 0 y el tamaño interior de la ventana', () => {
    g.window = { innerWidth: 1920, innerHeight: 1080 };
    Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 5 }, configurable: true, writable: true });
    expect(readCapabilities()).toEqual({ touch: true, width: 1920, height: 1080 });

    Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0 }, configurable: true, writable: true });
    expect(readCapabilities().touch).toBe(false);

    // Navegadores viejos sin maxTouchPoints: no táctil, sin lanzar.
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    expect(readCapabilities().touch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Paridad i18n
// ---------------------------------------------------------------------------

describe('i18n · namespace posDisplay', () => {
  const root = path.resolve(__dirname, '../../..');
  const locales = ['es', 'en', 'fr', 'pt'] as const;

  function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key));
      else out[key] = String(v);
    }
    return out;
  }

  const loaded = Object.fromEntries(
    locales.map((loc) => {
      const json = JSON.parse(fs.readFileSync(path.join(root, 'messages', `${loc}.json`), 'utf8')) as Record<string, unknown>;
      return [loc, json.posDisplay as Record<string, unknown> | undefined];
    }),
  ) as Record<(typeof locales)[number], Record<string, unknown> | undefined>;

  it('los cuatro archivos de mensajes tienen el namespace', () => {
    for (const loc of locales) expect(loaded[loc]).toBeDefined();
  });

  it('las claves son las mismas en los cuatro idiomas', () => {
    const es = Object.keys(flatten(loaded.es!)).sort();
    for (const loc of locales) {
      expect(Object.keys(flatten(loaded[loc]!)).sort()).toEqual(es);
    }
  });

  it('los marcadores ICU ({name}, {count}…) coinciden clave a clave con el español', () => {
    const placeholders = (s: string) => (s.match(/\{[a-zA-Z_]+\}/g) ?? []).sort();
    const es = flatten(loaded.es!);
    for (const loc of locales) {
      const other = flatten(loaded[loc]!);
      for (const key of Object.keys(es)) {
        expect({ loc, key, ph: placeholders(other[key]) }).toEqual({ loc, key, ph: placeholders(es[key]) });
      }
    }
  });

  it('toda clave t(\'…\') usada por los componentes existe en español y ninguna traducción está vacía', () => {
    const dir = path.join(root, 'src', 'components', 'pos-display');
    const used = new Set<string>();
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      // Solo las llamadas con clave literal; las dinámicas (ternarios) se listan abajo.
      for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1]);
    }
    // Claves elegidas en runtime en OrderView (etiqueta de impuestos).
    for (const k of ['taxIncluded', 'taxMixed', 'taxes']) used.add(k);
    const es = flatten(loaded.es!);
    expect(used.size).toBeGreaterThan(10);
    for (const key of used) {
      expect({ key, defined: key in es }).toEqual({ key, defined: true });
    }
    for (const loc of locales) {
      for (const [key, value] of Object.entries(flatten(loaded[loc]!))) {
        expect({ loc, key, empty: value.trim() === '' }).toEqual({ loc, key, empty: false });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Contrato del receptor del que depende useDisplayReceiver
// ---------------------------------------------------------------------------

describe('receptor · lo que la pantalla asume de la Parte A', () => {
  const down = (seq: number, extra: Partial<DownMessage> & { t: DownMessage['t'] }, instanceId = INSTANCE_A): DownMessage =>
    ({ v: 1, seq, terminalId: TERMINAL, instanceId, ...extra }) as DownMessage;

  function rawChannel(terminalId = TERMINAL): BroadcastChannel {
    return track(new BroadcastChannel(displayChannelName(terminalId)));
  }

  it('tras un bye de la activa: lastByeAt ≥ lastReceivedAt (la pantalla lo lee como «sin caja») y el siguiente need_snapshot va sin destinatario', async () => {
    let now = 1000;
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => now }));
    const caja = rawChannel();
    const seen: unknown[] = [];
    caja.onmessage = (e) => seen.push(e.data);

    caja.postMessage(down(0, { t: 'hello', organizationId: 1, cashier: { name: 'Cajero' }, sessionOpen: true } as Partial<DownMessage> & { t: 'hello' }));
    await flush();
    expect(receiver.activeInstanceId).toBe(INSTANCE_A);
    expect(receiver.lastReceivedAt).toBe(1000);

    now = 1500;
    caja.postMessage(down(1, { t: 'bye' }));
    await flush();
    expect(receiver.lastByeAt).not.toBeNull();
    expect(receiver.lastByeAt!).toBeGreaterThanOrEqual(receiver.lastReceivedAt!);
    expect(receiver.activeInstanceId).toBeNull();

    receiver.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1, height: 1 } });
    await flush();
    const snapshot = seen.find((m) => (m as { t?: string }).t === 'need_snapshot') as { toInstanceId?: string } | undefined;
    expect(snapshot).toBeDefined();
    expect(snapshot!.toInstanceId).toBeUndefined();
  });

  it('un sobre de la terminal con v=2 marca incompatibleVersionAt y no entrega nada; basura sin sobre ni marca ni entrega', async () => {
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => 42 }));
    const delivered: DownMessage[] = [];
    receiver.onDown((m) => delivered.push(m));
    const caja = rawChannel();

    for (const garbage of ['{"v":1}', null, 7, [], { t: 'state' }, { v: 'uno', t: 'hello', terminalId: TERMINAL }]) {
      caja.postMessage(garbage);
    }
    await flush();
    expect(delivered).toHaveLength(0);
    expect(receiver.incompatibleVersionAt).toBeNull();
    expect(receiver.lastReceivedAt).toBeNull();

    caja.postMessage({ v: 2, t: 'state', seq: 0, terminalId: TERMINAL, instanceId: INSTANCE_A, state: {} });
    await flush();
    expect(delivered).toHaveLength(0);
    expect(receiver.incompatibleVersionAt).toBe(42);
    expect(receiver.incompatibleVersionCount).toBe(1);
    // Sin mensajes válidos: la pantalla mostrará «Actualice la pantalla».
    expect(receiver.lastReceivedAt).toBeNull();
  });

  it('una caja de OTRA terminal nunca conecta la pantalla (lastReceivedAt sigue null)', async () => {
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => 1 }));
    const delivered: DownMessage[] = [];
    receiver.onDown((m) => delivered.push(m));
    // Mismo canal (nombre de la terminal de la pantalla) pero sobre con otro terminalId.
    const intruso = rawChannel();
    intruso.postMessage({ ...down(0, { t: 'heartbeat', at: 1 } as Partial<DownMessage> & { t: 'heartbeat' }), terminalId: OTHER_TERMINAL });
    intruso.postMessage({ ...down(1, { t: 'state', state: state({ mode: 'order', cart: cart([line({ id: '1' })]) }) } as Partial<DownMessage> & { t: 'state' }), terminalId: OTHER_TERMINAL });
    await flush();
    expect(delivered).toHaveLength(0);
    expect(receiver.lastReceivedAt).toBeNull();
    expect(receiver.incompatibleVersionAt).toBeNull();
  });

  it('seq fuera de orden: un state viejo no pisa al nuevo', async () => {
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => 1 }));
    const delivered: DownMessage[] = [];
    receiver.onDown((m) => delivered.push(m));
    const caja = rawChannel();
    const nuevo = state({ mode: 'order', cart: cart([line({ id: '1' }), line({ id: '2' })]) });
    const viejo = state({ mode: 'order', cart: cart([line({ id: '1' })]) });
    caja.postMessage(down(5, { t: 'state', state: nuevo } as Partial<DownMessage> & { t: 'state' }));
    caja.postMessage(down(3, { t: 'state', state: viejo } as Partial<DownMessage> & { t: 'state' }));
    await flush();
    expect(delivered).toHaveLength(1);
    expect((delivered[0] as Extract<DownMessage, { t: 'state' }>).state.cart!.lines).toHaveLength(2);
    expect(receiver.lastSeq).toBe(5);
  });

  it('un carrito de 200 líneas con modificadores y notas cruza el canal intacto', async () => {
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => 1 }));
    const delivered: DownMessage[] = [];
    receiver.onDown((m) => delivered.push(m));
    const caja = rawChannel();
    const lines = Array.from({ length: 200 }, (_, i) =>
      line({
        id: `l${i}`,
        qty: i % 7,
        modifiers: [{ name: 'Sin azúcar', extraPrice: 0 }, { name: 'Extra queso', extraPrice: 1500 }],
        note: i % 3 === 0 ? 'Para llevar' : null,
        discount: i % 5 === 0 ? 100 : null,
        variant: i % 2 === 0 ? [{ attr: 'Talla', value: 'M' }] : null,
      }),
    );
    const big = state({ mode: 'order', cart: cart(lines, { discountTotal: 999999, discountLabel: 'CUPÓN' }) });
    const started = Date.now();
    caja.postMessage(down(0, { t: 'state', state: big } as Partial<DownMessage> & { t: 'state' }));
    await flush();
    expect(delivered).toHaveLength(1);
    const got = (delivered[0] as Extract<DownMessage, { t: 'state' }>).state;
    expect(got.cart!.lines).toHaveLength(200);
    expect(got.cart!.lines[199]).toEqual(lines[199]);
    expect(Date.now() - started).toBeLessThan(500);
    // Y la pantalla lo pinta como Pedido aunque el descuento supere el subtotal.
    expect(resolveView({ connected: true, updateRequired: false, state: got })).toBe('order');
  });

  it('state con mode=order y cart=null pasa el guard y la vista degrada a Reposo (no a error)', async () => {
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => 1 }));
    const delivered: DownMessage[] = [];
    receiver.onDown((m) => delivered.push(m));
    const caja = rawChannel();
    caja.postMessage(down(0, { t: 'state', state: state({ mode: 'order', cart: null }) } as Partial<DownMessage> & { t: 'state' }));
    await flush();
    expect(delivered).toHaveLength(1);
    expect(resolveView({ connected: true, updateRequired: false, state: (delivered[0] as Extract<DownMessage, { t: 'state' }>).state })).toBe('idle');
  });
});
