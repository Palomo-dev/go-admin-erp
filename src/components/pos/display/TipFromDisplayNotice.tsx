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
 *   indique el cliente» con «Continuar» (mismo skipTip). Sin táctil Y sin
 *   presets (solo «Otro») la pantalla pinta el cobro, no importes: ningún
 *   aviso (F2B-R7-1, ronda 8; `presetsCount` de resolveTipWaitingNotice).
 *   Solo con pantalla conectada: sin pantalla no hay nadie a quien esperar.
 * - Elección recibida: «Cliente eligió 10 % ($2.025)» con «Aplicar» (la caja
 *   registra la propina por el flujo existente: `tipAmount` del modal →
 *   `tip_amount` del cobro → tabla `tips` al confirmar) y «Cambiar» (se
 *   descarta el aviso y el cajero usa los controles de propina del modal).
 *   «Sin propina» solo informa. NADA se aplica solo. La elección se lee del
 *   getter congelado `emitter.tipSelection` al abrir (fuente de verdad) y se
 *   sigue por `onTipSelected`: un remontaje con la fase en «done» la
 *   conserva, y reabre el aviso aunque se hubiera pulsado «Cambiar» (ronda 4
 *   de cierre, QA-2; ruta excepcional y sin efecto sobre la venta).
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
 *
 * Caducidad del táctil (F3-C ronda 5 · 1): las capacidades solo se borran en
 * el transporte con un `display_bye`, nunca por silencio, así que una tableta
 * táctil que muere sin despedirse dejaba `touch: true` pegado mientras el
 * monitor NO táctil del mostrador siguiera latiendo, y el cajero esperaba una
 * respuesta de una pantalla apagada. Aquí se cruzan las capacidades POR ORIGEN
 * con los orígenes VIVOS de la presencia (`combineLiveDisplayCapabilities`),
 * que sí caduca con el umbral de cada tubo y se relee cada segundo: el aviso
 * vuelve solo a «registre lo que indique el cliente» sin necesitar un aviso
 * nuevo del emisor.
 *
 * LIMITACIÓN conocida (B3 de la lista congelada de F2-B; PLAN §13): el aviso
 * depende de `presence.connected`, que es POR TERMINAL (display_alive va a
 * todas las pestañas), y no de si la pantalla sigue a ESTA instancia de
 * /app/pos. Con dos ventanas VISIBLES de /app/pos en la misma máquina, las
 * dos en cobro con propina, las dos muestran «esperando la propina…», pero
 * solo la instancia que el receptor adoptó (la última visible que saludó,
 * transport.ts regla 2) recibirá `tip_selected`; en la otra el aviso se
 * queda esperando hasta que el cajero pulse «Omitir» o cambie de ventana
 * (reannounce la releva). No hay riesgo de aplicar nada: «Aplicar» sigue
 * siendo del cajero. Exponer «¿me sigue la pantalla?» al emisor queda para
 * una fase posterior (no está en el alcance congelado de F2-B).
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getPosDisplayEmitter } from '@/lib/pos/display/posDisplay';
import type { TipPhase } from '@/lib/pos/display/emitter';
import type { DisplayCapabilities, DisplayMode } from '@/lib/pos/display/protocol';
import type { DisplayCapabilitiesByOrigin } from '@/lib/pos/display/transport';
import { combineLiveDisplayCapabilities } from '@/lib/pos/display/presence';
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
  // Las mismas POR ORIGEN (F3-C ronda 5 · 1): el transporte no caduca las capacidades
  // por silencio, así que el táctil se decide cruzándolas con los orígenes VIVOS de la
  // presencia, que sí caduca (DEFAULT_STALE_BY_ORIGIN) y se relee cada segundo.
  const [capabilitiesByOrigin, setCapabilitiesByOrigin] = useState<DisplayCapabilitiesByOrigin | null>(null);

  // Fase y modo pintado: lectura inicial + suscripciones (el emisor avisa solo cuando cambian).
  useEffect(() => {
    if (!open) {
      setPhase(null);
      setDisplayMode(null);
      setSelection(null);
      setDismissed(false);
      setDisplayCapabilities(null);
      setCapabilitiesByOrigin(null);
      return;
    }
    const emitter = getPosDisplayEmitter();
    setPhase(emitter.tipPhase);
    setDisplayMode(emitter.getState().mode);
    setDisplayCapabilities(emitter.lastDisplayCapabilities);
    setCapabilitiesByOrigin(emitter.lastDisplayCapabilitiesByOrigin);
    // La elección ya recibida (getter congelado del emisor) es la fuente de
    // verdad, no solo lo que llegue por onTipSelected desde ahora: un
    // remontaje del aviso con la fase en «done» (StrictMode en desarrollo, o
    // un refactor que condicione la sección) no pierde «Cliente eligió 10 %».
    // Decisión (ronda 4 de cierre, QA-2): un remontaje REABRE el aviso aunque
    // el cajero hubiera pulsado «Cambiar» antes (`dismissed` es estado del
    // componente y arranca en false). Es una ruta excepcional, «Aplicar»
    // sigue siendo del cajero y nada se aplica solo.
    setSelection(emitter.tipSelection);
    const offPhase = emitter.onTipPhaseChange((next) => {
      setPhase(next);
      setDisplayMode(emitter.getState().mode);
    });
    const offState = emitter.onStatePublished((state) => setDisplayMode((prev) => (prev === state.mode ? prev : state.mode)));
    const offSelected = emitter.onTipSelected((next) => {
      setSelection(next);
      setDismissed(false);
    });
    const offCapabilities = emitter.onDisplayCapabilitiesChange((next) => {
      setDisplayCapabilities(next);
      setCapabilitiesByOrigin(emitter.lastDisplayCapabilitiesByOrigin);
    });
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
  // Solo cuentan los orígenes VIVOS (F3-C ronda 5 · 1): una tableta táctil que murió sin
  // despedirse dejaba `touch: true` pegado —las capacidades no caducan en el transporte—
  // y el cajero esperaba una respuesta de una pantalla apagada. `presence.origins` ya
  // aplica el umbral de cada tubo y se relee cada segundo, así que el aviso cambia solo.
  const waiting = resolveTipWaitingNotice({
    phase,
    displayMode,
    connected: presence.connected,
    touch: resolveNoticeTouch(
      combineLiveDisplayCapabilities(capabilitiesByOrigin, displayCapabilities, presence.origins),
      getPosDisplayEmitter().presentationSettings?.touch,
    ),
    // Sin táctil y sin presets la pantalla no pinta importes (F2B-R7-1): nada que avisar.
    presetsCount: getPosDisplayEmitter().getState().tip?.presets.length ?? 0,
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
