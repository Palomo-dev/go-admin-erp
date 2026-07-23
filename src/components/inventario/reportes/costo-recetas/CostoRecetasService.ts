import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface RecetaCostoEntry {
  recipe_id: number;
  recipe_name: string;
  product_id: number;
  product_name: string;
  product_sku: string;
  yield_qty: number;
  yield_unit_code: string;
  is_active: boolean;
  ingredients: RecetaIngrediente[];
  total_cost: number;
  cost_per_unit: number;
}

export interface RecetaIngrediente {
  ingredient_product_id: number;
  ingredient_name: string;
  ingredient_sku: string;
  quantity: number;
  unit_code: string;
  avg_cost: number;
  line_cost: number;
}

export class CostoRecetasService {
  static async obtenerCostoRecetas(): Promise<RecetaCostoEntry[]> {
    const orgId = getOrganizationId();

    const { data: recetas, error: recetasError } = await supabase
      .from('product_recipes')
      .select(
        `
        id,
        name,
        product_id,
        yield_qty,
        yield_unit_code,
        is_active,
        products (
          id,
          name,
          sku
        ),
        recipe_ingredients (
          id,
          ingredient_product_id,
          quantity,
          unit_code,
          is_optional,
          ingredient_product:products (
            id,
            name,
            sku
          )
        )
      `
      )
      .eq('organization_id', orgId)
      .order('name', { ascending: true });

    if (recetasError) {
      console.error('Error obteniendo recetas:', recetasError);
      throw new Error(`Error: ${recetasError.message}`);
    }

    const productIds = new Set<number>();
    (recetas || []).forEach((r: any) => {
      r.recipe_ingredients?.forEach((ri: any) => {
        productIds.add(ri.ingredient_product_id);
      });
    });

    let costosMap: Record<number, number> = {};
    if (productIds.size > 0) {
      const { data: stockData } = await supabase
        .from('stock_levels')
        .select('product_id, avg_cost')
        .in('product_id', Array.from(productIds));

      if (stockData) {
        stockData.forEach((s: any) => {
          if (s.avg_cost && (!costosMap[s.product_id] || s.avg_cost > costosMap[s.product_id])) {
            costosMap[s.product_id] = s.avg_cost;
          }
        });
      }
    }

    return (recetas || []).map((receta: any) => {
      const ingredients: RecetaIngrediente[] = (receta.recipe_ingredients || []).map((ri: any) => {
        const avgCost = costosMap[ri.ingredient_product_id] || 0;
        return {
          ingredient_product_id: ri.ingredient_product_id,
          ingredient_name: ri.ingredient_product?.name || 'N/A',
          ingredient_sku: ri.ingredient_product?.sku || '',
          quantity: ri.quantity,
          unit_code: ri.unit_code,
          avg_cost: avgCost,
          line_cost: avgCost * ri.quantity,
        };
      });

      const totalCost = ingredients.reduce((sum, ing) => sum + ing.line_cost, 0);
      const yieldQty = receta.yield_qty || 1;

      return {
        recipe_id: receta.id,
        recipe_name: receta.name || receta.products?.name || 'Sin nombre',
        product_id: receta.product_id,
        product_name: receta.products?.name || 'N/A',
        product_sku: receta.products?.sku || '',
        yield_qty: yieldQty,
        yield_unit_code: receta.yield_unit_code || '',
        is_active: receta.is_active,
        ingredients,
        total_cost: totalCost,
        cost_per_unit: totalCost / yieldQty,
      };
    });
  }

  static async exportarCSV(data: RecetaCostoEntry[]): Promise<string> {
    const headers = [
      'Receta ID',
      'Receta',
      'Producto',
      'SKU',
      'Rendimiento',
      'Unidad',
      'Ingrediente',
      'SKU Ingrediente',
      'Cantidad',
      'Unidad Ingrediente',
      'Costo Unit.',
      'Costo Linea',
      'Costo Total Receta',
      'Costo por Unidad',
      'Activa',
    ];

    const rows: string[][] = [];
    data.forEach((r) => {
      if (r.ingredients.length === 0) {
        rows.push([
          String(r.recipe_id),
          r.recipe_name,
          r.product_name,
          r.product_sku,
          String(r.yield_qty),
          r.yield_unit_code,
          '',
          '',
          '',
          '',
          '',
          '',
          String(r.total_cost.toFixed(2)),
          String(r.cost_per_unit.toFixed(2)),
          r.is_active ? 'Si' : 'No',
        ]);
      } else {
        r.ingredients.forEach((ing) => {
          rows.push([
            String(r.recipe_id),
            r.recipe_name,
            r.product_name,
            r.product_sku,
            String(r.yield_qty),
            r.yield_unit_code,
            ing.ingredient_name,
            ing.ingredient_sku,
            String(ing.quantity),
            ing.unit_code,
            String(ing.avg_cost.toFixed(2)),
            String(ing.line_cost.toFixed(2)),
            String(r.total_cost.toFixed(2)),
            String(r.cost_per_unit.toFixed(2)),
            r.is_active ? 'Si' : 'No',
          ]);
        });
      }
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }
}
