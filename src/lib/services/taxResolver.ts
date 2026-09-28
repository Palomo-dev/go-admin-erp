/**
 * F-42: Resolver único de impuestos por línea.
 *
 * Orden de resolución (primer resultado gana):
 *   1. Impuesto seleccionado en el formulario para esa línea (item.tax_rate > 0,
 *      o cualquier tarifa si `itemTaxIsFinal`)
 *   2. Impuestos aplicados al documento (appliedTaxes / appliedTaxTotals de ImpuestosFactura)
 *   3. product_tax_relations del producto (filtrando organization_taxes.is_active)
 *   4. organization_taxes de la org con is_default = true
 *   5. 0 (y advertir: "Esta línea no tiene impuesto asignado")
 *
 * Regla de total_line (la que lee fn_recalc_invoice_totals):
 *   tax_included = true  → total_line = qty * unit_price - discount_amount
 *                          (el precio ya trae el IVA; el trigger extrae la base)
 *   tax_included = false → total_line = (qty * unit_price - discount_amount)
 *                                    * (1 + tax_rate / 100)
 *
 * La lógica vive en `taxResolverCore.ts`, que recibe el cliente Supabase por
 * parámetro (`resolveLineTaxWith`). Este archivo es la entrada del navegador:
 * `resolveLineTax` usa el cliente de `@/lib/supabase/config`. El código de
 * servidor importa `taxResolverCore.ts` directamente para no arrastrar el
 * cliente de navegador.
 */

import { supabase } from '@/lib/supabase/config';
import {
  computeLineTotal,
  resolveLineTaxWith,
  type ResolvedTax,
  type ResolveTaxInput,
  type TaxResolverClient,
} from './taxResolverCore';

export { computeLineTotal, resolveLineTaxWith };
export type { ResolvedTax, ResolveTaxInput, TaxResolverClient };

/**
 * F-51: separa el bruto de una línea en base e impuesto con la única regla de
 * redondeo del sistema, la misma que aplica `fn_recalc_invoice_totals` en la
 * base: `base = round(bruto / (1 + tasa/100), 2)` y el impuesto por resta, de
 * modo que base + impuesto = bruto al centavo.
 */
export function splitGrossLine(gross: number, taxRate: number): { base: number; tax: number } {
  const grossCents = roundHalfAwayFromZero((gross || 0) * 100);
  const rate = taxRate || 0;
  if (rate <= 0) {
    return { base: grossCents / 100, tax: 0 };
  }
  const baseCents = roundHalfAwayFromZero(grossCents / (1 + rate / 100));
  return { base: baseCents / 100, tax: (grossCents - baseCents) / 100 };
}

/** Como `round()` de Postgres sobre numeric: la mitad se aleja del cero (también en negativos). */
function roundHalfAwayFromZero(value: number): number {
  // El épsilon absorbe el error binario de productos como 1.005 * 100.
  return Math.sign(value) * Math.round(Math.abs(value) + 1e-9);
}

/**
 * Resuelve tax_rate y tax_code para una línea, siguiendo el orden de prioridad,
 * con el cliente Supabase del navegador.
 */
export async function resolveLineTax(input: ResolveTaxInput): Promise<ResolvedTax> {
  return resolveLineTaxWith(supabase, input);
}

/**
 * Resuelve impuestos para un lote de líneas en paralelo.
 * Útil para el import CSV o cuando se procesan múltiples items a la vez.
 */
export async function resolveLineTaxBatch(inputs: ResolveTaxInput[]): Promise<ResolvedTax[]> {
  return Promise.all(inputs.map((input) => resolveLineTax(input)));
}
