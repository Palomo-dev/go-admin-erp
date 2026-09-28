/**
 * Canal de la CAJA con las dos patas (Fase 3, parte C): local (BroadcastChannel
 * o relay de escritorio) siempre, y remota (Supabase Broadcast, canal privado
 * `pos-display:<pos_terminals.id>`) cuando esta caja está vinculada a una
 * terminal registrada y activa.
 *
 * Orden de apertura:
 * 1. Se abre el canal compuesto (multiChannel.ts) con la pata local en el
 *    acto: el transporte es síncrono y la ventana local no espera a nadie.
 * 2. En paralelo se comprueba `isRegisteredTerminal(terminalId)` (una lectura
 *    de `pos_terminals` por la sesión, con RLS). Si es true y el canal sigue
 *    abierto, se cuelga la pata remota: el canal de Supabase de la parte B
 *    (supabaseBroadcastTransport.ts, `down` fuera / `up` dentro, `private:
 *    true`) envuelto en la compuerta de oyente (solo publica mientras una
 *    pantalla remota habla). Si es false —UUID local de la Fase 0 sin fila,
 *    terminal desactivada, sin sesión, sin red— no hay pata remota y todo
 *    sigue exactamente como en F0–F2. Sin la comprobación, cada apertura del
 *    POS intentaría unirse a un canal privado que la política
 *    `pos_display_caja_recibe` rechazaría: un join fallido y un aviso por
 *    caja no registrada, sin ningún beneficio.
 * 3. El id del canal remoto es el `terminalId` que el transporte estampa en
 *    el sobre, que en una caja vinculada ES `pos_terminals.id` (lo escribe
 *    `linkThisTerminal` desde la fila). `isRegisteredTerminal` debe exigir
 *    igualdad exacta con la fila (F3-A ronda 3 · 6: minúsculas de Postgres);
 *    si no coincide, no se cuelga la pata.
 *
 * Lo que la pata remota lleva encima (ronda 2):
 * - `gate: upMessageListenerGate(terminalId, deps.instanceId)`: la compuerta
 *   de oyente solo la mueve un `UpMessage` bien formado de ESTA terminal y
 *   que no vaya dirigido a OTRA instancia (ronda 4 · 4), el mismo predicado
 *   con el que el transporte acepta o descarta (qa · 3).
 * - `beatIntervalMs: REMOTE_BEAT_INTERVAL_MS`: el latido de bajada sale por
 *   Realtime cada 5 s, no cada segundo (qa · 2). El tubo local no cambia.
 * - `conSeguimientoDeSalida`: reabrir el mismo topic espera a que el canal
 *   anterior haya salido (qa · 5), pero con TOPE (ronda 3 · 4): si
 *   `unsubscribe()` no resuelve —socket colgado, `phx_reply` que no llega—,
 *   pasado `SALIDA_ANTERIOR_TIMEOUT_MS` se abre igual. Quedarse sin pantalla
 *   remota para siempre y sin aviso es peor que un solape momentáneo de dos
 *   canales del mismo topic, que supabase-js ya sabe resolver.
 * - Pestillo de revocación (ronda 5 · 2): si la caja revocó la pantalla remota
 *   de esta terminal (revocation.ts), la pata nace —o se queda— cerrada y
 *   ninguna señal la reabre hasta que se emita un código de emparejamiento
 *   nuevo. Antes, «Revocar» solo surtía efecto si la tableta honraba su 401:
 *   una robada conservaba el JWT de Realtime hasta 5 minutos y sus
 *   `display_alive` mantenían a la caja publicando carrito, totales, cliente
 *   y el payload del QR de pago. Desde la ronda de cierre el pestillo es
 *   DURADERO (revocation.ts): recargar el POS —o abrirlo en otra pestaña— ya
 *   no lo pierde, que era la forma más fácil de deshacer un «Revocar».
 * - Saludo retenido (ronda 3 · 1): el `announce()` del emisor es SÍNCRONO y
 *   sale mientras el canal compuesto es todavía solo local, así que el
 *   `hello` no llegaba nunca a la tableta y esta seguía enseñando el carrito
 *   del cliente ANTERIOR hasta que su watchdog la soltaba (~15-17 s). Ahora
 *   `addLeg` le entrega a la pata nueva el último hello y el último state, y
 *   la compuerta —que nace dormida— los RETIENE y los publica en cuanto la
 *   tableta da su primera señal: como mucho un latido remoto (5 s), sin
 *   publicar un solo mensaje cuando no hay tableta.
 *
 * Sin React, sin Supabase, sin DOM: las dependencias se inyectan y se prueba
 * en Node con dobles.
 */

import { createFanOutDisplayChannel, createListenerGatedChannel, upMessageListenerGate, type FanOutDisplayChannel, type ListenerGatedChannel } from './multiChannel';
import { isRemoteDisplayRevoked, onRemoteDisplayRevocationChange } from './revocation';
import {
  REMOTE_BEAT_INTERVAL_MS,
  supabaseTransportChannelFactory,
  type SupabaseChannelStatus,
  type SupabaseClientLike,
  type SupabaseDisplayChannel,
} from './supabaseBroadcastTransport';
import { displayChannelName, type DisplayChannel, type DisplayChannelFactory } from './transport';

export interface CajaChannelDeps {
  /** Tubo local: relay de escritorio o BroadcastChannel (transport.ts `createBroadcastDisplayChannel`). */
  local: DisplayChannelFactory;
  /**
   * Cliente de Supabase de la sesión (`supabase.channel`), o null si este
   * entorno no lo tiene (dobles de prueba, SSR): entonces nunca hay pata remota.
   */
  realtime: SupabaseClientLike | null;
  /**
   * ¿Esta caja puede emitir por el canal remoto de `terminalId`? Quien la
   * implemente (posDisplay.ts `terminalVinculadaYVerificada`) exige vínculo
   * local Y fila ACTIVA de `pos_terminals` leída del SERVIDOR por ese id
   * exacto, y falla CERRADO si la lectura se cae. Si lanza cuenta como false.
   */
  isRegisteredTerminal: (terminalId: string) => Promise<boolean>;
  /** Estado de la suscripción remota (SUBSCRIBED, CHANNEL_ERROR…), para el registro y las pruebas. */
  onRemoteStatus?: (status: SupabaseChannelStatus, err?: Error) => void;
  /**
   * `instanceId` del transporte que abre este canal, en diferido (ronda 4 · 4):
   * la compuerta de oyente aplica así el MISMO filtro que `receive`, incluido
   * el destinatario. Se resuelve tarde a propósito: el transporte abre el
   * canal dentro de su constructor, cuando todavía no hay referencia a él.
   * Mientras devuelva null no se compara el destinatario.
   */
  instanceId?: () => string | null;
  /** Reloj de la compuerta de oyente (pruebas). */
  now?: () => number;
  /** TTL de la compuerta (pruebas). */
  listenerTtlMs?: number;
  /** Ritmo del latido de bajada por la pata remota. Por defecto REMOTE_BEAT_INTERVAL_MS (5 s). */
  beatIntervalMs?: number;
  /** Tope de la espera de la salida del topic anterior. Por defecto SALIDA_ANTERIOR_TIMEOUT_MS. 0 la desactiva. */
  salidaTimeoutMs?: number;
}

/**
 * Tope de la espera de la salida del canal anterior del mismo topic
 * (ronda 3 · 4). Suficiente para el `phx_leave` de un socket vivo y corto
 * para que una caja no se quede sin tableta si el socket está colgado.
 */
export const SALIDA_ANTERIOR_TIMEOUT_MS = 1_500;

/** Los temporizadores de espera no deben mantener vivo el proceso en Node (pruebas, SSR). */
function sinRetenerElProceso(timer: ReturnType<typeof setTimeout>): void {
  const conUnref = timer as unknown as { unref?: () => void };
  if (typeof conUnref.unref === 'function') conUnref.unref();
}

/**
 * Espera a que el topic anterior salga, como mucho `timeoutMs`. Nunca
 * rechaza: ni el rechazo de `leaving` ni el vencimiento del plazo impiden
 * abrir el canal nuevo.
 *
 * Al VENCER el plazo se borra además la entrada de `salidasEnVuelo`
 * (ronda 4 · C2). Solo se limpiaba en el `finally` de la promesa de salida,
 * así que una salida que no resuelve nunca —socket colgado, `phx_reply` que
 * no llega, justo el caso que motivó el tope— dejaba la entrada ahí para
 * siempre: cada apertura posterior del mismo topic volvía a pagar el plazo
 * entero antes de colgar la pata remota. Se borra con la MISMA comparación de
 * identidad que el `finally` (`=== salida`), para no pisar la entrada de una
 * salida posterior que sí está en curso.
 */
function esperarSalidaAnterior(topic: string, timeoutMs: number): Promise<void> {
  const salida = salidasEnVuelo.get(topic);
  if (!salida) return Promise.resolve();
  if (timeoutMs <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let resuelto = false;
    const terminar = () => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(temporizador);
      resolve();
    };
    const temporizador = setTimeout(() => {
      if (resuelto) return;
      console.warn(`[pos-display] el canal remoto anterior de ${topic} no terminó de salir en ${timeoutMs} ms; se abre igual`);
      if (salidasEnVuelo.get(topic) === salida) salidasEnVuelo.delete(topic);
      terminar();
    }, timeoutMs);
    sinRetenerElProceso(temporizador);
    salida.then(terminar, terminar);
  });
}

/**
 * Salidas en vuelo por topic (ronda 2 · 5). `close()` del canal de Supabase
 * difiere `unsubscribe()` + `removeChannel()`, así que apagar y encender el
 * interruptor maestro en la misma vuelta abría un segundo canal con el MISMO
 * topic sobre el mismo socket (CHANNEL_ERROR o entrega duplicada). Aquí se
 * espera a que el anterior salga antes de abrir el siguiente. El mapa se
 * vacía solo: cada entrada se borra cuando su promesa resuelve.
 */
const salidasEnVuelo = new Map<string, Promise<void>>();

/** Anota la salida de `channel` bajo `topic` cuando alguien lo cierre, para que la próxima apertura la espere. */
function conSeguimientoDeSalida(topic: string, channel: SupabaseDisplayChannel): DisplayChannel {
  const seguido: DisplayChannel = {
    get onmessage() {
      return channel.onmessage;
    },
    set onmessage(next) {
      channel.onmessage = next;
    },
    postMessage(msg: unknown) {
      channel.postMessage(msg);
    },
    close() {
      channel.close();
      const salida = channel.leaving.finally(() => {
        if (salidasEnVuelo.get(topic) === salida) salidasEnVuelo.delete(topic);
      });
      salidasEnVuelo.set(topic, salida);
    },
  };
  return seguido;
}

/** Envuelve la pata para que al cerrarla se dé de baja también la escucha de revocaciones. */
function conBajaDeRevocacion(channel: DisplayChannel, baja: () => void): DisplayChannel {
  return {
    get onmessage() {
      return channel.onmessage;
    },
    set onmessage(next) {
      channel.onmessage = next;
    },
    postMessage(msg: unknown) {
      channel.postMessage(msg);
    },
    close() {
      baja();
      channel.close();
    },
  };
}

/** Canal compuesto de la caja más la promesa de la decisión remota (para que las pruebas esperen sin sondear). */
export interface CajaDisplayChannel extends FanOutDisplayChannel {
  /** Resuelve cuando ya se decidió si hay pata remota: true si quedó colgada. */
  readonly remoteAttached: Promise<boolean>;
}

/**
 * Abre el canal compuesto de la caja. Devuelve en el acto (pata local); la
 * remota llega cuando `isRegisteredTerminal` responde. Nunca lanza por la
 * pata remota: un fallo ahí se registra y la caja sigue en local.
 */
export function createCajaDisplayChannel(terminalId: string, deps: CajaChannelDeps): CajaDisplayChannel {
  const fanOut = createFanOutDisplayChannel([{ origin: 'local', channel: deps.local(terminalId) }]);

  const attachRemote = async (): Promise<boolean> => {
    if (!deps.realtime) return false;
    let registered = false;
    try {
      registered = (await deps.isRegisteredTerminal(terminalId)) === true;
    } catch (err) {
      console.warn('[pos-display] no se pudo comprobar la terminal registrada; la pantalla remota queda fuera', err);
      return false;
    }
    if (!registered || fanOut.isClosed) return false;
    const topic = displayChannelName(terminalId);
    // El canal anterior del mismo topic puede seguir saliendo (ronda 2 · 5),
    // pero la espera tiene tope (ronda 3 · 4): nunca deja la pata sin colgar.
    await esperarSalidaAnterior(topic, deps.salidaTimeoutMs ?? SALIDA_ANTERIOR_TIMEOUT_MS);
    if (fanOut.isClosed) return false;
    try {
      const remote = supabaseTransportChannelFactory({ client: deps.realtime, onStatus: deps.onRemoteStatus })(terminalId);
      const gated: ListenerGatedChannel = createListenerGatedChannel(conSeguimientoDeSalida(topic, remote), {
        now: deps.now,
        listenerTtlMs: deps.listenerTtlMs,
        // La compuerta la gobierna quien valida: solo un `UpMessage` bien formado de ESTA
        // terminal (ronda 2 · 3) y que no vaya dirigido a otra instancia (ronda 4 · 4)
        // la abre o la cierra. Mismo predicado que `receive`, no una copia.
        gate: upMessageListenerGate(terminalId, deps.instanceId),
        beatIntervalMs: deps.beatIntervalMs ?? REMOTE_BEAT_INTERVAL_MS,
      });
      // Pestillo de revocación (ronda 5 · 2): si esta caja ya revocó la pantalla
      // de esta terminal, la pata nace cerrada y NINGUNA señal la reabre hasta
      // que se emita un código de emparejamiento nuevo. Es lo que hace que
      // «Revocar» corte el flujo desde el lado que sí manda —la caja— en vez de
      // depender de que la tableta honre su 401.
      if (isRemoteDisplayRevoked(terminalId)) gated.revokeListener();
      const bajaRevocacion = onRemoteDisplayRevocationChange((id, revoked) => {
        if (id !== terminalId) return;
        if (revoked) gated.revokeListener();
        else gated.allowListener();
      });
      // `addLeg` le pasa el hello y el state ya publicados, pero la compuerta
      // nace dormida y los deja RETENIDOS, no los tira (ronda 3 · 1): salen
      // en cuanto la tableta da su primera señal por este tubo. No se
      // publican aquí a propósito: sin tableta el canal remoto sigue
      // costando cero mensajes, que es lo que justifica la compuerta.
      const colgada = fanOut.addLeg({ origin: 'remote', channel: conBajaDeRevocacion(gated, bajaRevocacion) });
      if (!colgada) bajaRevocacion();
      return colgada;
    } catch (err) {
      console.warn('[pos-display] no se pudo abrir el canal remoto; la caja sigue en local', err);
      return false;
    }
  };

  const remoteAttached = attachRemote();
  return Object.assign(fanOut, { remoteAttached });
}
