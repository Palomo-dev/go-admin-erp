import { supabase } from '@/lib/supabase/config';
import { recipeService } from './recipeService';

export interface CompositeStockValidation {
  ok: boolean;
  message?: string;
  insufficientItems?: {
    productName: string;
    needed: number;
    available: number;
    unitCode: string;
  }[];
}

/**
 * Valida que haya stock suficiente de los ingredientes de productos compuestos
 * antes de completar una venta.
 *
 * @param items - Items del carrito con product_id y quantity
 * @param branchId - ID de la sucursal donde se realiza la venta
 * @returns Resultado de la validación con detalles de items insuficientes
 */
export async function validateCompositeStock(
  items: { product_id?: number; quantity: number }[],
  branchId: number
): Promise<CompositeStockValidation> {
  const insufficientItems: NonNullable<CompositeStockValidation['insufficientItems']> = [];

  for (const item of items) {
    if (!item.product_id) continue;

    const recipe = await recipeService.getRecipeByProductId(item.product_id);
    if (!recipe?.ingredients) continue;

    for (const ing of recipe.ingredients) {
      if (!ing.ingredient_product?.track_stock) continue;

      const needed = ing.quantity * item.quantity;

      const { data: stock } = await supabase
        .from('stock_levels')
        .select('qty_on_hand')
        .eq('product_id', ing.ingredient_product_id)
        .eq('branch_id', branchId)
        .maybeSingle();

      const available = stock?.qty_on_hand ?? 0;

      if (available < needed) {
        insufficientItems.push({
          productName: ing.ingredient_product.name,
          needed,
          available,
          unitCode: ing.unit_code,
        });
      }
    }
  }

  if (insufficientItems.length > 0) {
    const message = insufficientItems
      .map(
        (i) =>
          `"${i.productName}": necesitas ${i.needed}${i.unitCode}, disponible ${i.available}${i.unitCode}`
      )
      .join('; ');

    return {
      ok: false,
      message: `Stock insuficiente de ingredientes: ${message}`,
      insufficientItems,
    };
  }

  return { ok: true };
}
