import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { Lot, LotFormData, LotsStats, LotFilter } from './types';

export class LotesService {
  static async obtenerLotes(filters?: LotFilter): Promise<Lot[]> {
    try {
      // RLS filtra automáticamente por organización del usuario autenticado
      let query = supabase
        .from('lots')
        .select(`
          *,
          products (
            id,
            name,
            sku
          ),
          suppliers (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (filters?.productId) {
        query = query.eq('product_id', filters.productId);
      }
      if (filters?.supplierId) {
        query = query.eq('supplier_id', filters.supplierId);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('❌ Error obteniendo lotes:', error.message, error.code, error.details);
        throw new Error(`Error obteniendo lotes: ${error.message}`);
      }

      console.log('📦 LotesService: Lotes encontrados =', (data || []).length);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Procesar datos y calcular estados (sin consultas anidadas para evitar problemas de RLS)
      const lotesConEstado = (data || []).map((lot) => {
        let isExpired = false;
        let daysToExpiry: number | null = null;

        if (lot.expiry_date) {
          const expiryDate = new Date(lot.expiry_date);
          expiryDate.setHours(0, 0, 0, 0);
          isExpired = expiryDate < today;
          daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
          ...lot,
          product: lot.products,
          supplier: lot.suppliers,
          stock_quantity: 0, // Stock se puede calcular en otro endpoint si es necesario
          is_expired: isExpired,
          days_to_expiry: daysToExpiry,
        };
      });

      // Aplicar filtros de estado
      if (filters?.status === 'expired') {
        return lotesConEstado.filter(l => l.is_expired);
      }
      if (filters?.status === 'expiring') {
        return lotesConEstado.filter(l => !l.is_expired && l.days_to_expiry !== null && l.days_to_expiry !== undefined && l.days_to_expiry <= 30);
      }
      if (filters?.status === 'active') {
        return lotesConEstado.filter(l => !l.is_expired);
      }

      // Filtro de búsqueda
      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        return lotesConEstado.filter(l =>
          l.lot_code.toLowerCase().includes(searchLower) ||
          l.product?.name?.toLowerCase().includes(searchLower) ||
          l.product?.sku?.toLowerCase().includes(searchLower)
        );
      }

      return lotesConEstado;
    } catch (err) {
      console.error('❌ LotesService.obtenerLotes - Error completo:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async obtenerStats(): Promise<LotsStats> {
    const lotes = await this.obtenerLotes();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    return {
      total: lotes.length,
      expired: lotes.filter(l => l.is_expired).length,
      expiringSoon: lotes.filter(l =>
        !l.is_expired &&
        l.days_to_expiry !== null &&
        l.days_to_expiry !== undefined &&
        l.days_to_expiry <= 30 &&
        l.days_to_expiry >= 0
      ).length,
      withStock: lotes.filter(l => (l.stock_quantity || 0) > 0).length,
    };
  }

  static async obtenerProductos(): Promise<{ id: number; name: string; sku: string }[]> {
    try {
      const organizationId = getOrganizationId();

      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) {
        console.error('❌ Error obteniendo productos:', error.message, error.code);
        throw new Error(`Error obteniendo productos: ${error.message}`);
      }
      return data || [];
    } catch (err) {
      console.error('❌ LotesService.obtenerProductos:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async obtenerProveedores(): Promise<{ id: number; name: string }[]> {
    try {
      const organizationId = getOrganizationId();

      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) {
        console.error('❌ Error obteniendo proveedores:', error.message, error.code);
        throw new Error(`Error obteniendo proveedores: ${error.message}`);
      }
      return data || [];
    } catch (err) {
      console.error('❌ LotesService.obtenerProveedores:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  static async crearLote(data: LotFormData): Promise<Lot> {
    const { data: newLot, error } = await supabase
      .from('lots')
      .insert({
        product_id: data.product_id,
        lot_code: data.lot_code,
        expiry_date: data.expiry_date,
        supplier_id: data.supplier_id,
      })
      .select()
      .single();

    if (error) throw error;
    return newLot;
  }

  static async actualizarLote(id: number, data: Partial<LotFormData>): Promise<Lot> {
    const { data: updated, error } = await supabase
      .from('lots')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  static async eliminarLote(id: number): Promise<void> {
    // Verificar si tiene stock
    const { data: stockData } = await supabase
      .from('stock_levels')
      .select('quantity')
      .eq('lot_id', id);

    const totalStock = stockData?.reduce((sum, s) => sum + (s.quantity || 0), 0) || 0;
    if (totalStock > 0) {
      throw new Error('No se puede eliminar un lote que tiene stock');
    }

    // Verificar movimientos
    const { count } = await supabase
      .from('stock_movements')
      .select('*', { count: 'exact', head: true })
      .eq('lot_id', id);

    if (count && count > 0) {
      throw new Error('No se puede eliminar un lote que tiene movimientos asociados');
    }

    const { error } = await supabase
      .from('lots')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async duplicarLote(id: number): Promise<Lot> {
    const { data: original, error: fetchError } = await supabase
      .from('lots')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const { data: newLot, error } = await supabase
      .from('lots')
      .insert({
        product_id: original.product_id,
        lot_code: `${original.lot_code}-COPIA`,
        expiry_date: original.expiry_date,
        supplier_id: original.supplier_id,
      })
      .select()
      .single();

    if (error) throw error;
    return newLot;
  }
}
