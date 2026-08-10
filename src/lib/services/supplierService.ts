import { supabase } from '@/lib/supabase/config';

// Tipos para Proveedores
export interface Supplier {
  id: number;
  uuid: string;
  organization_id: number;
  name: string;
  supplier_type?: 'person' | 'company';
  parent_supplier_id?: number | null;
  doc_type?: string | null;
  nit?: string;
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
  description?: string;
  logo_url?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  tax_id?: string;
  tax_regime?: string;
  fiscal_responsibilities?: string[];
  payment_terms?: string;
  credit_days?: number;
  website?: string;
  is_active?: boolean;
  rating?: number;
  bank_name?: string;
  bank_account?: string;
  account_type?: string;
  icon?: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

// Input para crear/actualizar proveedor
export interface SupplierInput {
  name: string;
  supplier_type?: 'person' | 'company';
  parent_supplier_id?: number | null;
  doc_type?: string | null;
  nit?: string;
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
  description?: string;
  logo_url?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  tax_id?: string;
  tax_regime?: string;
  fiscal_responsibilities?: string[];
  payment_terms?: string;
  credit_days?: number;
  website?: string;
  bank_name?: string;
  bank_account?: string;
  account_type?: string;
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

// Cuenta por pagar resumida
export interface AccountPayableSummary {
  id: string;
  invoice_id: string | null;
  amount: number;
  balance: number;
  due_date: string | null;
  status: string;
  days_overdue: number;
  discount_amount: number;
  created_at: string;
  invoice_number: string | null;
  invoice_total: number;
}

// Pago a proveedor resumido
export interface SupplierPaymentSummary {
  id: string;
  source: string;
  source_id: string;
  method: string;
  amount: number;
  currency: string;
  reference: string | null;
  status: string;
  payment_date: string | null;
  created_at: string;
  discount_amount: number;
}

// Stock de producto del proveedor
export interface SupplierStockSummary {
  product_id: number;
  product_uuid: string;
  product_name: string;
  product_sku: string;
  track_stock: boolean;
  status: string;
  cost: number;
  is_preferred: boolean;
  supplier_sku: string | null;
  stock_total: number;
  branches_with_stock: number;
  stock_value: number;
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
          supplier_type: input.supplier_type || 'company',
          parent_supplier_id: input.parent_supplier_id || null,
          doc_type: input.doc_type || null,
          nit: input.nit || null,
          contact: input.contact || null,
          phone: input.phone || null,
          email: input.email || null,
          notes: input.notes || null,
          description: input.description || null,
          logo_url: input.logo_url || null,
          address: input.address || null,
          city: input.city || null,
          state: input.state || null,
          country: input.country || 'Colombia',
          postal_code: input.postal_code || null,
          tax_id: input.tax_id || null,
          tax_regime: input.tax_regime || null,
          fiscal_responsibilities: input.fiscal_responsibilities || null,
          payment_terms: input.payment_terms || null,
          credit_days: input.credit_days || null,
          website: input.website || null,
          bank_name: input.bank_name || null,
          bank_account: input.bank_account || null,
          account_type: input.account_type || null,
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
          supplier_type: input.supplier_type || 'company',
          parent_supplier_id: input.parent_supplier_id || null,
          doc_type: input.doc_type || null,
          nit: input.nit || null,
          contact: input.contact || null,
          phone: input.phone || null,
          email: input.email || null,
          notes: input.notes || null,
          description: input.description || null,
          logo_url: input.logo_url || null,
          address: input.address || null,
          city: input.city || null,
          state: input.state || null,
          country: input.country || 'Colombia',
          postal_code: input.postal_code || null,
          tax_id: input.tax_id || null,
          tax_regime: input.tax_regime || null,
          fiscal_responsibilities: input.fiscal_responsibilities || null,
          payment_terms: input.payment_terms || null,
          credit_days: input.credit_days || null,
          website: input.website || null,
          bank_name: input.bank_name || null,
          bank_account: input.bank_account || null,
          account_type: input.account_type || null,
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
   * Obtener IDs de productos relacionados a un proveedor
   */
  async getProductsBySupplier(
    supplierId: number
  ): Promise<{ product_id: number; cost: number; supplier_sku: string | null; lead_time_days: number | null; min_order_qty: number | null }[]> {
    try {
      const { data, error } = await supabase
        .from('product_suppliers')
        .select('product_id, cost, supplier_sku, lead_time_days, min_order_qty')
        .eq('supplier_id', supplierId);

      if (error) throw error;

      return (data || []).map(item => ({
        product_id: item.product_id,
        cost: parseFloat(item.cost) || 0,
        supplier_sku: item.supplier_sku || null,
        lead_time_days: item.lead_time_days || null,
        min_order_qty: item.min_order_qty ? parseFloat(item.min_order_qty) : null
      }));
    } catch (error) {
      console.error('Error obteniendo productos del proveedor:', error);
      return [];
    }
  }

  /**
   * Obtener cuentas por pagar de un proveedor
   */
  async getSupplierAccountsPayable(
    supplierId: number,
    organizationId: number
  ): Promise<AccountPayableSummary[]> {
    try {
      const { data, error } = await supabase
        .from('accounts_payable')
        .select(`
          id,
          invoice_id,
          amount,
          balance,
          due_date,
          status,
          days_overdue,
          discount_amount,
          created_at,
          invoice_purchase (
            number_ext,
            issue_date,
            total
          )
        `)
        .eq('supplier_id', supplierId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        invoice_id: item.invoice_id,
        amount: parseFloat(item.amount) || 0,
        balance: parseFloat(item.balance) || 0,
        due_date: item.due_date,
        status: item.status,
        days_overdue: item.days_overdue || 0,
        discount_amount: parseFloat(item.discount_amount) || 0,
        created_at: item.created_at,
        invoice_number: item.invoice_purchase?.number_ext || null,
        invoice_total: parseFloat(item.invoice_purchase?.total) || 0
      }));
    } catch (error) {
      console.error('Error obteniendo cuentas por pagar:', error);
      return [];
    }
  }

  /**
   * Obtener pagos realizados a un proveedor
   */
  async getSupplierPayments(
    supplierId: number,
    organizationId: number
  ): Promise<SupplierPaymentSummary[]> {
    try {
      // Los pagos a proveedores se relacionan via accounts_payable o invoice_purchase
      // Primero obtenemos los IDs de las CxP del proveedor
      const { data: accountsPayable } = await supabase
        .from('accounts_payable')
        .select('id')
        .eq('supplier_id', supplierId)
        .eq('organization_id', organizationId);

      const cxpIds = (accountsPayable || []).map(ap => ap.id);

      // También obtenemos los IDs de facturas de compra del proveedor
      const { data: invoices } = await supabase
        .from('invoice_purchase')
        .select('id')
        .eq('supplier_id', supplierId)
        .eq('organization_id', organizationId);

      const invoiceIds = (invoices || []).map(inv => inv.id);

      // Buscar pagos donde source = 'account_payable' y source_id IN cxpIds
      // o source = 'invoice_purchase' y source_id IN invoiceIds
      let paymentsQuery = supabase
        .from('payments')
        .select(`
          id,
          source,
          source_id,
          method,
          amount,
          currency,
          reference,
          status,
          payment_date,
          created_at,
          discount_amount
        `)
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .order('payment_date', { ascending: false });

      // Buscar pagos relacionados a CxP o facturas de compra
      const { data: paymentsData, error } = await paymentsQuery
        .or(`source.eq.account_payable,source.eq.invoice_purchase`);

      if (error) throw error;

      // Filtrar en cliente los que corresponden a este proveedor
      const cxpIdSet = new Set(cxpIds.map(id => id.toString()));
      const invoiceIdSet = new Set(invoiceIds.map(id => id.toString()));
      const filteredPayments = (paymentsData || []).filter((p: any) => {
        if (p.source === 'account_payable' && cxpIdSet.has(p.source_id)) return true;
        if (p.source === 'invoice_purchase' && invoiceIdSet.has(p.source_id)) return true;
        return false;
      });

      return filteredPayments.map((p: any) => ({
        id: p.id,
        source: p.source,
        source_id: p.source_id,
        method: p.method,
        amount: parseFloat(p.amount) || 0,
        currency: p.currency,
        reference: p.reference,
        status: p.status,
        payment_date: p.payment_date,
        created_at: p.created_at,
        discount_amount: parseFloat(p.discount_amount) || 0
      }));
    } catch (error) {
      console.error('Error obteniendo pagos del proveedor:', error);
      return [];
    }
  }

  /**
   * Obtener resumen de stock de productos del proveedor
   */
  async getSupplierStockSummary(
    supplierId: number,
    organizationId: number
  ): Promise<SupplierStockSummary[]> {
    try {
      // Obtener productos del proveedor con su stock
      const { data, error } = await supabase
        .from('product_suppliers')
        .select(`
          product_id,
          cost,
          is_preferred,
          supplier_sku,
          product:products (
            id,
            uuid,
            name,
            sku,
            track_stock,
            status
          )
        `)
        .eq('supplier_id', supplierId);

      if (error) throw error;

      if (!data || data.length === 0) return [];

      const productIds = data.map((item: any) => item.product_id);

      // Obtener stock_levels para los productos del proveedor
      const { data: stockData } = await supabase
        .from('stock_levels')
        .select('product_id, branch_id, qty_on_hand, min_level')
        .in('product_id', productIds);

      // Agrupar stock por producto
      const stockMap = new Map<number, { total: number; branches: number }>();
      for (const stock of (stockData || [])) {
        const existing = stockMap.get(stock.product_id) || { total: 0, branches: 0 };
        existing.total += Number(stock.qty_on_hand) || 0;
        existing.branches += 1;
        stockMap.set(stock.product_id, existing);
      }

      return data.map((item: any) => {
        const stock = stockMap.get(item.product_id) || { total: 0, branches: 0 };
        return {
          product_id: item.product_id,
          product_uuid: item.product?.uuid || '',
          product_name: item.product?.name || `Producto #${item.product_id}`,
          product_sku: item.product?.sku || '',
          track_stock: item.product?.track_stock || false,
          status: item.product?.status || 'active',
          cost: parseFloat(item.cost) || 0,
          is_preferred: item.is_preferred || false,
          supplier_sku: item.supplier_sku || null,
          stock_total: stock.total,
          branches_with_stock: stock.branches,
          stock_value: stock.total * (parseFloat(item.cost) || 0)
        };
      });
    } catch (error) {
      console.error('Error obteniendo stock del proveedor:', error);
      return [];
    }
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
