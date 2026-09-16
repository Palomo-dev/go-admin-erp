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
 *   closed (setMode('closed'))  >  thanks  >  payment  >  order (≥ 1 línea)  >  idle
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
import type { DisplayCart, DisplayMode, DisplayPayment, DisplayState, UpMessage } from './protocol';
import { projectCartForDisplay, type DisplayTotalsOverride } from './projection';
import type { DisplayTransport, HelloDraft } from './transport';

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
  /** Por defecto: requestAnimationFrame si existe, si no setTimeout(0). */
  schedule?: Scheduler;
  /** Duración de «Gracias». Por defecto THANKS_DURATION_MS; las pruebas lo acortan. */
  thanksDurationMs?: number;
}

interface TotalsOverrideForCart {
  cartId: string;
  totals: DisplayTotalsOverride;
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

function isValidOrganizationId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function hasLines(cart: DisplayCart | null): cart is DisplayCart {
  return cart !== null && cart.lines.length > 0;
}

type DisplayLine = DisplayCart['lines'][number];

/** Lo que cuenta como «la misma línea» para el resaltado: cantidad, precio, descuento, nota y número de modificadores. */
function isSameLine(a: DisplayLine, b: DisplayLine): boolean {
  return (
    a.id === b.id &&
    a.qty === b.qty &&
    a.unitPrice === b.unitPrice &&
    a.discount === b.discount &&
    a.note === b.note &&
    a.modifiers.length === b.modifiers.length
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
 * Línea que acaba de cambiar entre dos proyecciones, para el resaltado de
 * 600 ms (PLAN §4.1). Solo si cambió UNA línea (nueva, o con distinta
 * cantidad/precio/descuento/nota); si cambiaron varias o ninguna, null.
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

export class DisplayEmitter {
  private readonly createTransport: () => DisplayTransport | null;
  private readonly isEnabled: () => boolean;
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
  private thanks: DisplayState['thanks'] = null;
  private thanksTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  private pendingFlush: Cancel | null = null;
  private lastEmittedJson: string | null = null;
  private stateCount = 0;

  constructor(options: DisplayEmitterOptions) {
    this.createTransport = options.createTransport;
    this.isEnabled = options.isEnabled;
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
      this.refresh(); // abre el transporte y saluda si el interruptor está encendido
      if (hadTransport && this.transport) this.announce(); // ya estaba abierto: vuelve a saludar con los datos nuevos
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
      this.closed = false;
      this.closeTransport();
    } catch (err) {
      warn('stop', err);
    }
  }

  /**
   * Relee el interruptor maestro. Encendido y sin transporte → lo abre y
   * saluda; apagado y con transporte → lo cierra (la pantalla pasa a
   * «Conectando» y luego a «Reposo»). La Parte D lo llama tras guardar.
   */
  refresh(): void {
    try {
      if (!this.started) return;
      const enabled = this.isEnabled();
      if (enabled && !this.transport) {
        this.openTransport();
        if (this.transport) this.announce();
      } else if (!enabled && this.transport) {
        this.cancelPending();
        this.closeTransport();
      }
    } catch (err) {
      warn('refresh', err);
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

  /** Nombre del cajero y estado de la caja. Cambiarlos vuelve a emitir `hello` (PLAN §5.2). */
  setSession(session: Partial<DisplaySessionInfo>): void {
    try {
      const next: DisplaySessionInfo = {
        cashier: session.cashier !== undefined ? session.cashier : this.session.cashier,
        sessionOpen: session.sessionOpen !== undefined ? session.sessionOpen : this.session.sessionOpen,
      };
      const changed = next.sessionOpen !== this.session.sessionOpen || next.cashier?.name !== this.session.cashier?.name;
      this.session = next;
      if (changed && this.transport) this.announce();
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
      }
      const changed = findChangedLineId(prev, next);
      if (changed !== null) this.lastChangedLineId = changed;
      else if (!equivalent) this.lastChangedLineId = null;
      this.projectedCart = next;
      if (fromMutation && !equivalent && hasLines(next) && this.thanks) this.clearThanks();
      if (fromMutation && next === null && this.payment) this.payment = null;
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
   */
  setTotals(cartId: string, totals: DisplayTotalsOverride | null): void {
    try {
      if (typeof cartId !== 'string' || cartId.length === 0) return;
      if (totals === null) {
        if (this.totalsOverride?.cartId !== cartId) return;
        this.totalsOverride = null;
      } else {
        const same =
          this.totalsOverride?.cartId === cartId &&
          this.totalsOverride.totals.discountTotal === totals.discountTotal &&
          this.totalsOverride.totals.taxTotal === totals.taxTotal &&
          this.totalsOverride.totals.total === totals.total;
        if (same) return;
        this.totalsOverride = { cartId, totals: { ...totals } };
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
      this.payment = payment;
      if (payment && this.thanks) this.clearThanks();
      this.requestFlush();
    } catch (err) {
      warn('setPayment', err);
    }
  }

  /**
   * - `thanks`: venta confirmada. Muestra «Gracias» con `total` y vuelve al
   *   modo derivado a los THANKS_DURATION_MS (o antes, si entra una línea).
   * - `closed`: sin caja abierta. Se mantiene hasta `order`/`idle`.
   * - `order` / `idle`: limpia cobro, gracias y cerrado; el carrito decide.
   * - `payment`: no hace nada por sí solo; el modo lo fija setPayment.
   * - `tip`: fuera de la Fase 0; se ignora.
   * Con la caja sin arrancar (CheckoutDialog en mesas o nueva venta) se ignora.
   */
  setMode(mode: DisplayMode, extra?: { total?: number; askRating?: boolean }): void {
    try {
      if (!this.started) return;
      switch (mode) {
        case 'thanks': {
          const total = typeof extra?.total === 'number' && Number.isFinite(extra.total) ? extra.total : this.projectedCart?.total ?? 0;
          this.payment = null;
          this.closed = false;
          this.thanks = { total, askRating: extra?.askRating === true };
          this.armThanksTimer();
          break;
        }
        case 'closed':
          this.closed = true;
          break;
        case 'order':
        case 'idle':
          this.payment = null;
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

  /** Cuántos `state` se han publicado (pruebas). */
  get emittedStateCount(): number {
    return this.stateCount;
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

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
    this.closed = false;
    this.clearThanks();
  }

  private buildState(): DisplayState {
    const cart = this.projectedCart;
    if (this.closed) return { ...IDLE_STATE, mode: 'closed' };
    if (this.thanks) return { ...IDLE_STATE, mode: 'thanks', thanks: this.thanks };
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
    return {
      t: 'hello',
      organizationId: this.organizationId,
      cashier: this.session.cashier,
      sessionOpen: this.session.sessionOpen,
      // La pantalla la usa cuando el state no trae carrito (thanks, cobro sin líneas): ver protocol.ts.
      currency: this.currency,
    };
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
  }

  private handleUp(msg: UpMessage): void {
    // Fase 0 solo atiende la petición de snapshot; propina, QR pagado y
    // calificación llegan en fases 2 y 4 y las confirma la caja. Envuelto
    // como el resto de puntos de entrada: un transporte cuyo publish lance
    // (Supabase Realtime en F3) no debe propagar al handler de subida.
    try {
      if (msg.t === 'need_snapshot') this.announce();
    } catch (err) {
      warn('handleUp', err);
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
    } catch (err) {
      warn('flush', err);
    }
  }

  private armThanksTimer(): void {
    this.clearThanksTimer();
    this.thanksTimer = setTimeout(() => {
      this.thanksTimer = null;
      this.thanks = null;
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
  }
}
