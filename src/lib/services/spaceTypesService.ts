import { supabase } from '@/lib/supabase/config';

export interface SpaceCategory {
  code: string;
  display_name: string;
  icon: string | null;
  is_bookable: boolean;
  requires_checkin: boolean;
  sort_order: number;
}

export interface SpaceType {
  id: string;
  organization_id: number;
  category_code: string;
  name: string;
  short_name: string | null;
  base_rate: number;
  capacity: number;
  area_sqm: number | null;
  amenities: Record<string, any>;
  booking_rules: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: SpaceCategory;
  spaces_count?: number;
}

export interface CreateSpaceTypeData {
  organization_id: number;
  category_code: string;
  name: string;
  short_name?: string;
  base_rate: number;
  capacity?: number;
  area_sqm?: number;
  amenities?: Record<string, any>;
  booking_rules?: Record<string, any>;
  is_active?: boolean;
}

export interface UpdateSpaceTypeData {
  name?: string;
  short_name?: string;
  category_code?: string;
  base_rate?: number;
  capacity?: number;
  area_sqm?: number;
  amenities?: Record<string, any>;
  booking_rules?: Record<string, any>;
  is_active?: boolean;
}

class SpaceTypesService {
  /**
   * Obtener todos los tipos de espacio de una organización
   */
  async getSpaceTypes(organizationId: number): Promise<SpaceType[]> {
    try {
      const { data, error } = await supabase
        .from('space_types')
        .select(`
          *,
          category:space_categories(*)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Obtener conteo de espacios para cada tipo
      const typesWithCount = await Promise.all(
        (data || []).map(async (type) => {
          const { count } = await supabase
            .from('spaces')
            .select('id', { count: 'exact', head: true })
            .eq('space_type_id', type.id);

          return {
            ...type,
            spaces_count: count || 0,
          };
        })
      );

      return typesWithCount;
    } catch (error) {
      console.error('Error obteniendo tipos de espacio:', error);
      throw error;
    }
  }

  /**
   * Obtener un tipo de espacio por ID
   */
  async getSpaceType(id: string): Promise<SpaceType> {
    try {
      const { data, error } = await supabase
        .from('space_types')
        .select(`
          *,
          category:space_categories(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo tipo de espacio:', error);
      throw error;
    }
  }

  /**
   * Crear nuevo tipo de espacio
   */
  async createSpaceType(data: CreateSpaceTypeData): Promise<SpaceType> {
    try {
      const { data: newType, error } = await supabase
        .from('space_types')
        .insert({
          ...data,
          amenities: data.amenities || {},
          booking_rules: data.booking_rules || {},
        })
        .select(`
          *,
          category:space_categories(*)
        `)
        .single();

      if (error) throw error;
      return newType;
    } catch (error) {
      console.error('Error creando tipo de espacio:', error);
      throw error;
    }
  }

  /**
   * Actualizar tipo de espacio
   */
  async updateSpaceType(
    id: string,
    data: UpdateSpaceTypeData
  ): Promise<SpaceType> {
    try {
      const { data: updated, error } = await supabase
        .from('space_types')
        .update(data)
        .eq('id', id)
        .select(`
          *,
          category:space_categories(*)
        `)
        .single();

      if (error) throw error;
      return updated;
    } catch (error) {
      console.error('Error actualizando tipo de espacio:', error);
      throw error;
    }
  }

  /**
   * Eliminar tipo de espacio
   */
  async deleteSpaceType(id: string): Promise<void> {
    try {
      // Verificar si tiene espacios asociados
      const { count } = await supabase
        .from('spaces')
        .select('id', { count: 'exact', head: true })
        .eq('space_type_id', id);

      if (count && count > 0) {
        throw new Error(
          `No se puede eliminar el tipo de espacio porque tiene ${count} espacios asociados`
        );
      }

      const { error } = await supabase
        .from('space_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error eliminando tipo de espacio:', error);
      throw error;
    }
  }

  /**
   * Obtener todas las categorías de espacio
   */
  async getSpaceCategories(): Promise<SpaceCategory[]> {
    try {
      const { data, error } = await supabase
        .from('space_categories')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo categorías:', error);
      throw error;
    }
  }

  /**
   * Alternar estado activo/inactivo
   */
  async toggleActive(id: string, isActive: boolean): Promise<void> {
    try {
      const { error } = await supabase
        .from('space_types')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando estado:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de tipos de espacio
   */
  async getStats(organizationId: number) {
    try {
      const types = await this.getSpaceTypes(organizationId);

      return {
        total: types.length,
        active: types.filter((t) => t.is_active).length,
        inactive: types.filter((t) => !t.is_active).length,
        totalSpaces: types.reduce((sum, t) => sum + (t.spaces_count || 0), 0),
        avgRate:
          types.reduce((sum, t) => sum + Number(t.base_rate), 0) /
          (types.length || 1),
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }
}

export default new SpaceTypesService();
