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

/** Un par atributo/valor de `product.variant_data` (p. ej. Talla: M). */
export interface DisplayVariantAttribute {
  attr: string;
  value: string;
}

export interface DisplayLine {
  /** `CartItem.id`; si el carrito no lo trae, un id derivado estable (`linea:<product_id>:<índice>`). */
  id: string;
  /** `product.name` tal cual (en la BD una variante se llama «Padre - Variante N»). */
  name: string;
  /**
   * Pares de `product.variant_data` con valor no vacío, en el orden de la
   * BD, para pintarlos como badges igual que CartView y el recibo
   * («Camiseta» + Talla: M, Color: Azul). null si el producto no es variante.
   */
  variant: DisplayVariantAttribute[] | null;
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
  /**
   * `CartItem.tax_excluded`: el cajero pulsó «Excluir impuesto de este
   * producto» (CartView). El recibo y TaxSummary no cobran impuesto en esta
   * línea; la pantalla debe poder decirlo («sin IVA») y no sumarle nada.
   */
  taxExcluded: boolean;
  /**
   * `CartItem.tax_included`: el precio de ESTA línea ya lleva el impuesto.
   * Con carrito mixto (unas incluidas, otras no) `DisplayCart.taxIncluded`
   * no basta y la Parte C decide por línea.
   */
  taxIncluded: boolean;
}

/** Proyección del Cart: lo que la pantalla necesita, nada más. Sin `product` completo. */
export interface DisplayCart {
  id: string;
  currency: string;
  lines: DisplayLine[];
  /** Σ `line.total` (bruto, qty × unitPrice), siempre; nunca `cart.subtotal` ni un override. */
  subtotal: number;
  discountTotal: number;
  /** Motivo del descuento (cupón/promoción) si se conoce; null si no. */
  discountLabel: string | null;
  taxTotal: number;
  /**
   * true si ALGUNA línea lleva impuesto incluido (regla de
   * calculateCartTotals); con carrito mixto la Parte C debe mirar las líneas
   * (`DisplayLine.taxIncluded`).
   */
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
      /**
       * Importe que cobra ESTE código (Fase 2-C, ronda 3). En pago mixto el
       * QR se genera por lo pendiente (p. ej. 10.000 tras 15.000 en
       * efectivo) y el cliente debe ver ese importe junto al código, no
       * solo el total de la venta. AUSENTE = el total: el emisor omite la
       * clave cuando no hay importe propio (así la forma del cobro QR de
       * las fases anteriores no cambia y un emisor anterior sigue pasando
       * el guard). La pantalla lo sanea (logic.ts: solo un número finito
       * en (0, total] se conserva; el emisor aplica la misma regla en
       * payment.ts · isAmountWithinTotal) y solo lo pinta cuando difiere
       * del total.
       */
      amount?: number;
    };

export type DisplayMode = 'idle' | 'order' | 'payment' | 'tip' | 'thanks' | 'closed';

// ---------------------------------------------------------------------------
// Ajustes de presentación (Fase 2, PLAN §5.2 y §6.1)
// ---------------------------------------------------------------------------

/** Cómo debe tratar la pantalla su propia detección táctil (`navigator.maxTouchPoints`). */
export type DisplayTouchOverride = 'auto' | 'touch' | 'no-touch';

/**
 * Subconjunto de `pos_customer_display` (settings.ts) que la pantalla
 * necesita para decidir QUÉ pinta: presets de propina, calificación,
 * desglose de impuestos, nombre del cliente, idioma y forzado táctil. Viaja
 * en `hello.settings` (opcional y aditivo, Fase 2): como el `hello` siempre
 * precede al `state` (announce), la pantalla los conoce antes de pintar, y
 * al guardar la tarjeta la caja vuelve a saludar para que apliquen sin
 * recargar (PLAN §5.2). No viaja `enabled` (apagado = no hay hello) ni el
 * modo reposo (lo resuelve la pantalla con sus propios recursos en F4).
 *
 * La pantalla lo trata como PISTA: un emisor anterior no lo manda y entonces
 * la pantalla se comporta como en la Fase 0 (solo resumen). Cada campo es
 * opcional al validar (isDownMessage solo exige que sea un objeto): la
 * pantalla degrada campo a campo a los valores por defecto de PLAN §6.1.
 */
export interface DisplayPresentationSettings {
  tips: { enabled: boolean; presets: number[]; allowCustom: boolean };
  rating: { enabled: boolean };
  showTaxBreakdown: boolean;
  showCustomerName: boolean;
  /** BCP 47 (p. ej. "es-CO"); null = el de la organización. */
  locale: string | null;
  touch: DisplayTouchOverride;
}

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
  | (UpEnvelope & { t: 'rating'; saleId: string | null; rating: Rating })
  /**
   * Presencia de la pantalla (PLAN §5.1: «punto verde: pantalla conectada /
   * gris: sin pantalla»). La pantalla lo emite cada HEARTBEAT_INTERVAL_MS
   * mientras está abierta; la caja pinta verde si el último `display_alive`
   * (o `need_snapshot`) tiene menos de STALE_AFTER_MS. No es una intención:
   * la caja no responde nada. Va a TODAS las instancias de la terminal (sin
   * `toInstanceId`): la pantalla existe para la caja física, no para una
   * pestaña concreta.
   */
  | (UpEnvelope & { t: 'display_alive'; at: number; capabilities: DisplayCapabilities })
  /** La pantalla se cierra a propósito: la caja pone el indicador en gris sin esperar el silencio. */
  | (UpEnvelope & { t: 'display_bye' });

export type UpMessageType = UpMessage['t'];
export type TipSelectedMessage = Extract<UpMessage, { t: 'tip_selected' }>;
/** Mensajes de subida que hablan de presencia, no de intención: nunca van dirigidos a una instancia. */
export const UP_PRESENCE_TYPES: ReadonlySet<UpMessageType> = new Set<UpMessageType>(['display_alive', 'display_bye']);

// ---------------------------------------------------------------------------
// Estado completo que ve la pantalla
// ---------------------------------------------------------------------------

export interface DisplayState {
  mode: DisplayMode;
  cart: DisplayCart | null;
  payment: DisplayPayment | null;
  /**
   * Propina (Fase 2-B, PLAN §4.2). `base` (aditivo, opcional): importe sobre
   * el que la pantalla calcula los porcentajes en vivo (el total con
   * impuestos antes de propina y domicilio, el mismo que usa el modal de
   * cobro). Sin `base` la pantalla usa `cart.total`. `selected`: reservado
   * del borrador del PLAN; el emisor actual cierra la fase al recibir la
   * elección (el estado pasa a `payment` sin bloque `tip`), así que viaja
   * null mientras se pregunta.
   */
  tip: { presets: number[]; allowCustom: boolean; selected: TipSelectedMessage | null; base?: number } | null;
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
  | (DownEnvelope & {
      t: 'hello';
      /**
       * Organización de la caja que habla. La pantalla comprueba que la marca
       * que pinta (logo, colores) es la de esta organización y no la de otra
       * sesión que compartió el mismo `pos_terminal_id` (la clave de
       * localStorage no va por organización: ver terminal.ts).
       */
      organizationId: number;
      cashier: { name: string } | null;
      sessionOpen: boolean;
      /**
       * Moneda de la caja (ISO 4217, la misma que `cart.currency`). Opcional y
       * aditivo (ronda 4): `thanks` y `payment` no llevan carrito, y una
       * pantalla recién abierta durante «Gracias» no tiene ninguno previo del
       * que recordarla; como el `hello` siempre precede al `state`
       * (announce), la pantalla la conoce antes de pintar cualquier importe
       * (PLAN §4.1.3 «nunca miente»). isDownMessage no la exige: un emisor
       * anterior sin este campo sigue siendo válido.
       */
      currency?: string;
      /**
       * Ajustes de presentación de la organización (Fase 2). Opcional y
       * aditivo: un emisor de la Fase 0 no lo manda y la pantalla se queda
       * en «solo resumen». isDownMessage solo exige que, si viene, sea un
       * objeto; el contenido lo sanea la pantalla campo a campo.
       */
      settings?: DisplayPresentationSettings;
      /**
       * ¿La ventana de la caja que saluda está VISIBLE? (Fase 2-B, deuda
       * del QA de F2-A.) Con dos pestañas de /app/pos y la misma terminal,
       * la pantalla debe seguir a la que el cajero tiene delante: en la
       * ventana de elección del receptor (transport.ts · isBetterHello) un
       * hello con `visible: true` releva a uno con `visible: false` antes de
       * mirar `sessionOpen` y `seq`. Opcional y aditivo: un emisor anterior
       * no lo manda y entonces se compara como antes.
       */
      visible?: boolean;
    })
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
const UP_TYPES: ReadonlySet<string> = new Set<UpMessageType>([
  'need_snapshot',
  'tip_selected',
  'qr_paid_claim',
  'rating',
  'display_alive',
  'display_bye',
]);
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

/** Id de organización tal como lo guarda la BD: entero positivo. */
function isOrganizationId(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function isCapabilities(value: unknown): value is DisplayCapabilities {
  return isRecord(value) && typeof value.touch === 'boolean' && isFiniteNumber(value.width) && isFiniteNumber(value.height);
}

/** Cabecera común: versión conocida y terminal identificada. */
function hasEnvelope(value: unknown): value is { v: ProtocolVersion; t: string; terminalId: string } & Record<string, unknown> {
  return isRecord(value) && value.v === PROTOCOL_VERSION && typeof value.t === 'string' && isNonEmptyString(value.terminalId);
}

/**
 * Versión declarada en un sobre (`v`), sin validar nada más. null si no hay
 * sobre o `v` no es un número finito. Sirve para distinguir «otra versión del
 * protocolo» (una caja actualizada hablando con una pantalla vieja, o al
 * revés) de «basura»: el receptor cuenta lo primero en `incompatibleVersionAt`
 * para que la pantalla pueda decir «Actualice la pantalla» (PLAN §8).
 */
export function readEnvelopeVersion(value: unknown): number | null {
  if (!isRecord(value)) return null;
  return isFiniteNumber(value.v) ? value.v : null;
}

/** ¿Es un sobre de esta terminal con una versión del protocolo distinta de la actual? */
export function isIncompatibleEnvelope(value: unknown, terminalId: string): boolean {
  if (!isRecord(value) || value.terminalId !== terminalId) return false;
  const version = readEnvelopeVersion(value);
  return version !== null && version !== PROTOCOL_VERSION;
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
 *   (total, received, change, provider, qr, amount…) ni de `tip`
 *   (allowCustom, selected). Un `payment.amount` ausente (emisor anterior a
 *   la ronda 3 de F2-C) o no numérico pasa: la pantalla lo sanea a null.
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
        isOrganizationId(value.organizationId) &&
        typeof value.sessionOpen === 'boolean' &&
        (value.cashier === null || (isRecord(value.cashier) && typeof value.cashier.name === 'string')) &&
        // Fase 2: ajustes opcionales; si vienen, un objeto (el contenido lo sanea la pantalla).
        (value.settings === undefined || isRecord(value.settings)) &&
        // Fase 2-B: visibilidad opcional; si viene, booleano.
        (value.visible === undefined || typeof value.visible === 'boolean')
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
    case 'need_snapshot':
      return isCapabilities(value.capabilities);
    case 'display_alive':
      return isFiniteNumber(value.at) && isCapabilities(value.capabilities);
    case 'display_bye':
      return true;
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
