import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import type {
  TableSessionWithDetails,
  ProductToAdd,
  SaleItem,
  PreCuenta,
  KitchenTicket,
} from './types';

export class PedidosService {
  /**
   * Obtener detalles completos de una mesa por ID
   * Incluye items de TODAS las sesiones activas en la mesa (para mesas combinadas)
   */
  static async obtenerDetalleMesa(tableId: string): Promise<TableSessionWithDetails | null> {
    const organizationId = getOrganizationId();

    try {
      // 1. Obtener TODAS las sesiones activas de la mesa
      const { data: sessions, error: sessionsError } = await supabase
        .from('table_sessions')
        .select(`
          *,
          restaurant_tables!table_sessions_restaurant_table_id_fkey(id, name, zone, capacity, state),
          sales!table_sessions_sale_id_fkey(*)
        `)
        .eq('restaurant_table_id', tableId)
        .eq('organization_id', organizationId)
        .in('status', ['active', 'bill_requested'])
        .order('opened_at', { ascending: false });

      if (sessionsError) {
        console.error('Error consultando sesiones:', sessionsError);
        throw new Error(`Error en consulta de sesiones: ${sessionsError.message || JSON.stringify(sessionsError)}`);
      }
      
      if (!sessions || sessions.length === 0) {
        console.log('No se encontró sesión activa para la mesa:', tableId);
        return null;
      }

      // 2. Usar la sesión más reciente como principal
      const mainSession = sessions[0];

      // 3. Obtener items de TODAS las ventas de TODAS las sesiones
      const saleIds = sessions
        .map(s => s.sale_id)
        .filter(id => id != null);

      let allItems: any[] = [];
      
      if (saleIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from('sale_items')
          .select(`
            *,
            product:products!sale_items_product_id_fkey(
              id, 
              name, 
              description, 
              sku,
              product_images(
                id,
                storage_path,
                is_primary,
                display_order
              )
            )
          `)
          .in('sale_id', saleIds)
          .order('created_at', { ascending: true });

        if (itemsError) {
          console.error('Error consultando items:', itemsError);
          throw new Error(`Error en consulta de items: ${itemsError.message || JSON.stringify(itemsError)}`);
        }
        
        allItems = items || [];
      }

      // 4. Para comensales, usar solo la sesión principal (no sumar de combinadas)
      // Esto permite que la edición de comensales funcione correctamente
      const customers = mainSession.customers || 0;

      return {
        ...mainSession,
        customers: customers, // Comensales de la sesión principal
        sale_items: allItems,
      };
    } catch (error: any) {
      console.error('Error obteniendo detalle de mesa:', {
        tableId,
        organizationId,
        error: error.message || error,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Crear o actualizar sesión de mesa
   */
  static async iniciarSesion(
    tableId: string,
    serverId: string,
    customers: number
  ): Promise<TableSessionWithDetails> {
    const organizationId = getOrganizationId();

    try {
      // Verificar si ya existe sesión activa
      const { data: existingSessions } = await supabase
        .from('table_sessions')
        .select('*')
        .eq('restaurant_table_id', tableId)
        .eq('organization_id', organizationId)
        .in('status', ['active', 'bill_requested'])
        .order('opened_at', { ascending: false });

      if (existingSessions && existingSessions.length > 0) {
        // Si hay múltiples sesiones, cerrar las antiguas
        if (existingSessions.length > 1) {
          const sessionIdsToClose = existingSessions.slice(1).map(s => s.id);
          await supabase
            .from('table_sessions')
            .update({ status: 'completed' })
            .in('id', sessionIdsToClose);
          
          console.log('🧹 Cerradas sesiones duplicadas:', sessionIdsToClose.length);
        }
        
        // Retornar sesión más reciente con detalles
        const details = await this.obtenerDetalleMesa(tableId);
        if (details) return details;
      }

      // Crear nueva sesión
      const { data: newSession, error: sessionError } = await supabase
        .from('table_sessions')
        .insert({
          organization_id: organizationId,
          restaurant_table_id: tableId,
          server_id: serverId,
          customers,
          status: 'active',
          opened_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Error creando sesión:', sessionError);
        throw new Error(`Error al crear sesión: ${sessionError.message || JSON.stringify(sessionError)}`);
      }

      // Actualizar estado de la mesa
      const { error: updateError } = await supabase
        .from('restaurant_tables')
        .update({ state: 'occupied' })
        .eq('id', tableId);

      if (updateError) {
        console.error('Error actualizando estado de mesa:', updateError);
      }

      const details = await this.obtenerDetalleMesa(tableId);
      if (!details) {
        throw new Error('No se pudo obtener detalles de la sesión recién creada');
      }
      
      return details;
    } catch (error: any) {
      console.error('Error iniciando sesión:', {
        tableId,
        serverId,
        error: error.message || error,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Añadir productos a la orden
   */
  static async agregarProductos(
    sessionId: string,
    productos: ProductToAdd[]
  ): Promise<void> {
    const organizationId = getOrganizationId();
    const branchId = getCurrentBranchId();

    if (!branchId) throw new Error('No se pudo obtener el branch_id');

    try {
      // 1. Obtener o crear venta
      const { data: session } = await supabase
        .from('table_sessions')
        .select('sale_id, restaurant_table_id, server_id')
        .eq('id', sessionId)
        .single();

      if (!session) throw new Error('Sesión no encontrada');

      let saleId = session.sale_id;

      // Crear venta si no existe
      if (!saleId) {
        const { data: newSale, error: saleError } = await supabase
          .from('sales')
          .insert({
            organization_id: organizationId,
            branch_id: branchId,
            user_id: session.server_id,
            status: 'pending',
            payment_status: 'pending',
            total: 0,
            subtotal: 0,
            tax_total: 0,
            discount_total: 0,
          })
          .select()
          .single();

        if (saleError) {
          console.error('Error creando venta:', saleError);
          throw new Error(`Error al crear venta: ${saleError.message || JSON.stringify(saleError)}`);
        }
        saleId = newSale.id;

        // Vincular venta con sesión
        await supabase
          .from('table_sessions')
          .update({ sale_id: saleId })
          .eq('id', sessionId);
      }

      // 2. Insertar items de venta (guardar nombre del producto en notes para impresión)
      const saleItems = productos.map((p) => ({
        sale_id: saleId,
        product_id: p.product_id,
        quantity: p.quantity,
        unit_price: p.unit_price,
        total: p.quantity * p.unit_price,
        tax_amount: 0,
        discount_amount: 0,
        notes: { product_name: p.product_name, ...(p.notes ? { extra: p.notes } : {}) },
      }));

      const { data: insertedItems, error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems)
        .select();

      if (itemsError) {
        console.error('Error insertando items de venta:', itemsError);
        throw new Error(`Error al insertar items: ${itemsError.message || JSON.stringify(itemsError)}`);
      }

      // 3. Crear ticket de cocina
      const { data: ticket, error: ticketError } = await supabase
        .from('kitchen_tickets')
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          table_session_id: sessionId,
          sale_id: saleId,
          status: 'new',
          priority: 0,
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // 4. Crear items del ticket
      const ticketItems = insertedItems.map((item, index) => ({
        organization_id: organizationId,
        kitchen_ticket_id: ticket.id,
        sale_item_id: item.id,
        station: productos[index].station || null,
        notes: productos[index].notes || null,
        status: 'pending',
      }));

      const { error: ticketItemsError } = await supabase
        .from('kitchen_ticket_items')
        .insert(ticketItems);

      if (ticketItemsError) throw ticketItemsError;

      // 5. Actualizar total de la venta
      await this.recalcularTotalVenta(saleId!);
    } catch (error: any) {
      console.error('Error agregando productos:', {
        sessionId,
        productCount: productos.length,
        error: error.message || error,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Recalcular total de una venta
   */
  static async recalcularTotalVenta(saleId: string): Promise<void> {
    try {
      const { data: items } = await supabase
        .from('sale_items')
        .select('total, tax_amount, discount_amount')
        .eq('sale_id', saleId);

      if (!items) return;

      const subtotal = items.reduce((sum, item) => sum + Number(item.total), 0);
      const taxTotal = items.reduce((sum, item) => sum + Number(item.tax_amount), 0);
      const discountTotal = items.reduce(
        (sum, item) => sum + Number(item.discount_amount),
        0
      );
      const total = subtotal + taxTotal - discountTotal;

      await supabase
        .from('sales')
        .update({
          subtotal,
          tax_total: taxTotal,
          discount_total: discountTotal,
          total,
          balance: total,
        })
        .eq('id', saleId);
    } catch (error) {
      console.error('Error recalculando total:', error);
      throw error;
    }
  }

  /**
   * Eliminar item de la orden
   */
  static async eliminarItem(saleItemId: string): Promise<void> {
    try {
      // Obtener sale_id antes de eliminar
      const { data: item } = await supabase
        .from('sale_items')
        .select('sale_id')
        .eq('id', saleItemId)
        .single();

      if (!item) throw new Error('Item no encontrado');

      // Eliminar items de kitchen_tickets relacionados
      await supabase
        .from('kitchen_ticket_items')
        .delete()
        .eq('sale_item_id', saleItemId);

      // Eliminar item de venta
      const { error } = await supabase
        .from('sale_items')
        .delete()
        .eq('id', saleItemId);

      if (error) throw error;

      // Recalcular total
      await this.recalcularTotalVenta(item.sale_id);
    } catch (error) {
      console.error('Error eliminando item:', error);
      throw error;
    }
  }

  /**
   * Actualizar cantidad de un item
   */
  static async actualizarCantidadItem(
    saleItemId: string,
    nuevaCantidad: number
  ): Promise<void> {
    try {
      const { data: item } = await supabase
        .from('sale_items')
        .select('unit_price, sale_id')
        .eq('id', saleItemId)
        .single();

      if (!item) throw new Error('Item no encontrado');

      const nuevoTotal = Number(item.unit_price) * nuevaCantidad;

      const { error } = await supabase
        .from('sale_items')
        .update({
          quantity: nuevaCantidad,
          total: nuevoTotal,
        })
        .eq('id', saleItemId);

      if (error) throw error;

      await this.recalcularTotalVenta(item.sale_id);
    } catch (error) {
      console.error('Error actualizando cantidad:', error);
      throw error;
    }
  }

  /**
   * Generar pre-cuenta
   */
  static async generarPreCuenta(sessionId: string): Promise<PreCuenta> {
    try {
      const detalles = await this.obtenerDetalleMesa(sessionId);
      
      if (!detalles || !detalles.sale_items) {
        throw new Error('No hay items en la orden');
      }

      const items = detalles.sale_items;
      const subtotal = items.reduce((sum, item) => sum + Number(item.total), 0);
      const taxTotal = items.reduce((sum, item) => sum + Number(item.tax_amount), 0);
      const discountTotal = items.reduce(
        (sum, item) => sum + Number(item.discount_amount),
        0
      );
      const total = subtotal + taxTotal - discountTotal;

      return {
        items,
        subtotal,
        tax_total: taxTotal,
        discount_total: discountTotal,
        total,
      };
    } catch (error) {
      console.error('Error generando pre-cuenta:', error);
      throw error;
    }
  }

  /**
   * Solicitar cuenta (cambiar estado a bill_requested)
   */
  static async solicitarCuenta(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('table_sessions')
        .update({ status: 'bill_requested' })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (error) {
      console.error('Error solicitando cuenta:', error);
      throw error;
    }
  }

  /**
   * Actualizar cantidad de comensales de una sesión
   */
  static async actualizarComensales(sessionId: string, customers: number): Promise<void> {
    try {
      if (customers < 1) {
        throw new Error('La cantidad de comensales debe ser al menos 1');
      }

      console.log('📝 Actualizando comensales:', { sessionId, customers });

      const { error, data } = await supabase
        .from('table_sessions')
        .update({ customers })
        .eq('id', sessionId)
        .select();

      if (error) throw error;
      
      console.log('✅ Comensales actualizados:', data);
    } catch (error) {
      console.error('Error actualizando comensales:', error);
      throw error;
    }
  }

  /**
   * Enviar comandas a cocina (marcar como printed)
   */
  static async enviarComandaCocina(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('kitchen_tickets')
        .update({ printed_at: new Date().toISOString() })
        .eq('table_session_id', sessionId)
        .is('printed_at', null);

      if (error) throw error;
    } catch (error) {
      console.error('Error enviando comanda:', error);
      throw error;
    }
  }

  /**
   * Obtener tickets de cocina pendientes de una sesión
   */
  static async obtenerTicketsCocina(sessionId: string): Promise<KitchenTicket[]> {
    try {
      const { data, error } = await supabase
        .from('kitchen_tickets')
        .select('*')
        .eq('table_session_id', sessionId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo tickets:', error);
      throw error;
    }
  }

  /**
   * Transferir item a otra mesa
   */
  static async transferirItem(
    saleItemId: string,
    toTableId: string,
    quantity: number
  ): Promise<void> {
    const organizationId = getOrganizationId();

    try {
      // 1. Obtener item original
      const { data: originalItem } = await supabase
        .from('sale_items')
        .select('*, sales!inner(table_sessions!inner(restaurant_table_id))')
        .eq('id', saleItemId)
        .single();

      if (!originalItem) throw new Error('Item no encontrado');

      // 2. Obtener sesión de la mesa destino
      const { data: toSession } = await supabase
        .from('table_sessions')
        .select('id, sale_id, server_id')
        .eq('restaurant_table_id', toTableId)
        .eq('organization_id', organizationId)
        .in('status', ['active', 'bill_requested'])
        .maybeSingle();

      if (!toSession) throw new Error('Mesa destino no tiene sesión activa');

      // 3. Si transferimos toda la cantidad, mover el item
      if (quantity >= originalItem.quantity) {
        await supabase
          .from('sale_items')
          .update({ sale_id: toSession.sale_id })
          .eq('id', saleItemId);
      } else {
        // 4. Si es parcial, crear nuevo item y reducir original
        const newTotal = Number(originalItem.unit_price) * quantity;
        
        await supabase.from('sale_items').insert({
          sale_id: toSession.sale_id,
          product_id: originalItem.product_id,
          quantity,
          unit_price: originalItem.unit_price,
          total: newTotal,
          tax_amount: 0,
          discount_amount: 0,
          notes: originalItem.notes,
        });

        await this.actualizarCantidadItem(
          saleItemId,
          originalItem.quantity - quantity
        );
      }

      // 5. Recalcular totales
      await this.recalcularTotalVenta(originalItem.sale_id);
      if (toSession.sale_id) {
        await this.recalcularTotalVenta(toSession.sale_id);
      }
    } catch (error) {
      console.error('Error transfiriendo item:', error);
      throw error;
    }
  }
}
