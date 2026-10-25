import type { BaseActividadIndicadores } from './indicadores';
import { movimientosContabilizados, type MovimientoInforme } from './estados';
import { normalizarCodigoMoneda } from '@/lib/utils/moneda';

/** Facturas y líneas verificadas por el cargador con organización y RLS. */
export interface FacturaActividad {
  id: string;
  organization_id: number;
  status: string;
  subtotal: number | string | null;
  currency?: string | null;
  cost_center_id?: string | null;
  document_type?: string | null;
  related_invoice_id?: string | null;
  payment_method?: string | null;
  payment_form?: string | null;
  payment_terms?: number | null;
}

export interface LineaCompraActividad {
  invoice_purchase_id: string | null;
  total_line: number | string | null;
  tax_rate: number | string | null;
  cost_center_id: string | null;
}

export interface MovimientoActividad extends MovimientoInforme {
  source_id?: string | null;
}

export interface EntradaBasesActividad {
  organizationId: number;
  desde: string;
  hasta: string;
  /** Ya filtrados por la misma sucursal y centro del informe. */
  movimientos: MovimientoActividad[];
  ventas: FacturaActividad[];
  /** Incluye facturas originales de notas crédito, aunque sean de otro período. */
  originalesVentas?: FacturaActividad[];
  compras: FacturaActividad[];
  lineasCompra?: LineaCompraActividad[];
  centroCosto?: string | null;
  monedaBase: string | null;
}

const activa = (factura: FacturaActividad, historicaAntesAnulacion = false) => ['issued', 'paid', 'partial'].includes(factura.status)
  || (factura.status === 'void' && historicaAntesAnulacion);
const numero = (valor: unknown): number | null => {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

/**
 * La forma DIAN 1 está también en facturas históricas a crédito. Los términos
 * pactados y el método credit son fuentes persistidas, incluso después de pagar.
 * Nunca se usa el saldo pendiente actual para reclasificar la venta histórica.
 */
export function esFacturaCredito(factura: FacturaActividad): boolean | null {
  if (factura.payment_method === 'credit' || factura.payment_form === '2' || (factura.payment_terms ?? 0) > 0) return true;
  if (factura.payment_form === '1' || factura.payment_terms === 0 || factura.payment_method) return false;
  return null;
}

/**
 * Cartera: ingreso neto 41 de facturas a crédito, incluidas sus devoluciones.
 * Compras: subtotal sin impuestos de facturas con asiento contabilizado.
 * Se recibe lo ya cargado: no consulta de nuevo ni usa costos/precios actuales.
 */
export function calcularBasesActividad(entrada: EntradaBasesActividad): {
  basesActividad: BaseActividadIndicadores;
  advertencias: string[];
} {
  const advertencias: string[] = [];
  const monedaBase = normalizarCodigoMoneda(entrada.monedaBase);
  if (!monedaBase) {
    const motivo = 'La moneda base no está verificada; no se calculan bases de actividad a partir de importes sin moneda confirmada.';
    return { basesActividad: { ventasCredito: null, compras: null, fuente: 'Moneda base pendiente de verificación.', motivoVentasCredito: motivo, motivoCompras: motivo }, advertencias: [motivo] };
  }
  const movimientos = (movimientosContabilizados(entrada.movimientos, entrada.hasta) as MovimientoActividad[]).filter((m) => m.entry_date >= entrada.desde && m.entry_date <= entrada.hasta
    && m.source !== 'cierre_ejercicio' && m.source !== 'cierre_periodo');
  const ventas = new Map(entrada.ventas.filter((f) => f.organization_id === entrada.organizationId).map((f) => [f.id, f]));
  const originales = new Map([...(entrada.originalesVentas ?? []), ...entrada.ventas]
    .filter((f) => f.organization_id === entrada.organizationId).map((f) => [f.id, f]));
  let ventasCredito = 0;
  let creditoCompleto = true;
  for (const movimiento of movimientos.filter((m) => m.account_code.startsWith('41'))) {
    if (movimiento.debit === movimiento.credit) continue;
    const factura = movimiento.source === 'invoice_sales' && movimiento.source_id ? ventas.get(movimiento.source_id) : undefined;
    if (!factura) {
      creditoCompleto = false;
      continue;
    }
    if (!activa(factura, !!movimiento.anulado_desde && movimiento.anulado_desde > entrada.hasta)) continue;
    const original = factura.document_type === 'credit_note' || factura.document_type === 'debit_note'
      ? factura.related_invoice_id ? originales.get(factura.related_invoice_id) : undefined : factura;
    const credito = original ? esFacturaCredito(original) : null;
    if (credito === null) creditoCompleto = false;
    else if (credito) ventasCredito += movimiento.credit - movimiento.debit;
  }
  const motivoVentasCredito = creditoCompleto ? undefined
    : 'Hay ingresos o devoluciones sin una factura y condición de crédito verificables; complete su vinculación antes de calcular días de cartera.';
  if (motivoVentasCredito) advertencias.push(motivoVentasCredito);

  const idsCompra = new Set(movimientos.filter((m) => m.source === 'invoice_purchase' && m.source_id).map((m) => m.source_id!));
  const compras = new Map(entrada.compras.filter((f) => f.organization_id === entrada.organizationId).map((f) => [f.id, f]));
  let baseCompras = 0;
  let comprasCompletas = true;
  for (const id of idsCompra) {
    const factura = compras.get(id);
    if (!factura) { comprasCompletas = false; continue; }
    const antesAnulacion = movimientos.some((m) => m.source === 'invoice_purchase' && m.source_id === id && m.anulado_desde && m.anulado_desde > entrada.hasta);
    if (!activa(factura, antesAnulacion)) continue;
    // Los saldos y resultados están en moneda base; no se mezclan subtotales
    // extranjeros cuando no hay un tipo de cambio histórico atribuible.
    if (normalizarCodigoMoneda(factura.currency) !== monedaBase) {
      comprasCompletas = false;
      continue;
    }
    if (!entrada.centroCosto) {
      const subtotal = numero(factura.subtotal);
      if (subtotal === null) comprasCompletas = false;
      else baseCompras += subtotal;
      continue;
    }
    const lineas = entrada.lineasCompra?.filter((l) => l.invoice_purchase_id === id);
    if (lineas?.length) {
      for (const linea of lineas) {
        const centro = linea.cost_center_id ?? factura.cost_center_id;
        if (!centro) { comprasCompletas = false; continue; }
        if (centro !== entrada.centroCosto) continue;
        const bruto = numero(linea.total_line);
        const tarifa = numero(linea.tax_rate);
        if (bruto === null || tarifa === null || tarifa < 0) { comprasCompletas = false; continue; }
        // total_line ya incluye los impuestos en ambos modos de precio
        // (contrato de taxResolverCore y fn_recalc_invoice_totals).
        baseCompras += bruto / (1 + tarifa / 100);
      }
    } else if (factura.cost_center_id === entrada.centroCosto) {
      const subtotal = numero(factura.subtotal);
      if (subtotal === null) comprasCompletas = false;
      else baseCompras += subtotal;
    } else {
      comprasCompletas = false;
    }
  }
  const motivoCompras = comprasCompletas ? undefined
    : 'Hay compras sin subtotal, moneda base o centro de costo verificables; complete su información antes de calcular días de proveedores.';
  if (motivoCompras) advertencias.push(motivoCompras);
  if (!Number.isFinite(ventasCredito) || !Number.isFinite(baseCompras)) throw new Error('Las bases de actividad contienen un agregado no finito.');
  return {
    basesActividad: {
      ventasCredito: creditoCompleto ? ventasCredito : null,
      compras: comprasCompletas ? baseCompras : null,
      fuente: 'Asientos contabilizados vinculados a facturas; ingresos netos de devoluciones y compras sin impuestos.',
      motivoVentasCredito, motivoCompras,
    },
    advertencias,
  };
}
