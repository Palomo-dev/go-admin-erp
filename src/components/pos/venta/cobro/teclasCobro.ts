/**
 * Teclado del cobro del POS, sin React (POS-UX-V2 §3): cuándo «Enter»
 * completa la venta y a qué método corresponde cada Alt+n.
 *
 * - «Enter» completa solo si el pago está cubierto (lo decide el cobro) y el
 *   foco NO está en un control que usa Enter por su cuenta (un botón, un
 *   enlace, un menú, un selector, otro campo). Sí vale desde el campo del
 *   monto (`data-cobro-monto`): se teclea el efectivo y se cierra con Enter.
 * - Alt+1…Alt+n eligen el método por posición entre los botones visibles; si
 *   hay «Otro», la tecla siguiente (Alt+5 con cuatro botones) abre su menú.
 */

const CONTROLES_CON_ENTER =
  'button, a[href], select, textarea, input, [role="button"], [role="combobox"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"]';

/** ¿«Enter» con el foco en `el` puede completar la venta? */
export function enterCompletaVenta(el: Element | null | undefined): boolean {
  if (!el || typeof (el as HTMLElement).closest !== 'function') return true;
  if ((el as HTMLElement).dataset?.cobroMonto !== undefined) return true;
  return (el as HTMLElement).closest(CONTROLES_CON_ENTER) === null;
}

export type AccionMetodo = { tipo: 'elegir'; codigo: string } | { tipo: 'otro' } | null;

/**
 * Qué hace Alt+(posicion+1): elegir el método visible en esa posición o, justo
 * después del último visible, abrir «Otro» si hay métodos en él.
 */
export function accionAtajoMetodo(posicion: number, visibles: readonly { codigo: string }[], hayOtro: boolean): AccionMetodo {
  if (posicion < 0) return null;
  if (posicion < visibles.length) return { tipo: 'elegir', codigo: visibles[posicion].codigo };
  if (hayOtro && posicion === visibles.length) return { tipo: 'otro' };
  return null;
}
