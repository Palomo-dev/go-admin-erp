/**
 * Protocolo de mensajes entre la caja (/app/pos) y la pantalla del cliente
 * (/pos-display). Ver docs/pos-doble-pantalla/PLAN.md §8.
 *
 * Reglas que definen el diseño:
 * - Hacia abajo (caja → pantalla) viaja un DisplayState COMPLETO, nunca deltas.
 * - Hacia arriba (pantalla → caja) viajan intenciones que la caja confirma.
 * - Todo mensaje lleva `v` (versión) y `terminalId`; los de bajada llevan
 *   además `instanceId` (una por ventana de caja) y `seq` creciente por
 *   instancia. La pantalla descarta lo que llegue fuera de orden, de otra
 *   terminal o de una instancia que no sea la activa (ver transport.ts).
 *
 * Este archivo es solo tipos y validadores: no toca red, BD ni DOM.
 */

/** Versión del protocolo. Se sube solo con cambios incompatibles. */
export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

// ---------------------------------------------------------------------------
// Proyección del carrito
// ---------------------------------------------------------------------------

export interface DisplayModifier {
  name: string;
  /**
   * Informativo: el extra YA está dentro de `DisplayLine.unitPrice`
   * (posService.addItem lo suma al precio base). La pantalla lo muestra
   * junto al nombre («+ 2.000») pero nunca lo suma otra vez.
   */
  extraPrice: number;
}

export interface DisplayLine {
  /** `CartItem.id`; si el carrito no lo trae, un id derivado estable (`linea:<product_id>:<índice>`). */
  id: string;
  name: string;
  qty: number;
  /** Precio unitario que ve el cliente: ya incluye el extra de los modificadores. */
  unitPrice: number;
  /**
   * qty × unitPrice, bruto: la suma de líneas cuadra con `subtotal`; el
   * descuento va en `discount` y en `discountTotal`, y el impuesto en
   * `taxTotal`. No es `total_line` del recibo (que es neto) ni `item.total`
   * del carrito (que calculateItemTaxes reescribe según el impuesto).
   */
  total: number;
  modifiers: DisplayModifier[];
  /** Descuento de la línea en importe; null si no hay. */
  discount: number | null;
  note: string | null;
}

/** Proyección del Cart: lo que la pantalla necesita, nada más. Sin `product` completo. */
export interface DisplayCart {
  id: string;
  currency: string;
  lines: DisplayLine[];
  subtotal: number;
  discountTotal: number;
  /** Motivo del descuento (cupón/promoción) si se conoce; null si no. */
  discountLabel: string | null;
  taxTotal: number;
  /** true → "IVA incluido"; false → impuesto sumado aparte, como en el recibo. */
  taxIncluded: boolean;
  total: number;
  /** Línea que acaba de cambiar, para el resaltado de 600 ms. */
  lastChangedLineId: string | null;
}

// ---------------------------------------------------------------------------
// Estado de cobro
// ---------------------------------------------------------------------------

export type DisplayPayment =
  | { method: 'cash'; total: number; received: number | null; change: number | null }
  | { method: 'card'; total: number; provider: string | null }
  | {
      method: 'qr';
      total: number;
      provider: string;
      qr: { kind: 'image' | 'text'; value: string } | null;
      expiresAt: number | null;
    };

export type DisplayMode = 'idle' | 'order' | 'payment' | 'tip' | 'thanks' | 'closed';

// ---------------------------------------------------------------------------
// Mensajes hacia arriba (pantalla → caja): intenciones, nunca hechos
// ---------------------------------------------------------------------------

export interface DisplayCapabilities {
  touch: boolean;
  width: number;
  height: number;
}

export type TipKind = 'percent' | 'amount' | 'none';
export type Rating = 1 | 2 | 3 | 4 | 5;

export interface UpEnvelope {
  v: ProtocolVersion;
  terminalId: string;
  /**
   * Instancia de caja a la que va dirigida la intención: la que la pantalla
   * sigue en ese momento. Ausente cuando aún no sigue a ninguna (pantalla
   * recién abierta que pide un need_snapshot) o cuando pide un need_snapshot
   * a una activa provisional (adoptada por latido, sin hello aún), y entonces
   * la atiende cualquier instancia de la terminal. Con dos pestañas de
   * /app/pos evita que la que no proyecta vea la propina elegida o responda
   * al need_snapshot.
   */
  toInstanceId?: string;
}

export type UpMessage =
  | (UpEnvelope & { t: 'need_snapshot'; capabilities: DisplayCapabilities })
  | (UpEnvelope & { t: 'tip_selected'; cartId: string; kind: TipKind; value: number })
  /** Solo avisa al cajero; no confirma ningún pago. */
  | (UpEnvelope & { t: 'qr_paid_claim'; cartId: string })
  | (UpEnvelope & { t: 'rating'; saleId: string | null; rating: Rating });

export type UpMessageType = UpMessage['t'];
export type TipSelectedMessage = Extract<UpMessage, { t: 'tip_selected' }>;

// ---------------------------------------------------------------------------
// Estado completo que ve la pantalla
// ---------------------------------------------------------------------------

export interface DisplayState {
  mode: DisplayMode;
  cart: DisplayCart | null;
  payment: DisplayPayment | null;
  tip: { presets: number[]; allowCustom: boolean; selected: TipSelectedMessage | null } | null;
  thanks: { total: number; askRating: boolean } | null;
}

// ---------------------------------------------------------------------------
// Mensajes hacia abajo (caja → pantalla)
// ---------------------------------------------------------------------------

export interface DownEnvelope {
  v: ProtocolVersion;
  /** Entero ≥ 0, creciente dentro de una misma instancia. */
  seq: number;
  terminalId: string;
  /**
   * Identidad de la ventana de caja que emite. Dos pestañas de /app/pos en el
   * mismo navegador comparten terminalId pero no instanceId; así la pantalla
   * sabe de cuál viene cada seq y no mezcla contadores.
   */
  instanceId: string;
}

export type DownMessage =
  | (DownEnvelope & { t: 'hello'; cashier: { name: string } | null; sessionOpen: boolean })
  | (DownEnvelope & { t: 'state'; state: DisplayState })
  | (DownEnvelope & { t: 'heartbeat'; at: number })
  | (DownEnvelope & { t: 'bye' });

export type DownMessageType = DownMessage['t'];

/** Omit que distribuye sobre cada miembro de una unión (Omit normal la colapsa). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Borrador de mensaje de bajada: lo que escribe el emisor. El transporte
 * añade `v`, `seq`, `terminalId` e `instanceId` (decisión: así ningún emisor
 * puede producir un seq fuera de orden ni hablar por otra terminal).
 */
export type DownMessageDraft = DistributiveOmit<DownMessage, keyof DownEnvelope>;

/** Borrador de mensaje de subida: la pantalla escribe esto; el transporte añade `v`, `terminalId` y `toInstanceId`. */
export type UpMessageDraft = DistributiveOmit<UpMessage, keyof UpEnvelope>;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

const DOWN_TYPES: ReadonlySet<string> = new Set<DownMessageType>(['hello', 'state', 'heartbeat', 'bye']);
const UP_TYPES: ReadonlySet<string> = new Set<UpMessageType>(['need_snapshot', 'tip_selected', 'qr_paid_claim', 'rating']);
const DISPLAY_MODES: ReadonlySet<string> = new Set<DisplayMode>(['idle', 'order', 'payment', 'tip', 'thanks', 'closed']);
const TIP_KINDS: ReadonlySet<string> = new Set<TipKind>(['percent', 'amount', 'none']);
const PAYMENT_METHODS: ReadonlySet<string> = new Set<DisplayPayment['method']>(['cash', 'card', 'qr']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Cabecera común: versión conocida y terminal identificada. */
function hasEnvelope(value: unknown): value is { v: ProtocolVersion; t: string; terminalId: string } & Record<string, unknown> {
  return isRecord(value) && value.v === PROTOCOL_VERSION && typeof value.t === 'string' && isNonEmptyString(value.terminalId);
}

/**
 * Valida la forma mínima de DisplayState que la pantalla necesita para no
 * romperse (PLAN §6.1: un JSON malformado degrada, nunca rompe la pantalla).
 * Es un guard de FORMA, no de contenido; la Parte C debe saber exactamente
 * de qué la protege y de qué no.
 *
 * Lo que SÍ garantiza:
 * - `mode` es uno de DisplayMode.
 * - `cart`, `payment`, `tip` y `thanks` están presentes, y cada uno es objeto o null.
 * - `cart !== null` ⇒ `cart.lines` es un array.
 * - `payment !== null` ⇒ `payment.method` es 'cash' | 'card' | 'qr'.
 * - `tip !== null` ⇒ `tip.presets` es un array (así `presets.map` nunca lanza).
 * - `thanks !== null` ⇒ `thanks.total` es un número finito.
 *
 * Lo que NO garantiza:
 * - El contenido de cada línea de `cart.lines` (id, name, qty, unitPrice…):
 *   eso lo produce projectCartForDisplay y aquí no se re-valida.
 * - Los demás campos de `cart` (subtotal, total, currency…), de `payment`
 *   (total, received, change, provider, qr…) ni de `tip` (allowCustom, selected).
 * - Los elementos de `tip.presets` (pueden no ser números).
 * - La coherencia mode ↔ bloques: `mode: 'order'` con `cart: null`, o
 *   `mode: 'thanks'` con `thanks: null`, pasan.
 * - Que `instanceId` o `terminalId` sean UUID: solo string no vacío.
 *
 * Instrucción para la Parte C: tratar cada bloque como opcional y, si el
 * bloque que el `mode` necesita no está o no tiene lo esencial, caer a Reposo.
 */
function isDisplayStateShape(value: unknown): value is DisplayState {
  if (!isRecord(value)) return false;
  if (typeof value.mode !== 'string' || !DISPLAY_MODES.has(value.mode)) return false;
  const blocks = ['cart', 'payment', 'tip', 'thanks'] as const;
  if (!blocks.every((key) => key in value && (value[key] === null || isRecord(value[key])))) return false;
  const cart = value.cart;
  if (cart !== null && !Array.isArray((cart as Record<string, unknown>).lines)) return false;
  const payment = value.payment;
  if (payment !== null) {
    const method = (payment as Record<string, unknown>).method;
    if (typeof method !== 'string' || !PAYMENT_METHODS.has(method)) return false;
  }
  const tip = value.tip;
  if (tip !== null && !Array.isArray((tip as Record<string, unknown>).presets)) return false;
  const thanks = value.thanks;
  if (thanks !== null && !isFiniteNumber((thanks as Record<string, unknown>).total)) return false;
  return true;
}

/**
 * ¿Es un mensaje de bajada (caja → pantalla) válido y de la versión actual?
 * Para `state`, valida solo la forma de DisplayState: ver isDisplayStateShape
 * para la lista exacta de lo que garantiza y lo que no.
 */
export function isDownMessage(value: unknown): value is DownMessage {
  if (!hasEnvelope(value) || !DOWN_TYPES.has(value.t)) return false;
  // Entero ≥ 0: un seq flotante o no finito es un emisor que no habla este protocolo.
  if (!isFiniteNumber(value.seq) || !Number.isInteger(value.seq) || value.seq < 0) return false;
  if (!isNonEmptyString(value.instanceId)) return false;

  switch (value.t as DownMessageType) {
    case 'hello':
      return (
        typeof value.sessionOpen === 'boolean' &&
        (value.cashier === null || (isRecord(value.cashier) && typeof value.cashier.name === 'string'))
      );
    case 'state':
      return isDisplayStateShape(value.state);
    case 'heartbeat':
      return isFiniteNumber(value.at);
    case 'bye':
      return true;
  }
}

/** ¿Es un mensaje de subida (pantalla → caja) válido y de la versión actual? */
export function isUpMessage(value: unknown): value is UpMessage {
  if (!hasEnvelope(value) || !UP_TYPES.has(value.t)) return false;
  // Destinatario opcional: ausente, o string no vacío. Un '' o un número es un emisor que no habla este protocolo.
  if (value.toInstanceId !== undefined && !isNonEmptyString(value.toInstanceId)) return false;

  switch (value.t as UpMessageType) {
    case 'need_snapshot': {
      const caps = value.capabilities;
      return (
        isRecord(caps) &&
        typeof caps.touch === 'boolean' &&
        isFiniteNumber(caps.width) &&
        isFiniteNumber(caps.height)
      );
    }
    case 'tip_selected':
      return (
        isNonEmptyString(value.cartId) &&
        typeof value.kind === 'string' &&
        TIP_KINDS.has(value.kind) &&
        isFiniteNumber(value.value) &&
        value.value >= 0
      );
    case 'qr_paid_claim':
      return isNonEmptyString(value.cartId);
    case 'rating':
      return (
        (value.saleId === null || isNonEmptyString(value.saleId)) &&
        isFiniteNumber(value.rating) &&
        Number.isInteger(value.rating) &&
        value.rating >= 1 &&
        value.rating <= 5
      );
  }
}
