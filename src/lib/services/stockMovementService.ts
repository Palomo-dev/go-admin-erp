import { supabase } from '@/lib/supabase/config';
import type {
  LineaEntradaCompra,
  MotivoLineaSaltada,
  ResultadoEntradaCompra,
  ResultadoLiberacion,
  ResultadoReserva,
} from '@/lib/inventario/nucleo/tipos';

/**
 * Fachada TypeScript del núcleo de existencias (INVENTARIO-PLAN.md §5.1, B0).
 *
 * Desde B0 este servicio NO lee ni escribe `stock_levels` / `stock_movements`:
 * cada método llama a una RPC que pasa por la primitiva `fn_inv_int_mover`
 * (bloqueo de la fila, una sola regla de costo promedio, kardex con autor).
 * Sus llamadores (POS offline, CRM, pedidos web, PMS, compras) no cambian.
 *
 *   decrementOnSale          → decrement_stock_with_recipe (receta + primitiva)
 *   reserveStock             → fn_stock_reservar (receta expandida, registrada por documento)
 *   releaseStockReservation  → fn_stock_liberar_reserva (libera EXACTAMENTE lo reservado)
 *   incrementOnPurchase      → fn_kardex_entrada_compra (orígenes de compra; permiso
 *                              inventory.create/finance.create en el servidor, P6)
 *                              o, para `folio_item_reversal`, fn_inv_reversion_entrada
 *                              (al costo con que salió, no al precio de venta)
 *
 * Antes: la reserva y la recepción se hacían desde el navegador leyendo y
 * escribiendo sin bloqueo, con una copia en TS del promedio ponderado y sin
 * `product_costs`; la reversión del folio metía el precio de venta como costo.
 */

export interface SaleItemForStock {
  product_id: number | null;
  quantity: number;
  /**
   * Ventas: precio de venta, solo como último recurso de costo si el producto
   * no tiene ni promedio ni costo vigente (regla de fn_costo_unitario_producto).
   * Compras: costo unitario de la línea.
   */
  unit_price?: number;
}

/**
 * Motivo por el que un item no llego a afectar el inventario.
 * Antes estos casos solo incrementaban un contador `skipped` que nadie leia, asi
 * que una recepcion podia "funcionar" sin mover una sola unidad de stock y el
 * usuario no tenia forma de enterarse.
 */
export type StockSkipReason = MotivoLineaSaltada;

export interface StockSkippedItem {
  productId: number | null;
  productName?: string;
  reason: StockSkipReason;
}

export const STOCK_SKIP_REASON_LABELS: Record<StockSkipReason, string> = {
  no_product: 'la linea no esta asociada a un producto',
  invalid_qty: 'la cantidad no es valida',
  product_not_found: 'el producto no existe',
  not_tracked: 'el producto no rastrea inventario',
};

/**
 * Devuelve un resumen legible de los items omitidos, listo para mostrar en un toast.
 */
export function describeSkippedItems(skippedItems: StockSkippedItem[]): string {
  return skippedItems
    .map((item) => {
      const name = item.productName || (item.productId ? `Producto ${item.productId}` : 'Linea sin producto');
      return `${name}: ${STOCK_SKIP_REASON_LABELS[item.reason]}`;
    })
    .join('; ');
}

export interface StockDecrementResult {
  success: boolean;
  skipped: number;
  /** Detalle de cada item omitido, para poder avisar al usuario. */
  skippedItems: StockSkippedItem[];
  errors: string[];
}

/**
 * Orígenes de compra que entran por aquí (`fn_kardex_entrada_compra`). La
 * recepción de una orden de compra (`purchase_order`) ya no: va entera por
 * `fn_oc_recepcionar` (inventario B8: cantidades, lotes, seriales, estado de la
 * OC y factura en una transacción; `lib/services/inventario/recepcionOrdenCompra.ts`).
 */
const ORIGENES_COMPRA = new Set(['purchase', 'purchase_invoice']);

/** Separa los ítems sin producto o sin cantidad (motivo) de los válidos. */
function clasificar(items: SaleItemForStock[]): {
  validos: { product_id: number; quantity: number; unit_price?: number }[];
  saltados: StockSkippedItem[];
} {
  const validos: { product_id: number; quantity: number; unit_price?: number }[] = [];
  const saltados: StockSkippedItem[] = [];
  for (const item of items) {
    if (!item.product_id) {
      saltados.push({ productId: null, reason: 'no_product' });
      continue;
    }
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) {
      saltados.push({ productId: item.product_id, reason: 'invalid_qty' });
      continue;
    }
    validos.push({ product_id: item.product_id, quantity: qty, unit_price: item.unit_price });
  }
  return { validos, saltados };
}

function resultado(saltados: StockSkippedItem[], errors: string[]): StockDecrementResult {
  return { success: errors.length === 0, skipped: saltados.length, skippedItems: saltados, errors };
}

function saltadosDelServidor(saltadas: ResultadoEntradaCompra['saltadas'] | undefined): StockSkippedItem[] {
  return (saltadas ?? []).map((s) => ({
    productId: s.product_id ?? null,
    productName: s.product_name,
    reason: s.reason,
  }));
}

export const stockMovementService = {
  /**
   * Descuenta stock por cada item de una venta con `decrement_stock_with_recipe`
   * (receta propia o heredada; sin receta, el producto). Omite items sin
   * product_id o cantidad <= 0.
   *
   * @param source - Origen ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'folio_item', 'room_consumption')
   */
  async decrementOnSale(
    organizationId: number,
    branchId: number,
    saleId: string | number,
    items: SaleItemForStock[],
    source: string = 'sale',
    updatedBy?: string
  ): Promise<StockDecrementResult> {
    const { validos, saltados } = clasificar(items);
    const errors: string[] = [];

    for (const item of validos) {
      const { error: rpcError } = await supabase.rpc('decrement_stock_with_recipe', {
        p_organization_id: organizationId,
        p_branch_id: branchId,
        p_product_id: item.product_id,
        p_qty: item.quantity,
        p_source: source,
        p_source_id: String(saleId),
        p_unit_cost: item.unit_price ?? null,
        p_updated_by: updatedBy ?? null,
      });

      if (rpcError) {
        console.warn(`[stockMovementService] Error descontando stock producto ${item.product_id}:`, rpcError.message);
        errors.push(`Producto ${item.product_id}: ${rpcError.message}`);
      }
    }

    return resultado(saltados, errors);
  },

  /**
   * Reserva stock para un documento (pedido web del panel, oportunidad de CRM)
   * con `fn_stock_reservar`: el servidor expande la receta, bloquea las filas y
   * registra lo reservado en `stock_reservations`. Reservar dos veces el mismo
   * documento no duplica. Como antes, reserva aunque no haya disponible (P5).
   */
  async reserveStock(
    organizationId: number,
    branchId: number,
    orderId: string | number,
    items: SaleItemForStock[],
    _updatedBy?: string
  ): Promise<StockDecrementResult> {
    void _updatedBy; // el servidor registra auth.uid() en stock_reservations.created_by
    const { validos, saltados } = clasificar(items);
    if (validos.length === 0) return resultado(saltados, []);

    const { data, error } = await supabase.rpc('fn_stock_reservar', {
      p_org: organizationId,
      p_branch: branchId,
      p_ref_id: String(orderId),
      p_items: validos.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    });
    const r = data as ResultadoReserva | null;
    if (error) return resultado(saltados, [`Reserva ${orderId}: ${error.message}`]);
    if (!r?.ok) return resultado(saltados, [`Reserva ${orderId}: no se pudo reservar`]);
    return resultado(saltados, []);
  },

  /**
   * Libera la reserva de un documento con `fn_stock_liberar_reserva`: devuelve
   * exactamente lo que se reservó. Los ítems solo se usan para reservas hechas
   * antes del registro (se liberan como antes, expandiendo la receta).
   */
  async releaseStockReservation(
    branchId: number,
    orderId: string | number,
    items: SaleItemForStock[]
  ): Promise<StockDecrementResult> {
    const { validos, saltados } = clasificar(items);
    const { data, error } = await supabase.rpc('fn_stock_liberar_reserva', {
      p_branch: branchId,
      p_ref_id: String(orderId),
      p_items: validos.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    });
    const r = data as ResultadoLiberacion | null;
    if (error) return resultado(saltados, [`Liberar reserva ${orderId}: ${error.message}`]);
    if (r && r.ok === false) return resultado(saltados, [`Liberar reserva ${orderId}: ${r.error ?? 'error'}`]);
    return resultado(saltados, []);
  },

  /**
   * Entrada de mercancía por factura de compra con `fn_kardex_entrada_compra`:
   * una sola transacción, bloqueo, promedio ponderado y costo con vigencia en
   * `product_costs`. La recepción de una OC NO pasa por aquí: es
   * `fn_oc_recepcionar` (B8), con lotes, seriales y estado de la orden.
   *
   * `folio_item_reversal` (borrar un consumo del folio del PMS) entra por
   * `fn_inv_reversion_entrada` al costo con que salió. B9 lo moverá al PMS.
   *
   * @param source - 'purchase_invoice' | 'purchase' | 'folio_item_reversal'
   */
  async incrementOnPurchase(
    organizationId: number,
    branchId: number,
    orderId: string | number,
    items: SaleItemForStock[],
    source: string = 'purchase_invoice',
    updatedBy?: string
  ): Promise<StockDecrementResult> {
    const { validos, saltados } = clasificar(items);
    if (validos.length === 0) return resultado(saltados, []);

    if (source === 'folio_item_reversal') {
      const { data, error } = await supabase.rpc('fn_inv_reversion_entrada', {
        p_org: organizationId,
        p_branch: branchId,
        p_source: source,
        p_source_id: String(orderId),
        p_lineas: validos.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      });
      if (error) return resultado(saltados, [`Reversión ${orderId}: ${error.message}`]);
      const r = data as Pick<ResultadoEntradaCompra, 'saltadas'> | null;
      return resultado([...saltados, ...saltadosDelServidor(r?.saltadas)], []);
    }

    if (!ORIGENES_COMPRA.has(source)) {
      return resultado(saltados, [`Origen no admitido para una entrada de compra: ${source}`]);
    }

    const lineas: LineaEntradaCompra[] = validos.map((i) => ({
      product_id: i.product_id,
      qty: i.quantity,
      unit_cost: Number(i.unit_price) || 0,
    }));
    const { data, error } = await supabase.rpc('fn_kardex_entrada_compra', {
      p_org: organizationId,
      p_branch: branchId,
      p_source: source,
      p_source_id: String(orderId),
      p_lineas: lineas,
      p_user: updatedBy ?? null,
      p_supplier_id: null,
      p_idempotente: false,
    });
    if (error) return resultado(saltados, [`Entrada ${orderId}: ${error.message}`]);
    const r = data as ResultadoEntradaCompra | null;
    return resultado([...saltados, ...saltadosDelServidor(r?.saltadas)], []);
  },
};
