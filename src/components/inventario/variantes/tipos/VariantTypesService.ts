import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { VariantType, VariantTypeFormData, VariantTypesStats } from './types';

export class VariantTypesService {
  static async obtenerTipos(): Promise<VariantType[]> {
    const organizationId = getOrganizationId();

    const { data, error } = await supabase
      .from('variant_types')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (error) throw error;

    // Obtener conteos de valores y productos
    const tiposConConteos = await Promise.all(
      (data || []).map(async (tipo) => {
        const { count: valuesCount } = await supabase
          .from('variant_values')
          .select('*', { count: 'exact', head: true })
          .eq('variant_type_id', tipo.id);

        const { count: productsCount } = await supabase
          .from('product_variant_relations')
          .select('*', { count: 'exact', head: true })
          .eq('variant_type_id', tipo.id);

        return {
          ...tipo,
          values_count: valuesCount || 0,
          products_count: productsCount || 0,
        };
      })
    );

    return tiposConConteos;
  }

  static async obtenerStats(): Promise<VariantTypesStats> {
    const tipos = await this.obtenerTipos();
    
    return {
      total: tipos.length,
      withValues: tipos.filter(t => (t.values_count || 0) > 0).length,
      inUse: tipos.filter(t => (t.products_count || 0) > 0).length,
    };
  }

  static async crearTipo(data: VariantTypeFormData): Promise<VariantType> {
    const organizationId = getOrganizationId();

    const { data: newTipo, error } = await supabase
      .from('variant_types')
      .insert({
        organization_id: organizationId,
        name: data.name,
      })
      .select()
      .single();

    if (error) throw error;
    return newTipo;
  }

  static async actualizarTipo(id: number, data: VariantTypeFormData): Promise<VariantType> {
    const { data: updated, error } = await supabase
      .from('variant_types')
      .update({ name: data.name })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  static async eliminarTipo(id: number): Promise<void> {
    // Verificar si tiene valores o productos asociados
    const { count: valuesCount } = await supabase
      .from('variant_values')
      .select('*', { count: 'exact', head: true })
      .eq('variant_type_id', id);

    if (valuesCount && valuesCount > 0) {
      throw new Error('No se puede eliminar un tipo que tiene valores asociados');
    }

    const { count: productsCount } = await supabase
      .from('product_variant_relations')
      .select('*', { count: 'exact', head: true })
      .eq('variant_type_id', id);

    if (productsCount && productsCount > 0) {
      throw new Error('No se puede eliminar un tipo que está en uso por productos');
    }

    const { error } = await supabase
      .from('variant_types')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async duplicarTipo(id: number): Promise<VariantType> {
    const organizationId = getOrganizationId();

    // Obtener el tipo original
    const { data: original, error: fetchError } = await supabase
      .from('variant_types')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Crear copia
    const { data: newTipo, error } = await supabase
      .from('variant_types')
      .insert({
        organization_id: organizationId,
        name: `${original.name} (copia)`,
      })
      .select()
      .single();

    if (error) throw error;
    return newTipo;
  }
}
