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
 */

import { useEffect, useState } from 'react';
import { BroadcastChannelReceiver } from '@/lib/pos/display/transport';
import { isDisplayTransportAvailable, resolveDisplayChannelFactory } from '@/lib/pos/display/desktopChannel';
import { TERMINAL_ID_STORAGE_KEY, readLocalTerminalId } from '@/lib/pos/display/terminal';
import { INITIAL_LINK_SNAPSHOT, readCapabilities, startDisplayLink, type DisplayLinkSnapshot } from './displayLink';

export { DISCONNECTED_TO_IDLE_MS, readCapabilities, type DisplayHello } from './displayLink';

export interface DisplayReceiverSnapshot extends DisplayLinkSnapshot {
  /** null hasta que la caja se identifique en este equipo. */
  terminalId: string | null;
  /** false si el navegador no tiene BroadcastChannel: la pantalla no puede funcionar aquí. */
  supported: boolean;
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

export function useDisplayReceiver(): DisplayReceiverSnapshot {
  const terminalId = useLocalTerminalId();
  // Relay de escritorio (Go Admin Desktop) o BroadcastChannel (navegador): el
  // receptor es el mismo, solo cambia el tubo (desktopChannel.ts).
  const [supported] = useState<boolean>(() => isDisplayTransportAvailable());
  const [snapshot, setSnapshot] = useState<DisplayLinkSnapshot>(INITIAL_LINK_SNAPSHOT);

  useEffect(() => {
    if (!terminalId || !supported) return;

    let receiver: BroadcastChannelReceiver;
    try {
      receiver = new BroadcastChannelReceiver({ terminalId, channelFactory: resolveDisplayChannelFactory() });
    } catch (error) {
      console.warn('[pos-display] no se pudo abrir el receptor', error);
      return;
    }

    const link = startDisplayLink({ receiver, capabilities: readCapabilities, onChange: setSnapshot });

    const onResize = () => link.refreshPresence();
    window.addEventListener('resize', onResize);
    const onUnload = () => link.stop();
    window.addEventListener('pagehide', onUnload);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', onUnload);
      link.stop();
      setSnapshot(INITIAL_LINK_SNAPSHOT);
    };
  }, [terminalId, supported]);

  return { terminalId, supported, ...snapshot };
}
