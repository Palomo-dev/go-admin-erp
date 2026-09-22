/**
 * Transporte REMOTO de la pantalla del cliente sobre Supabase Realtime
 * Broadcast (PLAN §3.2, §7 «Canal Realtime remoto», §11 y §12 Fase 3;
 * decisiones en docs/pos-doble-pantalla/F3-A-decisiones-realtime.md y
 * F3-B-decisiones-transporte-remoto.md).
 *
 * POR QUÉ ES TAN CORTO
 * --------------------
 * `BroadcastChannelTransport` y `BroadcastChannelReceiver` (transport.ts)
 * ya separan la LÓGICA (sobre `v/seq/terminalId/instanceId/toInstanceId`,
 * descarte por terminal, seq e instancia, ventana de elección, watchdog,
 * latido, presencia, `bye`) del TUBO (`DisplayChannel`: `postMessage`,
 * `onmessage`, `close`), y aceptan una fábrica de canal inyectable. El relay
 * de Go Admin Desktop (desktopChannel.ts) ya usa ese punto de extensión.
 * Aquí se hace exactamente lo mismo con un canal de Supabase Realtime: la
 * lógica del protocolo no se reimplementa ni se copia; solo cambia el tubo.
 * Así un `hello` que gana la elección en local gana igual en remoto, y los
 * tests de transport.test.ts siguen cubriendo las dos implementaciones.
 *
 * QUÉ HACE EL CANAL DE SUPABASE
 * -----------------------------
 * - Un canal por terminal: `pos-display:<terminalId>` (displayChannelName).
 *   Se suscribe SIEMPRE con `config: { private: true }` (PLAN §11, criterio
 *   de aceptación de la parte B): las políticas de `realtime.messages`
 *   (migración 20260922130000) deciden quién recibe y quién emite. Un canal
 *   público dejaría leer el carrito y emitir totales falsos a cualquiera con
 *   la clave anon y el UUID de la terminal.
 * - SOLO Broadcast: ningún `postgres_changes`, ninguna escritura en la base
 *   por mensaje (PLAN §3.2: nada como lo que tumbó el servicio el 14/09).
 * - Dos eventos, uno por sentido: la caja envía `down` y escucha `up`; la
 *   pantalla envía `up` y escucha `down`. Cada lado solo se suscribe al
 *   evento que le toca, así una pantalla emparejada que emitiera un `down`
 *   falso solo se engañaría a sí misma (F3-A, ronda 2 · 1) y la caja no
 *   recibe sus propios mensajes (como con BroadcastChannel, que excluye al
 *   emisor). `broadcast.self` queda en false.
 * - Mientras el canal no está unido (`SUBSCRIBED`), lo que se publica se
 *   ENCOLA (tope JOIN_QUEUE_LIMIT, se descarta lo más viejo) y se vacía en
 *   orden al unirse. Motivo: `channel.send()` sin unión cae al endpoint
 *   HTTP de Broadcast, que cuesta una petición autenticada por mensaje y no
 *   garantiza el orden respecto al socket; y el emisor saluda (announce)
 *   en cuanto arranca, antes de que el socket termine el join. Un hueco de
 *   seq por un descarte es inocuo para el receptor (solo exige seq
 *   creciente) y la pantalla vuelve a pedir snapshot si le falta el estado.
 * - Al cerrar: se manda el `bye`/`display_bye` (lo hace la clase base) y
 *   luego `unsubscribe()` + `removeChannel()`. Los pushes van en orden por
 *   el socket, así el servidor difunde el bye antes de procesar el leave.
 * - `onStatus` avisa de cada cambio de estado de la suscripción
 *   (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`): la pantalla lo
 *   usa para distinguir «sin canal» (JWT rechazado, red caída) de «canal
 *   unido pero caja callada» (Conectando). supabase-js reintenta el join
 *   solo (rejoinTimer) tras un error o un corte del socket.
 *
 * AUTENTICACIÓN (no vive aquí)
 * ---------------------------
 * La caja publica con su sesión de usuario (cliente de `@/lib/supabase/config`;
 * la política `pos_display_caja_*` exige ser miembro activo de la
 * organización de la terminal). La pantalla remota usa un cliente PROPIO sin
 * sesión (remoteDisplayClient.ts) cuyo `accessToken` es el JWT de 5 min
 * que emiten `/bootstrap` y cada `/heartbeat`; ese módulo llama
 * `realtime.setAuth()` con cada token nuevo, y la pantalla sale del canal
 * ante un 401 (remoteDisplay.ts). Nada de eso lo sabe el transporte.
 *
 * El id de la terminal del canal REMOTO es SIEMPRE `pos_terminals.id`
 * (uuid de Postgres, en minúsculas), nunca un id de localStorage: la
 * pantalla lo toma del bootstrap (`realtime.channel` / `terminal.id`) y la
 * caja de su fila vinculada (F3-A, ronda 3 · 6).
 */

import {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  displayChannelName,
  type BroadcastChannelReceiverOptions,
  type BroadcastChannelTransportOptions,
  type DisplayChannel,
  type DisplayChannelFactory,
} from './transport';

/** Evento Broadcast de cada sentido (PLAN §8: `down` caja → pantalla, `up` pantalla → caja). */
export const DISPLAY_DOWN_EVENT = 'down';
export const DISPLAY_UP_EVENT = 'up';

/** Mensajes que se retienen mientras el canal no está unido; por encima se descarta el más viejo. */
export const JOIN_QUEUE_LIMIT = 32;

/**
 * RITMO DEL CANAL REMOTO (ronda 2 · 2). El transporte local late a
 * HEARTBEAT_INTERVAL_MS = 1 s porque en BroadcastChannel un mensaje no
 * cuesta nada: no sale del navegador. En Supabase Realtime sí cuesta, y se
 * factura por mensaje: a 1 s, la presencia de UNA tableta son 86.400
 * `display_alive` al día (~2,6 M al mes), y otro tanto el latido de bajada
 * de la caja. Con una sola pantalla encendida todo el día eso ya es el orden
 * de la cuota mensual del plan, y cada terminal lo multiplica.
 *
 * Por eso el canal remoto usa un ritmo propio, que hay que pasar
 * EXPLÍCITAMENTE (las clases siguen teniendo el de 1 s por defecto, que es
 * el correcto en local):
 * - presencia de la pantalla cada 5 s → 17.280 mensajes al día (~518.000 al
 *   mes) por tableta: cinco veces menos;
 * - `staleAfterMs` de 15 s (tres latidos perdidos, la misma proporción que
 *   en local) tanto en el receptor como en el enlace (displayLink), para que
 *   «Conectando» no salte por el ritmo más lento;
 * - el latido de bajada de la caja sale con el mismo criterio
 *   (REMOTE_BEAT_INTERVAL_MS). Lo aplica la parte C en la pata remota del
 *   canal compuesto (multiChannel.ts `beatIntervalMs`), no en el transporte:
 *   el transporte es UNO para los dos tubos y subirle el latido a 5 s
 *   ralentizaría también la presencia de la ventana local;
 * - y el `need_snapshot` que la pantalla repite mientras no hay caja viva
 *   (ronda 4 · QA-1): ver REMOTE_RESNAPSHOT_INTERVAL_MS.
 *
 * Qué NO se toca: el `state` del carrito no es un latido, sale cuando el
 * cajero teclea, y sigue saliendo en el acto. El ritmo lento solo afecta a
 * cuánto tarda cada lado en dar por muerto al otro cuando calla.
 */
export const REMOTE_PRESENCE_INTERVAL_MS = 5_000;
export const REMOTE_STALE_AFTER_MS = 3 * REMOTE_PRESENCE_INTERVAL_MS;
/** Latido de bajada (caja → pantalla) en el canal remoto; lo aplica la pata remota del canal compuesto. */
export const REMOTE_BEAT_INTERVAL_MS = REMOTE_PRESENCE_INTERVAL_MS;

/**
 * RITMO DEL `need_snapshot` REMOTO (ronda 4 · QA-1). Mientras no hay caja
 * viva, el enlace (displayLink.ts) vuelve a pedir el snapshot cada
 * RESNAPSHOT_INTERVAL_MS = 2 s, indefinidamente: `DISCONNECTED_TO_IDLE_MS`
 * solo cambia la vista, no detiene la pregunta. En local eso no cuesta nada;
 * en Realtime son 30 mensajes de SUBIDA por minuto que se suman a los 12 de
 * la presencia. Una tableta de quiosco encendida con la caja cerrada 16 h al
 * día mandaría ~29.000 mensajes diarios preguntando algo que nadie va a
 * contestar —justo el orden de magnitud que esta sección bajó para la
 * presencia— y en las horas en que nadie mira.
 *
 * En remoto el `need_snapshot` va al ritmo de la presencia (5 s) y, cuando la
 * caja lleva más de `DISCONNECTED_TO_IDLE_MS` callada (ya se está pintando
 * Reposo), retrocede a uno por minuto: si lleva un minuto sin contestar,
 * preguntar cada 5 s no la va a despertar, y el `hello`/`announce` de la caja
 * que vuelve llega igual sin que nadie pregunte. Con la caja conectada esto
 * no cambia nada: el `need_snapshot` cesa en cuanto llega el primer `state`.
 */
export const REMOTE_RESNAPSHOT_INTERVAL_MS = REMOTE_PRESENCE_INTERVAL_MS;
export const REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS = 60_000;

/**
 * Canal de Supabase con la forma de `DisplayChannel` más la promesa de su
 * SALIDA (parte C, ronda 2 · 5): `close()` difiere `unsubscribe()` +
 * `removeChannel()`, así que quien reabre el mismo topic en la misma vuelta
 * (apagar y encender el interruptor maestro, `refreshPosDisplay`, cambio de
 * organización) puede esperar a que el anterior haya salido en vez de dejar
 * dos canales del mismo topic sobre el mismo socket.
 */
export interface SupabaseDisplayChannel extends DisplayChannel {
  /** Resuelve cuando el canal ya salió (o en el acto si nunca se cerró). Nunca rechaza. */
  readonly leaving: Promise<void>;
}

/** Fábrica que devuelve el canal con su promesa de salida. Sigue siendo un `DisplayChannelFactory`. */
export type SupabaseDisplayChannelFactory = (terminalId: string) => SupabaseDisplayChannel;

/** Estados de la suscripción tal como los entrega `channel.subscribe(cb)` de supabase-js. */
export type SupabaseChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/**
 * Lo MÍNIMO que se usa de `RealtimeChannel` (supabase-js). Una interfaz
 * propia para que las pruebas usen un doble sin socket y para que ni un
 * cambio de versión de supabase-js ni sus sobrecargas de `on` toquen esto.
 */
export interface SupabaseChannelLike {
  on(type: 'broadcast', filter: { event: string }, callback: (message: { payload?: unknown }) => void): unknown;
  send(args: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown>;
  subscribe(callback?: (status: string, err?: Error) => void): unknown;
  unsubscribe(): Promise<unknown>;
}

/** Lo mínimo que se usa del cliente: `supabase.channel(...)` y, si existe, `removeChannel`. */
export interface SupabaseClientLike {
  channel(
    name: string,
    opts: { config: { private: boolean; broadcast: { self: boolean; ack: boolean } } },
  ): SupabaseChannelLike;
  removeChannel?(channel: SupabaseChannelLike): Promise<unknown>;
}

export interface SupabaseDisplayChannelOptions {
  /** Evento que se publica (`down` en la caja, `up` en la pantalla). */
  sendEvent: string;
  /** Evento que se escucha (`up` en la caja, `down` en la pantalla). */
  listenEvent: string;
  /** Nombre del canal; por defecto `displayChannelName(terminalId)`. La pantalla pasa el `realtime.channel` del bootstrap. */
  channelName?: string;
  /** Cada cambio de estado de la suscripción. Nunca debe lanzar; si lo hace se registra y se sigue. */
  onStatus?: (status: SupabaseChannelStatus, err?: Error) => void;
  /** Tope de la cola previa al join. Solo para pruebas. */
  joinQueueLimit?: number;
}

function isKnownStatus(value: string): value is SupabaseChannelStatus {
  return value === 'SUBSCRIBED' || value === 'TIMED_OUT' || value === 'CLOSED' || value === 'CHANNEL_ERROR';
}

/**
 * Abre un canal de Supabase Realtime con la forma de `DisplayChannel`.
 * Lanza si `client.channel` falla (cliente mal construido): quien lo llama
 * decide antes si hay cliente. Después de construido NUNCA lanza: un fallo
 * de `send` se registra y se traga (PLAN §5.5: la venta no depende de la
 * pantalla).
 */
export function createSupabaseDisplayChannel(
  client: SupabaseClientLike,
  terminalId: string,
  options: SupabaseDisplayChannelOptions,
): SupabaseDisplayChannel {
  const name = options.channelName ?? displayChannelName(terminalId);
  const queueLimit = options.joinQueueLimit ?? JOIN_QUEUE_LIMIT;
  const realtime = client.channel(name, { config: { private: true, broadcast: { self: false, ack: false } } });

  let joined = false;
  let closed = false;
  let leaving: Promise<void> = Promise.resolve();
  const pending: unknown[] = [];

  const push = (msg: unknown) => {
    realtime.send({ type: 'broadcast', event: options.sendEvent, payload: msg }).catch((err: unknown) => {
      console.warn('[pos-display/remoto] no se pudo publicar en el canal', err);
    });
  };

  const channel: SupabaseDisplayChannel = {
    onmessage: null,
    get leaving() {
      return leaving;
    },
    postMessage(msg: unknown) {
      if (closed) return;
      if (!joined) {
        if (pending.length >= queueLimit) pending.shift();
        pending.push(msg);
        return;
      }
      push(msg);
    },
    close() {
      if (closed) return;
      closed = true;
      joined = false;
      // Lo encolado antes del join se DESCARTA, incluido un `bye`/`display_bye`
      // de un cierre en el primer segundo (ronda 2 · 4, riesgo aceptado y
      // documentado en F3-B §4). Vaciarlo aquí significaría una petición HTTP
      // de Broadcast por mensaje retenido (hasta JOIN_QUEUE_LIMIT) contra un
      // canal al que no se llegó a entrar, para ahorrarle al otro lado los
      // REMOTE_STALE_AFTER_MS que ya sabe esperar. El silencio es el camino
      // previsto: el watchdog existe precisamente para las despedidas que no
      // llegan.
      pending.length = 0;
      channel.onmessage = null;
      const leave = async () => {
        try {
          await realtime.unsubscribe();
        } catch (err) {
          console.warn('[pos-display/remoto] no se pudo salir del canal', err);
        }
        try {
          await client.removeChannel?.(realtime);
        } catch {
          // el cliente ya no tiene el canal (o se está cerrando): nada que soltar
        }
      };
      leaving = leave();
    },
  };

  realtime.on('broadcast', { event: options.listenEvent }, (message) => {
    if (closed) return;
    channel.onmessage?.({ data: message?.payload });
  });

  realtime.subscribe((status, err) => {
    if (closed) return;
    if (status === 'SUBSCRIBED') {
      joined = true;
      // Se vacía en orden: el hello va antes que el state que lo siguió.
      while (pending.length > 0) push(pending.shift());
    } else {
      joined = false;
    }
    if (options.onStatus && isKnownStatus(status)) {
      try {
        options.onStatus(status, err);
      } catch (callbackErr) {
        console.error('[pos-display/remoto] onStatus falló:', callbackErr);
      }
    }
  });

  return channel;
}

/** Opciones comunes a los dos lados remotos. */
export interface SupabaseDisplayOptions {
  /** Cliente de supabase-js (o un doble). La caja pasa el de su sesión; la pantalla, el de remoteDisplayClient.ts. */
  client: SupabaseClientLike;
  /** Nombre del canal; por defecto `displayChannelName(terminalId)`. */
  channelName?: string;
  /** Cambios de estado de la suscripción (ver cabecera). */
  onStatus?: SupabaseDisplayChannelOptions['onStatus'];
  /** Solo para pruebas. */
  joinQueueLimit?: number;
}

export type SupabaseBroadcastTransportOptions = Omit<BroadcastChannelTransportOptions, 'channelFactory'> & SupabaseDisplayOptions;
export type SupabaseBroadcastReceiverOptions = Omit<BroadcastChannelReceiverOptions, 'channelFactory'> & SupabaseDisplayOptions;

/** Fábrica de canal para el lado CAJA (publica `down`, escucha `up`). Asignable a `DisplayChannelFactory`. */
export function supabaseTransportChannelFactory(options: SupabaseDisplayOptions): SupabaseDisplayChannelFactory {
  return (terminalId) =>
    createSupabaseDisplayChannel(options.client, terminalId, {
      sendEvent: DISPLAY_DOWN_EVENT,
      listenEvent: DISPLAY_UP_EVENT,
      channelName: options.channelName,
      onStatus: options.onStatus,
      joinQueueLimit: options.joinQueueLimit,
    });
}

/** Fábrica de canal para el lado PANTALLA (publica `up`, escucha `down`). */
export function supabaseReceiverChannelFactory(options: SupabaseDisplayOptions): DisplayChannelFactory {
  return (terminalId) =>
    createSupabaseDisplayChannel(options.client, terminalId, {
      sendEvent: DISPLAY_UP_EVENT,
      listenEvent: DISPLAY_DOWN_EVENT,
      channelName: options.channelName,
      onStatus: options.onStatus,
      joinQueueLimit: options.joinQueueLimit,
    });
}

/**
 * Lado CAJA sobre Supabase Broadcast. Cumple `DisplayTransport` con la
 * MISMA lógica que el transporte local (hereda todo): sobre, seq, latido,
 * `announce`, presencia de la pantalla y `close` con `bye`. `terminalId`
 * debe ser `pos_terminals.id` de la caja vinculada.
 */
export class SupabaseBroadcastTransport extends BroadcastChannelTransport {
  constructor(options: SupabaseBroadcastTransportOptions) {
    const { client, channelName, onStatus, joinQueueLimit, ...base } = options;
    super({ ...base, channelFactory: supabaseTransportChannelFactory({ client, channelName, onStatus, joinQueueLimit }) });
  }
}

/**
 * Lado PANTALLA sobre Supabase Broadcast. Cumple `DisplayReceiver` con la
 * MISMA lógica que el receptor local (hereda todo): adopción de instancia,
 * ventana de elección, descarte por terminal/seq/instancia, watchdog,
 * presencia y `close` con `display_bye`. `terminalId` es el `terminal.id`
 * del bootstrap y `channelName` su `realtime.channel`.
 */
export class SupabaseBroadcastReceiver extends BroadcastChannelReceiver {
  /**
   * El canal que abrió la fábrica, para exponer su `leaving` (ronda 3 · 7).
   * Se captura con un objeto creado ANTES de `super()` porque los campos de
   * la clase todavía no existen cuando el constructor base abre el canal.
   */
  private readonly opened: { channel: SupabaseDisplayChannel | null };

  constructor(options: SupabaseBroadcastReceiverOptions) {
    const { client, channelName, onStatus, joinQueueLimit, ...base } = options;
    const opened: { channel: SupabaseDisplayChannel | null } = { channel: null };
    const factory = supabaseReceiverChannelFactory({ client, channelName, onStatus, joinQueueLimit });
    super({
      ...base,
      channelFactory: (terminalId) => {
        const channel = factory(terminalId) as SupabaseDisplayChannel;
        opened.channel = channel;
        return channel;
      },
    });
    this.opened = opened;
  }

  /**
   * Promesa de la SALIDA del canal (`unsubscribe` + `removeChannel`), ya
   * resuelta mientras no se haya cerrado. Quien suelte el cliente de Realtime
   * después de cerrar el receptor debe esperarla: si no, `removeAllChannels()`
   * y la desconexión del socket corren mientras el `display_bye` sigue en
   * vuelo y la caja se queda en verde hasta vencer el umbral de silencio.
   */
  get leaving(): Promise<void> {
    return this.opened.channel?.leaving ?? Promise.resolve();
  }
}
