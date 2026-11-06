/**
 * Pedido manual y reconstrucción de pedidos pagados en Pedidos online. PURO: sin base ni red,
 * para probarlo con mocks.
 *
 * - Número de pedido: el mismo de la tienda (goadmin-websites `app/api/orders/route.ts`,
 *   `generateOrderNumber`): `WO-{orgId}-{Date.now() en base 36}-{4 al azar}`, en mayúsculas como
 *   allá. NO se usa el RPC `generate_web_order_number` (formato viejo).
 * - La organización de un cobro sale SOLO del prefijo `WO-{orgId}-`: las organizaciones 333 y 339
 *   comparten el comercio de Wompi, así que la conexión que ve el cobro no dice de quién es.
 * - Totales: el mismo modelo de la tienda (`construirFilasPedido`): `total` de la línea = precio ×
 *   cantidad sin impuesto, el IVA de la línea aparte, y el pedido suma el IVA solo si NO viene
 *   incluido en el precio.
 */

const RE_PREFIJO = /^WO-(\d+)-/i;
const RE_NUMERO = /^WO-\d+-[A-Z0-9]+-[A-Z0-9]{4}$/i;

const r2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** `WO-{orgId}-{ts36}-{rand4}`. `ahora` y `azar` existen para las pruebas. */
export function generarNumeroPedidoWeb(organizationId: number, ahora: number = Date.now(), azar: () => number = Math.random): string {
  if (!Number.isInteger(organizationId) || organizationId <= 0) throw new Error('organizationId inválido');
  const ts = ahora.toString(36).toUpperCase();
  const rand = azar().toString(36).substring(2, 6).toUpperCase().padEnd(4, '0');
  return `WO-${organizationId}-${ts}-${rand}`;
}

/** Organización del prefijo `WO-{orgId}-`; null si la referencia no lo trae. */
export function organizacionDelNumero(referencia: string | null | undefined): number | null {
  const m = RE_PREFIJO.exec(String(referencia ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** ¿Tiene la forma completa de un número de pedido de la tienda? */
export function esNumeroDeTienda(referencia: string | null | undefined): boolean {
  return RE_NUMERO.test(String(referencia ?? '').trim());
}

// ─── Totales ────────────────────────────────────────────────────────────────

export interface LineaManual {
  product_id: number;
  nombre: string;
  sku?: string | null;
  quantity: number;
  /** Precio unitario de la línea (el vigente o, al reconstruir, el que se cobró). */
  unit_price: number;
  /** Tarifa de IVA en % (19, 5, 0). */
  tasa: number;
}

export interface ItemManual {
  product_id: number;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
}

export interface TotalesManual {
  items: ItemManual[];
  subtotal: number;
  tax_total: number;
  discount_total: number;
  delivery_fee: number;
  total: number;
}

export class PedidoManualError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

export function totalesPedidoManual(lineas: LineaManual[], opciones: { envio?: number | null; impuestoIncluido: boolean }): TotalesManual {
  if (!Array.isArray(lineas) || lineas.length === 0) throw new PedidoManualError('SIN_ITEMS', 'Agrega al menos un producto.');
  const items = lineas.map((l) => {
    const qty = Number(l.quantity);
    const precio = Number(l.unit_price);
    if (!Number.isInteger(l.product_id) || l.product_id <= 0 || !Number.isFinite(qty) || qty <= 0) {
      throw new PedidoManualError('ITEM_INVALIDO', `Producto ${l.product_id}`);
    }
    if (!Number.isFinite(precio) || precio < 0) throw new PedidoManualError('PRECIO_INVALIDO', `Producto ${l.product_id}`);
    const bruto = r2(precio * qty);
    const tasa = Math.max(Number(l.tasa) || 0, 0) / 100;
    const impuesto = opciones.impuestoIncluido ? r2(bruto - bruto / (1 + tasa)) : r2(bruto * tasa);
    return {
      product_id: l.product_id,
      product_name: l.nombre,
      product_sku: l.sku ?? null,
      quantity: qty,
      unit_price: r2(precio),
      tax_amount: impuesto,
      discount_amount: 0,
      total: bruto,
    };
  });
  const envio = Number(opciones.envio ?? 0);
  if (!Number.isFinite(envio) || envio < 0) throw new PedidoManualError('ENVIO_INVALIDO', 'El envío no puede ser negativo.');
  const subtotal = r2(items.reduce((s, i) => s + i.total, 0));
  const tax = r2(items.reduce((s, i) => s + i.tax_amount, 0));
  const total = r2(subtotal + (opciones.impuestoIncluido ? 0 : tax) + envio);
  return { items, subtotal, tax_total: tax, discount_total: 0, delivery_fee: r2(envio), total };
}

/** El cobro de la pasarela (en centavos) es exactamente el valor (en pesos). */
export function montoCoincide(centavosPasarela: number | null | undefined, valor: number): boolean {
  if (centavosPasarela === null || centavosPasarela === undefined || !Number.isFinite(Number(centavosPasarela))) return false;
  return Math.round(Number(centavosPasarela)) === Math.round(Number(valor) * 100);
}

// ─── Decisión de la reconstrucción ──────────────────────────────────────────

export interface PedidoExistente {
  id: string;
  organization_id: number;
  order_number: string;
  payment_status: string | null;
  payment_reference: string | null;
}

export type Decision =
  /** Ya hay pedido pagado de este cobro: no se duplica. */
  | { tipo: 'ya_existe'; pedido: PedidoExistente }
  /** Hay pedido sin pagar con este número (o enlace): se marca pagado ese mismo pedido. */
  | { tipo: 'completar'; pedido: PedidoExistente }
  /** Se crea con el número de la pasarela (la tienda lo perdió). */
  | { tipo: 'crear'; orderNumber: string; notaOriginal: null }
  /** La referencia no es un número de la tienda: número nuevo y la original en las notas. */
  | { tipo: 'crear_nuevo'; notaOriginal: string; requiereConfirmarTienda: true }
  | { tipo: 'rechazar'; code: 'OTRA_ORGANIZACION' | 'COBRO_DE_OTRA_ORGANIZACION'; organizacion?: number };

/**
 * Qué hacer con un cobro aprobado y verificado.
 * @param existentes pedidos que ya usan este cobro (por número, por `payment_reference` o por el
 *   enlace de pago), de CUALQUIER organización: solo para no duplicar; nunca se escribe en otra.
 */
export function decidirReconstruccion(entrada: {
  organizationId: number;
  referencia: string | null;
  transaccionId: string;
  existentes: PedidoExistente[];
}): Decision {
  const { organizationId, referencia, existentes } = entrada;
  const deOtra = existentes.find((p) => p.organization_id !== organizationId);
  const propios = existentes.filter((p) => p.organization_id === organizationId);
  const pagado = propios.find((p) => p.payment_status === 'paid');
  if (pagado) return { tipo: 'ya_existe', pedido: pagado };
  if (deOtra) return { tipo: 'rechazar', code: 'COBRO_DE_OTRA_ORGANIZACION', organizacion: deOtra.organization_id };

  const prefijo = organizacionDelNumero(referencia);
  if (prefijo !== null && prefijo !== organizationId) return { tipo: 'rechazar', code: 'OTRA_ORGANIZACION', organizacion: prefijo };
  if (propios[0]) return { tipo: 'completar', pedido: propios[0] };
  if (prefijo === organizationId && esNumeroDeTienda(referencia)) return { tipo: 'crear', orderNumber: String(referencia).trim().toUpperCase(), notaOriginal: null };
  return { tipo: 'crear_nuevo', notaOriginal: String(referencia ?? '').trim(), requiereConfirmarTienda: true };
}

/** Nota interna del pedido reconstruido. */
export function notaReconstruccion(d: { proveedor: string; transaccionId: string; referenciaOriginal: string | null; usuario?: string | null }): string {
  const partes = [`[Reconstruido] Cobro ${d.proveedor} ${d.transaccionId}`];
  if (d.referenciaOriginal) partes.push(`referencia original: ${d.referenciaOriginal}`);
  return partes.join(' · ');
}

/**
 * Sede sugerida por los productos (sin prefijo de tienda): la que tiene existencias de más
 * productos del pedido; empate → la de menor id. null si ninguna los tiene.
 */
export function sedeSugerida(productos: number[], existencias: Array<{ branch_id: number; product_id: number; disponible: number }>): number | null {
  const pedidos = new Set(productos);
  const cuenta = new Map<number, number>();
  for (const e of existencias) {
    if (!pedidos.has(e.product_id) || !(e.disponible > 0)) continue;
    cuenta.set(e.branch_id, (cuenta.get(e.branch_id) ?? 0) + 1);
  }
  let mejor: number | null = null;
  let max = 0;
  for (const [sede, n] of Array.from(cuenta.entries()).sort((a, b) => a[0] - b[0])) {
    if (n > max) {
      max = n;
      mejor = sede;
    }
  }
  return mejor;
}
