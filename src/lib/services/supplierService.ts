import { supabase } from '@/lib/supabase/config';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  // Campos fiscales DIAN/Factus
  dv?: string | null;
  municipality_code?: string | null;
  identification_document_code?: string | null;
  country_code?: string | null;
  legal_organization_code?: string | null;
  trade_name?: string | null;
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
  // Campos fiscales DIAN/Factus
  dv?: string | null;
  municipality_code?: string | null;
  identification_document_code?: string | null;
  country_code?: string | null;
  legal_organization_code?: string | null;
  trade_name?: string | null;
  /** «Activo · aparece al comprar». Sin él, el alta usa el default de la BD (true). */
  is_active?: boolean;
}

/** Fila del listado (RPC `proveedores_listado`): proveedor + cartera + entregas. */
export interface ProveedorListadoItem {
  id: number;
  uuid: string;
  name: string;
  nit: string | null;
  dv: string | null;
  doc_type: string | null;
  identification_document_code: string | null;
  supplier_type: 'person' | 'company';
  contact: string | null;
  phone: string | null;
  email: string | null;
  payment_terms: string | null;
  credit_days: number | null;
  is_active: boolean;
  logo_url: string | null;
  /** Saldo por pagar: suma de `accounts_payable.balance` abiertas. */
  saldo: number;
  facturas_abiertas: number;
  facturas_vencidas: number;
  saldo_vencido: number;
  /** % de entregas a tiempo; `null` sin órdenes evaluables. */
  cumplimiento: number | null;
  entregas_total: number;
}

export interface FiltrosListadoProveedores {
  busqueda?: string;
  estado?: 'activo' | 'inactivo' | null;
  tipo?: 'company' | 'person' | null;
  cartera?: 'con_saldo' | 'vencido' | 'al_dia' | null;
  sinNit?: boolean;
  orden?: 'nombre' | 'saldo' | 'creado';
  direccion?: 'asc' | 'desc';
  desde?: number;
  limite?: number;
}

/** KPIs del listado (RPC `proveedores_resumen`). */
export interface ProveedoresResumen {
  total: number;
  activos: number;
  inactivos: number;
  sin_nit: number;
  saldo_por_pagar: number;
  proveedores_con_saldo: number;
  vencido_30: number;
  proveedores_vencido_30: number;
}

/** Cifras del detalle de un proveedor (RPC `proveedor_resumen`). */
export interface ProveedorResumen {
  saldo: number;
  facturas_abiertas: number;
  vencido: number;
  facturas_vencidas: number;
  max_dias_mora: number;
  compras_12m: number;
  facturas_12m: number;
  ordenes_12m: number;
  entregas_total: number;
  entregas_a_tiempo: number;
  productos: number;
  ordenes: number;
  ordenes_abiertas: number;
  facturas: number;
  cuentas_por_pagar: number;
  pagos: number;
  lotes: number;
}

/** Producto que surte el proveedor (`product_suppliers` + `products`). */
export interface SupplierProductLink {
  id: number;
  product_id: number;
  cost: number;
  is_preferred: boolean;
  supplier_sku: string | null;
  lead_time_days: number | null;
  min_order_qty: number | null;
  product: { id: number; uuid: string; name: string; sku: string | null; status: string | null } | null;
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

// Fila de `payments` tal como llega de PostgREST (numéricos como texto).
interface SupplierPaymentRow {
  id: string;
  source: string;
  source_id: string;
  method: string;
  amount: number | string | null;
  currency: string;
  reference: string | null;
  status: string;
  payment_date: string | null;
  created_at: string;
  discount_amount: number | string | null;
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
    } catch (error: unknown) {
      console.error('Error obteniendo proveedor:', error instanceof Error ? error.message : error);
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
          // `?? null`: un proveedor de contado tiene 0 días, no «sin dato».
          credit_days: input.credit_days ?? null,
          website: input.website || null,
          bank_name: input.bank_name || null,
          bank_account: input.bank_account || null,
          account_type: input.account_type || null,
          dv: input.dv || null,
          municipality_code: input.municipality_code || null,
          identification_document_code: input.identification_document_code || null,
          country_code: input.country_code || 'CO',
          legal_organization_code: input.legal_organization_code || null,
          trade_name: input.trade_name || null,
          ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
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
      // Actualización PARCIAL: solo se escriben los campos presentes en
      // `input`. Antes se escribía la fila entera con
      // `input.campo || <valor por defecto>`, así que un formulario que no
      // maneja un campo lo borraba: `EditarProveedorForm` no envía
      // `supplier_type`, `parent_supplier_id`, `doc_type` ni
      // `fiscal_responsibilities`, y guardar cualquier cambio convertía una
      // persona natural en empresa y le borraba el proveedor padre y los datos
      // DIAN (auditoría de proveedores y categorías, 2026-09-22).
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const setIfPresent = (column: string, value: unknown, empty: unknown = null) => {
        if (value === undefined) return;
        payload[column] = value === '' ? empty : value;
      };

      setIfPresent('name', input.name);
      setIfPresent('supplier_type', input.supplier_type);
      setIfPresent('parent_supplier_id', input.parent_supplier_id);
      setIfPresent('doc_type', input.doc_type);
      setIfPresent('nit', input.nit);
      setIfPresent('contact', input.contact);
      setIfPresent('phone', input.phone);
      setIfPresent('email', input.email);
      setIfPresent('notes', input.notes);
      setIfPresent('description', input.description);
      setIfPresent('logo_url', input.logo_url);
      setIfPresent('address', input.address);
      setIfPresent('city', input.city);
      setIfPresent('state', input.state);
      setIfPresent('country', input.country, 'Colombia');
      setIfPresent('postal_code', input.postal_code);
      setIfPresent('tax_id', input.tax_id);
      setIfPresent('tax_regime', input.tax_regime);
      setIfPresent('fiscal_responsibilities', input.fiscal_responsibilities);
      setIfPresent('payment_terms', input.payment_terms);
      setIfPresent('credit_days', input.credit_days);
      setIfPresent('website', input.website);
      setIfPresent('bank_name', input.bank_name);
      setIfPresent('bank_account', input.bank_account);
      setIfPresent('account_type', input.account_type);
      setIfPresent('dv', input.dv);
      setIfPresent('municipality_code', input.municipality_code);
      setIfPresent('identification_document_code', input.identification_document_code);
      setIfPresent('country_code', input.country_code, 'CO');
      setIfPresent('legal_organization_code', input.legal_organization_code);
      setIfPresent('trade_name', input.trade_name);
      setIfPresent('is_active', input.is_active);

      const { data, error } = await supabase
        .from('suppliers')
        .update(payload)
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
   * Listado paginado en el servidor con saldo por pagar, cartera y entregas
   * (RPC `proveedores_listado`, una sola llamada por página: nada de N
   * consultas por fila). La RPC valida la pertenencia a la organización.
   */
  async listarProveedores(
    organizationId: number,
    filtros: FiltrosListadoProveedores = {},
    ids?: readonly number[]
  ): Promise<{ items: ProveedorListadoItem[]; total: number }> {
    const { data, error } = await supabase.rpc('proveedores_listado', {
      p_organization_id: organizationId,
      p_offset: filtros.desde ?? 0,
      p_limit: filtros.limite ?? 20,
      p_busqueda: filtros.busqueda?.trim() || null,
      p_estado: filtros.estado ?? null,
      p_tipo: filtros.tipo ?? null,
      p_cartera: filtros.cartera ?? null,
      p_sin_nit: !!filtros.sinNit,
      p_orden: filtros.orden ?? 'nombre',
      p_direccion: filtros.direccion ?? 'asc',
      p_ids: ids && ids.length > 0 ? [...ids] : null,
    });
    if (error) throw error;
    const resultado = (data ?? {}) as { items?: ProveedorListadoItem[]; total?: number };
    const items = (resultado.items ?? []).map((p) => ({
      ...p,
      saldo: Number(p.saldo) || 0,
      saldo_vencido: Number(p.saldo_vencido) || 0,
    }));
    return { items, total: Number(resultado.total) || 0 };
  }

  /** KPIs del listado (RPC `proveedores_resumen`). */
  async obtenerResumenProveedores(organizationId: number): Promise<ProveedoresResumen> {
    const { data, error } = await supabase.rpc('proveedores_resumen', { p_organization_id: organizationId });
    if (error) throw error;
    const r = (data ?? {}) as Partial<Record<keyof ProveedoresResumen, number | string>>;
    return {
      total: Number(r.total) || 0,
      activos: Number(r.activos) || 0,
      inactivos: Number(r.inactivos) || 0,
      sin_nit: Number(r.sin_nit) || 0,
      saldo_por_pagar: Number(r.saldo_por_pagar) || 0,
      proveedores_con_saldo: Number(r.proveedores_con_saldo) || 0,
      vencido_30: Number(r.vencido_30) || 0,
      proveedores_vencido_30: Number(r.proveedores_vencido_30) || 0,
    };
  }

  /**
   * Cifras reales del detalle (RPC `proveedor_resumen`): antes se contaban
   * solo las 10 órdenes y 10 facturas que se traían. `null` si el proveedor
   * no es de la organización.
   */
  async obtenerResumenProveedor(organizationId: number, supplierId: number): Promise<ProveedorResumen | null> {
    const { data, error } = await supabase.rpc('proveedor_resumen', {
      p_organization_id: organizationId,
      p_supplier_id: supplierId,
    });
    if (error) throw error;
    if (!data) return null;
    const r = data as Record<string, number | string | null>;
    const n = (k: keyof ProveedorResumen) => Number(r[k]) || 0;
    return {
      saldo: n('saldo'),
      facturas_abiertas: n('facturas_abiertas'),
      vencido: n('vencido'),
      facturas_vencidas: n('facturas_vencidas'),
      max_dias_mora: n('max_dias_mora'),
      compras_12m: n('compras_12m'),
      facturas_12m: n('facturas_12m'),
      ordenes_12m: n('ordenes_12m'),
      entregas_total: n('entregas_total'),
      entregas_a_tiempo: n('entregas_a_tiempo'),
      productos: n('productos'),
      ordenes: n('ordenes'),
      ordenes_abiertas: n('ordenes_abiertas'),
      facturas: n('facturas'),
      cuentas_por_pagar: n('cuentas_por_pagar'),
      pagos: n('pagos'),
      lotes: n('lotes'),
    };
  }

  /** Activa o desactiva varios proveedores (acción masiva y del menú de fila). */
  async setSuppliersActive(
    organizationId: number,
    supplierIds: readonly number[],
    isActive: boolean
  ): Promise<{ success: boolean; error: Error | null }> {
    if (supplierIds.length === 0) return { success: true, error: null };
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .in('id', [...supplierIds]);
      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('Error cambiando el estado de los proveedores:', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Productos que surte el proveedor. Antes el detalle pedía
   * `products.is_active`, que no existe, y la tarjeta salía siempre vacía.
   */
  async getSupplierProducts(supplierId: number): Promise<SupplierProductLink[]> {
    try {
      const { data, error } = await supabase
        .from('product_suppliers')
        .select('id, product_id, cost, is_preferred, supplier_sku, lead_time_days, min_order_qty, product:products(id, uuid, name, sku, status)')
        .eq('supplier_id', supplierId);
      if (error) throw error;
      type Fila = Omit<SupplierProductLink, 'product' | 'cost' | 'min_order_qty'> & {
        cost: number | string | null;
        min_order_qty: number | string | null;
        product: SupplierProductLink['product'] | SupplierProductLink['product'][];
      };
      return ((data ?? []) as unknown as Fila[]).map((row) => ({
        id: row.id,
        product_id: row.product_id,
        cost: Number(row.cost) || 0,
        is_preferred: !!row.is_preferred,
        supplier_sku: row.supplier_sku ?? null,
        lead_time_days: row.lead_time_days ?? null,
        min_order_qty: row.min_order_qty !== null && row.min_order_qty !== undefined ? Number(row.min_order_qty) : null,
        product: Array.isArray(row.product) ? (row.product[0] ?? null) : row.product,
      }));
    } catch (error) {
      console.error('Error obteniendo productos del proveedor:', error);
      return [];
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

        if (supplier.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email)) {
          results.errors.push({ row: i + 1, error: 'Email inválido' });
          continue;
        }

        if (supplier.supplier_type && supplier.supplier_type !== 'person' && supplier.supplier_type !== 'company') {
          results.errors.push({ row: i + 1, error: 'Tipo debe ser "person" o "company"' });
          continue;
        }

        let creditDays: number | null = null;
        if (supplier.credit_days !== undefined && supplier.credit_days !== null) {
          const parsed = typeof supplier.credit_days === 'number'
            ? supplier.credit_days
            : Number(String(supplier.credit_days).trim());
          if (isNaN(parsed)) {
            results.errors.push({ row: i + 1, error: 'Días Crédito debe ser numérico' });
            continue;
          }
          creditDays = parsed;
        }

        let fiscalResponsibilities: string[] | null = null;
        if (supplier.fiscal_responsibilities) {
          fiscalResponsibilities = Array.isArray(supplier.fiscal_responsibilities)
            ? supplier.fiscal_responsibilities
            : String(supplier.fiscal_responsibilities).split(';').map(r => r.trim()).filter(Boolean);
        }

        const { error } = await supabase
          .from('suppliers')
          .insert({
            organization_id: organizationId,
            name: supplier.name,
            supplier_type: supplier.supplier_type || 'company',
            doc_type: supplier.doc_type || null,
            nit: supplier.nit || null,
            contact: supplier.contact || null,
            phone: supplier.phone || null,
            email: supplier.email || null,
            notes: supplier.notes || null,
            description: supplier.description || null,
            address: supplier.address || null,
            city: supplier.city || null,
            state: supplier.state || null,
            country: supplier.country || 'Colombia',
            postal_code: supplier.postal_code || null,
            tax_id: supplier.tax_id || null,
            tax_regime: supplier.tax_regime || null,
            fiscal_responsibilities: fiscalResponsibilities,
            payment_terms: supplier.payment_terms || null,
            credit_days: creditDays,
            website: supplier.website || null,
            bank_name: supplier.bank_name || null,
            bank_account: supplier.bank_account || null,
            account_type: supplier.account_type || null,
            dv: supplier.dv || null,
            municipality_code: supplier.municipality_code || null,
            identification_document_code: supplier.identification_document_code || null,
            country_code: supplier.country_code || 'CO',
            legal_organization_code: supplier.legal_organization_code || null,
            trade_name: supplier.trade_name || null,
          });

        if (error) {
          results.errors.push({ row: i + 1, error: error.message });
        } else {
          results.success++;
        }
      } catch (error: unknown) {
        results.errors.push({ row: i + 1, error: (error instanceof Error && error.message) || 'Error desconocido' });
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

      type Factura = { number_ext: string | null; total: number | string | null };
      type FilaCxp = {
        id: string;
        invoice_id: string | null;
        amount: number | string | null;
        balance: number | string | null;
        due_date: string | null;
        status: string;
        days_overdue: number | null;
        discount_amount: number | string | null;
        created_at: string;
        invoice_purchase: Factura | Factura[] | null;
      };
      return ((data || []) as unknown as FilaCxp[]).map((item) => {
        const factura = Array.isArray(item.invoice_purchase) ? item.invoice_purchase[0] : item.invoice_purchase;
        return {
          id: item.id,
          invoice_id: item.invoice_id,
          amount: Number(item.amount) || 0,
          balance: Number(item.balance) || 0,
          due_date: item.due_date,
          status: item.status,
          days_overdue: item.days_overdue || 0,
          discount_amount: Number(item.discount_amount) || 0,
          created_at: item.created_at,
          invoice_number: factura?.number_ext || null,
          invoice_total: Number(factura?.total) || 0
        };
      });
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

      // Pagos con source = 'account_payable' y source_id IN cxpIds, o
      // source = 'invoice_purchase' y source_id IN invoiceIds. El filtro va al
      // servidor: antes se descargaban todos los pagos de la organización y se
      // cruzaban en el navegador.
      const columnas = 'id, source, source_id, method, amount, currency, reference, status, payment_date, created_at, discount_amount';
      const consultar = (source: string, ids: string[]) =>
        ids.length === 0
          ? Promise.resolve({ data: [] as SupplierPaymentRow[], error: null })
          : supabase
              .from('payments')
              .select(columnas)
              .eq('organization_id', organizationId)
              .eq('status', 'completed')
              .eq('source', source)
              .in('source_id', ids);

      const [deCxp, deFacturas] = await Promise.all([
        consultar('account_payable', cxpIds.map((id) => String(id))),
        consultar('invoice_purchase', invoiceIds.map((id) => String(id))),
      ]);
      if (deCxp.error) throw deCxp.error;
      if (deFacturas.error) throw deFacturas.error;

      const fecha = (p: SupplierPaymentRow) => p.payment_date ?? p.created_at ?? '';
      const filteredPayments = [...((deCxp.data ?? []) as SupplierPaymentRow[]), ...((deFacturas.data ?? []) as SupplierPaymentRow[])]
        .sort((a, b) => (fecha(a) < fecha(b) ? 1 : fecha(a) > fecha(b) ? -1 : 0));

      return filteredPayments.map((p) => ({
        id: p.id,
        source: p.source,
        source_id: p.source_id,
        method: p.method,
        amount: Number(p.amount) || 0,
        currency: p.currency,
        reference: p.reference,
        status: p.status,
        payment_date: p.payment_date,
        created_at: p.created_at,
        discount_amount: Number(p.discount_amount) || 0
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
          product:products!inner (
            id,
            uuid,
            name,
            sku,
            track_stock,
            status,
            organization_id
          )
        `)
        .eq('supplier_id', supplierId)
        // `product_suppliers` no tiene organization_id: el inquilino se
        // comprueba por el producto, no solo por RLS.
        .eq('product.organization_id', organizationId);

      if (error) throw error;

      if (!data || data.length === 0) return [];

      type FilaStock = {
        product_id: number;
        cost: number | string | null;
        is_preferred: boolean | null;
        supplier_sku: string | null;
        product: { uuid: string; name: string; sku: string | null; track_stock: boolean | null; status: string | null } | null;
      };
      const filas = (data as unknown as (Omit<FilaStock, 'product'> & { product: FilaStock['product'] | FilaStock['product'][] })[]).map(
        (f): FilaStock => ({ ...f, product: Array.isArray(f.product) ? (f.product[0] ?? null) : f.product }),
      );
      const productIds = filas.map((item) => item.product_id);

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

      return filas.map((item) => {
        const stock = stockMap.get(item.product_id) || { total: 0, branches: 0 };
        const costo = Number(item.cost) || 0;
        return {
          product_id: item.product_id,
          product_uuid: item.product?.uuid || '',
          product_name: item.product?.name || `Producto #${item.product_id}`,
          product_sku: item.product?.sku || '',
          track_stock: item.product?.track_stock || false,
          status: item.product?.status || 'active',
          cost: costo,
          is_preferred: item.is_preferred || false,
          supplier_sku: item.supplier_sku || null,
          stock_total: stock.total,
          branches_with_stock: stock.branches,
          stock_value: stock.total * costo
        };
      });
    } catch (error) {
      console.error('Error obteniendo stock del proveedor:', error);
      return [];
    }
  }

  /**
   * Proveedores a exportar: todos los de la organización o solo los
   * seleccionados en el listado (`ids`).
   */
  private async proveedoresParaExportar(organizationId: number, ids?: readonly number[]): Promise<Supplier[]> {
    if (!ids || ids.length === 0) {
      const { data } = await this.getSuppliers(organizationId, {}, 1, 10000);
      return data;
    }
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('organization_id', organizationId)
      .in('id', [...ids])
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Supplier[];
  }

  /**
   * Exportar proveedores a CSV
   */
  async exportSuppliersToCSV(organizationId: number, ids?: readonly number[]): Promise<string> {
    try {
      const data = await this.proveedoresParaExportar(organizationId, ids);
      
      if (!data || data.length === 0) return '';

      const headers = ['Nombre', 'Tipo', 'NIT', 'Tipo Doc', 'Contacto', 'Teléfono', 'Email', 'Descripción', 'Dirección', 'Ciudad', 'Departamento', 'País', 'Código Postal', 'Tax ID', 'Régimen Tributario', 'Responsabilidades Fiscales', 'Términos de Pago', 'Días Crédito', 'Sitio Web', 'Activo', 'Rating', 'Banco', 'Cuenta Bancaria', 'Tipo Cuenta', 'Notas', 'Fecha Creación'];

      const escapeCell = (value: string): string => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return `"${value}"`;
      };

      const rows = data.map(s => [
        s.name || '',
        s.supplier_type || 'company',
        s.nit || '',
        s.doc_type || '',
        s.contact || '',
        s.phone || '',
        s.email || '',
        s.description || '',
        s.address || '',
        s.city || '',
        s.state || '',
        s.country || '',
        s.postal_code || '',
        s.tax_id || '',
        s.tax_regime || '',
        (s.fiscal_responsibilities || []).join(';'),
        s.payment_terms || '',
        s.credit_days !== undefined && s.credit_days !== null ? String(s.credit_days) : '',
        s.website || '',
        s.is_active ? 'Sí' : 'No',
        s.rating !== undefined && s.rating !== null ? String(s.rating) : '',
        s.bank_name || '',
        s.bank_account || '',
        s.account_type || '',
        s.notes || '',
        new Date(s.created_at).toLocaleDateString('es-CO')
      ]);

      const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => escapeCell(cell)).join(','))].join('\n');
      return csvContent;
    } catch (error) {
      console.error('Error exportando proveedores:', error);
      return '';
    }
  }

  /**
   * Exportar proveedores a XLSX
   */
  async exportSuppliersToXLSX(organizationId: number, ids?: readonly number[]): Promise<Blob> {
    try {
      const data = await this.proveedoresParaExportar(organizationId, ids);

      if (!data || data.length === 0) {
        return new Blob([], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }

      const rows = data.map(s => ({
        'Nombre': s.name || '',
        'Tipo': s.supplier_type || 'company',
        'NIT': s.nit || '',
        'Tipo Doc': s.doc_type || '',
        'Contacto': s.contact || '',
        'Teléfono': s.phone || '',
        'Email': s.email || '',
        'Descripción': s.description || '',
        'Dirección': s.address || '',
        'Ciudad': s.city || '',
        'Departamento': s.state || '',
        'País': s.country || '',
        'Código Postal': s.postal_code || '',
        'Tax ID': s.tax_id || '',
        'Régimen Tributario': s.tax_regime || '',
        'Responsabilidades Fiscales': (s.fiscal_responsibilities || []).join(';'),
        'Términos de Pago': s.payment_terms || '',
        'Días Crédito': s.credit_days ?? '',
        'Sitio Web': s.website || '',
        'Activo': s.is_active ? 'Sí' : 'No',
        'Rating': s.rating ?? '',
        'Banco': s.bank_name || '',
        'Cuenta Bancaria': s.bank_account || '',
        'Tipo Cuenta': s.account_type || '',
        'Notas': s.notes || '',
        'Fecha Creación': new Date(s.created_at).toLocaleDateString('es-CO')
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } catch (error) {
      console.error('Error exportando proveedores a XLSX:', error);
      return new Blob([], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
  }

  /**
   * Exportar proveedores a PDF
   */
  async exportSuppliersToPDF(organizationId: number, ids?: readonly number[]): Promise<Blob> {
    try {
      const data = await this.proveedoresParaExportar(organizationId, ids);

      if (!data || data.length === 0) {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.text('No hay proveedores para exportar', 14, 20);
        return doc.output('blob');
      }

      const headers = [['Nombre', 'Tipo', 'NIT', 'Contacto', 'Teléfono', 'Email', 'Ciudad', 'País', 'Días Crédito', 'Activo']];

      const rowsArray = data.map(s => [
        s.name || '',
        s.supplier_type || 'company',
        s.nit || '',
        s.contact || '',
        s.phone || '',
        s.email || '',
        s.city || '',
        s.country || '',
        s.credit_days !== undefined && s.credit_days !== null ? String(s.credit_days) : '',
        s.is_active ? 'Sí' : 'No'
      ]);

      const doc = new jsPDF({ orientation: 'landscape' });
      doc.text('Listado de Proveedores', 14, 20);
      autoTable(doc, {
        head: headers,
        body: rowsArray,
        startY: 26,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [16, 185, 129] }
      });
      return doc.output('blob');
    } catch (error) {
      console.error('Error exportando proveedores a PDF:', error);
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.text('Error al generar el listado', 14, 20);
      return doc.output('blob');
    }
  }
}

export const supplierService = new SupplierService();
export default supplierService;
