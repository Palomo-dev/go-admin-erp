/**
 * Emisor único de la caja hacia la pantalla del cliente (PLAN §3.1, §8, §12
 * Fase 0). Mantiene el DisplayState actual y lo publica por el transporte de
 * forma COALESCIDA: varias mutaciones en la misma vuelta de eventos (teclear
 * cantidad «12», guardar el carrito y recalcular impuestos) producen UN solo
 * mensaje `state`.
 *
 * Reglas que definen el diseño:
 * - La caja es la única fuente de verdad: aquí no se calcula ningún importe.
 *   El carrito llega tal cual lo guarda posService y se proyecta con
 *   projectCartForDisplay; los totales del recibo llegan como override
 *   (`setTotals`) desde el mismo motor que ve el cajero (TaxSummary).
 * - Interruptor maestro (`pos_customer_display.enabled`): apagado = no se
 *   abre el transporte y no se emite NADA, ni siquiera la respuesta a un
 *   `need_snapshot`. `refresh()` relee el interruptor (la Parte D lo llama
 *   tras guardar) y abre o cierra el transporte en consecuencia. Además
 *   (ronda 4, opción A) CADA publicación (`flush` y `announce`) vuelve a
 *   consultar `isEnabled()` antes de escribir en el transporte: si la caché
 *   de settings.ts pasó a apagado sin que nadie llamara a `refresh()`
 *   (`clearCustomerDisplaySettingsCache` al cerrar sesión, una ruta futura
 *   que escriba la caché sin avisar), la caja no publica, cierra el
 *   transporte y la pantalla pasa a «Conectando» → «Reposo». La lectura es
 *   síncrona y de memoria: cuesta lo mismo que una comparación.
 * - Nada lanza hacia el flujo de venta (PLAN §5.5): cada punto de entrada
 *   está envuelto y un fallo se registra con console.warn.
 * - Sin React ni DOM: se prueba en Node con un transporte falso. La
 *   planificación es `requestAnimationFrame` con respaldo de `setTimeout`
 *   (Chrome pausa rAF en pestañas ocultas y ventanas ocluidas) y
 *   `setTimeout(0)` sin rAF; se puede inyectar para las pruebas.
 * - Un carrito que desaparece de `pos_carts_<org>` (se cobró o se descartó)
 *   deja de proyectarse en el acto: al vencer «Gracias» la pantalla pasa a
 *   «Reposo», nunca vuelve a mostrar la venta ya cobrada (PLAN §4.1 «Nunca
 *   miente»).
 *
 * Modo resultante (derivado en cada emisión, en este orden):
 *   closed (setMode('closed'))  >  thanks  >  payment QR con código  >  tip (fase pendiente)  >  payment  >  order (≥ 1 línea)  >  idle
 *
 * Máquina de estados de la venta (Fase 2-B, PLAN §4.2 y §5.3):
 *   order ──setPayment(≠ null)──▶ tip (solo si tips.enabled y hay líneas)
 *   order ──setPayment(≠ null)──▶ payment (si la propina está desactivada)
 *   tip ──tip_selected (pantalla táctil) | skipTip() (cajero)──▶ payment
 *   payment ──setMode('thanks')──▶ thanks ──8 s / siguiente venta──▶ order | idle
 *   tip | payment ──setMode('order') (cancelar) | setPayment(null)──▶ order
 * La fase de propina es de la VENTA, no del método: cambiar de medio de pago
 * (`setPayment` con otro `method`) o teclear el efectivo reproyecta el cobro
 * pero no vuelve a preguntar la propina ni la anula. Excepción de PINTADO
 * (Fase 2-C): un cobro QR CON código se impone a la pregunta de propina
 * pendiente (el cliente ya está pagando; en pantalla no táctil la propina es
 * informativa y nadie la «omite»); la fase no se cierra: si el QR se retira
 * sin cobrar, la pregunta vuelve. Cuando el QR SE CONFIRMA («Pago QR
 * confirmado», onPaid de QrPaymentDialog) la caja llama a `skipTip()`: el
 * cliente ya pagó y la fase queda decidida, así que la reproyección del
 * medio sin código pasa a `payment` y nunca de vuelta a `tip` (F2-C, C1).
 * Solo `setMode('order')` (el cajero cierra el cobro sin vender),
 * `setPayment(null)` y `thanks` la olvidan, y con ella la BASE (`tipBase`):
 * la fija CheckoutDialog para ESE cobro (setTipBase, solo con la caja
 * arrancada) y también se borra en stop() y al cambiar de organización, así
 * el primer «tip» de la venta siguiente nunca viaja con la base de otra venta
 * u otra organización (ronda 2 de F2-B, QA-1). Excepción de PINTADO añadida
 * en esa ronda (QA-5): con base efectiva 0 (cortesía, descuento del 100 %)
 * la fase queda pendiente pero se pinta `payment`: no se pregunta «5 % · $0».
 * Los cambios de fase (pending → done → null) se avisan por
 * `onTipPhaseChange` solo cuando el valor cambia (QA-6), y la UI de la caja
 * los sigue sin sondeo. La elección del cliente (`tip_selected`, solo de la pantalla que
 * sigue a ESTA instancia y para el carrito proyectado) cierra la fase y se
 * entrega a `onTipSelected`; el emisor NO aplica nada: la caja decide
 * (Aplicar / Cambiar) y la propina se registra por el flujo existente
 * (`tip_amount` del cobro → tabla `tips`). Los presets, «Otro» y la base del
 * cálculo se fijan al ENTRAR en la fase (`getSettings` en ese instante) y
 * viajan en `state.tip`; la pantalla calcula los importes con tip.ts, la
 * misma aritmética que usa la caja para el aviso. El táctil que la caja
 * cree (`lastDisplayCapabilities.touch`) es el que la pantalla PINTA: la
 * pantalla declara el táctil RESUELTO (detección + `settings.touch`) y
 * reemite `display_alive` al conocer el forzado; la caja lo sigue por
 * `onDisplayCapabilitiesChange` (ronda 3 de F2-B) y, como respaldo, aplica
 * el mismo forzado con `presentationSettings.touch`.
 * `setMode('order')` y `setMode('idle')` limpian cobro y gracias y dejan que
 * el carrito decida: con líneas se ve «Pedido», sin ellas «Reposo». Solo se
 * proyecta un carrito VIVO: `status` `active` u `hold` (la misma lista blanca
 * que `POSService.getActiveCarts`). `hold_with_debt`, `completed` y
 * `cancelled` equivalen a «sin carrito»: la venta ya ocurrió o se anuló y no
 * hay pedido pendiente que mostrar (PLAN §4.1 «Nunca miente»).
 *
 * Override de totales (`setTotals`, desde TaxSummary): CADUCA con cada
 * mutación de líneas del mismo carrito. Si la caja añade una línea o cambia
 * una cantidad, el frame lleva los totales del propio `Cart` (los acaba de
 * recalcular posService con `calculateCartTotals`, coherentes con las
 * líneas) hasta que TaxSummary reenvíe los del recibo. Sin esta regla el
 * cliente vería, durante los cientos de ms que tarda TaxSummary (una
 * consulta de impuestos por línea), las líneas nuevas con el total anterior:
 * una cifra que no suma con lo que tiene delante (PLAN §4.1, §4.3).
 *
 * Firma de líneas (Fase 2, deuda del QA de F0): `setTotals` admite además la
 * FIRMA de las líneas con las que TaxSummary calculó (`linesSignature`, los
 * mismos campos que compara `sameLines`: id, cantidad, precio, descuento,
 * nota, número de modificadores y trato del impuesto). Si no coincide con la del carrito
 * proyectado, el override se DESCARTA sin emitir: son totales de un carrito
 * que ya no existe tal cual (TaxSummary reenvía sus totales viejos cuando
 * cambia la identidad del callback, antes de recalcular). Sin firma se
 * conserva el comportamiento anterior (solo id de carrito). Un override con
 * firma que llega ANTES de que la página active el carrito se guarda y se
 * comprueba en el `setCart` siguiente: si no casa, se descarta ahí.
 *
 * Ajustes de presentación (Fase 2): `getSettings` (opcional) lee de la caché
 * de settings.ts y viaja en `hello.settings` (protocol.ts). Tras guardar la
 * tarjeta, `refresh()` vuelve a saludar aunque el transporte ya estuviera
 * abierto, para que la pantalla aplique presets, calificación, etc. sin
 * recargar (PLAN §5.2). Sin `getSettings` el hello no lleva el campo (emisor
 * de la Fase 0 y pruebas).
 *
 * Saludo SOLO desde una ventana VISIBLE (rondas 3 y 4 de F2-A, QA medio):
 * con dos pestañas de /app/pos en la misma máquina, guardar la tarjeta o
 * apagar y encender el interruptor desde otra ventana dispara `storage` →
 * refreshPosDisplay → `refresh()` en las DOS, y el receptor sigue a «la
 * última que saluda» (transport.ts, regla 2): la pantalla podía pasar a
 * pintar el carrito de la pestaña de FONDO hasta que el cajero cambiara de
 * foco. Por eso las DOS ramas de `refresh()` que saludan comprueban
 * `isVisible()` (por defecto `document.visibilityState === 'visible'`; sin
 * `document`, true):
 * - resaludo con el transporte YA abierto (ronda 3): la pestaña oculta no
 *   publica nada;
 * - APERTURA del transporte al encender (ronda 4): la pestaña oculta abre el
 *   transporte igual (latido incluido, para poder responder a un
 *   `need_snapshot`) pero NO saluda.
 * No pierde nada: al volver a verse, la página llama a `reannounce()`
 * (visibilitychange/focus) y ese saludo ya lee los ajustes nuevos de la
 * caché; y si es la ÚNICA pestaña de POS (en segundo plano mientras se
 * enciende desde Configuración), la pantalla la adopta provisionalmente por
 * latido, le pide snapshot y `handleUp` responde con hello + state sin mirar
 * la visibilidad. Solo `start()` y la respuesta a `need_snapshot` NO
 * dependen de la visibilidad: son datos de ESTA caja o una petición expresa
 * de la pantalla, no un aviso ajeno. `setSession` (ronda 5 de F2-B, defecto
 * F2B-R4-1) tampoco saluda desde una pestaña OCULTA: con dos pestañas, la
 * visible abre la caja y la oculta recibe el Realtime de `cash_sessions`,
 * recarga y llamaba a setSession la ÚLTIMA; su hello relevaba a la visible
 * fuera de la ventana de elección. La sesión se guarda igual y viaja en el
 * siguiente hello (reannounce al volver a verse, o respuesta a need_snapshot).
 * El receptor añade la guarda simétrica: un hello `visible: false` no releva
 * a una activa adoptada con `visible: true` (transport.ts, regla 2).
 *
 * «Gracias» dura THANKS_DURATION_MS «o hasta la siguiente venta» (PLAN §4.2).
 * Decisión (ronda 3): la «siguiente venta» es una MUTACIÓN REAL de líneas
 * del carrito activo avisada por posService (`onCartsSaved`: línea nueva o
 * cambio de cantidad/precio/descuento/nota/modificadores). Cambiar de pestaña
 * (`setActiveCart`) NO cierra «Gracias»: tras cobrar con varias pestañas la
 * página activa la primera que queda y, si es un pedido en espera con
 * líneas, el cliente que acaba de pagar vería el pedido de OTRO cliente en el
 * mismo frame en que se cierra el recibo. Al vencer el temporizador se
 * proyecta el carrito activo que haya en ese momento.
 *
 * Un carrito con `status: 'hold_with_debt'` ya está facturado a crédito: no
 * se proyecta (equivale a «sin carrito»). Así «guardar con deuda» pasa a
 * «Gracias» (lo pide CartView) y luego a «Reposo», nunca deja un «Pedido»
 * pendiente que ya no lo está (PLAN §4.1 «Nunca miente»). Lo mismo para
 * `cancelled` («anular deuda» deja el carrito con sus líneas y la página lo
 * mantiene como pestaña activa) y `completed`.
 *
 * Si el carrito desaparece de `pos_carts_<org>` MIENTRAS se muestra un cobro
 * (`POSService.checkout` → `removeCart`), el cobro se descarta en el mismo
 * acto: un «Cobro» sin líneas sería una pantalla que no describe nada. En el
 * flujo real `setMode('thanks')` llega en la misma vuelta de microtareas y
 * el único frame es «Gracias»; si algún día un `await` real se cuela entre
 * `removeCart` y el `return`, el frame intermedio es «Reposo», nunca un
 * «Cobro» con `cart: null`.
 *
 * Resaltado de la línea que acaba de cambiar (PLAN §4.1): se conserva hasta
 * la siguiente PUBLICACIÓN (flush o announce) y ahí se limpia. Así, cuando la
 * página reenvía el mismo carrito que posService acaba de guardar (otro objeto,
 * mismas líneas) antes del rAF, el único `state` coalescido sigue llevando la
 * línea; y una emisión posterior solo por totales no vuelve a resaltarla.
 *
 * Solo se atienden `setPayment` y `setMode` con la caja arrancada (`start`):
 * CheckoutDialog también se monta fuera de /app/pos (mesas, nueva venta) y sin
 * esta guarda un cobro o un «Gracias» quedarían residentes y saldrían en el
 * primer saludo al volver al POS.
 *
 * Quién llama a qué:
 * - posService.saveCartsToStorage → `onCartsSaved(carts)`: el único punto por
 *   el que pasan todas las mutaciones del carrito.
 * - /app/pos → `start`, `stop`, `setActiveCart` (cambio de pestaña),
 *   `setSession` (caja abierta/cerrada, nombre del cajero).
 * - CartView/TaxSummary → `setTotals` con los totales del recibo.
 * - CheckoutDialog → `setPayment`, `setMode('thanks' | 'order')`.
 */

import type { Cart } from '@/components/pos/types';
import type {
  DisplayCapabilities,
  DisplayCart,
  DisplayMode,
  DisplayPayment,
  DisplayPresentationSettings,
  DisplayState,
  TipSelectedMessage,
  UpMessage,
} from './protocol';
import { projectCartForDisplay, type DisplayTotalsOverride } from './projection';
import { isAcceptableTipChoice, isValidTipPercent, resolveTipSelection, type DisplayTipBlock, type TipSelection } from './tip';
import type { DisplayCapabilitiesByOrigin, DisplaySeenByOrigin, DisplayTransport, HelloDraft } from './transport';

/** Cuánto se muestra «Gracias» antes de volver al modo derivado (PLAN §4.2: 8 s o siguiente venta). */
export const THANKS_DURATION_MS = 8000;

/** Cancela una emisión programada. */
type Cancel = () => void;
/** Programa `fn` para la próxima vuelta: rAF en navegador, setTimeout(0) en Node. Devuelve cómo cancelarla. */
export type Scheduler = (fn: () => void) => Cancel;

export interface DisplaySessionInfo {
  cashier: { name: string } | null;
  sessionOpen: boolean;
}

export interface DisplayEmitterStartOptions extends Partial<DisplaySessionInfo> {
  /** Organización de la caja: viaja en `hello` para que la pantalla compruebe la marca. Entero > 0. */
  organizationId: number;
  /** Código ISO de la moneda de la organización (p. ej. "COP"). */
  currency: string;
}

export interface DisplayEmitterOptions {
  /**
   * Crea el transporte cuando el interruptor está encendido. Devuelve null si
   * el entorno no lo soporta (sin BroadcastChannel): entonces no se emite.
   * Se llama en cada apertura (start, o refresh tras encender), nunca antes.
   */
  createTransport: () => DisplayTransport | null;
  /** Lee el interruptor maestro desde la caché en memoria (settings.ts). Síncrono. */
  isEnabled: () => boolean;
  /**
   * Ajustes de presentación para `hello.settings` (Fase 2), desde la caché
   * de settings.ts. Síncrono; se lee en cada saludo. Ausente → el hello no
   * lleva `settings`.
   */
  getSettings?: () => DisplayPresentationSettings;
  /**
   * ¿La ventana de esta caja está visible? Solo lo consulta `refresh()` para
   * decidir si saluda: al resaludar con el transporte ya abierto y al ABRIRLO
   * tras encender el interruptor (ver cabecera). Por defecto
   * `defaultIsVisible` (document.visibilityState); inyectable en pruebas.
   */
  isVisible?: () => boolean;
  /** Por defecto: requestAnimationFrame si existe, si no setTimeout(0). */
  schedule?: Scheduler;
  /** Duración de «Gracias». Por defecto THANKS_DURATION_MS; las pruebas lo acortan. */
  thanksDurationMs?: number;
}

/** Fase de la propina en pantalla: ver la máquina de estados en la cabecera. */
export type TipPhase = 'pending' | 'done' | null;

interface TotalsOverrideForCart {
  cartId: string;
  totals: DisplayTotalsOverride;
  /** Firma de las líneas con las que se calcularon (linesSignature); null si el emisor no la dio. */
  signature: string | null;
}

const IDLE_STATE: Readonly<DisplayState> = Object.freeze({
  mode: 'idle',
  cart: null,
  payment: null,
  tip: null,
  thanks: null,
});

/**
 * Respaldo del planificador cuando `requestAnimationFrame` no dispara: Chrome
 * pausa rAF en pestañas en segundo plano y, en Windows, en ventanas totalmente
 * ocluidas. Sin respaldo, el fin de «Gracias» o un `state` pendiente quedaría
 * sin emitir mientras la caja esté tapada, con el latido aún vivo: la pantalla
 * no entraría en «Conectando» y se quedaría con un estado viejo.
 */
export const RAF_FALLBACK_MS = 50;

/**
 * Planificador por defecto. En navegador programa rAF y, además, un
 * setTimeout de respaldo: el primero que dispare ejecuta `fn` y cancela al
 * otro; la cancelación devuelta cancela ambos. Sin rAF (Node), setTimeout(0).
 */
export function defaultScheduler(): Scheduler {
  if (typeof requestAnimationFrame !== 'function' || typeof cancelAnimationFrame !== 'function') {
    return (fn) => {
      const id = setTimeout(fn, 0);
      return () => clearTimeout(id);
    };
  }
  return (fn) => {
    let done = false;
    let rafId = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      done = true;
      cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
    };
    const run = () => {
      if (done) return;
      settle();
      fn();
    };
    rafId = requestAnimationFrame(run);
    timerId = setTimeout(run, RAF_FALLBACK_MS);
    return settle;
  };
}

/**
 * Visibilidad por defecto de la ventana: `document.visibilityState === 'visible'`.
 * Sin `document` (Node, pruebas) o si la lectura lanza, true: nunca deja de
 * saludar por no poder averiguarlo.
 */
export function defaultIsVisible(): boolean {
  try {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  } catch {
    return true;
  }
}

function isValidOrganizationId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function hasLines(cart: DisplayCart | null): cart is DisplayCart {
  return cart !== null && cart.lines.length > 0;
}

type DisplayLine = DisplayCart['lines'][number];

/**
 * Lo que cuenta como «la misma línea»: cantidad, precio, descuento, nota,
 * número de modificadores y el trato del impuesto (`taxExcluded` /
 * `taxIncluded`). Los dos últimos entraron en la ronda 2 de F2-A: al pulsar
 * «Excluir impuesto de este producto» la línea cambia de total sin cambiar
 * ningún otro campo, y sin verlos el override de TaxSummary (con el impuesto
 * que ya no existe) sobrevivía al recálculo. Efecto colateral aceptado y
 * documentado: esa línea se RESALTA 600 ms como cualquier otro cambio
 * (`findChangedLineId` usa el mismo criterio); el cliente ve qué cambió.
 */
function isSameLine(a: DisplayLine, b: DisplayLine): boolean {
  return (
    a.id === b.id &&
    a.qty === b.qty &&
    a.unitPrice === b.unitPrice &&
    a.discount === b.discount &&
    a.note === b.note &&
    a.modifiers.length === b.modifiers.length &&
    a.taxExcluded === b.taxExcluded &&
    a.taxIncluded === b.taxIncluded
  );
}

/**
 * ¿Dos proyecciones tienen las mismas líneas? Mismo id de carrito, mismos ids
 * de línea en el mismo orden y sin cambios de cantidad/precio/descuento/nota/
 * modificadores. Ambas null cuenta como iguales. Se usa para no perder el
 * resaltado cuando la página reenvía el carrito que posService acaba de
 * guardar (otro objeto, mismo contenido) y para que solo una mutación real
 * cierre «Gracias».
 */
export function sameLines(prev: DisplayCart | null, next: DisplayCart | null): boolean {
  if (prev === null || next === null) return prev === next;
  if (prev.id !== next.id || prev.lines.length !== next.lines.length) return false;
  for (let i = 0; i < next.lines.length; i += 1) {
    if (!isSameLine(prev.lines[i], next.lines[i])) return false;
  }
  return true;
}

/**
 * Firma textual de las líneas de una proyección: los MISMOS campos que
 * compara `sameLines` (id, cantidad, precio, descuento, nota, número de
 * modificadores, `taxExcluded` y `taxIncluded`), en orden. Dos proyecciones
 * con `sameLines` true tienen la misma firma y viceversa. `null` (sin
 * carrito) → ''. Sirve para que TaxSummary etiquete los totales con el
 * carrito exacto con el que los calculó y `setTotals` descarte los que ya no
 * corresponden (también al alternar el impuesto de una línea).
 */
export function linesSignature(cart: DisplayCart | null): string {
  if (cart === null) return '';
  const parts = cart.lines.map((line) =>
    [line.id, line.qty, line.unitPrice, line.discount ?? '', line.note ?? '', line.modifiers.length, line.taxExcluded ? 1 : 0, line.taxIncluded ? 1 : 0].map(String).join('\u001f'),
  );
  return `${cart.id}\u001e${parts.join('\u001e')}`;
}

/**
 * Firma de las líneas de un `Cart` del POS (proyecta con projectCartForDisplay,
 * que ignora los totales para las líneas). Para que CartView/TaxSummary la
 * calculen sin conocer la moneda ni el override. Nunca lanza: sin carrito → ''.
 */
export function cartLinesSignature(cart: Cart | null | undefined): string {
  if (!cart) return '';
  try {
    return linesSignature(projectCartForDisplay(cart, { currency: 'COP', lastChangedLineId: null }));
  } catch {
    return '';
  }
}

/**
 * Línea que acaba de cambiar entre dos proyecciones, para el resaltado de
 * 600 ms (PLAN §4.1). Solo si cambió UNA línea (nueva, o con distinta
 * cantidad/precio/descuento/nota/impuesto); si cambiaron varias o ninguna, null.
 */
export function findChangedLineId(prev: DisplayCart | null, next: DisplayCart | null): string | null {
  if (!next) return null;
  if (!prev || prev.id !== next.id) return null;
  const before = new Map(prev.lines.map((line) => [line.id, line]));
  let changed: string | null = null;
  for (const line of next.lines) {
    const old = before.get(line.id);
    if (old && isSameLine(old, line)) continue;
    if (changed !== null) return null; // más de una: no se resalta ninguna
    changed = line.id;
  }
  return changed;
}

function warn(where: string, err: unknown): void {
  console.warn(`[pos-display] ${where} falló:`, err);
}

/**
 * Identificador corto y único por ventana para cada «Gracias» (Fase 4). No
 * es un secreto ni un id de negocio: solo tiene que distinguir una venta de
 * la siguiente dentro de la misma caja, así que un contador con una sal de
 * arranque basta y no obliga a `crypto.randomUUID` (que falta en contextos
 * no seguros, justo donde corre parte de estas cajas).
 */
let thanksCounter = 0;
const thanksSalt = Math.random().toString(36).slice(2, 8);
function nextThanksId(): string {
  thanksCounter += 1;
  return `t${thanksSalt}${thanksCounter}`;
}

export class DisplayEmitter {
  private readonly createTransport: () => DisplayTransport | null;
  private readonly isEnabled: () => boolean;
  private readonly getSettings: (() => DisplayPresentationSettings) | null;
  private readonly isVisible: () => boolean;
  private readonly schedule: Scheduler;
  private readonly thanksDurationMs: number;

  private transport: DisplayTransport | null = null;
  private unsubscribeUp: (() => void) | null = null;
  private started = false;

  private organizationId = 0;
  private currency = 'COP';
  private session: DisplaySessionInfo = { cashier: null, sessionOpen: false };

  private cart: Cart | null = null;
  private activeCartId: string | null = null;
  private projectedCart: DisplayCart | null = null;
  private lastChangedLineId: string | null = null;
  private totalsOverride: TotalsOverrideForCart | null = null;

  private payment: DisplayPayment | null = null;
  /**
   * Propina en pantalla (F2-B): `pending` mientras se pregunta, `done` cuando
   * el cliente eligió o el cajero omitió, null fuera de la fase. Los presets
   * y «Otro» se congelan al entrar; `tipBase` lo fija la caja (setTipBase) y
   * sin él se usa el total proyectado.
   */
  private tipState: TipPhase = null;
  private tipConfig: { presets: number[]; allowCustom: boolean } | null = null;
  private tipBase: number | null = null;
  private tipSelected: TipSelectedMessage | null = null;
  /**
   * La misma elección ya resuelta a importe en el momento de aceptarla (ronda
   * 8, QA F2B-R7 E): el getter `tipSelection` devuelve ESTA, no una
   * re-resolución. CONGELADA (`Object.freeze`, ronda 4 de cierre): es la
   * misma referencia que reciben los oyentes de `onTipSelected`, y un oyente
   * descuidado que la mutara cambiaría la cifra que el cliente vio para el
   * getter y para los oyentes siguientes.
   */
  private tipResolved: Readonly<TipSelection> | null = null;
  private readonly tipListeners = new Set<(selection: TipSelection) => void>();
  private readonly tipPhaseListeners = new Set<(phase: TipPhase) => void>();
  private readonly stateListeners = new Set<(state: DisplayState) => void>();
  /** Oyentes de `onDisplayCapabilitiesChange` (ronda 3 de F2-B) y la última capacidad avisada, serializada, para avisar solo con cambio. */
  private readonly capabilitiesListeners = new Set<(capabilities: DisplayCapabilities | null) => void>();
  private lastCapabilitiesJson: string | null = null;
  private thanks: DisplayState['thanks'] = null;
  private thanksTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Venta que la pantalla está agradeciendo (Fase 4). La calificación que
   * llega de la pantalla NO trae el id de la venta: lo pone la caja desde
   * aquí. Un `saleId` que viniera por el cable sería un id de venta elegido
   * por quien escriba en el canal. Se olvida al salir de «Gracias».
   */
  private thanksSaleId: string | null = null;
  /**
   * Identificador del «Gracias» en curso (Fase 4, ronda 2). Viaja en el
   * `state` y vuelve en el mensaje `rating`: si no coincide, la calificación
   * es de una venta anterior que llegó tarde por el canal remoto y se
   * descarta. Se renueva en cada `setMode('thanks')` y se olvida al salir.
   */
  private thanksId: string | null = null;
  private closed = false;

  private pendingFlush: Cancel | null = null;
  private lastEmittedJson: string | null = null;
  private stateCount = 0;
  /** Oyentes de `onUp` (Fase 2): la caja UI reacciona a las intenciones de la pantalla; el emisor no. */
  private readonly upListeners = new Set<(msg: UpMessage) => void>();

  constructor(options: DisplayEmitterOptions) {
    this.createTransport = options.createTransport;
    this.isEnabled = options.isEnabled;
    this.getSettings = options.getSettings ?? null;
    this.isVisible = options.isVisible ?? defaultIsVisible;
    this.schedule = options.schedule ?? defaultScheduler();
    this.thanksDurationMs = options.thanksDurationMs ?? THANKS_DURATION_MS;
  }

  // -------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------

  /**
   * Arranca la caja: guarda organización y moneda, y si el interruptor está
   * encendido abre el transporte y emite `hello` + `state`. Idempotente:
   * llamar de nuevo actualiza organización/moneda/sesión y vuelve a saludar.
   *
   * Con la MISMA organización, stop() + start() recupera el carrito que se
   * conservó. Con OTRA organización (cambio en caliente desde el selector:
   * la página para y vuelve a arrancar) se olvida todo lo de la anterior:
   * carrito, totales, cobro y gracias. Si no, el primer `state` bajo el
   * `hello` de la organización nueva llevaría el pedido de la anterior,
   * además reproyectado en la moneda nueva.
   */
  start(options: DisplayEmitterStartOptions): void {
    try {
      if (!isValidOrganizationId(options.organizationId)) {
        console.warn('[pos-display] start ignorado: organizationId inválido', options.organizationId);
        return;
      }
      if (this.organizationId !== options.organizationId) {
        this.lastEmittedJson = null;
        if (this.organizationId !== 0) this.forgetOrganizationState();
      }
      this.organizationId = options.organizationId;
      this.currency = typeof options.currency === 'string' && options.currency.length > 0 ? options.currency : 'COP';
      if (options.cashier !== undefined) this.session.cashier = options.cashier;
      if (options.sessionOpen !== undefined) this.session.sessionOpen = options.sessionOpen;
      this.started = true;
      this.projectedCart = this.project();
      const hadTransport = this.transport !== null;
      const announced = this.applySwitch(true); // abre el transporte y saluda si el interruptor está encendido (sin mirar la visibilidad)
      // Ya estaba abierto: vuelve a saludar con los datos nuevos (salvo que applySwitch ya lo hiciera).
      // No depende de la visibilidad: start() repetido es un cambio de datos de ESTA caja, no un aviso ajeno.
      if (hadTransport && this.transport && !announced) this.announce();
    } catch (err) {
      warn('start', err);
    }
  }

  /** Cierra el transporte (con `bye`) y olvida cobro, gracias y cerrado. El carrito activo se conserva por si se vuelve a arrancar. */
  stop(): void {
    try {
      this.started = false;
      this.cancelPending();
      this.clearThanks();
      this.payment = null;
      this.resetTip();
      this.tipBase = null; // la base es de una venta concreta: no sobrevive a la parada (QA-1, ronda 2)
      this.closed = false;
      this.closeTransport();
    } catch (err) {
      warn('stop', err);
    }
  }

  /**
   * Relee el interruptor maestro. Encendido y sin transporte → lo abre
   * (latido incluido) y saluda SOLO si la ventana está visible; apagado y
   * con transporte → lo cierra (la pantalla pasa a «Conectando» y luego a
   * «Reposo»). Encendido y YA abierto → vuelve a saludar si hay
   * `getSettings` (Fase 2: la tarjeta guardó propina, calificación, etc. y
   * la pantalla los aplica sin recargar, PLAN §5.2) Y SOLO si la ventana
   * está visible (`isVisible`). En las dos ramas la razón es la misma: una
   * pestaña de fondo no debe robarle la pantalla a la que el cajero tiene
   * delante (ver cabecera). La tarjeta lo llama tras guardar; el listener
   * de `storage`, cuando guardó otra ventana.
   */
  refresh(): void {
    try {
      this.applySwitch();
    } catch (err) {
      warn('refresh', err);
    }
  }

  /** Cuerpo de refresh(). Devuelve si saludó (start() lo usa para no saludar dos veces). `fromStart`: start() saluda al abrir sin mirar la visibilidad. */
  private applySwitch(fromStart = false): boolean {
    if (!this.started) return false;
    const enabled = this.isEnabled();
    if (enabled && !this.transport) {
      // El transporte se abre SIEMPRE (latido incluido): así la caja puede
      // responder a un need_snapshot aunque esté oculta. Pero solo saluda si
      // la ventana está visible o si es el propio start() de esta caja (ronda
      // 4 de F2-A): apagar y encender desde otra ventana dispara `storage` →
      // refresh() en todas las pestañas, y la oculta no debe relevar a la que
      // el cajero tiene delante. La oculta se presenta al volver a verse
      // (reannounce) o cuando la pantalla le pide snapshot (handleUp).
      this.openTransport();
      if (!this.transport) return false;
      if (!fromStart && !this.windowVisible()) return false;
      this.announce();
      return true;
    }
    if (!enabled && this.transport) {
      this.cancelPending();
      this.closeTransport();
      return false;
    }
    if (enabled && this.transport && this.getSettings && this.windowVisible()) {
      this.announce();
      return true;
    }
    return false;
  }

  /** `isVisible` envuelto: si lanza, se asume visible (como defaultIsVisible). */
  private windowVisible(): boolean {
    try {
      return this.isVisible() !== false;
    } catch (err) {
      warn('isVisible', err);
      return true;
    }
  }

  /**
   * Vuelve a saludar (hello + state) sin que nada haya cambiado. La página lo
   * llama al recuperar el foco / visibilidad: con dos pestañas de /app/pos la
   * pantalla sigue a la última instancia que saluda (transport.ts), así la
   * pestaña que usa el cajero recupera la pantalla sin hacer nada.
   */
  reannounce(): void {
    try {
      if (this.transport) this.announce();
    } catch (err) {
      warn('reannounce', err);
    }
  }

  /**
   * Nombre del cajero y estado de la caja. Cambiarlos vuelve a emitir `hello`
   * (PLAN §5.2)… solo desde una ventana VISIBLE (ver cabecera, F2B-R4-1): la
   * pestaña oculta guarda la sesión y la lleva en su próximo saludo.
   */
  setSession(session: Partial<DisplaySessionInfo>): void {
    try {
      const next: DisplaySessionInfo = {
        cashier: session.cashier !== undefined ? session.cashier : this.session.cashier,
        sessionOpen: session.sessionOpen !== undefined ? session.sessionOpen : this.session.sessionOpen,
      };
      const changed = next.sessionOpen !== this.session.sessionOpen || next.cashier?.name !== this.session.cashier?.name;
      this.session = next;
      if (changed && this.transport && this.windowVisible()) this.announce();
    } catch (err) {
      warn('setSession', err);
    }
  }

  // -------------------------------------------------------------------------
  // Carrito
  // -------------------------------------------------------------------------

  /**
   * Fija el carrito que el cajero tiene delante (pestaña activa). `null` si
   * no hay ninguno. A partir de aquí `onCartsSaved` sigue a este id.
   */
  setActiveCart(cart: Cart | null | undefined): void {
    try {
      const next = cart ?? null;
      this.activeCartId = next && typeof next.id === 'string' && next.id.length > 0 ? next.id : null;
      this.setCart(next);
    } catch (err) {
      warn('setActiveCart', err);
    }
  }

  /**
   * Sustituye el carrito proyectado. No cambia qué pestaña es la activa:
   * para eso está setActiveCart.
   *
   * `fromMutation` lo activa solo onCartsSaved (posService acaba de escribir
   * el carrito): si además cambió alguna línea y el carrito tiene líneas, es
   * la «siguiente venta» y cierra «Gracias» (PLAN §4.2). Un cambio de
   * pestaña o el reenvío del mismo carrito por la página no lo cierran.
   *
   * Resaltado: si cambió UNA línea se anota; si la proyección nueva es
   * equivalente a la anterior (mismas líneas) se conserva lo anotado para que
   * el reenvío de la página no lo pise antes del flush; en cualquier otro
   * caso (varias líneas, otro carrito, líneas eliminadas) se anula.
   *
   * El override de totales (setTotals) solo tiene sentido para el carrito al
   * que pertenece, mientras tenga líneas y mientras sean LAS MISMAS líneas
   * con las que TaxSummary lo calculó: al vaciarlo, al cambiar de carrito o
   * al mutar una línea del mismo carrito se descarta ANTES de proyectar y el
   * frame lleva los totales del propio `Cart`. Si no, la línea nueva
   * heredaría durante cientos de ms el total anterior (CartView no reenvía
   * totales con subtotal 0 y TaxSummary corrige tras N consultas de
   * impuestos). Un override que llega para OTRO carrito antes de que la
   * página lo active (TaxSummary se adelanta a setActiveCart) sí se
   * conserva: no hay proyección previa del mismo id con la que compararlo.
   *
   * Un cobro en curso (`setPayment`) se descarta si el carrito desaparece
   * por mutación (removeCart al cobrar): ver cabecera.
   */
  setCart(cart: Cart | null | undefined, fromMutation = false): void {
    try {
      this.cart = cart ?? null;
      let next = this.project();
      if (this.totalsOverride && (!hasLines(next) || next.id !== this.totalsOverride.cartId)) {
        this.totalsOverride = null;
        next = this.project();
      }
      const prev = this.projectedCart;
      const equivalent = sameLines(prev, next); // no depende de los totales: se puede evaluar antes de reproyectar
      if (!equivalent && this.totalsOverride && next && prev && prev.id === next.id && this.totalsOverride.cartId === next.id) {
        // Override obsoleto: las líneas cambiaron desde que TaxSummary lo calculó.
        this.totalsOverride = null;
        next = this.project();
      } else if (this.totalsOverride && next && this.totalsOverride.cartId === next.id && !this.matchesOverrideSignature(next)) {
        // Override con firma que llegó antes que el carrito (TaxSummary se adelantó a
        // setActiveCart) y no casa con las líneas reales: se descarta.
        this.totalsOverride = null;
        next = this.project();
      }
      const changed = findChangedLineId(prev, next);
      if (changed !== null) this.lastChangedLineId = changed;
      else if (!equivalent) this.lastChangedLineId = null;
      this.projectedCart = next;
      if (fromMutation && !equivalent && hasLines(next) && this.thanks) this.clearThanks();
      if (fromMutation && next === null && this.payment) {
        this.payment = null;
        this.resetTip();
      }
      this.requestFlush();
    } catch (err) {
      warn('setCart', err);
    }
  }

  /**
   * Punto único de entrada desde posService: se llama tras CADA escritura de
   * `pos_carts_<org>`. Si el carrito activo viene en la lista, se proyecta.
   * Si NO viene, se eliminó (removeCart al cobrar o al descartar: es el único
   * camino que guarda una lista sin el carrito activo; activar y poner en
   * espera escriben la lista completa) y se deja de proyectar: así, al vencer
   * «Gracias», la pantalla pasa a «Reposo» y no vuelve a mostrar la venta ya
   * cobrada. `activeCartId` se conserva hasta que la página fije el carrito
   * nuevo con setActiveCart. Sin carrito activo no se hace nada.
   */
  onCartsSaved(carts: ReadonlyArray<Cart>): void {
    try {
      if (!this.activeCartId || !Array.isArray(carts)) return;
      const active = carts.find((c) => c && c.id === this.activeCartId);
      if (active) {
        this.setCart(active, true);
      } else if (this.cart !== null) {
        this.setCart(null, true);
      }
    } catch (err) {
      warn('onCartsSaved', err);
    }
  }

  /**
   * Totales del recibo para un carrito concreto (PLAN §8: la Parte B pasa
   * `{ discountTotal, taxTotal, total }` del mismo motor que ve el cajero).
   * Solo se aplican mientras el carrito proyectado tenga ese id y líneas;
   * `null` los retira.
   *
   * `signature` (Fase 2): firma de las líneas con las que se calcularon
   * (`linesSignature` / `cartLinesSignature`). Si el carrito proyectado
   * tiene ese id y su firma es OTRA, los totales se descartan sin emitir:
   * describen líneas que ya no están delante del cliente. Sin firma se
   * comporta como antes (solo se comprueba el id).
   */
  setTotals(cartId: string, totals: DisplayTotalsOverride | null, signature?: string | null): void {
    try {
      if (typeof cartId !== 'string' || cartId.length === 0) return;
      const sig = typeof signature === 'string' ? signature : null;
      if (totals === null) {
        if (this.totalsOverride?.cartId !== cartId) return;
        this.totalsOverride = null;
      } else {
        if (sig !== null && this.projectedCart && this.projectedCart.id === cartId && linesSignature(this.projectedCart) !== sig) {
          return; // totales de unas líneas que ya no son las proyectadas: no se aplican
        }
        const same =
          this.totalsOverride?.cartId === cartId &&
          this.totalsOverride.totals.discountTotal === totals.discountTotal &&
          this.totalsOverride.totals.taxTotal === totals.taxTotal &&
          this.totalsOverride.totals.total === totals.total &&
          this.totalsOverride.signature === sig;
        if (same) return;
        this.totalsOverride = { cartId, totals: { ...totals }, signature: sig };
      }
      if (this.cart?.id !== cartId) return;
      this.projectedCart = this.project();
      this.requestFlush();
    } catch (err) {
      warn('setTotals', err);
    }
  }

  // -------------------------------------------------------------------------
  // Cobro y modos
  // -------------------------------------------------------------------------

  /**
   * Estado de cobro en vivo (efectivo: recibido/cambio mientras el cajero
   * teclea). `null` al cancelar el cobro. Se ignora con la caja sin arrancar
   * (CheckoutDialog fuera de /app/pos).
   */
  setPayment(payment: DisplayPayment | null): void {
    try {
      if (!this.started) return;
      const opening = payment !== null && this.payment === null;
      this.payment = payment;
      if (payment && this.thanks) this.clearThanks();
      // F2-B: al ENTRAR en cobro se abre la fase de propina (si procede); al
      // cancelarlo se olvida, base incluida (la fija CheckoutDialog para ESE
      // cobro). Cambiar de medio o teclear importes no la toca.
      if (payment === null) {
        this.resetTip();
        this.tipBase = null;
      } else if (opening) this.beginTipPhase();
      this.requestFlush();
    } catch (err) {
      warn('setPayment', err);
    }
  }

  // -------------------------------------------------------------------------
  // Propina en pantalla (F2-B)
  // -------------------------------------------------------------------------

  /**
   * Importe sobre el que la pantalla calcula los porcentajes: el total con
   * impuestos ANTES de propina y domicilio (`baseTotal` del modal de cobro),
   * para que «10 %» sea la misma cifra en la pantalla y en la caja. La caja
   * lo manda con cada cambio; null lo retira (se usa el total proyectado).
   * No abre ni cierra la fase.
   */
  setTipBase(base: number | null): void {
    try {
      // Ronda 2 (QA-1): misma guarda que setPayment/setMode. CheckoutDialog se
      // monta también en mesas y nueva venta, con la caja sin arrancar; sin
      // esto la base de ESA venta quedaba residente y viajaba en el primer
      // «tip» al volver al POS.
      if (!this.started) return;
      const next = typeof base === 'number' && Number.isFinite(base) && base >= 0 ? base : null;
      if (next === this.tipBase) return;
      this.tipBase = next;
      if (this.tipState === 'pending') this.requestFlush();
    } catch (err) {
      warn('setTipBase', err);
    }
  }

  /**
   * El cajero omite la propina en pantalla (o la registró él mismo en la
   * caja, o siguió cobrando): la pantalla pasa a «Cobro». Sin fase pendiente
   * no hace nada. No borra una elección ya recibida.
   */
  skipTip(): void {
    try {
      if (this.tipState !== 'pending') return;
      this.setTipPhase('done');
      this.requestFlush();
    } catch (err) {
      warn('skipTip', err);
    }
  }

  /**
   * Cambios de `tipPhase` (ronda 2, QA-6): se avisa solo cuando el valor
   * cambia de verdad (pending → done → null), desde beginTipPhase, skipTip,
   * acceptTipSelection y resetTip. Sustituye el sondeo de la UI de la caja
   * (TipFromDisplayNotice). Un oyente que lance no afecta al resto ni al
   * emisor. Devuelve la baja. Sobrevive a stop()/start().
   */
  onTipPhaseChange(listener: (phase: TipPhase) => void): () => void {
    this.tipPhaseListeners.add(listener);
    return () => {
      this.tipPhaseListeners.delete(listener);
    };
  }

  /**
   * Cada `state` que sale de verdad por el transporte (`announce` y `flush`
   * con cambio real; ronda 2, QA-3). La UI de la caja lo usa para saber qué
   * pinta la pantalla AHORA (p. ej. si la pregunta de propina quedó tapada
   * por un QR con código) sin sondear ni duplicar `buildState`. No se avisa
   * con el interruptor apagado ni sin transporte: entonces no hay pantalla
   * que pinte nada. Un oyente que lance no afecta al resto ni a la emisión.
   */
  onStatePublished(listener: (state: DisplayState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Elección del cliente desde la pantalla táctil, ya resuelta a importe con
   * la base que la caja emitió (tip.ts). Solo se entrega si la fase estaba
   * pendiente y `cartId` es el carrito proyectado. El emisor no aplica nada:
   * la caja muestra «Cliente eligió 10 % ($X)» con Aplicar / Cambiar
   * (PLAN §5.3). Un oyente que lance no afecta al resto. Sobrevive a
   * stop()/start(): se registra una vez por componente. La selección llega
   * CONGELADA (la misma referencia que devuelve `tipSelection`): mutarla
   * lanza en modo estricto y no cambia la cifra para nadie.
   */
  onTipSelected(listener: (selection: Readonly<TipSelection>) => void): () => void {
    this.tipListeners.add(listener);
    return () => {
      this.tipListeners.delete(listener);
    };
  }

  /** Fase de la propina en pantalla ahora mismo (para la UI de la caja y las pruebas). */
  get tipPhase(): TipPhase {
    return this.tipState;
  }

  /**
   * Última elección aceptada en esta fase, resuelta a importe; null si no hubo.
   * Es EXACTAMENTE la `TipSelection` que se entregó a `onTipSelected`: el
   * importe quedó congelado con la base que el cliente vio al pulsar. Si la
   * base cambia después (el cajero edita un descuento en el modal) este
   * getter NO se re-resuelve: una elección tiene una sola cifra por cualquier
   * camino de lectura (ronda 8, QA F2B-R7 describe E). Quien quiera el
   * importe con la base actual lo recalcula con `computeTipAmount` (tip.ts).
   * La referencia está congelada (`Object.isFrozen` → true): ni el aviso de
   * la caja ni ningún oyente pueden alterarla.
   */
  get tipSelection(): Readonly<TipSelection> | null {
    return this.tipResolved;
  }

  /**
   * - `thanks`: venta confirmada. Muestra «Gracias» con `total` y vuelve al
   *   modo derivado a los THANKS_DURATION_MS (o antes, si entra una línea).
   * - `closed`: sin caja abierta. Se mantiene hasta `order`/`idle`.
   * - `order` / `idle`: limpia cobro, gracias y cerrado; el carrito decide.
   * - `payment`: no hace nada por sí solo; el modo lo fija setPayment.
   * - `tip`: no se fuerza desde fuera; la fase la abre setPayment (F2-B) y
   *   la cierran tip_selected / skipTip(). Se ignora.
   * Con la caja sin arrancar (CheckoutDialog en mesas o nueva venta) se ignora.
   */
  setMode(mode: DisplayMode, extra?: { total?: number; askRating?: boolean; saleId?: string | null }): void {
    try {
      if (!this.started) return;
      switch (mode) {
        case 'thanks': {
          const total = typeof extra?.total === 'number' && Number.isFinite(extra.total) ? extra.total : this.projectedCart?.total ?? 0;
          this.payment = null;
          this.resetTip();
          this.tipBase = null; // la venta terminó: la base no vale para la siguiente
          this.closed = false;
          // Fase 4: si quien confirma la venta no dice nada, manda el ajuste
          // de la organización (`rating.enabled`). Así CheckoutDialog no
          // tiene que conocer los ajustes de la pantalla para preguntar.
          const askRating = extra?.askRating === undefined ? this.ratingEnabled() : extra.askRating === true;
          // El id existe para que una calificación no se cuente dos veces
          // (la pantalla lo devuelve en el mensaje `rating`). Sin pregunta no
          // hay nada que deduplicar, así que el estado no lo lleva: los
          // frames de «Gracias» de las fases anteriores no cambian de forma.
          this.thanksId = askRating ? nextThanksId() : null;
          this.thanks = this.thanksId ? { total, askRating, id: this.thanksId } : { total, askRating };
          this.thanksSaleId = typeof extra?.saleId === 'string' && extra.saleId.length > 0 ? extra.saleId : null;
          this.armThanksTimer();
          break;
        }
        case 'closed':
          this.closed = true;
          break;
        case 'order':
        case 'idle':
          this.payment = null;
          this.resetTip();
          this.tipBase = null; // cobro cancelado: la base era de ese cobro
          this.closed = false;
          this.clearThanks();
          break;
        case 'payment':
        case 'tip':
          return;
      }
      this.requestFlush();
    } catch (err) {
      warn('setMode', err);
    }
  }

  // -------------------------------------------------------------------------
  // Lectura
  // -------------------------------------------------------------------------

  /** Estado que se emitiría ahora mismo (derivado). Para la vista previa del indicador y las pruebas. */
  getState(): DisplayState {
    return this.buildState();
  }

  /** ¿Hay transporte abierto (interruptor encendido y entorno compatible)? */
  get isEmitting(): boolean {
    return this.transport !== null;
  }

  /** Instante del último `display_alive` / `need_snapshot` visto por el transporte; null sin transporte o sin pantalla. */
  get lastDisplaySeenAt(): number | null {
    return this.transport?.lastDisplaySeenAt ?? null;
  }

  /**
   * Última señal de la pantalla por origen (Fase 3, parte C): `local`
   * (ventana en esta máquina) y `remote` (tableta por Supabase Broadcast).
   * null sin transporte. Con un transporte que no distinga orígenes se lee
   * `lastDisplaySeenAt` como local. El indicador del POS lo usa para decir
   * «conectada (local / remota / ambas)».
   */
  get lastDisplaySeenByOrigin(): DisplaySeenByOrigin | null {
    const transport = this.transport;
    if (!transport) return null;
    if (transport.lastDisplaySeenByOrigin) return transport.lastDisplaySeenByOrigin;
    return { local: transport.lastDisplaySeenAt, remote: null };
  }

  /**
   * Últimas `capabilities` que la pantalla declaró (`display_alive` /
   * `need_snapshot`): táctil o no, y tamaño. null sin transporte, sin
   * pantalla, tras su `display_bye` o si el transporte no las guarda
   * (ronda 2, QA-3). La UI de la caja las usa para no prometer una respuesta
   * que una pantalla NO táctil nunca dará (PLAN §4.4).
   *
   * Con pantalla por los DOS tubos (F3-C) el transporte las anota por origen
   * y devuelve la COMBINACIÓN de las vivas —táctil si alguna lo es—, no la
   * última que habló: ver `combineDisplayCapabilities` (transport.ts). Así el
   * aviso de propina no alterna de texto con cada latido cuando el monitor
   * del mostrador no es táctil y la tableta sí.
   */
  get lastDisplayCapabilities(): DisplayCapabilities | null {
    return this.transport?.lastDisplayCapabilities ?? null;
  }

  /**
   * Capacidades declaradas POR ORIGEN (F3-C ronda 5 · 1). null sin transporte
   * o con un transporte que no las anote por origen (F0–F2). La UI de la caja
   * lo combina con los orígenes VIVOS de la presencia
   * (`combineLiveDisplayCapabilities`, presence.ts) para que una tableta que
   * muere sin despedirse deje de contar: el transporte no juzga el silencio,
   * igual que no lo juzga en `lastDisplaySeenAt`.
   */
  get lastDisplayCapabilitiesByOrigin(): DisplayCapabilitiesByOrigin | null {
    return this.transport?.lastDisplayCapabilitiesByOrigin ?? null;
  }

  /**
   * Cambios de `lastDisplayCapabilities` (ronda 3 de F2-B, QA-5): se avisa
   * cuando la pantalla declara capacidades distintas (`display_alive` /
   * `need_snapshot` con otro táctil o tamaño), cuando se despide
   * (`display_bye` → null) y cuando el transporte se cierra (null). La UI de
   * la caja (TipFromDisplayNotice) lo usa para que el aviso «esperando la
   * propina…» / «registre lo que indique el cliente» siga a lo que la
   * pantalla PINTA sin quedarse un render atrás: la pantalla reemite
   * `display_alive` con el táctil RESUELTO (detección + forzado de los
   * ajustes) en cuanto conoce `hello.settings.touch` (displayLink.ts). Solo
   * con cambio real (comparación serializada). Un oyente que lance no afecta
   * al resto. Devuelve la baja. Sobrevive a stop()/start().
   */
  onDisplayCapabilitiesChange(listener: (capabilities: DisplayCapabilities | null) => void): () => void {
    this.capabilitiesListeners.add(listener);
    return () => {
      this.capabilitiesListeners.delete(listener);
    };
  }

  /**
   * Ajustes de presentación que la caja tiene en caché (`getSettings`), o
   * null si el cableado no los provee o la lectura lanza. Para que la UI de
   * la caja aplique el MISMO forzado táctil que la pantalla
   * (`settings.touch`, PLAN §4.4) sin conocer settings.ts ni la organización.
   */
  /**
   * Venta que la pantalla está agradeciendo ahora mismo, o null. La usa la
   * caja para registrar la calificación del cliente contra la venta correcta
   * (ver `thanksSaleId`).
   */
  get ratingSaleId(): string | null {
    return this.thanks ? this.thanksSaleId : null;
  }

  /**
   * Identificador del «Gracias» que la caja está mostrando, o null si ya no
   * hay ninguno. La caja compara con el `thanksId` del mensaje `rating` antes
   * de registrar nada (ver posDisplay.ts).
   */
  get ratingThanksId(): string | null {
    return this.thanks ? this.thanksId : null;
  }

  /** ¿La organización pide calificación al terminar la venta? (ajuste `rating.enabled`). */
  private ratingEnabled(): boolean {
    return this.presentationSettings?.rating?.enabled === true;
  }

  get presentationSettings(): DisplayPresentationSettings | null {
    if (!this.getSettings) return null;
    try {
      const settings: unknown = this.getSettings();
      return typeof settings === 'object' && settings !== null && !Array.isArray(settings) ? (settings as DisplayPresentationSettings) : null;
    } catch (err) {
      warn('getSettings', err);
      return null;
    }
  }

  /** Cuántos `state` se han publicado (pruebas). */
  get emittedStateCount(): number {
    return this.stateCount;
  }

  /**
   * Intenciones de la pantalla hacia la UI de la caja (Fase 2, PLAN §8):
   * `qr_paid_claim` («el cliente indica que ya pagó»: solo avisa, la
   * confirmación sigue siendo del cajero o del webhook), `tip_selected`,
   * `rating`. El emisor NO cambia su estado con ninguna de ellas: quien se
   * suscribe decide qué hacer (un toast, registrar la propina por su flujo).
   * `need_snapshot` y la presencia (`display_alive`/`display_bye`) no se
   * reenvían: los atiende el emisor y el transporte. Devuelve la baja. Un
   * oyente que lance no afecta ni al resto ni al emisor. Sobrevive a
   * stop()/start(): se registra una vez por componente.
   */
  onUp(listener: (msg: UpMessage) => void): () => void {
    this.upListeners.add(listener);
    return () => {
      this.upListeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /** ¿La firma del override (si la tiene) casa con la proyección dada? Sin firma, siempre true. */
  private matchesOverrideSignature(cart: DisplayCart): boolean {
    const override = this.totalsOverride;
    if (!override || override.signature === null) return true;
    return linesSignature(cart) === override.signature;
  }

  private project(): DisplayCart | null {
    if (!this.cart) return null;
    // Lista blanca de carritos vivos, la misma que POSService.getActiveCarts:
    // hold_with_debt (facturado a crédito), cancelled (deuda anulada) y
    // completed ya no son un pedido pendiente que mostrar.
    if (this.cart.status !== 'active' && this.cart.status !== 'hold') return null;
    const totals = this.totalsOverride && this.totalsOverride.cartId === this.cart.id ? this.totalsOverride.totals : null;
    return projectCartForDisplay(this.cart, { currency: this.currency, totals, lastChangedLineId: null });
  }

  /**
   * Olvida todo lo que pertenece a la organización anterior (cambio en
   * caliente). No toca transporte ni sesión: de eso se encarga start().
   */
  private forgetOrganizationState(): void {
    this.cart = null;
    this.projectedCart = null;
    this.activeCartId = null;
    this.totalsOverride = null;
    this.lastChangedLineId = null;
    this.payment = null;
    this.resetTip();
    this.tipBase = null; // la base de la organización anterior no viaja en el primer «tip» de la nueva (QA-1, ronda 2)
    this.closed = false;
    this.clearThanks();
  }

  /**
   * Abre la fase de propina si la organización la tiene activada
   * (`getSettings().tips.enabled`) con al menos un preset válido o «Otro», y
   * hay líneas que cobrar. Presets y «Otro» se congelan aquí: un cambio de
   * ajustes a mitad de cobro no cambia la pregunta que el cliente ya ve.
   */
  private beginTipPhase(): void {
    this.resetTip();
    if (!this.getSettings || !hasLines(this.projectedCart)) return;
    let settings: DisplayPresentationSettings | undefined;
    try {
      settings = this.getSettings();
    } catch (err) {
      warn('getSettings', err);
      return;
    }
    const tips = settings?.tips;
    if (!tips || tips.enabled !== true) return;
    const presets = Array.isArray(tips.presets) ? Array.from(new Set(tips.presets.filter(isValidTipPercent))) : [];
    const allowCustom = tips.allowCustom === true;
    if (presets.length === 0 && !allowCustom) return;
    this.tipConfig = { presets, allowCustom };
    this.setTipPhase('pending');
  }

  /** No toca `tipBase`: beginTipPhase lo llama al abrir y la base que fijó la caja para ESTE cobro debe seguir. */
  private resetTip(): void {
    this.setTipPhase(null);
    this.tipConfig = null;
    this.tipSelected = null;
    this.tipResolved = null;
  }

  /** Único punto que escribe `tipState`; avisa a onTipPhaseChange solo si cambió. */
  private setTipPhase(next: TipPhase): void {
    if (this.tipState === next) return;
    this.tipState = next;
    for (const listener of Array.from(this.tipPhaseListeners)) {
      try {
        listener(next);
      } catch (err) {
        warn('onTipPhaseChange', err);
      }
    }
  }

  /** Base del cálculo: la que fijó la caja o, sin ella, el total proyectado. */
  private effectiveTipBase(): number {
    if (this.tipBase !== null) return this.tipBase;
    return this.projectedCart?.total ?? 0;
  }

  /** ¿La elección está entre lo que la fase ofreció? `none` siempre; `amount` con allowCustom; `percent` solo si es un preset. */
  private isOfferedTipChoice(kind: TipSelectedMessage['kind'], value: number): boolean {
    if (kind === 'none') return true;
    const config = this.tipConfig;
    if (config === null) return false;
    if (kind === 'amount') return config.allowCustom;
    return config.presets.includes(value);
  }

  private tipBlock(): DisplayTipBlock {
    const config = this.tipConfig ?? { presets: [], allowCustom: false };
    return { presets: [...config.presets], allowCustom: config.allowCustom, selected: this.tipSelected, base: this.effectiveTipBase() };
  }

  /**
   * `tip_selected` de la pantalla: cierra la fase (la pantalla pasa a
   * «Cobro») y avisa a la caja con el importe resuelto. Se descarta fuera
   * de la fase pendiente o si habla de otro carrito (una pantalla rezagada).
   *
   * Tolerancia (ronda 2, QA-4): un `percent` que no es un entero en [1, 100]
   * o un `amount` con más de TIP_CUSTOM_MAX_DIGITS cifras se DESCARTA sin
   * cerrar la fase (aviso en consola). La pantalla propia nunca los manda
   * (tip.ts / TipView los limitan), pero otra pantalla (F3 Realtime) o un
   * sobre fabricado sí podrían; antes el primero se resolvía como «Sin
   * propina» y cerraba la pregunta, y el segundo llegaba a la caja tal cual.
   *
   * Y solo lo que se OFRECIÓ (ronda 5, tester r4 bloque B): la configuración
   * congelada al abrir la fase (`tipConfig`) es el contrato con la pantalla.
   * Un `amount` exige `allowCustom`; un `percent` debe estar en `presets`.
   * Lo que no casa se descarta igual, sin cerrar la fase, con aviso en
   * consola: la única barrera ya no es el «Aplicar» del cajero.
   */
  private acceptTipSelection(msg: TipSelectedMessage): void {
    if (this.tipState !== 'pending') return;
    const cartId = this.projectedCart?.id ?? null;
    if (cartId === null || msg.cartId !== cartId) return;
    if (!isAcceptableTipChoice(msg.kind, msg.value)) {
      console.warn('[pos-display] tip_selected descartado: valor fuera de rango', { kind: msg.kind, value: msg.value });
      return;
    }
    if (!this.isOfferedTipChoice(msg.kind, msg.value)) {
      console.warn('[pos-display] tip_selected descartado: no está entre lo ofrecido', { kind: msg.kind, value: msg.value, offered: this.tipConfig });
      return;
    }
    this.tipSelected = msg;
    // Se resuelve UNA vez con la base que el cliente vio y se CONGELA: el
    // getter `tipSelection` y todos los oyentes reciben esta misma referencia
    // (no se re-resuelve) y ninguno puede cambiarle la cifra.
    const selection: Readonly<TipSelection> = Object.freeze(
      resolveTipSelection(msg.cartId, this.effectiveTipBase(), { kind: msg.kind, value: msg.value }),
    );
    this.tipResolved = selection;
    this.setTipPhase('done');
    this.requestFlush();
    for (const listener of Array.from(this.tipListeners)) {
      try {
        listener(selection);
      } catch (err) {
        warn('onTipSelected', err);
      }
    }
  }

  /**
   * Deriva el `state` que viaja. Orden: closed > thanks > cobro QR con código
   * > propina pendiente (con líneas y base > 0) > cobro > pedido > reposo. El cobro QR con código va
   * ANTES que la propina pendiente (Fase 2-C): al generar el QR la caja
   * proyecta `payment.qr`, y si la fase de propina siguiera tapándolo, en una
   * pantalla no táctil (propina informativa, PLAN §4.4) el cliente nunca
   * vería el código hasta que el cajero pulsara «Omitir». Vale para cualquier
   * caja que use el emisor, no solo CheckoutDialog. La fase NO se cierra
   * (tipPhase sigue 'pending'): un QR sin código (interruptor «Mostrar en
   * pantalla» apagado) o retirado vuelve a mostrar la pregunta.
   *
   * Un QR VENCIDO también se impone (ronda 3): resolveDisplayQr deja `qr:
   * null` pero conserva `expiresAt`, y la pantalla ya sabe decir «El código
   * venció». Si no se impusiera, cualquier recálculo del efecto de
   * CheckoutDialog tras el vencimiento haría saltar la pantalla de «venció» a
   * la pregunta de propina mientras el cajero regenera el código. La regla:
   * `qr !== null` (código vivo) o `expiresAt` numérico (vencido) → cobro QR;
   * `qr` y `expiresAt` ambos null (interruptor apagado) → sigue la propina.
   */
  private buildState(): DisplayState {
    const cart = this.projectedCart;
    if (this.closed) return { ...IDLE_STATE, mode: 'closed' };
    if (this.thanks) return { ...IDLE_STATE, mode: 'thanks', thanks: this.thanks };
    if (this.payment && this.payment.method === 'qr' && (!!this.payment.qr || Number.isFinite(this.payment.expiresAt))) {
      return { ...IDLE_STATE, mode: 'payment', cart: this.withHighlight(cart), payment: this.payment };
    }
    // Base 0 (cortesía, descuento del 100 %): no hay nada sobre lo que
    // preguntar («5 % · $0») y se pinta el cobro. Derivado, como `hasLines`:
    // la fase sigue pendiente y, si la base cambia, la pregunta aparece.
    if (this.payment && this.tipState === 'pending' && hasLines(cart) && this.effectiveTipBase() > 0) {
      return { ...IDLE_STATE, mode: 'tip', cart: this.withHighlight(cart), payment: this.payment, tip: this.tipBlock() };
    }
    if (this.payment) {
      return { ...IDLE_STATE, mode: 'payment', cart: this.withHighlight(cart), payment: this.payment };
    }
    if (hasLines(cart)) return { ...IDLE_STATE, mode: 'order', cart: this.withHighlight(cart) };
    return { ...IDLE_STATE };
  }

  private withHighlight(cart: DisplayCart | null): DisplayCart | null {
    if (!cart) return null;
    if (cart.lastChangedLineId === this.lastChangedLineId) return cart;
    return { ...cart, lastChangedLineId: this.lastChangedLineId };
  }

  private helloDraft(): HelloDraft {
    const hello: HelloDraft = {
      t: 'hello',
      organizationId: this.organizationId,
      cashier: this.session.cashier,
      sessionOpen: this.session.sessionOpen,
      // La pantalla la usa cuando el state no trae carrito (thanks, cobro sin líneas): ver protocol.ts.
      currency: this.currency,
      // F2-B: con dos pestañas de /app/pos la pantalla prefiere a la visible (transport.ts · isBetterHello).
      visible: this.windowVisible(),
    };
    // Fase 2: ajustes de presentación (propina, calificación, impuestos, idioma, táctil).
    // Solo si el cableado los provee: así el hello de la Fase 0 no cambia de forma.
    if (this.getSettings) {
      try {
        const settings: unknown = this.getSettings();
        // Solo un objeto viaja: `null`/`undefined` haría que isDownMessage rechazara el saludo ENTERO
        // en la pantalla (posDisplay.ts nunca devuelve null hoy; es una guarda contra un cableado futuro).
        if (typeof settings === 'object' && settings !== null && !Array.isArray(settings)) {
          hello.settings = settings as DisplayPresentationSettings;
        }
      } catch (err) {
        warn('getSettings', err); // el saludo sale igual, sin ajustes: la pantalla se queda en «solo resumen»
      }
    }
    return hello;
  }

  /**
   * ¿Se puede publicar ahora mismo? Relee el interruptor en memoria; si se
   * apagó sin `refresh()`, cierra el transporte y devuelve false. Lo llaman
   * `announce` y `flush`: ninguna publicación sale con el interruptor apagado.
   */
  private ensureEnabledOrClose(): boolean {
    if (!this.transport) return false;
    if (this.isEnabled()) return true;
    this.cancelPending();
    this.closeTransport();
    return false;
  }

  /** hello + state completo en la misma vuelta (contrato del transporte). Cancela cualquier state pendiente: ya va incluido. */
  private announce(): void {
    if (!this.ensureEnabledOrClose() || !this.transport) return;
    this.cancelPending();
    const state = this.buildState();
    this.transport.announce(this.helloDraft(), state);
    this.stateCount += 1;
    this.lastEmittedJson = JSON.stringify(state);
    this.lastChangedLineId = null; // el resaltado ya viajó; no se repite en la siguiente emisión
    this.notifyStatePublished(state);
  }

  private notifyStatePublished(state: DisplayState): void {
    for (const listener of Array.from(this.stateListeners)) {
      try {
        listener(state);
      } catch (err) {
        warn('onStatePublished', err);
      }
    }
  }

  private openTransport(): void {
    if (this.transport) return;
    let transport: DisplayTransport | null = null;
    try {
      transport = this.createTransport();
    } catch (err) {
      warn('createTransport', err);
      return;
    }
    if (!transport) return;
    this.transport = transport;
    this.lastEmittedJson = null;
    this.unsubscribeUp = transport.onUp((msg) => this.handleUp(msg));
    transport.startHeartbeat();
  }

  private closeTransport(): void {
    if (!this.transport) return;
    const transport = this.transport;
    this.transport = null;
    if (this.unsubscribeUp) {
      this.unsubscribeUp();
      this.unsubscribeUp = null;
    }
    this.lastEmittedJson = null;
    try {
      transport.stopHeartbeat();
      transport.close();
    } catch (err) {
      warn('closeTransport', err);
    }
    // Sin transporte no hay pantalla: `lastDisplayCapabilities` pasa a null y quien escuche lo sabe.
    this.notifyCapabilitiesIfChanged();
  }

  /** Avisa a onDisplayCapabilitiesChange solo si `lastDisplayCapabilities` cambió desde el último aviso. */
  private notifyCapabilitiesIfChanged(): void {
    const capabilities = this.lastDisplayCapabilities;
    const json = capabilities === null ? null : JSON.stringify(capabilities);
    if (json === this.lastCapabilitiesJson) return;
    this.lastCapabilitiesJson = json;
    for (const listener of Array.from(this.capabilitiesListeners)) {
      try {
        listener(capabilities === null ? null : { ...capabilities });
      } catch (err) {
        warn('onDisplayCapabilitiesChange', err);
      }
    }
  }

  private handleUp(msg: UpMessage): void {
    // Fase 0 solo atiende la petición de snapshot; propina, QR pagado y
    // calificación llegan en fases 2 y 4 y las confirma la caja. Envuelto
    // como el resto de puntos de entrada: un transporte cuyo publish lance
    // (Supabase Realtime en F3) no debe propagar al handler de subida.
    // La respuesta NO depende de la visibilidad (ronda 4 de F2-A): una única
    // pestaña de POS en segundo plano, encendida desde Configuración, abre
    // el transporte sin saludar; la pantalla la adopta por latido, pide
    // snapshot y aquí recibe su hello + state. Con dos pestañas, la ventana
    // de elección del receptor (ADOPTION_WINDOW_MS) resuelve por
    // `visible` primero (F2-B) y luego sessionOpen/seq, no por quién
    // responde la última; y fuera de la ventana una oculta no releva a una
    // visible (transport.ts, regla 2).
    try {
      // El transporte ya anotó (o borró) las capacidades antes de entregar el sobre: se avisa si cambiaron.
      if (msg.t === 'display_alive' || msg.t === 'need_snapshot' || msg.t === 'display_bye') this.notifyCapabilitiesIfChanged();
      if (msg.t === 'need_snapshot') this.announce();
      // F2-B: la elección de propina sí cierra la fase (la pantalla pasa a «Cobro»); aplicarla sigue siendo de la caja.
      if (msg.t === 'tip_selected') this.acceptTipSelection(msg);
    } catch (err) {
      warn('handleUp', err);
    }
    // Fase 2: intenciones para la UI de la caja. No tocan el estado del emisor (salvo tip_selected, arriba).
    // Un sobre sin `t` (basura que un transporte futuro dejara pasar) no se reenvía ni rompe.
    const type = typeof msg === 'object' && msg !== null ? msg.t : undefined;
    if (typeof type !== 'string' || type === 'need_snapshot' || type === 'display_alive' || type === 'display_bye') return;
    for (const listener of Array.from(this.upListeners)) {
      try {
        listener(msg);
      } catch (err) {
        warn('onUp', err);
      }
    }
  }

  private requestFlush(): void {
    if (!this.transport || this.pendingFlush) return;
    this.pendingFlush = this.schedule(() => {
      this.pendingFlush = null;
      this.flush();
    });
  }

  private cancelPending(): void {
    if (!this.pendingFlush) return;
    this.pendingFlush();
    this.pendingFlush = null;
  }

  private flush(): void {
    try {
      if (!this.ensureEnabledOrClose() || !this.transport) return;
      const state = this.buildState();
      const json = JSON.stringify(state);
      // Misma proyección que la última emitida (la página y posService
      // informan del mismo cambio por dos caminos): no se repite.
      if (json === this.lastEmittedJson) return;
      this.lastEmittedJson = json;
      this.stateCount += 1;
      this.transport.publish({ t: 'state', state });
      this.lastChangedLineId = null; // el resaltado ya viajó; no se repite en la siguiente emisión
      this.notifyStatePublished(state);
    } catch (err) {
      warn('flush', err);
    }
  }

  private armThanksTimer(): void {
    this.clearThanksTimer();
    this.thanksTimer = setTimeout(() => {
      this.thanksTimer = null;
      this.thanks = null;
      this.thanksSaleId = null;
      this.thanksId = null;
      this.requestFlush();
    }, this.thanksDurationMs);
    const maybeUnref = this.thanksTimer as unknown as { unref?: () => void };
    if (typeof maybeUnref.unref === 'function') maybeUnref.unref();
  }

  private clearThanksTimer(): void {
    if (this.thanksTimer === null) return;
    clearTimeout(this.thanksTimer);
    this.thanksTimer = null;
  }

  private clearThanks(): void {
    this.clearThanksTimer();
    this.thanks = null;
    this.thanksSaleId = null;
    this.thanksId = null;
  }
}
