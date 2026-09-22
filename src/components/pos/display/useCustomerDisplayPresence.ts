'use client';

import { useEffect, useState } from 'react';
import { HEARTBEAT_INTERVAL_MS, STALE_AFTER_MS } from '@/lib/pos/display/transport';
import {
  DISCONNECTED_PRESENCE,
  isSamePresence,
  readDisplayPresence,
  type DisplayPresenceSnapshot,
} from '@/lib/pos/display/presence';
import { getPosDisplayEmitter, getPosDisplayEnvironment } from '@/lib/pos/display/posDisplay';

/**
 * Presencia de la pantalla del cliente para la UI de la caja (PLAN §5.1).
 *
 * Consulta el emisor de esta ventana (posDisplay.ts) una vez por latido: el
 * emisor no avisa cuando la pantalla habla ni cuando calla, y el paso a
 * «desconectada» por silencio (3 s sin `display_alive`) solo se ve mirando
 * el reloj. El estado solo cambia de identidad cuando cambia algo visible,
 * así el intervalo no re-renderiza la cabecera en vano.
 *
 * Sin emisor arrancado (SSR, interruptor apagado) devuelve «sin pantalla» y
 * no lanza: la venta nunca depende de la pantalla. `reason` sale del entorno
 * (posDisplay.ts): «cargando» mientras no haya caché del interruptor O
 * mientras la caché esté encendida y la página aún no haya arrancado el
 * emisor (este hook monta antes que el efecto de arranque de /app/pos, que
 * espera a la consulta de moneda base), «sin soporte» sin BroadcastChannel
 * y «apagada» solo cuando la caché dice de verdad que lo está.
 */
export function useCustomerDisplayPresence(): DisplayPresenceSnapshot {
  const [snapshot, setSnapshot] = useState<DisplayPresenceSnapshot>(() => ({ ...DISCONNECTED_PRESENCE }));

  useEffect(() => {
    const read = () => {
      setSnapshot((prev) => {
        const next = readDisplayPresence(getPosDisplayEmitter(), Date.now(), STALE_AFTER_MS, getPosDisplayEnvironment());
        return isSamePresence(prev, next) ? prev : next;
      });
    };
    read();
    const tick = setInterval(read, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(tick);
  }, []);

  return snapshot;
}
