import { supabase } from '@/lib/supabase/config';

export interface SaleItemForStock {
  product_id: number | null;
  quantity: number;
  unit_price?: number;
}

/**
 * Motivo por el que un item no llego a afectar el inventario.
 * Antes estos casos solo incrementaban un contador `skipped` que nadie leia, asi
 * que una recepcion podia "funcionar" sin mover una sola unidad de stock y el
 * usuario no tenia forma de enterarse.
 */
export type StockSkipReason =
  | 'no_product'
  | 'invalid_qty'
  | 'product_not_found'
  | 'not_tracked';

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
 * Servicio reutilizable para descontar stock al realizar ventas.
 * Maneja la lógica de llamar a la RPC decrement_stock_with_recipe por cada item.
 */
export const stockMovementService = {
  /**
   * Descuenta stock por cada item de una venta.
   * Usa el RPC decrement_stock_with_recipe que:
   * - Si el producto tiene receta activa → descuenta cada ingrediente
   * - Si no tiene receta → comporta como decrement_stock_on_sale (backward compatible)
   * Omite items sin product_id o cantidad <= 0.
   *
   * @param organizationId - ID de la organización
   * @param branchId - ID de la sucursal
   * @param saleId - ID de la venta (para source_id)
   * @param items - Items de la venta
   * @param source - Origen del movimiento ('sale', 'web_sale', 'mesa_sale', 'invoice_sale')
   * @param updatedBy - UUID del usuario (opcional)
   */
  async decrementOnSale(
    organizationId: number,
    branchId: number,
    saleId: string | number,
    items: SaleItemForStock[],
    source: string = 'sale',
    updatedBy?: string
  ): Promise<StockDecrementResult> {
    const errors: string[] = [];
    const skippedItems: StockSkippedItem[] = [];

    for (const item of items) {
      // Saltar items sin product_id (ej: propinas, cargos personalizados)
      if (!item.product_id) {
        skippedItems.push({ productId: null, reason: 'no_product' });
        continue;
      }

      const qty = Number(item.quantity) || 0;
      if (qty <= 0) {
        skippedItems.push({ productId: item.product_id, reason: 'invalid_qty' });
        continue;
      }

      const { error: rpcError } = await supabase.rpc('decrement_stock_with_recipe', {
        p_organization_id: organizationId,
        p_branch_id: branchId,
        p_product_id: item.product_id,
        p_qty: qty,
        p_source: source,
        p_source_id: String(saleId),
        p_unit_cost: item.unit_price ?? null,
        p_updated_by: updatedBy ?? null,
      });

      if (rpcError) {
        console.warn(
          `[stockMovementService] Error descontando stock producto ${item.product_id}:`,
          rpcError.message
        );
        errors.push(`Producto ${item.product_id}: ${rpcError.message}`);
      }
    }

    return {
      success: errors.length === 0,
      skipped: skippedItems.length,
      skippedItems,
      errors,
    };
  },

  /**
   * Reserva stock al crear un pedido web.
   * Incrementa qty_reserved en stock_levels.
   */
  async reserveStock(
    organizationId: number,
    branchId: number,
    orderId: string | number,
    items: SaleItemForStock[],
    updatedBy?: string
  ): Promise<StockDecrementResult> {
    const errors: string[] = [];
    const skippedItems: StockSkippedItem[] = [];

    for (const item of items) {
      if (!item.product_id) {
        skippedItems.push({ productId: null, reason: 'no_product' });
        continue;
      }

      const qty = Number(item.quantity) || 0;
      if (qty <= 0) {
        skippedItems.push({ productId: item.product_id, reason: 'invalid_qty' });
        continue;
      }

      // Verificar track_stock del producto
      const { data: product } = await supabase
        .from('products')
        .select('track_stock, name')
        .eq('id', item.product_id)
        .maybeSingle();

      if (!product) {
        skippedItems.push({ productId: item.product_id, reason: 'product_not_found' });
        continue;
      }

      if (product.track_stock === false) {
        skippedItems.push({ productId: item.product_id, productName: product.name, reason: 'not_tracked' });
        continue;
      }

      // Incrementar qty_reserved
      const { data: existing } = await supabase
        .from('stock_levels')
        .select('id, qty_reserved')
        .eq('product_id', item.product_id)
        .eq('branch_id', branchId)
        .is('lot_id', null)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('stock_levels')
          .update({
            qty_reserved: (Number(existing.qty_reserved) || 0) + qty,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) errors.push(`Producto ${item.product_id}: ${error.message}`);
      } else {
        const { error } = await supabase
          .from('stock_levels')
          .insert({
            product_id: item.product_id,
            branch_id: branchId,
            lot_id: null,
            qty_on_hand: 0,
            qty_reserved: qty,
            avg_cost: 0,
            min_level: 0,
          });

        if (error) errors.push(`Producto ${item.product_id}: ${error.message}`);
      }
    }

    return { success: errors.length === 0, skipped: skippedItems.length, skippedItems, errors };
  },

  /**
   * Libera la reserva de stock al cancelar un pedido web.
   */
  async releaseStockReservation(
    branchId: number,
    orderId: string | number,
    items: SaleItemForStock[]
  ): Promise<StockDecrementResult> {
    const errors: string[] = [];
    const skippedItems: StockSkippedItem[] = [];

    for (const item of items) {
      if (!item.product_id) {
        skippedItems.push({ productId: null, reason: 'no_product' });
        continue;
      }

      const qty = Number(item.quantity) || 0;
      if (qty <= 0) {
        skippedItems.push({ productId: item.product_id, reason: 'invalid_qty' });
        continue;
      }

      const { data: existing } = await supabase
        .from('stock_levels')
        .select('id, qty_reserved')
        .eq('product_id', item.product_id)
        .eq('branch_id', branchId)
        .is('lot_id', null)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const newReserved = Math.max(0, (Number(existing.qty_reserved) || 0) - qty);
        const { error } = await supabase
          .from('stock_levels')
          .update({
            qty_reserved: newReserved,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) errors.push(`Producto ${item.product_id}: ${error.message}`);
      }
    }

    return { success: errors.length === 0, skipped: skippedItems.length, skippedItems, errors };
  },

  /**
   * Incrementa stock al recibir items de una orden de compra.
   * Suma a qty_on_hand y crea stock_movements con direction='in'.
   *
   * @param organizationId - ID de la organización
   * @param branchId - ID de la sucursal
   * @param orderId - ID de la orden de compra (para source_id)
   * @param items - Items recibidos con product_id, quantity (delta) y unit_cost
   * @param source - Origen ('purchase_order', 'purchase_invoice')
   * @param updatedBy - UUID del usuario (opcional)
   */
  async incrementOnPurchase(
    organizationId: number,
    branchId: number,
    orderId: string | number,
    items: SaleItemForStock[],
    source: string = 'purchase_order',
    updatedBy?: string
  ): Promise<StockDecrementResult> {
    const errors: string[] = [];
    const skippedItems: StockSkippedItem[] = [];

    for (const item of items) {
      if (!item.product_id) {
        skippedItems.push({ productId: null, reason: 'no_product' });
        continue;
      }

      const qty = Number(item.quantity) || 0;
      if (qty <= 0) {
        skippedItems.push({ productId: item.product_id, reason: 'invalid_qty' });
        continue;
      }

      // Verificar track_stock del producto
      const { data: product } = await supabase
        .from('products')
        .select('track_stock, name')
        .eq('id', item.product_id)
        .maybeSingle();

      if (!product) {
        skippedItems.push({ productId: item.product_id, reason: 'product_not_found' });
        continue;
      }

      if (product.track_stock === false) {
        skippedItems.push({ productId: item.product_id, productName: product.name, reason: 'not_tracked' });
        continue;
      }

      // Buscar stock_level existente
      const { data: existing } = await supabase
        .from('stock_levels')
        .select('id, qty_on_hand, avg_cost')
        .eq('product_id', item.product_id)
        .eq('branch_id', branchId)
        .is('lot_id', null)
        .limit(1)
        .maybeSingle();

      const unitCost = Number(item.unit_price) || 0;

      if (existing) {
        const currentQty = Number(existing.qty_on_hand) || 0;
        const currentAvgCost = Number(existing.avg_cost) || 0;
        // Recalcular costo promedio ponderado
        const newAvgCost = currentQty > 0
          ? (currentQty * currentAvgCost + qty * unitCost) / (currentQty + qty)
          : unitCost;

        const { error } = await supabase
          .from('stock_levels')
          .update({
            qty_on_hand: currentQty + qty,
            avg_cost: newAvgCost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) {
          errors.push(`Producto ${item.product_id}: ${error.message}`);
          continue;
        }
      } else {
        const { error } = await supabase
          .from('stock_levels')
          .insert({
            product_id: item.product_id,
            branch_id: branchId,
            lot_id: null,
            qty_on_hand: qty,
            qty_reserved: 0,
            avg_cost: unitCost,
            min_level: 0,
          });

        if (error) {
          errors.push(`Producto ${item.product_id}: ${error.message}`);
          continue;
        }
      }

      // Crear movimiento de stock
      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          product_id: item.product_id,
          lot_id: null,
          direction: 'in',
          qty: qty,
          unit_cost: unitCost,
          source: source,
          source_id: String(orderId),
          updated_by: updatedBy ?? null,
        });

      if (movementError) {
        errors.push(`Movimiento producto ${item.product_id}: ${movementError.message}`);
      }
    }

    return { success: errors.length === 0, skipped: skippedItems.length, skippedItems, errors };
  },
};
