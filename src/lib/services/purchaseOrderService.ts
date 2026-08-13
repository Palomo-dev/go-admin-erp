import { supabase } from '@/lib/supabase/config';
import { stockMovementService, type StockDecrementResult } from '@/lib/services/stockMovementService';
import { serialTrackingService } from '@/lib/services/serialTrackingService';

// Tipos para Órdenes de Compra
export interface PurchaseOrder {
  id: number;
  uuid: string;
  organization_id: number;
  branch_id: number;
  supplier_id: number;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  expected_date?: string;
  total: number;
  created_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  suppliers?: {
    id: number;
    name: string;
    uuid: string;
    email?: string;
    phone?: string;
    contact?: string;
  };
  branches?: {
    id: number;
    name: string;
  };
  created_by_user?: {
    email: string;
  };
}

export interface PurchaseOrderItem {
  id: number;
  purchase_order_id: number;
  product_id: number;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  received_quantity: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  products?: {
    id: number;
    uuid: string;
    sku: string;
    name: string;
    unit_code?: string;
  };
}

export interface PurchaseOrderInput {
  branch_id: number;
  supplier_id: number;
  expected_date?: string;
  notes?: string;
  status?: 'draft' | 'sent';
}

export interface PurchaseOrderItemInput {
  product_id: number;
  quantity: number;
  unit_cost: number;
  notes?: string;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
}

// Estadísticas
export interface PurchaseOrderStats {
  total: number;
  draft: number;
  sent: number;
  partial: number;
  received: number;
  cancelled: number;
  totalAmount: number;
}

class PurchaseOrderService {
  /**
   * Obtener lista de órdenes de compra con filtros
   */
  async getPurchaseOrders(
    organizationId: number,
    filters?: {
      status?: string;
      supplierId?: number;
      branchId?: number;
      search?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ data: PurchaseOrder[]; error: Error | null }> {
    try {
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers:supplier_id (id, name, uuid),
          branches:branch_id (id, name)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.supplierId) {
        query = query.eq('supplier_id', filters.supplierId);
      }
      if (filters?.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }
      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { data: data as PurchaseOrder[], error: null };
    } catch (error: any) {
      console.error('Error obteniendo órdenes de compra:', error?.message || error);
      return { data: [], error: error as Error };
    }
  }

  /**
   * Obtener una orden de compra por UUID con sus items
   */
  async getPurchaseOrderByUuid(
    orderUuid: string,
    organizationId: number
  ): Promise<{ data: PurchaseOrderWithItems | null; error: Error | null }> {
    try {
      // Validar UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orderUuid)) {
        return { data: null, error: new Error('UUID de orden inválido') };
      }

      // Obtener la orden
      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers:supplier_id (id, name, uuid, email, phone, contact),
          branches:branch_id (id, name)
        `)
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .single();

      if (orderError) {
        if (orderError.code === 'PGRST116') {
          return { data: null, error: new Error('Orden de compra no encontrada') };
        }
        throw orderError;
      }

      // Obtener los items usando el ID numérico interno
      const { data: items, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          products:product_id (id, uuid, sku, name, unit_code)
        `)
        .eq('purchase_order_id', order.id)
        .order('id', { ascending: true });

      if (itemsError) throw itemsError;

      return {
        data: {
          ...(order as PurchaseOrder),
          items: items as PurchaseOrderItem[]
        },
        error: null
      };
    } catch (error: any) {
      console.error('Error obteniendo orden de compra:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Crear nueva orden de compra
   */
  async createPurchaseOrder(
    organizationId: number,
    input: PurchaseOrderInput,
    items: PurchaseOrderItemInput[]
  ): Promise<{ data: PurchaseOrder | null; error: Error | null }> {
    try {
      // Obtener el usuario actual
      const { data: { user } } = await supabase.auth.getUser();

      // Crear la orden
      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .insert({
          organization_id: organizationId,
          branch_id: input.branch_id,
          supplier_id: input.supplier_id,
          status: input.status || 'draft',
          expected_date: input.expected_date || null,
          notes: input.notes || null,
          created_by: user?.id || null,
          total: 0
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Insertar items si existen
      if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
          purchase_order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          notes: item.notes || null
        }));

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        // Actualizar total de la orden
        const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
        await supabase
          .from('purchase_orders')
          .update({ total })
          .eq('id', order.id);
      }

      return { data: order as PurchaseOrder, error: null };
    } catch (error: any) {
      console.error('Error creando orden de compra:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Actualizar orden de compra por UUID
   */
  async updatePurchaseOrder(
    orderUuid: string,
    organizationId: number,
    input: Partial<PurchaseOrderInput>,
    items?: PurchaseOrderItemInput[]
  ): Promise<{ data: PurchaseOrder | null; error: Error | null }> {
    try {
      // Actualizar la orden
      const { data: order, error: orderError } = await supabase
        .from('purchase_orders')
        .update({
          branch_id: input.branch_id,
          supplier_id: input.supplier_id,
          expected_date: input.expected_date || null,
          notes: input.notes || null,
          status: input.status,
          updated_at: new Date().toISOString()
        })
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (orderError) throw orderError;

      // Si se proporcionan items, actualizar
      if (items) {
        // Eliminar items existentes
        await supabase
          .from('purchase_order_items')
          .delete()
          .eq('purchase_order_id', order.id);

        // Insertar nuevos items
        if (items.length > 0) {
          const itemsToInsert = items.map((item: PurchaseOrderItemInput) => ({
            purchase_order_id: order.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            notes: item.notes || null
          }));

          const { error: itemsError } = await supabase
            .from('purchase_order_items')
            .insert(itemsToInsert);

          if (itemsError) throw itemsError;

          // Actualizar total
          const total = items.reduce((sum: number, item: PurchaseOrderItemInput) => sum + (item.quantity * item.unit_cost), 0);
          await supabase
            .from('purchase_orders')
            .update({ total })
            .eq('id', order.id);
        }
      }

      return { data: order as PurchaseOrder, error: null };
    } catch (error: any) {
      console.error('Error actualizando orden de compra:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Escribe el estado tal cual, sin validar. Uso interno.
   *
   * Solo `receiveItems` puede dejar una orden en 'partial' o 'received', porque
   * esos dos estados significan "esta mercancia ya entro al inventario" y se
   * derivan de las cantidades realmente recibidas.
   */
  private async setStatus(
    orderUuid: string,
    organizationId: number,
    newStatus: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error actualizando estado:', error?.message || error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Cambiar estado de orden de compra por UUID.
   *
   * No acepta 'received' ni 'partial': antes si los aceptaba, y marcar una orden
   * como recibida desde el listado solo cambiaba el status sin sumar una sola
   * unidad al inventario. Para recibir hay que pasar por `receiveItems` o
   * `receiveAllPending`, que son los unicos que mueven stock.
   */
  async updateStatus(
    orderUuid: string,
    organizationId: number,
    newStatus: 'draft' | 'sent' | 'cancelled'
  ): Promise<{ success: boolean; error: Error | null }> {
    // Guarda defensiva en runtime: el tipo ya excluye estos estados, pero la
    // llamada puede venir de codigo sin tipar (o de un cast) y el coste de dejar
    // pasar un 'received' aqui es una orden recibida sin stock.
    if (['received', 'partial'].includes(newStatus)) {
      return {
        success: false,
        error: new Error('Para recibir una orden usa receiveItems/receiveAllPending, que si registran el stock'),
      };
    }

    return this.setStatus(orderUuid, organizationId, newStatus);
  }

  /**
   * Recibe de golpe todo lo que quede pendiente de la orden y suma el stock.
   *
   * Es lo que necesita el boton "marcar como recibida" del listado: completar
   * cada linea hasta su cantidad pedida pasando por el mismo camino que la
   * recepcion manual, en vez de tocar el status por su cuenta.
   */
  async receiveAllPending(
    orderUuid: string,
    organizationId: number
  ): Promise<{ success: boolean; error: Error | null; stock?: StockDecrementResult }> {
    try {
      const { data: order } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .single();

      if (!order) {
        return { success: false, error: new Error('Orden no encontrada') };
      }

      const { data: items } = await supabase
        .from('purchase_order_items')
        .select('id, quantity, received_quantity')
        .eq('purchase_order_id', order.id);

      if (!items || items.length === 0) {
        return { success: false, error: new Error('La orden no tiene items para recibir') };
      }

      const pending = items
        .filter((item) => Number(item.received_quantity) < Number(item.quantity))
        .map((item) => ({ itemId: item.id, quantity: Number(item.quantity) }));

      if (pending.length === 0) {
        return { success: false, error: new Error('La orden ya fue recibida por completo') };
      }

      return this.receiveItems(orderUuid, organizationId, pending);
    } catch (error: any) {
      console.error('Error recibiendo orden completa:', error?.message || error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Eliminar orden de compra por UUID (solo draft)
   */
  async deletePurchaseOrder(
    orderUuid: string,
    organizationId: number
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      // Verificar que esté en draft
      const { data: order } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .single();

      if (order?.status !== 'draft') {
        return { success: false, error: new Error('Solo se pueden eliminar órdenes en borrador') };
      }

      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error eliminando orden:', error?.message || error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Duplicar orden de compra por UUID
   */
  async duplicatePurchaseOrder(
    orderUuid: string,
    organizationId: number
  ): Promise<{ data: PurchaseOrder | null; error: Error | null }> {
    try {
      // Obtener orden original con items
      const { data: original, error: getError } = await this.getPurchaseOrderByUuid(orderUuid, organizationId);

      if (getError || !original) {
        throw getError || new Error('Orden no encontrada');
      }

      // Crear nueva orden
      const { data: newOrder, error: createError } = await this.createPurchaseOrder(
        organizationId,
        {
          branch_id: original.branch_id,
          supplier_id: original.supplier_id,
          expected_date: original.expected_date,
          notes: original.notes ? `(Copia) ${original.notes}` : '(Copia)',
          status: 'draft'
        },
        original.items.map((item: PurchaseOrderItem) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          notes: item.notes
        }))
      );

      if (createError) throw createError;

      return { data: newOrder, error: null };
    } catch (error: any) {
      console.error('Error duplicando orden:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Recibir items (parcial o total) por UUID
   */
  async receiveItems(
    orderUuid: string,
    organizationId: number,
    itemsReceived: { itemId: number; quantity: number }[]
  ): Promise<{ success: boolean; error: Error | null; stock?: StockDecrementResult }> {
    try {
      // Obtener el ID numérico de la orden y branch_id
      const { data: order } = await supabase
        .from('purchase_orders')
        .select('id, branch_id')
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .single();

      if (!order) {
        return { success: false, error: new Error('Orden no encontrada') };
      }

      const orderId = order.id;
      const branchId = order.branch_id;

      // Obtener received_quantity actual para calcular delta
      const itemIds = itemsReceived.map(i => i.itemId);
      const { data: currentItems } = await supabase
        .from('purchase_order_items')
        .select('id, product_id, unit_cost, received_quantity')
        .in('id', itemIds)
        .eq('purchase_order_id', orderId);

      const currentMap = new Map((currentItems || []).map(i => [i.id, i]));

      // Actualizar cantidad recibida de cada item
      for (const item of itemsReceived) {
        const { error } = await supabase
          .from('purchase_order_items')
          .update({
            received_quantity: item.quantity,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.itemId)
          .eq('purchase_order_id', orderId);

        if (error) throw error;
      }

      // Sumar stock por el delta recibido (nuevo - anterior)
      let stockResult: StockDecrementResult | undefined;
      try {
        const stockItems = itemsReceived
          .map(item => {
            const current = currentMap.get(item.itemId);
            if (!current || !current.product_id) return null;
            const prevQty = Number(current.received_quantity) || 0;
            const newQty = Number(item.quantity) || 0;
            const delta = newQty - prevQty;
            if (delta <= 0) return null;
            return {
              product_id: current.product_id,
              quantity: delta,
              unit_price: Number(current.unit_cost) || 0,
            };
          })
          .filter((item): item is { product_id: number; quantity: number; unit_price: number } => item !== null);

        if (stockItems.length > 0) {
          stockResult = await stockMovementService.incrementOnPurchase(
            organizationId,
            branchId,
            orderId,
            stockItems,
            'purchase_order'
          );
          if (stockResult.errors.length > 0) {
            console.warn('⚠️ Algunos items no sumaron stock:', stockResult.errors);
          }
          console.log(`📦 Stock incrementado (OC ${orderId}): ${stockItems.length - stockResult.skipped} items`);
        }
      } catch (stockError: any) {
        // El stock no bloquea la recepcion, pero el fallo se devuelve para que la
        // UI pueda avisar en vez de dejarlo enterrado en la consola.
        console.warn('⚠️ Error sumando stock (no bloquea recepción):', stockError);
        stockResult = {
          success: false,
          skipped: 0,
          skippedItems: [],
          errors: [stockError?.message || 'Error desconocido sumando stock'],
        };
      }

      // Verificar si es recepción total o parcial
      const { data: allItems } = await supabase
        .from('purchase_order_items')
        .select('quantity, received_quantity')
        .eq('purchase_order_id', orderId);

      if (allItems) {
        const isComplete = allItems.every((item: { quantity: number; received_quantity: number }) => item.received_quantity >= item.quantity);
        const isPartial = allItems.some((item: { quantity: number; received_quantity: number }) => item.received_quantity > 0);

        const newStatus = isComplete ? 'received' : (isPartial ? 'partial' : 'sent');

        await this.setStatus(orderUuid, organizationId, newStatus);

        // Si la recepción es completa, generar factura de compra y cuenta por pagar automáticamente
        if (isComplete) {
          try {
            await this.generateInvoiceFromPurchaseOrder(orderId, organizationId, branchId);
          } catch (invError) {
            console.warn('⚠️ Error generando factura automática (no bloquea recepción):', invError);
          }
        }
      }

      return { success: true, error: null, stock: stockResult };
    } catch (error: any) {
      console.error('Error recibiendo items:', error?.message || error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Recibir items con seriales (para productos que requieren tracking individual)
   */
  async receiveItemsWithSerials(
    orderUuid: string,
    organizationId: number,
    itemsReceived: Array<{
      itemId: number;
      quantity: number;
      serials?: string[];
    }>
  ): Promise<{ success: boolean; error: Error | null; stock?: StockDecrementResult }> {
    try {
      const { data: order } = await supabase
        .from('purchase_orders')
        .select('id, branch_id, supplier_id')
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .single();

      if (!order) {
        return { success: false, error: new Error('Orden no encontrada') };
      }

      const orderId = order.id;
      const branchId = order.branch_id;
      const supplierId = order.supplier_id;

      const itemIds = itemsReceived.map(i => i.itemId);
      const { data: currentItems } = await supabase
        .from('purchase_order_items')
        .select('id, product_id, unit_cost, received_quantity')
        .in('id', itemIds)
        .eq('purchase_order_id', orderId);

      const currentMap = new Map((currentItems || []).map(i => [i.id, i]));

      for (const item of itemsReceived) {
        const { error } = await supabase
          .from('purchase_order_items')
          .update({
            received_quantity: item.quantity,
            serials_received: item.serials || [],
            updated_at: new Date().toISOString()
          })
          .eq('id', item.itemId)
          .eq('purchase_order_id', orderId);

        if (error) throw error;
      }

      let stockResult: StockDecrementResult | undefined;
      try {
        const stockItems = itemsReceived
          .map(item => {
            const current = currentMap.get(item.itemId);
            if (!current || !current.product_id) return null;
            const prevQty = Number(current.received_quantity) || 0;
            const newQty = Number(item.quantity) || 0;
            const delta = newQty - prevQty;
            if (delta <= 0) return null;
            return {
              product_id: current.product_id,
              quantity: delta,
              unit_price: Number(current.unit_cost) || 0,
            };
          })
          .filter((item): item is { product_id: number; quantity: number; unit_price: number } => item !== null);

        if (stockItems.length > 0) {
          stockResult = await stockMovementService.incrementOnPurchase(
            organizationId,
            branchId,
            orderId,
            stockItems,
            'purchase_order'
          );
        }
      } catch (stockError: any) {
        console.warn('⚠️ Error sumando stock (no bloquea recepción):', stockError);
        stockResult = {
          success: false,
          skipped: 0,
          skippedItems: [],
          errors: [stockError?.message || 'Error desconocido sumando stock'],
        };
      }

      // Crear seriales en la base de datos
      for (const item of itemsReceived) {
        if (!item.serials || item.serials.length === 0) continue;

        const current = currentMap.get(item.itemId);
        if (!current || !current.product_id) continue;

        const prevQty = Number(current.received_quantity) || 0;
        const newQty = Number(item.quantity) || 0;
        const delta = newQty - prevQty;

        // Solo crear seriales por la cantidad nueva recibida (delta)
        const serialsToCreate = item.serials.slice(0, delta);

        for (const serialText of serialsToCreate) {
          const { error: serialError } = await serialTrackingService.createSerial({
            product_id: current.product_id,
            organization_id: organizationId,
            branch_id: branchId,
            serial: serialText,
            supplier_id: supplierId,
            purchase_order_id: orderId,
            cost_at_purchase: Number(current.unit_cost) || 0,
          });

          if (serialError) {
            console.warn(`⚠️ Error creando serial ${serialText}:`, serialError.message);
          }
        }
      }

      // Verificar recepcion total/parcial
      const { data: allItems } = await supabase
        .from('purchase_order_items')
        .select('quantity, received_quantity')
        .eq('purchase_order_id', orderId);

      if (allItems) {
        const isComplete = allItems.every((item: { quantity: number; received_quantity: number }) => item.received_quantity >= item.quantity);
        const isPartial = allItems.some((item: { quantity: number; received_quantity: number }) => item.received_quantity > 0);

        const newStatus = isComplete ? 'received' : (isPartial ? 'partial' : 'sent');
        await this.setStatus(orderUuid, organizationId, newStatus);

        if (isComplete) {
          try {
            await this.generateInvoiceFromPurchaseOrder(orderId, organizationId, branchId);
          } catch (invError) {
            console.warn('⚠️ Error generando factura automática (no bloquea recepción):', invError);
          }
        }
      }

      return { success: true, error: null, stock: stockResult };
    } catch (error: any) {
      console.error('Error recibiendo items con seriales:', error?.message || error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Generar factura de compra y cuenta por pagar automáticamente desde una OC recibida
   */
  private async generateInvoiceFromPurchaseOrder(
    orderId: number,
    organizationId: number,
    branchId: number
  ): Promise<void> {
    // Obtener datos de la OC y sus items
    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .select('id, supplier_id, total, notes, created_at')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error('No se pudo obtener la orden de compra para generar factura');
    }

    // Verificar si ya existe una factura para esta OC (evitar duplicados)
    const { data: existingInvoice } = await supabase
      .from('invoice_purchase')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('supplier_id', order.supplier_id)
      .eq('total', order.total)
      .eq('issue_date', new Date().toISOString().split('T')[0])
      .ilike('notes', `%OC-${orderId}%`)
      .limit(1);

    if (existingInvoice && existingInvoice.length > 0) {
      console.log('ℹ️ Ya existe factura para esta OC, se omite generación automática');
      return;
    }

    // Obtener items de la OC con datos del producto
    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select(`
        id, product_id, quantity, unit_cost, subtotal,
        products(id, name, sku)
      `)
      .eq('purchase_order_id', orderId);

    if (itemsError || !items) {
      throw new Error('No se pudieron obtener los items de la OC');
    }

    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    // Generar número de factura
    const { data: lastInvoice } = await supabase
      .from('invoice_purchase')
      .select('number_ext')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1);

    const year = new Date().getFullYear();
    const nextNum = lastInvoice && lastInvoice.length > 0
      ? (parseInt(lastInvoice[0].number_ext?.split('-').pop() || '0') + 1)
      : 1;
    const numberExt = `COMP-${year}-${String(nextNum).padStart(4, '0')}`;

    // Calcular subtotal
    const subtotal = items.reduce((sum: number, item: any) => sum + Number(item.subtotal || item.quantity * item.unit_cost), 0);

    // Crear factura de compra
    const { data: factura, error: facturaError } = await supabase
      .from('invoice_purchase')
      .insert({
        organization_id: organizationId,
        branch_id: branchId,
        supplier_id: order.supplier_id,
        number_ext: numberExt,
        issue_date: today,
        due_date: dueDateStr,
        currency: 'COP',
        subtotal,
        tax_total: 0,
        total: subtotal,
        balance: subtotal,
        status: 'received',
        notes: `Factura generada automáticamente desde Orden de Compra OC-${orderId}. ${(order.notes || '').trim()}`.trim(),
        payment_terms: 30,
        tax_included: false,
      })
      .select()
      .single();

    if (facturaError || !factura) {
      throw new Error(`Error creando factura automática: ${facturaError?.message}`);
    }

    // Crear items de la factura
    const invoiceItems = items.map((item: any) => ({
      invoice_id: factura.id,
      invoice_type: 'purchase',
      invoice_purchase_id: factura.id,
      invoice_sales_id: null,
      product_id: item.product_id || null,
      description: item.products?.name || 'Producto',
      qty: Number(item.quantity),
      unit_price: Number(item.unit_cost),
      tax_rate: 0,
      total_line: Number(item.subtotal || item.quantity * item.unit_cost),
      discount_amount: 0,
      tax_included: false,
    }));

    const { error: invItemsError } = await supabase
      .from('invoice_items')
      .insert(invoiceItems);

    if (invItemsError) {
      console.warn('⚠️ Error creando items de factura automática:', invItemsError);
    }

    // Crear cuenta por pagar
    const { error: apError } = await supabase
      .from('accounts_payable')
      .insert({
        organization_id: organizationId,
        supplier_id: order.supplier_id,
        invoice_id: factura.id,
        amount: subtotal,
        balance: subtotal,
        due_date: dueDateStr,
        status: 'pending',
      });

    if (apError) {
      console.warn('⚠️ Error creando cuenta por pagar automática:', apError);
    }

    console.log(`✅ Factura ${numberExt} generada automáticamente desde OC-${orderId}`);
  }

  /**
   * Obtener estadísticas
   */
  async getStats(organizationId: number): Promise<PurchaseOrderStats> {
    try {
      const { data } = await supabase
        .from('purchase_orders')
        .select('status, total')
        .eq('organization_id', organizationId);

      if (!data) {
        return { total: 0, draft: 0, sent: 0, partial: 0, received: 0, cancelled: 0, totalAmount: 0 };
      }

      return {
        total: data.length,
        draft: data.filter(o => o.status === 'draft').length,
        sent: data.filter(o => o.status === 'sent').length,
        partial: data.filter(o => o.status === 'partial').length,
        received: data.filter(o => o.status === 'received').length,
        cancelled: data.filter(o => o.status === 'cancelled').length,
        totalAmount: data.reduce((sum, o) => sum + (o.total || 0), 0)
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return { total: 0, draft: 0, sent: 0, partial: 0, received: 0, cancelled: 0, totalAmount: 0 };
    }
  }

  /**
   * Obtener proveedores para selector
   */
  async getSuppliers(organizationId: number): Promise<{ id: number; uuid: string; name: string }[]> {
    try {
      const { data } = await supabase
        .from('suppliers')
        .select('id, uuid, name')
        .eq('organization_id', organizationId)
        .order('name');

      return data || [];
    } catch (error) {
      console.error('Error obteniendo proveedores:', error);
      return [];
    }
  }

  /**
   * Obtener sucursales para selector
   */
  async getBranches(organizationId: number): Promise<{ id: number; name: string }[]> {
    try {
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      return data || [];
    } catch (error) {
      console.error('Error obteniendo sucursales:', error);
      return [];
    }
  }

  /**
   * Obtener productos para selector
   */
  async getProducts(organizationId: number): Promise<any[]> {
    try {
      // Cargar todos los productos activos (incluyendo padres para mapeo)
      // Paginar porque Supabase devuelve máximo 1000 filas por defecto
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let offset = 0;
      while (true) {
        const { data: pageData, error: pageError } = await supabase
          .from('products')
          .select('id, uuid, sku, name, unit_code, track_stock, is_parent, parent_product_id, variant_data, categories(name)')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('name')
          .range(offset, offset + PAGE_SIZE - 1);

        if (pageError) break;
        if (!pageData || pageData.length === 0) break;
        allData = allData.concat(pageData);
        if (pageData.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      if (allData.length === 0) return [];

      // Mapa de padres: id -> { name, sku }
      const parentMap = new Map<number, { name: string; sku: string }>();
      allData.forEach((p: any) => {
        if (p.is_parent) {
          parentMap.set(p.id, { name: p.name, sku: p.sku });
        }
      });

      // Mapa de SKU base -> nombre del padre (para variantes huérfanas sin parent_product_id)
      const skuToParent = new Map<string, string>();
      allData.forEach((p: any) => {
        if (p.is_parent) {
          skuToParent.set(p.sku, p.name);
        }
      });

      // Filtrar: excluir padres y productos con variant_data vacío
      const data = allData.filter((p: any) => {
        if (p.is_parent) return false;
        if (p.variant_data && typeof p.variant_data === 'object') {
          const hasValues = Object.values(p.variant_data).some((v: any) => v && String(v).trim() !== '');
          if (!hasValues && Object.keys(p.variant_data).length > 0) return false;
        }
        return true;
      });

      const productIds = data.map(p => p.id);
      const parentIds = Array.from(parentMap.keys());

      // Obtener costos actuales de product_costs
      const { data: costs } = await supabase
        .from('product_costs')
        .select('product_id, cost')
        .in('product_id', productIds)
        .is('effective_to', null);

      const costMap = new Map<number, number>();
      (costs || []).forEach(c => costMap.set(c.product_id, Number(c.cost)));

      // Obtener imágenes principales de productos
      const imageMap: Record<number, string | null> = {};
      const allIdsForImages = [...productIds, ...parentIds];
      const CHUNK = 300;
      for (let i = 0; i < allIdsForImages.length; i += CHUNK) {
        const chunk = allIdsForImages.slice(i, i + CHUNK);
        const { data: imgData } = await supabase
          .from('product_images')
          .select('product_id, storage_path, is_primary')
          .in('product_id', chunk)
          .eq('is_primary', true);
        if (imgData) {
          imgData.forEach((img: any) => {
            if (img.storage_path) {
              const bucket = (img.storage_path.startsWith('products/') || img.storage_path.startsWith('productos/')) ? 'product-images' : 'organization_images';
              const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(img.storage_path);
              imageMap[img.product_id] = urlData?.publicUrl || null;
            }
          });
        }
      }

      return data.map((p: any) => {
        // Determinar parent_name: por parent_product_id o por prefijo de SKU
        let parentName: string | null = null;
        let parentImage: string | null = null;

        if (p.parent_product_id && parentMap.has(p.parent_product_id)) {
          parentName = parentMap.get(p.parent_product_id)!.name;
          parentImage = imageMap[p.parent_product_id] || null;
        } else if (p.variant_data && typeof p.variant_data === 'object') {
          // Intentar match por prefijo de SKU (todo antes del último "-V...")
          const skuMatch = p.sku.match(/^(.+)-V[A-Z0-9]+/);
          if (skuMatch) {
            const baseSku = skuMatch[1];
            if (skuToParent.has(baseSku)) {
              parentName = skuToParent.get(baseSku)!;
              // Buscar imagen del padre
              const parentEntry = allData.find((pp: any) => pp.sku === baseSku && pp.is_parent);
              if (parentEntry) {
                parentImage = imageMap[parentEntry.id] || null;
              }
            }
          }
        }

        return {
          id: p.id,
          uuid: p.uuid,
          sku: p.sku,
          name: p.name,
          unit_code: p.unit_code,
          category: p.categories?.name,
          cost: costMap.get(p.id) || 0,
          track_stock: p.track_stock,
          image: imageMap[p.id] || null,
          is_parent: p.is_parent,
          parent_product_id: p.parent_product_id,
          variant_data: p.variant_data,
          parent_name: parentName,
          parent_image: parentImage,
        };
      });
    } catch (error) {
      console.error('Error obteniendo productos:', error);
      return [];
    }
  }
}

export const purchaseOrderService = new PurchaseOrderService();
