import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { POSService } from '@/lib/services/posService';
import { promotionEngine } from '@/lib/services/promotionEngine';
import { calcularLineaVenta, totalesDeLineasGuardadas } from '@/lib/pos/lineaVenta';
import {
  itemsParaImprimir,
  normalizarNota,
  ticketRondaDesdeRegistro,
  type RegistroComanda,
  type TextosAjusteImpreso,
} from '@/lib/pos/cocina/lineasCarrito';
import { ajustarLineaMesa } from '@/components/pos/cocina/cocinaCliente';
import type { OrganizationTax as TaxUtilOrganizationTax } from '@/lib/utils/taxCalculations';
import type {
  TableSessionWithDetails,
  ProductToAdd,
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
      // Mismos datos que el mostrador (POSService.checkout): categoría y
      // producto padre, para que las promociones por categoría o sobre el
      // padre de una variante alcancen también a la mesa.
      let promoDiscounts: Record<number, number> = {};
      try {
        const promoResult = await promotionEngine.evaluate({
          channel: 'pos',
          items: productos.map(p => ({
            product_id: p.product_id,
            parent_product_id: p.parent_product_id ?? null,
            category_id: p.category_id ?? undefined,
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
        // El descuento de la promoción nunca pasa de la línea (el cobro lo valida).
        const itemDiscount = Math.min(promoDiscounts[p.product_id] || 0, p.quantity * p.unit_price);
        // Tasa y modo de impuesto de la línea: los de siempre (impuestos del
        // producto; si no tiene, los de la organización por defecto). Sin
        // impuestos resueltos, la línea va sin impuesto como antes.
        let tasaLinea = 0;
        let incluidoLinea = false;

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

          tasaLinea = effectiveOrgTaxes
            .filter((t) => effectiveApplied[t.id] && t.is_active !== false)
            .reduce((sum, t) => sum + (Number(t.rate) || 0), 0);
          incluidoLinea = effectiveTaxIncluded;
        } catch (error) {
          console.error('Error calculating tax for product', p.product_id, error);
          tasaLinea = 0;
          incluidoLinea = false;
        }

        // Regla única de la línea (la del cobro y la de la base). Antes: total =
        // precio × cantidad + impuesto, sin restar el descuento.
        const linea = calcularLineaVenta({
          quantity: p.quantity,
          unit_price: p.unit_price,
          discount_amount: itemDiscount,
          tax_rate: tasaLinea,
          tax_included: incluidoLinea,
        });

        saleItems.push({
          sale_id: saleId,
          product_id: p.product_id,
          quantity: p.quantity,
          unit_price: p.unit_price,
          total: linea.total,
          tax_amount: linea.taxAmount,
          tax_rate: linea.taxRate,
          tax_included: linea.taxIncluded,
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
   * Recalcular los totales de la cuenta en el servidor
   * (`pos_mesa_recalcular_venta`): líneas con la regla única y cabecera como
   * suma de líneas + flete + propina; saldo = total − pagado.
   *
   * Antes se escribía desde el navegador subtotal = precio × cantidad y total =
   * subtotal + impuesto − descuento: con el impuesto incluido en el precio el
   * IVA contaba dos veces, y el saldo se pisaba con el total aunque ya hubiera
   * pagos parciales.
   */
  static async recalcularTotalVenta(saleId: string): Promise<void> {
    const { error } = await supabase.rpc('pos_mesa_recalcular_venta', { p_sale_id: saleId });
    if (error) {
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
      // La RPC recalcula la cabecera de la cuenta en la misma transacción.
      await ajustarLineaMesa(saleItemId, 0, motivo ?? null);
    } catch (error) {
      console.error('Error eliminando item:', error);
      throw error;
    }
  }

  /**
   * Actualizar cantidad de un item.
   *
   * En la RPC (`pos_cocina_ajustar_linea_mesa`), para que el ajuste de cocina,
   * la línea y la cabecera de la cuenta cambien en la misma transacción. La
   * línea sigue la regla única y el descuento escala con la cantidad (antes
   * quedaba fijo). Si el plato ya se envió, la comanda original no cambia en
   * silencio: sale una de ajuste (+/−). Restar algo ya enviado exige motivo.
   */
  static async actualizarCantidadItem(
    saleItemId: string,
    nuevaCantidad: number,
    motivo?: string
  ): Promise<void> {
    try {
      await ajustarLineaMesa(saleItemId, nuevaCantidad, motivo ?? null);
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

      // Totales desde las líneas guardadas (la misma suma que la base en
      // fn_pos_recalcular_venta). Antes: precio × cantidad + impuesto −
      // descuento, que con el impuesto incluido contaba el IVA dos veces.
      const items = detalles.sale_items;
      const totales = totalesDeLineasGuardadas(items);

      return {
        items,
        subtotal: totales.subtotal,
        tax_total: totales.taxTotal,
        discount_total: totales.discountTotal,
        total: totales.total,
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
        // 4. Si es parcial, crear nuevo item y reducir original. La parte
        // trasladada lleva su parte del descuento y la tasa y el modo de
        // impuesto de la línea original (antes iba sin impuesto ni descuento).
        const cantidadOriginal = Number(originalItem.quantity) || 1;
        const descuentoOriginal = Number(originalItem.discount_amount) || 0;
        const descuentoQueQueda = Math.round(descuentoOriginal / cantidadOriginal * (cantidadOriginal - quantity) * 100) / 100;
        const descuentoTrasladado = Math.round((descuentoOriginal - descuentoQueQueda) * 100) / 100;
        const incluido: boolean | null = originalItem.tax_included ?? null;
        // Línea anterior al modo de impuesto guardado: impuesto por unidad, como
        // hace pos_cocina_ajustar_linea_mesa con esas líneas.
        const impuestoLegado = Math.round((Number(originalItem.tax_amount) || 0) / cantidadOriginal * quantity * 100) / 100;
        const linea = incluido === null
          ? {
              taxAmount: impuestoLegado,
              total: Number(originalItem.unit_price) * quantity - descuentoTrasladado + impuestoLegado,
            }
          : calcularLineaVenta({
              quantity,
              unit_price: Number(originalItem.unit_price),
              discount_amount: descuentoTrasladado,
              tax_rate: Number(originalItem.tax_rate) || 0,
              tax_included: incluido,
            });

        const { error: insertError } = await supabase.from('sale_items').insert({
          sale_id: toSession.sale_id,
          product_id: originalItem.product_id,
          quantity,
          unit_price: originalItem.unit_price,
          total: linea.total,
          tax_amount: linea.taxAmount,
          tax_rate: originalItem.tax_rate ?? 0,
          tax_included: incluido,
          discount_amount: descuentoTrasladado,
          notes: originalItem.notes,
        });
        if (insertError) throw insertError;

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
