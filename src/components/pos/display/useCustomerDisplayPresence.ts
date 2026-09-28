'use client';

import { useEffect, useState } from 'react';
import { HEARTBEAT_INTERVAL_MS } from '@/lib/pos/display/transport';
import {
  DEFAULT_STALE_BY_ORIGIN,
  DISCONNECTED_PRESENCE_VIEW,
  isSamePresence,
  readDisplayPresenceView,
  type DisplayPresenceView,
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
 *
 * Fase 3 (parte C): la instantánea lleva además `origins` (por qué tubo
 * habló la pantalla viva: ventana local, tableta remota o ambas), y un
 * cambio de origen también cuenta como cambio visible. Cada tubo se juzga con
 * su propio silencio tolerable (DEFAULT_STALE_BY_ORIGIN): 3 s la ventana
 * local, 15 s la tableta, que late cada 5 s para no gastar un mensaje de
 * Realtime por segundo. Con el umbral local, el indicador parpadearía dos
 * segundos de cada cinco con una tableta perfectamente conectada.
 */
export function useCustomerDisplayPresence(): DisplayPresenceView {
  const [snapshot, setSnapshot] = useState<DisplayPresenceView>(() => ({ ...DISCONNECTED_PRESENCE_VIEW }));

  useEffect(() => {
    const read = () => {
      setSnapshot((prev) => {
        // UN solo instante y UNA sola lectura (ronda 2 · 6): leyendo el reloj dos veces había
        // un milisegundo en el que la instantánea decía «conectada» y sus orígenes venían
        // vacíos, y el indicador perdía el sufijo «(remota)».
        const next = readDisplayPresenceView(getPosDisplayEmitter(), Date.now(), DEFAULT_STALE_BY_ORIGIN, getPosDisplayEnvironment());
        return isSamePresence(prev, next) ? prev : next;
      });
    };
    read();
    const tick = setInterval(read, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(tick);
  }, []);

  return snapshot;
}
