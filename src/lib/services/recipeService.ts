import { supabase } from '@/lib/supabase/config';

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  ingredient_product_id: number;
  quantity: number;
  unit_code: string;
  is_optional: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  ingredient_product?: {
    id: number;
    name: string;
    sku: string;
    track_stock: boolean;
    unit_code: string | null;
  };
}

export interface ProductRecipe {
  id: number;
  organization_id: number;
  product_id: number;
  name: string | null;
  yield_qty: number;
  yield_unit_code: string | null;
  is_active: boolean;
  version: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ingredients?: RecipeIngredient[];
  product?: {
    id: number;
    name: string;
    sku: string;
    is_composite: boolean;
    production_type: string;
  };
}

export interface CreateRecipeData {
  organization_id: number;
  product_id: number;
  name?: string;
  yield_qty?: number;
  yield_unit_code?: string;
  notes?: string;
  ingredients: {
    ingredient_product_id: number;
    quantity: number;
    unit_code: string;
    is_optional?: boolean;
    notes?: string;
    sort_order?: number;
  }[];
}

export interface UpdateRecipeData {
  name?: string;
  yield_qty?: number;
  yield_unit_code?: string;
  notes?: string;
  is_active?: boolean;
  ingredients?: {
    ingredient_product_id: number;
    quantity: number;
    unit_code: string;
    is_optional?: boolean;
    notes?: string;
    sort_order?: number;
  }[];
}

class RecipeService {
  async getRecipes(organizationId: number): Promise<ProductRecipe[]> {
    try {
      const { data, error } = await supabase
        .from('product_recipes')
        .select(`
          *,
          product:products (
            id, name, sku, is_composite, production_type
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ProductRecipe[];
    } catch (error) {
      console.error('Error obteniendo recetas:', error);
      throw error;
    }
  }

  async getRecipeById(recipeId: number): Promise<ProductRecipe | null> {
    try {
      const { data, error } = await supabase
        .from('product_recipes')
        .select(`
          *,
          product:products (
            id, name, sku, is_composite, production_type
          )
        `)
        .eq('id', recipeId)
        .single();

      if (error) throw error;

      if (!data) return null;

      const { data: ingredients, error: ingError } = await supabase
        .from('recipe_ingredients')
        .select(`
          *,
          ingredient_product:products (
            id, name, sku, track_stock, unit_code
          )
        `)
        .eq('recipe_id', recipeId)
        .order('sort_order', { ascending: true });

      if (ingError) throw ingError;

      return { ...data, ingredients: ingredients || [] } as ProductRecipe;
    } catch (error) {
      console.error('Error obteniendo receta:', error);
      throw error;
    }
  }

  async getRecipeByProductId(productId: number): Promise<ProductRecipe | null> {
    try {
      const { data: recipe, error: recipeError } = await supabase
        .from('product_recipes')
        .select(`
          *,
          product:products (
            id, name, sku, is_composite, production_type
          )
        `)
        .eq('product_id', productId)
        .eq('is_active', true)
        .maybeSingle();

      if (recipeError) throw recipeError;
      if (!recipe) return null;

      const { data: ingredients, error: ingError } = await supabase
        .from('recipe_ingredients')
        .select(`
          *,
          ingredient_product:products (
            id, name, sku, track_stock, unit_code
          )
        `)
        .eq('recipe_id', recipe.id)
        .order('sort_order', { ascending: true });

      if (ingError) throw ingError;

      return { ...recipe, ingredients: ingredients || [] } as ProductRecipe;
    } catch (error) {
      console.error('Error obteniendo receta por producto:', error);
      throw error;
    }
  }

  async createRecipe(data: CreateRecipeData): Promise<ProductRecipe> {
    try {
      // Desactivar receta activa anterior si existe
      await supabase
        .from('product_recipes')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('product_id', data.product_id)
        .eq('is_active', true);

      // Crear la receta
      const { data: recipe, error: recipeError } = await supabase
        .from('product_recipes')
        .insert({
          organization_id: data.organization_id,
          product_id: data.product_id,
          name: data.name,
          yield_qty: data.yield_qty ?? 1,
          yield_unit_code: data.yield_unit_code,
          is_active: true,
          version: 1,
          notes: data.notes,
        })
        .select()
        .single();

      if (recipeError) throw recipeError;

      // Insertar ingredientes
      if (data.ingredients.length > 0) {
        const ingredientsToInsert = data.ingredients.map((ing, index) => ({
          recipe_id: recipe.id,
          ingredient_product_id: ing.ingredient_product_id,
          quantity: ing.quantity,
          unit_code: ing.unit_code,
          is_optional: ing.is_optional ?? false,
          notes: ing.notes ?? null,
          sort_order: ing.sort_order ?? index,
        }));

        const { error: ingError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientsToInsert);

        if (ingError) throw ingError;
      }

      // Marcar producto como composite
      await supabase
        .from('products')
        .update({
          is_composite: true,
          production_type: 'composite',
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.product_id);

      return await this.getRecipeById(recipe.id) as ProductRecipe;
    } catch (error) {
      console.error('Error creando receta:', error);
      throw error;
    }
  }

  async updateRecipe(recipeId: number, data: UpdateRecipeData): Promise<ProductRecipe> {
    try {
      // Actualizar la receta
      const { error: recipeError } = await supabase
        .from('product_recipes')
        .update({
          name: data.name,
          yield_qty: data.yield_qty,
          yield_unit_code: data.yield_unit_code,
          notes: data.notes,
          is_active: data.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recipeId);

      if (recipeError) throw recipeError;

      // Si se enviaron ingredientes, reemplazar todos
      if (data.ingredients) {
        // Eliminar ingredientes anteriores
        const { error: deleteError } = await supabase
          .from('recipe_ingredients')
          .delete()
          .eq('recipe_id', recipeId);

        if (deleteError) throw deleteError;

        // Insertar nuevos
        if (data.ingredients.length > 0) {
          const ingredientsToInsert = data.ingredients.map((ing, index) => ({
            recipe_id: recipeId,
            ingredient_product_id: ing.ingredient_product_id,
            quantity: ing.quantity,
            unit_code: ing.unit_code,
            is_optional: ing.is_optional ?? false,
            notes: ing.notes ?? null,
            sort_order: ing.sort_order ?? index,
          }));

          const { error: ingError } = await supabase
            .from('recipe_ingredients')
            .insert(ingredientsToInsert);

          if (ingError) throw ingError;
        }
      }

      return await this.getRecipeById(recipeId) as ProductRecipe;
    } catch (error) {
      console.error('Error actualizando receta:', error);
      throw error;
    }
  }

  async deleteRecipe(recipeId: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('product_recipes')
        .delete()
        .eq('id', recipeId);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando receta:', error);
      throw error;
    }
  }

  async deactivateRecipe(recipeId: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('product_recipes')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', recipeId);

      if (error) throw error;
    } catch (error) {
      console.error('Error desactivando receta:', error);
      throw error;
    }
  }
}

export const recipeService = new RecipeService();
