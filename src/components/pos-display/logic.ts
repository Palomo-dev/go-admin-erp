/**
 * Lógica pura de la pantalla del cliente (/pos-display). Sin React, sin DOM,
 * sin red: todo lo que aquí vive se prueba en Node (src/__tests__/pos-display).
 *
 * - Contraste: el color de marca se oscurece hasta cumplir AA sobre blanco
 *   (PLAN §4.5, mismo criterio que el editor web).
 * - Recorte de líneas: la pantalla no hace scroll; se muestran las últimas N
 *   y un contador «y X más» (PLAN §4.1).
 * - Saneado del estado: isDownMessage (Parte A) valida la FORMA del sobre,
 *   no el contenido de cada línea ni los importes del cobro. Aquí se sanea
 *   una sola vez al aceptar el `state` (useDisplayReceiver) para que las
 *   vistas trabajen siempre con datos completos: una línea sin `modifiers`
 *   se pinta con [], una sin `name` se descarta, un cobro sin `total` finito
 *   se descarta.
 * - Resolución de vista: qué estado de §4.2 se pinta a partir del
 *   DisplayState recibido y de la salud de la conexión. Cada bloque del
 *   estado es opcional: si falta el que el `mode` necesita, se degrada al
 *   estado neutro en vez de romper.
 * - Resaltado: solo cuando de verdad entró o cambió una línea, no con cada
 *   `state` aceptado (PLAN §4.1.2: «cada cambio se nota, ninguno distrae»).
 */

import type {
  DisplayCart,
  DisplayLine,
  DisplayModifier,
  DisplayPayment,
  DisplayState,
  DisplayVariantAttribute,
} from '@/lib/pos/display/protocol';
import { QR_TEXT_MAX_CHARS, isAmountWithinTotal, qrImageNeedsNetwork, qrTextFits } from '@/lib/pos/display/payment';
import { sanitizeDisplayTip } from '@/lib/pos/display/tip';

/** Duración del resaltado de la línea que acaba de cambiar (PLAN §4.1). */
export const HIGHLIGHT_MS = 600;

/** Moneda de último recurso si un carrito llega sin `currency` (la caja siempre la envía). */
export const FALLBACK_CURRENCY = 'COP';

export interface ResolveCurrencyInput {
  /** `cart.currency` del estado que se pinta; null/undefined si el estado no trae carrito (thanks, cobro sin líneas). */
  cartCurrency?: string | null;
  /** `currency` del último `hello` aceptado (la caja la manda antes de cualquier state). */
  helloCurrency?: string | null;
  /** Última moneda que esta pantalla ya pintó en esta sesión (respaldo para un emisor anterior sin `currency` en el hello). */
  remembered?: string | null;
}

/**
 * Con qué moneda se formatea un importe (PLAN §4.1.3 «nunca miente»).
 * Prioridad: carrito → hello → última recordada → FALLBACK_CURRENCY. Una
 * pantalla recién abierta durante «Gracias» no tiene carrito ni recuerdo,
 * pero sí el hello que precedió al state: pinta «US$ 11,90», no «$ 11,90».
 * Los valores vacíos o de solo espacios no cuentan.
 */
export function resolveDisplayCurrency(input: ResolveCurrencyInput): string {
  return (
    nonEmptyString(input.cartCurrency) ??
    nonEmptyString(input.helloCurrency) ??
    nonEmptyString(input.remembered) ??
    FALLBACK_CURRENCY
  );
}

// ---------------------------------------------------------------------------
// Contraste (WCAG 2.x)
// ---------------------------------------------------------------------------

/** Contraste mínimo AA para texto normal. */
export const AA_CONTRAST = 4.5;

/** Color neutro cuando la organización no tiene color de marca válido. */
export const FALLBACK_BRAND_COLOR = '#1f2937';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#rgb` o `#rrggbb` (con o sin `#`, mayúsculas o minúsculas) → RGB 0-255. null si no es un hex válido. */
export function parseHexColor(value: unknown): Rgb | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$/i.test(hex) && !/^[0-9a-f]{6}$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`;
}

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa (0 = negro, 1 = blanco). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** Ratio de contraste entre dos colores (1 a 21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * Devuelve el color de marca listo para usarse como texto sobre blanco: si
 * ya cumple AA se devuelve tal cual (normalizado a `#rrggbb`); si no, se
 * oscurece por pasos del 8 % hasta cumplirlo. Un valor que no es hex válido
 * (null, vacío, «rgb(…)», nombre CSS) cae al color neutro: la pantalla nunca
 * pinta un total ilegible por una configuración rara.
 */
export function ensureAaOnWhite(value: unknown, fallback: string = FALLBACK_BRAND_COLOR): string {
  const parsed = parseHexColor(value);
  if (!parsed) return fallback;
  let color = parsed;
  // Se redondea en cada paso: el contraste se evalúa sobre el hex que de
  // verdad se va a pintar, no sobre un flotante que el redondeo aclararía.
  // 60 pasos del 8 % llevan cualquier color a negro; el bucle siempre termina.
  for (let i = 0; i < 60 && contrastRatio(color, WHITE) < AA_CONTRAST; i += 1) {
    color = { r: Math.floor(color.r * 0.92), g: Math.floor(color.g * 0.92), b: Math.floor(color.b * 0.92) };
  }
  return rgbToHex(color);
}

// ---------------------------------------------------------------------------
// Recorte de líneas (sin scroll)
// ---------------------------------------------------------------------------

export interface TrimmedLines<T> {
  /** Las últimas `max` líneas, en su orden original. */
  visible: T[];
  /** Cuántas quedaron fuera (para «y X más»). */
  hidden: number;
}

/**
 * Muestra las últimas `max` líneas (lo más reciente es lo que el cliente
 * quiere ver). `max` < 1 o NaN se trata como 1; `+Infinity` como «todas».
 */
export function trimLines<T>(lines: readonly T[], max: number): TrimmedLines<T> {
  if (max === Number.POSITIVE_INFINITY) return { visible: [...lines], hidden: 0 };
  const limit = Math.max(1, Math.floor(Number.isFinite(max) ? max : 1));
  if (lines.length <= limit) return { visible: [...lines], hidden: 0 };
  return { visible: lines.slice(lines.length - limit), hidden: lines.length - limit };
}

/**
 * Cuántas líneas caben en `availableHeight` píxeles si cada una ocupa
 * `lineHeight`. Mínimo 1 para que siempre se vea algo.
 */
export function maxVisibleLines(availableHeight: number, lineHeight: number): number {
  if (!Number.isFinite(availableHeight) || !Number.isFinite(lineHeight) || lineHeight <= 0) return 1;
  return Math.max(1, Math.floor(availableHeight / lineHeight));
}

/**
 * Recorte con alturas desiguales: una línea con modificadores, variante o
 * nota es más alta que una simple. Se recorre desde el final (lo más
 * reciente) sumando `heightOf(line)` hasta agotar `availableHeight`,
 * reservando `reserve` píxeles para el contador «y X más» cuando haga falta.
 * Siempre queda al menos una línea visible.
 */
export function fitLastLines<T>(
  lines: readonly T[],
  heightOf: (line: T) => number,
  availableHeight: number,
  reserve = 0,
): TrimmedLines<T> {
  if (lines.length === 0) return { visible: [], hidden: 0 };
  const budget = Number.isFinite(availableHeight) ? Math.max(0, availableHeight) : 0;
  let used = 0;
  let count = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const h = Math.max(0, heightOf(lines[i]));
    // Si aún quedan líneas por encima habrá contador: hay que reservarle sitio.
    const needsCounter = i > 0;
    const limit = needsCounter ? budget - Math.max(0, reserve) : budget;
    if (count > 0 && used + h > limit) break;
    used += h;
    count += 1;
  }
  return trimLines(lines, count);
}

// ---------------------------------------------------------------------------
// Estimación de alturas de fila (para fitLastLines en OrderView)
// ---------------------------------------------------------------------------

export interface RowMetrics {
  /** Tamaño real (px) de la fuente de las líneas (`--pd-line`). */
  lineFontPx: number;
  /** Tamaño real (px) de la fuente de las sublíneas (`--pd-small`). */
  smallFontPx: number;
  /** Padding vertical total del `<li>` (py-1.5 = 6 + 6). */
  rowPaddingPx?: number;
  /** Separación entre `<li>` (gap-1 = 4). */
  gapPx?: number;
  /** line-height heredado (Tailwind preflight: 1.5). */
  lineHeight?: number;
}

export const DEFAULT_ROW_PADDING_PX = 12;
export const DEFAULT_ROW_GAP_PX = 4;
export const DEFAULT_LINE_HEIGHT = 1.5;
/** Padding inferior del contador «y X más» (pb-2 = 8). */
export const COUNTER_PADDING_PX = 8;

/** Cuántas sublíneas pinta OrderView bajo el nombre: variante, cada modificador, nota y descuento. */
export function subLineCount(line: DisplayLine): number {
  let count = 0;
  if (Array.isArray(line.variant) && line.variant.length > 0) count += 1;
  if (Array.isArray(line.modifiers)) count += line.modifiers.length;
  if (line.note) count += 1;
  if (typeof line.discount === 'number' && line.discount > 0) count += 1;
  return count;
}

/**
 * Alto en píxeles que ocupa una fila del pedido tal como la pinta OrderView:
 * nombre (lineFont × lineHeight) + padding del `<li>` + gap del `<ul>` +
 * una sublínea (smallFont × lineHeight) por variante, modificador, nota y
 * descuento. Aritmética a 1024×768 (line 28 px, small 18 px):
 * fila simple = 42 + 12 + 4 = 58 px; cada sublínea suma 27 px.
 */
export function estimateRowHeightPx(line: DisplayLine, metrics: RowMetrics): number {
  const lineHeight = metrics.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const rowPadding = metrics.rowPaddingPx ?? DEFAULT_ROW_PADDING_PX;
  const gap = metrics.gapPx ?? DEFAULT_ROW_GAP_PX;
  const lineFont = Number.isFinite(metrics.lineFontPx) && metrics.lineFontPx > 0 ? metrics.lineFontPx : 28;
  const smallFont = Number.isFinite(metrics.smallFontPx) && metrics.smallFontPx > 0 ? metrics.smallFontPx : 18;
  return lineFont * lineHeight + rowPadding + gap + subLineCount(line) * smallFont * lineHeight;
}

/** Alto que reserva el contador «y X más» (una línea de `--pd-small` + pb-2). */
export function counterReservePx(smallFontPx: number, lineHeight = DEFAULT_LINE_HEIGHT): number {
  const smallFont = Number.isFinite(smallFontPx) && smallFontPx > 0 ? smallFontPx : 18;
  return smallFont * lineHeight + COUNTER_PADDING_PX;
}

// ---------------------------------------------------------------------------
// Impuestos: cómo se etiquetan (PLAN §4.3: igual que el recibo)
// ---------------------------------------------------------------------------

export type TaxLabelKind = 'none' | 'included' | 'breakdown' | 'mixed';

/**
 * - `none`: no hay impuesto que mostrar.
 * - `included`: todas las líneas con impuesto lo llevan dentro del precio → «IVA incluido».
 * - `breakdown`: ninguna lo lleva dentro → se desglosa como en el recibo.
 * - `mixed`: unas sí y otras no; la pantalla lo dice en vez de mentir con una etiqueta única.
 * Las líneas con `taxExcluded` no cuentan: no llevan impuesto.
 */
export function taxLabelKind(cart: Pick<DisplayCart, 'taxTotal' | 'taxIncluded' | 'lines'>): TaxLabelKind {
  if (!(cart.taxTotal > 0)) return 'none';
  const taxable = cart.lines.filter((line) => !line.taxExcluded);
  if (taxable.length === 0) return cart.taxIncluded ? 'included' : 'breakdown';
  const included = taxable.filter((line) => line.taxIncluded).length;
  if (included === taxable.length) return 'included';
  if (included === 0) return 'breakdown';
  return 'mixed';
}

// ---------------------------------------------------------------------------
// Resolución de vista
// ---------------------------------------------------------------------------

export type DisplayView =
  | 'idle'
  | 'order'
  | 'payment_cash'
  | 'payment_card'
  | 'payment_qr'
  | 'thanks'
  /** Propina (F2-B, PLAN §4.2): solo si la caja la pregunta (`mode: 'tip'` con bloque `tip` y carrito con líneas). */
  | 'tip'
  | 'connecting'
  | 'update_required';

export interface ResolveViewInput {
  /** Hubo un mensaje aceptado de la caja hace menos de STALE_AFTER_MS y no se despidió después. */
  connected: boolean;
  /** Sin caja desde hace ≥ 60 s (PLAN §10): se deja de esperar y se vuelve a Reposo. */
  disconnectedTooLong?: boolean;
  /** Llegan sobres de otra versión del protocolo y ninguno válido. */
  updateRequired: boolean;
  /** La vista Gracias ya cumplió sus 8 s (PLAN §4.2). */
  thanksExpired?: boolean;
  /**
   * ¿La pantalla es táctil? (resolveTouch). Solo lo mira `tip` (ronda 2 de
   * F2-B, QA-7): sin presets y sin táctil no hay nada que mostrar ni que
   * pulsar («Otro» exige botones), así que se pinta el cobro. Ausente → no
   * se degrada por este motivo (compatibilidad con quien no lo pase).
   */
  touch?: boolean;
  state: DisplayState | null;
}

function hasLines(cart: DisplayCart | null | undefined): cart is DisplayCart {
  return !!cart && Array.isArray(cart.lines) && cart.lines.length > 0;
}

/** Vista por método de cobro; `satisfies` obliga a cubrir cada método del protocolo. */
const PAYMENT_VIEWS = {
  cash: 'payment_cash',
  card: 'payment_card',
  qr: 'payment_qr',
} as const satisfies Record<DisplayPayment['method'], DisplayView>;

/** Total: un método desconocido (JSON que pasó la forma) cae a Reposo, nunca a undefined. */
function paymentView(payment: DisplayPayment): DisplayView {
  switch (payment.method) {
    case 'cash':
    case 'card':
    case 'qr':
      return PAYMENT_VIEWS[payment.method];
    default:
      return 'idle';
  }
}

/** Un cobro solo se pinta si trae un total finito (PLAN §4.1.3: «nunca miente»). */
function hasPaymentTotal(payment: DisplayPayment | null | undefined): payment is DisplayPayment {
  return !!payment && Number.isFinite(payment.total);
}

/**
 * Qué pinta la pantalla. Orden de prioridad:
 * 1. Sin caja (ni por latido ni por bye reciente) → Conectando, salvo que
 *    lleve demasiado (→ Reposo) o que la única voz sea de otra versión
 *    (→ Actualice la pantalla).
 * 2. Con caja pero SIN estado aceptado (adoptada por un latido tras bye o
 *    silencio, o el hello de un announce cuyo state aún no llegó) →
 *    Conectando: no se sabe qué hay en la caja y Reposo mentiría con un
 *    pedido en curso (PLAN §4.1.3). useDisplayReceiver sigue pidiendo
 *    need_snapshot mientras dure.
 * 3. Con caja y estado: el `mode` del estado, degradado si falta el bloque
 *    que necesita. `closed` no existe aún y se trata como el estado neutro
 *    más cercano (pedido si hay carrito; reposo si no). `tip` (F2-B) se
 *    pinta solo con carrito con líneas y bloque `tip` saneado; si falta
 *    cualquiera de los dos, cae a pedido/reposo: nunca se pregunta una
 *    propina sobre nada. Y con bloque `tip` SIN presets en una pantalla NO
 *    táctil (`touch === false`) cae al cobro que viaja en el mismo state:
 *    una pregunta sin importes ni botones no describe nada (ronda 2, QA-7).
 */
export function resolveView(input: ResolveViewInput): DisplayView {
  if (!input.connected) {
    if (input.updateRequired) return 'update_required';
    return input.disconnectedTooLong ? 'idle' : 'connecting';
  }
  const state = input.state;
  if (!state) return 'connecting';
  const orderOrIdle: DisplayView = hasLines(state.cart) ? 'order' : 'idle';
  switch (state.mode) {
    case 'idle':
      return 'idle';
    case 'order':
      return orderOrIdle;
    case 'payment':
      return hasPaymentTotal(state.payment) ? paymentView(state.payment) : orderOrIdle;
    case 'thanks':
      if (!state.thanks || !Number.isFinite(state.thanks.total)) return 'idle';
      return input.thanksExpired ? 'idle' : 'thanks';
    case 'tip': {
      if (!state.tip || !hasLines(state.cart)) return orderOrIdle;
      if (input.touch === false && state.tip.presets.length === 0) {
        return hasPaymentTotal(state.payment) ? paymentView(state.payment) : orderOrIdle;
      }
      return 'tip';
    }
    case 'closed':
      return orderOrIdle;
    default:
      return 'idle';
  }
}

/** Solo los estados que muestran importes; en Conectando se ocultan (PLAN §4.1 «nunca miente»). */
export function viewShowsAmounts(view: DisplayView): boolean {
  return (
    view === 'order' || view === 'payment_cash' || view === 'payment_card' || view === 'payment_qr' || view === 'thanks' || view === 'tip'
  );
}

/** Una línea vale la pena resaltarla solo si existe en el carrito que se pinta. */
export function findLine(cart: DisplayCart | null, lineId: string | null): DisplayLine | null {
  if (!cart || !lineId) return null;
  return cart.lines.find((line) => line.id === lineId) ?? null;
}

// ---------------------------------------------------------------------------
// Saneado del estado recibido (defensa por línea; isDownMessage solo mira la forma)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function sanitizeModifiers(value: unknown): DisplayModifier[] {
  if (!Array.isArray(value)) return [];
  const out: DisplayModifier[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = nonEmptyString(item.name);
    if (name === null) continue;
    out.push({ name, extraPrice: finiteOrNull(item.extraPrice) ?? 0 });
  }
  return out;
}

function sanitizeVariant(value: unknown): DisplayVariantAttribute[] | null {
  if (!Array.isArray(value)) return null;
  const out: DisplayVariantAttribute[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (typeof item.attr !== 'string' || typeof item.value !== 'string') continue;
    out.push({ attr: item.attr, value: item.value });
  }
  return out.length > 0 ? out : null;
}

/**
 * Una línea lista para pintarse, o null si le falta lo esencial (id, nombre,
 * cantidad, precio o total). Los bloques opcionales que falten o vengan
 * malformados se normalizan: `modifiers` → [], `variant`/`note`/`discount`
 * → null, banderas de impuesto → booleano.
 */
export function sanitizeDisplayLine(value: unknown): DisplayLine | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const qty = finiteOrNull(value.qty);
  const unitPrice = finiteOrNull(value.unitPrice);
  const total = finiteOrNull(value.total);
  if (id === null || name === null || qty === null || unitPrice === null || total === null) return null;
  const discount = finiteOrNull(value.discount);
  return {
    id,
    name,
    variant: sanitizeVariant(value.variant),
    qty,
    unitPrice,
    total,
    modifiers: sanitizeModifiers(value.modifiers),
    discount: discount !== null && discount > 0 ? discount : null,
    note: nonEmptyString(value.note),
    taxExcluded: Boolean(value.taxExcluded),
    taxIncluded: Boolean(value.taxIncluded),
  };
}

/**
 * Carrito saneado: descarta las líneas inválidas y devuelve null si no
 * queda ninguna o si subtotal/total no son números finitos (sin ellos la
 * vista Pedido mentiría). Los ids repetidos se quedan con la primera
 * aparición para que `key` y el resaltado sean estables.
 */
export function sanitizeDisplayCart(value: unknown): DisplayCart | null {
  if (!isRecord(value) || !Array.isArray(value.lines)) return null;
  const seen = new Set<string>();
  const lines: DisplayLine[] = [];
  for (const raw of value.lines) {
    const line = sanitizeDisplayLine(raw);
    if (!line || seen.has(line.id)) continue;
    seen.add(line.id);
    lines.push(line);
  }
  const subtotal = finiteOrNull(value.subtotal);
  const total = finiteOrNull(value.total);
  if (lines.length === 0 || subtotal === null || total === null) return null;
  const lastChangedLineId = nonEmptyString(value.lastChangedLineId);
  return {
    id: nonEmptyString(value.id) ?? '',
    currency: nonEmptyString(value.currency) ?? FALLBACK_CURRENCY,
    lines,
    subtotal,
    discountTotal: finiteOrNull(value.discountTotal) ?? 0,
    discountLabel: nonEmptyString(value.discountLabel),
    taxTotal: finiteOrNull(value.taxTotal) ?? 0,
    taxIncluded: Boolean(value.taxIncluded),
    total,
    lastChangedLineId: lastChangedLineId !== null && seen.has(lastChangedLineId) ? lastChangedLineId : null,
  };
}

/** Cobro saneado: método conocido y total finito; `received`/`change` finitos o null; textos normalizados. */
export function sanitizeDisplayPayment(value: unknown): DisplayPayment | null {
  if (!isRecord(value)) return null;
  const total = finiteOrNull(value.total);
  if (total === null) return null;
  switch (value.method) {
    case 'cash':
      return { method: 'cash', total, received: finiteOrNull(value.received), change: finiteOrNull(value.change) };
    case 'card':
      return { method: 'card', total, provider: nonEmptyString(value.provider) };
    case 'qr': {
      const rawQr = value.qr;
      let qr: { kind: 'image' | 'text'; value: string } | null = null;
      if (isRecord(rawQr) && typeof rawQr.value === 'string' && (rawQr.kind === 'image' || rawQr.kind === 'text')) {
        qr = { kind: rawQr.kind, value: rawQr.value };
      }
      const payment: DisplayPayment = {
        method: 'qr',
        total,
        provider: nonEmptyString(value.provider) ?? '',
        qr,
        expiresAt: finiteOrNull(value.expiresAt),
      };
      // Importe de ESTE código (pago mixto, F2-C r3). Ausente (emisor
      // anterior), no finito o fuera de (0, total] (ronda 4, C3: un emisor
      // distinto o un state fabricado) → no se conserva = «el total».
      if (isAmountWithinTotal(value.amount, total)) payment.amount = value.amount;
      return payment;
    }
    default:
      return null;
  }
}

/**
 * Estado completo saneado. Se aplica UNA vez al aceptar el `state` en
 * useDisplayReceiver; resolveView y las vistas trabajan siempre sobre esto.
 * `tip` se sanea con sanitizeDisplayTip (F2-B).
 */
export function sanitizeDisplayState(value: DisplayState): DisplayState {
  const rawThanks: unknown = value.thanks;
  const thanksTotal = isRecord(rawThanks) ? finiteOrNull(rawThanks.total) : null;
  return {
    mode: value.mode,
    cart: sanitizeDisplayCart(value.cart),
    payment: sanitizeDisplayPayment(value.payment),
    // F2-B: presets válidos, `allowCustom` booleano, `base` finita; sin nada que preguntar → null (tip.ts).
    tip: sanitizeDisplayTip(value.tip),
    thanks:
      thanksTotal === null || !isRecord(rawThanks) ? null : { total: thanksTotal, askRating: Boolean(rawThanks.askRating) },
  };
}

// ---------------------------------------------------------------------------
// Táctil (PLAN §4.4): detección + forzado desde los ajustes
// ---------------------------------------------------------------------------

/**
 * ¿La pantalla puede mostrar controles táctiles? `detected` es
 * `navigator.maxTouchPoints > 0`; `override` es `hello.settings.touch`
 * ('auto' | 'touch' | 'no-touch') por si el hardware miente. Cualquier
 * valor desconocido (emisor de la Fase 0 sin ajustes, JSON raro) cuenta como
 * 'auto'. Regla: la pantalla nunca muestra un control que no pueda usarse.
 */
export function resolveTouch(detected: boolean, override: unknown): boolean {
  if (override === 'touch') return true;
  if (override === 'no-touch') return false;
  return detected === true;
}

// ---------------------------------------------------------------------------
// Cobro · QR (PLAN §4.2, §3.5): qué se pinta con lo que llegó
// ---------------------------------------------------------------------------

export type QrPresentationKind = 'image' | 'text' | 'fallback';

export interface QrPresentation {
  /** `image`: `<img src=value>`; `text`: generar el QR a partir de `value`; `fallback`: «siga las instrucciones del cajero». */
  kind: QrPresentationKind;
  value: string | null;
  /** ms hasta el vencimiento (≥ 0); null si el cobro no vence o ya venció (entonces `kind` es `fallback`). */
  remainingMs: number | null;
  /** true si había vencimiento y ya pasó. */
  expired: boolean;
}

export interface QrPresentationEnv {
  now: number;
  /** `navigator.onLine`; sin él, true (no se puede afirmar que no hay red). */
  online: boolean;
  /** true si el `<img>` de esta imagen ya falló al cargar. */
  imageFailed?: boolean;
}

/**
 * ¿La imagen necesita red para pintarse? (una data URL o blob no). Vive en
 * payment.ts desde la ronda 5: el emisor la usa para preferir el texto EMVCo
 * cuando la imagen es remota. Se reexporta para no romper a quien la importa
 * de aquí.
 */
export { qrImageNeedsNetwork };

/**
 * Longitud máxima del texto que la pantalla acepta convertir en QR. Es la
 * misma constante que usa el emisor (payment.ts): un QR v40 nivel M admite
 * 2 331 bytes en modo byte y `QRCodeSVG` LANZA «Data too long» durante el
 * render por encima. Se reexporta para que las pruebas de la pantalla la
 * lean de aquí. Un emisor viejo o un state fabricado podrían traer más: la
 * pantalla lo degrada en lugar de caerse.
 */
export { QR_TEXT_MAX_CHARS };

/**
 * Decide qué muestra la vista Cobro·QR. Nunca un código roto (PLAN §3.5):
 * - sin `qr`, vencido, imagen que falló al cargar, o imagen remota sin red
 *   → `fallback` («Pago con QR: siga las instrucciones del cajero»);
 * - texto más largo que `QR_TEXT_MAX_CHARS` en caracteres o bytes UTF-8 (no
 *   cabe en un QR; qrcode.react lanzaría) → `fallback`;
 * - imagen pintable → `image`; texto → `text` (la pantalla lo convierte en QR).
 * `remainingMs` alimenta la cuenta atrás; con `expiresAt` null no hay cuenta.
 */
export function resolveQrPresentation(
  payment: Extract<DisplayPayment, { method: 'qr' }>,
  env: QrPresentationEnv,
): QrPresentation {
  const expiresAt = typeof payment.expiresAt === 'number' && Number.isFinite(payment.expiresAt) ? payment.expiresAt : null;
  const expired = expiresAt !== null && expiresAt <= env.now;
  const remainingMs = expiresAt === null || expired ? null : Math.max(0, expiresAt - env.now);
  const fallback: QrPresentation = { kind: 'fallback', value: null, remainingMs, expired };

  const qr = payment.qr;
  if (expired || !qr || typeof qr.value !== 'string' || qr.value.trim().length === 0) return fallback;
  if (qr.kind === 'image') {
    if (env.imageFailed === true) return fallback;
    if (env.online === false && qrImageNeedsNetwork(qr.value)) return fallback;
    return { kind: 'image', value: qr.value, remainingMs, expired };
  }
  if (qr.kind === 'text') {
    if (!qrTextFits(qr.value)) return fallback;
    return { kind: 'text', value: qr.value, remainingMs, expired };
  }
  return fallback;
}

/** mm:ss para la cuenta atrás; negativos o no finitos → 00:00. */
export function formatCountdown(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Resaltado: ¿de verdad entró o cambió una línea?
// ---------------------------------------------------------------------------

/**
 * true solo si el carrito nuevo señala una línea (`lastChangedLineId`) y esa
 * línea es nueva o cambió en lo que el cliente ve (cantidad, precio, total,
 * número de modificadores o nota) respecto al carrito anterior aceptado.
 * Un `state` que repite el mismo carrito (abrir y cancelar el cobro,
 * hello+state al recuperar el foco, respuesta a need_snapshot) NO resalta.
 */
export function shouldHighlightLine(previous: DisplayCart | null, next: DisplayCart | null): boolean {
  if (!next || !next.lastChangedLineId) return false;
  const line = findLine(next, next.lastChangedLineId);
  if (!line) return false;
  if (!previous) return true;
  if (previous.id !== next.id) return true;
  if (previous.lastChangedLineId !== next.lastChangedLineId) return true;
  const before = findLine(previous, line.id);
  if (!before) return true;
  return (
    before.qty !== line.qty ||
    before.unitPrice !== line.unitPrice ||
    before.total !== line.total ||
    before.modifiers.length !== line.modifiers.length ||
    before.note !== line.note
  );
}

/**
 * Decisión de resaltado a nivel de ESTADO, la que usa useDisplayReceiver.
 * `previous` es null cuando no había estado (pantalla recién abierta o caja
 * olvidada tras bye/silencio): lo que llega entonces es la respuesta a un
 * need_snapshot, repite lo que el cliente ya veía y NO resalta (PLAN §4.1.2).
 * Con estado previo se delega en shouldHighlightLine: de Reposo (cart null) a
 * la primera línea sí resalta, y un mismo carrito repetido no.
 */
export function shouldHighlightAfterState(previous: DisplayState | null, next: DisplayState): boolean {
  if (previous === null) return false;
  return shouldHighlightLine(previous.cart, next.cart);
}

// ---------------------------------------------------------------------------
// Texto: fecha de Reposo
// ---------------------------------------------------------------------------

/**
 * Solo la primera letra en mayúscula, según el idioma (`tag` BCP 47). Para la
 * fecha larga de Reposo: «miércoles, 16 de septiembre» → «Miércoles, 16 de
 * septiembre». La clase `capitalize` de Tailwind pondría mayúscula en cada
 * palabra («16 De Septiembre»), incorrecto en es/pt/fr.
 */
export function capitalizeFirst(text: string, tag?: string): string {
  if (!text) return text;
  return text.charAt(0).toLocaleUpperCase(tag) + text.slice(1);
}

// ---------------------------------------------------------------------------
// Marca: qué nombre y logo se pintan
// ---------------------------------------------------------------------------

export interface BrandIdentityRow {
  name: string | null;
  logo_url: string | null;
  primary_color: string | null;
}

export interface BrandIdentityInput {
  /** Fila de `organizations` leída para la caja que habla; null si no se pudo leer (RLS, red) o no existe. */
  row: BrandIdentityRow | null;
  /** Organización de la caja que habla (hello) o, sin hello, la activa en este navegador. */
  organizationId: number;
  /** Organización activa en este navegador (useOrganization), si hay sesión. */
  localOrgId: number | null;
  /** Nombre y logo que useOrganization ya tiene en localStorage (solo valen para la organización local). */
  local: { name: string | null; logoUrl: string | null };
}

export interface BrandIdentity {
  name: string;
  logoUrl: string | null;
  /** true si la fila no se pudo leer y la caja es de OTRA organización: la pantalla no debe fingir marca. */
  unknown: boolean;
}

/**
 * Nombre y logo a pintar. Regla: nunca se enseña el nombre de una
 * organización distinta de la caja que habla. Con fila leída se usa la fila;
 * sin fila, el respaldo local solo vale si la caja es la organización local;
 * si es otra y no se pudo leer, se pinta vacío (inicial «•», color neutro).
 */
export function resolveBrandIdentity(input: BrandIdentityInput): BrandIdentity {
  const { row, organizationId, localOrgId, local } = input;
  const isLocal = localOrgId !== null && organizationId === localOrgId;
  if (row) {
    return {
      name: nonEmptyString(row.name) ?? (isLocal ? (nonEmptyString(local.name) ?? '') : ''),
      logoUrl: nonEmptyString(row.logo_url) ?? (isLocal ? nonEmptyString(local.logoUrl) : null),
      unknown: false,
    };
  }
  if (isLocal) {
    return { name: nonEmptyString(local.name) ?? '', logoUrl: nonEmptyString(local.logoUrl), unknown: false };
  }
  return { name: '', logoUrl: null, unknown: true };
}
