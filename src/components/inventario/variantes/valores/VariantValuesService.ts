import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { VariantValue, VariantValueFormData, VariantValuesStats } from './types';

export class VariantValuesService {
  static async obtenerValores(tipoId?: number): Promise<VariantValue[]> {
    const organizationId = getOrganizationId();

    let query = supabase
      .from('variant_values')
      .select(`
        *,
        variant_types!inner (
          id,
          name,
          organization_id
        )
      `)
      .eq('variant_types.organization_id', organizationId)
      .order('variant_type_id')
      .order('display_order', { ascending: true });

    if (tipoId) {
      query = query.eq('variant_type_id', tipoId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Obtener conteos de productos
    const valoresConConteos = await Promise.all(
      (data || []).map(async (valor) => {
        const { count: productsCount } = await supabase
          .from('product_variant_relations')
          .select('*', { count: 'exact', head: true })
          .eq('variant_value_id', valor.id);

        return {
          ...valor,
          variant_type: valor.variant_types,
          products_count: productsCount || 0,
        };
      })
    );

    return valoresConConteos;
  }

  static async obtenerTipos(): Promise<{ id: number; name: string }[]> {
    const organizationId = getOrganizationId();

    const { data, error } = await supabase
      .from('variant_types')
      .select('id, name')
      .eq('organization_id', organizationId)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  static async obtenerStats(): Promise<VariantValuesStats> {
    const valores = await this.obtenerValores();
    const tipos = await this.obtenerTipos();

    const byType = tipos.map(tipo => ({
      type_id: tipo.id,
      type_name: tipo.name,
      count: valores.filter(v => v.variant_type_id === tipo.id).length,
    }));

    return {
      total: valores.length,
      byType,
      inUse: valores.filter(v => (v.products_count || 0) > 0).length,
    };
  }

  static async crearValor(data: VariantValueFormData): Promise<VariantValue> {
    // Obtener el mayor display_order actual para este tipo
    const { data: maxOrder } = await supabase
      .from('variant_values')
      .select('display_order')
      .eq('variant_type_id', data.variant_type_id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const newOrder = (maxOrder?.display_order || 0) + 1;

    const { data: newValor, error } = await supabase
      .from('variant_values')
      .insert({
        variant_type_id: data.variant_type_id,
        value: data.value,
        display_order: data.display_order || newOrder,
      })
      .select()
      .single();

    if (error) throw error;
    return newValor;
  }

  static async actualizarValor(id: number, data: Partial<VariantValueFormData>): Promise<VariantValue> {
    const { data: updated, error } = await supabase
      .from('variant_values')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  static async eliminarValor(id: number): Promise<void> {
    // Verificar si está en uso
    const { count } = await supabase
      .from('product_variant_relations')
      .select('*', { count: 'exact', head: true })
      .eq('variant_value_id', id);

    if (count && count > 0) {
      throw new Error('No se puede eliminar un valor que está en uso por productos');
    }

    const { error } = await supabase
      .from('variant_values')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async duplicarValor(id: number): Promise<VariantValue> {
    const { data: original, error: fetchError } = await supabase
      .from('variant_values')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Obtener el mayor display_order
    const { data: maxOrder } = await supabase
      .from('variant_values')
      .select('display_order')
      .eq('variant_type_id', original.variant_type_id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const { data: newValor, error } = await supabase
      .from('variant_values')
      .insert({
        variant_type_id: original.variant_type_id,
        value: `${original.value} (copia)`,
        display_order: (maxOrder?.display_order || 0) + 1,
      })
      .select()
      .single();

    if (error) throw error;
    return newValor;
  }

  static async reordenarValores(valores: { id: number; display_order: number }[]): Promise<void> {
    for (const valor of valores) {
      const { error } = await supabase
        .from('variant_values')
        .update({ display_order: valor.display_order })
        .eq('id', valor.id);

      if (error) throw error;
    }
  }
}
