/**
 * Documento soporte — presentación del detalle sin React: impuestos por
 * tarifa (con la misma regla de línea que la compra y la RPC) y nombre del
 * medio de pago guardado (código DIAN, o el interno de los documentos viejos).
 */
import { calcularLineaCompra } from '@/lib/services/compras/logica';
import { mapPaymentMethod } from '@/lib/services/factusService';

export interface LineaImpuestoSoporte {
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  tarifa: number;
}

export interface ImpuestoTarifa {
  tarifa: number;
  base: number;
  importe: number;
}

/** Base e impuesto por tarifa gravada (> 0), en orden ascendente, sumando en centavos. */
export function impuestosDeLineasSoporte(lineas: readonly LineaImpuestoSoporte[], incluido: boolean): ImpuestoTarifa[] {
  const porTarifa = new Map<number, { base: number; importe: number }>();
  for (const l of lineas) {
    if (!(l.tarifa > 0)) continue;
    const c = calcularLineaCompra({ qty: l.cantidad, unit_price: l.precioUnitario, discount_amount: l.descuento, tax_rate: l.tarifa }, incluido);
    const acc = porTarifa.get(l.tarifa) ?? { base: 0, importe: 0 };
    acc.base += Math.round(c.base * 100);
    acc.importe += Math.round(c.impuesto * 100);
    porTarifa.set(l.tarifa, acc);
  }
  return [...porTarifa.entries()].sort((a, b) => a[0] - b[0]).map(([tarifa, v]) => ({ tarifa, base: v.base / 100, importe: v.importe / 100 }));
}

/** Códigos de medio de pago DIAN que guarda el documento (los que produce `mapPaymentMethod`). */
export const MEDIOS_DIAN = ['10', '20', '42', '47', '48', '49'] as const;

export function codigoDianDeMedio(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  const c = codigo.trim().toLowerCase();
  if ((MEDIOS_DIAN as readonly string[]).includes(c)) return c;
  // La tabla de la factura (una sola regla): un código desconocido cae en efectivo, como al emitir.
  return mapPaymentMethod(c);
}

/** Nombre a mostrar: el del código DIAN traducido; si no se conoce, el código tal cual. */
export function nombreMedioPago(codigo: string, traducir: (codigoDian: string) => string | null): string {
  const dian = codigoDianDeMedio(codigo);
  return (dian && traducir(dian)) || codigo;
}

/**
 * Al editar: el método de la organización que corresponde al código guardado
 * (el primero cuyo código DIAN coincide). Sin coincidencia, vacío: se elige otra vez.
 */
export function metodoOrganizacionDe(guardado: string | null | undefined, metodos: readonly { codigo: string }[]): string {
  if (!guardado) return '';
  const exacto = metodos.find((m) => m.codigo === guardado);
  if (exacto) return exacto.codigo;
  const dian = codigoDianDeMedio(guardado);
  return metodos.find((m) => codigoDianDeMedio(m.codigo) === dian)?.codigo ?? '';
}
