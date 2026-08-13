import { supabase } from '@/lib/supabase/config';

// === Tipos ===

export type SerialStatus =
  | 'in_stock'
  | 'reserved'
  | 'sold'
  | 'returned'
  | 'in_transit'
  | 'damaged'
  | 'rma'
  | 'warranty_claim';

export type SaleChannel = 'in_stock' | 'pos' | 'web' | 'invoice' | 'table';

export type SerialEventType =
  | 'received'
  | 'stock_in'
  | 'reserved'
  | 'sold'
  | 'returned'
  | 'transferred'
  | 'damaged'
  | 'rma_created'
  | 'warranty_claim'
  | 'warranty_resolved'
  | 'status_change';

export interface SerialNumber {
  id: number;
  product_id: number;
  organization_id: number;
  branch_id: number | null;
  serial: string;
  status: SerialStatus;
  // Trazabilidad origen
  supplier_id: number | null;
  purchase_order_id: number | null;
  purchase_invoice_id: string | null;
  lot_id: number | null;
  // Trazabilidad venta
  sold_to_customer_id: string | null;
  sold_by_user_id: string | null;
  sale_channel: SaleChannel;
  sale_date: string | null;
  sale_id: string | null;
  web_order_id: string | null;
  invoice_sale_id: string | null;
  // Garantia
  warranty_start: string | null;
  warranty_end: string | null;
  warranty_months: number | null;
  // Costos
  cost_at_purchase: number;
  price_at_sale: number | null;
  // Ubicacion
  current_branch_id: number | null;
  received_date: string | null;
  notes: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SerialTrackingEvent {
  id: string;
  serial_number_id: number;
  organization_id: number;
  event_type: SerialEventType;
  from_branch_id: number | null;
  to_branch_id: number | null;
  from_status: string | null;
  to_status: string | null;
  source_table: string | null;
  source_id: string | null;
  purchase_order_id: number | null;
  purchase_invoice_id: string | null;
  sale_id: string | null;
  web_order_id: string | null;
  invoice_sale_id: string | null;
  customer_id: string | null;
  performed_by: string | null;
  event_date: string;
  notes: string | null;
  metadata: Record<string, unknown>;
}

export interface SerialWithDetails extends SerialNumber {
  products?: {
    id: number;
    sku: string;
    name: string;
    brand?: string;
    reference?: string;
    track_serial?: boolean;
    warranty_months?: number;
  };
  suppliers?: {
    id: number;
    name: string;
    nit?: string;
  };
  branches?: {
    id: number;
    name: string;
  };
  current_branch?: {
    id: number;
    name: string;
  };
  customers?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    full_name?: string;
  };
  sold_by_user?: {
    id: string;
    email?: string;
  };
  events?: SerialTrackingEvent[];
}

export interface SerialFilters {
  search?: string;
  productId?: number;
  status?: SerialStatus | 'all';
  branchId?: number | 'all';
  supplierId?: number;
  saleChannel?: SaleChannel | 'all';
  customerId?: string;
  purchaseOrderId?: number;
  purchaseInvoiceId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SerialStats {
  total: number;
  in_stock: number;
  reserved: number;
  sold: number;
  returned: number;
  in_transit: number;
  damaged: number;
  rma: number;
  warranty_claim: number;
  warrantyExpiringSoon: number;
}

export interface SerialInput {
  product_id: number;
  organization_id: number;
  branch_id: number;
  serial: string;
  supplier_id?: number;
  purchase_order_id?: number;
  purchase_invoice_id?: string;
  lot_id?: number;
  cost_at_purchase?: number;
  price_at_sale?: number;
  warranty_months?: number;
  notes?: string;
}

export interface SaleEventData {
  sale_id?: string;
  web_order_id?: string;
  invoice_sale_id?: string;
  customer_id?: string;
  sold_by_user_id?: string;
  sale_channel: SaleChannel;
  price_at_sale?: number;
  branch_id?: number;
}

// === Servicio ===

class SerialTrackingService {
  /**
   * Crear un serial nuevo
   */
  async createSerial(data: SerialInput): Promise<{ data: SerialNumber | null; error: Error | null }> {
    try {
      const now = new Date().toISOString();
      const warrantyMonths = data.warranty_months ?? null;
      const warrantyStart = warrantyMonths ? now.split('T')[0] : null;
      const warrantyEnd = warrantyMonths
        ? new Date(Date.now() + warrantyMonths * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null;

      const { data: serial, error } = await supabase
        .from('serial_numbers')
        .insert({
          product_id: data.product_id,
          organization_id: data.organization_id,
          branch_id: data.branch_id,
          current_branch_id: data.branch_id,
          serial: data.serial,
          status: 'in_stock',
          supplier_id: data.supplier_id ?? null,
          purchase_order_id: data.purchase_order_id ?? null,
          purchase_invoice_id: data.purchase_invoice_id ?? null,
          lot_id: data.lot_id ?? null,
          cost_at_purchase: data.cost_at_purchase ?? 0,
          price_at_sale: data.price_at_sale ?? null,
          received_date: now,
          warranty_months: warrantyMonths,
          warranty_start: warrantyStart,
          warranty_end: warrantyEnd,
          notes: data.notes ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      // Crear evento de recepcion
      await this.createTrackingEvent({
        serial_number_id: serial.id,
        organization_id: data.organization_id,
        event_type: data.purchase_invoice_id ? 'stock_in' : 'received',
        to_status: 'in_stock',
        to_branch_id: data.branch_id,
        source_table: data.purchase_order_id ? 'purchase_orders' : data.purchase_invoice_id ? 'invoice_purchase' : 'manual',
        source_id: data.purchase_order_id ? String(data.purchase_order_id) : data.purchase_invoice_id ?? 'manual',
        purchase_order_id: data.purchase_order_id ?? null,
        purchase_invoice_id: data.purchase_invoice_id ?? null,
      });

      return { data: serial as SerialNumber, error: null };
    } catch (error: any) {
      console.error('Error creando serial:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Crear multiples seriales a la vez
   */
  async createSerials(items: SerialInput[]): Promise<{ data: SerialNumber[]; errors: string[] }> {
    const results: SerialNumber[] = [];
    const errors: string[] = [];

    for (const item of items) {
      const { data, error } = await this.createSerial(item);
      if (error) {
        errors.push(`Serial ${item.serial}: ${error.message}`);
      } else if (data) {
        results.push(data);
      }
    }

    return { data: results, errors };
  }

  /**
   * Obtener seriales con filtros y paginacion
   */
  async getSerials(
    organizationId: number,
    filters?: SerialFilters,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ data: SerialWithDetails[]; count: number; error: Error | null }> {
    try {
      const offset = (page - 1) * pageSize;

      let query = supabase
        .from('serial_numbers')
        .select(
          `
          *,
          products:product_id (id, sku, name, brand, reference, track_serial, warranty_months),
          suppliers:supplier_id (id, name, nit),
          branches:branch_id (id, name),
          current_branch:current_branch_id (id, name),
          customers:sold_to_customer_id (id, first_name, last_name, email, phone, full_name)
        `,
          { count: 'exact' }
        )
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (filters?.search) {
        query = query.ilike('serial', `%${filters.search}%`);
      }
      if (filters?.productId) {
        query = query.eq('product_id', filters.productId);
      }
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.branchId && filters.branchId !== 'all') {
        query = query.eq('current_branch_id', filters.branchId);
      }
      if (filters?.supplierId) {
        query = query.eq('supplier_id', filters.supplierId);
      }
      if (filters?.saleChannel && filters.saleChannel !== 'all') {
        query = query.eq('sale_channel', filters.saleChannel);
      }
      if (filters?.customerId) {
        query = query.eq('sold_to_customer_id', filters.customerId);
      }
      if (filters?.purchaseOrderId) {
        query = query.eq('purchase_order_id', filters.purchaseOrderId);
      }
      if (filters?.purchaseInvoiceId) {
        query = query.eq('purchase_invoice_id', filters.purchaseInvoiceId);
      }
      if (filters?.dateFrom) {
        query = query.gte('received_date', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('received_date', filters.dateTo);
      }

      const { data, count, error } = await query;

      if (error) throw error;

      return {
        data: (data || []) as SerialWithDetails[],
        count: count || 0,
        error: null,
      };
    } catch (error: any) {
      console.error('Error obteniendo seriales:', error?.message || error);
      return { data: [], count: 0, error: error as Error };
    }
  }

  /**
   * Obtener un serial por su numero (texto)
   */
  async getSerialByNumber(
    serial: string,
    organizationId: number
  ): Promise<{ data: SerialWithDetails | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(
          `
          *,
          products:product_id (id, sku, name, brand, reference, track_serial, warranty_months),
          suppliers:supplier_id (id, name, nit),
          branches:branch_id (id, name),
          current_branch:current_branch_id (id, name),
          customers:sold_to_customer_id (id, first_name, last_name, email, phone, full_name)
        `
        )
        .eq('serial', serial)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return { data: null, error: new Error('Serial no encontrado') };
      }

      // Obtener eventos de trazabilidad
      const { data: events } = await supabase
        .from('serial_tracking_events')
        .select('*')
        .eq('serial_number_id', data.id)
        .order('event_date', { ascending: true });

      return {
        data: { ...data, events: events || [] } as SerialWithDetails,
        error: null,
      };
    } catch (error: any) {
      console.error('Error obteniendo serial por numero:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Obtener un serial por ID
   */
  async getSerialById(id: number): Promise<{ data: SerialWithDetails | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(
          `
          *,
          products:product_id (id, sku, name, brand, reference, track_serial, warranty_months),
          suppliers:supplier_id (id, name, nit),
          branches:branch_id (id, name),
          current_branch:current_branch_id (id, name),
          customers:sold_to_customer_id (id, first_name, last_name, email, phone, full_name)
        `
        )
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return { data: null, error: new Error('Serial no encontrado') };
      }

      const { data: events } = await supabase
        .from('serial_tracking_events')
        .select('*')
        .eq('serial_number_id', id)
        .order('event_date', { ascending: true });

      return {
        data: { ...data, events: events || [] } as SerialWithDetails,
        error: null,
      };
    } catch (error: any) {
      console.error('Error obteniendo serial por ID:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Obtener seriales por producto (con filtro opcional de sucursal)
   */
  async getSerialsByProduct(
    productId: number,
    branchId?: number,
    status?: SerialStatus
  ): Promise<{ data: SerialNumber[]; error: Error | null }> {
    try {
      let query = supabase
        .from('serial_numbers')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (branchId) {
        query = query.eq('current_branch_id', branchId);
      }
      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { data: (data || []) as SerialNumber[], error: null };
    } catch (error: any) {
      console.error('Error obteniendo seriales por producto:', error?.message || error);
      return { data: [], error: error as Error };
    }
  }

  /**
   * Obtener seriales por orden de compra
   */
  async getSerialsByPurchaseOrder(poId: number): Promise<{ data: SerialWithDetails[]; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(
          `
          *,
          products:product_id (id, sku, name),
          branches:branch_id (id, name)
        `
        )
        .eq('purchase_order_id', poId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return { data: (data || []) as SerialWithDetails[], error: null };
    } catch (error: any) {
      console.error('Error obteniendo seriales por OC:', error?.message || error);
      return { data: [], error: error as Error };
    }
  }

  /**
   * Obtener seriales por factura de compra
   */
  async getSerialsByPurchaseInvoice(invoiceId: string): Promise<{ data: SerialWithDetails[]; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(
          `
          *,
          products:product_id (id, sku, name),
          branches:branch_id (id, name)
        `
        )
        .eq('purchase_invoice_id', invoiceId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return { data: (data || []) as SerialWithDetails[], error: null };
    } catch (error: any) {
      console.error('Error obteniendo seriales por factura compra:', error?.message || error);
      return { data: [], error: error as Error };
    }
  }

  /**
   * Obtener seriales comprados por un cliente
   */
  async getSerialsByCustomer(customerId: string): Promise<{ data: SerialWithDetails[]; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(
          `
          *,
          products:product_id (id, sku, name, brand),
          branches:branch_id (id, name)
        `
        )
        .eq('sold_to_customer_id', customerId)
        .order('sale_date', { ascending: false });

      if (error) throw error;

      return { data: (data || []) as SerialWithDetails[], error: null };
    } catch (error: any) {
      console.error('Error obteniendo seriales por cliente:', error?.message || error);
      return { data: [], error: error as Error };
    }
  }

  /**
   * Obtener historial completo de eventos de un serial
   */
  async getSerialHistory(serialId: number): Promise<{ data: SerialTrackingEvent[]; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('serial_tracking_events')
        .select('*')
        .eq('serial_number_id', serialId)
        .order('event_date', { ascending: true });

      if (error) throw error;

      return { data: (data || []) as SerialTrackingEvent[], error: null };
    } catch (error: any) {
      console.error('Error obteniendo historial de serial:', error?.message || error);
      return { data: [], error: error as Error };
    }
  }

  /**
   * Obtener trazabilidad completa de un serial por su numero
   */
  async getFullTraceability(
    serial: string,
    organizationId: number
  ): Promise<{ data: SerialWithDetails | null; error: Error | null }> {
    return this.getSerialByNumber(serial, organizationId);
  }

  /**
   * Actualizar estado de un serial y crear evento de tracking
   */
  async updateStatus(
    serialId: number,
    newStatus: SerialStatus,
    eventData?: {
      event_type?: SerialEventType;
      source_table?: string;
      source_id?: string;
      notes?: string;
      performed_by?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<{ error: Error | null }> {
    try {
      // Obtener estado actual
      const { data: current, error: fetchError } = await supabase
        .from('serial_numbers')
        .select('status, organization_id, current_branch_id')
        .eq('id', serialId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!current) throw new Error('Serial no encontrado');

      // Actualizar estado
      const { error: updateError } = await supabase
        .from('serial_numbers')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          updated_by: eventData?.performed_by ?? null,
        })
        .eq('id', serialId);

      if (updateError) throw updateError;

      // Crear evento
      await this.createTrackingEvent({
        serial_number_id: serialId,
        organization_id: current.organization_id,
        event_type: eventData?.event_type ?? 'status_change',
        from_status: current.status,
        to_status: newStatus,
        from_branch_id: current.current_branch_id,
        source_table: eventData?.source_table ?? 'manual',
        source_id: eventData?.source_id ?? null,
        notes: eventData?.notes,
        performed_by: eventData?.performed_by,
        metadata: eventData?.metadata,
      });

      return { error: null };
    } catch (error: any) {
      console.error('Error actualizando estado de serial:', error?.message || error);
      return { error: error as Error };
    }
  }

  /**
   * Transferir un serial a otra sucursal
   */
  async transferSerial(
    serialId: number,
    toBranchId: number,
    userId?: string
  ): Promise<{ error: Error | null }> {
    try {
      const { data: current, error: fetchError } = await supabase
        .from('serial_numbers')
        .select('status, organization_id, current_branch_id')
        .eq('id', serialId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!current) throw new Error('Serial no encontrado');

      const { error: updateError } = await supabase
        .from('serial_numbers')
        .update({
          current_branch_id: toBranchId,
          status: 'in_transit',
          updated_at: new Date().toISOString(),
          updated_by: userId ?? null,
        })
        .eq('id', serialId);

      if (updateError) throw updateError;

      await this.createTrackingEvent({
        serial_number_id: serialId,
        organization_id: current.organization_id,
        event_type: 'transferred',
        from_status: current.status,
        to_status: 'in_transit',
        from_branch_id: current.current_branch_id,
        to_branch_id: toBranchId,
        source_table: 'inventory_transfers',
        performed_by: userId,
      });

      return { error: null };
    } catch (error: any) {
      console.error('Error transfiriendo serial:', error?.message || error);
      return { error: error as Error };
    }
  }

  /**
   * Marcar un serial como danado
   */
  async markAsDamaged(serialId: number, notes: string, userId?: string): Promise<{ error: Error | null }> {
    return this.updateStatus(serialId, 'damaged', {
      event_type: 'damaged',
      notes,
      performed_by: userId,
    });
  }

  /**
   * Registrar devolucion de cliente
   */
  async returnSerial(serialId: number, reason: string, userId?: string): Promise<{ error: Error | null }> {
    return this.updateStatus(serialId, 'returned', {
      event_type: 'returned',
      notes: reason,
      performed_by: userId,
    });
  }

  /**
   * Vender uno o mas seriales
   */
  async sellSerials(
    serialIds: number[],
    saleData: SaleEventData,
    userId?: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    const now = new Date().toISOString();

    for (const serialId of serialIds) {
      try {
        const { data: current, error: fetchError } = await supabase
          .from('serial_numbers')
          .select('status, organization_id, current_branch_id, product_id')
          .eq('id', serialId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!current) {
          errors.push(`Serial ${serialId}: no encontrado`);
          continue;
        }

        if (current.status !== 'in_stock' && current.status !== 'reserved') {
          errors.push(`Serial ${serialId}: estado ${current.status}, no disponible para venta`);
          continue;
        }

        const { error: updateError } = await supabase
          .from('serial_numbers')
          .update({
            status: 'sold',
            sale_channel: saleData.sale_channel,
            sale_date: now,
            sale_id: saleData.sale_id ?? null,
            web_order_id: saleData.web_order_id ?? null,
            invoice_sale_id: saleData.invoice_sale_id ?? null,
            sold_to_customer_id: saleData.customer_id ?? null,
            sold_by_user_id: saleData.sold_by_user_id ?? null,
            price_at_sale: saleData.price_at_sale ?? null,
            current_branch_id: saleData.branch_id ?? current.current_branch_id,
            updated_at: now,
            updated_by: userId ?? null,
          })
          .eq('id', serialId);

        if (updateError) throw updateError;

        const sourceTable =
          saleData.sale_channel === 'web'
            ? 'web_orders'
            : saleData.sale_channel === 'invoice'
              ? 'invoice_sales'
              : 'sales';

        const sourceId =
          saleData.web_order_id ?? saleData.invoice_sale_id ?? saleData.sale_id ?? null;

        await this.createTrackingEvent({
          serial_number_id: serialId,
          organization_id: current.organization_id,
          event_type: 'sold',
          from_status: current.status,
          to_status: 'sold',
          to_branch_id: saleData.branch_id ?? current.current_branch_id,
          source_table: sourceTable,
          source_id: sourceId,
          sale_id: saleData.sale_id ?? null,
          web_order_id: saleData.web_order_id ?? null,
          invoice_sale_id: saleData.invoice_sale_id ?? null,
          customer_id: saleData.customer_id,
          performed_by: userId,
        });
      } catch (err: any) {
        errors.push(`Serial ${serialId}: ${err.message}`);
      }
    }

    return { success: errors.length === 0, errors };
  }

  /**
   * Reservar seriales para un pedido web
   */
  async reserveSerials(
    serialIds: number[],
    webOrderId: string,
    userId?: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    const now = new Date().toISOString();

    for (const serialId of serialIds) {
      try {
        const { data: current, error: fetchError } = await supabase
          .from('serial_numbers')
          .select('status, organization_id')
          .eq('id', serialId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!current) {
          errors.push(`Serial ${serialId}: no encontrado`);
          continue;
        }

        if (current.status !== 'in_stock') {
          errors.push(`Serial ${serialId}: no disponible para reserva`);
          continue;
        }

        const { error: updateError } = await supabase
          .from('serial_numbers')
          .update({
            status: 'reserved',
            web_order_id: webOrderId,
            updated_at: now,
            updated_by: userId ?? null,
          })
          .eq('id', serialId);

        if (updateError) throw updateError;

        await this.createTrackingEvent({
          serial_number_id: serialId,
          organization_id: current.organization_id,
          event_type: 'reserved',
          from_status: 'in_stock',
          to_status: 'reserved',
          source_table: 'web_orders',
          source_id: webOrderId,
          web_order_id: webOrderId,
          performed_by: userId,
        });
      } catch (err: any) {
        errors.push(`Serial ${serialId}: ${err.message}`);
      }
    }

    return { success: errors.length === 0, errors };
  }

  /**
   * Liberar seriales reservados al cancelar un pedido web
   */
  async releaseReservedSerials(webOrderId: string): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];
    const now = new Date().toISOString();

    try {
      const { data: reserved, error: fetchError } = await supabase
        .from('serial_numbers')
        .select('id, organization_id')
        .eq('web_order_id', webOrderId)
        .eq('status', 'reserved');

      if (fetchError) throw fetchError;

      if (!reserved || reserved.length === 0) {
        return { success: true, errors: [] };
      }

      for (const serial of reserved) {
        const { error: updateError } = await supabase
          .from('serial_numbers')
          .update({
            status: 'in_stock',
            web_order_id: null,
            updated_at: now,
          })
          .eq('id', serial.id);

        if (updateError) {
          errors.push(`Serial ${serial.id}: ${updateError.message}`);
          continue;
        }

        await this.createTrackingEvent({
          serial_number_id: serial.id,
          organization_id: serial.organization_id,
          event_type: 'status_change',
          from_status: 'reserved',
          to_status: 'in_stock',
          source_table: 'web_orders',
          source_id: webOrderId,
          notes: 'Reserva liberada por cancelacion de pedido',
        });
      }
    } catch (err: any) {
      errors.push(err.message);
    }

    return { success: errors.length === 0, errors };
  }

  /**
   * Obtener informacion de garantia de un serial
   */
  async getWarrantyInfo(
    serial: string,
    organizationId: number
  ): Promise<{ data: { valid: boolean; endDate: string | null; daysLeft: number } | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('serial_numbers')
        .select('warranty_start, warranty_end, warranty_months, status')
        .eq('serial', serial)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { data: null, error: new Error('Serial no encontrado') };

      if (!data.warranty_end) {
        return { data: { valid: false, endDate: null, daysLeft: 0 }, error: null };
      }

      const endDate = new Date(data.warranty_end);
      const now = new Date();
      const diffMs = endDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
        data: {
          valid: daysLeft > 0,
          endDate: data.warranty_end,
          daysLeft,
        },
        error: null,
      };
    } catch (error: any) {
      console.error('Error obteniendo info de garantia:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Validar si un serial existe en la organizacion
   */
  async validateSerialExists(serial: string, organizationId: number): Promise<boolean> {
    const { data, error } = await supabase
      .from('serial_numbers')
      .select('id')
      .eq('serial', serial)
      .eq('organization_id', organizationId)
      .maybeSingle();

    return !error && !!data;
  }

  /**
   * Validar si un serial esta disponible para venta en una sucursal
   */
  async validateSerialAvailable(serialId: number, branchId: number): Promise<boolean> {
    const { data, error } = await supabase
      .from('serial_numbers')
      .select('status, current_branch_id')
      .eq('id', serialId)
      .maybeSingle();

    if (error || !data) return false;

    return (
      (data.status === 'in_stock' || data.status === 'reserved') &&
      data.current_branch_id === branchId
    );
  }

  /**
   * Validar si un serial tiene garantia vigente
   */
  async validateSerialForWarranty(serial: string, organizationId: number): Promise<boolean> {
    const { data } = await this.getWarrantyInfo(serial, organizationId);
    return data?.valid ?? false;
  }

  /**
   * Obtener estadisticas de seriales
   */
  async getStats(organizationId: number, branchId?: number): Promise<{ data: SerialStats | null; error: Error | null }> {
    try {
      let query = supabase
        .from('serial_numbers')
        .select('status, warranty_end')
        .eq('organization_id', organizationId);

      if (branchId) {
        query = query.eq('current_branch_id', branchId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const stats: SerialStats = {
        total: data?.length ?? 0,
        in_stock: 0,
        reserved: 0,
        sold: 0,
        returned: 0,
        in_transit: 0,
        damaged: 0,
        rma: 0,
        warranty_claim: 0,
        warrantyExpiringSoon: 0,
      };

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      for (const item of data || []) {
        if (item.status in stats) {
          (stats as any)[item.status]++;
        }
        if (item.warranty_end) {
          const endDate = new Date(item.warranty_end);
          if (endDate > now && endDate <= thirtyDaysFromNow) {
            stats.warrantyExpiringSoon++;
          }
        }
      }

      return { data: stats, error: null };
    } catch (error: any) {
      console.error('Error obteniendo estadisticas de seriales:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Generar seriales masivamente basado en el patrón del producto y el stock actual
   */
  async generateSerialsFromPattern(
    productId: number,
    organizationId: number,
    pattern: string,
    quantity: number,
    branchId?: number,
    warrantyMonths?: number | null,
    costAtPurchase?: number,
    priceAtSale?: number
  ): Promise<{ data: SerialNumber[]; errors: string[] }> {
    try {
      // Obtener seriales existentes para calcular el siguiente consecutivo
      const { data: existing } = await supabase
        .from('serial_numbers')
        .select('serial')
        .eq('product_id', productId)
        .order('created_at', { ascending: true });

      const existingCount = existing?.length ?? 0;
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const yy = yyyy.slice(2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');

      // Obtener SKU y precio del producto para {PROD} y captura de precio
      const { data: product } = await supabase
        .from('products')
        .select(`
          sku,
          product_prices(price)
        `)
        .eq('id', productId)
        .maybeSingle();

      const prodCode = product?.sku || `P${productId}`;

      // Precio de venta vigente del producto
      let currentPrice = priceAtSale ?? 0;
      if (!currentPrice && product?.product_prices && product.product_prices.length > 0) {
        const now = new Date();
        const vigente = product.product_prices
          .filter((p: any) => {
            const from = p.effective_from ? new Date(p.effective_from) : null;
            return !from || from <= now;
          })
          .sort((a: any, b: any) =>
            new Date(b.effective_from || 0).getTime() - new Date(a.effective_from || 0).getTime()
          )[0];
        if (vigente) currentPrice = vigente.price;
      }

      const serials: SerialInput[] = [];
      for (let i = 0; i < quantity; i++) {
        const seq = existingCount + i + 1;
        const serial = pattern
          .replace(/\{PROD\}/g, prodCode)
          .replace(/\{YYYY\}/g, yyyy)
          .replace(/\{YY\}/g, yy)
          .replace(/\{MM\}/g, mm)
          .replace(/\{DD\}/g, dd)
          .replace(/\{SEQ\}/g, String(seq).padStart(6, '0'))
          .replace(/\{####\}/g, String(seq).padStart(4, '0'))
          .replace(/\{###\}/g, String(seq).padStart(3, '0'))
          .replace(/\{##\}/g, String(seq).padStart(2, '0'));

        serials.push({
          product_id: productId,
          organization_id: organizationId,
          branch_id: branchId ?? 0,
          serial,
          warranty_months: warrantyMonths ?? undefined,
          cost_at_purchase: costAtPurchase ?? 0,
          price_at_sale: currentPrice || undefined,
          notes: 'Generado masivamente desde patrón',
        });
      }

      return await this.createSerials(serials);
    } catch (error: any) {
      console.error('Error generando seriales desde patrón:', error?.message || error);
      return { data: [], errors: [error?.message || 'Error inesperado'] };
    }
  }

  /**
   * Metodo interno: crear evento de tracking
   */
  /**
   * Obtener seriales disponibles (in_stock) para un producto en una sucursal
   */
  async getAvailableSerials(
    productId: number,
    organizationId: number,
    branchId?: number
  ): Promise<SerialNumber[]> {
    try {
      let query = supabase
        .from('serial_numbers')
        .select('*')
        .eq('product_id', productId)
        .eq('organization_id', organizationId)
        .eq('status', 'in_stock')
        .order('received_date', { ascending: true });

      if (branchId !== undefined) {
        query = query.eq('current_branch_id', branchId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as SerialNumber[];
    } catch (err: any) {
      console.error('Error obteniendo seriales disponibles:', err.message);
      return [];
    }
  }

  private async createTrackingEvent(event: {
    serial_number_id: number;
    organization_id: number;
    event_type: SerialEventType;
    from_branch_id?: number | null;
    to_branch_id?: number | null;
    from_status?: string | null;
    to_status?: string | null;
    source_table?: string | null;
    source_id?: string | null;
    purchase_order_id?: number | null;
    purchase_invoice_id?: string | null;
    sale_id?: string | null;
    web_order_id?: string | null;
    invoice_sale_id?: string | null;
    customer_id?: string | null;
    performed_by?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await supabase.from('serial_tracking_events').insert({
      serial_number_id: event.serial_number_id,
      organization_id: event.organization_id,
      event_type: event.event_type,
      from_branch_id: event.from_branch_id ?? null,
      to_branch_id: event.to_branch_id ?? null,
      from_status: event.from_status ?? null,
      to_status: event.to_status ?? null,
      source_table: event.source_table ?? null,
      source_id: event.source_id ?? null,
      purchase_order_id: event.purchase_order_id ?? null,
      purchase_invoice_id: event.purchase_invoice_id ?? null,
      sale_id: event.sale_id ?? null,
      web_order_id: event.web_order_id ?? null,
      invoice_sale_id: event.invoice_sale_id ?? null,
      customer_id: event.customer_id ?? null,
      performed_by: event.performed_by ?? null,
      notes: event.notes ?? null,
      metadata: event.metadata ?? {},
    });

    if (error) {
      console.warn('Error creando tracking event:', error.message);
    }
  }
}

export const serialTrackingService = new SerialTrackingService();
export default serialTrackingService;
