/**
 * Tipo de entrega de un pedido web: una sola regla para Pedidos online,
 * Comandas, caja y avisos.
 *
 * «Comer aquí» (QR de mesa) llega de dos formas:
 * - `delivery_type = 'dine_in'` con `restaurant_table_id` (migración E1,
 *   20261006124644_web_orders_dine_in);
 * - mientras E1 no esté aplicada, el sitio lo guarda como `pickup` con la
 *   mesa en `internal_notes` empezando por «[Comer aquí]» (contrato del
 *   paquete A: `MARCA_COMER_AQUI` en goadmin-websites/lib/orders/estados-pedido.ts).
 *
 * Antes, todo lo que no era 'pickup' se trataba como domicilio: un dine_in
 * pedía dirección, mostraba «Enviar a domicilio» y rompía las tablas de
 * configuración por tipo (undefined.icon).
 */

export type TipoEntregaWeb = 'pickup' | 'delivery_own' | 'delivery_third_party' | 'dine_in';

/** Marca que el sitio deja en `internal_notes` (contrato con goadmin-websites). */
export const MARCA_COMER_AQUI = '[Comer aquí]';

export interface PedidoConTipoEntrega {
  delivery_type?: string | null;
  internal_notes?: string | null;
  restaurant_table?: { name?: string | null; zone?: string | null } | null;
}

/** El pedido se lleva a una dirección (propio o de un tercero). */
export function esDomicilio(tipo: string | null | undefined): boolean {
  return tipo === 'delivery_own' || tipo === 'delivery_third_party';
}

/** El pedido se come en el local, en una mesa (dine_in real o el mapeo temporal a pickup). */
export function esComerAqui(pedido: PedidoConTipoEntrega): boolean {
  if (pedido.delivery_type === 'dine_in') return true;
  return pedido.delivery_type === 'pickup' && (pedido.internal_notes ?? '').startsWith(MARCA_COMER_AQUI);
}

/**
 * Nombre de la mesa: la enlazada (`restaurant_table.name`) o la que el sitio
 * escribió tras la marca («[Comer aquí] Mesa: 4 (Terraza)» → «4 (Terraza)»).
 */
export function mesaDelPedido(pedido: PedidoConTipoEntrega): string | null {
  const enlazada = pedido.restaurant_table?.name?.trim();
  if (enlazada) {
    const zona = pedido.restaurant_table?.zone?.trim();
    return zona ? `${enlazada} (${zona})` : enlazada;
  }
  if (!esComerAqui(pedido)) return null;
  const notas = pedido.internal_notes ?? '';
  const m = /Mesa:\s*([^\n|]+)/i.exec(notas);
  return m ? m[1].trim() : null;
}

/** Tipo efectivo para mostrar y filtrar: un pickup con la marca es «Comer aquí». */
export function tipoEntregaEfectivo(pedido: PedidoConTipoEntrega): TipoEntregaWeb {
  if (esComerAqui(pedido)) return 'dine_in';
  const t = pedido.delivery_type;
  return t === 'delivery_own' || t === 'delivery_third_party' ? t : 'pickup';
}
