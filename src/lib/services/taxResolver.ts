/**
 * F-42: Resolver único de impuestos por línea.
 *
 * Orden de resolución (primer resultado gana):
 *   1. Impuesto seleccionado en el formulario para esa línea (item.tax_rate > 0)
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
 */

import { supabase } from '@/lib/supabase/config';

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

/**
 * Resuelve tax_rate y tax_code para una línea, siguiendo el orden de prioridad.
 * Función async: consulta product_tax_relations y organization_taxes si hace falta.
 */
export async function resolveLineTax(input: ResolveTaxInput): Promise<ResolvedTax> {
  const {
    itemTaxRate,
    itemTaxCode,
    appliedTaxes,
    appliedTaxTotals,
    productId,
    organizationId,
    taxIncluded,
    qty,
    unitPrice,
    discountAmount = 0,
  } = input;

  let taxRate = Number(itemTaxRate) || 0;
  let taxCode = itemTaxCode || null;
  let hasNoTax = false;

  // 1. Impuesto del item (seleccionado al agregar el producto).
  if (taxRate > 0) {
    return {
      tax_rate: taxRate,
      tax_code: taxCode,
      tax_included: taxIncluded,
      total_line: computeLineTotal(qty, unitPrice, discountAmount, taxRate, taxIncluded),
      has_no_tax: false,
    };
  }

  // 2. Impuestos aplicados al documento (checkboxes de ImpuestosFactura).
  if (appliedTaxes && appliedTaxTotals) {
    const appliedKeys = Object.keys(appliedTaxes).filter((key) => {
      // appliedTaxes puede usar tax_id (UUID) o tax_code como key.
      // appliedTaxTotals siempre usa tax_code (o TAX_<rate> si no hay código).
      if (appliedTaxes[key]) {
        return appliedTaxTotals[key] != null;
      }
      return false;
    });

    if (appliedKeys.length > 0) {
      // Sumar tasas de todos los impuestos aplicados.
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
        return {
          tax_rate: totalRate,
          tax_code: resolvedCode,
          tax_included: taxIncluded,
          total_line: computeLineTotal(qty, unitPrice, discountAmount, totalRate, taxIncluded),
          has_no_tax: false,
        };
      }
    }
  }

  // 3. product_tax_relations del producto.
  if (productId && taxRate === 0) {
    try {
      const { data: relations, error: relError } = await supabase
        .from('product_tax_relations')
        .select('tax_id')
        .eq('product_id', productId);

      if (!relError && relations && relations.length > 0) {
        const taxIds = relations.map((r: any) => r.tax_id);
        const { data: taxes, error: taxError } = await supabase
          .from('organization_taxes')
          .select('id, rate, is_active, template_id, tax_templates!inner(code)')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .in('id', taxIds);

        if (!taxError && taxes && taxes.length > 0) {
          let totalRate = 0;
          let resolvedCode: string | null = null;
          for (const tax of taxes) {
            totalRate += Number(tax.rate) || 0;
            if (!resolvedCode && (tax as any).tax_templates?.code) {
              resolvedCode = (tax as any).tax_templates.code;
            }
          }
          if (totalRate > 0) {
            return {
              tax_rate: totalRate,
              tax_code: resolvedCode,
              tax_included: taxIncluded,
              total_line: computeLineTotal(qty, unitPrice, discountAmount, totalRate, taxIncluded),
              has_no_tax: false,
            };
          }
        }
      }
    } catch (err) {
      console.warn('[taxResolver] Error consultando product_tax_relations:', err);
    }
  }

  // 4. organization_taxes con is_default = true.
  if (taxRate === 0) {
    try {
      const { data: defaultTaxes, error: defError } = await supabase
        .from('organization_taxes')
        .select('id, rate, is_default, template_id, tax_templates!inner(code)')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .eq('is_default', true);

      if (!defError && defaultTaxes && defaultTaxes.length > 0) {
        let totalRate = 0;
        let resolvedCode: string | null = null;
        for (const tax of defaultTaxes) {
          totalRate += Number(tax.rate) || 0;
          if (!resolvedCode && (tax as any).tax_templates?.code) {
            resolvedCode = (tax as any).tax_templates.code;
          }
        }
        if (totalRate > 0) {
          return {
            tax_rate: totalRate,
            tax_code: resolvedCode,
            tax_included: taxIncluded,
            total_line: computeLineTotal(qty, unitPrice, discountAmount, totalRate, taxIncluded),
            has_no_tax: false,
          };
        }
      }
    } catch (err) {
      console.warn('[taxResolver] Error consultando organization_taxes default:', err);
    }
  }

  // 5. No se encontró ningún impuesto.
  hasNoTax = true;
  return {
    tax_rate: 0,
    tax_code: null,
    tax_included: taxIncluded,
    total_line: computeLineTotal(qty, unitPrice, discountAmount, 0, taxIncluded),
    has_no_tax: hasNoTax,
  };
}

/**
 * Resuelve impuestos para un lote de líneas en paralelo.
 * Útil para el import CSV o cuando se procesan múltiples items a la vez.
 */
export async function resolveLineTaxBatch(inputs: ResolveTaxInput[]): Promise<ResolvedTax[]> {
  return Promise.all(inputs.map((input) => resolveLineTax(input)));
}
