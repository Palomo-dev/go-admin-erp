/**
 * Canal de la pantalla del cliente sobre el puente de Go Admin Desktop.
 *
 * POR QUÉ EXISTE
 * --------------
 * En escritorio la web corre en un servidor Next embebido (localhost:47800),
 * y la ventana de la pantalla puede acabar en otro origen (127.0.0.1) o en
 * otra partición de sesión: BroadcastChannel no cruza ninguna de las dos. El
 * proceso principal de Electron sí ve a todos los renderers, así que se usa
 * su relay ('pos-display:message', expuesto como
 * `window.goAdminDesktop.posDisplay.send/onMessage`) como canal primario.
 * Además no depende de la red: la pantalla enlaza sin internet.
 *
 * Se presenta con la MISMA forma que BroadcastChannel (`postMessage`,
 * `onmessage`, `close`) para que `BroadcastChannelTransport` y
 * `BroadcastChannelReceiver` no cambien ni una línea de su lógica de sobre,
 * seq, adopción o presencia: solo cambia el tubo.
 *
 * El relay del proceso principal no sabe de terminales: lleva
 * `{ channel, data }` y aquí se filtra por `channel` (el mismo nombre que
 * usaría BroadcastChannel), de modo que dos cajas en la misma máquina no se
 * mezclan.
 */

import type { DesktopPosDisplayBridge } from '@/lib/utils/desktop';
import {
  displayChannelName,
  isBroadcastChannelSupported,
  type DisplayChannel,
  type DisplayChannelFactory,
} from './transport';

interface RelayEnvelope {
  channel: string;
  data: unknown;
}

function isRelayEnvelope(value: unknown): value is RelayEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RelayEnvelope).channel === 'string' &&
    'data' in (value as Record<string, unknown>)
  );
}

function resolveBridge(): Required<Pick<DesktopPosDisplayBridge, 'send' | 'onMessage'>> | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.goAdminDesktop?.posDisplay;
  if (!bridge || typeof bridge.send !== 'function' || typeof bridge.onMessage !== 'function') return null;
  return { send: bridge.send, onMessage: bridge.onMessage };
}

/** True solo dentro de Go Admin Desktop con un preload que ya expone el relay (>= 0.2.1). */
export function isDesktopDisplayBridgeAvailable(): boolean {
  return resolveBridge() !== null;
}

/**
 * Abre un canal sobre el relay de escritorio. Lanza si el puente no está:
 * el llamador decide antes con `isDesktopDisplayBridgeAvailable()`.
 */
export function createDesktopDisplayChannel(terminalId: string): DisplayChannel {
  const bridge = resolveBridge();
  if (!bridge) throw new Error('[pos-display] el puente de escritorio no expone posDisplay.send/onMessage');

  const name = displayChannelName(terminalId);
  let closed = false;
  const channel: DisplayChannel = {
    onmessage: null,
    postMessage(msg: unknown) {
      if (closed) return;
      bridge.send({ channel: name, data: msg } satisfies RelayEnvelope);
    },
    close() {
      if (closed) return;
      closed = true;
      channel.onmessage = null;
      try {
        unsubscribe();
      } catch {
        // el puente ya no está (ventana cerrándose): nada que soltar
      }
    },
  };

  const unsubscribe = bridge.onMessage((payload) => {
    if (closed || !isRelayEnvelope(payload) || payload.channel !== name) return;
    channel.onmessage?.({ data: payload.data });
  });

  return channel;
}

/**
 * Fábrica a usar en este entorno: el relay de escritorio si existe, si no
 * `undefined` (el transporte abre BroadcastChannel por defecto).
 */
export function resolveDisplayChannelFactory(): DisplayChannelFactory | undefined {
  return isDesktopDisplayBridgeAvailable() ? createDesktopDisplayChannel : undefined;
}

/** Hay algún tubo por el que hablar: relay de escritorio o BroadcastChannel. */
export function isDisplayTransportAvailable(): boolean {
  return isDesktopDisplayBridgeAvailable() || isBroadcastChannelSupported();
}
