import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { POSService } from '@/lib/services/posService';
import { promotionEngine } from '@/lib/services/promotionEngine';
import { cambiosDescuentoMesa, type LineaCuentaMesa } from '@/lib/promotions/motorPromociones';
import { calcularLineaVenta, totalesDeLineasGuardadas } from '@/lib/pos/lineaVenta';
import { redondearCantidadProducto } from '@/lib/pos/peso/modoVenta';
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
  ProductImage,
  SaleItem,
} from './types';

/** Mensaje y traza de un error cualquiera, para el log. */
function detalleError(error: unknown): { error: unknown; stack?: string } {
  return error instanceof Error ? { error: error.message || error, stack: error.stack } : { error };
}

/** Impuesto de la organización como lo devuelve `POSService.getOrganizationTaxes`. */
interface ImpuestoOrganizacion {
  id: number | string;
  name: string;
  rate?: number | string | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
  tax_included?: boolean | null;
}

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

      let allItems: SaleItem[] = [];
      
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
              sale_mode,
              qty_decimals,
              unit_code,
              product_images(
                id,
                storage_path,
                is_primary,
                display_order
              )
            ),
            kitchen_ticket_items(id, status, cancelled_at, adjustment_kind, kitchen_ticket_id)
          `)
          .in('sale_id', saleIds)
          .order('created_at', { ascending: true });

        if (itemsError) {
          console.error('Error consultando items:', itemsError);
          throw new Error(`Error en consulta de items: ${itemsError.message || JSON.stringify(itemsError)}`);
        }
        
        allItems = (items || []) as unknown as SaleItem[];

        // Fallback de imagen: para items cuyo producto (variante) no tiene
        // imagen propia, resolver las imágenes del producto padre en una
        // consulta aparte (un embed auto-referenciado anidado no es soportado por PostgREST).
        const parentIdsSinImagen = Array.from(new Set(
          allItems
            .filter((item) => item.product?.parent_product_id && !item.product?.product_images?.length)
            .map((item) => item.product?.parent_product_id as number)
        ));

        if (parentIdsSinImagen.length > 0) {
          const { data: parentImages } = await supabase
            .from('product_images')
            .select('id, product_id, storage_path, is_primary, display_order')
            .in('product_id', parentIdsSinImagen);

          const parentImagesByProductId = new Map<number, ProductImage[]>();
          ((parentImages || []) as Array<ProductImage & { product_id: number }>).forEach((img) => {
            const list = parentImagesByProductId.get(img.product_id) || [];
            list.push(img);
            parentImagesByProductId.set(img.product_id, list);
          });

          allItems = allItems.map((item) => {
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
    } catch (error) {
      console.error('Error obteniendo detalle de mesa:', {
        tableId,
        organizationId,
        ...detalleError(error),
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
      const { error: sessionError } = await supabase
        .from('table_sessions')
        .insert({
          organization_id: organizationId,
          restaurant_table_id: tableId,
          server_id: serverId,
          customers,
          status: 'active',
          // opened_at: default now() de la base (hora oficial del servidor).
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
    } catch (error) {
      console.error('Error iniciando sesión:', {
        tableId,
        serverId,
        ...detalleError(error),
      });
      throw error;
    }
  }

  /**
   * Añadir productos a la orden
   */
  static async agregarProductos(
    sessionId: string,
    productos: ProductToAdd[],
    opciones: { porEnviar?: boolean } = {}
  ): Promise<string[]> {
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
            // sale_date: default now() de la base (hora oficial del servidor).
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
      const formattedOrgTaxes: TaxUtilOrganizationTax[] = ((orgTaxes || []) as ImpuestoOrganizacion[]).map((t) => ({
        id: String(t.id),
        name: t.name,
        rate: parseFloat(t.rate?.toString() || '0'),
        is_default: t.is_default ?? false,
        is_active: t.is_active ?? true,
      }));
      const defaultApplied: { [key: string]: boolean } = {};
      formattedOrgTaxes.forEach((t) => { defaultApplied[t.id] = t.is_default; });

      const saleItems = [];

      // Promociones: la línea nace sin descuento y, ya insertada, se evalúa
      // la cuenta COMPLETA (recalcularPromocionesMesa). Antes se evaluaba solo
      // el plato que llegaba: la compra mínima se comparaba con un plato, el
      // monto fijo se descontaba en cada uno y el 2x1 casi nunca aplicaba.
      for (let idx = 0; idx < productos.length; idx += 1) {
        const p = productos[idx];
        const itemDiscount = 0;
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
            (productTaxes as Array<{ organization_taxes?: ImpuestoOrganizacion | null }>).forEach((relation) => {
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
            // Origen del peso (manual en fase 2): el cobro lo valida y lo audita «Pesos manuales».
            ...(p.pesaje ? { pesaje: p.pesaje } : {}),
            // Flujo de rondas (Figma D3/D5): la línea nace «por enviar» y la comanda
            // la crea `pos_mesa_enviar_ronda` al pulsar «Enviar a cocina».
            ...(opciones.porEnviar ? { por_enviar: true } : {}),
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

      // Rondas: sin comanda todavía; la ronda la envía la persona (D5).
      if (opciones.porEnviar) {
        await this.recalcularPromocionesMesa(saleId!);
        return (insertedItems || []).map((item: { id: string }) => item.id);
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

      // 5. Promociones de la cuenta completa y total de la venta
      await this.recalcularPromocionesMesa(saleId!);
      return (insertedItems || []).map((item: { id: string }) => item.id);
    } catch (error) {
      console.error('Error agregando productos:', {
        sessionId,
        productCount: productos.length,
        ...detalleError(error),
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
   * Promociones de la cuenta de una mesa, evaluada COMPLETA: todas las líneas
   * sin pagar de la venta, a la vez. Se llama en cada cambio de la cuenta
   * (agregar, cambiar cantidad, anular, transferir, mover). La compra mínima
   * se compara con la cuenta, el monto fijo y el tope son de la cuenta y el
   * 2x1 junta los platos del mismo producto aunque se pidieran de uno en uno.
   *
   * El cálculo es el del motor único (`motorPromociones`); la escritura va en
   * una transacción por `pos_mesa_aplicar_promociones`, que solo toca líneas
   * sin pagar y sin descuento ajeno (un pedido web conserva el suyo) y
   * recalcula la cabecera. Si la evaluación falla, la cuenta se recalcula sin
   * tocar descuentos: agregar un plato no se bloquea por una promoción.
   */
  static async recalcularPromocionesMesa(saleId: string): Promise<void> {
    const organizationId = getOrganizationId();
    try {
      const { data: venta, error: eVenta } = await supabase
        .from('sales')
        .select('id, organization_id, branch_id, status')
        .eq('id', saleId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (eVenta) throw eVenta;
      // Venta cerrada, anulada o de otra organización: no hay cuenta que recalcular.
      if (!venta || !['pending', 'draft', 'partial'].includes(String(venta.status))) return;
      const { data: filas, error: eLineas } = await supabase
        .from('sale_items')
        .select('id, product_id, quantity, unit_price, discount_amount, paid_amount, paid_at, notes, created_at, product:products!sale_items_product_id_fkey(category_id, parent_product_id, sale_mode)')
        .eq('sale_id', saleId)
        .is('paid_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (eLineas) throw eLineas;
      type FilaCuenta = LineaCuentaMesa & {
        product_id: number | null;
        product: { category_id: number | null; parent_product_id: number | null; sale_mode: string | null } | null;
      };
      const lineas = ((filas ?? []) as unknown as FilaCuenta[]).filter(
        (l) => l.product_id != null && Number(l.quantity) > 0,
      );
      const resultado = await promotionEngine.evaluate({
        channel: 'pos',
        organization_id: organizationId,
        branch_id: venta.branch_id ?? undefined,
        items: lineas.map((l) => ({
          product_id: Number(l.product_id),
          parent_product_id: l.product?.parent_product_id ?? null,
          category_id: l.product?.category_id ?? null,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          sale_mode: l.product?.sale_mode ?? null,
        })),
      });
      const cambios = cambiosDescuentoMesa(
        lineas.map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
        resultado,
      );
      if (cambios.length === 0) {
        await this.recalcularTotalVenta(saleId);
        return;
      }
      const { error } = await supabase.rpc('pos_mesa_aplicar_promociones', { p_sale_id: saleId, p_lineas: cambios });
      if (error) throw error;
    } catch (error) {
      console.warn('[pedidosService] No se pudieron recalcular las promociones de la mesa:', detalleError(error));
      await this.recalcularTotalVenta(saleId);
    }
  }

  /**
   * Promociones que quedaron en las líneas de la cuenta (`notes.promociones`),
   * para enviarlas al cobro: `pos_checkout_v1` suma su uso una sola vez, en el
   * cobro que salda la cuenta.
   */
  static async promocionesDeLaCuenta(saleId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('sale_items')
      .select('quantity, notes')
      .eq('sale_id', saleId);
    if (error) throw error;
    const ids = new Set<string>();
    for (const fila of (data ?? []) as Array<{ quantity: number | string; notes: Record<string, unknown> | null }>) {
      if (!(Number(fila.quantity) > 0)) continue;
      const lista = fila.notes?.promociones;
      if (Array.isArray(lista)) lista.forEach((id) => typeof id === 'string' && ids.add(id));
    }
    return Array.from(ids);
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
      // La RPC recalcula la cabecera de la cuenta en la misma transacción;
      // después, las promociones de la cuenta que queda.
      const r = await ajustarLineaMesa(saleItemId, 0, motivo ?? null);
      if (r?.sale_id) await this.recalcularPromocionesMesa(r.sale_id);
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
      const r = await ajustarLineaMesa(saleItemId, nuevaCantidad, motivo ?? null);
      // La RPC escala el descuento con la cantidad; la promoción se recalcula
      // sobre la cuenta completa (la compra mínima puede dejar de cumplirse).
      if (r?.sale_id) await this.recalcularPromocionesMesa(r.sale_id);
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
    items: Array<{ productName: string; quantity: number; unit?: string; qtyDecimals?: number; notes: string | null; station: string | null; variantData?: Record<string, string> | null; modifiers?: Array<{ name: string; extraPrice: number }> | null }>;
  }>> {
    try {
      const { data: pendientes, error: fetchError } = await supabase
        .from('kitchen_tickets')
        .select(`
          id, created_at, ticket_type, adjusts_ticket_id, has_allergy,
          kitchen_ticket_items(
            id, station, notes, status, product_name, quantity, quantity_delta, adjustment_kind,
            adjustment_reason, is_allergy, variant_data, modifiers,
            sale_items(quantity, notes, products(name, variant_data, sale_mode, qty_decimals, unit_code))
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
              ...(it.unit ? { unit: it.unit, qtyDecimals: it.qtyDecimals ?? undefined } : {}),
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

        // Con 3 decimales (numeric(12,3)): 0,735 − 0,5 es 0,235, no 0,23499….
        await this.actualizarCantidadItem(
          saleItemId,
          redondearCantidadProducto(Number(originalItem.quantity) - quantity, 3)
        );
      }

      // 5. Promociones y totales de las dos cuentas
      await this.recalcularPromocionesMesa(originalItem.sale_id);
      if (toSession.sale_id) {
        await this.recalcularPromocionesMesa(toSession.sale_id);
      }
    } catch (error) {
      console.error('Error transfiriendo item:', error);
      throw error;
    }
  }
}
