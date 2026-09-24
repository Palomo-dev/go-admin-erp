/**
 * Formulario del diálogo único de pago (factura de venta y de compra, CxC,
 * CxP, cliente con reparto), sin React. Solo validación de lo que escribe la
 * persona y ayudas de presentación; **registrar** el pago, repartirlo o
 * tocar la caja es de la RPC (`fn_registrar_pago` / `POST /api/pagos`).
 */

export type DestinoPago = 'factura' | 'cuenta' | 'tercero';

export interface ValorPago {
  monto: number | null;
  /** `payment_methods.code` de la organización. */
  metodo: string | null;
  /** Día calendario `YYYY-MM-DD` en la zona de la organización. */
  fecha: string;
  referencia: string;
  notas: string;
  /** Efectivo: lo que entregó el cliente, para calcular el cambio en pantalla. */
  recibido?: number | null;
}

export type CampoPago = 'monto' | 'metodo' | 'fecha' | 'referencia' | 'recibido';
export type ErrorPago =
  | 'montoVacio'
  | 'montoCero'
  | 'montoExcede'
  | 'metodoVacio'
  | 'fechaVacia'
  | 'fechaFutura'
  | 'referenciaVacia'
  | 'recibidoInsuficiente';

export interface ReglasPago {
  /** Saldo del documento (o total de lo elegido en «tercero»). */
  saldo: number;
  /** Día de la organización (`useFormatDate().getToday()`). */
  hoy: string;
  /** Admite pagar más que el saldo (sobrante como saldo a favor, destino «tercero»). */
  permitirExcedente?: boolean;
  /** El método elegido exige referencia (transferencia, tarjeta). */
  exigeReferencia?: boolean;
  /** El método elegido es efectivo y se pide «Recibido». */
  esEfectivo?: boolean;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function pagoInicial(saldo: number, hoy: string, metodo: string | null = null): ValorPago {
  return { monto: saldo > 0 ? saldo : null, metodo, fecha: hoy, referencia: '', notas: '', recibido: null };
}

export function validarPago(v: ValorPago, r: ReglasPago): Partial<Record<CampoPago, ErrorPago>> {
  const errores: Partial<Record<CampoPago, ErrorPago>> = {};
  if (v.monto === null || v.monto === undefined || !Number.isFinite(v.monto)) errores.monto = 'montoVacio';
  else if (v.monto <= 0) errores.monto = 'montoCero';
  else if (!r.permitirExcedente && v.monto > r.saldo + 1e-9) errores.monto = 'montoExcede';
  if (!v.metodo) errores.metodo = 'metodoVacio';
  if (!v.fecha || !FECHA.test(v.fecha)) errores.fecha = 'fechaVacia';
  else if (FECHA.test(r.hoy) && v.fecha > r.hoy) errores.fecha = 'fechaFutura';
  if (r.exigeReferencia && !v.referencia.trim()) errores.referencia = 'referenciaVacia';
  if (r.esEfectivo && typeof v.recibido === 'number' && typeof v.monto === 'number' && v.recibido < v.monto) {
    errores.recibido = 'recibidoInsuficiente';
  }
  return errores;
}

/** Atajos de monto: saldo total y la mitad, redondeada a los decimales de la moneda. */
export function montosRapidos(saldo: number, decimales = 0): { clave: 'saldo' | 'mitad'; monto: number }[] {
  if (!(saldo > 0)) return [];
  const f = 10 ** Math.max(0, decimales);
  const mitad = Math.round((saldo / 2) * f) / f;
  const lista: { clave: 'saldo' | 'mitad'; monto: number }[] = [{ clave: 'saldo', monto: saldo }];
  if (mitad > 0 && mitad < saldo) lista.push({ clave: 'mitad', monto: mitad });
  return lista;
}

/** Cambio a devolver en efectivo; `null` si aún no se sabe. */
export function cambioEfectivo(recibido: number | null | undefined, monto: number | null | undefined): number | null {
  if (typeof recibido !== 'number' || typeof monto !== 'number' || !Number.isFinite(recibido) || !Number.isFinite(monto)) return null;
  return Math.max(0, recibido - monto);
}

/** Lo que se envía: referencia y notas sin espacios sobrantes. */
export function pagoLimpio(v: ValorPago): ValorPago {
  return { ...v, referencia: v.referencia.trim(), notas: v.notas.trim() };
}
