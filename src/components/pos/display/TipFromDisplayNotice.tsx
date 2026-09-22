'use client';

/**
 * Aviso NO bloqueante de la propina elegida en la pantalla del cliente
 * (PLAN §5.3, Fase 2-B), para el modal de cobro:
 *
 * - Fase pendiente Y la pantalla pintando la pregunta (`getState().mode ===
 *   'tip'`): «Pantalla del cliente: esperando la propina…» con «Omitir»
 *   (skipTip → la pantalla pasa a «Cobro»). Si un QR con código se impone en
 *   pantalla (emitter.buildState) la fase sigue pendiente pero NO se avisa:
 *   el cliente ve el QR, no la pregunta (ronda 2, QA-3). Con pantalla NO
 *   táctil (`capabilities.touch === false`) la pantalla nunca contestará
 *   (PLAN §4.4): «La pantalla muestra las propinas sugeridas: registre lo que
 *   indique el cliente» con «Continuar» (mismo skipTip). Solo con pantalla
 *   conectada: sin pantalla no hay nadie a quien esperar.
 * - Elección recibida: «Cliente eligió 10 % ($2.025)» con «Aplicar» (la caja
 *   registra la propina por el flujo existente: `tipAmount` del modal →
 *   `tip_amount` del cobro → tabla `tips` al confirmar) y «Cambiar» (se
 *   descarta el aviso y el cajero usa los controles de propina del modal).
 *   «Sin propina» solo informa. NADA se aplica solo.
 *
 * `cashierMovedOn`: el cajero ya registró una propina en la caja o empezó a
 * teclear el cobro (PLAN §4.4 no táctil: «el cajero registra la elección en
 * la caja»): la fase pendiente se cierra sola para que la pantalla siga al
 * cobro. Sin sondeo (ronda 2, QA-6): se apoya en `onTipPhaseChange`,
 * `onStatePublished` y `onTipSelected` del emisor (posDisplay.ts), más una
 * lectura inicial al abrir. No lanza y no bloquea la venta.
 *
 * Táctil (ronda 3 de F2-B, QA-2 y QA-5): el aviso refleja lo que la pantalla
 * PINTA. La pantalla declara en `capabilities.touch` el táctil ya resuelto
 * con el forzado de los ajustes (displayLink.ts) y reemite `display_alive`
 * al conocerlo; aquí se sigue por `onDisplayCapabilitiesChange` (sin
 * sondeo, sin quedarse un render atrás) y, como respaldo, se vuelve a aplicar
 * el mismo forzado con `presentationSettings.touch` (resolveNoticeTouch).
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getPosDisplayEmitter } from '@/lib/pos/display/posDisplay';
import type { TipPhase } from '@/lib/pos/display/emitter';
import type { DisplayCapabilities, DisplayMode } from '@/lib/pos/display/protocol';
import type { TipSelection } from '@/lib/pos/display/tip';
import { describeTipSelection, isInformativeTipSelection, resolveNoticeTouch, resolveTipWaitingNotice } from './tipNotice';
import { useCustomerDisplayPresence } from './useCustomerDisplayPresence';

export interface TipFromDisplayNoticeProps {
  /** El modal de cobro está abierto. Al cerrarse se olvida el aviso. */
  open: boolean;
  /** Moneda para pintar el importe (código ISO). */
  currency: string;
  /** El cajero registró una propina o siguió cobrando: se cierra la fase pendiente de la pantalla. */
  cashierMovedOn?: boolean;
  /** «Aplicar»: la caja fija la propina con el importe que el cliente vio. */
  onApply: (selection: TipSelection) => void;
}

export function TipFromDisplayNotice({ open, currency, cashierMovedOn = false, onApply }: TipFromDisplayNoticeProps) {
  const presence = useCustomerDisplayPresence();
  const [phase, setPhase] = useState<TipPhase>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode | null>(null);
  const [selection, setSelection] = useState<TipSelection | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Capacidades que la pantalla declaró (táctil resuelto): lectura inicial + onDisplayCapabilitiesChange.
  const [displayCapabilities, setDisplayCapabilities] = useState<DisplayCapabilities | null>(null);

  // Fase y modo pintado: lectura inicial + suscripciones (el emisor avisa solo cuando cambian).
  useEffect(() => {
    if (!open) {
      setPhase(null);
      setDisplayMode(null);
      setSelection(null);
      setDismissed(false);
      setDisplayCapabilities(null);
      return;
    }
    const emitter = getPosDisplayEmitter();
    setPhase(emitter.tipPhase);
    setDisplayMode(emitter.getState().mode);
    setDisplayCapabilities(emitter.lastDisplayCapabilities);
    const offPhase = emitter.onTipPhaseChange((next) => {
      setPhase(next);
      setDisplayMode(emitter.getState().mode);
    });
    const offState = emitter.onStatePublished((state) => setDisplayMode((prev) => (prev === state.mode ? prev : state.mode)));
    const offSelected = emitter.onTipSelected((next) => {
      setSelection(next);
      setDismissed(false);
    });
    const offCapabilities = emitter.onDisplayCapabilitiesChange((next) => setDisplayCapabilities(next));
    return () => {
      offPhase();
      offState();
      offSelected();
      offCapabilities();
    };
  }, [open]);

  useEffect(() => {
    if (open && cashierMovedOn) getPosDisplayEmitter().skipTip();
  }, [open, cashierMovedOn]);

  if (!open) return null;

  if (selection && !dismissed) {
    const informative = isInformativeTipSelection(selection);
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-800 dark:bg-green-900/20"
        data-testid="tip-from-display"
      >
        <span className="font-medium text-green-800 dark:text-green-300">{describeTipSelection(selection, currency)}</span>
        <div className="flex items-center gap-2">
          {!informative && (
            <Button
              type="button"
              size="sm"
              className="h-8 bg-green-600 text-white hover:bg-green-700"
              onClick={() => {
                onApply(selection);
                setDismissed(true);
              }}
            >
              Aplicar
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setDismissed(true)}>
            {informative ? 'Entendido' : 'Cambiar'}
          </Button>
        </div>
      </div>
    );
  }

  // Táctil = lo que la pantalla PINTA: el declarado (ya resuelto) más el mismo forzado de los ajustes como respaldo.
  const waiting = resolveTipWaitingNotice({
    phase,
    displayMode,
    connected: presence.connected,
    touch: resolveNoticeTouch(displayCapabilities, getPosDisplayEmitter().presentationSettings?.touch),
  });
  if (waiting) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-800 dark:bg-blue-900/20"
        data-testid={waiting.kind === 'waiting' ? 'tip-from-display-waiting' : 'tip-from-display-informational'}
      >
        <span className="text-blue-800 dark:text-blue-300">{waiting.text}</span>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => getPosDisplayEmitter().skipTip()}>
          {waiting.action}
        </Button>
      </div>
    );
  }

  return null;
}
