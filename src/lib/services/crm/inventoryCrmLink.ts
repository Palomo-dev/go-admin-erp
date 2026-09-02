import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/utils/orgId';
import { getCurrentBranchIdWithFallback } from '@/lib/hooks/useOrganization';
import {
  stockMovementService,
  type SaleItemForStock,
  type StockDecrementResult,
} from '@/lib/services/stockMovementService';

/**
 * FASE 3 Parte B - Vinculo CRM <-> Inventario
 *
 * Permite reservar stock comprometido para los productos de una oportunidad.
 * Usa stockMovementService.reserveStock que incrementa qty_reserved en stock_levels.
 *
 * NO modifica stockMovementService.ts. Usa el servicio existente.
 */

// ============== Tipos ==============

export interface OpportunityProductRow {
  id: string;
  opportunity_id: string;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface ReserveStockResult {
  opportunityId: string;
  itemCount: number;
  stockResult: StockDecrementResult;
}

// ============== Funciones ==============

/**
 * Reserva stock comprometido para los productos de una oportunidad CRM.
 *
 * Pasos:
 *  1. Lee opportunity_products
 *  2. Mapea a SaleItemForStock[]
 *  3. Llama a stockMovementService.reserveStock
 *
 * El stock reservado se libera automaticamente cuando:
 *  - Se convierte la oportunidad en venta (decrementOnSale + releaseStockReservation)
 *  - Se pierde la oportunidad (releaseStockReservation)
 *
 * @returns { opportunityId, itemCount, stockResult }
 */
async function reserveStockForOpportunity(
  opportunityId: string
): Promise<ReserveStockResult> {
  const orgId = getOrganizationId();
  if (!orgId) throw new Error('No se pudo obtener el organization_id');

  const branchId = getCurrentBranchIdWithFallback();

  // 1. Leer opportunity_products
  const { data: oppProducts, error: productsError } = await supabase
    .from('opportunity_products')
    .select('id, opportunity_id, product_id, quantity, unit_price, total_price')
    .eq('opportunity_id', opportunityId) as { data: OpportunityProductRow[] | null; error: unknown };

  if (productsError) throw productsError;
  if (!oppProducts || oppProducts.length === 0) {
    return {
      opportunityId,
      itemCount: 0,
      stockResult: {
        success: true,
        skipped: 0,
        skippedItems: [],
        errors: [],
      },
    };
  }

  // 2. Mapear a SaleItemForStock[]
  const stockItems: SaleItemForStock[] = oppProducts.map((p) => ({
    product_id: p.product_id,
    quantity: Number(p.quantity),
    unit_price: Number(p.unit_price),
  }));

  // 3. Reservar stock
  const stockResult = await stockMovementService.reserveStock(
    orgId,
    branchId,
    opportunityId,
    stockItems
  );

  if (stockResult.errors.length > 0) {
    console.warn(
      '[inventoryCrmLink] Algunos items no reservaron stock:',
      stockResult.errors
    );
  }

  return {
    opportunityId,
    itemCount: oppProducts.length,
    stockResult,
  };
}

/**
 * Libera el stock reservado para los productos de una oportunidad.
 * Util cuando la oportunidad se pierde o se cancela.
 */
async function releaseStockForOpportunity(
  opportunityId: string
): Promise<ReserveStockResult> {
  const branchId = getCurrentBranchIdWithFallback();

  // 1. Leer opportunity_products
  const { data: oppProducts, error: productsError } = await supabase
    .from('opportunity_products')
    .select('id, opportunity_id, product_id, quantity, unit_price, total_price')
    .eq('opportunity_id', opportunityId) as { data: OpportunityProductRow[] | null; error: unknown };

  if (productsError) throw productsError;
  if (!oppProducts || oppProducts.length === 0) {
    return {
      opportunityId,
      itemCount: 0,
      stockResult: {
        success: true,
        skipped: 0,
        skippedItems: [],
        errors: [],
      },
    };
  }

  // 2. Mapear a SaleItemForStock[]
  const stockItems: SaleItemForStock[] = oppProducts.map((p) => ({
    product_id: p.product_id,
    quantity: Number(p.quantity),
    unit_price: Number(p.unit_price),
  }));

  // 3. Liberar reserva
  const stockResult = await stockMovementService.releaseStockReservation(
    branchId,
    opportunityId,
    stockItems
  );

  return {
    opportunityId,
    itemCount: oppProducts.length,
    stockResult,
  };
}

// ============== Export ==============

export const inventoryCrmLink = {
  reserveStockForOpportunity,
  releaseStockForOpportunity,
};

export default inventoryCrmLink;
