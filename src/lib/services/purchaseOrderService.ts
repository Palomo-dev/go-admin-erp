import { supabase } from '@/lib/supabase/config';
import {
  ErrorRecepcionOrdenCompra,
  lineasPendientes,
  nuevaClaveRecepcion,
  recepcionarOrdenCompra,
  type ResultadoRecepcionOC,
} from '@/lib/services/inventario/recepcionOrdenCompra';

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
    /** Cómo se vende (peso o medida: la cantidad lleva decimales y unidad). */
    sale_mode?: string | null;
    qty_decimals?: number | null;
    track_serial?: boolean | null;
    track_lots?: boolean | null;
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
  serial_numbers?: string[];
  requires_serial?: boolean;
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

/** Fila de `products` que lee `getProducts`. */
interface FilaProductoOrdenCompra {
  id: number;
  uuid: string;
  sku: string;
  name: string;
  unit_code: string | null;
  track_stock: boolean;
  track_serial: boolean;
  is_parent: boolean;
  parent_product_id: number | null;
  variant_data: Record<string, string> | null;
  categories: { name: string } | null;
}

/** Producto para los selectores de órdenes de compra y recetas. */
export interface ProductoParaOrdenCompra {
  id: number;
  uuid: string;
  sku: string;
  name: string;
  unit_code?: string;
  category?: string;
  cost: number;
  track_stock: boolean;
  image: string | null;
  is_parent: boolean;
  parent_product_id: number | null;
  variant_data: Record<string, string> | null;
  parent_name: string | null;
  parent_image: string | null;
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
    } catch (error) {
      console.error('Error obteniendo órdenes de compra:', (error as { message?: string } | null)?.message || error);
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
          products:product_id (id, uuid, sku, name, unit_code, sale_mode, qty_decimals, track_serial, track_lots)
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
    } catch (error) {
      console.error('Error obteniendo orden de compra:', (error as { message?: string } | null)?.message || error);
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
          notes: item.notes || null,
          requires_serial: item.requires_serial || false,
          serials_received: item.serial_numbers && item.serial_numbers.length > 0 ? item.serial_numbers : null,
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
    } catch (error) {
      console.error('Error creando orden de compra:', (error as { message?: string } | null)?.message || error);
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
            notes: item.notes || null,
            requires_serial: item.requires_serial || false,
            serials_received: item.serial_numbers && item.serial_numbers.length > 0 ? item.serial_numbers : null,
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
    } catch (error) {
      console.error('Error actualizando orden de compra:', (error as { message?: string } | null)?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Escribe el estado tal cual, sin validar. Uso interno.
   *
   * Solo la recepción (`fn_oc_recepcionar`, inventario B8) deja una orden en
   * 'partial' o 'received', porque esos dos estados significan "esta mercancia
   * ya entro al inventario" y se derivan de las cantidades realmente recibidas.
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
    } catch (error) {
      console.error('Error actualizando estado:', (error as { message?: string } | null)?.message || error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Cambiar estado de orden de compra por UUID.
   *
   * No acepta 'received' ni 'partial': antes si los aceptaba, y marcar una orden
   * como recibida desde el listado solo cambiaba el status sin sumar una sola
   * unidad al inventario. Para recibir hay que pasar por la recepción
   * (`recepcionarOrdenCompra` o `receiveAllPending` → `fn_oc_recepcionar`).
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
        error: new Error('Para recibir una orden usa la recepción (fn_oc_recepcionar), que sí registra el stock'),
      };
    }

    return this.setStatus(orderUuid, organizationId, newStatus);
  }

  /**
   * Recibe de golpe todo lo que quede pendiente de la orden («Marcar recibida»
   * del listado) por la misma RPC que la recepción del detalle
   * (`fn_oc_recepcionar`, inventario B8): una transacción con kardex, estado y
   * factura al completar. Si una línea exige lote o seriales, la RPC lo rechaza
   * con un código legible (`lote_requerido`, `seriales_no_cuadran`) y no recibe
   * nada: esa orden se recibe desde el detalle.
   */
  async receiveAllPending(
    orderUuid: string,
    organizationId: number
  ): Promise<{ success: boolean; error: Error | null; resultado?: ResultadoRecepcionOC }> {
    try {
      const { data: order } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('uuid', orderUuid)
        .eq('organization_id', organizationId)
        .single();

      if (!order) {
        return { success: false, error: new ErrorRecepcionOrdenCompra('orden_no_encontrada') };
      }

      const { data: items } = await supabase
        .from('purchase_order_items')
        .select('id, product_id, quantity, received_quantity')
        .eq('purchase_order_id', order.id);

      const lineas = lineasPendientes(items ?? []);
      if (lineas.length === 0) {
        return { success: false, error: new ErrorRecepcionOrdenCompra('orden_no_recibible') };
      }

      const resultado = await recepcionarOrdenCompra(orderUuid, { lineas, clave: nuevaClaveRecepcion() });
      return { success: true, error: null, resultado };
    } catch (error) {
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
    } catch (error) {
      console.error('Error eliminando orden:', (error as { message?: string } | null)?.message || error);
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
    } catch (error) {
      console.error('Error duplicando orden:', (error as { message?: string } | null)?.message || error);
      return { data: null, error: error as Error };
    }
  }

  /**
   * Obtener estadísticas
   */
  async getStats(organizationId: number, branchId?: number): Promise<PurchaseOrderStats> {
    try {
      let query = supabase
        .from('purchase_orders')
        .select('status, total')
        .eq('organization_id', organizationId);

      if (branchId != null) {
        query = query.eq('branch_id', branchId);
      }

      const { data } = await query;

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
  async getProducts(organizationId: number): Promise<ProductoParaOrdenCompra[]> {
    try {
      // Cargar todos los productos activos (incluyendo padres para mapeo)
      // Paginar porque Supabase devuelve máximo 1000 filas por defecto
      const PAGE_SIZE = 1000;
      let allData: FilaProductoOrdenCompra[] = [];
      let offset = 0;
      while (true) {
        const { data: pageData, error: pageError } = await supabase
          .from('products')
          .select('id, uuid, sku, name, unit_code, track_stock, track_serial, is_parent, parent_product_id, variant_data, categories(name)')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .neq('product_type', 'service')
          .order('name')
          .range(offset, offset + PAGE_SIZE - 1);

        if (pageError) break;
        if (!pageData || pageData.length === 0) break;
        allData = allData.concat(pageData as unknown as FilaProductoOrdenCompra[]);
        if (pageData.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      if (allData.length === 0) return [];

      // Mapa de padres: id -> { name, sku }
      const parentMap = new Map<number, { name: string; sku: string }>();
      allData.forEach((p) => {
        if (p.is_parent) {
          parentMap.set(p.id, { name: p.name, sku: p.sku });
        }
      });

      // Mapa de SKU base -> nombre del padre (para variantes huérfanas sin parent_product_id)
      const skuToParent = new Map<string, string>();
      allData.forEach((p) => {
        if (p.is_parent) {
          skuToParent.set(p.sku, p.name);
        }
      });

      // Filtrar: excluir padres y productos con variant_data vacío
      const data = allData.filter((p) => {
        if (p.is_parent) return false;
        if (p.variant_data && typeof p.variant_data === 'object') {
          const hasValues = Object.values(p.variant_data).some((v: unknown) => v && String(v).trim() !== '');
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
          imgData.forEach((img: { product_id: number; storage_path: string | null; is_primary: boolean }) => {
            if (img.storage_path) {
              const bucket = (img.storage_path.startsWith('products/') || img.storage_path.startsWith('productos/')) ? 'product-images' : 'organization_images';
              const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(img.storage_path);
              imageMap[img.product_id] = urlData?.publicUrl || null;
            }
          });
        }
      }

      return data.map((p): ProductoParaOrdenCompra => {
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
              const parentEntry = allData.find((pp) => pp.sku === baseSku && pp.is_parent);
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
          unit_code: p.unit_code ?? undefined,
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
