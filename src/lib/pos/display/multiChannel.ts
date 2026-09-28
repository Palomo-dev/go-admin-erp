/**
 * Canales compuestos para el lado CAJA (Fase 3, parte C; PLAN §3.2 y §12
 * Fase 3): un mismo sobre por DOS tubos —BroadcastChannel / relay de
 * escritorio (local) y Supabase Broadcast (remoto)— sin tocar la lógica de
 * `BroadcastChannelTransport` ni del emisor.
 *
 * POR QUÉ UN CANAL COMPUESTO Y NO DOS TRANSPORTES
 * -----------------------------------------------
 * El transporte es dueño del sobre (`seq`, `instanceId`): dos transportes
 * serían dos contadores y dos instancias, y la pantalla remota y la local
 * verían «cajas» distintas con seq que no casan. Con un solo transporte y un
 * canal que reparte, el sobre es UNO (un solo seq, una sola instancia) y
 * los dos tubos reciben exactamente el mismo mensaje (regla 7: nada de
 * lógica duplicada; el emisor no sabe cuántos tubos hay).
 *
 * LO QUE HACE CADA PIEZA
 * - `createFanOutDisplayChannel(legs)`: `postMessage` a todas las patas
 *   (cada una aislada: un tubo que lance no calla al otro); lo que vuelve por
 *   una pata se entrega con `origin` = la pata (`local` | `remote`), así el
 *   transporte anota la presencia por origen y el indicador del POS dice si
 *   la pantalla viva es la ventana local, la tableta o las dos. Admite
 *   añadir una pata DESPUÉS (`addLeg`): la remota se cuelga cuando ya se
 *   comprobó que esta caja está vinculada a una fila de `pos_terminals`
 *   (una consulta asíncrona; el transporte se abre síncrono). Como el
 *   `announce()` del emisor es SÍNCRONO y sale antes de que esa consulta
 *   responda, el reparto RETIENE el último `hello` y el último `state`
 *   publicados y se los entrega a la pata que llega tarde (ronda 3 · 1):
 *   sin eso, el saludo de la caja recién arrancada no salía NUNCA por la
 *   pata remota y la tableta seguía pintando el carrito del cliente
 *   ANTERIOR hasta que su watchdog (REMOTE_STALE_AFTER_MS) la soltaba.
 * - `createListenerGatedChannel(inner)`: la pata remota solo PUBLICA mientras
 *   hay una pantalla remota que escucha. Cada `up` que llega por ese tubo
 *   (`need_snapshot`, `display_alive`, intenciones) la mantiene despierta
 *   `REMOTE_LISTENER_TTL_MS`; un `display_bye` la duerme en el acto. Mientras
 *   duerme, nada viaja por Realtime: sin tableta, el coste es cero mensajes
 *   (un latido por segundo por caja, veinticuatro horas, serían ~2,6 M de
 *   mensajes al mes por caja sin nadie que los oyera). No se pierde nada:
 *   la pantalla remota pide `need_snapshot` cada 2 s mientras no tiene caja
 *   (displayLink.ts) y ese mensaje la despierta; el emisor responde con
 *   hello + state (announce). La caja no puede saber si la terminal tiene
 *   una pantalla EMPAREJADA (el hash vive en `pos_terminal_secrets`, sin
 *   permisos para `authenticated`): «hay una escuchando» es la señal que sí
 *   tiene, y es más estricta. Quién cuenta como oyente lo decide un
 *   `ListenerGate` (ronda 2 · 3) construido con las guardas de protocol.ts:
 *   solo un `UpMessage` bien formado de ESTA terminal y que no vaya dirigido
 *   a OTRA instancia (ronda 4 · 4) abre o cierra la compuerta, nunca un
 *   mensaje que el transporte tiraría a la basura —y, si la instancia aún no
 *   se conoce, tampoco abre con un mensaje que lleve destinatario (ronda 4 ·
 *   C3: el transporte lo descartaría). Y CERRARLA exige además que el
 *   `display_bye` venga firmado con la instancia que ABRIÓ la compuerta, la
 *   misma que esta caja le dio
 *   a la pantalla en su `hello` (ronda 5 · 3): el canal lo puede escribir
 *   cualquier miembro activo de la sucursal y el `terminalId` va en el nombre
 *   del topic, así que una despedida anónima era un apagón gratis de la
 *   pantalla remota. Sin firma se ignora y la pata caduca por TTL.
 *   Además, el LATIDO de bajada sale por este tubo cada
 *   `beatIntervalMs` (REMOTE_BEAT_INTERVAL_MS) en vez de cada segundo: el
 *   ritmo es del tubo, no del transporte, que es uno solo para los dos.
 *   Y lo que se pierde mientras duerme NO se pierde para siempre (ronda 3 ·
 *   1 y 3): la compuerta retiene el último `hello` y el último `state` que
 *   dejó fuera y los publica en cuanto vuelve a abrirse, antes que nada.
 *   Solo eso: un latido que se perdió no interesa, pero un carrito sí.
 *
 * Sin React, sin Supabase, sin DOM: se prueba en Node con canales falsos.
 */

import { isAuthenticatedDisplayBye, isUpMessageForInstance } from './protocol';
import { REMOTE_BEAT_INTERVAL_MS, REMOTE_PRESENCE_INTERVAL_MS, REMOTE_STALE_AFTER_MS } from './supabaseBroadcastTransport';
import type { DisplayChannel, DisplayChannelEvent, DisplayLinkOrigin } from './transport';

/** Una pata del canal compuesto: el tubo y el origen con el que se etiqueta lo que llega por él. */
export interface DisplayChannelLeg {
  origin: DisplayLinkOrigin;
  channel: DisplayChannel;
}

/** Canal compuesto: `DisplayChannel` más la posibilidad de colgar una pata después de abrirlo. */
export interface FanOutDisplayChannel extends DisplayChannel {
  /**
   * Añade una pata. Si el canal ya se cerró, la pata se cierra en el acto y
   * no se añade. Devuelve si quedó colgada. La pata recibe de entrada el
   * último `hello` y el último `state` ya publicados (ronda 3 · 1), en ese
   * orden: quien llega tarde no se pierde el saludo de esta caja.
   */
  addLeg(leg: DisplayChannelLeg): boolean;
  /** Orígenes de las patas colgadas ahora mismo (para el indicador y las pruebas). */
  readonly origins: readonly DisplayLinkOrigin[];
  readonly isClosed: boolean;
}

function closeQuietly(channel: DisplayChannel, where: string): void {
  try {
    channel.close();
  } catch (err) {
    console.warn(`[pos-display] ${where}: no se pudo cerrar el canal`, err);
  }
}

/**
 * Reparte cada `postMessage` entre las patas y entrega lo que vuelve por
 * cualquiera con su `origin`. Nunca lanza después de construido.
 */
export function createFanOutDisplayChannel(initialLegs: ReadonlyArray<DisplayChannelLeg> = []): FanOutDisplayChannel {
  const legs: DisplayChannelLeg[] = [];
  let handler: ((event: DisplayChannelEvent) => void) | null = null;
  let closed = false;
  // Lo que una pata colgada tarde necesita para ponerse al día (ronda 3 · 1).
  // Solo el ÚLTIMO de cada uno: el hello identifica la instancia viva y el
  // state es el carrito de ahora; un latido viejo no le sirve a nadie.
  let ultimoHello: unknown = null;
  let ultimoState: unknown = null;

  const publicarEn = (leg: DisplayChannelLeg, msg: unknown) => {
    try {
      leg.channel.postMessage(msg);
    } catch (err) {
      console.warn(`[pos-display] no se pudo publicar por el canal ${leg.origin}`, err);
    }
  };

  const wire = (leg: DisplayChannelLeg) => {
    leg.channel.onmessage = (event: DisplayChannelEvent) => {
      if (closed || !handler) return;
      // La pata decide el origen: un tubo simple no lo manda, y si lo mandara (MessageEvent.origin
      // es una URL) no debe pisar la etiqueta con la que se colgó.
      // La ENTREGA va aislada igual que la publicación (ronda 2 · 4): un handler que lance
      // subiría al callback de `broadcast` de supabase-js o al `onmessage` del BroadcastChannel,
      // y la cabecera promete que este canal nunca lanza después de construido.
      try {
        handler({ data: event.data, origin: leg.origin });
      } catch (err) {
        console.warn(`[pos-display] el receptor falló con un mensaje de la pata ${leg.origin}`, err);
      }
    };
  };

  const fanOut: FanOutDisplayChannel = {
    get onmessage() {
      return handler;
    },
    set onmessage(next) {
      handler = next;
    },
    get origins() {
      return legs.map((leg) => leg.origin);
    },
    get isClosed() {
      return closed;
    },
    postMessage(msg: unknown) {
      if (closed) return;
      const tipo = downMessageType(msg);
      if (tipo === 'hello') ultimoHello = msg;
      else if (tipo === 'state') ultimoState = msg;
      for (const leg of legs) publicarEn(leg, msg);
    },
    addLeg(leg: DisplayChannelLeg) {
      if (closed) {
        closeQuietly(leg.channel, 'addLeg tras cerrar');
        return false;
      }
      legs.push(leg);
      wire(leg);
      // Puesta al día de la pata que llega tarde (ronda 3 · 1): hello y luego
      // state, el mismo orden de `announce()`, para que el otro lado adopte la
      // instancia antes de ver su carrito. Solo a ESTA pata: las que ya
      // estaban los recibieron en su momento.
      if (ultimoHello !== null) publicarEn(leg, ultimoHello);
      if (ultimoState !== null) publicarEn(leg, ultimoState);
      return true;
    },
    close() {
      if (closed) return;
      closed = true;
      handler = null;
      ultimoHello = null;
      ultimoState = null;
      for (const leg of legs.splice(0)) {
        leg.channel.onmessage = null;
        closeQuietly(leg.channel, `cierre de la pata ${leg.origin}`);
      }
    },
  };

  for (const leg of initialLegs) fanOut.addLeg(leg);
  return fanOut;
}

/**
 * Cuánto sigue despierta la pata remota tras la última señal de una pantalla
 * remota. Se DERIVA del ritmo remoto, no se fija a mano (ronda 3 · 3): la
 * tableta late (`display_alive`) cada REMOTE_PRESENCE_INTERVAL_MS (5 s), así
 * que el mismo margen que en local —tres latidos perdidos— son 15 s.
 *
 * Y nunca por debajo de REMOTE_STALE_AFTER_MS, el silencio que la propia
 * tableta tolera de la caja antes de darla por muerta: con un TTL menor la
 * caja se callaba ANTES de que la tableta se enterara, así que un único
 * latido perdido (jitter, pestaña en segundo plano, pantalla en reposo)
 * dejaba a la tableta con el carrito congelado sin que nadie pidiera
 * snapshot. El valor anterior (10 s fijos) era justo ese caso: dos latidos
 * de margen y 5 s por debajo del umbral de la tableta.
 */
export const REMOTE_LISTENER_TTL_MS = Math.max(3 * REMOTE_PRESENCE_INTERVAL_MS, REMOTE_STALE_AFTER_MS);

/**
 * Qué hace un mensaje entrante con la compuerta. La decide quien SABE
 * validar (ronda 2 · 3): el tubo no valida nada, así que si la decisión
 * viviera aquí, una cadena, un número o un `up` de OTRA terminal —lo que el
 * propio transporte tira a la basura— abriría la compuerta y sacaría el
 * carrito por Realtime, o un `display_bye` forjado la dormiría dejando a la
 * tableta legítima con el carrito congelado.
 */
export type ListenerGateVerdict = 'abre' | 'cierra' | 'ignora';
export type ListenerGate = (data: unknown) => ListenerGateVerdict;

/**
 * La compuerta con el MISMO criterio que `BroadcastChannelTransport.receive`,
 * literalmente el mismo predicado (`isUpMessageForInstance`, protocol.ts):
 * solo un `UpMessage` bien formado cuenta, y —con `terminalId`— solo el de
 * ESTA terminal (el canal remoto es por terminal, pero el topic lo elige
 * quien se une, así que la igualdad se comprueba igual), y —con
 * `instanceId`— solo el que no va dirigido a OTRA instancia. Todo lo demás
 * se ignora: ni abre ni cierra, y sigue entregándose para que el transporte
 * lo descarte donde ya lo hacía.
 *
 * Lo del destinatario es de la ronda 4 · 4: con dos ventanas de /app/pos en
 * la misma caja, un `tip_selected` dirigido a la ventana A despertaba también
 * la pata remota de la B —que iba a descartar ese mismo mensaje— y la B
 * publicaba su carrito por Realtime durante todo el TTL con su indicador
 * diciendo «sin pantalla».
 *
 * `instanceId` puede ser una función porque el transporte es dueño de su
 * `instanceId` y abre el canal DENTRO de su constructor: cuando se construye
 * la compuerta todavía no se conoce. Mientras devuelva null no hay con qué
 * comparar, y desde la ronda 4 · C3 eso NO significa «pasa»: con contexto de
 * instancia, un mensaje que lleva destinatario se descarta hasta saber si es
 * para esta caja (fail closed). Sin contexto de instancia
 * (DEFAULT_LISTENER_GATE) el destinatario no se mira, como antes.
 */
export function upMessageListenerGate(terminalId?: string, instanceId?: string | (() => string | null) | null): ListenerGate {
  const resolveInstanceId = (): string | null => (typeof instanceId === 'function' ? instanceId() : (instanceId ?? null));
  /** ¿Hay contexto de instancia con el que comparar el destinatario y la firma de una despedida? */
  const conContextoDeInstancia = instanceId !== undefined;
  /** Instancia de caja vigente la última vez que esta compuerta se ABRIÓ (ronda 4 · C3). */
  let instanciaDeApertura: string | null = null;
  return (data: unknown) => {
    const instanciaActual = resolveInstanceId();
    if (!isUpMessageForInstance(data, terminalId, instanciaActual)) return 'ignora';
    // MISMO descarte por destinatario que `receive` (ronda 4 · C3). En el
    // transporte `instanceId` es SIEMPRE un string, así que un `up` dirigido a
    // otra instancia se tira siempre; aquí puede no conocerse todavía y
    // entonces `isUpMessageForInstance` no compara nada, así que un mensaje
    // CON destinatario pasaba y abría la pata remota de una caja que iba a
    // descartar ese mismo mensaje —el defecto de la ronda 4 · 4 reabierto en
    // la ventana en la que la instancia aún no se conoce—. Con contexto de
    // instancia se falla cerrado: sin saber a quién va dirigido, no abre.
    if (conContextoDeInstancia && instanciaActual === null && data.toInstanceId !== undefined) return 'ignora';
    if (data.t !== 'display_bye') {
      instanciaDeApertura = instanciaActual;
      return 'abre';
    }
    // Cerrar la compuerta es apagar la pantalla remota de esta caja, y el canal
    // lo puede escribir cualquier miembro activo de la sucursal (política
    // `pos_display_caja_envia`) mientras el `terminalId` viaja en el nombre del
    // topic. Con contexto de instancia, solo cierra la despedida FIRMADA con la
    // que esta caja le dio a la pantalla en su `hello` (F3-C ronda 5 · 3). Una
    // sin firma se ignora: ni cierra ni renueva, y la pata se duerme sola al
    // vencer el TTL. Sin contexto de instancia (`instanceId` sin pasar, como en
    // DEFAULT_LISTENER_GATE) no hay nada con lo que comparar y se cierra como
    // antes, la misma convención que `isUpMessageForInstance`.
    if (!conContextoDeInstancia) return 'cierra';
    // Y la firma se compara contra la instancia que ABRIÓ esta compuerta
    // (ronda 4 · C3), no contra cualquiera que esté vigente al llegar la
    // despedida: quien puede apagar la pantalla remota es la caja a la que esa
    // pantalla dijo que seguía. Si la compuerta nunca llegó a abrirse no hay
    // apertura que atribuir y se compara con la instancia actual; si tampoco
    // se conoce, `isAuthenticatedDisplayBye` responde false y no cierra nada.
    const instanciaDeReferencia = instanciaDeApertura ?? instanciaActual;
    return isAuthenticatedDisplayBye(data, instanciaDeReferencia) ? 'cierra' : 'ignora';
  };
}

/** Sin terminal: exige `UpMessage` bien formado, que ya deja fuera basura y mensajes de otro protocolo. */
export const DEFAULT_LISTENER_GATE: ListenerGate = upMessageListenerGate();

export interface ListenerGatedChannelOptions {
  /** Reloj inyectable (pruebas). */
  now?: () => number;
  /** Por defecto REMOTE_LISTENER_TTL_MS. */
  listenerTtlMs?: number;
  /** Quién decide abrir/cerrar. Por defecto DEFAULT_LISTENER_GATE. */
  gate?: ListenerGate;
  /**
   * Ritmo del LATIDO de bajada por este tubo (ronda 2 · 2). Los `heartbeat`
   * que lleguen antes de que pase este intervalo desde el último publicado se
   * descartan; el resto de mensajes (hello, state, payment, bye…) pasan
   * siempre y en el acto. Por defecto REMOTE_BEAT_INTERVAL_MS. 0 lo desactiva.
   *
   * Por qué aquí y no en el transporte: el transporte es UNO para los dos
   * tubos (un solo seq), así que el intervalo del latido del transporte no
   * puede distinguirlos. El tubo local sigue latiendo a 1 s —en
   * BroadcastChannel un mensaje no cuesta nada— y el remoto reenvía uno de
   * cada cinco. Un hueco de seq es inocuo: el receptor solo exige seq creciente.
   */
  beatIntervalMs?: number;
}

/** Canal con compuerta: `DisplayChannel` más lectura de si ahora mismo hay alguien escuchando. */
export interface ListenerGatedChannel extends DisplayChannel {
  /** true mientras la última señal del otro lado tiene menos de `listenerTtlMs`, no fue un `display_bye` y no está revocada. */
  readonly hasListener: boolean;
  /** Instante hasta el que se considera que hay oyente; 0 si duerme. */
  readonly listenerUntil: number;
  /** true mientras haya un `hello`/`state` retenido que la compuerta dejó fuera y aún no se ha repuesto. */
  readonly hasPendingSnapshot: boolean;
  /** true mientras el pestillo de revocación esté echado: la pata no publica nada ni entrega lo que llegue. */
  readonly isListenerRevoked: boolean;
  /**
   * La caja REVOCÓ la pantalla remota de esta terminal (ronda 5 · 2): cierra
   * la compuerta en el acto y echa el pestillo. A partir de aquí ni un
   * `display_alive` bien formado la reabre —una tableta robada que ignore su
   * 401 conserva el JWT de Realtime hasta 5 min—, y nada vuelve a salir por
   * este tubo: ni carrito, ni totales, ni el payload del QR de pago.
   */
  revokeListener(): void;
  /** Se abrió un emparejamiento nuevo: se suelta el pestillo y la compuerta vuelve a su ciclo normal. */
  allowListener(): void;
}

/** Tipo de un mensaje de BAJADA, que lo construye esta misma caja: basta con leer su `t`. */
function downMessageType(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const t = (data as { t?: unknown }).t;
  return typeof t === 'string' ? t : null;
}

/**
 * Envuelve un canal para que solo publique mientras hay oyente (ver
 * cabecera) y para que el latido salga al ritmo del tubo. Lo que llega por el
 * canal interior pasa tal cual (con su `origin`, si lo trae); la compuerta la
 * gobierna `gate`, no el mensaje en crudo.
 */
export function createListenerGatedChannel(inner: DisplayChannel, options: ListenerGatedChannelOptions = {}): ListenerGatedChannel {
  const now = options.now ?? (() => Date.now());
  const ttl = options.listenerTtlMs ?? REMOTE_LISTENER_TTL_MS;
  const gate = options.gate ?? DEFAULT_LISTENER_GATE;
  const beatIntervalMs = options.beatIntervalMs ?? REMOTE_BEAT_INTERVAL_MS;
  let until = 0;
  /** Pestillo de revocación (ronda 5 · 2): mientras esté echado, nada abre ni sale. */
  let revocada = false;
  let lastBeatAt: number | null = null;
  let handler: ((event: DisplayChannelEvent) => void) | null = null;
  let closed = false;
  /** Último `hello` y `state` que pasaron por aquí, se publicaran o no (ronda 3 · 1). */
  let ultimoHello: unknown = null;
  let ultimoState: unknown = null;
  /** Hay un hueco: la compuerta dormida dejó fuera un hello o un state que el otro lado no tiene. */
  let hueco = false;

  const publicar = (msg: unknown) => {
    try {
      inner.postMessage(msg);
    } catch (err) {
      console.warn('[pos-display] no se pudo publicar por la pata con compuerta', err);
    }
  };

  /** Repone lo que la compuerta dejó fuera, en el orden de `announce()`: hello y luego state. */
  const reponerHueco = () => {
    // `closed` se comprueba aquí porque esto corre DESPUÉS de entregar el
    // mensaje, y el receptor puede haber cerrado el transporte en esa vuelta.
    if (closed || !hueco) return;
    hueco = false;
    if (ultimoHello !== null) publicar(ultimoHello);
    if (ultimoState !== null) publicar(ultimoState);
  };

  inner.onmessage = (event: DisplayChannelEvent) => {
    if (closed) return;
    // Primero se abre la compuerta, luego se entrega: la respuesta a un need_snapshot
    // (announce en la misma vuelta) ya encuentra la pata despierta.
    // Con el pestillo echado la pata queda SORDA además de muda (ronda 5 · 2):
    // el mensaje ni se entrega. Si se entregara, el `display_alive` de una
    // tableta revocada que ignore su 401 seguiría anotando presencia remota en
    // el transporte y el indicador del POS diría «conectada (remota)» de un
    // dispositivo al que la caja ya no le habla. Así la presencia remota caduca
    // por silencio y el indicador dice la verdad.
    if (revocada) return;
    const dormida = now() >= until;
    const verdicto = gate(event.data);
    if (verdicto === 'abre') {
      until = now() + ttl;
      // El ritmo del latido se mide desde el último publicado PARA EL OYENTE
      // ANTERIOR (ronda 3 · 6): si no se reinicia, una tableta que se empareja
      // o reconecta dentro del mismo intervalo espera hasta beatIntervalMs su
      // primer latido y la caja tarda en aparecer «conectada».
      if (dormida) lastBeatAt = null;
    } else if (verdicto === 'cierra') {
      until = 0;
    }
    handler?.(event);
    // La reposición va DESPUÉS de entregar, a propósito: si el mensaje era un
    // `need_snapshot`, el emisor ya respondió con hello + state frescos en esta
    // misma vuelta —y eso cierra el hueco—, así que aquí no se duplica nada.
    // Solo se repone cuando nadie pidió snapshot: el `display_alive` de una
    // tableta que todavía cree estar hablando con la caja ANTERIOR.
    if (verdicto === 'abre' && dormida) reponerHueco();
  };

  const gated: ListenerGatedChannel = {
    get onmessage() {
      return handler;
    },
    set onmessage(next) {
      handler = next;
    },
    get hasListener() {
      return !closed && !revocada && now() < until;
    },
    get isListenerRevoked() {
      return revocada;
    },
    revokeListener() {
      if (closed || revocada) return;
      revocada = true;
      until = 0;
      lastBeatAt = null;
    },
    allowListener() {
      if (closed) return;
      revocada = false;
    },
    get listenerUntil() {
      return until;
    },
    get hasPendingSnapshot() {
      return hueco;
    },
    postMessage(msg: unknown) {
      if (closed) return;
      const tipo = downMessageType(msg);
      if (tipo === 'hello') ultimoHello = msg;
      else if (tipo === 'state') ultimoState = msg;
      // Revocada: nada sale, pero el último hello/state quedan anotados como
      // hueco por si más tarde se empareja otra pantalla y se suelta el pestillo.
      if (revocada) {
        if (tipo === 'hello' || tipo === 'state') hueco = true;
        return;
      }
      if (now() >= until) {
        // Dormida. Un hello o un state que se queda fuera es un hueco: el otro
        // lado no lo tiene y nadie se lo va a volver a mandar (la tableta solo
        // pide snapshot tras REMOTE_STALE_AFTER_MS de silencio, que su
        // siguiente latido vuelve a aplazar). Se repone al despertar.
        if (tipo === 'hello' || tipo === 'state') hueco = true;
        return;
      }
      if (beatIntervalMs > 0 && tipo === 'heartbeat') {
        const ahora = now();
        if (lastBeatAt !== null && ahora - lastBeatAt < beatIntervalMs) return;
        lastBeatAt = ahora;
      }
      // Un hello que sale de verdad deja sin objeto cualquier hueco anterior:
      // trae consigo el state que `announce()` publica justo detrás.
      if (tipo === 'hello') hueco = false;
      publicar(msg);
    },
    close() {
      if (closed) return;
      closed = true;
      until = 0;
      revocada = false;
      lastBeatAt = null;
      hueco = false;
      ultimoHello = null;
      ultimoState = null;
      handler = null;
      inner.onmessage = null;
      closeQuietly(inner, 'canal con compuerta');
    },
  };
  return gated;
}
