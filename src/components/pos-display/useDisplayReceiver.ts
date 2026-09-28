'use client';

/**
 * Enlace entre /pos-display y el receptor de la Parte A
 * (BroadcastChannelReceiver), envuelto en estado de React. La lógica (salud
 * de la conexión, need_snapshot repetido, olvido de la caja, saneado y
 * resaltado) vive en displayLink.ts, sin React, y se prueba en Node.
 *
 * - Al montar: lee el `pos_terminal_id` de la caja (mismo origen). Si aún no
 *   existe (la caja no se ha abierto nunca en este equipo) espera al evento
 *   `storage` y a un sondeo de 1 s; la pantalla queda en Conectando.
 * - Con terminal: abre el receptor y arranca el enlace, que pide
 *   `need_snapshot` con las capacidades (PLAN §4.4) y emite la presencia
 *   (`display_alive` cada 1 s).
 *
 * SELECCIÓN DE TRANSPORTE (Fase 3, parte B; PLAN §3.2):
 * - Con `remote` (fase `ready` de useRemoteDisplay: hay token emparejado y
 *   bootstrap): el receptor es el `SupabaseBroadcastReceiver` que crea
 *   `remote.createReceiver()`, el id de terminal es el del bootstrap
 *   (`pos_terminals.id`), el umbral de silencio y el ritmo del
 *   `need_snapshot` son los remotos (`remote.staleAfterMs`,
 *   `remote.resnapshotIntervalMs`, `remote.idleResnapshotIntervalMs`) y
 *   `supported` es true (no hace falta
 *   BroadcastChannel; el canal va por WebSocket).
 * - Sin `remote`: exactamente lo de antes (BroadcastChannel o relay de
 *   escritorio, id de localStorage). El enlace (displayLink.ts) es el mismo
 *   en los dos casos: solo cambia el receptor que se le entrega.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpMessageDraft } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, type DisplayReceiver } from '@/lib/pos/display/transport';
import { isDisplayTransportAvailable, resolveDisplayChannelFactory } from '@/lib/pos/display/desktopChannel';
import { TERMINAL_ID_STORAGE_KEY, readLocalTerminalId } from '@/lib/pos/display/terminal';
import { INITIAL_LINK_SNAPSHOT, readCapabilities, startDisplayLink, type DisplayLink, type DisplayLinkSnapshot } from './displayLink';
import type { RemoteReceiverSource } from './useRemoteDisplay';

export { DISCONNECTED_TO_IDLE_MS, readCapabilities, type DisplayHello } from './displayLink';

export interface DisplayReceiverSnapshot extends DisplayLinkSnapshot {
  /** null hasta que la caja se identifique en este equipo. */
  terminalId: string | null;
  /** false si el navegador no tiene BroadcastChannel: la pantalla no puede funcionar aquí. */
  supported: boolean;
  /** `navigator.maxTouchPoints > 0` al montar (PLAN §4.4); el forzado de los ajustes lo aplica resolveTouch. */
  touchDetected: boolean;
  /** Manda una intención a la caja (Fase 2: `qr_paid_claim`…). Sin enlace o sin caja conectada no hace nada. Estable. */
  sendUp: (msg: UpMessageDraft) => void;
}

/** Lee el id de la caja ahora y cada vez que la caja lo escriba (evento `storage` cruza ventanas del mismo origen). */
function useLocalTerminalId(): string | null {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => {
      const next = readLocalTerminalId();
      setTerminalId((prev) => (prev === next ? prev : next));
    };
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === TERMINAL_ID_STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    const poll = setInterval(refresh, 1_000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);
  return terminalId;
}

/**
 * @param remote  Fuente remota (fase `ready`) o null para el modo local.
 * @param enabled false mientras useRemoteDisplay aún decide, empareja o pide el
 *                bootstrap: así no se abre un receptor LOCAL en una tableta que
 *                va a acabar en remoto (ni se despide de nadie al cambiar).
 */
export function useDisplayReceiver(remote: RemoteReceiverSource | null = null, enabled = true): DisplayReceiverSnapshot {
  const localTerminalId = useLocalTerminalId();
  // Remoto: la terminal es la del bootstrap. Local: la de localStorage.
  const terminalId = remote ? remote.terminalId : localTerminalId;
  // Relay de escritorio (Go Admin Desktop) o BroadcastChannel (navegador): el
  // receptor es el mismo, solo cambia el tubo (desktopChannel.ts). En remoto
  // el tubo es Supabase Realtime y no depende de BroadcastChannel.
  const [localSupported] = useState<boolean>(() => isDisplayTransportAvailable());
  const supported = remote ? true : localSupported;
  const [snapshot, setSnapshot] = useState<DisplayLinkSnapshot>(INITIAL_LINK_SNAPSHOT);
  const [touchDetected] = useState<boolean>(() => readCapabilities().touch);
  const linkRef = useRef<DisplayLink | null>(null);
  const sendUp = useCallback((msg: UpMessageDraft) => {
    linkRef.current?.send(msg);
  }, []);

  useEffect(() => {
    if (!enabled || !terminalId || !supported) return;

    let receiver: DisplayReceiver;
    try {
      receiver = remote ? remote.createReceiver() : new BroadcastChannelReceiver({ terminalId, channelFactory: resolveDisplayChannelFactory() });
    } catch (error) {
      console.warn('[pos-display] no se pudo abrir el receptor', error);
      return;
    }

    // El umbral de silencio sale del transporte: 3 s en local (latido de 1 s)
    // y REMOTE_STALE_AFTER_MS en remoto, donde el latido va más despacio a
    // propósito para no facturar un mensaje por segundo (ronda 2 · 2). Sin
    // propagarlo, «Conectando» parpadearía entre latidos remotos.
    // El `need_snapshot` que se repite sin caja viva va con el mismo criterio
    // (ronda 4 · QA-1): en local cuesta cero y se queda en 2 s; en remoto es
    // un mensaje facturado de subida cada vez, y con la caja cerrada nadie lo
    // va a contestar, así que va al ritmo de la presencia y retrocede a uno
    // por minuto cuando ya se pinta Reposo.
    const link = startDisplayLink({
      receiver,
      capabilities: readCapabilities,
      onChange: setSnapshot,
      staleAfterMs: remote ? remote.staleAfterMs : undefined,
      resnapshotIntervalMs: remote ? remote.resnapshotIntervalMs : undefined,
      idleResnapshotIntervalMs: remote ? remote.idleResnapshotIntervalMs : undefined,
    });
    linkRef.current = link;

    const onResize = () => link.refreshPresence();
    window.addEventListener('resize', onResize);
    const onUnload = () => link.stop();
    window.addEventListener('pagehide', onUnload);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', onUnload);
      link.stop();
      linkRef.current = null;
      setSnapshot(INITIAL_LINK_SNAPSHOT);
    };
  }, [terminalId, supported, remote, enabled]);

  return { terminalId, supported, touchDetected, sendUp, ...snapshot };
}
