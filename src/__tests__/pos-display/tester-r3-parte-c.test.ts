/**
 * Tester · Parte C (ruta /pos-display) · ronda 3.
 *
 * Lo que las rondas 1 y 2 no cubrían, más los defectos encontrados en esta
 * ronda con la pantalla real en el navegador (dev server en :3002, caja
 * simulada por BroadcastChannel desde la propia página):
 *
 *  1. Moneda perdida al recargar durante «Gracias» o durante un cobro con
 *     carrito vacío: `thanks` y `payment` no llevan `currency` en el
 *     protocolo y `sanitizeDisplayCart` descarta un carrito sin líneas
 *     (con su `currency`). Una pantalla recién abierta caía a
 *     FALLBACK_CURRENCY (COP): una organización en USD veía «$ 11,90» en vez
 *     de «US$ 11,90». Corregido en la ronda 4: la moneda viaja en el `hello`
 *     (que siempre precede al `state`) y CustomerDisplay la resuelve con
 *     resolveDisplayCurrency (carrito → hello → recordada → respaldo). Los
 *     `it.failing` de la ronda 3 son ahora `it` y vigilan que no reincida.
 *  2. Adopción por latido sin estado: tras `bye` (o silencio) el receptor
 *     adopta a la primera instancia que habla aunque sea un `heartbeat`;
 *     `lastReceivedAt` avanza y la pantalla se cree «conectada» con `state`
 *     null. Ronda 3: pintaba Reposo y no volvía a pedir `need_snapshot`.
 *     Ronda 4: resolveView devuelve Conectando y displayLink.ts sigue
 *     pidiendo snapshot (ver display-link.test.ts). Aquí se fija la
 *     precondición a nivel de receptor y la vista resultante.
 *  3. Monedas raras que pasan el saneado (solo exige string no vacío): el
 *     helper del POS no debe lanzar con «PESOS», «$», «usd» ni «  ».
 *  4. Secuencia completa de una venta a nivel de estado (order → payment →
 *     thanks → idle → order) con las decisiones de resaltado y de vista.
 *  5. Dos ventas seguidas con el mismo total: la segunda «Gracias» debe
 *     volver a durar 8 s (la clave del temporizador es el total).
 *  6. Recorte con líneas altísimas (nota + 5 modificadores + variante +
 *     descuento) en 1024×768: nunca se oculta la última ni se desborda la
 *     estimación.
 *
 * Fixtures con organización ficticia (org 120). Sin nombres reales.
 */

import type { DisplayCart, DisplayLine, DisplayState, DownMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, displayChannelName } from '@/lib/pos/display/transport';
import { formatCurrency } from '@/utils/Utils';
import {
  FALLBACK_CURRENCY,
  counterReservePx,
  estimateRowHeightPx,
  fitLastLines,
  resolveDisplayCurrency,
  resolveView,
  sanitizeDisplayCart,
  sanitizeDisplayState,
  shouldHighlightAfterState,
  taxLabelKind,
  viewShowsAmounts,
  type DisplayView,
} from '@/components/pos-display/logic';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';

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
    currency: 'USD',
    lines,
    subtotal,
    discountTotal: 0,
    discountLabel: null,
    taxTotal: 0,
    taxIncluded: false,
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

/**
 * Lo que CustomerDisplay hace con la moneda, con la MISMA función que usa el
 * componente (resolveDisplayCurrency): por cada state aceptado resuelve
 * carrito → hello → última pintada → respaldo, y recuerda la resuelta (el
 * componente lo hace en un useEffect). `helloCurrency` es la del hello que
 * precede a los states (null para un emisor anterior que no la mande).
 */
function currencyAsCustomerDisplaySees(states: DisplayState[], helloCurrency: string | null): string {
  let remembered: string | null = null;
  for (const raw of states) {
    const clean = sanitizeDisplayState(raw);
    remembered = resolveDisplayCurrency({ cartCurrency: clean.cart?.currency, helloCurrency, remembered });
  }
  return remembered ?? resolveDisplayCurrency({ helloCurrency });
}

// ---------------------------------------------------------------------------
// 1. Moneda perdida al recargar
// ---------------------------------------------------------------------------

describe('moneda · pantalla recién abierta durante Gracias o cobro sin líneas', () => {
  it('el saneado descarta un carrito sin líneas y con él su currency', () => {
    const empty = cart([], { currency: 'USD' });
    expect(sanitizeDisplayCart(empty)).toBeNull();
  });

  it('con la misma sesión de pantalla la moneda del pedido sobrevive hasta Gracias, incluso con un emisor sin currency en el hello', () => {
    const order = state({ mode: 'order', cart: cart([line({ id: '1' })], { currency: 'USD' }) });
    const thanks = state({ mode: 'thanks', thanks: { total: 11.9, askRating: false } });
    expect(currencyAsCustomerDisplaySees([order, thanks], null)).toBe('USD');
  });

  // DEFECTO (ronda 3, corregido en la 4): `thanks` no lleva moneda y la
  // pantalla recién abierta no tiene carrito previo; ahora la trae el hello.
  it('pantalla recargada durante Gracias de una organización en USD sigue en USD (moneda del hello)', () => {
    const thanks = state({ mode: 'thanks', thanks: { total: 11.9, askRating: false } });
    expect(currencyAsCustomerDisplaySees([thanks], 'USD')).toBe('USD');
    expect(formatCurrency(11.9, currencyAsCustomerDisplaySees([thanks], 'USD'))).toBe(formatCurrency(11.9, 'USD'));
  });

  it('pantalla recargada durante un cobro con carrito de 0 líneas en USD sigue en USD (moneda del hello)', () => {
    const payment = state({
      mode: 'payment',
      cart: cart([], { currency: 'USD' }),
      payment: { method: 'card', total: 11.9, provider: null },
    });
    // La vista sí es Cobro·tarjeta (el importe viene en payment)…
    expect(resolveView({ connected: true, updateRequired: false, state: sanitizeDisplayState(payment) })).toBe('payment_card');
    // …y la moneda con la que se pinta ese total es la del hello, no el respaldo.
    expect(currencyAsCustomerDisplaySees([payment], 'USD')).toBe('USD');
  });

  it('sin hello con moneda y sin carrito previo queda el respaldo (emisor anterior): el caso que la ronda 4 cierra por el hello', () => {
    const thanks = state({ mode: 'thanks', thanks: { total: 11.9, askRating: false } });
    expect(currencyAsCustomerDisplaySees([thanks], null)).toBe(FALLBACK_CURRENCY);
  });
});

// ---------------------------------------------------------------------------
// 2. Adopción por latido sin estado
// ---------------------------------------------------------------------------

describe('receptor · adopción por latido tras bye (precondición del Reposo falso)', () => {
  const down = (seq: number, extra: Record<string, unknown>, instanceId = INSTANCE_A) =>
    ({ v: 1, seq, terminalId: TERMINAL, instanceId, ...extra }) as DownMessage;

  it('tras el bye de A, un heartbeat de B se adopta: lastReceivedAt > lastByeAt sin que llegue hello ni state', async () => {
    let now = 1000;
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => now }));
    const delivered: DownMessage[] = [];
    receiver.onDown((m) => delivered.push(m));
    const caja = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    caja.postMessage(down(0, { t: 'hello', organizationId: 120, cashier: null, sessionOpen: true }));
    caja.postMessage(down(1, { t: 'state', state: state({ mode: 'order', cart: cart([line({ id: '1' })]) }) }));
    await flush();
    now = 1200;
    caja.postMessage(down(2, { t: 'bye' }));
    await flush();
    expect(receiver.activeInstanceId).toBeNull();
    expect(receiver.lastByeAt).toBe(1200);

    now = 1700;
    caja.postMessage(down(0, { t: 'heartbeat', at: 1700 }, INSTANCE_B));
    await flush();

    // La pantalla leerá esto como «caja viva» (receivedAt reciente y posterior al bye)…
    expect(receiver.activeInstanceId).toBe(INSTANCE_B);
    expect(receiver.lastReceivedAt).toBe(1700);
    expect(receiver.lastReceivedAt!).toBeGreaterThan(receiver.lastByeAt!);
    // …sin haber recibido de B ningún hello ni state: solo el latido.
    const fromB = delivered.filter((m) => m.instanceId === INSTANCE_B).map((m) => m.t);
    expect(fromB).toEqual(['heartbeat']);
    // displayLink olvidó el estado en el bye. Viva de nuevo pero sin state
    // aceptado, la vista es Conectando (ronda 4), nunca Reposo: no se sabe si
    // B tiene un pedido en curso. El need_snapshot repetido a B se prueba en
    // display-link.test.ts con el enlace real.
    expect(resolveView({ connected: true, updateRequired: false, state: null })).toBe('connecting');
    expect(resolveView({ connected: true, updateRequired: false, state: null })).not.toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// 3. Monedas raras
// ---------------------------------------------------------------------------

describe('moneda · códigos raros que pasan el saneado', () => {
  it.each(['PESOS', '$', 'usd', 'X', '123'])('formatCurrency no lanza con currency=%p', (currency) => {
    const clean = sanitizeDisplayCart(cart([line({ id: '1' })], { currency }));
    expect(clean?.currency).toBe(currency);
    expect(() => formatCurrency(clean!.total, clean!.currency)).not.toThrow();
    expect(formatCurrency(clean!.total, clean!.currency)).toEqual(expect.any(String));
  });

  it('currency de solo espacios cae a FALLBACK_CURRENCY (no a «  »)', () => {
    const clean = sanitizeDisplayCart(cart([line({ id: '1' })], { currency: '   ' }));
    expect(clean?.currency).toBe(FALLBACK_CURRENCY);
  });

  it('usd en minúsculas formatea como USD (Intl es insensible a mayúsculas)', () => {
    expect(formatCurrency(10, 'usd')).toBe(formatCurrency(10, 'USD'));
  });
});

// ---------------------------------------------------------------------------
// 4. Secuencia completa de una venta
// ---------------------------------------------------------------------------

describe('secuencia de venta · vista y resaltado paso a paso', () => {
  const connected = { connected: true, updateRequired: false } as const;
  const c1 = cart([line({ id: '1' })], { id: 'v1' });
  const c2 = cart([line({ id: '1' }), line({ id: '2' })], { id: 'v1' });

  it('idle → order(1) → order(2) → payment(cash) → thanks → idle → order(nueva venta)', () => {
    const steps: DisplayState[] = [
      state({ mode: 'idle' }),
      state({ mode: 'order', cart: c1 }),
      state({ mode: 'order', cart: c2 }),
      state({ mode: 'payment', cart: c2, payment: { method: 'cash', total: 2000, received: 5000, change: 3000 } }),
      state({ mode: 'thanks', thanks: { total: 2000, askRating: false } }),
      state({ mode: 'idle' }),
      state({ mode: 'order', cart: cart([line({ id: '9' })], { id: 'v2' }) }),
    ];
    const views: DisplayView[] = [];
    const highlights: boolean[] = [];
    let previous: DisplayState | null = null; // al montar
    for (const raw of steps) {
      const clean = sanitizeDisplayState(raw);
      highlights.push(shouldHighlightAfterState(previous, clean));
      views.push(resolveView({ ...connected, state: clean }));
      previous = clean;
    }
    expect(views).toEqual(['idle', 'order', 'order', 'payment_cash', 'thanks', 'idle', 'order']);
    // El primer estado (snapshot al montar) no resalta; cada línea nueva sí;
    // abrir el cobro con el mismo carrito no; la venta nueva sí.
    expect(highlights).toEqual([false, true, true, false, false, false, true]);
    expect(views.map(viewShowsAmounts)).toEqual([false, true, true, true, true, false, true]);
  });

  it('cancelar el cobro (payment → order con el mismo carrito) no resalta ni cambia de carrito', () => {
    const paying = sanitizeDisplayState(
      state({ mode: 'payment', cart: c2, payment: { method: 'card', total: 2000, provider: null } }),
    );
    const back = sanitizeDisplayState(state({ mode: 'order', cart: c2 }));
    expect(shouldHighlightAfterState(paying, back)).toBe(false);
    expect(resolveView({ ...connected, state: back })).toBe('order');
  });

  it('cobro → Conectando (sin caja) oculta importes; al volver, el snapshot no resalta', () => {
    const paying = sanitizeDisplayState(
      state({ mode: 'payment', cart: c2, payment: { method: 'qr', total: 2000, provider: 'Bre-B', qr: null, expiresAt: null } }),
    );
    expect(resolveView({ connected: false, updateRequired: false, state: paying })).toBe('connecting');
    expect(viewShowsAmounts('connecting')).toBe(false);
    // forgetCashier → previous null → el snapshot que vuelve no resalta
    expect(shouldHighlightAfterState(null, paying)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Dos ventas seguidas con el mismo total
// ---------------------------------------------------------------------------

describe('Gracias · dos ventas seguidas con el mismo total', () => {
  /**
   * Réplica de la clave que usa CustomerDisplay.useThanksExpired: el total de
   * `thanks` cuando mode === 'thanks', null en cualquier otro caso. El
   * temporizador de 8 s se reinicia cuando la clave cambia.
   */
  const thanksKey = (s: DisplayState | null) => (s?.mode === 'thanks' && s.thanks ? s.thanks.total : null);

  it('entre las dos Gracias pasa por idle/order: la clave vuelve a null y el temporizador se reinicia', () => {
    const seq = [
      state({ mode: 'thanks', thanks: { total: 5000, askRating: false } }),
      state({ mode: 'idle' }),
      state({ mode: 'order', cart: cart([line({ id: '1' })]) }),
      state({ mode: 'thanks', thanks: { total: 5000, askRating: false } }),
    ].map(sanitizeDisplayState);
    expect(seq.map(thanksKey)).toEqual([5000, null, null, 5000]);
  });

  it('un hello+state repetido durante Gracias (need_snapshot) NO cambia la clave: no alarga los 8 s', () => {
    const a = sanitizeDisplayState(state({ mode: 'thanks', thanks: { total: 5000, askRating: false } }));
    const b = sanitizeDisplayState(state({ mode: 'thanks', thanks: { total: 5000, askRating: true } }));
    expect(thanksKey(a)).toBe(thanksKey(b));
  });

  it('Gracias vencida cae a Reposo aunque la caja siga en thanks; una Gracias nueva con OTRO total vuelve a pintarse', () => {
    const a = sanitizeDisplayState(state({ mode: 'thanks', thanks: { total: 5000, askRating: false } }));
    expect(resolveView({ connected: true, updateRequired: false, thanksExpired: true, state: a })).toBe('idle');
    const b = sanitizeDisplayState(state({ mode: 'thanks', thanks: { total: 7000, askRating: false } }));
    expect(resolveView({ connected: true, updateRequired: false, thanksExpired: false, state: b })).toBe('thanks');
  });
});

// ---------------------------------------------------------------------------
// 6. Recorte con líneas altísimas
// ---------------------------------------------------------------------------

describe('recorte · líneas con muchas sublíneas en 1024×768', () => {
  const metrics = { lineFontPx: 28, smallFontPx: 18 };
  const tall = (id: string) =>
    line({
      id,
      variant: [{ attr: 'Talla', value: 'M' }],
      modifiers: Array.from({ length: 5 }, (_, i) => ({ name: `Extra ${i}`, extraPrice: 0 })),
      note: 'sin cebolla',
      discount: 100,
    });

  it('una fila con variante + 5 modificadores + nota + descuento mide 58 + 8 × 27 = 274 px', () => {
    expect(estimateRowHeightPx(tall('a'), metrics)).toBeCloseTo(28 * 1.5 + 12 + 4 + 8 * 18 * 1.5, 5);
  });

  it('en 425 px útiles caben 1 fila alta + contador; la última siempre visible y la suma no desborda', () => {
    const lines = Array.from({ length: 6 }, (_, i) => tall(`t${i}`));
    const { visible, hidden } = fitLastLines(lines, (l) => estimateRowHeightPx(l, metrics), 425, counterReservePx(18));
    expect(visible.at(-1)?.id).toBe('t5');
    expect(visible.length + hidden).toBe(6);
    const used = visible.reduce((s, l) => s + estimateRowHeightPx(l, metrics), 0) + (hidden > 0 ? counterReservePx(18) : 0);
    expect(used).toBeLessThanOrEqual(425);
    expect(visible).toHaveLength(1);
    expect(hidden).toBe(5);
  });

  it('mezcla: la última es alta y las anteriores simples; se rellena con simples sin desbordar', () => {
    const lines = [...Array.from({ length: 10 }, (_, i) => line({ id: `s${i}` })), tall('alta')];
    const { visible, hidden } = fitLastLines(lines, (l) => estimateRowHeightPx(l, metrics), 425, counterReservePx(18));
    expect(visible.at(-1)?.id).toBe('alta');
    const used = visible.reduce((s, l) => s + estimateRowHeightPx(l, metrics), 0) + (hidden > 0 ? counterReservePx(18) : 0);
    expect(used).toBeLessThanOrEqual(425);
    // 274 + 35 (contador) = 309; quedan 116 px → 2 simples de 58.
    expect(visible.map((l) => l.id)).toEqual(['s8', 's9', 'alta']);
    expect(hidden).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// 7. Etiqueta de impuestos con descuento mayor que el subtotal y total negativo
// ---------------------------------------------------------------------------

describe('impuestos y descuento · combinaciones que el saneado deja pasar', () => {
  it('descuento mayor que el subtotal con impuesto incluido: se pinta «IVA incluido» y el total negativo se conserva', () => {
    const raw = cart([line({ id: '1', total: 1000, unitPrice: 1000 })], {
      discountTotal: 1500,
      discountLabel: 'cupón',
      taxTotal: 160,
      taxIncluded: true,
      total: -500,
    });
    const clean = sanitizeDisplayCart(raw)!;
    expect(clean.total).toBe(-500);
    expect(clean.discountTotal).toBe(1500);
    expect(taxLabelKind(clean)).toBe('included');
    expect(formatCurrency(clean.total, clean.currency)).toContain('-');
  });

  it('descuento negativo (recargo por error) se conserva pero el bloque de descuento no se pinta (solo > 0)', () => {
    const clean = sanitizeDisplayCart(cart([line({ id: '1' })], { discountTotal: -200 }))!;
    expect(clean.discountTotal).toBe(-200);
    // OrderView solo pinta la fila si discountTotal > 0: aquí no.
    expect(clean.discountTotal > 0).toBe(false);
  });
});
