/**
 * Lógica pura (sin React) del aviso de propina de la pantalla del cliente en
 * el modal de cobro (PLAN §5.3, Fase 2-B). TipFromDisplayNotice la pinta;
 * aquí vive lo que se prueba en Node:
 *
 * - `describeTipSelection`: «Cliente eligió 10 % ($2.025)».
 * - `resolveTipWaitingNotice`: qué aviso mostrar mientras la fase está
 *   pendiente, según lo que la pantalla PINTA de verdad y si es táctil.
 * - `applyTipToPrefilledPayment`: al pulsar «Aplicar», la única entrada de
 *   pago pre-rellenada (no tocada) sigue al total nuevo.
 *
 * LIMITACIÓN conocida (B3 de la lista congelada de F2-B, ronda 4; PLAN §13):
 * `resolveTipWaitingNotice` decide con `connected` (presencia POR TERMINAL:
 * `display_alive` llega a todas las pestañas) y no sabe si la pantalla sigue
 * a ESTA instancia de /app/pos. Con dos ventanas de /app/pos VISIBLES en
 * cobro con propina, AMBAS muestran «esperando la propina…», pero solo la
 * instancia que el receptor adoptó (transport.ts, regla 2) recibirá
 * `tip_selected`; en la otra el aviso queda hasta «Omitir» o hasta que el
 * cajero cambie de ventana (el reannounce la releva). Nada se aplica solo:
 * «Aplicar» sigue siendo del cajero. No se resuelve en esta fase; exponer
 * «¿me sigue la pantalla?» al emisor queda para una posterior. El detalle
 * del lado React está en TipFromDisplayNotice.tsx.
 */

import type { TipPhase } from '@/lib/pos/display/emitter';
import type { DisplayCapabilities, DisplayMode } from '@/lib/pos/display/protocol';
import type { TipSelection } from '@/lib/pos/display/tip';
import { resolveTouch } from '@/components/pos-display/logic';
import { formatCurrency } from '@/utils/Utils';

/**
 * «Sin propina» solo para `kind === 'none'`. Un porcentaje con importe 0
 * (base 0: cortesía, descuento del 100 %) se describe con el porcentaje que
 * el cliente pulsó («Cliente eligió 10 % ($0)»), no como una negativa que
 * contradiga lo que eligió (ronda 2, QA-5). Un importe libre 0 sí equivale
 * a no dejar propina.
 */
export function describeTipSelection(selection: TipSelection, currency: string): string {
  if (selection.kind === 'percent' && selection.percent !== null) {
    return `Cliente eligió ${selection.percent} % (${formatCurrency(selection.amount, currency)})`;
  }
  if (selection.kind === 'none' || selection.amount <= 0) return 'Cliente eligió no dejar propina';
  return `Cliente eligió una propina de ${formatCurrency(selection.amount, currency)}`;
}

/** ¿La elección solo informa (no hay importe que aplicar)? */
export function isInformativeTipSelection(selection: TipSelection): boolean {
  return selection.kind === 'none' || selection.amount <= 0;
}

export type TipWaitingNotice =
  /** La pantalla táctil está preguntando: el cajero puede esperar u omitir. */
  | { kind: 'waiting'; text: string; action: string }
  /** La pantalla NO táctil muestra los importes como información: el cajero registra lo que diga el cliente (PLAN §4.4). */
  | { kind: 'informational'; text: string; action: string };

export interface TipWaitingInput {
  /** Fase del emisor (`tipPhase`). */
  phase: TipPhase;
  /** `mode` del estado que el emisor emite AHORA (`getState().mode`): lo que la pantalla pinta de verdad. */
  displayMode: DisplayMode | null;
  /** Hay pantalla conectada (presencia). */
  connected: boolean;
  /** `capabilities.touch` de la pantalla, o null si aún no lo dijo. */
  touch: boolean | null;
  /**
   * Cuántos porcentajes ofrece la fase (`getState().tip?.presets.length`).
   * Con pantalla NO táctil y 0 presets la pantalla no pinta ningún importe
   * (resolveView cae al cobro: solo «Otro», que sin táctil nadie puede
   * pulsar) y no hay nada que leer al cliente (ronda 8, F2B-R7-1). Opcional
   * para no romper a quien no lo pase: se asume que hay presets.
   */
  presetsCount?: number;
}

export const TIP_WAITING_TEXT = 'Pantalla del cliente: esperando la propina…';
export const TIP_WAITING_ACTION = 'Omitir';
export const TIP_INFORMATIONAL_TEXT = 'La pantalla muestra las propinas sugeridas: registre lo que indique el cliente';
export const TIP_INFORMATIONAL_ACTION = 'Continuar';

/**
 * Aviso de espera SOLO cuando la pantalla realmente pinta la pregunta
 * (`displayMode === 'tip'`), no por la fase sola (ronda 2, QA-3): mientras
 * un QR con código o vencido se impone (emitter.buildState) la fase sigue
 * pendiente pero el cliente ve el QR, y «esperando la propina…» sobre un QR
 * confundiría al cajero. Con pantalla NO táctil (`touch === false`) la
 * pantalla nunca contestará: el texto cambia a «registre lo que indique el
 * cliente» con «Continuar» (misma acción: skipTip). Sin pantalla conectada,
 * nada: no hay a quién esperar. Y sin táctil NI presets (`presetsCount === 0`,
 * solo «Otro»), null: la pantalla pinta el cobro (logic.ts resolveView) y el
 * texto informativo afirmaría importes que el cliente no ve (F2B-R7-1).
 */
export function resolveTipWaitingNotice(input: TipWaitingInput): TipWaitingNotice | null {
  if (input.phase !== 'pending' || !input.connected || input.displayMode !== 'tip') return null;
  if (input.touch === false) {
    if (input.presetsCount === 0) return null;
    return { kind: 'informational', text: TIP_INFORMATIONAL_TEXT, action: TIP_INFORMATIONAL_ACTION };
  }
  return { kind: 'waiting', text: TIP_WAITING_TEXT, action: TIP_WAITING_ACTION };
}

/**
 * Táctil que la caja debe creer para el aviso (ronda 3 de F2-B, QA-2): el
 * declarado por la pantalla con el MISMO forzado de los ajustes que aplica
 * ella (`resolveTouch`, PLAN §4.4 «si el hardware miente»). La pantalla ya
 * declara el táctil resuelto en `capabilities.touch` (displayLink.ts); este
 * respaldo cubre a una pantalla anterior que aún declare la detección cruda:
 * resolveTouch es idempotente con el mismo forzado. Sin capacidades
 * conocidas (null) se devuelve null y el aviso asume que contestará.
 */
export function resolveNoticeTouch(capabilities: Pick<DisplayCapabilities, 'touch'> | null | undefined, override: unknown): boolean | null {
  if (!capabilities) return null;
  return resolveTouch(capabilities.touch === true, override);
}

/** Lo mínimo de una entrada de pago del modal para ajustar su importe. */
export interface PrefilledPaymentEntry {
  id: string;
  amount: number;
}

/**
 * Al aplicar la propina elegida en pantalla, el total sube; si hay
 * EXACTAMENTE una entrada de pago y el cajero no la ha tocado (no está en
 * `touchedIds`: sigue siendo la que el modal pre-rellenó con el total), su
 * importe pasa a `newTotal`, la misma regla de la pre-carga. Así «Aplicar»
 * no deja el cobro en «Falta dinero» (ronda 2, QA-2), y en tarjeta o QR,
 * donde nadie teclea el importe, el cobro sigue completo.
 *
 * Una entrada TOCADA nunca se modifica: el cajero ya tecleó lo que el cliente
 * entregó y esa cifra es suya. Con varias entradas (pago mixto) tampoco: no
 * hay una sola a la que cargar la diferencia. Devuelve la misma referencia si
 * no hay nada que cambiar (React no re-renderiza en vano). La entrada sigue
 * SIN marcarse como tocada: la pantalla no muestra «recibido/cambio» hasta que
 * el cajero teclee de verdad.
 */
export function applyTipToPrefilledPayment<T extends PrefilledPaymentEntry>(payments: readonly T[], touchedIds: ReadonlySet<string>, newTotal: number): T[] {
  if (payments.length !== 1 || !Number.isFinite(newTotal) || newTotal < 0) return payments as T[];
  const only = payments[0];
  if (touchedIds.has(only.id) || only.amount === newTotal) return payments as T[];
  return [{ ...only, amount: newTotal }];
}
