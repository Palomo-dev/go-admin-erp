'use client';

/**
 * Foco tras confirmar pago / lote / clawback (brief §4). El disparador
 * desaparece (la fila cambia de estado y pierde su botón; la barra de
 * selección se desmonta al limpiar la selección), así que `useReturnFocus`
 * necesita un `fallback`. El orden lo decide `focusAfterCommissionAction`
 * (puro, probado): fila siguiente → «Actualizar» → «Seleccionar todas».
 */

import { focusAfterCommissionAction } from './comisionesModel';

export const COMMISSION_ROW_ATTR = 'data-commission-row';
export const REFRESH_BUTTON_ID = 'comisiones-actualizar';
export const SELECT_ALL_ATTR = 'data-select-all';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [role="checkbox"]:not([disabled])';

/** Primer control enfocable de la fila que sigue a la última fila actuada (o de la primera fila si ninguna sigue en el DOM). */
function nextRowControl(doc: Document, actedIds: readonly string[]): HTMLElement | null {
  const rows = Array.from(doc.querySelectorAll<HTMLElement>(`[${COMMISSION_ROW_ATTR}]`));
  let last = -1;
  rows.forEach((r, i) => {
    if (actedIds.includes(r.getAttribute(COMMISSION_ROW_ATTR) ?? '')) last = i;
  });
  for (const row of rows.slice(last + 1)) {
    const control = row.querySelector<HTMLElement>(FOCUSABLE);
    if (control) return control;
  }
  return null;
}

/** `fallback` para `useReturnFocus`: se evalúa al cerrar el diálogo, con el DOM ya actualizado. */
export function commissionFocusFallback(actedIds: () => readonly string[]): () => HTMLElement | null {
  return () => {
    if (typeof document === 'undefined') return null;
    return focusAfterCommissionAction<HTMLElement>(null, [
      nextRowControl(document, actedIds()),
      document.getElementById(REFRESH_BUTTON_ID),
      document.querySelector<HTMLElement>(`[${SELECT_ALL_ATTR}]`),
    ]);
  };
}
