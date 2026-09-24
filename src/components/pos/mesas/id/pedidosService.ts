import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { POSService } from '@/lib/services/posService';
import { generateInvoiceNumber as generateInvoiceNumberUtil } from '@/lib/utils/invoiceUtils';
import { stockMovementService } from '@/lib/services/stockMovementService';
import { serialTrackingService } from '@/lib/services/serialTrackingService';
import { promotionEngine } from '@/lib/services/promotionEngine';
import { resolveLineTax } from '@/lib/services/taxResolver';
import {
  itemsParaImprimir,
  normalizarNota,
  ticketRondaDesdeRegistro,
  type RegistroComanda,
  type TextosAjusteImpreso,
} from '@/lib/pos/cocina/lineasCarrito';
import { ajustarLineaMesa } from '@/components/pos/cocina/cocinaCliente';
import {
  calculateItemTaxes,
  type OrganizationTax as TaxUtilOrganizationTax,
  type TaxCalculationItem,
} from '@/lib/utils/taxCalculations';
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
              parent_product_id,
              variant_data,
              product_images(
                id,
                storage_path,
                is_primary,
                display_order
              )
            ),
            kitchen_ticket_items(id, status, cancelled_at, adjustment_kind)
          `)
          .in('sale_id', saleIds)
          .order('created_at', { ascending: true });

        if (itemsError) {
          console.error('Error consultando items:', itemsError);
          throw new Error(`Error en consulta de items: ${itemsError.message || JSON.stringify(itemsError)}`);
        }
        
        allItems = items || [];

        // Fallback de imagen: para items cuyo producto (variante) no tiene
        // imagen propia, resolver las imágenes del producto padre en una
        // consulta aparte (un embed auto-referenciado anidado no es soportado por PostgREST).
        const parentIdsSinImagen = Array.from(new Set(
          allItems
            .filter((item: any) => item.product?.parent_product_id && !item.product?.product_images?.length)
            .map((item: any) => item.product.parent_product_id)
        ));

        if (parentIdsSinImagen.length > 0) {
          const { data: parentImages } = await supabase
            .from('product_images')
            .select('id, product_id, storage_path, is_primary, display_order')
            .in('product_id', parentIdsSinImagen);

          const parentImagesByProductId = new Map<number, any[]>();
          (parentImages || []).forEach((img: any) => {
            const list = parentImagesByProductId.get(img.product_id) || [];
            list.push(img);
            parentImagesByProductId.set(img.product_id, list);
          });

          allItems = allItems.map((item: any) => {
            if (item.product?.parent_product_id && !item.product?.product_images?.length) {
              return {
                ...item,
                product: {
                  ...item.product,
                  parent_product: {
                    product_images: parentImagesByProductId.get(item.product.parent_product_id) || [],
                  },
                },
              };
            }
            return item;
          });
        }
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
            sale_date: new Date().toISOString(),
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

      // 2. Calcular impuestos reales por item y preparar sale_items
      const orgTaxes = await POSService.getOrganizationTaxes();
      const formattedOrgTaxes: TaxUtilOrganizationTax[] = (orgTaxes || []).map((t: any) => ({
        id: String(t.id),
        name: t.name,
        rate: parseFloat(t.rate?.toString() || '0'),
        is_default: t.is_default ?? false,
        is_active: t.is_active ?? true,
      }));
      const defaultApplied: { [key: string]: boolean } = {};
      formattedOrgTaxes.forEach((t) => { defaultApplied[t.id] = t.is_default; });

      const saleItems = [];

      // --- Evaluar promociones activas para POS (mesas) ---
      let promoDiscounts: Record<number, number> = {};
      try {
        const promoResult = await promotionEngine.evaluate({
          channel: 'pos',
          items: productos.map(p => ({
            product_id: p.product_id,
            quantity: p.quantity,
            unit_price: p.unit_price,
          })),
          organization_id: organizationId,
          branch_id: branchId,
        });
        promoDiscounts = promoResult.itemDiscounts;
      } catch (promoErr) {
        console.warn('[pedidosService] No se pudieron evaluar promociones:', promoErr);
      }

      for (const p of productos) {
        let itemTaxAmount = 0;
        let itemTotal = p.quantity * p.unit_price;
        const itemDiscount = promoDiscounts[p.product_id] || 0;

        try {
          // Intentar impuestos específicos del producto
          const productTaxes = await POSService.getProductTaxes(p.product_id);
          let effectiveApplied = defaultApplied;
          let effectiveOrgTaxes = formattedOrgTaxes;
          let effectiveTaxIncluded = false;

          if (productTaxes && productTaxes.length > 0) {
            const productApplied: { [key: string]: boolean } = {};
            const productOrgTaxes: TaxUtilOrganizationTax[] = [];
            productTaxes.forEach((relation: any) => {
              if (relation.organization_taxes && relation.organization_taxes.is_active) {
                const taxId = String(relation.organization_taxes.id);
                productApplied[taxId] = true;
                if (relation.organization_taxes.tax_included === true) {
                  effectiveTaxIncluded = true;
                }
                productOrgTaxes.push({
                  id: taxId,
                  name: relation.organization_taxes.name,
                  rate: parseFloat(relation.organization_taxes.rate?.toString() || '0'),
                  is_default: relation.organization_taxes.is_default ?? false,
                  is_active: relation.organization_taxes.is_active ?? true,
                });
              }
            });
            effectiveApplied = productApplied;
            effectiveOrgTaxes = productOrgTaxes;
          }

          const taxItem: TaxCalculationItem = {
            quantity: p.quantity,
            unit_price: p.unit_price,
            product_id: p.product_id,
            discount_amount: itemDiscount,
          };

          const itemTaxes = calculateItemTaxes(taxItem, effectiveApplied, effectiveOrgTaxes, effectiveTaxIncluded);
          itemTaxAmount = itemTaxes.reduce((sum, t) => sum + t.taxAmount, 0);
          itemTaxAmount = Math.round(itemTaxAmount * 100) / 100;

          if (!effectiveTaxIncluded) {
            itemTotal = p.quantity * p.unit_price + itemTaxAmount;
          }
        } catch (error) {
          console.error('Error calculating tax for product', p.product_id, error);
          itemTaxAmount = 0;
          itemTotal = p.quantity * p.unit_price;
        }

        saleItems.push({
          sale_id: saleId,
          product_id: p.product_id,
          quantity: p.quantity,
          unit_price: p.unit_price,
          total: itemTotal,
          tax_amount: itemTaxAmount,
          discount_amount: itemDiscount,
          notes: {
            product_name: p.product_name,
            // Texto plano (el editor de la mesa entrega HTML, N8).
            ...(normalizarNota(p.notes) ? { extra: normalizarNota(p.notes) } : {}),
            ...(normalizarNota(p.notes) && p.is_allergy ? { is_allergy: true } : {}),
            ...(p.guest_number ? { guest_number: p.guest_number } : {}),
            ...(p.modifiers && p.modifiers.length > 0 ? { modifiers: p.modifiers } : {}),
          },
        });
      }

      const { data: insertedItems, error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems)
        .select();

      if (itemsError) {
        console.error('Error insertando items de venta:', itemsError);
        throw new Error(`Error al insertar items: ${itemsError.message || JSON.stringify(itemsError)}`);
      }

      // 3. Filtrar items que requieren preparación (kitchen ticket)
      // Solo se envían a cocina los productos cuya categoría tiene requires_preparation=true
      // o que tienen una estación asignada explícitamente.
      const itemsRequiringPreparation = insertedItems.filter((item, index) => {
        const producto = productos[index];
        return producto.requires_preparation || (producto.station && producto.station !== '');
      });

      // 4. Solo crear ticket de cocina si hay items que requieren preparación
      if (itemsRequiringPreparation.length > 0) {
        const conAlergia = itemsRequiringPreparation.some((item) => {
          const p = productos[insertedItems.indexOf(item)];
          return !!p.is_allergy && !!normalizarNota(p.notes);
        });
        const { data: ticket, error: ticketError } = await supabase
          .from('kitchen_tickets')
          .insert({
            organization_id: organizationId,
            branch_id: branchId,
            table_session_id: sessionId,
            sale_id: saleId,
            status: 'new',
            priority: 0,
            has_allergy: conAlergia,
          })
          .select()
          .single();

        if (ticketError) throw ticketError;

        // 5. Crear items del ticket (solo los que requieren preparación).
        // Con copia de nombre, cantidad y modificadores (N11): si la línea de
        // la cuenta cambia después, la comanda enviada no cambia en silencio;
        // el cambio llega como comanda de ajuste (pos_cocina_ajustar_linea_mesa).
        const ticketItems = itemsRequiringPreparation.map((item) => {
          const index = insertedItems.indexOf(item);
          const p = productos[index];
          const nota = normalizarNota(p.notes);
          return {
            organization_id: organizationId,
            kitchen_ticket_id: ticket.id,
            sale_item_id: item.id,
            station: p.station || null,
            notes: p.guest_number
              ? `Comensal ${p.guest_number}${nota ? ` - ${nota}` : ''}`
              : (nota || null),
            status: 'pending' as const,
            product_name: p.product_name,
            quantity: p.quantity,
            variant_data: p.variant_data || null,
            modifiers: p.modifiers && p.modifiers.length > 0
              ? p.modifiers.map((m) => ({ name: m.name, extraPrice: m.extraPrice }))
              : null,
            is_allergy: !!p.is_allergy && !!nota,
          };
        });

        const { error: ticketItemsError } = await supabase
          .from('kitchen_ticket_items')
          .insert(ticketItems);

        if (ticketItemsError) throw ticketItemsError;
      }

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
        .select('unit_price, quantity, total, tax_amount, discount_amount')
        .eq('sale_id', saleId);

      if (!items) return;

      const subtotal = items.reduce(
        (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
        0
      );
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
  /**
   * Eliminar item de la orden (anular la línea).
   *
   * Pasa por `pos_cocina_ajustar_linea_mesa` (vía /api/pos/cocina/mesa-linea):
   * si el plato ya está en cocina NO se borra su ítem de comanda (N3): queda
   * `cancelled` con el motivo y la cocina recibe una comanda de ajuste. La
   * auditoría (`ops_audit_log`, misma forma de siempre) la escribe la RPC en
   * la misma transacción. Anular algo ya enviado exige motivo.
   */
  static async eliminarItem(saleItemId: string, motivo?: string): Promise<void> {
    try {
      const resultado = await ajustarLineaMesa(saleItemId, 0, motivo ?? null);
      if (resultado.sale_id) {
        await this.recalcularTotalVenta(resultado.sale_id);
      }
    } catch (error) {
      console.error('Error eliminando item:', error);
      throw error;
    }
  }

  /**
   * Actualizar cantidad de un item.
   *
   * Misma fórmula de la línea que antes (impuesto por unidad × cantidad nueva,
   * total = precio × cantidad + impuesto), ahora en la RPC para que el ajuste
   * de cocina y la línea cambien en la misma transacción. Si el plato ya se
   * envió, la comanda original no cambia en silencio: sale una de ajuste
   * (+/−). Restar algo ya enviado exige motivo.
   */
  static async actualizarCantidadItem(
    saleItemId: string,
    nuevaCantidad: number,
    motivo?: string
  ): Promise<void> {
    try {
      const resultado = await ajustarLineaMesa(saleItemId, nuevaCantidad, motivo ?? null);
      if (resultado.sale_id) {
        await this.recalcularTotalVenta(resultado.sale_id);
      }
    } catch (error) {
      console.error('Error actualizando cantidad:', error);
      throw error;
    }
  }

  /**
   * Generar pre-cuenta
   */
  static async generarPreCuenta(tableId: string): Promise<PreCuenta> {
    try {
      const detalles = await this.obtenerDetalleMesa(tableId);
      
      if (!detalles || !detalles.sale_items) {
        throw new Error('No hay items en la orden');
      }

      const items = detalles.sale_items;
      const subtotal = items.reduce(
        (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
        0
      );
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
   * Enviar comandas a cocina (marcar como printed).
   * Devuelve el detalle de los tickets recién enviados (items + estación + producto)
   * para poder encolar la impresión física por estación (ver PrintJobsService).
   */
  static async enviarComandaCocina(sessionId: string, textos?: TextosAjusteImpreso): Promise<Array<{
    ticketId: number;
    createdAt: string;
    items: Array<{ productName: string; quantity: number; notes: string | null; station: string | null; variantData?: Record<string, string> | null; modifiers?: Array<{ name: string; extraPrice: number }> | null }>;
  }>> {
    try {
      const { data: pendientes, error: fetchError } = await supabase
        .from('kitchen_tickets')
        .select(`
          id, created_at, ticket_type, adjusts_ticket_id, has_allergy,
          kitchen_ticket_items(
            id, station, notes, status, product_name, quantity, quantity_delta, adjustment_kind,
            adjustment_reason, is_allergy, variant_data, modifiers,
            sale_items(quantity, notes, products(name, variant_data))
          )
        `)
        .eq('table_session_id', sessionId)
        .is('printed_at', null);

      if (fetchError) throw fetchError;
      if (!pendientes || pendientes.length === 0) return [];

      const { error } = await supabase
        .from('kitchen_tickets')
        .update({ printed_at: new Date().toISOString() })
        .in('id', pendientes.map((t) => t.id));

      if (error) throw error;

      // La copia del ítem manda (nombre, cantidad) y un ajuste imprime qué
      // cambió (+n, −n, ANULAR, NOTA); ver `itemsParaImprimir`.
      return (pendientes as unknown as RegistroComanda[]).map((registro) => {
        const ticket = ticketRondaDesdeRegistro(registro);
        const items = textos
          ? itemsParaImprimir(ticket, textos)
          : ticket.items.map((it) => ({
              productName: it.product_name || 'Producto',
              quantity: it.quantity,
              notes: it.notes,
              station: it.station,
              variantData: it.variant_data,
              modifiers: (it.modifiers || []).map((m) => ({ name: m.name, extraPrice: Number(m.extraPrice) || 0 })),
            }));
        return { ticketId: ticket.id, createdAt: ticket.created_at, items };
      });
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

  /**
   * Completar venta de mesa: actualiza la venta existente con pagos y estado
   * A diferencia de POSService.checkout (que crea una venta nueva), este método
   * actualiza la venta ya asociada a la sesión de la mesa.
   */
  static async completarVentaMesa(
    saleId: string,
    data: {
      payments: { method: string; amount: number }[];
      total_paid: number;
      change?: number;
      tip_amount?: number;
      tip_server_id?: string;
      tax_included?: boolean;
      tax_breakdown?: { name: string; amount: number }[];
      subtotal: number;
      tax_total: number;
      total: number;
      table_session_id?: string;
      driver_id?: string;
      salesperson_id?: string;
      commission_rate?: number;
      commission_type?: 'salesperson' | 'intermediation_sale' | 'none';
      commission_method?: 'percentage' | 'fixed_amount';
      commission_amount?: number;
      serial_selections?: Record<number, number[]>;
    }
  ): Promise<{ id: string; total: number; status: string }> {
    try {
      const balance = Math.max(0, data.total - data.total_paid);
      const isPaid = data.total_paid >= data.total;
      const now = new Date().toISOString();

      // 0. Verificar estado actual de la venta para evitar re-disparar el trigger
      const { data: existingSale } = await supabase
        .from('sales')
        .select('status')
        .eq('id', saleId)
        .single();

      const alreadyPaid = existingSale?.status === 'paid';

      // 1. Actualizar la venta existente con totales, propina y vínculos
      // Si la venta ya estaba 'paid', no cambiar status para evitar re-disparar
      // el trigger trg_auto_journal_sale_pos (asiento contable duplicado)
      const updateData: Record<string, any> = {
        subtotal: data.subtotal,
        tax_total: data.tax_total,
        total: data.total,
        balance,
        tax_included: data.tax_included || false,
        tax_breakdown: data.tax_breakdown || null,
        tip_amount: data.tip_amount || 0,
        tip_server_id: data.tip_server_id || null,
        driver_id: data.driver_id || null,
        table_session_id: data.table_session_id || null,
        updated_at: now,
      };

      if (!alreadyPaid) {
        updateData.status = isPaid ? 'paid' : 'pending';
        updateData.payment_status = isPaid ? 'paid' : 'partial';
      }

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .update(updateData)
        .eq('id', saleId)
        .select()
        .single();

      if (saleError) throw saleError;

      // 2. Registrar pagos en tabla payments (no sale_payments que no existe)
      const baseCurrency = await POSService.getBaseCurrency();
      const currentUser = await supabase.auth.getUser();
      const userId = currentUser.data.user?.id;

      const changeAmount = data.change || 0;
      let changeAssigned = false;
      for (const payment of data.payments) {
        if (payment.amount > 0) {
          const isCashChange = !changeAssigned && changeAmount > 0 && payment.method === 'cash';
          if (isCashChange) changeAssigned = true;
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              organization_id: saleData.organization_id,
              branch_id: saleData.branch_id,
              source: 'sale',
              source_id: saleId,
              method: payment.method,
              amount: payment.amount,
              currency: baseCurrency.code,
              status: 'completed',
              created_by: userId || null,
              payment_date: now,
              change_amount: isCashChange ? changeAmount : 0,
            });

          if (paymentError) {
            console.error('Error registrando pago en payments:', paymentError);
          }
        }
      }

      // 3. Actualizar o crear factura asociada con items
      const { data: existingInvoice } = await supabase
        .from('invoice_sales')
        .select('id')
        .eq('sale_id', saleId)
        .maybeSingle();

      let invoiceId: string | null = null;

      if (existingInvoice) {
        invoiceId = existingInvoice.id;
        await supabase
          .from('invoice_sales')
          .update({
            subtotal: data.subtotal,
            tax_total: data.tax_total,
            total: data.total,
            balance,
            status: balance > 0 ? 'partial' : 'paid',
            tax_included: data.tax_included || false,
            payment_method: data.payments.length > 0 ? data.payments[0].method : 'cash',
            updated_at: now,
          })
          .eq('sale_id', saleId);
      } else {
        const invoiceNumber = await generateInvoiceNumberUtil(saleData.organization_id, 'FACT');

        const { data: newInvoice, error: invoiceError } = await supabase
          .from('invoice_sales')
          .insert({
            organization_id: saleData.organization_id,
            branch_id: saleData.branch_id,
            customer_id: saleData.customer_id || null,
            sale_id: saleId,
            number: invoiceNumber,
            issue_date: now,
            due_date: now,
            currency: baseCurrency.code,
            subtotal: data.subtotal,
            tax_total: data.tax_total,
            total: data.total,
            balance,
            status: balance > 0 ? 'partial' : 'paid',
            tax_included: data.tax_included || false,
            payment_method: data.payments.length > 0 ? data.payments[0].method : 'cash',
            payment_terms: 0,
            created_by: userId || null,
            notes: `Factura generada desde Mesa - Venta #${saleId}`,
          })
          .select()
          .single();

        if (invoiceError) {
          console.error('Error creando factura:', invoiceError);
        } else {
          invoiceId = newInvoice.id;
        }
      }

      // 4. Crear invoice_items si hay factura y no existen items
      if (invoiceId) {
        const { data: existingItems } = await supabase
          .from('invoice_items')
          .select('id')
          .eq('invoice_sales_id', invoiceId)
          .limit(1);

        if (!existingItems || existingItems.length === 0) {
          // Obtener sale_items para crear invoice_items
          const { data: saleItems } = await supabase
            .from('sale_items')
            .select(`
              id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes
            `)
            .eq('sale_id', saleId);

          if (saleItems && saleItems.length > 0) {
            const productIds = saleItems.map(si => si.product_id).filter(id => id);
            const { data: productsData } = await supabase
              .from('products')
              .select('id, name, description')
              .in('id', productIds);

            const productMap = new Map((productsData || []).map(p => [p.id, p]));

            // F-42: la tarifa de cada línea sale del resolver único. Manda la
            // tarifa guardada en sale_items si la hay; si no, el resolver sigue
            // con los impuestos del producto y los de la organización por
            // defecto, que son los mismos que usó la mesa para calcular el
            // impuesto al agregar el producto. El modo incluido/no incluido es
            // el de la factura, y el descuento de la línea (promociones) entra
            // en total_line para que la línea sea coherente con la cabecera.
            const taxIncludedFactura = data.tax_included || false;
            const invoiceItems = await Promise.all(saleItems.map(async (item) => {
              const product = productMap.get(item.product_id);
              const description = product
                ? `${product.name}${product.description ? ' - ' + product.description : ''}`
                : `Producto ID: ${item.product_id}`;
              const discountAmount = Number(item.discount_amount) || 0;
              const resolved = await resolveLineTax({
                itemTaxRate: Number(item.tax_rate) || 0,
                productId: item.product_id || null,
                organizationId: saleData.organization_id,
                taxIncluded: taxIncludedFactura,
                qty: Number(item.quantity) || 0,
                unitPrice: Number(item.unit_price) || 0,
                discountAmount,
              });

              return {
                invoice_id: invoiceId,
                invoice_sales_id: invoiceId,
                invoice_type: 'sale',
                product_id: item.product_id,
                description: description.substring(0, 255),
                qty: item.quantity,
                unit_price: item.unit_price,
                total_line: resolved.total_line,
                tax_rate: resolved.tax_rate,
                tax_code: resolved.tax_code,
                tax_included: resolved.tax_included,
                discount_amount: discountAmount,
              };
            }));

            const { error: itemsError } = await supabase
              .from('invoice_items')
              .insert(invoiceItems);

            if (itemsError) {
              console.error('Error creando invoice_items:', itemsError);
            }
          }
        }
      }

      // 5. Crear cuenta por cobrar si hay balance pendiente y cliente
      if (balance > 0 && saleData.customer_id) {
        const { error: arError } = await supabase
          .from('accounts_receivable')
          .insert({
            organization_id: saleData.organization_id,
            branch_id: saleData.branch_id,
            customer_id: saleData.customer_id,
            invoice_id: invoiceId,
            sale_id: saleId,
            amount: data.total,
            balance,
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'partial',
          });

        if (arError) {
          console.error('Error creando cuenta por cobrar:', arError);
        }
      }

      // Los pagos de ventas de mesa se registran en la tabla payments.
      // No se crean cash_movements para evitar doble conteo en el cierre de caja.

      // Nota: el asiento contable (journal_entries + journal_lines) NO se crea aquí.
      // Ya existe un trigger de base de datos (trg_auto_journal_sale_pos ->
      // fn_auto_journal_sale_pos) que se dispara automáticamente cuando `sales.status`
      // pasa a 'paid' (ver paso 1 de este método) y genera el asiento usando las
      // cuentas configuradas en `accounting_rules` por organización. Crearlo también
      // aquí manualmente generaba asientos duplicados (source='sale' vs 'sales' del
      // trigger) y errores de FK por usar códigos de cuenta hardcodeados que no
      // existen para todas las organizaciones.

      // 7. Descontar stock de los items vendidos
      try {
        const { data: saleItemsForStock } = await supabase
          .from('sale_items')
          .select('product_id, quantity, unit_price')
          .eq('sale_id', saleId);

        if (saleItemsForStock && saleItemsForStock.length > 0) {
          const stockResult = await stockMovementService.decrementOnSale(
            saleData.organization_id,
            saleData.branch_id,
            saleId,
            saleItemsForStock.map((item: any) => ({
              product_id: item.product_id,
              quantity: Number(item.quantity),
              unit_price: Number(item.unit_price),
            })),
            'mesa_sale'
          );
          if (stockResult.errors.length > 0) {
            console.warn('⚠️ Algunos items no descontaron stock:', stockResult.errors);
          }
          console.log(`📦 Stock descontado (mesa): ${saleItemsForStock.length - stockResult.skipped} items procesados`);
        }
      } catch (stockError) {
        console.warn('⚠️ Error descontando stock (no bloquea la venta):', stockError);
      }

      // 7.1. Vender seriales si hay productos serializados con seriales seleccionados
      if (data.serial_selections) {
        try {
          const serialUserId = await supabase.auth.getUser().then(u => u.data.user?.id);
          // Obtener items de la venta para mapear product_id -> unit_price
          const { data: saleItemsForSerials } = await supabase
            .from('sale_items')
            .select('product_id, unit_price')
            .eq('sale_id', saleId);

          for (const item of saleItemsForSerials ?? []) {
            const serialIds = data.serial_selections[item.product_id];
            if (!serialIds || serialIds.length === 0) continue;

            const { success: serialOk, errors: serialErrors } = await serialTrackingService.sellSerials(
              serialIds,
              {
                sale_id: saleId,
                customer_id: saleData.customer_id ?? undefined,
                sold_by_user_id: serialUserId ?? undefined,
                sale_channel: 'table',
                price_at_sale: Number(item.unit_price),
                branch_id: saleData.branch_id,
              },
              serialUserId ?? undefined
            );

            if (!serialOk) {
              console.warn(`⚠️ Errores vendiendo seriales para producto ${item.product_id}:`, serialErrors);
            } else {
              console.log(`✅ ${serialIds.length} seriales vendidos (mesa) para producto ${item.product_id}`);
            }
          }
        } catch (serialError) {
          console.warn('⚠️ Error vendiendo seriales (no bloquea la venta):', serialError);
        }
      }

      // 8. Crear registro de comisión si aplica
      if (data.salesperson_id && data.commission_rate && data.commission_rate > 0 && data.commission_type && data.commission_type !== 'none') {
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', data.salesperson_id)
            .single();

          let salespersonName = 'N/A';
          if (profileData) {
            salespersonName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'N/A';
          }

          const baseAmount = data.subtotal > 0 ? data.subtotal : data.total;
          const commissionAmount = data.commission_method === 'fixed_amount'
            ? data.commission_rate
            : Math.round(baseAmount * data.commission_rate / 100 * 100) / 100;

          const { error: commissionInsertError } = await supabase
            .from('commissions')
            .insert({
              organization_id: saleData.organization_id,
              branch_id: saleData.branch_id,
              commission_type: data.commission_type,
              source_type: 'sale',
              source_id: saleId,
              payee_type: 'employee',
              payee_id: data.salesperson_id,
              payee_name: salespersonName,
              base_amount: baseAmount,
              commission_rate: data.commission_rate,
              commission_amount: commissionAmount,
              currency: baseCurrency.code,
              status: 'accrued',
              accrued_at: now,
              created_by: userId || null,
              metadata: { sale_id: saleId, commission_method: data.commission_method || 'percentage', source: 'mesa' },
            });
          if (commissionInsertError) {
            console.error('Error al crear registro de comisión (mesa):', commissionInsertError);
          }
        } catch (commissionErr) {
          console.error('Error al crear registro de comisión (mesa catch):', commissionErr);
        }
      }

      return {
        id: saleData.id,
        total: saleData.total,
        status: saleData.status,
      };
    } catch (error: any) {
      console.error('Error completando venta de mesa:', error);
      throw error;
    }
  }
}
