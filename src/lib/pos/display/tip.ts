/**
 * Propina en la pantalla del cliente (PLAN §4.2 «Propina», §4.4 y §5.3):
 * la aritmética y el saneado, puros y sin React, compartidos por la caja
 * (el aviso «Cliente eligió 10 % ($X)») y la pantalla (los tres botones con
 * su importe en vivo). Una sola implementación: lo que el cliente ve en la
 * pantalla es exactamente lo que el cajero aplica con «Aplicar».
 *
 * Reglas:
 * - El importe de un porcentaje es `computeTipAmount` (`Math.round(base ×
 *   pct / 100)`), y el modal de cobro (`handleTipPercentage`) lo llama desde
 *   la ronda 5 de F2-B en vez de repetir la fórmula: `Math.round(base * (pct
 *   / 100))` difería en 1 con presets arbitrarios (25 × 58 % → 14 / 15). Así
 *   el flujo existente de propinas (`tip_amount` → tabla `tips`) recibe la
 *   misma cifra que el cliente vio, venga del botón o de la pantalla.
 * - `base` es el importe sobre el que se calcula (el total con impuestos,
 *   antes de propina y domicilio: `baseTotal` del modal). PLAN §5.3 lo
 *   ejemplifica con 10 % de 20.250 = 2.025. La caja lo manda en
 *   `DisplayState.tip.base`; si falta, la pantalla usa `cart.total`.
 * - Nada lanza: un preset que no es un entero en [1, 100] se descarta; una
 *   base no finita o negativa cuenta como 0.
 */

import type { DisplayCart, DisplayState, TipKind, TipSelectedMessage } from './protocol';

/** Bloque `tip` del estado (protocol.ts) con `base` opcional (aditivo, F2-B). */
export type DisplayTipBlock = NonNullable<DisplayState['tip']>;

/** Un porcentaje sugerido con su importe ya calculado sobre la base. */
export interface TipOption {
  percent: number;
  amount: number;
}

/** Lo que el cliente eligió (o el cajero registró), ya resuelto a importe. */
export interface TipSelection {
  cartId: string;
  kind: TipKind;
  /** Porcentaje si `kind === 'percent'`, importe si `'amount'`, 0 si `'none'`. */
  value: number;
  /** Importe final de la propina (0 para «Sin propina»). */
  amount: number;
  /** Porcentaje elegido, o null si fue un importe libre o «Sin propina». */
  percent: number | null;
}

/** Cifras máximas que admite el teclado de «Otro» en la pantalla: evita importes absurdos por una pulsación repetida. */
export const TIP_CUSTOM_MAX_DIGITS = 9;

/** Tope (exclusivo) del importe libre que la caja acepta de CUALQUIER pantalla: 10^TIP_CUSTOM_MAX_DIGITS (1.000.000.000). */
export const TIP_AMOUNT_LIMIT = 10 ** TIP_CUSTOM_MAX_DIGITS;

/**
 * ¿La caja debe aceptar esta elección? (ronda 2, QA-4). `percent` exige un
 * entero en [1, 100]; `amount`, un número finito en [0, TIP_AMOUNT_LIMIT);
 * `none` siempre. Un `kind` desconocido, no. isUpMessage solo garantiza la
 * forma (finito ≥ 0): este es el criterio de negocio, el mismo que aplica la
 * pantalla propia antes de enviar (presets válidos y teclado de 9 cifras).
 */
export function isAcceptableTipChoice(kind: unknown, value: unknown): boolean {
  if (kind === 'none') return true;
  if (kind === 'percent') return isValidTipPercent(value);
  if (kind === 'amount') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < TIP_AMOUNT_LIMIT;
  return false;
}

function toBase(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** ¿Un porcentaje sugerido válido? Entero en [1, 100] (mismo criterio que settings.ts). */
export function isValidTipPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100;
}

/** `Math.round(base × pct / 100)`, nunca negativo ni NaN. Base o porcentaje inválidos → 0. */
export function computeTipAmount(base: unknown, percent: unknown): number {
  const b = toBase(base);
  if (b === 0 || typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) return 0;
  return Math.max(0, Math.round((b * percent) / 100));
}

/**
 * Los presets con su importe, en el orden en que llegan, sin repetidos y
 * sin los que no son un porcentaje válido. Con base 0 los importes son 0 (la
 * pantalla no entra en «Propina» sin carrito, pero la función no lo asume).
 */
export function tipOptions(base: unknown, presets: unknown): TipOption[] {
  if (!Array.isArray(presets)) return [];
  const seen = new Set<number>();
  const options: TipOption[] = [];
  for (const raw of presets) {
    if (!isValidTipPercent(raw) || seen.has(raw)) continue;
    seen.add(raw);
    options.push({ percent: raw, amount: computeTipAmount(base, raw) });
  }
  return options;
}

/** Importe libre saneado: entero no negativo (la caja guarda `tips.amount` como lo teclea el cajero, sin decimales). */
export function sanitizeTipAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

/**
 * Resuelve `{ kind, value }` (lo que viaja en `tip_selected`) al importe
 * final sobre `base`. `none` → 0; `percent` → computeTipAmount; `amount` →
 * el importe saneado. Un `kind` desconocido cuenta como «Sin propina».
 */
export function resolveTipSelection(cartId: string, base: unknown, choice: { kind: unknown; value: unknown }): TipSelection {
  if (choice.kind === 'percent' && isValidTipPercent(choice.value)) {
    return { cartId, kind: 'percent', value: choice.value, amount: computeTipAmount(base, choice.value), percent: choice.value };
  }
  if (choice.kind === 'amount') {
    const amount = sanitizeTipAmount(choice.value);
    return { cartId, kind: 'amount', value: amount, amount, percent: null };
  }
  return { cartId, kind: 'none', value: 0, amount: 0, percent: null };
}

/** Base del cálculo en la pantalla: la que manda la caja (`tip.base`) o, si falta, el total del carrito; nunca NaN. */
export function resolveTipBase(tip: Pick<DisplayTipBlock, 'base'>, cart: Pick<DisplayCart, 'total'>): number {
  if (typeof tip.base === 'number' && Number.isFinite(tip.base) && tip.base >= 0) return tip.base;
  return typeof cart.total === 'number' && Number.isFinite(cart.total) ? cart.total : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Bloque `tip` saneado para la pantalla (logic.ts · sanitizeDisplayState lo
 * llama). isDownMessage solo garantiza que `presets` es un array: aquí se
 * filtran los porcentajes inválidos, `allowCustom` se normaliza a booleano,
 * `base` a número finito ≥ 0 o se omite, y `selected` se conserva solo si es
 * un `tip_selected` con forma (cartId, kind, value finito). Sin presets
 * válidos y sin «Otro» no hay nada que preguntar → null: la pantalla cae a
 * «Pedido» (resolveView).
 */
export function sanitizeDisplayTip(value: unknown): DisplayTipBlock | null {
  if (!isRecord(value)) return null;
  const presets = Array.isArray(value.presets) ? value.presets.filter(isValidTipPercent) : [];
  const allowCustom = value.allowCustom === true;
  if (presets.length === 0 && !allowCustom) return null;
  const rawSelected = value.selected;
  let selected: TipSelectedMessage | null = null;
  if (
    isRecord(rawSelected) &&
    rawSelected.t === 'tip_selected' &&
    typeof rawSelected.cartId === 'string' &&
    (rawSelected.kind === 'percent' || rawSelected.kind === 'amount' || rawSelected.kind === 'none') &&
    typeof rawSelected.value === 'number' &&
    Number.isFinite(rawSelected.value)
  ) {
    selected = rawSelected as unknown as TipSelectedMessage;
  }
  const block: DisplayTipBlock = { presets: Array.from(new Set(presets)), allowCustom, selected };
  if (typeof value.base === 'number' && Number.isFinite(value.base) && value.base >= 0) block.base = value.base;
  return block;
}
