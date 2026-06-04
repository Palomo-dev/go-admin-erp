import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { VariantType, VariantTypeFormData, VariantTypesStats } from './types';

/**
 * Servicio que lee tipos de variante directamente desde products.variant_data.
 * Los "tipos" son las keys del JSON (ej: "Color", "Talla").
 * Los conteos se derivan de los productos reales.
 */
export class VariantTypesService {
  /**
   * Obtiene todos los tipos de variante (keys únicas) desde variant_data de productos.
   */
  static async obtenerTipos(): Promise<VariantType[]> {
    const organizationId = getOrganizationId();

    // Obtener todos los productos hijos que tengan variant_data
    const { data: products, error } = await supabase
      .from('products')
      .select('id, variant_data')
      .eq('organization_id', organizationId)
      .not('variant_data', 'is', null)
      .not('parent_product_id', 'is', null);

    if (error) throw error;

    // Extraer keys únicas y contar valores/productos por cada tipo
    const typeMap: Record<string, { values: Set<string>; products: Set<number> }> = {};

    (products || []).forEach((product) => {
      if (!product.variant_data || typeof product.variant_data !== 'object') return;
      Object.entries(product.variant_data).forEach(([key, val]) => {
        if (!key.trim()) return;
        const normalizedKey = key.trim();
        if (!typeMap[normalizedKey]) {
          typeMap[normalizedKey] = { values: new Set(), products: new Set() };
        }
        if (val && String(val).trim()) {
          typeMap[normalizedKey].values.add(String(val).trim());
        }
        typeMap[normalizedKey].products.add(product.id);
      });
    });

    // Convertir a array ordenado
    const tipos: VariantType[] = Object.entries(typeMap)
      .map(([name, data], index) => ({
        id: index + 1,
        organization_id: organizationId,
        name,
        created_at: '',
        values_count: data.values.size,
        products_count: data.products.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return tipos;
  }

  static async obtenerStats(): Promise<VariantTypesStats> {
    const tipos = await this.obtenerTipos();

    return {
      total: tipos.length,
      withValues: tipos.filter(t => (t.values_count || 0) > 0).length,
      inUse: tipos.filter(t => (t.products_count || 0) > 0).length,
    };
  }

  /**
   * "Crear tipo" = renombrar una key en variant_data de todos los productos
   * que la usen. Pero como es un tipo nuevo, simplemente se registra para futuro uso.
   * Se guarda en variant_types como catálogo para sugerencias.
   */
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

  /**
   * Renombrar un tipo = renombrar la key en variant_data de todos los productos afectados.
   */
  static async actualizarTipo(id: number, data: VariantTypeFormData): Promise<VariantType> {
    const organizationId = getOrganizationId();

    // Obtener el nombre original del tipo (usando el id como índice en la lista)
    const tipos = await this.obtenerTipos();
    const tipoOriginal = tipos.find(t => t.id === id);
    if (!tipoOriginal) throw new Error('Tipo no encontrado');

    const oldName = tipoOriginal.name;
    const newName = data.name.trim();

    if (oldName === newName) return tipoOriginal;

    // Actualizar variant_data en todos los productos que tengan esta key
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, variant_data')
      .eq('organization_id', organizationId)
      .not('variant_data', 'is', null)
      .not('parent_product_id', 'is', null);

    if (fetchError) throw fetchError;

    for (const product of (products || [])) {
      if (!product.variant_data || !product.variant_data[oldName]) continue;

      const newVariantData = { ...product.variant_data };
      newVariantData[newName] = newVariantData[oldName];
      delete newVariantData[oldName];

      await supabase
        .from('products')
        .update({ variant_data: newVariantData })
        .eq('id', product.id);
    }

    // También actualizar en variant_types si existe
    await supabase
      .from('variant_types')
      .update({ name: newName })
      .eq('organization_id', organizationId)
      .eq('name', oldName);

    return { ...tipoOriginal, name: newName };
  }

  /**
   * Eliminar tipo = eliminar la key de variant_data en todos los productos.
   */
  static async eliminarTipo(id: number): Promise<void> {
    const organizationId = getOrganizationId();

    const tipos = await this.obtenerTipos();
    const tipo = tipos.find(t => t.id === id);
    if (!tipo) throw new Error('Tipo no encontrado');

    if ((tipo.products_count || 0) > 0) {
      throw new Error(`No se puede eliminar "${tipo.name}" porque está en uso por ${tipo.products_count} variantes. Primero edita esas variantes.`);
    }

    // También eliminar del catálogo si existe
    await supabase
      .from('variant_types')
      .delete()
      .eq('organization_id', organizationId)
      .eq('name', tipo.name);
  }

  /**
   * Duplicar tipo no tiene sentido real con variant_data, pero se crea en el catálogo.
   */
  static async duplicarTipo(id: number): Promise<VariantType> {
    const tipos = await this.obtenerTipos();
    const tipo = tipos.find(t => t.id === id);
    if (!tipo) throw new Error('Tipo no encontrado');

    return this.crearTipo({ name: `${tipo.name} (copia)` });
  }
}
