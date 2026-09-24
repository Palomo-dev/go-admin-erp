/**
 * Billetes y monedas para contar el efectivo de una caja, por moneda base de
 * la organización (D10 de docs/implementacion/CAJAS-VENTAS-PLAN.md). Antes las
 * denominaciones colombianas estaban cableadas en `NuevoArqueoPage`.
 *
 * Módulo hoja: lo usan `ConteoEfectivo`, el arqueo, el cierre y las pruebas.
 * Una moneda sin lista devuelve `null`: la pantalla pide el total directamente.
 */

export interface Denominaciones {
  /** De mayor a menor. */
  billetes: number[];
  monedas: number[];
}

const POR_MONEDA: Record<string, Denominaciones> = {
  COP: { billetes: [100000, 50000, 20000, 10000, 5000, 2000, 1000], monedas: [1000, 500, 200, 100, 50] },
  USD: { billetes: [100, 50, 20, 10, 5, 2, 1], monedas: [1, 0.5, 0.25, 0.1, 0.05, 0.01] },
  MXN: { billetes: [1000, 500, 200, 100, 50, 20], monedas: [20, 10, 5, 2, 1, 0.5] },
  PEN: { billetes: [200, 100, 50, 20, 10], monedas: [5, 2, 1, 0.5, 0.2, 0.1] },
  EUR: { billetes: [500, 200, 100, 50, 20, 10, 5], monedas: [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01] },
};

/** Denominaciones de la moneda (código ISO 4217) o `null` si no hay lista para ella. */
export function denominacionesDe(moneda: string | null | undefined): Denominaciones | null {
  if (!moneda) return null;
  return POR_MONEDA[moneda.trim().toUpperCase()] ?? null;
}

/** Monedas con lista de denominaciones. */
export const MONEDAS_CON_DENOMINACIONES = Object.keys(POR_MONEDA);

/** Conteo por denominación: `{ bills: { "50000": 3 }, coins: { "500": 10 } }` (forma de `cash_counts.denominations`). */
export interface ConteoDenominaciones {
  bills?: Record<string, number>;
  coins?: Record<string, number>;
}

function sumar(grupo: Record<string, number> | undefined): number {
  let total = 0;
  for (const [valor, cantidad] of Object.entries(grupo ?? {})) {
    const v = Number(valor);
    const c = Math.trunc(Number(cantidad));
    if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(c) || c <= 0) continue;
    total += v * c;
  }
  return total;
}

/** Σ cantidad × valor de billetes y monedas, redondeado a centavos. */
export function totalDenominaciones(conteo: ConteoDenominaciones | null | undefined): number {
  if (!conteo) return 0;
  return Math.round((sumar(conteo.bills) + sumar(conteo.coins)) * 100) / 100;
}

/** Cantidad válida escrita en una casilla: entero ≥ 0 (vacío = 0). */
export function cantidadDenominacion(texto: string | number | null | undefined): number {
  const n = Math.trunc(Number(texto));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Lo que se guarda: sin cantidades en cero; `undefined` si no se contó por denominación. */
export function conteoParaGuardar(conteo: ConteoDenominaciones | null | undefined): ConteoDenominaciones | undefined {
  if (!conteo) return undefined;
  const limpiar = (g?: Record<string, number>) => {
    const r: Record<string, number> = {};
    for (const [k, v] of Object.entries(g ?? {})) {
      const c = cantidadDenominacion(v);
      if (c > 0) r[k] = c;
    }
    return Object.keys(r).length > 0 ? r : undefined;
  };
  const bills = limpiar(conteo.bills);
  const coins = limpiar(conteo.coins);
  if (!bills && !coins) return undefined;
  return { ...(bills ? { bills } : {}), ...(coins ? { coins } : {}) };
}
