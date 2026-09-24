/**
 * «Exacto» y billetes rápidos del cobro (POS-PLAN §2.6, L43), movidos
 * LITERALMENTE de `CheckoutDialog.tsx` (`generateQuickAmounts` y
 * `formatQuickLabel`).
 *
 * Comportamiento de hoy, fijado por `montosRapidos.test.ts`:
 * - Solo se ofrecen en entradas de efectivo.
 * - Se calculan sobre el TOTAL del cobro (`cartTotal`), no sobre lo que falta
 *   en esa entrada (E-07). El cambio a «sobre lo que falta» es del paso 12,
 *   con su propia prueba.
 * - «Exacto» primero y luego, ascendentes, redondeos al escalón superior y
 *   múltiplos de ese escalón; seis botones como máximo.
 */

import { METODO_EFECTIVO } from './pagosCobro';

export interface MontoRapido {
  label: string;
  value: number;
}

/** Los montos rápidos se pintan solo en una entrada de efectivo. */
export function muestraMontosRapidos(method: string): boolean {
  return method === METODO_EFECTIVO;
}

// Generar botones de monto rápido dinámicos según el total a pagar
export function generateQuickAmounts(amount: number): MontoRapido[] {
  if (amount <= 0) return [{ label: 'Exacto', value: 0 }];

  const buttons: MontoRapido[] = [];
  const seen = new Set<number>();

  // Determinar la magnitud para redondeos inteligentes
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(amount, 1))));
  const roundUp = (val: number, step: number) => Math.ceil(val / step) * step;

  // 1. Monto exacto
  buttons.push({ label: 'Exacto', value: Math.round(amount) });
  seen.add(Math.round(amount));

  // 2. Redondeo al millar superior más cercano
  const roundSteps = magnitude >= 100000 ? [100000, 50000]
                   : magnitude >= 10000 ? [10000, 5000]
                   : magnitude >= 1000 ? [1000, 500]
                   : [100, 50];

  for (const step of roundSteps) {
    const rounded = roundUp(amount, step);
    if (!seen.has(rounded) && rounded > amount) {
      buttons.push({ label: formatQuickLabel(rounded), value: rounded });
      seen.add(rounded);
    }
  }

  // 3. Agregar múltiplos útiles por encima del monto
  const baseStep = roundSteps[0];
  for (let mult = 2; mult <= 4; mult++) {
    const val = roundUp(amount, baseStep) + baseStep * (mult - 1);
    if (!seen.has(val) && buttons.length < 6) {
      buttons.push({ label: formatQuickLabel(val), value: val });
      seen.add(val);
    }
  }

  // Ordenar: Exacto primero, luego ascendente
  return buttons.sort((a, b) => {
    if (a.label === 'Exacto') return -1;
    if (b.label === 'Exacto') return 1;
    return a.value - b.value;
  }).slice(0, 6);
}

export function formatQuickLabel(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return value.toString();
}
