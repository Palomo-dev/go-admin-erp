/**
 * Del método de pago del POS (`payment_methods.code`) al estado de cobro que
 * ve el cliente (PLAN §4.2, «Cobro»). Pura, sin React: CheckoutDialog la
 * llama en cada tecla y las pruebas la ejercitan en Node.
 *
 * Tres estados en pantalla, muchos códigos en la BD:
 * - `cash`  → efectivo: total, recibido y cambio en grande.
 * - `card`  → «Siga las instrucciones del datáfono»: `card`, `bold_card` y,
 *              por defecto, cualquier código que no sea efectivo ni QR
 *              (`wompi`, `bold_link`, `credit`…): el cliente ve el total y
 *              el nombre del medio; nunca un QR roto ni un estado inventado.
 * - `qr`    → el QR a pantalla completa con el nombre del medio: `nequi`,
 *              `daviplata`, `transfer`, `qr` y todo código terminado en `_qr`
 *              (`breb_qr`, `bold_qr`, `bancolombia_qr`, `bancolombia_qr_wompi`,
 *              `redeban_qr`…). En Fase 0 `qr` va en null: la imagen llega en F2.
 */

import type { DisplayPayment } from './protocol';

/** Códigos que se cobran con QR aunque no terminen en `_qr`. */
const QR_CODES: ReadonlySet<string> = new Set(['nequi', 'daviplata', 'transfer', 'qr']);

export function isQrPaymentCode(code: string): boolean {
  const normalized = code.trim().toLowerCase();
  return QR_CODES.has(normalized) || normalized.endsWith('_qr') || normalized.includes('_qr_');
}

export interface DisplayPaymentInput {
  /** `payment_methods.code` del medio elegido en la caja. */
  methodCode: string;
  /** Nombre legible del medio (`payment_methods.name`); null si no se conoce. */
  methodName: string | null;
  /** Lo que el cliente paga: total con propina y domicilio. */
  total: number;
  /** Efectivo: importe tecleado hasta ahora; null si aún no hay nada. */
  received?: number | null;
  /** Efectivo: cambio calculado por la caja; null si aún no hay recibido. */
  change?: number | null;
  /**
   * QR (Fase 2): el código ya resuelto con `resolveDisplayQr`. Solo se usa
   * con un método QR; en el resto se ignora. Ausente o null → la pantalla
   * muestra «Pago con QR: siga las instrucciones del cajero» (PLAN §3.5).
   */
  qr?: DisplayQr | null;
  /** QR (Fase 2): vencimiento en ms de época; null si el proveedor no lo da. */
  expiresAt?: number | null;
  /**
   * QR (Fase 2-C, ronda 3): importe que cobra ESTE código. En pago mixto
   * CheckoutDialog genera el QR por el importe de la PROPIA entrada QR
   * (p. ej. 10.000 tras 15.000 en efectivo), no por el total; el cliente
   * debe ver ambos. Ausente o null = el total (la clave no viaja). Solo
   * viaja si está en (0, total]: fuera de rango la pantalla mostraría
   * «Este pago -$5» o un importe mayor que el total (ronda 4, C3).
   */
  amount?: number | null;
}

/** El código que viaja a la pantalla: una imagen (URL o data URL) o el texto EMVCo que la pantalla convierte en QR. */
export type DisplayQr = NonNullable<Extract<DisplayPayment, { method: 'qr' }>['qr']>;

export interface ResolveDisplayQrInput {
  /** `qrImageUrl` del modal de cobro: URL http(s) o data URL de la imagen. */
  imageUrl?: string | null;
  /** `qrData` del modal: string EMVCo, data URL o URL de redirección. */
  data?: string | null;
  /** `expires_at` de `payment_qr_sessions` (ISO 8601), o ya en ms de época. */
  expiresAt?: string | number | null;
  /** Reloj; por defecto Date.now(). Inyectable en pruebas. */
  now?: number;
}

export interface ResolvedDisplayQr {
  qr: DisplayQr | null;
  expiresAt: number | null;
}

/** ¿Parece una imagen que un `<img>` puede pintar? (data URL de imagen, http(s) o blob). */
export function isImageSource(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return /^data:image\//i.test(v) || /^https?:\/\/\S+$/i.test(v) || /^blob:/i.test(v);
}

/**
 * ¿La imagen necesita red para pintarse? Una URL http(s) sí; una data URL o
 * un blob no. La usan el emisor (`resolveDisplayQr`: con texto disponible
 * prefiere lo que la pantalla pueda generar sin red) y la pantalla
 * (`resolveQrPresentation` en logic.ts la reexporta): una sola regla.
 */
export function qrImageNeedsNetwork(value: string): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * Longitud máxima del TEXTO que la pantalla convierte en QR con qrcode.react.
 * Un QR versión 40 con corrección M admite 2 331 bytes en modo byte; por
 * encima, `QRCodeSVG` lanza «Data too long» DURANTE el render y tumba el árbol
 * de la pantalla. Se corta en 2 000 caracteres (margen para UTF-8 multibyte):
 * un EMVCo real mide 200-400. Lo que supere el límite y no sea una imagen no
 * viaja (`qr: null`) y, si llegara igual, la pantalla lo degrada a «siga las
 * instrucciones del cajero» (logic.ts). PLAN §3.5: nunca un código roto.
 */
export const QR_TEXT_MAX_CHARS = 2000;

/**
 * ¿El texto cabe en un QR? Se mide en caracteres Y en bytes UTF-8 (el modo
 * byte codifica en UTF-8: «ñ» ocupa 2, un emoji 4), contra el mismo límite.
 * Pura; un valor que no es string no cabe.
 */
export function qrTextFits(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > QR_TEXT_MAX_CHARS) return false;
  let bytes = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes > QR_TEXT_MAX_CHARS) return false;
  }
  return true;
}

/**
 * Prefijos en base64 de los formatos de imagen que devuelven los proveedores
 * SIN `data:` delante (Wompi manda `qr_image` como base64 crudo de un SVG;
 * Redeban, `qr_image_base64`). Los 4-6 primeros caracteres del base64 son
 * los «magic bytes» del formato: `<svg`, `\x89PNG`, `\xFF\xD8\xFF`, `GIF8`.
 */
const RAW_BASE64_IMAGE_PREFIXES: ReadonlyArray<readonly [prefix: string, mime: string]> = [
  ['PHN2Zy', 'image/svg+xml'],
  ['iVBORw0', 'image/png'],
  ['/9j/', 'image/jpeg'],
  ['R0lGOD', 'image/gif'],
];

const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;
/** base64url (RFC 4648 §5): `-` y `_` en vez de `+` y `/`, normalmente sin `=`. Solo si trae al menos un carácter propio. */
const BASE64URL_BODY = /^(?=[^+/]*[-_])[A-Za-z0-9_-]+={0,2}$/;

/** ¿Empieza como el base64 de una imagen (SVG/PNG/JPEG/GIF) aunque el cuerpo no sea válido? */
function startsLikeRawBase64Image(compact: string): boolean {
  return RAW_BASE64_IMAGE_PREFIXES.some(([prefix]) => compact.startsWith(prefix));
}

/** base64url → base64 estándar con relleno `=`; un `<img>` solo decodifica el alfabeto estándar. */
function base64UrlToStandard(body: string): string {
  const std = body.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (std.length % 4)) % 4;
  return std + '='.repeat(pad);
}

/**
 * ¿Es un valor que empieza como el base64 de una imagen pero cuyo cuerpo no
 * es base64 válido (ni estándar ni url)? Un proveedor que devuelva eso no
 * manda ni imagen ni texto EMVCo: si viajara como texto, la pantalla
 * generaría un QR escaneable pero ilegible. `resolveDisplayQr` lo descarta.
 */
export function isBrokenRawBase64Image(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const compact = value.trim().replace(/\s+/g, '');
  if (compact.length === 0 || !startsLikeRawBase64Image(compact)) return false;
  return !BASE64_BODY.test(compact) && !BASE64URL_BODY.test(compact);
}

/**
 * Normaliza lo que un proveedor devuelve como «imagen del QR» a algo que un
 * `<img>` pinta sin red: una data URL de imagen o un blob se devuelven tal
 * cual; un base64 crudo de SVG/PNG/JPEG/GIF se prefija con
 * `data:<mime>;base64,`. Un base64url (`-`/`_`, RFC 4648 §5) con esos
 * prefijos se convierte antes a base64 estándar con relleno: el alfabeto de
 * las data URL es el estándar, y sin convertirlo viajaría como texto y la
 * pantalla generaría un QR ilegible. Una URL http(s), un EMVCo o cualquier
 * otro texto → null (no es una imagen embebida). Pura; nunca lanza.
 */
export function normalizeQrImageSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length === 0) return null;
  if (/^data:image\//i.test(v) || /^blob:/i.test(v)) return v;
  const compact = v.replace(/\s+/g, '');
  for (const [prefix, mime] of RAW_BASE64_IMAGE_PREFIXES) {
    if (!compact.startsWith(prefix)) continue;
    if (BASE64_BODY.test(compact)) return `data:${mime};base64,${compact}`;
    if (BASE64URL_BODY.test(compact)) return `data:${mime};base64,${base64UrlToStandard(compact)}`;
  }
  return null;
}

/** Lo que el modal de cobro guarda en `qrData` / `qrImageUrl` a partir de la respuesta del proveedor. */
export interface PickedProviderQr {
  /** Texto o URL que, sin imagen, la pantalla convierte en QR (o el modal muestra en crudo). */
  data: string | undefined;
  /** Imagen pintable (URL o data URL); undefined si el proveedor no la da. */
  imageUrl: string | undefined;
}

/**
 * Del objeto `qr` que devuelve cada route de `/api/integrations/*\/create-qr`
 * a `qrData` / `qrImageUrl` del modal de cobro. Un solo sitio para que la
 * caja y la pantalla no diverjan. Qué campo trae cada proveedor:
 * - Bre-B (Mono, `breb_qr`): `qr` = texto EMVCo; `qr_image` = imagen opcional.
 * - Redeban (`redeban_qr`): `qr_string` = texto EMVCo; `qr_image_base64` =
 *   PNG en base64 CRUDO (se prefija aquí).
 * - Bancolombia QR vía Wompi (`bancolombia_qr_wompi`): `qr_image` = SVG del
 *   QR (el route ya lo entrega como data URL; si llegara crudo se prefija).
 * - Bancolombia directo (`bancolombia_qr`): solo `redirectURL` (URL http(s));
 *   viaja como texto y la pantalla genera el QR con ella.
 * - Bold (`bold_qr`, `bold_link`): no devuelven objeto `qr` → sin código.
 * Pura y tolerante: `qr` ausente o de otra forma → ambos undefined.
 */
export function pickQrFromProviderResponse(qr: unknown): PickedProviderQr {
  const source = qr && typeof qr === 'object' ? (qr as Record<string, unknown>) : {};
  const str = (key: string): string | undefined => {
    const v = source[key];
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
  };
  const rawImage = str('qr_image') ?? str('qr_image_base64');
  // Embebida (data URL / base64 crudo) o remota (http(s)): ambas las pinta un <img>.
  const image = normalizeQrImageSource(rawImage) ?? (isImageSource(rawImage) ? rawImage : undefined);
  const text = str('qr') ?? str('qr_string') ?? str('redirectURL');
  return { data: text ?? image, imageUrl: image };
}

/** ISO 8601 o ms de época → ms de época; null si no es una fecha válida. */
export function parseExpiresAt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Del QR que ya generó el POS (`qrImageUrl` / `qrData` de CheckoutDialog) al
 * bloque `qr` del protocolo. Pura; nunca lanza.
 * - Imagen si `imageUrl` es una fuente pintable (URL http(s), data URL, blob
 *   o base64 crudo de imagen, que se prefija), o si `data` es una imagen
 *   EMBEBIDA (data URL / base64 crudo). Una URL http(s) en `data` NO es
 *   imagen: Bancolombia directo manda ahí su `redirectURL`, y un <img> con
 *   ella falla; viaja como texto y la pantalla genera un QR escaneable.
 * - Excepción (ronda 5, QA-5): si la imagen NECESITA RED (URL http(s)) y
 *   además hay un texto válido DISTINTO de esa imagen (Bre-B manda `qr`
 *   EMVCo + `qr_image` remota; Bancolombia, una `redirectURL`), viaja el
 *   TEXTO: la pantalla genera el QR en local con qrcode.react y no depende
 *   de la red ni de que el <img> cargue. Solo viaja una forma (`qr.kind`), y
 *   con imagen remota + texto la que nunca falla es el texto. La imagen se
 *   mantiene cuando es embebida (data URL / blob / base64 crudo) o cuando no
 *   hay texto.
 * - Ronda 6 (HALLAZGO Q): el texto solo desplaza a la imagen remota si NO ES
 *   la propia imagen. `pickQrFromProviderResponse` rellena `data` con la URL
 *   de la imagen cuando el proveedor no manda texto (`data: text ?? image`);
 *   con solo `qr_image` http, en la ronda 5 viajaba `{kind:'text', value:
 *   'https://…/qr.png'}` y la pantalla generaba un QR escaneable que abría un
 *   PNG y no pagaba nada (PLAN §3.5 «nunca un código roto»). Se compara el
 *   texto con la imagen resuelta y con `imageUrl` tal cual llegó.
 * - Ronda 6 (QA · bajo): una imagen EMBEBIDA en `data` (data URL / blob /
 *   base64 crudo) gana sobre una `imageUrl` que necesita red: la preferencia
 *   «sin red» de QA-5 vale igual para imágenes, no solo para el texto.
 * - Si no, el texto de `data` para que la pantalla lo convierta en QR
 *   (qrcode.react), solo si cabe en un QR (`QR_TEXT_MAX_CHARS`); un texto
 *   más largo no viaja: la pantalla mostraría un error, no un código. Tampoco
 *   viaja un base64 de imagen roto (`isBrokenRawBase64Image`).
 * - Un vencimiento que ya pasó deja `qr: null`: la pantalla no pinta un
 *   código que ya no sirve (PLAN §3.5 «nunca un código roto»); `expiresAt`
 *   se conserva para que la pantalla sepa que venció y no que falta.
 * - Sin imagen ni texto → `qr: null` y la pantalla muestra las instrucciones.
 */
export function resolveDisplayQr(input: ResolveDisplayQrInput): ResolvedDisplayQr {
  const now = typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : Date.now();
  const expiresAt = parseExpiresAt(input.expiresAt);
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';
  // Orden: imagen embebida en `imageUrl` → imagen embebida en `data` → URL
  // remota de `imageUrl`. Lo embebido se pinta sin red; lo remoto, no.
  const image =
    normalizeQrImageSource(imageUrl) ??
    normalizeQrImageSource(input.data) ??
    (isImageSource(imageUrl) ? imageUrl : null);
  const rawText = typeof input.data === 'string' ? input.data.trim() : '';
  // Un «base64 de imagen» roto (prefijo de SVG/PNG/JPEG/GIF con cuerpo
  // inválido) no es texto EMVCo: como texto daría un QR ilegible. No viaja.
  const text = qrTextFits(rawText) && !isBrokenRawBase64Image(rawText) ? rawText : null;
  // El texto que es la PROPIA imagen (la URL del PNG que `pickQrFromProviderResponse`
  // copia en `data` cuando no hay texto) no es un código: no viaja como texto.
  const textIsTheImage = text !== null && (text === image || (imageUrl.length > 0 && text === imageUrl));

  // Con imagen remota Y un texto distinto de ella, viaja el texto: la pantalla
  // lo convierte en QR sin red (QA-5, ronda 5; acotado en la ronda 6, Q).
  let qr: DisplayQr | null = null;
  if (text !== null && !textIsTheImage && (image === null || qrImageNeedsNetwork(image))) {
    qr = { kind: 'text', value: text };
  } else if (image !== null) {
    qr = { kind: 'image', value: image };
  }

  if (expiresAt !== null && expiresAt <= now) qr = null;
  return { qr, expiresAt };
}

/**
 * ¿`amount` es un importe parcial válido para un cobro QR? Debe ser un número
 * finito en (0, total]: un importe negativo, cero o mayor que el total no
 * describe «lo que cobra este código» y la pantalla pintaría «Este pago -$5»
 * o «Este pago $30.000» sobre «Total $25.000» (ronda 4 de F2-C, C3). Lo
 * usan el emisor (`toDisplayPayment`) y el saneado de la pantalla
 * (`sanitizeDisplayPayment` en logic.ts): misma regla en los dos extremos.
 * Con `total` no finito o ≤ 0 nada cabe en el rango. Pura; nunca lanza.
 */
export function isAmountWithinTotal(amount: unknown, total: unknown): amount is number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return false;
  if (typeof total !== 'number' || !Number.isFinite(total)) return false;
  return amount > 0 && amount <= total;
}

/**
 * Importe por el que la caja genera un QR (F2-C, ronda 4 · C2; acotado en la
 * ronda 5 · QA-1). El modal de cobro pre-rellena cada entrada con lo
 * pendiente («Agregar pago» con el resto), así que un `remaining` global YA
 * descontaría la propia entrada QR; por eso se recibe `othersTotal` = Σ de
 * las OTRAS entradas (excluida aquella desde la que se pulsó «Generar QR»).
 * Regla, con `pendiente = max(0, total − othersTotal)`:
 * 1. `min(entryAmount, pendiente)` si `entryAmount` es un número finito > 0
 *    y el resultado sigue siendo > 0: el QR nunca sale por más del total ni
 *    por más de lo que falta tras las otras entradas (30.000 sobre 25.000 →
 *    25.000; efectivo 15.000 + entrada 20.000 sobre 25.000 → 10.000). Antes
 *    de esta ronda la entrada viajaba tal cual y el proveedor generaba un
 *    cobro REAL mayor que la venta mientras la pantalla, al descartar el
 *    importe fuera de rango (C3), no lo mostraba (PLAN §4.1 «nunca miente»).
 * 2. si no, lo pendiente, si es > 0;
 * 3. si no, el total. Desde la ronda 6 (HALLAZGO R) la caja NO llega aquí
 *    con pendiente 0: `handleQrPayment` corta antes del fetch («No hay saldo
 *    pendiente para cobrar con QR») y el botón se deshabilita cuando las
 *    otras entradas cubren el total. La regla queda como último recurso de
 *    la función pura, nunca como un cobro real sobre una venta cubierta.
 * El resultado queda siempre en (0, total] (salvo total 0) y es el mismo
 * importe que viaja a la pantalla (`amount`), el del modal y el de la entrada
 * que confirma onPaid. Pura; nunca lanza; `othersTotal` no numérico o
 * negativo cuenta como 0.
 */
export function resolveQrChargeAmount(input: { entryAmount?: number | null; othersTotal?: number | null; total: number }): number {
  const total = toAmount(input.total);
  const pending = Math.max(0, total - Math.max(0, toAmount(input.othersTotal)));
  const entry = input.entryAmount;
  if (typeof entry === 'number' && Number.isFinite(entry) && entry > 0) {
    const bounded = Math.min(entry, pending);
    if (Number.isFinite(bounded) && bounded > 0) return bounded;
  }
  return pending > 0 ? pending : total;
}

function toAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableAmount(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = toAmount(value);
  return Number.isFinite(n) ? n : null;
}

/** Lo mínimo de una entrada de pago del modal de cobro que necesita `resolveCashReceived`. */
export interface CashReceivedEntry {
  /** Id de la entrada en el modal (`PaymentEntry.id`); con él se sabe si el cajero tecleó ESE importe. */
  id: string;
  method: string;
  amount: number;
}

function isCashEntry(entry: CashReceivedEntry | null | undefined): entry is CashReceivedEntry {
  return !!entry && typeof entry.method === 'string' && entry.method.trim().toLowerCase() === 'cash';
}

/**
 * Efectivo «recibido» que ve el cliente (PLAN §4.2: recibido y cambio en vivo
 * MIENTRAS EL CAJERO TECLEA). CheckoutDialog pre-rellena cada entrada nueva
 * con el importe pendiente (la primera con el total; «Agregar pago» con el
 * resto), así que sin esta función la pantalla mostraría «Recibido: $TOTAL ·
 * Cambio: $0» antes de que el cliente entregue nada. Por eso el «tocado» es
 * POR ENTRADA (`touchedIds`: ids cuyo importe editó el cajero), no global:
 * con pago mixto, teclear la tarjeta no convierte en «recibido» un efectivo
 * pre-rellenado que nadie ha entregado.
 * - Ninguna entrada en efectivo tocada → null: la pantalla muestra solo el
 *   total (y el cambio viaja null).
 * - Si no → la suma de las entradas en efectivo tocadas, solo de esas: con
 *   efectivo 15.000 tecleado + tarjeta 10.000 el recibido es 15.000.
 * Pura y tolerante: importes no numéricos cuentan como 0.
 */
export function resolveCashReceived(payments: ReadonlyArray<CashReceivedEntry>, touchedIds: ReadonlySet<string>): number | null {
  if (!Array.isArray(payments) || !touchedIds || typeof touchedIds.has !== 'function') return null;
  const touchedCash = payments.filter((entry) => isCashEntry(entry) && typeof entry.id === 'string' && touchedIds.has(entry.id));
  if (touchedCash.length === 0) return null;
  return touchedCash.reduce((sum, entry) => sum + toAmount(entry.amount), 0);
}

/** Lo que devuelve `confirmQrPaymentEntry`: la lista nueva y el id de la entrada confirmada, que SIEMPRE está en esa lista. */
export interface ConfirmedQrPaymentEntry<T extends CashReceivedEntry> {
  payments: T[];
  confirmedId: string;
}

/**
 * Confirmación del pago QR en la lista de entradas del modal de cobro
 * (onPaid de QrPaymentDialog). Una sola decisión para dos estados: la lista
 * de pagos y el id que se marca «tocado» (intocable para el aviso de
 * propina, ronda 6 · P). Antes CheckoutDialog decidía la lista con el `prev`
 * del updater y el id con el `payments` de la clausura del efecto que abrió
 * el diálogo; si divergían (el cajero quita la entrada QR con el poller
 * vivo) se marcaba un id que ya no existía y la de respaldo quedaba sin
 * marcar (ronda 7, QA-2). Aquí la fuente es UNA: `payments`.
 * - Si `qrEntryId` está en la lista: esa entrada pasa a `method` (si viene)
 *   y `amount`, y es la confirmada.
 * - Si no (el cajero la quitó, o nunca hubo id): se añade `fallback` al
 *   final y es la confirmada.
 * Pura: no muta `payments` ni sus entradas; `confirmedId` está siempre en
 * `payments` del resultado. `method` vacío conserva el de la entrada.
 */
export function confirmQrPaymentEntry<T extends CashReceivedEntry>(input: {
  payments: ReadonlyArray<T>;
  qrEntryId: string | undefined | null;
  method: string;
  amount: number;
  fallback: T;
}): ConfirmedQrPaymentEntry<T> {
  const list = Array.isArray(input.payments) ? input.payments : [];
  const id = typeof input.qrEntryId === 'string' && input.qrEntryId.length > 0 ? input.qrEntryId : null;
  const method = typeof input.method === 'string' && input.method.trim().length > 0 ? input.method : null;
  if (id !== null && list.some((p) => p.id === id)) {
    return {
      payments: list.map((p) => (p.id === id ? { ...p, method: method ?? p.method, amount: input.amount } : p)),
      confirmedId: id,
    };
  }
  return { payments: [...list, input.fallback], confirmedId: input.fallback.id };
}

/** Estado de cobro para la pantalla según el método. Nunca lanza. */
export function toDisplayPayment(input: DisplayPaymentInput): DisplayPayment {
  const code = typeof input.methodCode === 'string' ? input.methodCode.trim().toLowerCase() : '';
  const total = toAmount(input.total);
  const name = typeof input.methodName === 'string' && input.methodName.trim().length > 0 ? input.methodName.trim() : null;

  if (code === 'cash') {
    const received = toNullableAmount(input.received);
    return {
      method: 'cash',
      total,
      received,
      change: received === null ? null : toNullableAmount(input.change),
    };
  }

  if (isQrPaymentCode(code)) {
    // Fase 2: el código llega ya resuelto (resolveDisplayQr). Se revalida la
    // forma aquí para que un objeto raro nunca viaje: la pantalla degradaría
    // igual, pero el emisor tampoco debe mandar basura.
    const rawQr = input.qr;
    const qr =
      rawQr && (rawQr.kind === 'image' || rawQr.kind === 'text') && typeof rawQr.value === 'string' && rawQr.value.length > 0
        ? { kind: rawQr.kind, value: rawQr.value }
        : null;
    // Vencimiento: solo un número finito viaja. NaN/Infinity NO pasan por
    // toAmount (daría 0 = «vencido en 1970» y la pantalla diría «venció» con
    // el código vivo): sin vencimiento válido no hay cuenta atrás.
    const expiresAt = typeof input.expiresAt === 'number' && Number.isFinite(input.expiresAt) ? input.expiresAt : null;
    // Importe de ESTE código (pago mixto): solo un número finito viaja; lo
    // demás (ausente, null, NaN, string) no viaja = «el total». No pasa por
    // toAmount: NaN daría 0 y la pantalla diría «Este pago $0». La clave se
    // omite (no `amount: null`) para no cambiar la forma de las fases previas.
    const payment: DisplayPayment = { method: 'qr', total, provider: name ?? code, qr, expiresAt };
    if (isAmountWithinTotal(input.amount, total)) payment.amount = input.amount;
    return payment;
  }

  // Tarjeta y datáfono (`card`, `bold_card`) y cualquier otro medio sin
  // estado propio en pantalla: el cliente ve el total y el nombre del medio.
  return { method: 'card', total, provider: code === 'card' ? null : name ?? code };
}
