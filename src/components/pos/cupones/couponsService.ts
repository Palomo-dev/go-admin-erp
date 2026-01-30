import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { 
  Coupon, 
  CouponRedemption,
  CreateCouponData, 
  UpdateCouponData,
  CouponFilters
} from './types';

export class CouponsService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org.id;
  }

  /**
   * Obtener todos los cupones
   */
  static async getAll(filters: CouponFilters = {}): Promise<Coupon[]> {
    try {
      const organizationId = this.getOrganizationId();
      
      let query = supabase
        .from('coupons')
        .select(`
          *,
          customer:customers (
            id,
            full_name,
            email
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (filters.search) {
        query = query.or(`code.ilike.%${filters.search}%,name.ilike.%${filters.search}%`);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.discount_type) {
        query = query.eq('discount_type', filters.discount_type);
      }

      if (filters.dateFrom) {
        query = query.gte('start_date', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('end_date', filters.dateTo);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching coupons:', error);
        throw new Error(`Error al obtener cupones: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAll:', error);
      throw error;
    }
  }

  /**
   * Obtener cupón por ID
   */
  static async getById(id: string): Promise<Coupon | null> {
    try {
      const organizationId = this.getOrganizationId();

      const { data, error } = await supabase
        .from('coupons')
        .select(`
          *,
          customer:customers (
            id,
            full_name,
            email
          )
        `)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Error al obtener cupón: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error in getById:', error);
      throw error;
    }
  }

  /**
   * Crear cupón
   */
  static async create(data: CreateCouponData): Promise<Coupon> {
    try {
      const organizationId = this.getOrganizationId();
      const { data: userData } = await supabase.auth.getUser();

      // Verificar código único
      const { data: existing } = await supabase
        .from('coupons')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('code', data.code.toUpperCase())
        .single();

      if (existing) {
        throw new Error(`Ya existe un cupón con el código "${data.code}"`);
      }

      const { data: result, error } = await supabase
        .from('coupons')
        .insert([{
          ...data,
          code: data.code.toUpperCase(),
          organization_id: organizationId,
          created_by: userData?.user?.id,
          is_active: data.is_active ?? true,
          applies_to_first_purchase: data.applies_to_first_purchase ?? false,
          usage_count: 0
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating coupon:', error);
        throw new Error(`Error al crear cupón: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  }

  /**
   * Actualizar cupón
   */
  static async update(id: string, data: UpdateCouponData): Promise<Coupon> {
    try {
      const organizationId = this.getOrganizationId();

      // Verificar código único si se está cambiando
      if (data.code) {
        const { data: existing } = await supabase
          .from('coupons')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('code', data.code.toUpperCase())
          .neq('id', id)
          .single();

        if (existing) {
          throw new Error(`Ya existe un cupón con el código "${data.code}"`);
        }
      }

      const updateData: any = { ...data };
      if (data.code) {
        updateData.code = data.code.toUpperCase();
      }

      const { data: result, error } = await supabase
        .from('coupons')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating coupon:', error);
        throw new Error(`Error al actualizar cupón: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  /**
   * Eliminar cupón
   */
  static async delete(id: string): Promise<void> {
    try {
      const organizationId = this.getOrganizationId();

      // Verificar si tiene redenciones
      const { data: redemptions } = await supabase
        .from('coupon_redemptions')
        .select('id')
        .eq('coupon_id', id)
        .limit(1);

      if (redemptions && redemptions.length > 0) {
        throw new Error('No se puede eliminar el cupón porque tiene redenciones. Puede desactivarlo en su lugar.');
      }

      const { error } = await supabase
        .from('coupons')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error deleting coupon:', error);
        throw new Error(`Error al eliminar cupón: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }

  /**
   * Duplicar cupón
   */
  static async duplicate(id: string): Promise<Coupon> {
    try {
      const original = await this.getById(id);
      if (!original) throw new Error('Cupón no encontrado');

      const { id: _, created_at, updated_at, usage_count, customer, ...data } = original;

      return this.create({
        ...data,
        code: `${data.code}_COPIA`,
        name: data.name ? `${data.name} (Copia)` : undefined,
        is_active: false
      });
    } catch (error) {
      console.error('Error in duplicate:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado activo/inactivo
   */
  static async toggleActive(id: string): Promise<Coupon> {
    const coupon = await this.getById(id);
    if (!coupon) throw new Error('Cupón no encontrado');
    
    return this.update(id, { is_active: !coupon.is_active });
  }

  /**
   * Obtener redenciones de un cupón
   */
  static async getRedemptions(couponId: string): Promise<CouponRedemption[]> {
    try {
      const { data, error } = await supabase
        .from('coupon_redemptions')
        .select(`
          *,
          sale:sales (
            id,
            total,
            sale_date,
            branch:branches (
              id,
              name
            )
          ),
          customer:customers (
            id,
            full_name,
            email
          )
        `)
        .eq('coupon_id', couponId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching redemptions:', error);
        throw new Error(`Error al obtener redenciones: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error in getRedemptions:', error);
      throw error;
    }
  }

  /**
   * Importar cupones desde CSV
   */
  static async importFromData(data: CreateCouponData[]): Promise<{ success: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await this.create(item);
        success++;
      } catch (error: any) {
        errors.push(`${item.code}: ${error.message}`);
      }
    }

    return { success, errors };
  }

  /**
   * Generar código único
   */
  static generateCode(prefix: string = 'CUP'): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = prefix;
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
