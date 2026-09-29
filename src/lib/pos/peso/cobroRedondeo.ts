/**
 * Redondeo al cobrar una venta con líneas por peso o medida (decisión 3 del
 * dueño, 2026-09-29; docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.5 opción B).
 *
 * La línea guarda el importe EXACTO (0,735 kg × $ 18.900 = $ 13.891,50): así
 * cuadra al centavo con la factura electrónica y el validador del servidor no
 * cambia. Se redondea solo al mostrar y al cobrar:
 *
 * - Total a cobrar = total exacto redondeado a los decimales de la moneda
 *   (medio hacia arriba, como el formateador): $ 13.892; $ 9.185,40 → $ 9.185.
 * - Si lo recibido cubre el total a cobrar pero queda por debajo del exacto
 *   (menos de media unidad de la moneda), el sobre registra el pago por el
 *   total exacto: la diferencia es redondeo de caja (el cierre ya tolera menos
 *   de medio peso). Sin esto, la venta, la factura y la cartera quedaban
 *   pendientes por $ 0,40 (verificado con `pos_checkout_v1` en una transacción
 *   deshecha).
 * - El cambio se redondea hacia abajo a la moneda.
 *
 * Solo aplica a carritos con líneas por peso o medida: los demás cobros siguen
 * exactamente igual que antes.
 */

/** Media unidad de una moneda sin decimales: el mayor faltante que puede venir de redondear. */
export const TOLERANCIA_REDONDEO_COBRO = 0.5;

function factor(decimales: number): number {
  return 10 ** Math.max(0, Math.min(4, Math.trunc(Number.isFinite(decimales) ? decimales : 2)));
}

/** Total a cobrar: el exacto redondeado a la moneda (medio hacia arriba). */
export function totalACobrar(totalExacto: number, decimalesMoneda: number): number {
  const f = factor(decimalesMoneda);
  const n = Number(totalExacto) || 0;
  return Math.sign(n) * Math.round(Math.abs(n) * f + 1e-7) / f;
}

/** Cambio redondeado hacia abajo a la moneda. */
export function cambioRedondeado(recibido: number, totalExacto: number, decimalesMoneda: number): number {
  const f = factor(decimalesMoneda);
  const c = (Number(recibido) || 0) - (Number(totalExacto) || 0);
  return c > 0 ? Math.floor(c * f + 1e-7) / f : 0;
}

export interface PagoSobre {
  method: string;
  amount: number;
}

/**
 * Ajusta los pagos del sobre cuando lo recibido (menos el cambio) queda por
 * debajo del total exacto por redondeo: el faltante (< media unidad) se suma
 * al último pago con importe. Devuelve los pagos y el total pagado del sobre.
 * Si no hay faltante, o es mayor que la tolerancia (un cobro incompleto de
 * verdad), no toca nada.
 */
export function pagosConRedondeo(params: {
  pagos: PagoSobre[];
  totalPagado: number;
  cambio: number;
  totalExacto: number;
}): { pagos: PagoSobre[]; totalPagado: number } {
  const { pagos, totalPagado, cambio, totalExacto } = params;
  const faltante = Math.round(((Number(totalExacto) || 0) - ((Number(totalPagado) || 0) - (Number(cambio) || 0))) * 10000) / 10000;
  if (!(faltante > 0) || faltante >= TOLERANCIA_REDONDEO_COBRO) return { pagos, totalPagado };
  let idx = -1;
  for (let i = pagos.length - 1; i >= 0; i -= 1) {
    if (pagos[i].amount > 0) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return { pagos, totalPagado };
  const ajustados = pagos.map((p, i) => (i === idx ? { ...p, amount: Math.round((p.amount + faltante) * 10000) / 10000 } : p));
  return { pagos: ajustados, totalPagado: Math.round(((Number(totalPagado) || 0) + faltante) * 10000) / 10000 };
}
