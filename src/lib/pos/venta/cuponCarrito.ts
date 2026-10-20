/**
 * Cupón del POS. La fila viene de `coupons` (no de los cupones de suscripción).
 * El descuento se reparte entre las líneas y el cobro lo valida como cualquier
 * descuento (`descuento_excede_linea`). El uso se suma al insertar
 * `coupon_redemptions` (trigger `fn_coupon_redemption_increment`).
 */

export interface CuponAplicable {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_purchase_amount?: number | null;
  max_discount_amount?: number | null;
  usage_limit?: number | null;
  usage_limit_per_customer?: number | null;
  usage_count?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  applies_to_first_purchase?: boolean | null;
  customer_id?: string | null;
}

export interface ContextoCupon {
  ahora: Date;
  /** Suma de cantidad × precio de las líneas, antes del cupón. */
  subtotal: number;
  customerId?: string | null;
  /** Redenciones de este cliente con este cupón. */
  usosDelCliente: number;
  /** El cliente ya tiene alguna venta. Solo importa si el cupón es de primera compra. */
  yaCompro: boolean;
}

export type ResultadoCupon =
  | { ok: true; descuento: number }
  | { ok: false; motivo: 'inactivo' | 'aun_no' | 'vencido' | 'agotado' | 'agotado_cliente' | 'otro_cliente' | 'minimo' | 'primera_compra' | 'sin_valor' };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function validarCupon(cupon: CuponAplicable, ctx: ContextoCupon): ResultadoCupon {
  if (cupon.is_active === false) return { ok: false, motivo: 'inactivo' };
  if (cupon.start_date) {
    const inicio = new Date(cupon.start_date).getTime();
    if (Number.isFinite(inicio) && inicio > ctx.ahora.getTime()) return { ok: false, motivo: 'aun_no' };
  }
  if (cupon.end_date) {
    const fin = new Date(cupon.end_date).getTime();
    if (!Number.isFinite(fin) || fin < ctx.ahora.getTime()) return { ok: false, motivo: 'vencido' };
  }
  if (cupon.usage_limit != null && num(cupon.usage_count) >= num(cupon.usage_limit)) {
    return { ok: false, motivo: 'agotado' };
  }
  if (cupon.usage_limit_per_customer != null && ctx.usosDelCliente >= num(cupon.usage_limit_per_customer)) {
    return { ok: false, motivo: 'agotado_cliente' };
  }
  if (cupon.customer_id && cupon.customer_id !== ctx.customerId) return { ok: false, motivo: 'otro_cliente' };
  if (cupon.applies_to_first_purchase && (ctx.yaCompro || !ctx.customerId)) {
    return { ok: false, motivo: 'primera_compra' };
  }
  if (cupon.min_purchase_amount != null && ctx.subtotal + 0.001 < num(cupon.min_purchase_amount)) {
    return { ok: false, motivo: 'minimo' };
  }
  const valor = num(cupon.discount_value);
  if (!(valor > 0) || !(ctx.subtotal > 0)) return { ok: false, motivo: 'sin_valor' };
  let descuento = cupon.discount_type === 'percentage'
    ? Math.round(ctx.subtotal * valor) / 100
    : valor;
  const tope = num(cupon.max_discount_amount);
  if (tope > 0) descuento = Math.min(descuento, tope);
  descuento = Math.min(Math.round(descuento * 100) / 100, Math.round(ctx.subtotal * 100) / 100);
  if (!(descuento > 0)) return { ok: false, motivo: 'sin_valor' };
  return { ok: true, descuento };
}

/** Reparte `monto` en proporción a `pesos`. La última línea con peso absorbe el redondeo. */
export function repartirMonto(monto: number, pesos: number[]): number[] {
  const out = pesos.map(() => 0);
  const suma = pesos.reduce((s, w) => s + Math.max(0, w), 0);
  const objetivo = Math.round(Math.min(Math.max(0, monto), suma) * 100) / 100;
  if (!(objetivo > 0) || !(suma > 0)) return out;
  let acumulado = 0;
  let ultima = -1;
  pesos.forEach((w, i) => {
    if (w > 0) ultima = i;
  });
  pesos.forEach((w, i) => {
    if (!(w > 0)) return;
    if (i === ultima) {
      out[i] = Math.round((objetivo - acumulado) * 100) / 100;
    } else {
      const parte = Math.round(((objetivo * w) / suma) * 100) / 100;
      out[i] = parte;
      acumulado = Math.round((acumulado + parte) * 100) / 100;
    }
  });
  return out;
}

/**
 * Parte del descuento de toda la venta que le toca a cada línea, topada a
 * cantidad × precio. Porcentaje: cada línea recibe su %. Monto: se reparte.
 */
export function descuentoDeVentaPorLinea(
  lineas: readonly { quantity: number; unit_price: number }[],
  modo: 'monto' | 'porcentaje',
  valor: number,
): number[] {
  const bases = lineas.map((l) => Math.max(0, Math.round(l.quantity * l.unit_price * 100) / 100));
  if (modo === 'porcentaje') {
    const pct = Math.min(100, Math.max(0, valor));
    return bases.map((b) => Math.round(b * pct) / 100);
  }
  return repartirMonto(valor, bases);
}
