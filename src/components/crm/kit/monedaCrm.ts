/**
 * Montos del CRM en la moneda base de la organización (Figma `KpiMoneda`
 * 759:22664 y el total de `StageColumn` 759:22544). Sin React.
 *
 * Regla del diseño: la tasa **no se inventa**. Se suma lo que tiene tasa del
 * día contable (o la más reciente anterior) y lo que no, queda fuera con aviso.
 *
 * `exchange_rates`: 1 `base_currency` = `rate` `target_currency` (verificado
 * por MCP el 2026-09-29: USD → COP 4000). Se acepta la tasa en cualquiera de
 * los dos sentidos.
 */
import { contextoMoneda, formatMoneda, normalizarCodigoMoneda, type ContextoMoneda } from '@/lib/utils/moneda';

export interface TasaCambio {
  base_currency: string;
  target_currency: string;
  rate: number | string;
  /** `date` (YYYY-MM-DD). */
  effective_date: string;
}

export interface MontoEnMoneda {
  monto: number | string | null | undefined;
  /** `opportunities.currency`; null → la base. */
  moneda: string | null | undefined;
}

export interface GrupoMoneda {
  moneda: string;
  monto: number;
  cantidad: number;
  /** Equivalente en la base; null si falta la tasa. */
  convertido: number | null;
  /** Tasa usada (1 moneda = tasa base); null en la base o sin tasa. */
  tasa: number | null;
  fechaTasa: string | null;
}

export interface ResumenMonedaBase {
  base: string;
  /** Suma en la base de todo lo que se pudo convertir. */
  total: number;
  cantidad: number;
  grupos: GrupoMoneda[];
  /** Monedas distintas de la base que sí entraron al total. */
  convertidas: GrupoMoneda[];
  /** Monedas sin tasa: no suman. */
  sinTasa: GrupoMoneda[];
}

function numero(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Tasa para pasar 1 unidad de `moneda` a `base`, vigente en `fecha` (la más
 * reciente con `effective_date` ≤ `fecha`; sin fecha, la más reciente).
 */
export function tasaVigente(
  moneda: string,
  base: string,
  tasas: readonly TasaCambio[],
  fecha?: string | null,
): { tasa: number; fecha: string } | null {
  let mejor: { tasa: number; fecha: string } | null = null;
  for (const t of tasas) {
    if (fecha && t.effective_date > fecha) continue;
    const b = normalizarCodigoMoneda(t.base_currency);
    const d = normalizarCodigoMoneda(t.target_currency);
    const r = numero(t.rate);
    if (!(r > 0)) continue;
    let tasa: number | null = null;
    if (b === moneda && d === base) tasa = r;
    else if (b === base && d === moneda) tasa = 1 / r;
    if (tasa === null) continue;
    if (!mejor || t.effective_date > mejor.fecha) mejor = { tasa, fecha: t.effective_date };
  }
  return mejor;
}

/** Suma montos de varias monedas en la base, separando los que no tienen tasa. */
export function sumarEnMonedaBase(
  items: readonly MontoEnMoneda[],
  base: string,
  tasas: readonly TasaCambio[] = [],
  fecha?: string | null,
): ResumenMonedaBase {
  const codigoBase = normalizarCodigoMoneda(base) ?? base;
  const porMoneda = new Map<string, { monto: number; cantidad: number }>();
  for (const it of items) {
    const moneda = normalizarCodigoMoneda(it.moneda) ?? codigoBase;
    const actual = porMoneda.get(moneda) ?? { monto: 0, cantidad: 0 };
    actual.monto += numero(it.monto);
    actual.cantidad += 1;
    porMoneda.set(moneda, actual);
  }
  const grupos: GrupoMoneda[] = [];
  porMoneda.forEach(({ monto, cantidad }, moneda) => {
    if (moneda === codigoBase) {
      grupos.push({ moneda, monto, cantidad, convertido: monto, tasa: null, fechaTasa: null });
      return;
    }
    const t = tasaVigente(moneda, codigoBase, tasas, fecha);
    grupos.push({ moneda, monto, cantidad, convertido: t ? monto * t.tasa : null, tasa: t?.tasa ?? null, fechaTasa: t?.fecha ?? null });
  });
  // La base primero; el resto por monto convertido (los sin tasa al final).
  grupos.sort((a, b) => {
    if (a.moneda === codigoBase) return -1;
    if (b.moneda === codigoBase) return 1;
    return (b.convertido ?? -1) - (a.convertido ?? -1);
  });
  const convertibles = grupos.filter((g) => g.convertido !== null);
  return {
    base: codigoBase,
    total: convertibles.reduce((s, g) => s + (g.convertido ?? 0), 0),
    cantidad: grupos.reduce((s, g) => s + g.cantidad, 0),
    grupos,
    convertidas: convertibles.filter((g) => g.moneda !== codigoBase),
    sinTasa: grupos.filter((g) => g.convertido === null),
  };
}

/** Formatea un monto en otra moneda con el locale de la organización. */
export function formatearEn(monto: number | string | null | undefined, moneda: string, base: ContextoMoneda): string {
  if (moneda === base.code) return formatMoneda(monto, base);
  return formatMoneda(monto, contextoMoneda(moneda, { locale: base.locale }));
}
