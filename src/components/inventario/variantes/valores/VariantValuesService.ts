import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { VariantValue, VariantValueFormData, VariantValuesStats } from './types';

/**
 * Servicio que lee valores de variante directamente desde products.variant_data.
 * Los "valores" son los values del JSON agrupados por key (tipo).
 */
export class VariantValuesService {
  /**
   * Obtiene todos los valores de variante desde variant_data de productos.
   * @param tipoNombre - Filtrar por nombre de tipo (key del JSON). Si es un número, se busca el nombre del tipo.
   */
  static async obtenerValores(tipoNombre?: string | number): Promise<VariantValue[]> {
    const organizationId = getOrganizationId();

    // Obtener todos los productos hijos con variant_data
    const { data: products, error } = await supabase
      .from('products')
      .select('id, variant_data')
      .eq('organization_id', organizationId)
      .not('variant_data', 'is', null)
      .not('parent_product_id', 'is', null);

    if (error) throw error;

    // Si tipoNombre es un número, buscar el nombre real del tipo
    let filterTypeName: string | null = null;
    if (tipoNombre !== undefined) {
      if (typeof tipoNombre === 'number') {
        // Es un índice basado en el listado de tipos
        const tipos = await this.obtenerTipos();
        const tipo = tipos.find(t => t.id === tipoNombre);
        filterTypeName = tipo?.name || null;
      } else {
        filterTypeName = tipoNombre;
      }
    }

    // Agrupar: por cada (tipo, valor), contar productos
    const valueMap: Record<string, { typeName: string; value: string; products: Set<number> }> = {};

    (products || []).forEach((product) => {
      if (!product.variant_data || typeof product.variant_data !== 'object') return;
      Object.entries(product.variant_data).forEach(([key, val]) => {
        if (!key.trim() || !val || !String(val).trim()) return;
        const normalizedKey = key.trim();
        const normalizedVal = String(val).trim();

        // Filtrar por tipo si se especificó
        if (filterTypeName && normalizedKey !== filterTypeName) return;

        const mapKey = `${normalizedKey}::${normalizedVal}`;
        if (!valueMap[mapKey]) {
          valueMap[mapKey] = { typeName: normalizedKey, value: normalizedVal, products: new Set() };
        }
        valueMap[mapKey].products.add(product.id);
      });
    });

    // Convertir a array
    const valores: VariantValue[] = Object.values(valueMap)
      .map((data, index) => ({
        id: index + 1,
        variant_type_id: 0, // se establece abajo
        value: data.value,
        display_order: index + 1,
        created_at: '',
        variant_type: { id: 0, name: data.typeName },
        products_count: data.products.size,
      }))
      .sort((a, b) => {
        // Ordenar por tipo y luego por valor
        const typeCompare = (a.variant_type?.name || '').localeCompare(b.variant_type?.name || '');
        if (typeCompare !== 0) return typeCompare;
        return a.value.localeCompare(b.value);
      });

    return valores;
  }

  /**
   * Obtiene los tipos únicos (keys del variant_data) para mostrar en filtros.
   */
  static async obtenerTipos(): Promise<{ id: number; name: string }[]> {
    const organizationId = getOrganizationId();

    const { data: products, error } = await supabase
      .from('products')
      .select('variant_data')
      .eq('organization_id', organizationId)
      .not('variant_data', 'is', null)
      .not('parent_product_id', 'is', null);

    if (error) throw error;

    const typeNames = new Set<string>();
    (products || []).forEach((product) => {
      if (!product.variant_data || typeof product.variant_data !== 'object') return;
      Object.keys(product.variant_data).forEach((key) => {
        if (key.trim()) typeNames.add(key.trim());
      });
    });

    return Array.from(typeNames)
      .sort()
      .map((name, index) => ({ id: index + 1, name }));
  }

  static async obtenerStats(): Promise<VariantValuesStats> {
    const valores = await this.obtenerValores();
    const tipos = await this.obtenerTipos();

    const byType = tipos.map(tipo => ({
      type_id: tipo.id,
      type_name: tipo.name,
      count: valores.filter(v => v.variant_type?.name === tipo.name).length,
    }));

    return {
      total: valores.length,
      byType,
      inUse: valores.filter(v => (v.products_count || 0) > 0).length,
    };
  }

  /**
   * Crear valor = agregar ese valor a variant_data de un producto (no aplica aquí,
   * se usa desde el formulario de variantes). Se guarda en variant_values como catálogo.
   */
  static async crearValor(data: VariantValueFormData): Promise<VariantValue> {
    const { data: newValor, error } = await supabase
      .from('variant_values')
      .insert({
        variant_type_id: data.variant_type_id,
        value: data.value,
        display_order: data.display_order || 1,
      })
      .select()
      .single();

    if (error) throw error;
    return newValor;
  }

  /**
   * Actualizar valor = renombrar ese valor en variant_data de todos los productos afectados.
   */
  static async actualizarValor(id: number, data: Partial<VariantValueFormData> & { oldValue?: string; typeName?: string }): Promise<VariantValue> {
    const organizationId = getOrganizationId();

    // Si tenemos oldValue y typeName, actualizar variant_data en productos
    if (data.oldValue && data.typeName && data.value) {
      const { data: products } = await supabase
        .from('products')
        .select('id, variant_data')
        .eq('organization_id', organizationId)
        .not('variant_data', 'is', null)
        .not('parent_product_id', 'is', null);

      for (const product of (products || [])) {
        if (!product.variant_data || product.variant_data[data.typeName] !== data.oldValue) continue;

        const newVariantData = { ...product.variant_data, [data.typeName]: data.value };
        await supabase
          .from('products')
          .update({ variant_data: newVariantData })
          .eq('id', product.id);
      }
    }

    // Retornar un objeto simulado
    return {
      id,
      variant_type_id: 0,
      value: data.value || '',
      display_order: 0,
      created_at: '',
    };
  }

  /**
   * Eliminar valor = quitar ese valor de variant_data en los productos que lo tengan.
   */
  static async eliminarValor(id: number, typeName?: string, value?: string): Promise<void> {
    if (!typeName || !value) {
      throw new Error('Se requiere el tipo y valor para eliminar');
    }

    const organizationId = getOrganizationId();

    // Verificar cuántos productos usan este valor
    const { data: products } = await supabase
      .from('products')
      .select('id, variant_data')
      .eq('organization_id', organizationId)
      .not('variant_data', 'is', null)
      .not('parent_product_id', 'is', null);

    const affectedProducts = (products || []).filter(
      p => p.variant_data && p.variant_data[typeName] === value
    );

    if (affectedProducts.length > 0) {
      throw new Error(`No se puede eliminar "${value}" porque está en uso por ${affectedProducts.length} variantes.`);
    }
  }

  /**
   * Duplicar valor no tiene sentido real con variant_data.
   */
  static async duplicarValor(id: number): Promise<VariantValue> {
    return {
      id: Date.now(),
      variant_type_id: 0,
      value: '(copia)',
      display_order: 0,
      created_at: '',
    };
  }

  static async reordenarValores(valores: { id: number; display_order: number }[]): Promise<void> {
    // No aplica con variant_data
  }
}
