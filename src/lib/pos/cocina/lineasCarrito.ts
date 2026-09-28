/**
 * Notas de la línea del carrito y su estado en cocina (POS de mostrador).
 * Puro: sin Supabase ni navegador, para probarlo en Jest.
 *
 * - La nota tiene destino: `notes` es la de COCINA (comanda, KDS, ticket de
 *   cocina) y `customer_note` la del CLIENTE (ticket, recibo, factura). Nunca
 *   se cruzan (docs/design/POS-CARRITO-LINEAS-NOTAS.md §3.1, regla 2).
 * - `is_allergy` marca la nota de cocina como alergia; sin nota no hay alergia.
 * - Lo que la cocina ya tiene de cada línea lo decide la base
 *   (`pos_cocina_enviar_ronda`); aquí solo se guarda la copia que devolvió la
 *   última ronda para pintar «enviado» / «cambio sin enviar».
 */

import type { Cart, CartItem } from '@/components/pos/types';

/** Largo máximo de una nota (texto plano). */
export const NOTA_MAX = 140;

/**
 * Texto plano de una nota: sin etiquetas HTML (el editor enriquecido de la
 * mesa llegó a guardar `innerHTML`, N8), sin espacios repetidos y con 140
 * caracteres como máximo. Vacía → `undefined`.
 */
export function normalizarNota(texto: string | null | undefined): string | undefined {
  if (typeof texto !== 'string') return undefined;
  const limpio = texto.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (limpio.length === 0) return undefined;
  return limpio.slice(0, NOTA_MAX).trim();
}

export interface CambioNotaLinea {
  /** Nota para cocina; `null` o vacío la borra; `undefined` no la toca. */
  cocina?: string | null;
  /** Nota para el cliente; `null` o vacío la borra; `undefined` no la toca. */
  cliente?: string | null;
  /** Alergia; solo vale si queda nota de cocina. `undefined` no la toca. */
  alergia?: boolean;
}

/** Devuelve la línea con la nota cambiada (no muta la original). */
export function aplicarNotaALinea(item: CartItem, cambio: CambioNotaLinea): CartItem {
  const siguiente: CartItem = { ...item };
  if (cambio.cocina !== undefined) siguiente.notes = normalizarNota(cambio.cocina);
  if (cambio.cliente !== undefined) siguiente.customer_note = normalizarNota(cambio.cliente);
  const alergia = (cambio.alergia ?? item.is_allergy) === true && !!siguiente.notes;
  if (siguiente.notes === undefined) delete siguiente.notes;
  if (siguiente.customer_note === undefined) delete siguiente.customer_note;
  if (alergia) siguiente.is_allergy = true;
  else delete siguiente.is_allergy;
  return siguiente;
}

export type EstadoCocinaLinea = 'sin_enviar' | 'enviada' | 'cambio_pendiente';

/** Estado de la línea respecto a lo último que se envió a cocina. */
export function estadoCocinaLinea(item: CartItem): EstadoCocinaLinea {
  const enviada = Number(item.kitchen_sent_qty) || 0;
  if (enviada <= 0) return 'sin_enviar';
  const mismaCantidad = Number(item.quantity) === enviada;
  const mismaNota = (normalizarNota(item.notes) ?? null) === (normalizarNota(item.kitchen_sent_note ?? undefined) ?? null);
  const mismaAlergia = (item.is_allergy === true && !!item.notes) === (item.kitchen_sent_allergy === true);
  return mismaCantidad && mismaNota && mismaAlergia ? 'enviada' : 'cambio_pendiente';
}

/** Una línea tal como la recibe `pos_cocina_enviar_ronda`. */
export interface LineaRonda {
  line_id: string;
  product_name: string;
  quantity: number;
  station: string | null;
  notes: string | null;
  is_allergy: boolean;
  variant_data: Record<string, string> | null;
  modifiers: Array<{ name: string; extraPrice: number }> | null;
}

export function lineaParaRonda(
  item: CartItem,
  station: string | null,
  variantData: Record<string, string> | null,
): LineaRonda {
  const nota = normalizarNota(item.notes) ?? null;
  return {
    line_id: item.id,
    product_name: item.product?.name || 'Producto',
    quantity: item.quantity,
    station,
    notes: nota,
    is_allergy: nota !== null && item.is_allergy === true,
    variant_data: variantData,
    modifiers: item.modifiers?.map((m) => ({ name: m.name, extraPrice: m.extraPrice })) || null,
  };
}

export type TipoAjuste = 'increase' | 'decrease' | 'void' | 'note';

export interface ItemRonda {
  id: number;
  cart_line_id: string | null;
  product_name: string | null;
  quantity: number;
  quantity_delta: number | null;
  adjustment_kind: TipoAjuste | null;
  adjustment_reason: string | null;
  notes: string | null;
  is_allergy: boolean;
  station: string | null;
  variant_data: Record<string, string> | null;
  modifiers: Array<{ name: string; extraPrice?: number }> | null;
}

export interface TicketRonda {
  id: number;
  ticket_type: 'order' | 'adjustment';
  adjusts_ticket_id: number | null;
  created_at: string;
  has_allergy: boolean;
  items: ItemRonda[];
}

export interface EstadoLineaRonda {
  line_id: string;
  sent_qty: number;
  sent_note: string | null;
  sent_allergy: boolean;
}

export interface RespuestaRonda {
  replayed: boolean;
  first_ticket_id: number | null;
  tickets: TicketRonda[];
  lines: EstadoLineaRonda[];
}

/**
 * Carrito después de una ronda: guarda la comanda del carrito, lo que la
 * cocina tiene de cada línea y suelta la llave de la ronda (la siguiente
 * «Enviar a cocina» es otra ronda).
 */
export function aplicarRondaAlCarrito(cart: Cart, respuesta: RespuestaRonda): Cart {
  const porLinea = new Map(respuesta.lines.map((l) => [l.line_id, l]));
  return {
    ...cart,
    kitchen_ticket_id: respuesta.first_ticket_id ?? cart.kitchen_ticket_id ?? null,
    kitchen_round_key: null,
    items: cart.items.map((item) => {
      const estado = porLinea.get(item.id);
      if (!estado) return item;
      return {
        ...item,
        kitchen_sent_qty: Number(estado.sent_qty) || 0,
        kitchen_sent_note: estado.sent_note ?? null,
        kitchen_sent_allergy: estado.sent_allergy === true,
      };
    }),
  };
}

/** Fila de `kitchen_tickets` con sus ítems, tal como la leen el KDS y la mesa. */
export interface RegistroComanda {
  id: number;
  created_at: string;
  ticket_type?: 'order' | 'adjustment' | null;
  adjusts_ticket_id?: number | null;
  has_allergy?: boolean | null;
  kitchen_ticket_items?: Array<{
    id?: number;
    cart_line_id?: string | null;
    product_name?: string | null;
    quantity?: number | string | null;
    quantity_delta?: number | string | null;
    adjustment_kind?: TipoAjuste | null;
    adjustment_reason?: string | null;
    notes?: string | null;
    is_allergy?: boolean | null;
    status?: string | null;
    station?: string | null;
    variant_data?: Record<string, string> | null;
    modifiers?: Array<{ name: string; extraPrice?: number }> | null;
    sale_items?: {
      quantity?: number | string | null;
      notes?: unknown;
      products?: { name?: string | null; variant_data?: Record<string, string> | null } | null;
    } | null;
  }> | null;
}

/**
 * Comanda guardada → forma de la ronda (para imprimir o reimprimir). La copia
 * del ítem (nombre, cantidad, modificadores) manda sobre la línea de la venta;
 * las filas viejas de mesa, sin copia, siguen leyendo la venta. Los ítems
 * anulados no se imprimen: lo que la cocina debe ver es el ajuste.
 */
export function ticketRondaDesdeRegistro(registro: RegistroComanda): TicketRonda {
  const items = (registro.kitchen_ticket_items || [])
    .filter((it) => it.status !== 'cancelled')
    .map((it, i): ItemRonda => {
      const venta = it.sale_items || null;
      const notasVenta = venta?.notes && typeof venta.notes === 'object' ? (venta.notes as { modifiers?: Array<{ name: string; extraPrice?: number }> }) : null;
      return {
        id: it.id ?? i,
        cart_line_id: it.cart_line_id ?? null,
        product_name: it.product_name || venta?.products?.name || null,
        quantity: Number(it.product_name ? it.quantity : (venta?.quantity ?? it.quantity)) || 1,
        quantity_delta: it.quantity_delta == null ? null : Number(it.quantity_delta),
        adjustment_kind: it.adjustment_kind ?? null,
        adjustment_reason: it.adjustment_reason ?? null,
        notes: it.notes ?? null,
        is_allergy: it.is_allergy === true,
        station: it.station ?? null,
        variant_data: it.variant_data || venta?.products?.variant_data || null,
        modifiers: it.modifiers || notasVenta?.modifiers || null,
      };
    });
  return {
    id: registro.id,
    ticket_type: registro.ticket_type === 'adjustment' ? 'adjustment' : 'order',
    adjusts_ticket_id: registro.adjusts_ticket_id ?? null,
    created_at: registro.created_at,
    has_allergy: registro.has_allergy === true,
    items,
  };
}

/** Textos del ticket impreso de un ajuste (los pone quien imprime, traducidos). */
export interface TextosAjusteImpreso {
  mesa: string;
  ajuste: (ticketOriginal: number | null) => string;
  mas: (cantidad: number) => string;
  menos: (cantidad: number) => string;
  anular: string;
  notaCambiada: string;
  alergia: string;
}

export interface ItemImpreso {
  productName: string;
  quantity: number;
  station: string | null;
  notes: string | null;
  variantData: Record<string, string> | null;
  modifiers: Array<{ name: string; extraPrice: number }> | null;
}

/**
 * Ítems de una comanda de la ronda tal como los imprime la cocina. En un
 * ajuste el nombre lleva delante qué cambió (+2, −1, ANULAR, NOTA) y la
 * alergia va en mayúsculas al inicio de la nota.
 */
export function itemsParaImprimir(ticket: TicketRonda, textos: TextosAjusteImpreso): ItemImpreso[] {
  return ticket.items.map((it) => {
    const nombre = it.product_name || 'Producto';
    let prefijo = '';
    if (ticket.ticket_type === 'adjustment') {
      const delta = Math.abs(Number(it.quantity_delta) || 0);
      if (it.adjustment_kind === 'increase') prefijo = textos.mas(delta);
      else if (it.adjustment_kind === 'decrease') prefijo = textos.menos(delta);
      else if (it.adjustment_kind === 'void') prefijo = textos.anular;
      else if (it.adjustment_kind === 'note') prefijo = textos.notaCambiada;
    }
    const partesNota = [
      it.is_allergy ? textos.alergia : null,
      it.notes,
      it.adjustment_reason,
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);
    return {
      productName: prefijo ? `${prefijo} ${nombre}` : nombre,
      quantity: Number(it.quantity) || 0,
      station: it.station,
      notes: partesNota.length > 0 ? partesNota.join(' · ') : null,
      variantData: it.variant_data,
      modifiers: (it.modifiers || []).map((m) => ({ name: m.name, extraPrice: Number(m.extraPrice) || 0 })),
    };
  });
}
