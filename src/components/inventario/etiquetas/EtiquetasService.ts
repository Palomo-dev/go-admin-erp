import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { ProductTag } from './types';

export class EtiquetasService {
  
  static async obtenerEtiquetas(): Promise<ProductTag[]> {
    const organizationId = getOrganizationId();

    const { data, error } = await supabase
      .from('product_tags')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');

    if (error) {
      console.error('Error obteniendo etiquetas:', error);
      throw error;
    }

    // Obtener conteo de productos por etiqueta
    const etiquetasConConteo = await Promise.all(
      (data || []).map(async (tag) => {
        const { count } = await supabase
          .from('product_tag_relations')
          .select('*', { count: 'exact', head: true })
          .eq('tag_id', tag.id);
        
        return {
          ...tag,
          product_count: count || 0
        };
      })
    );

    return etiquetasConConteo;
  }

  static async obtenerEtiquetaPorId(id: number): Promise<ProductTag | null> {
    const { data, error } = await supabase
      .from('product_tags')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error obteniendo etiqueta:', error);
      throw error;
    }

    return data;
  }

  static async crearEtiqueta(datos: { name: string; color: string }): Promise<ProductTag> {
    const organizationId = getOrganizationId();

    const { data, error } = await supabase
      .from('product_tags')
      .insert({
        organization_id: organizationId,
        name: datos.name,
        color: datos.color
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando etiqueta:', error);
      throw error;
    }

    return data;
  }

  static async actualizarEtiqueta(id: number, datos: { name: string; color: string }): Promise<ProductTag> {
    const { data, error } = await supabase
      .from('product_tags')
      .update({
        name: datos.name,
        color: datos.color
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando etiqueta:', error);
      throw error;
    }

    return data;
  }

  static async eliminarEtiqueta(id: number): Promise<void> {
    // Primero eliminar relaciones
    await supabase
      .from('product_tag_relations')
      .delete()
      .eq('tag_id', id);

    const { error } = await supabase
      .from('product_tags')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando etiqueta:', error);
      throw error;
    }
  }

  static async duplicarEtiqueta(id: number): Promise<ProductTag> {
    const original = await this.obtenerEtiquetaPorId(id);
    if (!original) throw new Error('Etiqueta no encontrada');

    return this.crearEtiqueta({
      name: `${original.name} (copia)`,
      color: original.color
    });
  }
}
