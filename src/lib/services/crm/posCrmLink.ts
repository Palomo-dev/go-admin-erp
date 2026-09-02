import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/utils/orgId';
import {
  getCurrentBranchIdWithFallback,
  getCurrentUserId,
} from '@/lib/hooks/useOrganization';
import { stockMovementService, type SaleItemForStock } from '@/lib/services/stockMovementService';

/**
 * FASE 3 Parte B - Vinculo CRM <-> POS
 *
 * Permite:
 *  1. Vincular una venta POS existente a una oportunidad (linkSaleToOpportunity)
 *  2. Crear una venta POS directamente desde una oportunidad (createPosSaleFromOpportunity)
 *     leyendo opportunity_products y generando sales + sale_items con opportunity_id poblado.
 *
 * NO modifica posService.ts. Usa inserciones directas a `sales` / `sale_items`
 * respetando la misma estructura que usa el POS.
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

export interface OpportunityRow {
  id: string;
  organization_id: number;
  customer_id: string | null;
  branch_id?: number | null;
  title: string;
  amount: number;
  currency?: string | null;
  assigned_to?: string | null;
}

export interface CreatePosSaleFromOpportunityResult {
  saleId: string;
  opportunityId: string;
  itemCount: number;
  total: number;
}

// ============== Funciones ==============

/**
 * Vincula una venta POS existente a una oportunidad CRM.
 * Actualiza sales.opportunity_id.
 */
async function linkSaleToOpportunity(
  saleId: string,
  opportunityId: string
): Promise<void> {
  const { error } = await supabase
    .from('sales')
    .update({ opportunity_id: opportunityId })
    .eq('id', saleId);

  if (error) {
    console.error('[posCrmLink] Error vinculando venta a oportunidad:', error);
    throw error;
  }
}

/**
 * Crea una venta POS desde una oportunidad CRM.
 *
 * Pasos:
 *  1. Lee la oportunidad + opportunity_products
 *  2. Inserta en `sales` con opportunity_id poblado
 *  3. Inserta en `sale_items` las lineas desde opportunity_products
 *  4. Descuenta stock usando stockMovementService.decrementOnSale
 *
 * @returns { saleId, opportunityId, itemCount, total }
 */
async function createPosSaleFromOpportunity(
  opportunityId: string
): Promise<CreatePosSaleFromOpportunityResult> {
  const orgId = getOrganizationId();
  if (!orgId) throw new Error('No se pudo obtener el organization_id');

  const branchId = getCurrentBranchIdWithFallback();
  const userId = await getCurrentUserId();

  // 1. Leer la oportunidad
  const { data: opportunity, error: oppError } = await supabase
    .from('opportunities')
    .select('id, organization_id, customer_id, title, amount, currency, assigned_to')
    .eq('id', opportunityId)
    .maybeSingle() as { data: OpportunityRow | null; error: any };

  if (oppError) throw oppError;
  if (!opportunity) throw new Error('Oportunidad no encontrada');

  // 2. Leer opportunity_products
  const { data: oppProducts, error: productsError } = await supabase
    .from('opportunity_products')
    .select('id, opportunity_id, product_id, quantity, unit_price, total_price')
    .eq('opportunity_id', opportunityId) as { data: OpportunityProductRow[] | null; error: any };

  if (productsError) throw productsError;
  if (!oppProducts || oppProducts.length === 0) {
    throw new Error('La oportunidad no tiene productos asociados');
  }

  // 3. Calcular totales
  const subtotal = oppProducts.reduce(
    (sum, p) => sum + Number(p.total_price || p.quantity * p.unit_price),
    0
  );
  const total = subtotal;

  // 4. Insertar la venta
  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      customer_id: opportunity.customer_id,
      user_id: userId,
      subtotal,
      tax_total: 0,
      discount_total: 0,
      total,
      balance: total,
      status: 'pending',
      payment_status: 'pending',
      sale_date: new Date().toISOString(),
      opportunity_id: opportunityId,
    })
    .select()
    .single();

  if (saleError) {
    console.error('[posCrmLink] Error creando venta desde oportunidad:', saleError);
    throw saleError;
  }

  // 5. Insertar sale_items
  const saleItems = oppProducts.map((p) => ({
    sale_id: sale.id,
    product_id: p.product_id,
    quantity: Number(p.quantity),
    unit_price: Number(p.unit_price),
    total: Number(p.total_price || p.quantity * p.unit_price),
    tax_amount: 0,
    tax_rate: 0,
    discount_amount: 0,
    notes: { source: 'crm_opportunity', opportunity_id: opportunityId },
  }));

  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(saleItems);

  if (itemsError) {
    console.error('[posCrmLink] Error creando sale_items:', itemsError);
    throw itemsError;
  }

  // 6. Descontar stock
  try {
    const stockItems: SaleItemForStock[] = oppProducts.map((p) => ({
      product_id: p.product_id,
      quantity: Number(p.quantity),
      unit_price: Number(p.unit_price),
    }));

    const stockResult = await stockMovementService.decrementOnSale(
      orgId,
      branchId,
      sale.id,
      stockItems,
      'sale',
      userId || undefined
    );

    if (stockResult.errors.length > 0) {
      console.warn('[posCrmLink] Algunos items no descontaron stock:', stockResult.errors);
    }
  } catch (stockError) {
    console.warn('[posCrmLink] Error descontando stock (no bloquea la venta):', stockError);
  }

  return {
    saleId: sale.id,
    opportunityId,
    itemCount: oppProducts.length,
    total,
  };
}

// ============== Export ==============

export const posCrmLink = {
  linkSaleToOpportunity,
  createPosSaleFromOpportunity,
};

export default posCrmLink;
