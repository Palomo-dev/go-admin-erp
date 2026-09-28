/**
 * Filas del «Resumen» del carrito (`src/components/pos/TaxSummary.tsx`), L27
 * del plan. Solo PRESENTACIÓN de importes ya calculados: el cálculo de
 * impuestos se queda en TaxSummary sin tocar (lo fijan
 * `impuestosLineaCarrito.test.ts` y el guardarraíl «Pantalla del cliente»).
 *
 * - Los impuestos se nombran con su nombre real y su tasa, nunca «IVA» fijo.
 * - Sin desglose: «No hay impuestos configurados para estos productos».
 */

export interface DesgloseImpuesto {
  taxId: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

export interface FilaImpuesto {
  taxId: string;
  /** «<nombre> (<tasa>%)», tal cual lo configuró la organización. */
  etiqueta: string;
  importe: number;
}

export interface ResumenImpuestos {
  /**
   * Subtotal BRUTO (neto + descuento). `calculateCartTaxes` devuelve el neto;
   * con la fila «Descuento» debajo se pinta el bruto para que cuadre igual que
   * en el cobro: 183.000 − 2.010 = 180.990.
   */
  subtotalBruto: number;
  impuestos: FilaImpuesto[];
  mostrarTotalImpuestos: boolean;
  totalImpuestos: number;
  mostrarDescuento: boolean;
  descuento: number;
  total: number;
  /** Sin desglose: aviso «No hay impuestos configurados para estos productos». */
  sinImpuestosConfigurados: boolean;
}

export function resumenImpuestos(d: {
  subtotal: number;
  totalTaxAmount: number;
  finalTotal: number;
  discountTotal: number | null | undefined;
  taxBreakdown: DesgloseImpuesto[];
}): ResumenImpuestos {
  return {
    subtotalBruto: d.subtotal + (d.discountTotal || 0),
    impuestos: d.taxBreakdown.map((tax) => ({ taxId: tax.taxId, etiqueta: `${tax.name} (${tax.rate}%)`, importe: tax.taxAmount })),
    mostrarTotalImpuestos: d.totalTaxAmount > 0,
    totalImpuestos: d.totalTaxAmount,
    mostrarDescuento: (d.discountTotal ?? 0) > 0,
    descuento: d.discountTotal ?? 0,
    total: d.finalTotal,
    sinImpuestosConfigurados: d.taxBreakdown.length === 0,
  };
}

interface ImpuestoOrganizacion {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
}

/**
 * Impuestos marcados al abrir el Resumen: los que el carrito ya tenía
 * elegidos (aunque sea una lista vacía) o, si nunca eligió, los
 * predeterminados de la organización, que además se deben guardar en el
 * carrito (`predeterminadosAGuardar`).
 */
export function impuestosAplicadosIniciales(
  taxes: ImpuestoOrganizacion[],
  cartTaxIds: string[] | undefined,
): { aplicados: Record<string, boolean>; predeterminadosAGuardar: string[] | null } {
  const initialAppliedTaxes: { [key: string]: boolean } = {};
  taxes.forEach((tax) => {
    initialAppliedTaxes[tax.id] = cartTaxIds && cartTaxIds.length >= 0
      ? cartTaxIds.includes(tax.id)
      : tax.is_default;
  });
  const predeterminadosAGuardar = !cartTaxIds
    ? taxes.filter((t) => t.is_default).map((t) => t.id)
    : null;
  return { aplicados: initialAppliedTaxes, predeterminadosAGuardar };
}

export type EtiquetaSelectorImpuestos =
  | { tipo: 'ninguno' }
  | { tipo: 'uno'; nombre: string; tasa: number }
  | { tipo: 'varios'; cantidad: number };

/** Lo que dice el botón del selector de impuestos de la organización. */
export function etiquetaSelectorImpuestos(
  appliedTaxes: Record<string, boolean>,
  organizationTaxes: ImpuestoOrganizacion[],
): EtiquetaSelectorImpuestos {
  const selectedCount = Object.values(appliedTaxes).filter(Boolean).length;
  const selectedTaxes = organizationTaxes.filter(tax => appliedTaxes[tax.id]);

  if (selectedCount === 0) {
    return { tipo: 'ninguno' };
  } else if (selectedCount === 1) {
    return { tipo: 'uno', nombre: selectedTaxes[0].name, tasa: selectedTaxes[0].rate };
  } else {
    return { tipo: 'varios', cantidad: selectedCount };
  }
}
