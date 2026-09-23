/**
 * F-42: núcleo del resolver único de impuestos por línea, sin cliente Supabase
 * propio. Recibe el cliente por parámetro para que lo usen por igual el
 * navegador (`taxResolver.ts` le pasa el cliente de `@/lib/supabase/config`) y
 * el servidor (route handlers y servicios con service role o sesión), sin que
 * el código de servidor arrastre el cliente de navegador.
 *
 * Orden de resolución (primer resultado gana):
 *   1. Impuesto de la línea (itemTaxRate > 0, o cualquier tarifa —también 0—
 *      si `itemTaxIsFinal`: la línea ya fija lo que se cobró, p. ej. una nota
 *      crédito que copia la línea de la factura original)
 *   2. Impuestos aplicados al documento (appliedTaxes / appliedTaxTotals)
 *   3. product_tax_relations del producto (filtrando organization_taxes.is_active)
 *   4. organization_taxes de la org con is_default = true
 *   5. 0 (y advertir: "Esta línea no tiene impuesto asignado")
 *
 * Regla de total_line (la que lee fn_recalc_invoice_totals):
 *   tax_included = true  → total_line = qty * unit_price - discount_amount
 *                          (el precio ya trae el IVA; el trigger extrae la base)
 *   tax_included = false → total_line = (qty * unit_price - discount_amount)
 *                                    * (1 + tax_rate / 100)
 * Con cantidades o descuentos negativos (notas crédito que guardan la línea en
 * negativo) la misma fórmula conserva el signo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolvedTax {
  /** Tasa resuelta (19.00, no 0.19). 0 si no hay impuesto. */
  tax_rate: number;
  /** Código del impuesto ('IVA_19', 'IVA_5', 'IVA_0') o null. */
  tax_code: string | null;
  /** Si el impuesto está incluido en el precio. */
  tax_included: boolean;
  /** Total bruto de la línea según la regla de total_line. */
  total_line: number;
  /** True si no se encontró ningún impuesto (para advertir en UI). */
  has_no_tax: boolean;
}

export interface ResolveTaxInput {
  /** Tasa que trae el item desde el formulario (product.tax_rate). */
  itemTaxRate?: number | null;
  /** Código que trae el item desde el formulario (product.tax_code). */
  itemTaxCode?: string | null;
  /**
   * La tarifa de la línea es definitiva aunque sea 0: no se buscan impuestos
   * del documento, del producto ni por defecto. Para líneas que copian una
   * línea ya facturada (devoluciones, notas crédito) o cuyo importe ya se
   * cobró con esa tarifa.
   */
  itemTaxIsFinal?: boolean;
  /** Checkboxes de ImpuestosFactura: { 'IVA_19': true, ... }. */
  appliedTaxes?: { [key: string]: boolean };
  /** Totales calculados por ImpuestosFactura: { 'IVA_19': { rate, base, amount, ... } }. */
  appliedTaxTotals?: { [key: string]: { rate: number; base: number; amount: number; name: string; included: boolean } };
  /** ID del producto para buscar en product_tax_relations. */
  productId?: number | null;
  /** ID de la organización para buscar en organization_taxes. */
  organizationId: number;
  /** Si el impuesto está incluido en el precio (global del documento). */
  taxIncluded: boolean;
  /** Cantidad de la línea. */
  qty: number;
  /** Precio unitario de la línea. */
  unitPrice: number;
  /** Descuento de la línea. */
  discountAmount?: number;
}

/** Cliente Supabase con el que el resolver consulta impuestos (navegador o servidor). */
export type TaxResolverClient = Pick<SupabaseClient, 'from'>;

interface OrganizationTaxRow {
  rate: number | string | null;
  tax_templates?: { code?: string | null } | { code?: string | null }[] | null;
}

/**
 * Calcula total_line desde los datos de la línea y la tasa resuelta.
 * Función pura, sin side-effects.
 */
export function computeLineTotal(
  qty: number,
  unitPrice: number,
  discountAmount: number,
  taxRate: number,
  taxIncluded: boolean,
): number {
  const lineNet = qty * unitPrice - (discountAmount || 0);
  if (taxIncluded) {
    // El precio ya trae el IVA; total_line es el monto bruto.
    return Math.round(lineNet * 100) / 100;
  }
  // IVA no incluido: total_line = base * (1 + tasa/100).
  const total = lineNet * (1 + (taxRate || 0) / 100);
  return Math.round(total * 100) / 100;
}

function templateCode(row: OrganizationTaxRow): string | null {
  const tpl = Array.isArray(row.tax_templates) ? row.tax_templates[0] : row.tax_templates;
  return tpl?.code || null;
}

/** Suma las tarifas de las filas y toma el primer código de plantilla. */
function sumRates(rows: OrganizationTaxRow[]): { rate: number; code: string | null } {
  let rate = 0;
  let code: string | null = null;
  for (const row of rows) {
    rate += Number(row.rate) || 0;
    if (!code) code = templateCode(row);
  }
  return { rate, code };
}

/**
 * Resuelve tax_rate y tax_code para una línea con el cliente dado, siguiendo el
 * orden de prioridad. Consulta product_tax_relations y organization_taxes solo
 * si hace falta.
 */
export async function resolveLineTaxWith(client: TaxResolverClient, input: ResolveTaxInput): Promise<ResolvedTax> {
  const {
    itemTaxRate,
    itemTaxCode,
    itemTaxIsFinal = false,
    appliedTaxes,
    appliedTaxTotals,
    productId,
    organizationId,
    taxIncluded,
    qty,
    unitPrice,
    discountAmount = 0,
  } = input;

  const itemRate = Number(itemTaxRate) || 0;

  const result = (rate: number, code: string | null): ResolvedTax => ({
    tax_rate: rate,
    tax_code: code,
    tax_included: taxIncluded,
    total_line: computeLineTotal(qty, unitPrice, discountAmount, rate, taxIncluded),
    has_no_tax: rate <= 0,
  });

  // 1. Impuesto del item (seleccionado al agregar el producto o copiado de la
  //    línea original). Si es definitivo, vale aunque sea 0.
  if (itemRate > 0 || itemTaxIsFinal) {
    return result(itemRate, itemTaxCode || null);
  }

  // 2. Impuestos aplicados al documento (checkboxes de ImpuestosFactura).
  if (appliedTaxes && appliedTaxTotals) {
    // appliedTaxes puede usar tax_id (UUID) o tax_code como key.
    // appliedTaxTotals siempre usa tax_code (o TAX_<rate> si no hay código).
    const appliedKeys = Object.keys(appliedTaxes).filter(
      (key) => appliedTaxes[key] && appliedTaxTotals[key] != null,
    );

    let totalRate = 0;
    let resolvedCode: string | null = null;
    for (const key of appliedKeys) {
      const info = appliedTaxTotals[key];
      if (info && info.rate > 0) {
        totalRate += Number(info.rate) || 0;
        // Tomar el primer código real (no TAX_<rate>).
        if (!resolvedCode && !key.startsWith('TAX_')) {
          resolvedCode = key;
        }
      }
    }
    if (totalRate > 0) {
      return result(totalRate, resolvedCode);
    }
  }

  // 3. product_tax_relations del producto.
  if (productId) {
    try {
      const { data: relations, error: relError } = await client
        .from('product_tax_relations')
        .select('tax_id')
        .eq('product_id', productId);

      if (!relError && relations && relations.length > 0) {
        const taxIds = (relations as { tax_id: string }[]).map((r) => r.tax_id);
        const { data: taxes, error: taxError } = await client
          .from('organization_taxes')
          .select('id, rate, is_active, template_id, tax_templates!inner(code)')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .in('id', taxIds);

        if (!taxError && taxes && taxes.length > 0) {
          const { rate, code } = sumRates(taxes as OrganizationTaxRow[]);
          if (rate > 0) {
            return result(rate, code);
          }
        }
      }
    } catch (err) {
      console.warn('[taxResolver] Error consultando product_tax_relations:', err);
    }
  }

  // 4. organization_taxes con is_default = true.
  try {
    const { data: defaultTaxes, error: defError } = await client
      .from('organization_taxes')
      .select('id, rate, is_default, template_id, tax_templates!inner(code)')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .eq('is_default', true);

    if (!defError && defaultTaxes && defaultTaxes.length > 0) {
      const { rate, code } = sumRates(defaultTaxes as OrganizationTaxRow[]);
      if (rate > 0) {
        return result(rate, code);
      }
    }
  } catch (err) {
    console.warn('[taxResolver] Error consultando organization_taxes default:', err);
  }

  // 5. No se encontró ningún impuesto.
  return result(0, null);
}
