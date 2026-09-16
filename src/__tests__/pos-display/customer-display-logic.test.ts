/**
 * Lógica pura de /pos-display (src/components/pos-display/logic.ts):
 * contraste AA del color de marca, recorte de líneas sin scroll (con la
 * estimación de alturas que usa OrderView), etiqueta de impuestos,
 * resolución de vista a partir del DisplayState y la conexión, saneado del
 * estado recibido, decisión de resaltado y de identidad de marca.
 *
 * Fixtures con organización ficticia. Sin nombres de clientes reales.
 */

import type { DisplayCart, DisplayLine, DisplayPayment, DisplayState } from '@/lib/pos/display/protocol';
import {
  AA_CONTRAST,
  FALLBACK_BRAND_COLOR,
  FALLBACK_CURRENCY,
  HIGHLIGHT_MS,
  capitalizeFirst,
  contrastRatio,
  counterReservePx,
  ensureAaOnWhite,
  estimateRowHeightPx,
  findLine,
  fitLastLines,
  maxVisibleLines,
  parseHexColor,
  resolveBrandIdentity,
  resolveDisplayCurrency,
  resolveView,
  rgbToHex,
  sanitizeDisplayCart,
  sanitizeDisplayLine,
  sanitizeDisplayPayment,
  sanitizeDisplayState,
  shouldHighlightAfterState,
  shouldHighlightLine,
  subLineCount,
  taxLabelKind,
  trimLines,
  viewShowsAmounts,
} from '@/components/pos-display/logic';

const WHITE = { r: 255, g: 255, b: 255 };

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
  return {
    id: 'carrito-1',
    currency: 'COP',
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.total, 0),
    discountTotal: 0,
    discountLabel: null,
    taxTotal: 190,
    taxIncluded: true,
    total: lines.reduce((sum, l) => sum + l.total, 0),
    lastChangedLineId: lines.length ? lines[lines.length - 1].id : null,
    ...overrides,
  };
}

function state(overrides: Partial<DisplayState>): DisplayState {
  return { mode: 'idle', cart: null, payment: null, tip: null, thanks: null, ...overrides };
}

describe('contraste del color de marca', () => {
  it('parsea #rgb y #rrggbb, con o sin almohadilla, y rechaza lo demás', () => {
    expect(parseHexColor('#fff')).toEqual(WHITE);
    expect(parseHexColor('2563EB')).toEqual({ r: 37, g: 99, b: 235 });
    expect(parseHexColor(' #2563eb ')).toEqual({ r: 37, g: 99, b: 235 });
    expect(parseHexColor('rgb(1,2,3)')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor(null)).toBeNull();
    expect(parseHexColor(123)).toBeNull();
  });

  it('rgbToHex normaliza y recorta al rango 0-255', () => {
    expect(rgbToHex({ r: 37, g: 99, b: 235 })).toBe('#2563eb');
    expect(rgbToHex({ r: -5, g: 300, b: 12.6 })).toBe('#00ff0d');
  });

  it('contrastRatio: blanco sobre blanco es 1 y negro sobre blanco es 21', () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, WHITE)).toBeCloseTo(21, 5);
  });

  it('un color que ya cumple AA se devuelve tal cual (normalizado)', () => {
    expect(ensureAaOnWhite('#1D4ED8')).toBe('#1d4ed8');
    expect(contrastRatio(parseHexColor('#1d4ed8')!, WHITE)).toBeGreaterThanOrEqual(AA_CONTRAST);
  });

  it('un color claro se oscurece hasta cumplir AA sobre blanco', () => {
    const light = ['#ffeb3b', '#7dd3fc', '#fca5a5', '#e5e7eb', '#ffffff'];
    for (const input of light) {
      const fixed = ensureAaOnWhite(input);
      const parsed = parseHexColor(fixed);
      expect(parsed).not.toBeNull();
      expect(contrastRatio(parsed!, WHITE)).toBeGreaterThanOrEqual(AA_CONTRAST);
      expect(fixed).not.toBe(input);
    }
  });

  it('oscurece conservando el tono: un amarillo sigue siendo más rojo/verde que azul', () => {
    const fixed = parseHexColor(ensureAaOnWhite('#ffeb3b'))!;
    expect(fixed.r).toBeGreaterThan(fixed.b);
    expect(fixed.g).toBeGreaterThan(fixed.b);
  });

  it('sin color válido cae al neutro, que cumple AA', () => {
    expect(ensureAaOnWhite(null)).toBe(FALLBACK_BRAND_COLOR);
    expect(ensureAaOnWhite('')).toBe(FALLBACK_BRAND_COLOR);
    expect(ensureAaOnWhite('azul')).toBe(FALLBACK_BRAND_COLOR);
    expect(ensureAaOnWhite(undefined, '#000000')).toBe('#000000');
    expect(contrastRatio(parseHexColor(FALLBACK_BRAND_COLOR)!, WHITE)).toBeGreaterThanOrEqual(AA_CONTRAST);
  });
});

describe('recorte de líneas sin scroll', () => {
  it('trimLines devuelve todo si cabe y las últimas N con el contador si no', () => {
    expect(trimLines([1, 2, 3], 5)).toEqual({ visible: [1, 2, 3], hidden: 0 });
    expect(trimLines([1, 2, 3, 4, 5], 2)).toEqual({ visible: [4, 5], hidden: 3 });
    expect(trimLines([], 2)).toEqual({ visible: [], hidden: 0 });
  });

  it('trimLines nunca deja de mostrar al menos una línea aunque max sea 0, negativo o NaN', () => {
    expect(trimLines([1, 2, 3], 0)).toEqual({ visible: [3], hidden: 2 });
    expect(trimLines([1, 2, 3], -4)).toEqual({ visible: [3], hidden: 2 });
    expect(trimLines([1, 2, 3], Number.NaN)).toEqual({ visible: [3], hidden: 2 });
    expect(trimLines([1, 2, 3], 2.9)).toEqual({ visible: [2, 3], hidden: 1 });
  });

  it('trimLines con +Infinity muestra todas las líneas («sin límite»)', () => {
    expect(trimLines([1, 2, 3], Number.POSITIVE_INFINITY)).toEqual({ visible: [1, 2, 3], hidden: 0 });
  });

  it('maxVisibleLines divide la altura disponible y nunca baja de 1', () => {
    expect(maxVisibleLines(1000, 100)).toBe(10);
    expect(maxVisibleLines(999, 100)).toBe(9);
    expect(maxVisibleLines(50, 100)).toBe(1);
    expect(maxVisibleLines(1000, 0)).toBe(1);
    expect(maxVisibleLines(Number.NaN, 100)).toBe(1);
  });

  it('fitLastLines suma alturas desde el final y reserva sitio al contador solo cuando hace falta', () => {
    const lines = [
      { id: 'a', h: 50 },
      { id: 'b', h: 50 },
      { id: 'c', h: 100 }, // con modificadores
      { id: 'd', h: 50 },
    ];
    const heightOf = (l: { h: number }) => l.h;
    // Cabe todo (250) sin contador.
    expect(fitLastLines(lines, heightOf, 250, 40).visible.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
    // Con 200: d(50)+c(100)=150; b(50) haría 200 pero con reserva 40 el límite es 160 → fuera.
    expect(fitLastLines(lines, heightOf, 200, 40)).toEqual({ visible: [lines[2], lines[3]], hidden: 2 });
    // Sin reserva sí cabe b.
    expect(fitLastLines(lines, heightOf, 200, 0)).toEqual({ visible: [lines[1], lines[2], lines[3]], hidden: 1 });
  });

  it('fitLastLines siempre muestra la última línea aunque no quepa, y con lista vacía no muestra nada', () => {
    const lines = [{ h: 500 }, { h: 500 }];
    expect(fitLastLines(lines, (l) => l.h, 10)).toEqual({ visible: [lines[1]], hidden: 1 });
    expect(fitLastLines([], () => 10, 100)).toEqual({ visible: [], hidden: 0 });
    expect(fitLastLines(lines, (l) => l.h, Number.NaN)).toEqual({ visible: [lines[1]], hidden: 1 });
  });
});

describe('etiqueta de impuestos (igual que el recibo)', () => {
  it('sin impuesto no se muestra nada', () => {
    expect(taxLabelKind(cart([line({ id: '1' })], { taxTotal: 0 }))).toBe('none');
    expect(taxLabelKind(cart([line({ id: '1' })], { taxTotal: -1 }))).toBe('none');
  });

  it('todas incluidas → «IVA incluido»; ninguna → desglose; mezcla → mixto', () => {
    expect(taxLabelKind(cart([line({ id: '1' }), line({ id: '2' })]))).toBe('included');
    expect(taxLabelKind(cart([line({ id: '1', taxIncluded: false }), line({ id: '2', taxIncluded: false })]))).toBe('breakdown');
    expect(taxLabelKind(cart([line({ id: '1' }), line({ id: '2', taxIncluded: false })]))).toBe('mixed');
  });

  it('las líneas con impuesto excluido no cuentan para decidir', () => {
    const c = cart([line({ id: '1' }), line({ id: '2', taxIncluded: false, taxExcluded: true })]);
    expect(taxLabelKind(c)).toBe('included');
    // Todas excluidas: se usa la bandera global del carrito.
    const allExcluded = cart([line({ id: '1', taxExcluded: true })], { taxIncluded: false });
    expect(taxLabelKind(allExcluded)).toBe('breakdown');
  });
});

describe('resolución de vista', () => {
  const base = { connected: true, updateRequired: false };

  it('sin caja: Conectando; demasiado tiempo sin caja: Reposo; solo otra versión: Actualice', () => {
    expect(resolveView({ connected: false, updateRequired: false, state: null })).toBe('connecting');
    expect(resolveView({ connected: false, updateRequired: false, disconnectedTooLong: true, state: null })).toBe('idle');
    expect(resolveView({ connected: false, updateRequired: true, state: null })).toBe('update_required');
    // Con caja viva, una versión incompatible de OTRA pestaña no manda.
    expect(resolveView({ connected: true, updateRequired: true, state: state({ mode: 'idle' }) })).toBe('idle');
  });

  it('caja viva pero sin estado aceptado (adoptada por latido, o hello sin su state) → Conectando, nunca Reposo', () => {
    // Ronda 4: tras bye/silencio el receptor adopta a la primera instancia
    // que hable aunque sea solo un heartbeat; no se sabe qué hay en esa caja
    // y Reposo mentiría con un pedido en curso (PLAN §4.1.3).
    expect(resolveView({ ...base, state: null })).toBe('connecting');
    expect(resolveView({ ...base, disconnectedTooLong: true, state: null })).toBe('connecting');
    expect(viewShowsAmounts(resolveView({ ...base, state: null }))).toBe(false);
  });

  it('pedido con líneas → Pedido; pedido sin líneas o sin carrito → Reposo', () => {
    expect(resolveView({ ...base, state: state({ mode: 'order', cart: cart([line({ id: '1' })]) }) })).toBe('order');
    expect(resolveView({ ...base, state: state({ mode: 'order', cart: cart([]) }) })).toBe('idle');
    expect(resolveView({ ...base, state: state({ mode: 'order', cart: null }) })).toBe('idle');
  });

  it('cobro según el método; sin bloque payment degrada a Pedido o Reposo', () => {
    const c = cart([line({ id: '1' })]);
    expect(resolveView({ ...base, state: state({ mode: 'payment', cart: c, payment: { method: 'cash', total: 1000, received: null, change: null } }) })).toBe('payment_cash');
    expect(resolveView({ ...base, state: state({ mode: 'payment', cart: c, payment: { method: 'card', total: 1000, provider: null } }) })).toBe('payment_card');
    expect(resolveView({ ...base, state: state({ mode: 'payment', cart: c, payment: { method: 'qr', total: 1000, provider: 'Bre-B', qr: null, expiresAt: null } }) })).toBe('payment_qr');
    expect(resolveView({ ...base, state: state({ mode: 'payment', cart: c, payment: null }) })).toBe('order');
    expect(resolveView({ ...base, state: state({ mode: 'payment', cart: null, payment: null }) })).toBe('idle');
  });

  it('gracias dura hasta que expira; sin bloque thanks → Reposo', () => {
    const thanks = state({ mode: 'thanks', thanks: { total: 1000, askRating: false } });
    expect(resolveView({ ...base, state: thanks })).toBe('thanks');
    expect(resolveView({ ...base, thanksExpired: true, state: thanks })).toBe('idle');
    expect(resolveView({ ...base, state: state({ mode: 'thanks', thanks: null }) })).toBe('idle');
  });

  it('tip y closed no existen en Fase 0: caen a Pedido si hay carrito y a Reposo si no', () => {
    const c = cart([line({ id: '1' })]);
    expect(resolveView({ ...base, state: state({ mode: 'tip', cart: c }) })).toBe('order');
    expect(resolveView({ ...base, state: state({ mode: 'closed', cart: null }) })).toBe('idle');
  });

  it('un mode desconocido (JSON malformado que pasó la forma) → Reposo', () => {
    const weird = state({ mode: 'fiesta' as DisplayState['mode'] });
    expect(resolveView({ ...base, state: weird })).toBe('idle');
  });

  it('solo las vistas con venta muestran importes', () => {
    expect(viewShowsAmounts('order')).toBe(true);
    expect(viewShowsAmounts('payment_cash')).toBe(true);
    expect(viewShowsAmounts('thanks')).toBe(true);
    expect(viewShowsAmounts('connecting')).toBe(false);
    expect(viewShowsAmounts('idle')).toBe(false);
    expect(viewShowsAmounts('update_required')).toBe(false);
  });

  it('findLine localiza la línea a resaltar solo si está en el carrito', () => {
    const c = cart([line({ id: 'a' }), line({ id: 'b' })]);
    expect(findLine(c, 'b')?.id).toBe('b');
    expect(findLine(c, 'zzz')).toBeNull();
    expect(findLine(c, null)).toBeNull();
    expect(findLine(null, 'a')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Estimación de alturas de fila (lo que OrderView pasa a fitLastLines)
// ---------------------------------------------------------------------------

describe('moneda con la que se pinta un importe (resolveDisplayCurrency)', () => {
  // Prioridad: carrito → hello → última recordada → FALLBACK_CURRENCY.
  it('1. la del carrito manda sobre hello y recuerdo', () => {
    expect(resolveDisplayCurrency({ cartCurrency: 'USD', helloCurrency: 'EUR', remembered: 'MXN' })).toBe('USD');
  });

  it('2. sin carrito (Gracias, cobro sin líneas) vale la del hello, que siempre precede al state', () => {
    expect(resolveDisplayCurrency({ cartCurrency: null, helloCurrency: 'EUR', remembered: 'MXN' })).toBe('EUR');
    expect(resolveDisplayCurrency({ helloCurrency: 'EUR' })).toBe('EUR');
  });

  it('3. sin carrito ni hello con moneda (emisor anterior) vale la última que la pantalla pintó', () => {
    expect(resolveDisplayCurrency({ cartCurrency: null, helloCurrency: null, remembered: 'MXN' })).toBe('MXN');
    expect(resolveDisplayCurrency({ cartCurrency: undefined, helloCurrency: undefined, remembered: 'MXN' })).toBe('MXN');
  });

  it('4. sin nada, el respaldo', () => {
    expect(resolveDisplayCurrency({})).toBe(FALLBACK_CURRENCY);
    expect(resolveDisplayCurrency({ cartCurrency: null, helloCurrency: null, remembered: null })).toBe(FALLBACK_CURRENCY);
  });

  it('vacíos y solo espacios no cuentan en ningún nivel', () => {
    expect(resolveDisplayCurrency({ cartCurrency: '', helloCurrency: '   ', remembered: 'MXN' })).toBe('MXN');
    expect(resolveDisplayCurrency({ cartCurrency: ' ', helloCurrency: '', remembered: '' })).toBe(FALLBACK_CURRENCY);
  });

  it('pantalla recién abierta durante Gracias de una organización en USD: el estado saneado no trae carrito y aun así sale USD', () => {
    const thanks = sanitizeDisplayState(state({ mode: 'thanks', thanks: { total: 11.9, askRating: false } }));
    expect(thanks.cart).toBeNull();
    expect(resolveDisplayCurrency({ cartCurrency: thanks.cart?.currency, helloCurrency: 'USD', remembered: null })).toBe('USD');
  });
});

describe('estimación de alturas de fila', () => {
  /** 1024×768 con --pd-line 28 px y --pd-small 18 px (SCALE_STYLE de CustomerDisplay). */
  const at1024 = { lineFontPx: 28, smallFontPx: 18 };
  /** 1920×1080: --pd-line 2.2vw = 42,24 px, --pd-small 1.3vw = 24,96 px. */
  const at1920 = { lineFontPx: 42.24, smallFontPx: 24.96 };

  it('cuenta las sublíneas: variante, cada modificador, nota y descuento', () => {
    expect(subLineCount(line({ id: 'a' }))).toBe(0);
    expect(subLineCount(line({ id: 'a', variant: [{ attr: 'Talla', value: 'M' }] }))).toBe(1);
    expect(subLineCount(line({ id: 'a', modifiers: [{ name: 'x', extraPrice: 0 }, { name: 'y', extraPrice: 0 }] }))).toBe(2);
    expect(subLineCount(line({ id: 'a', note: 'Para llevar', discount: 100 }))).toBe(2);
    expect(subLineCount(line({ id: 'a', variant: [], discount: 0 }))).toBe(0);
    // Una línea de otra build sin `modifiers` no lanza.
    expect(subLineCount({ id: 'a', name: 'x' } as unknown as DisplayLine)).toBe(0);
  });

  it('fila simple = fuente × 1,5 + padding 12 + gap 4; cada sublínea suma fuente pequeña × 1,5', () => {
    expect(estimateRowHeightPx(line({ id: 'a' }), at1024)).toBeCloseTo(58, 5);
    expect(estimateRowHeightPx(line({ id: 'a', modifiers: [{ name: 'x', extraPrice: 0 }] }), at1024)).toBeCloseTo(58 + 27, 5);
    const three = [{ name: 'x', extraPrice: 0 }, { name: 'y', extraPrice: 0 }, { name: 'z', extraPrice: 0 }];
    expect(estimateRowHeightPx(line({ id: 'a', modifiers: three }), at1024)).toBeCloseTo(58 + 81, 5);
    expect(estimateRowHeightPx(line({ id: 'a' }), at1920)).toBeCloseTo(42.24 * 1.5 + 16, 5);
    expect(estimateRowHeightPx(line({ id: 'a' }), { lineFontPx: 24, smallFontPx: 16, rowPaddingPx: 0, gapPx: 0, lineHeight: 1 })).toBe(24);
  });

  it('el contador «y X más» reserva una línea pequeña más su pb-2', () => {
    expect(counterReservePx(18)).toBeCloseTo(35, 5);
    expect(counterReservePx(24.96)).toBeCloseTo(45.44, 5);
    // Medida inválida → tamaño por defecto, nunca NaN.
    expect(Number.isFinite(counterReservePx(Number.NaN))).toBe(true);
    expect(Number.isFinite(estimateRowHeightPx(line({ id: 'a' }), { lineFontPx: Number.NaN, smallFontPx: 0 }))).toBe(true);
  });

  it('1024×768, 10 líneas simples y 451 px útiles: se ocultan ≥ 2 y lo visible más el contador cabe', () => {
    const lines = Array.from({ length: 10 }, (_, i) => line({ id: `l${i}` }));
    const heightOf = (l: DisplayLine) => estimateRowHeightPx(l, at1024);
    const { visible, hidden } = fitLastLines(lines, heightOf, 451, counterReservePx(at1024.smallFontPx));
    expect(visible.length).toBeLessThanOrEqual(8);
    expect(hidden).toBeGreaterThanOrEqual(2);
    expect(visible[visible.length - 1].id).toBe('l9');
    const used = visible.reduce((sum, l) => sum + heightOf(l), 0) + counterReservePx(at1024.smallFontPx);
    expect(used).toBeLessThanOrEqual(451);
    // Con las medidas de la ronda 1 (24/16 px) el mismo presupuesto da 8 + contador, y también cabe.
    const r1 = { lineFontPx: 24, smallFontPx: 16 };
    const fit = fitLastLines(lines, (l) => estimateRowHeightPx(l, r1), 451, counterReservePx(16));
    expect(fit).toMatchObject({ hidden: 2 });
    expect(fit.visible.length * estimateRowHeightPx(lines[0], r1) + counterReservePx(16)).toBeLessThanOrEqual(451);
  });

  it('1920×1080, 8 líneas simples y 541 px útiles: 6 visibles + contador', () => {
    const lines = Array.from({ length: 8 }, (_, i) => line({ id: `l${i}` }));
    const heightOf = (l: DisplayLine) => estimateRowHeightPx(l, at1920);
    const { visible, hidden } = fitLastLines(lines, heightOf, 541, counterReservePx(at1920.smallFontPx));
    expect(visible.length).toBe(6);
    expect(hidden).toBe(2);
    expect(visible.map((l) => l.id)).toEqual(['l2', 'l3', 'l4', 'l5', 'l6', 'l7']);
  });

  it('1024×768 con el bloque de totales: siguen cabiendo ≥ 4 líneas simples en 425 px útiles', () => {
    const lines = Array.from({ length: 20 }, (_, i) => line({ id: `l${i}` }));
    const { visible } = fitLastLines(lines, (l) => estimateRowHeightPx(l, at1024), 425, counterReservePx(18));
    expect(visible.length).toBeGreaterThanOrEqual(4);
    expect(visible.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Saneado del estado recibido
// ---------------------------------------------------------------------------

describe('saneado del estado (isDownMessage solo valida la forma)', () => {
  const base = { connected: true, updateRequired: false };

  it('una línea sin modifiers, variant, note ni discount se pinta con [] y null', () => {
    const raw = { id: 'a', name: 'Café', qty: 1, unitPrice: 1000, total: 1000 };
    expect(sanitizeDisplayLine(raw)).toEqual({
      id: 'a',
      name: 'Café',
      variant: null,
      qty: 1,
      unitPrice: 1000,
      total: 1000,
      modifiers: [],
      discount: null,
      note: null,
      taxExcluded: false,
      taxIncluded: false,
    });
  });

  it('modificadores y variantes malformados se filtran; los válidos se conservan', () => {
    const raw = {
      id: 'a',
      name: 'Café',
      qty: 2,
      unitPrice: 1000,
      total: 2000,
      modifiers: [{ name: 'Leche', extraPrice: 500 }, { name: '' }, 'basura', { name: 'Sin azúcar', extraPrice: 'x' }],
      variant: [{ attr: 'Talla', value: 'M' }, { attr: 1 }, null],
      note: '   ',
      discount: -5,
      taxExcluded: 'sí',
      taxIncluded: 1,
    };
    expect(sanitizeDisplayLine(raw)).toMatchObject({
      modifiers: [{ name: 'Leche', extraPrice: 500 }, { name: 'Sin azúcar', extraPrice: 0 }],
      variant: [{ attr: 'Talla', value: 'M' }],
      note: null,
      discount: null,
      taxExcluded: true,
      taxIncluded: true,
    });
  });

  it('una línea sin name, sin id o con qty/unitPrice/total no finitos se descarta', () => {
    expect(sanitizeDisplayLine({ id: 'a', qty: 1, unitPrice: 1, total: 1 })).toBeNull();
    expect(sanitizeDisplayLine({ id: '', name: 'x', qty: 1, unitPrice: 1, total: 1 })).toBeNull();
    expect(sanitizeDisplayLine({ id: 'a', name: 'x', qty: Number.NaN, unitPrice: 1, total: 1 })).toBeNull();
    expect(sanitizeDisplayLine({ id: 'a', name: 'x', qty: 1, unitPrice: '1', total: 1 })).toBeNull();
    expect(sanitizeDisplayLine({ id: 'a', name: 'x', qty: 1, unitPrice: 1, total: Number.POSITIVE_INFINITY })).toBeNull();
    expect(sanitizeDisplayLine(null)).toBeNull();
    expect(sanitizeDisplayLine('línea')).toBeNull();
  });

  it('el carrito descarta las líneas inválidas, deduplica ids y limpia lastChangedLineId si apunta a una descartada', () => {
    const raw = {
      ...cart([line({ id: 'a' }), line({ id: 'b' })]),
      lines: [line({ id: 'a' }), { id: 'b', qty: 1, unitPrice: 1, total: 1 }, line({ id: 'a', name: 'Repetida' })],
      lastChangedLineId: 'b',
    };
    const clean = sanitizeDisplayCart(raw);
    expect(clean?.lines.map((l) => l.id)).toEqual(['a']);
    expect(clean?.lines[0].name).toBe('Producto a');
    expect(clean?.lastChangedLineId).toBeNull();
  });

  it('carrito con todas las líneas inválidas, o sin subtotal/total finitos → null → Reposo', () => {
    const allBad = { ...cart([]), lines: [{ id: 'a' }, { name: 'x' }] };
    expect(sanitizeDisplayCart(allBad)).toBeNull();
    expect(sanitizeDisplayCart({ ...cart([line({ id: 'a' })]), total: 'mil' })).toBeNull();
    expect(sanitizeDisplayCart({ ...cart([line({ id: 'a' })]), subtotal: undefined })).toBeNull();
    const cleaned = sanitizeDisplayState(state({ mode: 'order', cart: allBad as unknown as DisplayCart }));
    expect(cleaned.cart).toBeNull();
    expect(resolveView({ ...base, state: cleaned })).toBe('idle');
  });

  it('carrito sin currency ni importes secundarios cae a valores neutros', () => {
    const clean = sanitizeDisplayCart({ lines: [line({ id: 'a' })], subtotal: 1000, total: 1000 });
    expect(clean).toMatchObject({ id: '', currency: FALLBACK_CURRENCY, discountTotal: 0, discountLabel: null, taxTotal: 0, taxIncluded: false });
  });

  it('cobro {method:"cash"} sin total → se descarta y la vista es Pedido o Reposo, nunca Cobro·efectivo', () => {
    const c = cart([line({ id: '1' })]);
    const weird = { method: 'cash' } as unknown as DisplayPayment;
    expect(sanitizeDisplayPayment(weird)).toBeNull();
    const withCart = sanitizeDisplayState(state({ mode: 'payment', cart: c, payment: weird }));
    expect(withCart.payment).toBeNull();
    expect(resolveView({ ...base, state: withCart })).toBe('order');
    const withoutCart = sanitizeDisplayState(state({ mode: 'payment', cart: null, payment: weird }));
    expect(resolveView({ ...base, state: withoutCart })).toBe('idle');
    // Y aunque un state sin sanear llegase a resolveView, un total no finito degrada igual.
    expect(resolveView({ ...base, state: state({ mode: 'payment', cart: c, payment: weird }) })).toBe('order');
  });

  it('cobro con total finito y received/change ausentes → received/change null (la vista pinta «—»)', () => {
    const raw = { method: 'cash', total: 5000, received: undefined, change: 'x' } as unknown as DisplayPayment;
    expect(sanitizeDisplayPayment(raw)).toEqual({ method: 'cash', total: 5000, received: null, change: null });
    expect(sanitizeDisplayPayment({ method: 'card', total: 1, provider: '' })).toEqual({ method: 'card', total: 1, provider: null });
    expect(sanitizeDisplayPayment({ method: 'qr', total: 1, provider: 'Bre-B', qr: { kind: 'foto', value: 'x' } })).toEqual({
      method: 'qr',
      total: 1,
      provider: 'Bre-B',
      qr: null,
      expiresAt: null,
    });
    expect(sanitizeDisplayPayment({ method: 'nequi', total: 1 })).toBeNull();
  });

  it('gracias sin total finito → thanks null → Reposo; con total válido se conserva', () => {
    const bad = sanitizeDisplayState(state({ mode: 'thanks', thanks: { total: Number.NaN, askRating: true } }));
    expect(bad.thanks).toBeNull();
    expect(resolveView({ ...base, state: bad })).toBe('idle');
    const ok = sanitizeDisplayState(state({ mode: 'thanks', thanks: { total: 0, askRating: 'sí' as unknown as boolean } }));
    expect(ok.thanks).toEqual({ total: 0, askRating: true });
    expect(resolveView({ ...base, state: ok })).toBe('thanks');
  });

  it('un estado ya limpio sale igual (idempotente)', () => {
    const full = line({ id: 'a', modifiers: [{ name: 'Leche', extraPrice: 500 }], variant: [{ attr: 'Talla', value: 'M' }], note: 'x', discount: 10 });
    const s = state({ mode: 'payment', cart: cart([full]), payment: { method: 'cash', total: 1000, received: 2000, change: 1000 } });
    expect(sanitizeDisplayState(s)).toEqual(s);
    expect(sanitizeDisplayState(sanitizeDisplayState(s))).toEqual(s);
  });
});

// ---------------------------------------------------------------------------
// Resaltado: solo cuando de verdad cambió una línea
// ---------------------------------------------------------------------------

describe('decisión de resaltado (shouldHighlightLine)', () => {
  it('el resaltado dura 600 ms (PLAN §4.1.2)', () => {
    expect(HIGHLIGHT_MS).toBe(600);
  });

  it('mismo carrito repetido (cancelar el cobro, hello+state, need_snapshot) → sin resaltado', () => {
    const c = cart([line({ id: 'a' }), line({ id: 'b' })]);
    expect(shouldHighlightLine(c, { ...c })).toBe(false);
    expect(shouldHighlightLine(c, { ...c, lines: c.lines.map((l) => ({ ...l })) })).toBe(false);
  });

  it('primer carrito con línea señalada → resalta; sin lastChangedLineId o apuntando a una línea inexistente → no', () => {
    const c = cart([line({ id: 'a' })]);
    expect(shouldHighlightLine(null, c)).toBe(true);
    expect(shouldHighlightLine(null, { ...c, lastChangedLineId: null })).toBe(false);
    expect(shouldHighlightLine(null, { ...c, lastChangedLineId: 'zzz' })).toBe(false);
    expect(shouldHighlightLine(c, null)).toBe(false);
  });

  it('línea nueva, otra línea señalada u otro carrito → resalta', () => {
    const before = cart([line({ id: 'a' })]);
    const withB = cart([line({ id: 'a' }), line({ id: 'b' })]);
    expect(shouldHighlightLine(before, withB)).toBe(true);
    const sameLinesOtherPointer = { ...withB, lastChangedLineId: 'a' };
    expect(shouldHighlightLine(withB, sameLinesOtherPointer)).toBe(true);
    expect(shouldHighlightLine(withB, { ...withB, id: 'carrito-2' })).toBe(true);
  });

  it('misma línea señalada: cambia qty, precio, total, nº de modificadores o nota → resalta; otros campos no', () => {
    const base = cart([line({ id: 'a' }), line({ id: 'b', qty: 1, unitPrice: 1000, total: 1000 })]);
    const change = (patch: Partial<DisplayLine>) => ({
      ...base,
      lines: base.lines.map((l) => (l.id === 'b' ? { ...l, ...patch } : l)),
    });
    expect(shouldHighlightLine(base, change({ qty: 2, total: 2000 }))).toBe(true);
    expect(shouldHighlightLine(base, change({ unitPrice: 900 }))).toBe(true);
    expect(shouldHighlightLine(base, change({ total: 1500 }))).toBe(true);
    expect(shouldHighlightLine(base, change({ modifiers: [{ name: 'Leche', extraPrice: 0 }] }))).toBe(true);
    expect(shouldHighlightLine(base, change({ note: 'Sin hielo' }))).toBe(true);
    // Excluir impuesto o cambiar el descuento de línea no es «entró algo»: no distrae.
    expect(shouldHighlightLine(base, change({ taxExcluded: true }))).toBe(false);
    expect(shouldHighlightLine(base, change({ discount: 50 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Resaltado a nivel de estado: snapshot de reconexión vs. primera línea
// ---------------------------------------------------------------------------

describe('decisión de resaltado por estado (shouldHighlightAfterState, la que usa useDisplayReceiver)', () => {
  const idle = (): DisplayState => ({ mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
  const order = (c: DisplayCart): DisplayState => ({ mode: 'order', cart: c, payment: null, tip: null, thanks: null });

  it('sin estado previo (pantalla recién abierta o caja olvidada tras bye/silencio): el snapshot NO resalta', () => {
    const c = cart([line({ id: 'a' }), line({ id: 'b' })]);
    // Aunque shouldHighlightLine(null, cart) diría que sí: lo que llega es lo que el cliente ya veía.
    expect(shouldHighlightLine(null, c)).toBe(true);
    expect(shouldHighlightAfterState(null, order(c))).toBe(false);
  });

  it('secuencia de reconexión: [order] → olvidar caja → [mismo order] no resalta; una línea nueva después sí', () => {
    const c = cart([line({ id: 'a' })]);
    let previous: DisplayState | null = null;
    expect(shouldHighlightAfterState(previous, order(c))).toBe(false); // primera carga
    previous = order(c);
    previous = null; // forgetCashier()
    expect(shouldHighlightAfterState(previous, order(c))).toBe(false); // respuesta al need_snapshot
    previous = order(c);
    const withB = cart([line({ id: 'a' }), line({ id: 'b' })]);
    expect(shouldHighlightAfterState(previous, order(withB))).toBe(true);
  });

  it('de Reposo (estado previo con cart null) a Pedido con 1 línea: SÍ resalta', () => {
    const c = cart([line({ id: 'a' })]);
    expect(shouldHighlightAfterState(idle(), order(c))).toBe(true);
  });

  it('mismo carrito repetido con estado previo (cancelar el cobro, hello+state al recuperar el foco): no resalta', () => {
    const c = cart([line({ id: 'a' })]);
    expect(shouldHighlightAfterState(order(c), order({ ...c }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fecha de Reposo: solo la inicial en mayúscula
// ---------------------------------------------------------------------------

describe('capitalizeFirst (fecha larga de Reposo)', () => {
  it('«miércoles, 16 de septiembre» → «Miércoles, 16 de septiembre» (la preposición sigue en minúscula)', () => {
    expect(capitalizeFirst('miércoles, 16 de septiembre', 'es-CO')).toBe('Miércoles, 16 de septiembre');
  });

  it('respeta el idioma y no toca cadenas vacías ni las que ya empiezan en mayúscula', () => {
    expect(capitalizeFirst('quarta-feira, 16 de setembro', 'pt-BR')).toBe('Quarta-feira, 16 de setembro');
    expect(capitalizeFirst('mercredi 16 septembre', 'fr-FR')).toBe('Mercredi 16 septembre');
    expect(capitalizeFirst('Wednesday, September 16', 'en-US')).toBe('Wednesday, September 16');
    expect(capitalizeFirst('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Identidad de marca: nunca el nombre de otra organización
// ---------------------------------------------------------------------------

describe('identidad de marca (resolveBrandIdentity)', () => {
  const local = { name: 'Tienda local', logoUrl: 'https://cdn.example/local.png' };

  it('con fila leída se usa la fila, sea o no la organización local', () => {
    const row = { name: 'Comercio de la caja', logo_url: 'https://cdn.example/caja.png', primary_color: '#123456' };
    expect(resolveBrandIdentity({ row, organizationId: 2, localOrgId: 1, local })).toEqual({
      name: 'Comercio de la caja',
      logoUrl: 'https://cdn.example/caja.png',
      unknown: false,
    });
    expect(resolveBrandIdentity({ row, organizationId: 1, localOrgId: 1, local })).toMatchObject({ name: 'Comercio de la caja' });
  });

  it('fila de la organización local con nombre o logo vacíos → respaldo local', () => {
    const row = { name: '', logo_url: null, primary_color: null };
    expect(resolveBrandIdentity({ row, organizationId: 1, localOrgId: 1, local })).toEqual({
      name: 'Tienda local',
      logoUrl: 'https://cdn.example/local.png',
      unknown: false,
    });
  });

  it('sin fila y organización local → respaldo local; sin fila y OTRA organización → vacío y unknown', () => {
    expect(resolveBrandIdentity({ row: null, organizationId: 1, localOrgId: 1, local })).toEqual({
      name: 'Tienda local',
      logoUrl: 'https://cdn.example/local.png',
      unknown: false,
    });
    expect(resolveBrandIdentity({ row: null, organizationId: 2, localOrgId: 1, local })).toEqual({ name: '', logoUrl: null, unknown: true });
    // Sin sesión local (localOrgId null) tampoco se inventa nada.
    expect(resolveBrandIdentity({ row: null, organizationId: 2, localOrgId: null, local })).toEqual({ name: '', logoUrl: null, unknown: true });
  });

  it('una fila de otra organización con nombre vacío no toma el nombre local', () => {
    const row = { name: null, logo_url: null, primary_color: '#abcdef' };
    expect(resolveBrandIdentity({ row, organizationId: 2, localOrgId: 1, local })).toEqual({ name: '', logoUrl: null, unknown: false });
  });
});
