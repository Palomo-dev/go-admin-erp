import { supabase } from '@/lib/supabase/config';

export interface SpaceCategory {
  code: string;
  display_name: string;
  icon?: string;
  settings?: {
    max_nights?: number;
    min_advance_hours?: number;
    housekeeping_required?: boolean;
    premium_service?: boolean;
    outdoor_experience?: boolean;
    eco_friendly?: boolean;
    self_contained?: boolean;
    pricing_policy?: {
      base_price?: number;
      weekend_multiplier?: number;
      season_multipliers?: Record<string, number>;
    };
    tax_policy?: {
      tax_ids?: string[];
      tax_included?: boolean;
    };
    [key: string]: any;
  };
  is_bookable: boolean;
  requires_checkin: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCategoryData {
  code: string;
  display_name: string;
  icon?: string;
  settings?: Record<string, any>;
  is_bookable?: boolean;
  requires_checkin?: boolean;
  sort_order?: number;
}

export interface UpdateCategoryData {
  display_name?: string;
  icon?: string;
  settings?: Record<string, any>;
  is_bookable?: boolean;
  requires_checkin?: boolean;
  sort_order?: number;
}

class SpaceCategoriesService {
  /**
   * Obtener todas las categorías de espacios
   */
  async getCategories(): Promise<SpaceCategory[]> {
    const { data, error } = await supabase
      .from('space_categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtener una categoría por código
   */
  async getCategoryByCode(code: string): Promise<SpaceCategory | null> {
    const { data, error } = await supabase
      .from('space_categories')
      .select('*')
      .eq('code', code)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data;
  }

  /**
   * Crear una nueva categoría
   */
  async createCategory(categoryData: CreateCategoryData): Promise<SpaceCategory> {
    const { data, error } = await supabase
      .from('space_categories')
      .insert([{
        code: categoryData.code,
        display_name: categoryData.display_name,
        icon: categoryData.icon || null,
        settings: categoryData.settings || {},
        is_bookable: categoryData.is_bookable ?? true,
        requires_checkin: categoryData.requires_checkin ?? true,
        sort_order: categoryData.sort_order ?? 0,
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Actualizar una categoría existente
   */
  async updateCategory(code: string, updateData: UpdateCategoryData): Promise<SpaceCategory> {
    const { data, error} = await supabase
      .from('space_categories')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('code', code)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Eliminar una categoría
   */
  async deleteCategory(code: string): Promise<void> {
    // Primero verificar si hay tipos de espacios que usan esta categoría
    const { data: typesData, error: typesError } = await supabase
      .from('space_types')
      .select('id')
      .eq('category_code', code)
      .limit(1);

    if (typesError) throw typesError;

    if (typesData && typesData.length > 0) {
      throw new Error('No se puede eliminar la categoría porque tiene tipos de espacios asociados');
    }

    const { error } = await supabase
      .from('space_categories')
      .delete()
      .eq('code', code);

    if (error) throw error;
  }

  /**
   * Actualizar orden de categorías
   */
  async updateCategoriesOrder(categories: { code: string; sort_order: number }[]): Promise<void> {
    const updates = categories.map(cat => 
      supabase
        .from('space_categories')
        .update({ sort_order: cat.sort_order })
        .eq('code', cat.code)
    );

    const results = await Promise.all(updates);
    
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      throw errors[0].error;
    }
  }

  /**
   * Obtener estadísticas de uso de categorías
   */
  async getCategoryStats(): Promise<Record<string, { total_types: number; total_spaces: number }>> {
    const { data, error } = await supabase
      .from('space_types')
      .select(`
        category_code,
        spaces (count)
      `);

    if (error) throw error;

    const stats: Record<string, { total_types: number; total_spaces: number }> = {};
    
    if (data) {
      data.forEach((type: any) => {
        const catCode = type.category_code;
        if (!stats[catCode]) {
          stats[catCode] = { total_types: 0, total_spaces: 0 };
        }
        stats[catCode].total_types++;
        stats[catCode].total_spaces += type.spaces?.[0]?.count || 0;
      });
    }

    return stats;
  }
}

export default new SpaceCategoriesService();
