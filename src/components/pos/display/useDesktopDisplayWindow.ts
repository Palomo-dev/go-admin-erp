'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HEARTBEAT_INTERVAL_MS, STALE_AFTER_MS } from '@/lib/pos/display/transport';
import {
  getDesktopPosDisplayBridge,
  nextOpenedAt,
  readDesktopDisplayStatus,
  resolveDesktopWindowSignal,
  subscribeDesktopDisplayStatus,
  supportsDesktopDisplayStatus,
  type DesktopStatusSource,
  type DesktopWindowSignal,
} from '@/lib/pos/display/desktopDisplay';
import type { DesktopPosDisplayStatus } from '@/lib/utils/desktop';

export interface DesktopDisplayWindowState {
  /** true solo en Go Admin Desktop >= 0.2.1 (puente con `status` y `onStatus`). */
  available: boolean;
  /** Último estado que dio el puente; null fuera del escritorio o antes de leerlo. */
  status: DesktopPosDisplayStatus | null;
  /** 'open-no-signal' = ventana abierta ≥ 3 s sin `display_alive`: canal roto. */
  signal: DesktopWindowSignal;
}

const UNAVAILABLE: DesktopDisplayWindowState = { available: false, status: null, signal: 'none' };

/**
 * Estado de la VENTANA de la pantalla del cliente en Go Admin Desktop
 * (PLAN §9, Fase 1), complementario a `useCustomerDisplayPresence`:
 *
 * - la presencia (`connected`) sigue viniendo de `display_alive` por el relay,
 *   y es la única que dice que la pantalla refleja algo;
 * - el puente (`status()` + `onStatus()`) solo dice si la ventana EXISTE y en
 *   qué monitor.
 *
 * Cruzando ambas se distingue «ventana viva pero canal roto» de «sin
 * pantalla»: si la caja EMITE (`emitting` de la presencia), el puente dice
 * abierta y en STALE_AFTER_MS no llega ninguna señal, `signal` pasa a
 * 'open-no-signal' y el indicador lo etiqueta como «Pantalla abierta, sin
 * señal». Si la caja no emite (interruptor de la organización apagado, o
 * aún cargando) la ausencia de señal es la esperada y `signal` se queda en
 * 'open': lo que toca es «desactivada», no «canal roto». El instante de
 * apertura se fija cuando el estado pasa a abierto (o al leerlo abierto por
 * primera vez), así una pantalla que aún está cargando no se acusa antes de
 * tiempo; y se REINICIA en cada `onStatus` con `open: true` (el proceso
 * principal solo lo emite al abrir o cerrar) o cuando `status()` cambia de
 * monitor: «Abrir ahora» que cierra y reabre cuenta como ventana nueva y no
 * hereda una gracia ya vencida (`nextOpenedAt`). Y se anota además cuándo la caja EMPEZÓ a emitir
 * (`emittingSinceRef`): la gracia corre desde lo último que pasó, apertura o
 * arranque de la emisión. Si no, con la ventana ya abierta (auto-apertura al
 * arrancar, o el emisor de /app/pos que arranca tras resolver moneda e
 * interruptor) el primer latido tras «Activar y abrir» pintaba ámbar hasta
 * que llegaba el `display_alive` (≤ 1 s).
 *
 * Mientras la ventana está abierta, la caja emite y no hay señal se
 * re-evalúa cada latido; en cualquier otro estado no hay intervalo. Fuera
 * del escritorio (o con un Desktop < 0.2.1 sin `status`) devuelve
 * `available: false` y no hace nada. `status` se expone para que el
 * indicador sepa si hay ventana que cerrar.
 */
export function useDesktopDisplayWindow(connected: boolean, emitting: boolean): DesktopDisplayWindowState {
  const [state, setState] = useState<DesktopDisplayWindowState>(UNAVAILABLE);
  const statusRef = useRef<DesktopPosDisplayStatus | null>(null);
  const openedAtRef = useRef<number | null>(null);
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const emittingRef = useRef(emitting);
  emittingRef.current = emitting;
  // Instante en que `emitting` pasó a true; null mientras no emite (se fija en el efecto de abajo,
  // que corre antes que el de re-evaluación por declararse antes).
  const emittingSinceRef = useRef<number | null>(null);

  const evaluate = useCallback((available: boolean) => {
    const status = statusRef.current;
    const signal = resolveDesktopWindowSignal(
      status,
      connectedRef.current,
      openedAtRef.current,
      Date.now(),
      STALE_AFTER_MS,
      emittingRef.current,
      emittingSinceRef.current,
    );
    setState((prev) =>
      prev.available === available && prev.status === status && prev.signal === signal ? prev : { available, status, signal },
    );
  }, []);

  const applyStatus = useCallback(
    (next: DesktopPosDisplayStatus, source: DesktopStatusSource) => {
      // 'event' (onStatus) solo llega al abrir o cerrar: con open:true es una (re)apertura y la
      // gracia de «sin señal» vuelve a contar desde ahora (D3: «Abrir ahora» que cierra y reabre).
      openedAtRef.current = nextOpenedAt(statusRef.current, next, openedAtRef.current, Date.now(), source);
      statusRef.current = next;
      evaluate(true);
    },
    [evaluate],
  );

  useEffect(() => {
    const bridge = getDesktopPosDisplayBridge();
    if (!supportsDesktopDisplayStatus(bridge)) return;
    let cancelled = false;
    evaluate(true);
    void readDesktopDisplayStatus(bridge).then((status) => {
      if (!cancelled && status) applyStatus(status, 'read');
    });
    const off = subscribeDesktopDisplayStatus(bridge, (status) => {
      if (!cancelled) applyStatus(status, 'event');
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [applyStatus, evaluate]);

  // La caja empezó (o dejó) de emitir: desde aquí corre la gracia de «sin señal», no desde la apertura.
  useEffect(() => {
    emittingSinceRef.current = emitting ? Date.now() : null;
  }, [emitting]);

  // La presencia (o si la caja emite) cambió: re-evaluar ya; y mientras esté abierta, emitiendo y sin
  // señal, cada latido (la gracia de 3 s se ve mirando el reloj).
  useEffect(() => {
    if (!state.available) return;
    evaluate(true);
    if (!state.status?.open || connected || !emitting) return;
    const tick = setInterval(() => evaluate(true), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(tick);
  }, [connected, emitting, evaluate, state.available, state.status]);

  return state;
}
