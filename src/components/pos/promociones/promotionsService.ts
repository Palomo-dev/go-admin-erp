import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { 
  Promotion, 
  PromotionRule,
  CreatePromotionData, 
  UpdatePromotionData,
  PromotionFilters,
  CreatePromotionRuleData
} from './types';

export class PromotionsService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org.id;
  }

  /**
   * Obtener todas las promociones
   */
  static async getAll(filters: PromotionFilters = {}): Promise<Promotion[]> {
    try {
      const organizationId = this.getOrganizationId();
      
      let query = supabase
        .from('promotions')
        .select(`
          *,
          promotion_rules (
            id,
            rule_type,
            product_id,
            category_id,
            created_at
          )
        `)
        .eq('organization_id', organizationId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.promotion_type) {
        query = query.eq('promotion_type', filters.promotion_type);
      }

      if (filters.dateFrom) {
        query = query.gte('start_date', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('end_date', filters.dateTo);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching promotions:', error);
        throw new Error(`Error al obtener promociones: ${error.message}`);
      }

      return (data || []).map(promo => ({
        ...promo,
        rules: promo.promotion_rules || []
      }));
    } catch (error) {
      console.error('Error in getAll:', error);
      throw error;
    }
  }

  /**
   * Obtener promoción por ID
   */
  static async getById(id: string): Promise<Promotion | null> {
    try {
      const organizationId = this.getOrganizationId();

      const { data, error } = await supabase
        .from('promotions')
        .select(`
          *,
          promotion_rules (
            id,
            rule_type,
            product_id,
            category_id,
            created_at
          )
        `)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Error al obtener promoción: ${error.message}`);
      }

      // Obtener productos y categorías relacionados
      const rules = data.promotion_rules || [];
      const productIds = rules.filter((r: any) => r.product_id).map((r: any) => r.product_id);
      const categoryIds = rules.filter((r: any) => r.category_id).map((r: any) => r.category_id);

      let products: any[] = [];
      let categories: any[] = [];

      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from('products')
          .select('id, name, sku')
          .in('id', productIds);
        products = prods || [];
      }

      if (categoryIds.length > 0) {
        const { data: cats } = await supabase
          .from('categories')
          .select('id, name')
          .in('id', categoryIds);
        categories = cats || [];
      }

      return {
        ...data,
        rules: rules.map((rule: any) => ({
          ...rule,
          product: products.find(p => p.id === rule.product_id),
          category: categories.find(c => c.id === rule.category_id)
        }))
      };
    } catch (error) {
      console.error('Error in getById:', error);
      throw error;
    }
  }

  /**
   * Crear promoción
   */
  static async create(data: CreatePromotionData): Promise<Promotion> {
    try {
      const organizationId = this.getOrganizationId();
      const { data: userData } = await supabase.auth.getUser();

      const { rules, ...promotionData } = data;

      const { data: result, error } = await supabase
        .from('promotions')
        .insert([{
          ...promotionData,
          organization_id: organizationId,
          created_by: userData?.user?.id,
          is_active: data.is_active ?? true,
          is_combinable: data.is_combinable ?? false,
          priority: data.priority ?? 0,
          usage_count: 0
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating promotion:', error);
        throw new Error(`Error al crear promoción: ${error.message}`);
      }

      // Crear reglas si existen
      if (rules && rules.length > 0) {
        await this.createRules(result.id, rules);
      }

      return result;
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  }

  /**
   * Actualizar promoción
   */
  static async update(id: string, data: UpdatePromotionData): Promise<Promotion> {
    try {
      const organizationId = this.getOrganizationId();
      const { rules, ...promotionData } = data;

      const { data: result, error } = await supabase
        .from('promotions')
        .update({
          ...promotionData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating promotion:', error);
        throw new Error(`Error al actualizar promoción: ${error.message}`);
      }

      // Actualizar reglas si se proporcionan
      if (rules !== undefined) {
        // Eliminar reglas existentes
        await supabase
          .from('promotion_rules')
          .delete()
          .eq('promotion_id', id);

        // Crear nuevas reglas
        if (rules.length > 0) {
          await this.createRules(id, rules);
        }
      }

      return result;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  /**
   * Crear reglas de promoción
   */
  private static async createRules(promotionId: string, rules: CreatePromotionRuleData[]): Promise<void> {
    const rulesData = rules.map(rule => ({
      promotion_id: promotionId,
      rule_type: rule.rule_type,
      product_id: rule.product_id || null,
      category_id: rule.category_id || null
    }));

    const { error } = await supabase
      .from('promotion_rules')
      .insert(rulesData);

    if (error) {
      console.error('Error creating promotion rules:', error);
      throw new Error(`Error al crear reglas: ${error.message}`);
    }
  }

  /**
   * Eliminar promoción
   */
  static async delete(id: string): Promise<void> {
    try {
      const organizationId = this.getOrganizationId();

      // Eliminar reglas primero
      await supabase
        .from('promotion_rules')
        .delete()
        .eq('promotion_id', id);

      const { error } = await supabase
        .from('promotions')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error deleting promotion:', error);
        throw new Error(`Error al eliminar promoción: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }

  /**
   * Duplicar promoción
   */
  static async duplicate(id: string): Promise<Promotion> {
    try {
      const original = await this.getById(id);
      if (!original) throw new Error('Promoción no encontrada');

      const { id: _, created_at, updated_at, usage_count, rules, ...data } = original;

      return this.create({
        ...data,
        name: `${data.name} (Copia)`,
        is_active: false,
        rules: rules?.map(r => ({
          rule_type: r.rule_type,
          product_id: r.product_id,
          category_id: r.category_id
        }))
      });
    } catch (error) {
      console.error('Error in duplicate:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado activo/inactivo
   */
  static async toggleActive(id: string): Promise<Promotion> {
    const promo = await this.getById(id);
    if (!promo) throw new Error('Promoción no encontrada');
    
    return this.update(id, { is_active: !promo.is_active });
  }

  /**
   * Obtener productos para selector
   */
  static async getProducts(search?: string): Promise<any[]> {
    const organizationId = this.getOrganizationId();
    
    let query = supabase
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(50);

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data } = await query;
    return data || [];
  }

  /**
   * Obtener categorías para selector
   */
  static async getCategories(): Promise<any[]> {
    const organizationId = this.getOrganizationId();
    
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    return data || [];
  }
}
