/**
 * Detección anticipada de líneas que se van a emitir SIN impuesto porque no hay
 * configuración (el `has_no_tax` de `resolveLineTax`), para advertir en la UI
 * ANTES de emitir: factura de venta, cotización y POS.
 *
 * Replica el orden de `taxResolver.ts` sin llamarlo por línea:
 *   1. tarifa de la línea > 0                     → tiene impuesto
 *   2. impuestos aplicados al documento (> 0)     → tiene impuesto
 *   3. relación activa en product_tax_relations   → configurado
 *   4. tarifa por defecto de la organización > 0  → tiene impuesto
 *   5. nada de lo anterior                        → advertir
 *
 * No se advierte cuando la tarifa 0 es una elección explícita: la línea trae un
 * código de impuesto (p. ej. `IVA_0`), el cajero marcó «excluir impuesto», o el
 * producto está relacionado con un impuesto activo aunque sea de tarifa 0
 * (excluido/exento configurado a propósito).
 *
 * Recibe el cliente Supabase como argumento: sirve igual en navegador y tests.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface TaxCoverage {
  /** Suma de tasas de los impuestos activos marcados `is_default` (0 si no hay). */
  defaultRate: number;
  /** Productos con al menos una relación a un impuesto activo de la organización. */
  configuredProductIds: Set<number>;
  /** uuid de cada producto sin impuesto configurado (la ruta de edición usa el uuid). */
  productUuids: Map<number, string>;
}

export interface LineaImpuesto {
  productId?: number | null;
  taxRate?: number | null;
  taxCode?: string | null;
  /** «Excluir impuesto» marcado en la línea (POS). */
  taxExcluded?: boolean | null;
}

export interface OpcionesLineaSinImpuesto {
  /** Suma de tasas de los impuestos aplicados al documento (paso 2 del resolver). */
  docTaxRate?: number;
}

/** True si la línea va a quedar con tarifa 0 por falta de configuración. */
export function lineaQuedaSinImpuesto(
  linea: LineaImpuesto,
  coverage: TaxCoverage,
  opciones: OpcionesLineaSinImpuesto = {},
): boolean {
  if ((Number(linea.taxRate) || 0) > 0) return false;
  if (linea.taxExcluded) return false;
  if (linea.taxCode) return false;
  if ((Number(opciones.docTaxRate) || 0) > 0) return false;
  if (linea.productId != null && coverage.configuredProductIds.has(Number(linea.productId))) return false;
  if (coverage.defaultRate > 0) return false;
  return true;
}

/**
 * Suma las tasas de los impuestos marcados en el documento, con la misma regla
 * del paso 2 de `resolveLineTax` (solo claves marcadas que tengan total).
 */
export function tasaImpuestosDelDocumento(
  appliedTaxes: Record<string, boolean> | null | undefined,
  appliedTaxTotals: Record<string, { rate?: number | null } | null | undefined> | null | undefined,
): number {
  if (!appliedTaxes || !appliedTaxTotals) return 0;
  return Object.keys(appliedTaxes).reduce((sum, key) => {
    if (!appliedTaxes[key]) return sum;
    const rate = Number(appliedTaxTotals[key]?.rate) || 0;
    return rate > 0 ? sum + rate : sum;
  }, 0);
}

/**
 * Lee la tarifa por defecto de la organización y qué productos tienen impuesto
 * configurado. Consultas por lote acotadas a la organización, no una por línea.
 */
export async function fetchTaxCoverage(
  client: SupabaseClient,
  organizationId: number,
  productIds: number[],
): Promise<TaxCoverage> {
  const ids = Array.from(new Set(productIds.filter((id) => Number.isFinite(id) && id > 0)));

  const { data: defaults, error: defaultsError } = await client
    .from('organization_taxes')
    .select('rate')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('is_default', true);
  if (defaultsError) throw defaultsError;
  const defaultRate = (defaults ?? []).reduce(
    (sum: number, t: { rate: number | string | null }) => sum + (Number(t.rate) || 0),
    0,
  );

  const configuredProductIds = new Set<number>();
  if (ids.length > 0) {
    const { data: relations, error: relError } = await client
      .from('product_tax_relations')
      .select('product_id, tax_id')
      .in('product_id', ids);
    if (relError) throw relError;

    const rels = (relations ?? []) as Array<{ product_id: number; tax_id: string }>;
    const taxIds = Array.from(new Set(rels.map((r) => r.tax_id).filter(Boolean)));
    if (taxIds.length > 0) {
      const { data: activeTaxes, error: taxError } = await client
        .from('organization_taxes')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .in('id', taxIds);
      if (taxError) throw taxError;
      const activeIds = new Set((activeTaxes ?? []).map((t: { id: string }) => t.id));
      for (const r of rels) {
        if (activeIds.has(r.tax_id)) configuredProductIds.add(Number(r.product_id));
      }
    }
  }

  // La ruta de edición del producto va por uuid: solo hace falta para los que
  // quedan sin configurar, que son los que llevan enlace en la advertencia.
  const productUuids = new Map<number, string>();
  const sinConfigurar = ids.filter((id) => !configuredProductIds.has(id));
  if (sinConfigurar.length > 0) {
    const { data: products, error: prodError } = await client
      .from('products')
      .select('id, uuid')
      .eq('organization_id', organizationId)
      .in('id', sinConfigurar);
    if (prodError) throw prodError;
    for (const p of (products ?? []) as Array<{ id: number; uuid: string | null }>) {
      if (p.uuid) productUuids.set(Number(p.id), p.uuid);
    }
  }

  return { defaultRate, configuredProductIds, productUuids };
}

/**
 * Ruta de edición del producto, donde se asignan sus impuestos. La página
 * resuelve el producto por `uuid`; sin uuid se cae al catálogo.
 */
export function rutaEditarProducto(productUuid: string | null | undefined): string {
  return productUuid
    ? `/app/inventario/productos/${encodeURIComponent(productUuid)}/editar`
    : '/app/inventario/productos';
}

/** Pantalla de impuestos de la organización (tarifa por defecto). */
export const RUTA_IMPUESTOS_ORGANIZACION = '/app/finanzas/impuestos';
