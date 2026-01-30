import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { 
  InventoryTransfer, 
  TransferItem, 
  CreateTransferData, 
  FiltrosTransferencias,
  Branch,
  Product,
  StockLevel
} from './types';

export class TransferenciasService {
  
  static async obtenerTransferencias(
    filtros: FiltrosTransferencias,
    page: number = 1,
    pageSize: number = 10
  ): Promise<{ transferencias: InventoryTransfer[]; total: number; totalPages: number }> {
    const organizationId = getOrganizationId();
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('inventory_transfers')
      .select(`
        *,
        origin_branch:branches!inventory_transfers_origin_branch_id_fkey(id, name),
        dest_branch:branches!inventory_transfers_dest_branch_id_fkey(id, name)
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Aplicar filtros
    if (filtros.estado !== 'todos') {
      query = query.eq('status', filtros.estado);
    }

    if (filtros.origen !== 'todos') {
      query = query.eq('origin_branch_id', parseInt(filtros.origen));
    }

    if (filtros.destino !== 'todos') {
      query = query.eq('dest_branch_id', parseInt(filtros.destino));
    }

    if (filtros.fechaDesde) {
      query = query.gte('created_at', filtros.fechaDesde);
    }

    if (filtros.fechaHasta) {
      query = query.lte('created_at', `${filtros.fechaHasta}T23:59:59`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error obteniendo transferencias:', error);
      throw error;
    }

    return {
      transferencias: data || [],
      total: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize)
    };
  }

  static async obtenerTransferenciaPorId(id: number): Promise<InventoryTransfer | null> {
    // Primero obtener la transferencia con branches
    const { data: transferencia, error: errorTransf } = await supabase
      .from('inventory_transfers')
      .select(`
        *,
        origin_branch:branches!inventory_transfers_origin_branch_id_fkey(id, name, address),
        dest_branch:branches!inventory_transfers_dest_branch_id_fkey(id, name, address)
      `)
      .eq('id', id)
      .single();

    if (errorTransf) {
      console.error('Error obteniendo transferencia:', errorTransf);
      throw errorTransf;
    }

    if (!transferencia) return null;

    // Obtener items por separado para evitar problemas con joins anidados
    const { data: items, error: errorItems } = await supabase
      .from('transfer_items')
      .select(`
        *,
        product:products(id, name, sku, barcode, unit_code)
      `)
      .eq('inventory_transfer_id', id);

    if (errorItems) {
      console.error('Error obteniendo items:', errorItems);
    }

    // Obtener info de lotes si existen
    const itemsConLotes = await Promise.all(
      (items || []).map(async (item: any) => {
        if (item.lot_id) {
          const { data: lot } = await supabase
            .from('lots')
            .select('id, lot_number, expiry_date')
            .eq('id', item.lot_id)
            .single();
          return { ...item, lot };
        }
        return { ...item, lot: null };
      })
    );

    return {
      ...transferencia,
      items: itemsConLotes
    };
  }

  static async crearTransferencia(datos: CreateTransferData): Promise<InventoryTransfer> {
    const organizationId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();

    // Crear la transferencia
    const { data: transferencia, error: errorTransferencia } = await supabase
      .from('inventory_transfers')
      .insert({
        organization_id: organizationId,
        origin_branch_id: datos.origin_branch_id,
        dest_branch_id: datos.dest_branch_id,
        status: 'pending',
        created_by: user?.id,
        notes: datos.notes
      })
      .select()
      .single();

    if (errorTransferencia) {
      console.error('Error creando transferencia:', errorTransferencia);
      throw errorTransferencia;
    }

    // Crear los items
    const items = datos.items.map(item => ({
      inventory_transfer_id: transferencia.id,
      product_id: item.product_id,
      quantity: item.quantity,
      lot_id: item.lot_id || null,
      received_qty: 0,
      status: 'pending'
    }));

    const { error: errorItems } = await supabase
      .from('transfer_items')
      .insert(items);

    if (errorItems) {
      console.error('Error creando items de transferencia:', errorItems);
      // Eliminar la transferencia si falla la creación de items
      await supabase.from('inventory_transfers').delete().eq('id', transferencia.id);
      throw errorItems;
    }

    return transferencia;
  }

  static async actualizarEstado(
    id: number, 
    nuevoEstado: InventoryTransfer['status']
  ): Promise<InventoryTransfer> {
    const organizationId = getOrganizationId();

    // Si el estado es 'in_transit', crear movimientos de salida
    if (nuevoEstado === 'in_transit') {
      await this.generarMovimientosSalida(id);
    }

    const { data, error } = await supabase
      .from('inventory_transfers')
      .update({ 
        status: nuevoEstado,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando estado:', error);
      throw error;
    }

    return data;
  }

  static async generarMovimientosSalida(transferId: number): Promise<void> {
    const organizationId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();

    // Obtener la transferencia con items
    const transferencia = await this.obtenerTransferenciaPorId(transferId);
    if (!transferencia || !transferencia.items) {
      throw new Error('Transferencia no encontrada');
    }

    // Crear movimientos de salida para cada item
    const movimientos = transferencia.items.map(item => ({
      organization_id: organizationId,
      branch_id: transferencia.origin_branch_id,
      product_id: item.product_id,
      lot_id: item.lot_id || null,
      direction: 'out',
      qty: item.quantity,
      source: 'transfer_out',
      source_id: transferId.toString(),
      note: `Transferencia #${transferId} a ${transferencia.dest_branch?.name}`,
      updated_by: user?.id
    }));

    const { error: errorMovimientos } = await supabase
      .from('stock_movements')
      .insert(movimientos);

    if (errorMovimientos) {
      console.error('Error creando movimientos de salida:', errorMovimientos);
      throw errorMovimientos;
    }

    // Actualizar stock_levels (restar del origen)
    for (const item of transferencia.items) {
      const { error: errorStock } = await supabase.rpc('update_stock_level', {
        p_organization_id: organizationId,
        p_branch_id: transferencia.origin_branch_id,
        p_product_id: item.product_id,
        p_lot_id: item.lot_id || null,
        p_qty_change: -item.quantity
      });

      if (errorStock) {
        console.warn('Error actualizando stock (puede no existir la función RPC):', errorStock);
        // Fallback: actualizar directamente
        await supabase
          .from('stock_levels')
          .update({ 
            qty_available: supabase.rpc('decrement_qty', { qty: item.quantity })
          })
          .eq('organization_id', organizationId)
          .eq('branch_id', transferencia.origin_branch_id)
          .eq('product_id', item.product_id);
      }
    }
  }

  static async recibirItems(
    transferId: number,
    itemsRecibidos: { transfer_item_id: number; received_qty: number }[]
  ): Promise<void> {
    const organizationId = getOrganizationId();
    const { data: { user } } = await supabase.auth.getUser();

    const transferencia = await this.obtenerTransferenciaPorId(transferId);
    if (!transferencia) {
      throw new Error('Transferencia no encontrada');
    }

    let todosCompletos = true;
    let algunoRecibido = false;

    for (const itemRecibido of itemsRecibidos) {
      const item = transferencia.items?.find(i => i.id === itemRecibido.transfer_item_id);
      if (!item) continue;

      const nuevaCantidadRecibida = (item.received_qty || 0) + itemRecibido.received_qty;
      const itemCompleto = nuevaCantidadRecibida >= item.quantity;

      // Actualizar el item
      await supabase
        .from('transfer_items')
        .update({
          received_qty: nuevaCantidadRecibida,
          status: itemCompleto ? 'complete' : 'partial',
          updated_at: new Date().toISOString()
        })
        .eq('id', itemRecibido.transfer_item_id);

      // Crear movimiento de entrada
      await supabase
        .from('stock_movements')
        .insert({
          organization_id: organizationId,
          branch_id: transferencia.dest_branch_id,
          product_id: item.product_id,
          lot_id: item.lot_id || null,
          direction: 'in',
          qty: itemRecibido.received_qty,
          source: 'transfer_in',
          source_id: transferId.toString(),
          note: `Recepción transferencia #${transferId} desde ${transferencia.origin_branch?.name}`,
          updated_by: user?.id
        });

      if (!itemCompleto) {
        todosCompletos = false;
      }
      algunoRecibido = true;
    }

    // Actualizar estado de la transferencia
    let nuevoEstado: InventoryTransfer['status'] = transferencia.status;
    if (todosCompletos && algunoRecibido) {
      nuevoEstado = 'complete';
    } else if (algunoRecibido) {
      nuevoEstado = 'partial';
    }

    if (nuevoEstado !== transferencia.status) {
      await supabase
        .from('inventory_transfers')
        .update({ 
          status: nuevoEstado,
          updated_at: new Date().toISOString()
        })
        .eq('id', transferId);
    }
  }

  static async cancelarTransferencia(id: number): Promise<void> {
    const organizationId = getOrganizationId();
    
    const { error } = await supabase
      .from('inventory_transfers')
      .update({ 
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error cancelando transferencia:', error);
      throw error;
    }
  }

  static async obtenerSucursales(): Promise<Branch[]> {
    const organizationId = getOrganizationId();

    const { data, error } = await supabase
      .from('branches')
      .select('id, name, address, is_main')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error obteniendo sucursales:', error);
      throw error;
    }

    return data || [];
  }

  static async obtenerProductos(): Promise<Product[]> {
    const organizationId = getOrganizationId();

    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, barcode, unit_code')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('name');

    if (error) {
      console.error('Error obteniendo productos:', error);
      throw error;
    }

    return data || [];
  }

  static async obtenerStockDisponible(
    branchId: number, 
    productId: number
  ): Promise<number> {
    const { data, error } = await supabase
      .from('stock_levels')
      .select('qty_on_hand, qty_reserved')
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, lo cual es válido (stock = 0)
      console.error('Error obteniendo stock:', error);
      return 0;
    }

    // Stock disponible = qty_on_hand - qty_reserved
    const qtyOnHand = data?.qty_on_hand || 0;
    const qtyReserved = data?.qty_reserved || 0;
    return Math.max(0, qtyOnHand - qtyReserved);
  }

  static async obtenerLotesProducto(
    productId: number, 
    branchId: number
  ): Promise<{ id: number; lot_number: string; qty_available: number; expiry_date?: string }[]> {
    const { data, error } = await supabase
      .from('stock_levels')
      .select(`
        lot_id,
        qty_on_hand,
        qty_reserved,
        lots!inner(id, lot_number, expiry_date)
      `)
      .eq('branch_id', branchId)
      .eq('product_id', productId)
      .gt('qty_on_hand', 0)
      .not('lot_id', 'is', null);

    if (error) {
      console.error('Error obteniendo lotes:', error);
      return [];
    }

    return (data || []).map((item: any) => ({
      id: item.lots.id,
      lot_number: item.lots.lot_number,
      qty_available: Math.max(0, (item.qty_on_hand || 0) - (item.qty_reserved || 0)),
      expiry_date: item.lots.expiry_date
    }));
  }
}
