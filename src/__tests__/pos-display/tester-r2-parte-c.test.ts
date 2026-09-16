/**
 * Tester · Parte C (ruta /pos-display) · ronda 2.
 *
 * Lo que la ronda 1 no cubría y lo que la ronda 2 del builder introdujo:
 *  1. Guardarraíl de la escala tipográfica: Tailwind 3 compila
 *     `text-[var(--x)]` como COLOR, no como font-size (el valor es ambiguo y
 *     `text-` prueba primero textColor). Verificado en el navegador a
 *     1024×768: `.text-\[var\(--pd-total\)\] { color: var(--pd-total) }` y el
 *     TOTAL medía 16 px. La forma correcta es `text-[length:var(--x)]`.
 *     Este test FALLA hasta que se corrija; es el reporte en forma de código.
 *  2. Pipeline completo caja → receptor → saneado → vista con contenido
 *     degenerado que pasa el guard de forma (isDownMessage): qty 0, qty
 *     negativa, descuento mayor que el subtotal, currency no string, QR sin
 *     proveedor, thanks con total no finito.
 *  3. Resaltado: tras perder la caja (forgetCashier) el carrito anterior es
 *     null y la respuesta al need_snapshot SÍ resalta (contradice el
 *     comentario de shouldHighlightLine). Se documenta el comportamiento.
 *  4. Recorte con corrección post-render: trimLines(estimadas − extra) nunca
 *     baja de 1 ni oculta la última línea.
 *  5. Marca: resolveBrandIdentity con organizationId 0 (sin sesión ni hello).
 *
 * Fixtures con organización ficticia. Sin nombres de clientes reales.
 */

import fs from 'fs';
import path from 'path';
import type { DisplayCart, DisplayLine, DisplayState, DownMessage } from '@/lib/pos/display/protocol';
import { isDownMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, displayChannelName } from '@/lib/pos/display/transport';
import {
  FALLBACK_CURRENCY,
  estimateRowHeightPx,
  fitLastLines,
  resolveBrandIdentity,
  resolveView,
  sanitizeDisplayCart,
  sanitizeDisplayLine,
  sanitizeDisplayPayment,
  sanitizeDisplayState,
  shouldHighlightLine,
  trimLines,
} from '@/components/pos-display/logic';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
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
// 1. Guardarraíl: la escala tipográfica tiene que compilar a font-size
// ---------------------------------------------------------------------------

describe('escala tipográfica · Tailwind necesita el hint `length:` con variables', () => {
  const dir = path.join(process.cwd(), 'src', 'components', 'pos-display');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'));

  it('ninguna clase text-[var(--pd-*)] sin hint: Tailwind 3 la compila como color y el texto se queda en 16 px', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      const matches = src.match(/text-\[var\(--pd-[a-z]+\)\]/g) ?? [];
      if (matches.length > 0) offenders.push(`${file}: ${matches.length} × ${[...new Set(matches)].join(', ')}`);
    }
    // Reproducido en el navegador (1024×768): getComputedStyle(TOTAL).fontSize === '16px' y la
    // regla generada es `.text-\[var\(--pd-total\)\] { color: var(--pd-total) }`.
    // Corrección: `text-[length:var(--pd-total)]` (y lo mismo para line, small, heading, big, logo).
    expect(offenders).toEqual([]);
  });

  it('los tamaños con calc() o max() sí compilan a font-size (no se tocan); solo el var() desnudo es ambiguo', () => {
    // Documenta el límite del guardarraíl: text-[calc(var(--pd-logo)*0.5)] y text-[max(11px,…)] sí funcionan.
    const src = fs.readFileSync(path.join(dir, 'BrandHeader.tsx'), 'utf8');
    expect(src).toMatch(/text-\[calc\(var\(--pd-logo\)\*0\.5\)\]/);
  });
});

// ---------------------------------------------------------------------------
// 2. Pipeline completo con contenido degenerado que pasa el guard de forma
// ---------------------------------------------------------------------------

describe('pipeline caja → receptor → saneado → vista', () => {
  const down = (seq: number, extra: Record<string, unknown> & { t: DownMessage['t'] }): unknown => ({
    v: 1,
    seq,
    terminalId: TERMINAL,
    instanceId: INSTANCE_A,
    ...extra,
  });

  async function roundTrip(rawState: unknown): Promise<DisplayState | null> {
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => 1 }));
    const delivered: DownMessage[] = [];
    receiver.onDown((m) => delivered.push(m));
    const caja = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    caja.postMessage(down(0, { t: 'state', state: rawState }));
    await flush();
    if (delivered.length === 0) return null;
    return sanitizeDisplayState((delivered[0] as Extract<DownMessage, { t: 'state' }>).state);
  }

  it('qty 0 y qty negativa pasan el guard y el saneado: se pintan tal cual («0 ×», «−1 ×»)', async () => {
    const clean = await roundTrip(state({ mode: 'order', cart: cart([line({ id: 'a', qty: 0, total: 0 }), line({ id: 'b', qty: -1, total: -1000 })]) }));
    expect(clean).not.toBeNull();
    expect(clean!.cart!.lines.map((l) => l.qty)).toEqual([0, -1]);
    // Decisión documentada: la caja es la fuente de verdad; la pantalla no filtra cantidades absurdas.
    expect(resolveView({ connected: true, updateRequired: false, state: clean })).toBe('order');
  });

  it('descuento mayor que el subtotal: el total negativo se conserva y se pinta (sin clamp a 0)', async () => {
    const clean = await roundTrip(state({ mode: 'order', cart: cart([line({ id: 'a' })], { discountTotal: 5000, total: -4000 }) }));
    expect(clean!.cart!.total).toBe(-4000);
    expect(clean!.cart!.discountTotal).toBe(5000);
    expect(resolveView({ connected: true, updateRequired: false, state: clean })).toBe('order');
  });

  it('currency que no es string (número, null, vacío) cae a FALLBACK_CURRENCY', async () => {
    for (const currency of [123, null, '', '   ']) {
      const clean = await roundTrip(state({ mode: 'order', cart: { ...cart([line({ id: 'a' })]), currency: currency as unknown as string } }));
      expect(clean!.cart!.currency).toBe(FALLBACK_CURRENCY);
    }
  });

  it('cobro QR sin proveedor → provider "" (la vista pintará «Pago con » vacío: cosmético, documentado)', async () => {
    const clean = await roundTrip(state({ mode: 'payment', payment: { method: 'qr', total: 1000 } as unknown as DisplayState['payment'] }));
    expect(clean!.payment).toEqual({ method: 'qr', total: 1000, provider: '', qr: null, expiresAt: null });
    expect(resolveView({ connected: true, updateRequired: false, state: clean })).toBe('payment_qr');
  });

  it('cobro QR con qr.kind desconocido o value no string → qr null (no se pinta un código roto)', () => {
    expect(sanitizeDisplayPayment({ method: 'qr', total: 1, provider: 'X', qr: { kind: 'svg', value: 'abc' } })!).toMatchObject({ qr: null });
    expect(sanitizeDisplayPayment({ method: 'qr', total: 1, provider: 'X', qr: { kind: 'image', value: 42 } })!).toMatchObject({ qr: null });
    expect(sanitizeDisplayPayment({ method: 'qr', total: 1, provider: 'X', qr: { kind: 'text', value: 'abc' } })!).toMatchObject({ qr: { kind: 'text', value: 'abc' } });
  });

  it('thanks.total Infinity o string: el guard de forma lo rechaza antes de llegar a la pantalla', async () => {
    expect(await roundTrip(state({ mode: 'thanks', thanks: { total: Number.POSITIVE_INFINITY, askRating: false } }))).toBeNull();
    expect(await roundTrip(state({ mode: 'thanks', thanks: { total: '1000', askRating: false } as unknown as DisplayState['thanks'] }))).toBeNull();
    // Y el saneado, por su cuenta, también lo tumba si algo lo saltara.
    expect(sanitizeDisplayState(state({ mode: 'thanks', thanks: { total: NaN, askRating: true } })).thanks).toBeNull();
  });

  it('mode=payment con payment=null y carrito con líneas: se sigue mostrando el pedido, nunca un cobro vacío', async () => {
    const clean = await roundTrip(state({ mode: 'payment', cart: cart([line({ id: 'a' })]), payment: null }));
    expect(resolveView({ connected: true, updateRequired: false, state: clean })).toBe('order');
  });

  it('cash con received negativo o change NaN: se conservan finitos y se anulan los NaN (la vista pinta «—»)', () => {
    const p = sanitizeDisplayPayment({ method: 'cash', total: 1000, received: -50, change: NaN });
    expect(p).toEqual({ method: 'cash', total: 1000, received: -50, change: null });
  });

  it('una línea con name de solo espacios se descarta y con id numérico también (el id debe ser string)', () => {
    expect(sanitizeDisplayLine({ id: 'a', name: '   ', qty: 1, unitPrice: 1, total: 1 })).toBeNull();
    expect(sanitizeDisplayLine({ id: 7, name: 'x', qty: 1, unitPrice: 1, total: 1 })).toBeNull();
  });

  it('200 líneas donde solo la última es válida → carrito de 1 línea y lastChangedLineId conservado', () => {
    const raw = {
      ...cart([line({ id: 'ok' })]),
      lines: [...Array.from({ length: 199 }, (_, i) => ({ id: `bad${i}` })), line({ id: 'ok' })],
      lastChangedLineId: 'ok',
    };
    const clean = sanitizeDisplayCart(raw);
    expect(clean!.lines).toHaveLength(1);
    expect(clean!.lastChangedLineId).toBe('ok');
  });

  it('tip malformado pasa intacto (no se pinta en F0) sin romper el saneado', () => {
    const raw = state({ mode: 'order', cart: cart([line({ id: 'a' })]), tip: { presets: ['x', null], allowCustom: 'sí', selected: 7 } as unknown as DisplayState['tip'] });
    expect(isDownMessage({ v: 1, seq: 0, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'state', state: raw })).toBe(true);
    expect(() => sanitizeDisplayState(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Resaltado tras perder la caja
// ---------------------------------------------------------------------------

describe('resaltado · reconexión', () => {
  it('con carrito anterior null (tras forgetCashier o al abrir la pantalla) la respuesta al need_snapshot SÍ resalta', () => {
    // Comportamiento actual: el comentario de shouldHighlightLine promete que «respuesta a need_snapshot NO
    // resalta», pero eso solo vale si había carrito anterior. Tras bye/silencio se olvida y el snapshot
    // resalta la última línea aunque el cliente ya la había visto. Severidad baja; se deja documentado.
    const c = cart([line({ id: 'a' }), line({ id: 'b' })]);
    expect(shouldHighlightLine(null, c)).toBe(true);
    // Mismo carrito una vez recordado: ya no.
    expect(shouldHighlightLine(c, c)).toBe(false);
  });

  it('cambiar el nombre de un modificador (mismo número) o el descuento de línea no resalta', () => {
    const before = cart([line({ id: 'a', modifiers: [{ name: 'Sin azúcar', extraPrice: 0 }], discount: null })]);
    const after = cart([line({ id: 'a', modifiers: [{ name: 'Con azúcar', extraPrice: 0 }], discount: 100 })]);
    expect(shouldHighlightLine(before, after)).toBe(false);
  });

  it('quitar una línea: lastChangedLineId apunta a una que ya no existe → no resalta y no lanza', () => {
    const before = cart([line({ id: 'a' }), line({ id: 'b' })]);
    const after = cart([line({ id: 'a' })], { lastChangedLineId: 'b' });
    expect(shouldHighlightLine(before, after)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Recorte con corrección post-render
// ---------------------------------------------------------------------------

describe('recorte · corrección post-render (OrderView.useOverflowCorrection)', () => {
  const lines = Array.from({ length: 12 }, (_, i) => line({ id: `l${i}` }));
  const metrics = { lineFontPx: 28, smallFontPx: 18 };

  it('quitar `extra` líneas a la estimación nunca oculta la última ni baja de 1 visible', () => {
    const estimated = fitLastLines(lines, (l) => estimateRowHeightPx(l, metrics), 425, 35);
    expect(estimated.visible.length).toBeGreaterThanOrEqual(6);
    for (let extra = 1; extra < estimated.visible.length; extra += 1) {
      const corrected = trimLines(lines, estimated.visible.length - extra);
      expect(corrected.visible.length).toBe(estimated.visible.length - extra);
      expect(corrected.visible.at(-1)!.id).toBe('l11');
      expect(corrected.hidden + corrected.visible.length).toBe(lines.length);
    }
    // El bucle de OrderView se detiene cuando estimadas − extra === 1: nunca 0.
    expect(trimLines(lines, 1).visible.map((l) => l.id)).toEqual(['l11']);
  });

  it('con las fuentes REALES de hoy (16 px por el bug de Tailwind) la estimación cree que caben más filas de las que el diseño quiere', () => {
    // Fila simple a 16 px = 16×1.5 + 12 + 4 = 40 px → 425 px dan 10 filas; a 28 px serían 7.
    // No es un fallo de la estimación (mide lo real), es la consecuencia del bug del bloque 1.
    const at16 = fitLastLines(lines, (l) => estimateRowHeightPx(l, { lineFontPx: 16, smallFontPx: 16 }), 425, 16 * 1.5 + 8);
    const at28 = fitLastLines(lines, (l) => estimateRowHeightPx(l, metrics), 425, 35);
    expect(at16.visible.length).toBeGreaterThan(at28.visible.length);
  });

  it('una sola línea con 40 modificadores no cabe ni sola: se muestra igual (visible 1, hidden resto)', () => {
    const huge = line({ id: 'huge', modifiers: Array.from({ length: 40 }, (_, i) => ({ name: `m${i}`, extraPrice: 0 })) });
    const all = [...lines, huge];
    const r = fitLastLines(all, (l) => estimateRowHeightPx(l, metrics), 425, 35);
    expect(r.visible.map((l) => l.id)).toEqual(['huge']);
    expect(r.hidden).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// 5. Marca sin sesión ni hello
// ---------------------------------------------------------------------------

describe('marca · sin sesión ni hello', () => {
  it('organizationId 0 y sin organización local → vacío y unknown (inicial «•», color neutro)', () => {
    expect(resolveBrandIdentity({ row: null, organizationId: 0, localOrgId: null, local: { name: null, logoUrl: null } })).toEqual({
      name: '',
      logoUrl: null,
      unknown: true,
    });
  });

  it('fila con nombre de solo espacios y logo vacío para una organización ajena → vacío pero NO unknown', () => {
    const r = resolveBrandIdentity({ row: { name: '  ', logo_url: '', primary_color: null }, organizationId: 5, localOrgId: 1, local: { name: 'Local', logoUrl: 'x' } });
    expect(r).toEqual({ name: '', logoUrl: null, unknown: false });
  });
});
