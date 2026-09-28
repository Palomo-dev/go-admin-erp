/**
 * Presentación del detalle de una factura de venta, sin React. Nada se escribe:
 * solo se desglosa lo que la base ya guardó.
 *
 * `impuestosDeLineas` usa la misma regla de base que `fn_recalc_invoice_totals`
 * (F-51): con impuestos incluidos la base de cada línea se redondea a centavos
 * y el impuesto sale por resta; sin incluir, la base es cantidad × precio −
 * descuento. Solo agrupa por nombre y tarifa para pintar «IVA 19 % · base».
 */
import type { LineaFacturaDetalle, PagoFacturaDetalle } from './contratoFacturas';

export interface ImpuestoDesglosado {
  nombre: string;
  tarifa: number;
  base: number;
  importe: number;
}

const c = (n: number): number => Math.round(n * 100);

export function impuestosDeLineas(
  lineas: readonly Pick<LineaFacturaDetalle, 'cantidad' | 'precioUnitario' | 'descuento' | 'tarifa' | 'total' | 'nombreImpuesto'>[],
  impuestosIncluidos: boolean,
  nombrePorDefecto: string,
): ImpuestoDesglosado[] {
  const grupos = new Map<string, { nombre: string; tarifa: number; base: number; importe: number }>();
  for (const l of lineas) {
    if (!(l.tarifa > 0)) continue;
    const neto = l.cantidad * l.precioUnitario - (l.descuento || 0);
    const base = impuestosIncluidos ? Math.round((neto / (1 + l.tarifa / 100)) * 100) / 100 : neto;
    const importe = l.total - base;
    const nombre = (l.nombreImpuesto ?? '').trim() || nombrePorDefecto;
    const clave = `${nombre.toLowerCase()}|${l.tarifa}`;
    const g = grupos.get(clave) ?? { nombre, tarifa: l.tarifa, base: 0, importe: 0 };
    g.base += c(base);
    g.importe += c(importe);
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ nombre: g.nombre, tarifa: g.tarifa, base: g.base / 100, importe: g.importe / 100 }))
    .sort((a, b) => b.tarifa - a.tarifa || a.nombre.localeCompare(b.nombre));
}

/** Pagado vivo: solo pagos `completed`, sin cambio (el monto guardado es el aplicado). */
export function totalPagado(pagos: readonly Pick<PagoFacturaDetalle, 'estado' | 'monto'>[]): number {
  return pagos.filter((p) => p.estado === 'completed').reduce((s, p) => s + c(p.monto), 0) / 100;
}

/** ¿El pago se puede anular desde el detalle? Vivo y de una fuente de venta. */
export function pagoAnulable(p: Pick<PagoFacturaDetalle, 'estado' | 'origen'>): boolean {
  return p.estado === 'completed' && ['invoice_sales', 'account_receivable', 'sale'].includes(p.origen ?? '');
}

/**
 * H1: el asiento vivo de devengo no cuadra con el total de la factura
 * (tolerancia de un peso). Solo se muestra; la corrección es de contabilidad.
 */
export function asientoDescuadrado(
  asientos: readonly { clave: string | null; debito: number; revertido: boolean }[],
  total: number,
): { descuadrado: boolean; diferencia: number } {
  const vivo = asientos.find((a) => !a.revertido && (a.clave ?? '').startsWith('accrual:'));
  if (!vivo) return { descuadrado: false, diferencia: 0 };
  const diferencia = (c(vivo.debito) - c(total)) / 100;
  return { descuadrado: Math.abs(diferencia) > 1, diferencia };
}

/**
 * Días vencidos entre dos días calendario `YYYY-MM-DD` ya en la zona de la
 * sucursal (vencimiento con `toPlainDate`, hoy con `todayInTz`). 0 si no vence.
 */
export function diasVencidos(vencimiento: string | null | undefined, hoy: string): number {
  if (!vencimiento || !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento) || !/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return 0;
  const d = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${vencimiento}T00:00:00Z`)) / 86400000);
  return Number.isFinite(d) && d > 0 ? d : 0;
}