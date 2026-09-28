/**
 * Comisión del vendedor en el cobro del POS (POS-PLAN §2.6, L45), movida
 * LITERALMENTE de `CheckoutDialog.tsx`.
 *
 * - Sin vendedor (vacío o «Sin asignar» = `__none__`) no hay comisión.
 * - Por porcentaje: sobre el subtotal SIN impuestos, redondeado a centavos.
 *   Por monto: el importe tal cual.
 * - Al elegir vendedor se precarga la tasa de `vendor_commission_rates`
 *   (`useCommissionRate().resolveRate`): si hay tasa > 0 queda como
 *   porcentaje; si no hay, se conserva lo que el cajero hubiera escrito.
 *   Quitar el vendedor pone la tasa en 0.
 */

/** Valor del `SelectItem` «Sin asignar» del mesero y del vendedor. */
export const SIN_ASIGNAR = '__none__';

export type MetodoComision = 'percentage' | 'fixed_amount';
export type TipoComision = 'salesperson' | 'intermediation_sale' | 'none';

/** ¿Hay una persona elegida (mesero o vendedor)? */
export function esPersonaAsignada(id: string): boolean {
  return !!id && id !== SIN_ASIGNAR;
}

export interface EntradaMontoComision {
  commissionRate: number;
  salespersonId: string;
  commissionMethod: MetodoComision;
  /** `calculatedTotals.subtotal || cart.subtotal`: base SIN impuestos. */
  subtotal: number;
}

// Comisión calculada
export function montoComision({ commissionRate, salespersonId, commissionMethod, subtotal }: EntradaMontoComision): number {
  return commissionRate > 0 && esPersonaAsignada(salespersonId)
    ? commissionMethod === 'fixed_amount'
      ? commissionRate
      : Math.round(subtotal * commissionRate / 100 * 100) / 100
    : 0;
}

/**
 * Qué cambia al resolver la tasa de un vendedor elegido: con tasa > 0, la tasa
 * y el método «porcentaje»; con 0 (sin configuración), nada (null).
 */
export function comisionDeTasaResuelta(rate: number): { commissionRate: number; commissionMethod: MetodoComision } | null {
  if (rate > 0) return { commissionRate: rate, commissionMethod: 'percentage' };
  return null;
}

export interface EntradaCamposComision {
  salespersonId: string;
  commissionRate: number;
  commissionType: TipoComision;
  commissionMethod: MetodoComision;
  commissionAmount: number;
}

export interface CamposComisionDelSobre {
  salesperson_id: string | undefined;
  commission_rate: number | undefined;
  commission_type: TipoComision;
  commission_method: MetodoComision | undefined;
  commission_amount: number | undefined;
}

/** Los campos de comisión del sobre del cobro (`CheckoutData`), en su orden. */
export function camposComisionDelSobre({
  salespersonId,
  commissionRate,
  commissionType,
  commissionMethod,
  commissionAmount,
}: EntradaCamposComision): CamposComisionDelSobre {
  const conVendedor = esPersonaAsignada(salespersonId);
  return {
    salesperson_id: conVendedor ? salespersonId : undefined,
    commission_rate: commissionRate > 0 ? commissionRate : undefined,
    commission_type: conVendedor && commissionRate > 0 ? commissionType : 'none',
    commission_method: conVendedor && commissionRate > 0 ? commissionMethod : undefined,
    commission_amount: commissionAmount > 0 ? commissionAmount : undefined,
  };
}
