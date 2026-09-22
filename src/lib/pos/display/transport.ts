/**
 * Transporte entre la caja y la pantalla del cliente (PLAN §3.2 y §8).
 *
 * Dos roles sobre el mismo canal `pos-display:<terminalId>`:
 * - DisplayTransport  (caja):     publica DownMessage, escucha UpMessage.
 * - DisplayReceiver   (pantalla): escucha DownMessage, envía UpMessage.
 *
 * Implementación de Fase 0: BroadcastChannel (misma máquina, mismo origen;
 * cubre Electron y web, ~0 ms, sin servidor). Funciona también en Node ≥ 18,
 * que expone BroadcastChannel como global, y así se prueba sin navegador.
 * La Fase 3 añade SupabaseBroadcastTransport con estas mismas interfaces.
 *
 * Diferencias respecto al borrador del PLAN §3.2, ya recogidas en PLAN §8
 * («Lo que la implementación de la Parte A cambió»):
 * - `publish()` recibe un DownMessageDraft, no un DownMessage: el transporte
 *   es dueño del sobre (`v`, `seq`, `terminalId`, `instanceId`) y lo escribe
 *   DESPUÉS del borrador, así un draft que traiga esas claves no lo pisa.
 * - La interfaz expone `startHeartbeat()`/`stopHeartbeat()`: la caja no debe
 *   depender de la clase concreta para latir.
 * - `announce(hello, state)`: publica hello y state en ese orden y en la
 *   misma vuelta. El orden importa: el receptor solo adopta una instancia
 *   nueva por su `hello`, así que un `state` publicado antes del `hello` se
 *   descarta (regla 3) y la pantalla se queda con el carrito de la instancia
 *   anterior hasta el siguiente state. Tras relevar (foco, recarga) y al
 *   responder a need_snapshot, la caja usa announce(), no dos publish().
 * - Presencia pantalla → caja (PLAN §5.1, indicador verde/gris): el receptor
 *   emite `display_alive` cada HEARTBEAT_INTERVAL_MS con startPresence() y
 *   `display_bye` al cerrar; el transporte expone `lastDisplaySeenAt`
 *   (instante del último display_alive o need_snapshot aceptado; null tras
 *   display_bye). La caja pinta verde si now − lastDisplaySeenAt <
 *   STALE_AFTER_MS. Los mensajes de presencia van a TODAS las pestañas de la
 *   terminal, sin `toInstanceId`: la pantalla existe para la caja física.
 *   Una pantalla por terminal en F0: con dos, el `display_bye` de una deja
 *   `lastDisplaySeenAt` en null hasta el siguiente `display_alive` de la otra
 *   (≤ 1 s); el indicador parpadea en gris ese instante y vuelve a verde.
 * - Versión incompatible: un sobre de esta terminal con `v ≠ PROTOCOL_VERSION`
 *   se descarta, pero el receptor lo anota en `incompatibleVersionAt` /
 *   `incompatibleVersionCount` para que la pantalla diga «Actualice la
 *   pantalla» en vez de quedarse en «Conectando» para siempre.
 * Lo que PLAN §8 detalla a partir de este archivo: la ventana de elección, el
 * watchdog de silencio, `releaseActiveInstance()` y los getters `lastByeAt` /
 * `lastStaleAt`.
 *
 * Regla de producto — «la última caja que saluda es la que proyecta»:
 * en web es habitual abrir /app/pos en dos pestañas; comparten terminalId
 * (localStorage) y canal, pero cada una es una instancia distinta con su
 * propio `instanceId` y su propio `seq`. La pantalla sigue a UNA instancia
 * activa: el `hello` más reciente la fija (y reinicia la marca de seq), los
 * mensajes de cualquier otra instancia —incluidos sus latidos— se descartan,
 * y el `bye` de la activa la libera para que la siguiente que hable la
 * releve (con la marca de seq limpia: el contador es por instancia). Por eso
 * la caja debe emitir hello + state al recuperar el foco
 * (`focus`/`visibilitychange`): así la pestaña que usa el cajero recupera
 * la pantalla sin que el usuario haga nada.
 *
 * Excepción — la ventana de elección tras un `need_snapshot` sin
 * destinatario (pantalla recién abierta, tras soltar la activa, o con una
 * activa PROVISIONAL adoptada por latido o state y aún sin hello): las dos
 * pestañas responden hello + state casi a la vez y «gana el último hello»
 * dejaría la pantalla en manos del azar. Durante ADOPTION_WINDOW_MS a
 * partir de ese envío, un hello de otra instancia solo releva a la activa
 * si es ESTRICTAMENTE mejor: primero `visible: true` sobre `false` (Fase
 * 2-B: la pestaña que el cajero tiene delante; solo cuando las dos lo
 * declaran), luego `sessionOpen: true` sobre `false`
 * (la pestaña con caja abierta es la que vende), a igualdad el `seq` mayor
 * (la que más lleva trabajando), y en empate total se conserva la que ya
 * está. Un hello siempre releva a una instancia adoptada sin hello (por un
 * latido o un state). Fuera de la ventana rige la regla general.
 *
 * Si la activa muere sin `bye` (crash, pestaña matada), el receptor la
 * suelta solo tras STALE_AFTER_MS sin ningún mensaje aceptado —el mismo
 * umbral con el que la UI pasa a «Conectando»— y `releaseActiveInstance()`
 * permite soltarla antes. Así el siguiente need_snapshot sale sin
 * destinatario y lo atiende la pestaña viva.
 *
 * En sentido contrario, las intenciones de la pantalla van dirigidas a la
 * instancia activa (`toInstanceId`): la pestaña que no proyecta no ve la
 * propina elegida ni responde al need_snapshot. Sin instancia activa la
 * intención no lleva destinatario y la atiende cualquiera.
 */

import {
  PROTOCOL_VERSION,
  UP_PRESENCE_TYPES,
  isDownMessage,
  isIncompatibleEnvelope,
  isUpMessage,
  type DisplayCapabilities,
  type DisplayState,
  type DownMessage,
  type DownMessageDraft,
  type UpMessage,
  type UpMessageDraft,
} from './protocol';
import { generateTerminalId } from './terminal';

/** Borrador del `hello` que publica la caja (el transporte pone el sobre). */
export type HelloDraft = Extract<DownMessageDraft, { t: 'hello' }>;

/** Lado caja: emite el estado y recibe intenciones de la pantalla. */
export interface DisplayTransport {
  /**
   * Publica un mensaje de bajada. Nunca lanza: un fallo al serializar o
   * publicar se registra con console.warn y se traga, para que el flujo de
   * venta no dependa de la pantalla (PLAN §5.5).
   *
   * Orden hello → state: el receptor solo adopta una instancia nueva por su
   * `hello`; un `state` de una instancia que aún no saludó se descarta. Tras
   * relevar (foco, recarga) o al responder a need_snapshot usar announce(),
   * que publica ambos en el orden correcto y en la misma vuelta.
   */
  publish(msg: DownMessageDraft): void;
  /** Publica `hello` y a continuación `state`, en ese orden, en la misma vuelta de eventos. */
  announce(hello: HelloDraft, state: DisplayState): void;
  /** Solo entrega intenciones dirigidas a esta instancia (o sin destinatario). */
  onUp(handler: (msg: UpMessage) => void): () => void;
  /** Latido periódico (HEARTBEAT_INTERVAL_MS). Idempotente. */
  startHeartbeat(): void;
  stopHeartbeat(): void;
  close(): void;
  /**
   * Instante (reloj del transporte) del último `display_alive` o
   * `need_snapshot` aceptado; null si nunca hubo pantalla o tras su
   * `display_bye`. La caja pinta «pantalla conectada» si
   * now − lastDisplaySeenAt < STALE_AFTER_MS.
   */
  readonly lastDisplaySeenAt: number | null;
  /**
   * Últimas `capabilities` declaradas por la pantalla (`display_alive` /
   * `need_snapshot`); null si nunca hubo pantalla o tras su `display_bye`.
   * Opcional (aditivo, ronda 2 de F2-B): un transporte que no las guarde se
   * lee como null y la caja no asume nada sobre la pantalla.
   */
  readonly lastDisplayCapabilities?: DisplayCapabilities | null;
}

/** Lado pantalla: recibe el estado y devuelve intenciones a la caja. */
export interface DisplayReceiver {
  /**
   * Envía una intención a la instancia activa (a todas si aún no hay). Nunca
   * lanza. Un `need_snapshot` va a todas también cuando la activa es
   * provisional (adoptada por latido o state, sin hello): así la pestaña con
   * caja abierta siempre oye la pregunta y entra en la elección.
   */
  send(msg: UpMessageDraft): void;
  onDown(handler: (msg: DownMessage) => void): () => void;
  /**
   * Suelta la instancia activa sin esperar al watchdog. La UI lo llama al
   * entrar en «Conectando» para que su siguiente need_snapshot no vaya
   * dirigido a una pestaña que quizá murió sin `bye`.
   */
  releaseActiveInstance(): void;
  /**
   * Presencia hacia la caja: emite `display_alive` cada HEARTBEAT_INTERVAL_MS
   * con las capacidades de la pantalla (PLAN §4.4). Idempotente: una segunda
   * llamada solo actualiza las capacidades (p. ej. tras un resize); si cambia
   * `touch`, además emite un `display_alive` en el acto (ronda 3 de F2-B).
   */
  startPresence(capabilities: DisplayCapabilities): void;
  stopPresence(): void;
  /** Detiene la presencia, emite `display_bye` (salvo `sayBye: false`) y cierra el canal. */
  close(sayBye?: boolean): void;
  /** Instancia de caja que se sigue; null hasta oír la primera o tras soltarla. */
  readonly activeInstanceId: string | null;
  /** Mayor seq aceptado de la instancia activa (-1 sin instancia). */
  readonly lastSeq: number;
  /** Instante del último mensaje aceptado; con `lastByeAt` distingue silencio de despedida. */
  readonly lastReceivedAt: number | null;
  /** Instante del último `bye` aceptado de la activa: la caja se cerró a propósito. */
  readonly lastByeAt: number | null;
  /** Instante en que el watchdog soltó la activa por silencio: la caja desapareció sin avisar. */
  readonly lastStaleAt: number | null;
  /**
   * Instante del último sobre de ESTA terminal con `v ≠ PROTOCOL_VERSION`
   * (descartado); null si nunca llegó uno. La Parte C muestra «Actualice la
   * pantalla» si es reciente (< STALE_AFTER_MS) y no hay mensajes válidos
   * (`lastReceivedAt` null o más antiguo).
   */
  readonly incompatibleVersionAt: number | null;
  /** Cuántos sobres de otra versión se han descartado desde que se abrió el receptor. */
  readonly incompatibleVersionCount: number;
}

/** Intervalo del latido de la caja. La pantalla pasa a "Conectando" a los 3 s sin latido. */
export const HEARTBEAT_INTERVAL_MS = 1000;

/** Silencio tras el cual el receptor suelta la instancia activa (3 latidos perdidos). */
export const STALE_AFTER_MS = 3 * HEARTBEAT_INTERVAL_MS;

/**
 * Ventana de elección tras un need_snapshot sin destinatario. Las pestañas
 * responden en la misma vuelta de eventos; 500 ms cubre un hello coalescido
 * por requestAnimationFrame y una máquina cargada, sin retrasar la regla
 * general de «gana la última que saluda» más de lo que tarda un foco.
 */
export const ADOPTION_WINDOW_MS = 500;

export function displayChannelName(terminalId: string): string {
  return `pos-display:${terminalId}`;
}

export function isBroadcastChannelSupported(): boolean {
  return typeof BroadcastChannel === 'function';
}

/**
 * Un terminalId vacío abriría el canal «pos-display:» y nadie aceptaría esos
 * mensajes (los guards exigen terminalId no vacío): la caja publicaría al
 * vacío sin ninguna señal. Mejor fallar al construir, donde la Parte B/C lo
 * ve en el acto.
 */
function assertTerminalId(terminalId: unknown): asserts terminalId is string {
  if (typeof terminalId !== 'string' || terminalId.length === 0) {
    throw new Error('[pos-display] terminalId vacío');
  }
}

/**
 * Lo mínimo que el transporte necesita de un canal. BroadcastChannel lo cumple
 * tal cual; en Go Admin Desktop se inyecta un canal sobre el relay del proceso
 * principal (desktopChannel.ts) con la misma forma, para que toda la lógica de
 * sobre, seq, adopción y presencia sea idéntica en los dos casos.
 */
export interface DisplayChannel {
  postMessage(msg: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

/** Fábrica de canal inyectable: `(terminalId) => DisplayChannel`. */
export type DisplayChannelFactory = (terminalId: string) => DisplayChannel;

function openChannel(terminalId: string, factory?: DisplayChannelFactory): DisplayChannel {
  if (factory) return factory(terminalId);
  if (!isBroadcastChannelSupported()) {
    throw new Error('BroadcastChannel no está disponible en este entorno');
  }
  const channel = new BroadcastChannel(displayChannelName(terminalId));
  // En Node el canal mantiene vivo el proceso; en el navegador `unref` no existe.
  const maybeUnref = channel as BroadcastChannel & { unref?: () => void };
  if (typeof maybeUnref.unref === 'function') maybeUnref.unref();
  // BroadcastChannel cumple la forma en tiempo de ejecución, pero su `onmessage`
  // declara `this: BroadcastChannel` y `MessageEvent`, que con strictFunctionTypes
  // no es asignable al tipo más estrecho de DisplayChannel: se adapta explícitamente.
  const adapted: DisplayChannel = {
    postMessage: (msg) => channel.postMessage(msg),
    get onmessage() {
      return channel.onmessage as DisplayChannel['onmessage'];
    },
    set onmessage(handler) {
      channel.onmessage = handler;
    },
    close: () => channel.close(),
  };
  return adapted;
}

function unrefTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void {
  const maybeUnref = timer as unknown as { unref?: () => void };
  if (typeof maybeUnref.unref === 'function') maybeUnref.unref();
}

/**
 * postMessage puede lanzar (DataCloneError si el mensaje lleva algo no
 * clonable). Se avisa y no se propaga: el latido corre en un setInterval y en
 * el navegador una excepción ahí sería un error no capturado que Next muestra
 * como overlay, contra PLAN §5.5 («nunca un error modal por la pantalla»).
 * El seq ya consumido queda como hueco, inocuo para el receptor.
 */
function postSafely(channel: DisplayChannel, msg: DownMessage | UpMessage): void {
  try {
    channel.postMessage(msg);
  } catch (err) {
    console.warn('[pos-display] no se pudo publicar', err);
  }
}

type Listener<T> = (msg: T) => void;

/** Ejecuta cada handler aislando errores: uno que falle no silencia a los demás. */
function dispatch<T>(handlers: Set<Listener<T>>, msg: T): void {
  for (const handler of Array.from(handlers)) {
    try {
      handler(msg);
    } catch (err) {
      console.error('[pos-display] handler falló:', err);
    }
  }
}

export interface BroadcastChannelTransportOptions {
  terminalId: string;
  /** Canal alternativo (p. ej. el relay de escritorio). Por defecto, BroadcastChannel. */
  channelFactory?: DisplayChannelFactory;
  /** Solo para pruebas: reloj inyectable para el `at` del latido y para `lastDisplaySeenAt`. */
  now?: () => number;
  heartbeatIntervalMs?: number;
  /**
   * SOLO PARA PRUEBAS: fija el instanceId en vez de generarlo. NUNCA
   * persistir un instanceId (ni en localStorage ni en sessionStorage): el
   * receptor deduplica por seq dentro de una instancia, y una ventana
   * recargada con el mismo id arranca en seq 1 y queda muda hasta superar
   * el seq de la anterior. En producción cada construcción genera el suyo.
   */
  __testInstanceId?: string;
}

/**
 * Transporte de la caja sobre BroadcastChannel.
 *
 * El transporte es dueño del sobre (`v`, `seq`, `terminalId`, `instanceId`):
 * el emisor solo escribe el cuerpo del mensaje, así no puede producir un seq
 * fuera de orden ni hablar en nombre de otra terminal. `instanceId` se genera
 * una vez por instancia (una por ventana de caja) y no se persiste.
 */
export class BroadcastChannelTransport implements DisplayTransport {
  readonly terminalId: string;
  readonly instanceId: string;
  private readonly channel: DisplayChannel;
  private readonly upHandlers = new Set<Listener<UpMessage>>();
  private readonly now: () => number;
  private readonly heartbeatIntervalMs: number;
  private seq = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private displaySeenAt: number | null = null;
  private displayCapabilities: DisplayCapabilities | null = null;
  private closed = false;

  constructor(options: BroadcastChannelTransportOptions) {
    assertTerminalId(options.terminalId);
    this.terminalId = options.terminalId;
    this.instanceId = options.__testInstanceId ?? generateTerminalId();
    this.now = options.now ?? (() => Date.now());
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.channel = openChannel(this.terminalId, options.channelFactory);
    this.channel.onmessage = (event: { data: unknown }) => this.receive(event.data);
  }

  /** Último seq emitido (0 si aún no se ha publicado nada). */
  get lastSeq(): number {
    return this.seq;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Ver DisplayTransport.lastDisplaySeenAt. */
  get lastDisplaySeenAt(): number | null {
    return this.displaySeenAt;
  }

  /** Ver DisplayTransport.lastDisplayCapabilities: se actualizan con cada `display_alive` / `need_snapshot` y se borran con `display_bye`. */
  get lastDisplayCapabilities(): DisplayCapabilities | null {
    return this.displayCapabilities;
  }

  publish(draft: DownMessageDraft): void {
    if (this.closed) return;
    this.seq += 1;
    // El sobre va DESPUÉS del borrador: un draft con v/seq/terminalId (un
    // DownMessage reenviado, un cast, datos de JSON) no puede pisarlo.
    const msg = {
      ...draft,
      v: PROTOCOL_VERSION,
      seq: this.seq,
      terminalId: this.terminalId,
      instanceId: this.instanceId,
    } as DownMessage;
    postSafely(this.channel, msg);
  }

  /** hello y luego state, en la misma vuelta: así el receptor adopta la instancia antes de ver su carrito. */
  announce(hello: HelloDraft, state: DisplayState): void {
    this.publish(hello);
    this.publish({ t: 'state', state });
  }

  onUp(handler: Listener<UpMessage>): () => void {
    this.upHandlers.add(handler);
    return () => {
      this.upHandlers.delete(handler);
    };
  }

  /** Latido cada `heartbeatIntervalMs`. Idempotente: llamar dos veces no duplica el intervalo. */
  startHeartbeat(): void {
    if (this.closed || this.heartbeatTimer !== null) return;
    this.heartbeatTimer = setInterval(() => {
      this.publish({ t: 'heartbeat', at: this.now() });
    }, this.heartbeatIntervalMs);
    unrefTimer(this.heartbeatTimer);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer === null) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /** Cierra el canal. Si `sayBye` es true, avisa antes a la pantalla (por defecto sí). */
  close(sayBye = true): void {
    if (this.closed) return;
    this.stopHeartbeat();
    if (sayBye) this.publish({ t: 'bye' });
    this.closed = true;
    this.upHandlers.clear();
    this.channel.onmessage = null;
    this.channel.close();
  }

  private receive(data: unknown): void {
    if (this.closed || !isUpMessage(data)) return;
    // El canal ya es por terminal; esto es defensa por si dos terminales comparten id por error.
    if (data.terminalId !== this.terminalId) return;
    // Intención dirigida a otra instancia (otra pestaña de la misma caja): no es para esta.
    if (data.toInstanceId !== undefined && data.toInstanceId !== this.instanceId) return;
    // Presencia de la pantalla: cualquier señal suya cuenta; su despedida la borra.
    // Con la señal viajan sus capacidades (táctil, tamaño): la caja las consulta para no
    // prometer una respuesta que una pantalla no táctil nunca dará (ronda 2 de F2-B).
    if (data.t === 'display_alive' || data.t === 'need_snapshot') {
      this.displaySeenAt = this.now();
      this.displayCapabilities = { ...data.capabilities };
    } else if (data.t === 'display_bye') {
      this.displaySeenAt = null;
      this.displayCapabilities = null;
    }
    dispatch(this.upHandlers, data);
  }
}

export interface BroadcastChannelReceiverOptions {
  terminalId: string;
  /** Canal alternativo (p. ej. el relay de escritorio). Por defecto, BroadcastChannel. */
  channelFactory?: DisplayChannelFactory;
  /** Solo para pruebas: reloj inyectable para `lastReceivedAt` y la ventana de elección. */
  now?: () => number;
  /** Silencio tras el cual se suelta la activa. 0 desactiva el watchdog. Por defecto STALE_AFTER_MS. */
  staleAfterMs?: number;
  /** Duración de la ventana de elección tras un need_snapshot sin destinatario. Por defecto ADOPTION_WINDOW_MS. */
  adoptionWindowMs?: number;
  /** Intervalo de `display_alive`. Por defecto HEARTBEAT_INTERVAL_MS. */
  presenceIntervalMs?: number;
}

/** Lo que el receptor recuerda del hello con el que adoptó la instancia activa (null si la adoptó por otro mensaje). */
interface AdoptedHello {
  sessionOpen: boolean;
  seq: number;
  /** `hello.visible` (Fase 2-B); null si el emisor no lo mandó. */
  visible: boolean | null;
}

/** Lo que isBetterHello necesita de un `hello` aceptado. */
function toAdoptedHello(hello: Extract<DownMessage, { t: 'hello' }>): AdoptedHello {
  return { sessionOpen: hello.sessionOpen, seq: hello.seq, visible: typeof hello.visible === 'boolean' ? hello.visible : null };
}

/**
 * ¿`candidate` releva a `current` dentro de la ventana de elección? Solo si
 * es estrictamente mejor, en este orden:
 * 1. `visible` (Fase 2-B, deuda del QA de F2-A): con dos pestañas de
 *    /app/pos, la que el cajero tiene delante gana aunque la oculta lleve
 *    más `seq` o tenga caja abierta. Solo decide cuando LAS DOS lo declaran
 *    y difieren; si alguna no lo manda (emisor anterior) se compara como antes.
 * 2. `sessionOpen: true` sobre `false`.
 * 3. `seq` mayor.
 * Sin hello previo (adopción por latido o state) cualquier hello releva.
 */
export function isBetterHello(candidate: AdoptedHello, current: AdoptedHello | null): boolean {
  if (current === null) return true;
  if (candidate.visible !== null && current.visible !== null && candidate.visible !== current.visible) return candidate.visible;
  if (candidate.sessionOpen !== current.sessionOpen) return candidate.sessionOpen;
  return candidate.seq > current.seq;
}

/**
 * Receptor de la pantalla sobre BroadcastChannel.
 *
 * Sigue a una única instancia de caja (ver la regla de producto en la
 * cabecera). Reglas de adopción, en orden:
 * 1. Sin instancia activa se adopta la primera que se oye (hello, state o
 *    latido), salvo un `bye`: la despedida de una instancia que nunca se
 *    siguió no es de nadie y se ignora sin entregarla.
 * 2. Con instancia activa, un `hello` de otra instancia la releva
 *    —«gana la última que saluda»— salvo dentro de la ventana de elección
 *    abierta por un need_snapshot sin destinatario: ahí solo releva un hello
 *    estrictamente mejor (`sessionOpen: true` primero; a igualdad, `seq`
 *    mayor; en empate total se conserva la actual). Ver isBetterHello.
 *    Una activa adoptada sin hello es provisional: su need_snapshot sale sin
 *    destinatario (abre la ventana) y cualquier hello la releva.
 * 3. Cualquier otro mensaje de una instancia que no es la activa se descarta.
 * 4. Dentro de la activa solo pasa seq creciente: un hello repetido con el
 *    mismo seq se deduplica; uno con seq mayor no reinicia la marca.
 * 5. Cada cambio de instancia reinicia la marca de seq (la caja recargada
 *    empieza en 1; el contador es por instancia).
 * 6. La activa se suelta con su `bye` (queda `lastByeAt`), con
 *    releaseActiveInstance(), o cuando el watchdog cuenta `staleAfterMs`
 *    sin ningún mensaje aceptado (queda `lastStaleAt`).
 */
export class BroadcastChannelReceiver implements DisplayReceiver {
  readonly terminalId: string;
  private readonly channel: DisplayChannel;
  private readonly downHandlers = new Set<Listener<DownMessage>>();
  private readonly now: () => number;
  private readonly staleAfterMs: number;
  private readonly adoptionWindowMs: number;
  private readonly presenceIntervalMs: number;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private presenceCapabilities: DisplayCapabilities | null = null;
  private instanceId: string | null = null;
  private adoptedHello: AdoptedHello | null = null;
  private highestSeq = -1;
  private receivedAt: number | null = null;
  private byeAt: number | null = null;
  private staleAt: number | null = null;
  private incompatibleAt: number | null = null;
  private incompatibleCount = 0;
  /** Fin de la ventana de elección (reloj `now`); null si no hay ventana abierta. */
  private electionUntil: number | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(options: BroadcastChannelReceiverOptions) {
    assertTerminalId(options.terminalId);
    this.terminalId = options.terminalId;
    this.now = options.now ?? (() => Date.now());
    this.staleAfterMs = options.staleAfterMs ?? STALE_AFTER_MS;
    this.adoptionWindowMs = options.adoptionWindowMs ?? ADOPTION_WINDOW_MS;
    this.presenceIntervalMs = options.presenceIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.channel = openChannel(this.terminalId, options.channelFactory);
    this.channel.onmessage = (event: { data: unknown }) => this.receive(event.data);
  }

  /** Mayor seq aceptado de la instancia activa (-1 si aún no ha llegado nada o tras soltarla). */
  get lastSeq(): number {
    return this.highestSeq;
  }

  /** Instancia de caja a la que se sigue; null hasta oír la primera o tras soltarla. */
  get activeInstanceId(): string | null {
    return this.instanceId;
  }

  /** Instante del último mensaje aceptado; sirve para el estado "Conectando" (3 s sin latido). */
  get lastReceivedAt(): number | null {
    return this.receivedAt;
  }

  /** Instante del último `bye` aceptado de la activa. Si es posterior a `lastStaleAt`, la caja se cerró a propósito. */
  get lastByeAt(): number | null {
    return this.byeAt;
  }

  /** Instante en que el watchdog soltó la activa por silencio. Si es posterior a `lastByeAt`, la caja desapareció sin avisar. */
  get lastStaleAt(): number | null {
    return this.staleAt;
  }

  /**
   * Ver DisplayReceiver.incompatibleVersionAt. La Parte C muestra «Actualice
   * la pantalla» si es reciente y no hay mensajes válidos; un sobre de otra
   * versión nunca se entrega ni adopta.
   */
  get incompatibleVersionAt(): number | null {
    return this.incompatibleAt;
  }

  /** Ver DisplayReceiver.incompatibleVersionCount. */
  get incompatibleVersionCount(): number {
    return this.incompatibleCount;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Suelta la instancia activa (marca de seq limpia). Idempotente; no entrega nada a los handlers. */
  releaseActiveInstance(): void {
    this.disarmWatchdog();
    this.setActiveInstance(null);
  }

  send(draft: UpMessageDraft): void {
    if (this.closed) return;
    // Mismo criterio que en publish: el sobre gana sobre el borrador. Si se
    // sigue a una instancia, la intención va dirigida a ella: con dos pestañas
    // de /app/pos, solo la que proyecta debe ver «Cliente eligió 10 %» o
    // responder al need_snapshot (si respondieran las dos, el último hello
    // ganaría y la activa cambiaría sola). Sin instancia activa no se estampa
    // y responde cualquiera: es justo lo que necesita la pantalla recién abierta.
    const msg = { ...draft, v: PROTOCOL_VERSION, terminalId: this.terminalId } as UpMessage;
    // La presencia (display_alive / display_bye) no es una intención: va a
    // todas las pestañas de la terminal para que cada una pinte su indicador.
    if (UP_PRESENCE_TYPES.has(msg.t)) {
      delete msg.toInstanceId;
      postSafely(this.channel, msg);
      return;
    }
    // Un need_snapshot solo va dirigido a una activa CONFIRMADA por su hello.
    // Una adoptada por latido o state es provisional: la pantalla recién
    // abierta suele oír el latido de la primera pestaña que late (quizá la que
    // no tiene caja) antes de preguntar, y si le dirigiera la pregunta, la
    // pestaña con caja abierta nunca la oiría y no habría elección.
    const provisionalSnapshot = msg.t === 'need_snapshot' && this.adoptedHello === null;
    if (this.instanceId !== null && !provisionalSnapshot) {
      msg.toInstanceId = this.instanceId;
    } else {
      delete msg.toInstanceId; // un draft no decide el destinatario: sin activa confirmada, va a todas
      // Van a responder todas las pestañas: se abre la ventana de elección.
      if (msg.t === 'need_snapshot') this.electionUntil = this.now() + this.adoptionWindowMs;
    }
    postSafely(this.channel, msg);
  }

  onDown(handler: Listener<DownMessage>): () => void {
    this.downHandlers.add(handler);
    return () => {
      this.downHandlers.delete(handler);
    };
  }

  /**
   * Ver DisplayReceiver.startPresence. Idempotente: no duplica el intervalo;
   * sí actualiza las capacidades. Si la presencia ya corre y cambia `touch`
   * (ronda 3 de F2-B: la pantalla declara el táctil RESUELTO en cuanto conoce
   * el forzado del hello), se emite un `display_alive` en el acto para que
   * la caja no espere al siguiente latido; un cambio solo de tamaño (resize,
   * que dispara muchas veces seguidas) sigue esperando al latido.
   */
  startPresence(capabilities: DisplayCapabilities): void {
    if (this.closed) return;
    const touchChanged = this.presenceCapabilities !== null && this.presenceCapabilities.touch !== capabilities.touch;
    this.presenceCapabilities = { ...capabilities };
    if (this.presenceTimer !== null) {
      if (touchChanged) this.sendAlive();
      return;
    }
    this.presenceTimer = setInterval(() => this.sendAlive(), this.presenceIntervalMs);
    unrefTimer(this.presenceTimer);
    // El primer «estoy» sale ya: la caja no debería esperar un intervalo entero para ponerse en verde.
    this.sendAlive();
  }

  stopPresence(): void {
    if (this.presenceTimer === null) return;
    clearInterval(this.presenceTimer);
    this.presenceTimer = null;
  }

  /** Detiene la presencia, se despide (`display_bye`, salvo `sayBye: false`) y cierra el canal. */
  close(sayBye = true): void {
    if (this.closed) return;
    this.stopPresence();
    if (sayBye) this.send({ t: 'display_bye' });
    this.closed = true;
    this.disarmWatchdog();
    this.downHandlers.clear();
    this.channel.onmessage = null;
    this.channel.close();
  }

  private sendAlive(): void {
    if (this.closed || this.presenceCapabilities === null) return;
    this.send({ t: 'display_alive', at: this.now(), capabilities: this.presenceCapabilities });
  }

  private receive(data: unknown): void {
    if (this.closed) return;
    if (!isDownMessage(data)) {
      // Se descarta igual, pero si es de esta terminal y de otra versión del
      // protocolo se anota: la UI puede pedir actualizar en vez de esperar.
      if (isIncompatibleEnvelope(data, this.terminalId)) {
        this.incompatibleAt = this.now();
        this.incompatibleCount += 1;
      }
      return;
    }
    if (data.terminalId !== this.terminalId) return;

    const sameInstance = data.instanceId === this.instanceId;
    if (this.instanceId === null) {
      // Sin activa (pantalla recién abierta, o tras bye/silencio) se adopta la
      // primera que habla… salvo que se despida: un bye de una instancia que
      // nunca se siguió no es de nadie y llegaría a la UI como «la caja se
      // cerró» cuando no hay caja que seguir.
      if (data.t === 'bye') return;
      this.setActiveInstance(data.instanceId);
    } else if (data.t === 'hello' && !sameInstance) {
      // Otra instancia saluda. Regla general: la releva («gana la última que
      // saluda», es lo que hace que la pestaña enfocada recupere la pantalla).
      // En la ventana de elección, solo si es estrictamente mejor.
      const candidate = toAdoptedHello(data);
      if (this.isElectionOpen() && !isBetterHello(candidate, this.adoptedHello)) return;
      // Al cambiar de instancia la marca de seq se reinicia con ella: el
      // contador es por instancia, y la que releva suele traer un seq MENOR
      // que la anterior (una pestaña en segundo plano late a 1/min). Si se
      // conservara, la adoptada quedaría muda —incluido su hello— hasta recargar.
      this.setActiveInstance(data.instanceId);
    } else if (!sameInstance) {
      return; // latidos, estados y byes de una pestaña que no es la activa
    }
    if (data.seq <= this.highestSeq) return;

    this.highestSeq = data.seq;
    this.receivedAt = this.now();
    if (data.t === 'hello') this.adoptedHello = toAdoptedHello(data);
    if (data.t === 'bye') {
      this.byeAt = this.receivedAt;
      this.releaseActiveInstance();
    } else {
      this.armWatchdog();
    }
    dispatch(this.downHandlers, data);
  }

  private isElectionOpen(): boolean {
    return this.electionUntil !== null && this.now() < this.electionUntil;
  }

  /** Único punto que cambia la instancia activa: siempre va con la marca de seq limpia y sin hello recordado. */
  private setActiveInstance(instanceId: string | null): void {
    this.instanceId = instanceId;
    this.adoptedHello = null;
    this.highestSeq = -1;
  }

  /**
   * Reinicia la cuenta de silencio con cada mensaje aceptado. Si vence, la
   * activa murió sin bye (crash, pestaña matada): se suelta para que el
   * siguiente need_snapshot salga sin destinatario. No se entrega nada a los
   * handlers: la UI ya detecta el silencio por `lastReceivedAt`.
   */
  private armWatchdog(): void {
    this.disarmWatchdog();
    if (this.staleAfterMs <= 0) return;
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null;
      if (this.closed || this.instanceId === null) return;
      this.staleAt = this.now();
      this.setActiveInstance(null);
    }, this.staleAfterMs);
    unrefTimer(this.staleTimer);
  }

  private disarmWatchdog(): void {
    if (this.staleTimer === null) return;
    clearTimeout(this.staleTimer);
    this.staleTimer = null;
  }
}
