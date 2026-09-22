'use client';

/**
 * Pantalla remota en React (Fase 3, parte B): decide si /pos-display arranca
 * en LOCAL (BroadcastChannel / relay de escritorio, como siempre) o en
 * REMOTO (token emparejado + Supabase Broadcast), y lleva el ciclo de vida
 * remoto: canje del código, bootstrap con reintento, cliente Realtime con el
 * JWT vigente, latido cada 60 s y vuelta al emparejamiento ante un 401.
 * La lógica sin React vive en `@/lib/pos/display/remoteDisplay.ts` (probada
 * en Node); aquí solo hay estado y efectos.
 *
 * Fases (`phase.kind`):
 * - `deciding`: primer render (aún no se leyó la URL ni el storage).
 * - `local`: comportamiento anterior a la parte B. `openPairing()` lleva a
 *   `pairing` (botón de «Conectando» cuando no hay caja en este equipo).
 * - `pairing`: campo del código (y teclado si táctil). `submitCode()` canjea.
 * - `bootstrapping`: hay token; se pide `/bootstrap` (con retroceso si falla
 *   por algo que no sea 401).
 * - `ready`: bootstrap en mano, JWT aplicado al cliente, `source` listo para
 *   que `useDisplayReceiver` abra el `SupabaseBroadcastReceiver`.
 * - `unavailable`: faltan `NEXT_PUBLIC_SUPABASE_*` en este bundle (no es un
 *   error de emparejamiento: no hay cliente que construir).
 *
 * Ronda 2 (ver F3-B §3, §4 y §4 bis):
 * - Un canje fallido con emparejamiento guardado NO lleva a `pairing`: se
 *   sigue con el token que había (`resolveRedeemFailure`). Es el quiosco
 *   cuya URL de arranque conserva un código ya consumido. Ronda 3: solo si
 *   el código que falló es el mismo del emparejamiento guardado y el fallo
 *   no es un 429.
 * - El receptor remoto se construye con el ritmo REMOTO, no con el de 1 s
 *   del transporte local, y ese ritmo viaja en `source.staleAfterMs`.
 * - Al despertar la pestaña o volver la red se fuerza un latido: el JWT de
 *   canal vive 5 min y una tableta suspendida vuelve con él vencido.
 * - Al soltar el remoto se cierra ANTES el receptor (para que su
 *   `display_bye` salga por un canal todavía vivo) y después el cliente.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DisplayReceiver } from '@/lib/pos/display/transport';
import {
  bootstrapRetryDelay,
  clearStoredRemoteDisplay,
  fetchRemoteBootstrap,
  isUnauthorizedFailure,
  pairWithCode,
  pairingCodeFingerprint,
  readStoredRemoteDisplay,
  resolvePairingSubmit,
  resolveRedeemFailure,
  resolveRemoteIntent,
  saveStoredRemoteDisplay,
  shouldForceBeat,
  shouldKeepPairingCode,
  startRemoteHeartbeat,
  stripPairFromUrl,
  type FetchLike,
  type RemoteApiFailure,
  type RemoteBootstrap,
  type RemoteHeartbeat,
} from '@/lib/pos/display/remoteDisplay';
import { createRemoteDisplayClient, type RemoteDisplayClient } from '@/lib/pos/display/remoteDisplayClient';
import {
  REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS,
  REMOTE_PRESENCE_INTERVAL_MS,
  REMOTE_RESNAPSHOT_INTERVAL_MS,
  REMOTE_STALE_AFTER_MS,
  SupabaseBroadcastReceiver,
  type SupabaseChannelStatus,
} from '@/lib/pos/display/supabaseBroadcastTransport';

export type PairingError = 'invalid' | 'rate_limited' | 'network' | 'server' | 'revoked' | 'storage';

/** Lo que `useDisplayReceiver` necesita para abrir el receptor remoto. Estable mientras dure la fase `ready`. */
export interface RemoteReceiverSource {
  terminalId: string;
  channelName: string;
  /**
   * Silencio tras el cual el enlace da la caja por caída. En remoto es
   * REMOTE_STALE_AFTER_MS (15 s), no los 3 s de local: el latido remoto va
   * más despacio a propósito (supabaseBroadcastTransport.ts · «ritmo del
   * canal remoto») y con el umbral corto «Conectando» saltaría entre
   * latidos. `useDisplayReceiver` se lo pasa a `startDisplayLink`.
   */
  staleAfterMs: number;
  /**
   * Cada cuánto se repite `need_snapshot` mientras no hay caja viva, y cada
   * cuánto una vez la caja lleva `DISCONNECTED_TO_IDLE_MS` callada
   * (ronda 4 · QA-1). Los 2 s del enlace son gratis en BroadcastChannel;
   * aquí cada pregunta es un mensaje facturado y, con la caja cerrada, nadie
   * va a contestarla. `useDisplayReceiver` se los pasa a `startDisplayLink`.
   */
  resnapshotIntervalMs: number;
  idleResnapshotIntervalMs: number;
  createReceiver(): DisplayReceiver;
}

export type RemoteDisplayPhase =
  | { kind: 'deciding' }
  | { kind: 'local' }
  | { kind: 'pairing'; busy: boolean; error: PairingError | null; prefill: string; canCancel: boolean; keepCode?: boolean; retryAfterSeconds?: number | null }
  | { kind: 'bootstrapping'; attempt: number; failure: RemoteApiFailure | null }
  | { kind: 'ready'; bootstrap: RemoteBootstrap; source: RemoteReceiverSource }
  | { kind: 'unavailable' };

export interface RemoteDisplayView {
  phase: RemoteDisplayPhase;
  /** Estado de la suscripción al canal (solo en `ready`); null hasta el primer aviso. */
  channelStatus: SupabaseChannelStatus | null;
  /** Canjea el código tecleado. Ignora códigos que no tengan 6 dígitos. */
  submitCode(code: string): void;
  /** Desde «Conectando» sin caja local: abrir el emparejamiento. */
  openPairing(): void;
  /** Volver al modo local (solo si se llegó a `pairing` desde `local`). */
  cancelPairing(): void;
}

function mapPairFailure(failure: RemoteApiFailure): PairingError {
  if (failure.kind === 'network') return 'network';
  if (failure.status === 429) return 'rate_limited';
  if (failure.status === 400 || failure.status === 404) return 'invalid';
  return 'server';
}

const browserFetch: FetchLike = (input, init) => fetch(input, init);

/**
 * Cuánto se espera a que el canal haya SALIDO (`unsubscribe` +
 * `removeChannel`) antes de soltar el cliente de Realtime (ronda 3 · 7). El
 * `display_bye` del receptor viaja por ese canal: si se desconecta el socket
 * mientras el envío sigue en vuelo, la caja se queda en verde hasta vencer el
 * umbral de silencio. Es un tope, no una espera: si la salida se atasca se
 * suelta igual.
 */
const LEAVE_GRACE_MS = 2_000;

/**
 * La salida del canal (o nada) acotada a `LEAVE_GRACE_MS`. Nunca rechaza.
 *
 * El temporizador del tope se CANCELA cuando gana la salida (ronda 4 · QA-3):
 * si no, cada desmontaje o revocación dejaba dos segundos de temporizador
 * vivo. Es inocuo en producción, pero una pantalla que se empareja y se
 * revoca varias veces en una prueba deja temporizadores sueltos y ensucia
 * cualquier aserción de «sin temporizadores pendientes».
 */
function waitForLeave(leaving: Promise<void> | null): Promise<void> {
  if (!leaving) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    leaving.catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LEAVE_GRACE_MS);
    }),
  ]).then(() => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  });
}

export function useRemoteDisplay(): RemoteDisplayView {
  const [phase, setPhase] = useState<RemoteDisplayPhase>({ kind: 'deciding' });
  /** La fase actual para leerla desde los callbacks sin depender de ella (y sin efectos dentro de un updater). */
  const phaseRef = useRef<RemoteDisplayPhase>(phase);
  phaseRef.current = phase;
  const [channelStatus, setChannelStatus] = useState<SupabaseChannelStatus | null>(null);
  const clientRef = useRef<RemoteDisplayClient | null>(null);
  const heartbeatRef = useRef<RemoteHeartbeat | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Avanza con cada arranque/parada: una respuesta que llega tarde no pisa la fase actual. */
  const generationRef = useRef(0);
  /** `pairing` alcanzado desde `local` (botón): cancelar vuelve a local. Desde `?pair` o tras revocar, no hay a dónde volver. */
  const cameFromLocalRef = useRef(false);
  /** Se llegó al teclado desde «Conectando» y hay emparejamiento guardado: «Cancelar» reanuda el arranque. */
  const cameFromBootstrapRef = useRef(false);
  /** `startRemote` accesible desde callbacks declarados antes que él (cancelPairing). */
  const startRemoteRef = useRef<((token: string) => void) | null>(null);
  /**
   * Canje en vuelo por código. Un código se consume en el servidor al primer
   * canje: si React vuelve a ejecutar el efecto de montaje (StrictMode en
   * desarrollo desmonta y remonta), el segundo intento reutiliza la MISMA
   * petición en vez de mandar el código otra vez y recibir un 404.
   */
  const pairInFlightRef = useRef<{ code: string; promise: ReturnType<typeof pairWithCode> } | null>(null);
  /**
   * El receptor remoto que abrió `useDisplayReceiver` (lo registra
   * `createReceiver`). Se guarda aquí para poder CERRARLO —y con él mandar
   * su `display_bye`— antes de soltar el cliente de Realtime: `dispose()`
   * quita los canales y desconecta el socket, así que si se llamaba primero
   * (revocación) la despedida salía por un canal ya retirado y la caja se
   * quedaba en verde hasta vencer el umbral de silencio (ronda 2 · 4).
   * `close()` del receptor es idempotente: que `useDisplayReceiver` lo
   * vuelva a cerrar al desmontar no manda un segundo bye.
   *
   * Se guarda con su tipo concreto para poder esperar su `leaving` —la
   * promesa de salida del canal— antes de soltar el cliente (ronda 3 · 7).
   */
  const receiverRef = useRef<SupabaseBroadcastReceiver | null>(null);
  /** Quita los oyentes de `visibilitychange` / `online` que fuerzan un latido al despertar. */
  const wakeCleanupRef = useRef<(() => void) | null>(null);
  /**
   * Instante del último latido que salió bien (o del último forzado), para no
   * forzar uno con cada alternancia de pestaña (ronda 3 · 6; la regla está en
   * `shouldForceBeat`). null mientras no haya habido ninguno.
   */
  const lastBeatAtRef = useRef<number | null>(null);

  const teardownRemote = useCallback(() => {
    generationRef.current += 1;
    if (retryRef.current !== null) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    heartbeatRef.current?.stop();
    heartbeatRef.current = null;
    wakeCleanupRef.current?.();
    wakeCleanupRef.current = null;
    lastBeatAtRef.current = null;
    // Primero la despedida, después el socket: se cierra el receptor (manda
    // su `display_bye`) y se espera a que el canal haya SALIDO antes de
    // soltar el cliente, con `LEAVE_GRACE_MS` de tope (ronda 3 · 7).
    const receiver = receiverRef.current;
    receiverRef.current = null;
    let leaving: Promise<void> | null = null;
    if (receiver) {
      try {
        receiver.close(true);
        leaving = receiver.leaving;
      } catch (err) {
        console.warn('[pos-display/remoto] no se pudo cerrar el receptor', err);
      }
    }
    const client = clientRef.current;
    clientRef.current = null;
    if (client) {
      void waitForLeave(leaving).then(() => client.dispose());
    }
    setChannelStatus(null);
  }, []);

  /** Token revocado o inválido (401): se borra, se cierra todo y se vuelve a pedir el código. */
  const onUnauthorized = useCallback(() => {
    teardownRemote();
    clearStoredRemoteDisplay();
    cameFromLocalRef.current = false;
    setPhase({ kind: 'pairing', busy: false, error: 'revoked', prefill: '', canCancel: false });
  }, [teardownRemote]);

  const startRemote = useCallback(
    (token: string, attempt = 0) => {
      const generation = ++generationRef.current;
      setPhase({ kind: 'bootstrapping', attempt, failure: null });

      void (async () => {
        // Con emparejamiento guardado se exige que el arranque sea de ESA
        // terminal (simetría con el latido): un bootstrap de otra uniría la
        // pantalla al canal de una caja ajena.
        const guardadoAlArrancar = readStoredRemoteDisplay();
        const result = await fetchRemoteBootstrap(token, browserFetch, {
          expectedTerminalId: guardadoAlArrancar?.token === token ? guardadoAlArrancar.terminalId : undefined,
        });
        if (generation !== generationRef.current) return;
        if (!result.ok) {
          if (isUnauthorizedFailure(result)) {
            onUnauthorized();
            return;
          }
          // 503 (Realtime no configurado, base caída) o red: se reintenta con retroceso; el token se conserva.
          setPhase({ kind: 'bootstrapping', attempt, failure: result });
          retryRef.current = setTimeout(() => {
            retryRef.current = null;
            if (generation === generationRef.current) startRemote(token, attempt + 1);
          }, bootstrapRetryDelay(attempt));
          return;
        }

        const bootstrap = result.data;
        /**
         * Id de la terminal NORMALIZADO (ronda 4 · 6). El servidor firma el
         * claim `pos_terminal_id` y nombra el canal con el id en minúsculas
         * (`issueDisplayRealtimeCredential`), y el receptor descarta los
         * sobres cuyo `terminalId` no coincida con este. Hoy Postgres
         * devuelve los uuid en minúsculas y los tres coinciden por costumbre;
         * normalizar aquí hace que salgan los tres de la misma regla, en vez
         * de que un id en otra caja pasara el bootstrap y el receptor
         * descartara TODO en silencio.
         */
        const terminalId = bootstrap.terminal.id.toLowerCase();
        const client = createRemoteDisplayClient();
        if (!client) {
          setPhase({ kind: 'unavailable' });
          return;
        }
        // El JWT va ANTES de abrir el canal (remoteDisplayClient.ts, «orden obligatorio»).
        await client.setToken(bootstrap.realtime.token);
        if (generation !== generationRef.current) {
          void client.dispose();
          return;
        }
        clientRef.current = client;

        const heartbeat = startRemoteHeartbeat({
          token,
          fetchFn: browserFetch,
          // El latido renueva la credencial del canal cada 60 s; sin esto
          // aplicaría cualquiera con la forma correcta (ronda 4 · 4).
          expectedTerminalId: terminalId,
          onCredential: (credential) => {
            lastBeatAtRef.current = Date.now();
            if (generation === generationRef.current) void client.setToken(credential.token);
          },
          onRevoked: () => {
            if (generation === generationRef.current) onUnauthorized();
          },
        });
        heartbeatRef.current = heartbeat;
        /**
         * El JWT del canal vive 5 minutos y el latido HTTP va cada 60 s, así
         * que en marcha siempre hay margen. Lo que NO lo tiene es una tableta
         * que estuvo suspendida o sin wifi más de cinco minutos: vuelve con
         * el token vencido y, sin esto, se quedaría sin canal hasta acertar
         * el siguiente tick de 60 s. Al volver la pestaña a primer plano o al
         * recuperar la red se fuerza un latido, que trae un JWT fresco en el
         * acto (ronda 2 · 3). `beat()` nunca solapa dos peticiones.
         */
        // Con un mínimo de FORCED_BEAT_MIN_INTERVAL_MS entre forzados (ronda
        // 3 · 6): alternar la pestaña diez veces seguidas no puede firmar diez
        // JWT en el servidor, y quien vuelve de una suspensión larga sigue
        // teniendo su latido inmediato (el último correcto es viejo).
        const wake = () => {
          if (generation !== generationRef.current) return;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
          const now = Date.now();
          if (!shouldForceBeat(lastBeatAtRef.current, now)) return;
          lastBeatAtRef.current = now;
          void heartbeat.beat();
        };
        // `visibilitychange` se dispara en el documento; `online`, en la ventana.
        document.addEventListener('visibilitychange', wake);
        window.addEventListener('online', wake);
        wakeCleanupRef.current = () => {
          document.removeEventListener('visibilitychange', wake);
          window.removeEventListener('online', wake);
        };

        const channelName = bootstrap.realtime.channel;
        const source: RemoteReceiverSource = {
          terminalId,
          channelName,
          staleAfterMs: REMOTE_STALE_AFTER_MS,
          resnapshotIntervalMs: REMOTE_RESNAPSHOT_INTERVAL_MS,
          idleResnapshotIntervalMs: REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS,
          createReceiver: () => {
            // Ritmo REMOTO explícito: cada `display_alive` cuesta un mensaje
            // facturado (supabaseBroadcastTransport.ts · «ritmo del canal
            // remoto»). El de 1 s del transporte local se queda en local.
            const receiver = new SupabaseBroadcastReceiver({
              terminalId,
              channelName,
              client: client.client,
              presenceIntervalMs: REMOTE_PRESENCE_INTERVAL_MS,
              staleAfterMs: REMOTE_STALE_AFTER_MS,
              onStatus: (status) => {
                if (generation === generationRef.current) setChannelStatus(status);
              },
            });
            receiverRef.current = receiver;
            return receiver;
          },
        };
        setPhase({ kind: 'ready', bootstrap, source });
      })();
    },
    [onUnauthorized],
  );

  /** Quita `?pair=` de la barra de direcciones: el código ya se consumió (vale o no, no se reintenta). */
  const forgetPairInUrl = useCallback(() => {
    try {
      window.history.replaceState(window.history.state, '', stripPairFromUrl(window.location.href));
    } catch {
      // history no disponible (iframe con sandbox): inocuo
    }
  }, []);

  const redeem = useCallback(
    async (code: string) => {
      const generation = ++generationRef.current;
      const inFlight = pairInFlightRef.current;
      const promise = inFlight && inFlight.code === code ? inFlight.promise : pairWithCode(code, browserFetch);
      pairInFlightRef.current = { code, promise };
      // La huella del código se calcula en paralelo al canje: hace falta en
      // los dos desenlaces (guardarla al acertar, compararla al fallar).
      const [result, codeHash] = await Promise.all([promise, pairingCodeFingerprint(code)]);
      if (pairInFlightRef.current?.promise === promise) pairInFlightRef.current = null;
      if (generation !== generationRef.current) return;
      if (!result.ok) {
        /**
         * El canje falló, pero eso no invalida un emparejamiento anterior
         * (ronda 2 · 1). El caso real es el quiosco de PLAN §3.3: su URL de
         * arranque es `/pos-display?pair=<código>` y esa URL no cambia, así
         * que en cada reinicio se reintenta un código ya consumido. Antes la
         * pantalla se quedaba pidiendo un código nuevo delante del cliente
         * aunque su token siguiera vivo; ahora arranca con él, como si no
         * hubiera `?pair`. Se relee del storage en vez de confiar en lo que
         * se leyó al montar: entre medias pudo revocarse.
         *
         * Acotado en la ronda 3 · 2 y · 4: ese respaldo solo se aplica si el
         * código que falló es EL MISMO con el que se obtuvo el
         * emparejamiento guardado (se compara la huella sha256) y el fallo no
         * es un 429. Con otro código —reapuntar la tableta a otra caja— se
         * muestra el error en vez de arrancar en silencio contra la caja
         * anterior. La regla vive en `resolveRedeemFailure`.
         */
        forgetPairInUrl();
        // Se RELEE del storage en vez de confiar en lo que se leyó al montar:
        // entre medias pudo revocarse (401) y borrarse.
        const next = resolveRedeemFailure(result, readStoredRemoteDisplay(), codeHash);
        if (next.kind === 'fallback') {
          console.warn('[pos-display/remoto] el código no se pudo canjear; se sigue con el emparejamiento guardado', result);
          startRemote(next.stored.token);
          return;
        }
        /**
         * El código se conserva en el campo cuando el fallo NO lo consumió
         * —corte de red o 5xx— (ronda 4 · B6): la petición ni llegó a
         * mirarlo, así que borrarlo obligaba a teclearlo otra vez, o a pedir
         * otro a la caja, por algo que no tiene que ver con él. Con 400, 404
         * o 429 se limpia: hay que volver a la caja o esperar. La regla vive
         * en `shouldKeepPairingCode`.
         */
        const conserva = shouldKeepPairingCode(result);
        setPhase({
          kind: 'pairing',
          busy: false,
          error: mapPairFailure(result),
          prefill: conserva ? code : '',
          canCancel: cameFromLocalRef.current,
          keepCode: conserva,
          // 429: el servidor dice cuánto esperar; la vista lo pinta y bloquea el reenvío.
          retryAfterSeconds: result.kind === 'http' ? result.retryAfterSeconds : null,
        });
        return;
      }
      if (!saveStoredRemoteDisplay({ token: result.data.token, terminalId: result.data.terminalId, codeHash })) {
        // Sin storage (modo privado bloqueado) la pantalla funcionaría solo hasta recargar; se avisa y no se sigue.
        // El código YA se consumió en el servidor: para reintentar hace falta uno nuevo (lo dice el texto del error).
        forgetPairInUrl();
        setPhase({ kind: 'pairing', busy: false, error: 'storage', prefill: '', canCancel: cameFromLocalRef.current });
        return;
      }
      // El código ya se consumió: que una recarga no lo vuelva a canjear.
      forgetPairInUrl();
      startRemote(result.data.token);
    },
    [startRemote, forgetPairInUrl],
  );

  // Arranque: URL y storage deciden (remoteDisplay.ts · resolveRemoteIntent).
  useEffect(() => {
    const intent = resolveRemoteIntent(window.location.search, readStoredRemoteDisplay());
    switch (intent.kind) {
      case 'local':
        setPhase({ kind: 'local' });
        break;
      case 'ask_code':
        cameFromLocalRef.current = false;
        // El `?pair=` que no llega a canjearse (letras, corto o largo) también
        // sale de la URL y del historial: el valor sigue siendo un código de
        // emparejamiento a medio teclear delante del cliente.
        forgetPairInUrl();
        setPhase({ kind: 'pairing', busy: false, error: null, prefill: intent.prefill, canCancel: false });
        break;
      case 'remote':
        startRemote(intent.stored.token);
        break;
      case 'pair':
        cameFromLocalRef.current = false;
        setPhase({ kind: 'pairing', busy: true, error: null, prefill: intent.code, canCancel: false });
        void redeem(intent.code);
        break;
    }
    return () => teardownRemote();
    // Solo al montar: la URL y el storage se leen una vez; lo demás lo mueven las acciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCode = useCallback(
    (raw: string) => {
      /**
       * El guard va AQUÍ, no dentro del updater de `setPhase` (ronda 3 · 3):
       * el updater puede ejecutarse más tarde (React no garantiza evaluarlo
       * en el despacho), así que con él como única defensa `redeem` salía
       * igual. `pairInFlightRef` se rellena de forma síncrona al empezar el
       * canje y se vacía al terminar: es el «ocupado» de verdad. Dos códigos
       * distintos seguidos quemaban dos canjes y dos cupos del límite por IP.
       */
      const code = resolvePairingSubmit(raw, pairInFlightRef.current !== null);
      if (code === null) return;
      setPhase({ kind: 'pairing', busy: true, error: null, prefill: code, canCancel: cameFromLocalRef.current });
      void redeem(code);
    },
    [redeem],
  );

  /**
   * Abrir la pantalla de emparejamiento. Dos orígenes:
   * - `local`: el botón de «Conectando» / «no compatible» cuando en este
   *   equipo no hay caja. Cancelar vuelve a local.
   * - `bootstrapping`: la salida que ofrece la vista tras tres fallos
   *   seguidos que no son 401 (ronda 4 · B4). Se sueltan antes el reintento
   *   y el cliente (`teardownRemote`) para que una respuesta tardía no pise
   *   la fase, y NO se borra el token: si quien está delante no tiene un
   *   código a mano, recargar vuelve a intentar el arranque normal. No hay a
   *   dónde cancelar, así que `canCancel` es false.
   *
   * Se lee la fase de un ref en vez del updater de `setPhase`: aquí hay
   * efectos (parar el reintento) que no pueden vivir dentro de un updater,
   * que React puede ejecutar dos veces.
   */
  startRemoteRef.current = startRemote;

  const openPairing = useCallback(() => {
    const prev = phaseRef.current;
    if (prev.kind === 'local') {
      cameFromLocalRef.current = true;
      setPhase({ kind: 'pairing', busy: false, error: null, prefill: '', canCancel: true });
      return;
    }
    if (prev.kind === 'bootstrapping') {
      teardownRemote();
      cameFromLocalRef.current = false;
      // Hay a dónde volver: el emparejamiento guardado sigue ahí (solo se
      // borra con un 401). Sin esto, pedir el teclado en una pantalla táctil
      // que el cliente mira era una puerta de un solo sentido: sin código a
      // mano no quedaba más salida que recargar (ronda 4 · B4).
      cameFromBootstrapRef.current = readStoredRemoteDisplay() !== null;
      setPhase({ kind: 'pairing', busy: false, error: null, prefill: '', canCancel: cameFromBootstrapRef.current });
    }
  }, [teardownRemote]);

  const cancelPairing = useCallback(() => {
    const prev = phaseRef.current;
    if (prev.kind !== 'pairing' || !prev.canCancel || prev.busy) return;
    // Se llegó aquí desde «Conectando»: se reanuda el arranque con el
    // emparejamiento guardado en vez de caer al modo local, que dejaría la
    // pantalla mostrando el pedido de ESTA máquina en vez del de la caja.
    const guardado = cameFromBootstrapRef.current ? readStoredRemoteDisplay() : null;
    if (guardado) {
      cameFromBootstrapRef.current = false;
      startRemoteRef.current?.(guardado.token);
      return;
    }
    setPhase({ kind: 'local' });
  }, []);

  return useMemo(() => ({ phase, channelStatus, submitCode, openPairing, cancelPairing }), [phase, channelStatus, submitCode, openPairing, cancelPairing]);
}
