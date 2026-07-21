import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export type ModifierSelectionMode = 'single' | 'multiple';

export interface ProductModifier {
  id: number;
  group_id: number;
  name: string;
  extra_price: number;
  is_active: boolean;
  display_order: number;
}

export interface ProductModifierGroup {
  id: number;
  organization_id: number;
  product_id: number;
  name: string;
  selection_mode: ModifierSelectionMode;
  min_selections: number;
  max_selections: number | null;
  required: boolean;
  display_order: number;
  product_modifiers?: ProductModifier[];
}

export interface ProductModifierGroupInput {
  product_id: number;
  name: string;
  selection_mode: ModifierSelectionMode;
  min_selections?: number;
  max_selections?: number | null;
  required?: boolean;
  display_order?: number;
}

export interface ProductModifierInput {
  group_id: number;
  name: string;
  extra_price?: number;
  is_active?: boolean;
  display_order?: number;
}

/**
 * CRUD de grupos de modificadores y sus opciones (ej. "Salsas" -> BBQ, Ajo, Ninguna).
 * A diferencia de las variantes (variant_types/variant_values), un modificador NO
 * cambia el product_id del sale_item: se guarda como dato adicional de la venta
 * (ver sale_items.notes.modifiers).
 */
export class ProductModifiersService {
  /**
   * Obtener todos los grupos de modificadores de un producto, con sus opciones.
   */
  static async getGroupsByProduct(productId: number): Promise<ProductModifierGroup[]> {
    const { data, error } = await supabase
      .from('product_modifier_groups')
      .select(`
        id,
        organization_id,
        product_id,
        name,
        selection_mode,
        min_selections,
        max_selections,
        required,
        display_order,
        product_modifiers (
          id,
          group_id,
          name,
          extra_price,
          is_active,
          display_order
        )
      `)
      .eq('product_id', productId)
      .order('display_order');

    if (error) throw error;

    return (data || []).map((group: any) => ({
      ...group,
      product_modifiers: (group.product_modifiers || [])
        .filter((m: ProductModifier) => m.is_active)
        .sort((a: ProductModifier, b: ProductModifier) => a.display_order - b.display_order),
    }));
  }

  /**
   * Obtener grupos de modificadores para varios productos a la vez (ej. grid de POS).
   * Devuelve un mapa product_id -> grupos, para saber qué productos tienen modificadores.
   */
  static async getGroupsByProductIds(productIds: number[]): Promise<Map<number, ProductModifierGroup[]>> {
    const map = new Map<number, ProductModifierGroup[]>();
    if (productIds.length === 0) return map;

    const { data, error } = await supabase
      .from('product_modifier_groups')
      .select(`
        id,
        organization_id,
        product_id,
        name,
        selection_mode,
        min_selections,
        max_selections,
        required,
        display_order,
        product_modifiers (
          id,
          group_id,
          name,
          extra_price,
          is_active,
          display_order
        )
      `)
      .in('product_id', productIds)
      .order('display_order');

    if (error) throw error;

    (data || []).forEach((group: any) => {
      const list = map.get(group.product_id) || [];
      list.push({
        ...group,
        product_modifiers: (group.product_modifiers || [])
          .filter((m: ProductModifier) => m.is_active)
          .sort((a: ProductModifier, b: ProductModifier) => a.display_order - b.display_order),
      });
      map.set(group.product_id, list);
    });

    return map;
  }

  /**
   * Obtener valores de variantes ya guardados en el catálogo de la organización
   * (ej. "Tomate", "Piña" en un tipo "Salsa"), para sugerirlos como opciones rápidas
   * al crear modificadores (ej. la salsa "Tomate" de las variantes también puede
   * ofrecerse como opción de un modificador "Salsas adicionales").
   */
  static async getVariantValueSuggestions(): Promise<string[]> {
    const organizationId = getOrganizationId();
    const { data, error } = await supabase
      .from('variant_values')
      .select('value, variant_types!inner(organization_id)')
      .eq('variant_types.organization_id', organizationId);

    if (error) throw error;

    const uniqueValues = Array.from(new Set((data || []).map((v: { value: string }) => v.value)));
    return uniqueValues.sort((a, b) => a.localeCompare(b));
  }

  /**
   * Obtener nombres únicos de grupos de modificadores ya usados en la organización
   * (ej. "Salsas", "Extras"), para sugerirlos como acceso rápido al crear un grupo nuevo.
   */
  static async getExistingGroupNames(): Promise<string[]> {
    const organizationId = getOrganizationId();
    const { data, error } = await supabase
      .from('product_modifier_groups')
      .select('name')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const uniqueNames = Array.from(new Set((data || []).map((g: { name: string }) => g.name)));
    return uniqueNames.sort((a, b) => a.localeCompare(b));
  }

  static async createGroup(input: ProductModifierGroupInput): Promise<ProductModifierGroup> {
    const organizationId = getOrganizationId();
    const { data, error } = await supabase
      .from('product_modifier_groups')
      .insert({
        organization_id: organizationId,
        product_id: input.product_id,
        name: input.name,
        selection_mode: input.selection_mode,
        min_selections: input.min_selections ?? 0,
        max_selections: input.max_selections ?? null,
        required: input.required ?? false,
        display_order: input.display_order ?? 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateGroup(groupId: number, input: Partial<ProductModifierGroupInput>): Promise<void> {
    const { error } = await supabase
      .from('product_modifier_groups')
      .update(input)
      .eq('id', groupId);

    if (error) throw error;
  }

  static async deleteGroup(groupId: number): Promise<void> {
    const { error } = await supabase
      .from('product_modifier_groups')
      .delete()
      .eq('id', groupId);

    if (error) throw error;
  }

  static async createModifier(input: ProductModifierInput): Promise<ProductModifier> {
    const { data, error } = await supabase
      .from('product_modifiers')
      .insert({
        group_id: input.group_id,
        name: input.name,
        extra_price: input.extra_price ?? 0,
        is_active: input.is_active ?? true,
        display_order: input.display_order ?? 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async updateModifier(modifierId: number, input: Partial<ProductModifierInput>): Promise<void> {
    const { error } = await supabase
      .from('product_modifiers')
      .update(input)
      .eq('id', modifierId);

    if (error) throw error;
  }

  static async deleteModifier(modifierId: number): Promise<void> {
    const { error } = await supabase
      .from('product_modifiers')
      .delete()
      .eq('id', modifierId);

    if (error) throw error;
  }
}
