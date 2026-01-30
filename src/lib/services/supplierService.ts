import { supabase } from '@/lib/supabase/config';

// Tipos para Proveedores
export interface Supplier {
  id: number;
  uuid: string;
  organization_id: number;
  name: string;
  nit?: string;
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Input para crear/actualizar proveedor
export interface SupplierInput {
  name: string;
  nit?: string;
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

// Estadísticas de proveedores
export interface SupplierStats {
  total: number;
  withEmail: number;
  withPhone: number;
  recentlyAdded: number;
}

// Orden de compra resumida
export interface PurchaseOrderSummary {
  id: number;
  status: string;
  total: number;
  expected_date?: string;
  created_at: string;
}

// Factura de compra resumida
export interface PurchaseInvoiceSummary {
  id: string;
  number_ext?: string;
  status: string;
  total: number;
  issue_date?: string;
  created_at: string;
}

class SupplierService {
  /**
   * Obtener lista de proveedores con filtros
   */
  async getSuppliers(
    organizationId: number,
    filters?: {
      searchTerm?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ data: Supplier[]; count: number; error: Error | null }> {
    try {
      let query = supabase
        .from('suppliers')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId);

      // Aplicar búsqueda
      if (filters?.searchTerm) {
        query = query.or(`name.ilike.%${filters.searchTerm}%,nit.ilike.%${filters.searchTerm}%,email.ilike.%${filters.searchTerm}%,contact.ilike.%${filters.searchTerm}%`);
      }

      // Ordenar
      const sortBy = filters?.sortBy || 'name';
      const sortOrder = filters?.sortOrder || 'asc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Paginación
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return { data: data as Supplier[], count: count || 0, error: null };
    } catch (error) {
      console.error('Error obteniendo proveedores:', error);
      return { data: [], count: 0, error: error as Error };
    }
  }

  /**
   * Obtener un proveedor por UUID
   */
  async getSupplierByUuid(
    supplierUuid: string,
    organizationId: number
  ): Promise<{ data: Supplier | null; error: Error | null }> {
    try {
      // Validar que sea un UUID válido
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(supplierUuid)) {
        return { data: null, error: new Error('UUID de proveedor inválido') };
      }

      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('uuid', supplierUuid)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { data: null, error: new Error('Proveedor no encontrado') };
        }
        throw error;
      }

      return { data: data as Supplier, error: null };
    } catch (error: any) {
      console.error('Error obteniendo proveedor:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Obtener un proveedor por ID numérico (uso interno)
   */
  async getSupplierById(
    supplierId: number,
    organizationId: number
  ): Promise<{ data: Supplier | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;

      return { data: data as Supplier, error: null };
    } catch (error) {
      console.error('Error obteniendo proveedor:', error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Crear nuevo proveedor
   */
  async createSupplier(
    organizationId: number,
    input: SupplierInput
  ): Promise<{ data: Supplier | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          organization_id: organizationId,
          name: input.name,
          nit: input.nit || null,
          contact: input.contact || null,
          phone: input.phone || null,
          email: input.email || null,
          notes: input.notes || null
        })
        .select()
        .single();

      if (error) throw error;

      return { data: data as Supplier, error: null };
    } catch (error) {
      console.error('Error creando proveedor:', error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Actualizar proveedor por UUID
   */
  async updateSupplier(
    supplierUuid: string,
    organizationId: number,
    input: SupplierInput
  ): Promise<{ data: Supplier | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .update({
          name: input.name,
          nit: input.nit || null,
          contact: input.contact || null,
          phone: input.phone || null,
          email: input.email || null,
          notes: input.notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('uuid', supplierUuid)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;

      return { data: data as Supplier, error: null };
    } catch (error) {
      console.error('Error actualizando proveedor:', error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Eliminar proveedor por UUID
   */
  async deleteSupplier(
    supplierUuid: string,
    organizationId: number
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('uuid', supplierUuid)
        .eq('organization_id', organizationId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error) {
      console.error('Error eliminando proveedor:', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Duplicar proveedor por UUID
   */
  async duplicateSupplier(
    supplierUuid: string,
    organizationId: number
  ): Promise<{ data: Supplier | null; error: Error | null }> {
    try {
      // Obtener proveedor original
      const { data: original, error: getError } = await this.getSupplierByUuid(supplierUuid, organizationId);
      
      if (getError || !original) {
        throw getError || new Error('Proveedor no encontrado');
      }

      // Crear copia
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          organization_id: organizationId,
          name: `${original.name} (Copia)`,
          nit: null, // NIT debe ser único, no duplicar
          contact: original.contact,
          phone: original.phone,
          email: original.email,
          notes: original.notes
        })
        .select()
        .single();

      if (error) throw error;

      return { data: data as Supplier, error: null };
    } catch (error) {
      console.error('Error duplicando proveedor:', error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Obtener estadísticas de proveedores
   */
  async getSupplierStats(organizationId: number): Promise<SupplierStats> {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, email, phone, created_at')
        .eq('organization_id', organizationId);

      if (error) throw error;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const stats: SupplierStats = {
        total: data?.length || 0,
        withEmail: data?.filter(s => s.email).length || 0,
        withPhone: data?.filter(s => s.phone).length || 0,
        recentlyAdded: data?.filter(s => new Date(s.created_at) > thirtyDaysAgo).length || 0
      };

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return { total: 0, withEmail: 0, withPhone: 0, recentlyAdded: 0 };
    }
  }

  /**
   * Obtener órdenes de compra de un proveedor
   */
  async getSupplierPurchaseOrders(
    supplierId: number,
    organizationId: number,
    limit: number = 10
  ): Promise<PurchaseOrderSummary[]> {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, status, total, expected_date, created_at')
        .eq('supplier_id', supplierId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map(item => ({
        ...item,
        total: item.total || 0
      }));
    } catch (error) {
      console.error('Error obteniendo órdenes de compra:', error);
      return [];
    }
  }

  /**
   * Obtener facturas de compra de un proveedor
   */
  async getSupplierInvoices(
    supplierId: number,
    organizationId: number,
    limit: number = 10
  ): Promise<PurchaseInvoiceSummary[]> {
    try {
      const { data, error } = await supabase
        .from('invoice_purchase')
        .select('id, number_ext, status, total, issue_date, created_at')
        .eq('supplier_id', supplierId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map(item => ({
        ...item,
        total: item.total || 0
      }));
    } catch (error) {
      console.error('Error obteniendo facturas:', error);
      return [];
    }
  }

  /**
   * Importar proveedores desde CSV
   */
  async importSuppliers(
    organizationId: number,
    suppliers: SupplierInput[]
  ): Promise<{ success: number; errors: { row: number; error: string }[] }> {
    const results = {
      success: 0,
      errors: [] as { row: number; error: string }[]
    };

    for (let i = 0; i < suppliers.length; i++) {
      try {
        const supplier = suppliers[i];
        
        if (!supplier.name) {
          results.errors.push({ row: i + 1, error: 'Nombre es requerido' });
          continue;
        }

        const { error } = await supabase
          .from('suppliers')
          .insert({
            organization_id: organizationId,
            name: supplier.name,
            nit: supplier.nit || null,
            contact: supplier.contact || null,
            phone: supplier.phone || null,
            email: supplier.email || null,
            notes: supplier.notes || null
          });

        if (error) {
          results.errors.push({ row: i + 1, error: error.message });
        } else {
          results.success++;
        }
      } catch (error: any) {
        results.errors.push({ row: i + 1, error: error.message || 'Error desconocido' });
      }
    }

    return results;
  }

  /**
   * Exportar proveedores a CSV
   */
  async exportSuppliersToCSV(organizationId: number): Promise<string> {
    try {
      const { data } = await this.getSuppliers(organizationId, {}, 1, 10000);
      
      if (!data || data.length === 0) return '';

      const headers = ['Nombre', 'NIT', 'Contacto', 'Teléfono', 'Email', 'Notas', 'Fecha Creación'];
      const rows = data.map(s => [
        s.name,
        s.nit || '',
        s.contact || '',
        s.phone || '',
        s.email || '',
        s.notes || '',
        new Date(s.created_at).toLocaleDateString('es-CO')
      ]);

      const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
      return csvContent;
    } catch (error) {
      console.error('Error exportando proveedores:', error);
      return '';
    }
  }
}

export const supplierService = new SupplierService();
export default supplierService;
