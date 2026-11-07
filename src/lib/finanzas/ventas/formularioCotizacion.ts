/**
 * Cotización — reglas del formulario nueva / editar, sin React (pruebas en
 * `src/__tests__/finanzas/ventas/cotizacionesR3.test.ts`).
 *
 * El formulario comparte con la factura de venta las líneas (`LineaVenta`,
 * `calcularLineaVenta`, `lineaAItem`) y el cálculo de totales; la base vuelve a
 * calcularlos al guardar (`fn_cotizacion_guardar`). Una línea de cotización
 * guarda UN impuesto (`tax_code`, `tax_rate`): el formulario no ofrece varios.
 */
import { addPlainDays } from '@/lib/utils/dateCore';
import type { DatosCotizacion } from './contratoCotizaciones';
import { impuestosAplicados, lineaAItem, type LineaVenta } from './lineasFacturaVenta';

/** Atajos de vigencia (días desde la emisión), como el Figma: 15 · 30 · 60. */
export const ATAJOS_VIGENCIA = [15, 30, 60] as const;
export const TERMINOS_PAGO = [0, 15, 30, 45, 60, 90] as const;

export function vigenciaPorDias(emision: string, dias: number): string {
  return addPlainDays(emision, dias);
}

/** Atajo que coincide con la vigencia elegida, o null si es una fecha a mano. */
export function atajoVigencia(emision: string, validaHasta: string | null): number | null {
  if (!validaHasta) return null;
  return ATAJOS_VIGENCIA.find((d) => vigenciaPorDias(emision, d) === validaHasta) ?? null;
}

export type CampoCotizacion = 'cliente' | 'sucursal' | 'lineas' | 'vigencia' | `linea.${string}`;
export type ErroresCotizacion = Partial<Record<CampoCotizacion, 'requerido' | 'vigenciaAnterior' | 'sinLineas' | 'descripcion' | 'cantidad' | 'precio' | 'descuento'>>;

/** Lo mismo que exige `guardarCotizacionSchema` y la RPC, dicho antes de enviar. */
export function validarCotizacion(f: {
  clienteId: string | null;
  sucursal: number | null;
  emision: string;
  validaHasta: string | null;
  lineas: readonly LineaVenta[];
}): ErroresCotizacion {
  const e: ErroresCotizacion = {};
  if (!f.clienteId) e.cliente = 'requerido';
  if (!f.sucursal) e.sucursal = 'requerido';
  if (f.validaHasta && f.validaHasta < f.emision) e.vigencia = 'vigenciaAnterior';
  if (f.lineas.length === 0) e.lineas = 'sinLineas';
  for (const l of f.lineas) {
    const neto = (Number(l.cantidad) || 0) * (Number(l.precio) || 0);
    if (!l.descripcion.trim()) e[`linea.${l.clave}`] = 'descripcion';
    else if (!(Number(l.cantidad) > 0)) e[`linea.${l.clave}`] = 'cantidad';
    else if (!(Number(l.precio) >= 0)) e[`linea.${l.clave}`] = 'precio';
    else if ((Number(l.descuento) || 0) < 0 || (Number(l.descuento) || 0) > neto) e[`linea.${l.clave}`] = 'descuento';
  }
  return e;
}

export interface CabeceraCotizacion {
  clienteId: string;
  sucursal: number;
  emision: string;
  validaHasta: string | null;
  moneda: string | null;
  terminos: number;
  formaPago: string | null;
  notas: string;
  terminosCondiciones: string;
  vendedor: string | null;
  oportunidad: string | null;
  incluido: boolean;
}

/**
 * Cuerpo de `POST/PUT /api/cotizaciones` (sin organización, número ni
 * totales). Cada línea lleva su único impuesto (el primero con tarifa).
 */
export function datosCotizacion(c: CabeceraCotizacion, lineas: readonly LineaVenta[]): DatosCotizacion {
  return {
    customer_id: c.clienteId,
    branch_id: c.sucursal,
    issue_date: c.emision,
    valid_until: c.validaHasta,
    currency: c.moneda,
    payment_terms: c.terminos,
    payment_method: c.formaPago || null,
    notes: c.notas.trim() || null,
    terms_conditions: c.terminosCondiciones.trim() || null,
    salesperson_id: c.vendedor || null,
    opportunity_id: c.oportunidad || null,
    tax_included: c.incluido,
    applied_taxes: impuestosAplicados([...lineas]),
    items: lineas.map((l) => {
      const it = lineaAItem({ ...l, impuestos: l.impuestos.slice(0, 1) }, c.incluido);
      return {
        product_id: it.product_id,
        description: it.description,
        qty: it.qty,
        unit_price: it.unit_price,
        discount_amount: it.discount_amount ?? 0,
        tax_code: it.tax_code,
        tax_rate: it.tax_rate,
        tax_included: c.incluido,
      };
    }),
  };
}
