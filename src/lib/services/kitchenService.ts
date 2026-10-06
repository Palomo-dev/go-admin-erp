import { supabase } from '@/lib/supabase/config';
import { mesaDelPedido, tipoEntregaEfectivo, type TipoEntregaWeb } from '@/lib/pos/pedidosWeb/tipoEntrega';

/** Pedido web del que nace una comanda (`source = 'web'`): origen visible en Comandas. */
export interface PedidoWebDeComanda {
  id: string;
  order_number: string;
  tipo: TipoEntregaWeb;
  mesa: string | null;
  customer_notes: string | null;
  /** Hora prometida (listo aprox), pago y cliente: línea de contexto de la tarjeta (extensión 2026-10-06). */
  estimated_ready_at?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  customer_name?: string | null;
}

export interface KitchenTicket {
  id: number;
  organization_id: number;
  branch_id: number;
  status: 'new' | 'preparing' | 'ready' | 'delivered';
  printed_at: string | null;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  priority: number;
  estimated_time: number | null;
  sale_id: string | null;
  table_session_id: string | null;
  server_name?: string | null;
  source?: string | null;
  /** order = comanda normal; adjustment = ajuste sobre platos ya enviados. */
  ticket_type?: 'order' | 'adjustment';
  adjusts_ticket_id?: number | null;
  cart_id?: string | null;
  has_allergy?: boolean;
  allergy_ack_at?: string | null;
  allergy_ack_by?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  /** Comandas v2 (migración 20261006190000): primera vez que una estación la empezó. */
  started_at?: string | null;
  /** Comandas v2: último «Avisar al mesero». */
  waiter_notified_at?: string | null;
  /** Pedido web de la comanda (columna de la migración E2; null en las del POS). */
  web_order_id?: string | null;
  /** Origen «Web W-xxxx · Recoger / Mesa N» y nota del cliente (solo comandas web). */
  pedido_web?: PedidoWebDeComanda | null;
  table_sessions?: {
    id: string;
    restaurant_table_id: string | null;
    server_id: string | null;
    /** Comensales de la mesa («4 comensales» en el tablero agrupado). */
    customers?: number | null;
    serverName?: string;
    restaurant_tables?: {
      name: string;
      zone: string | null;
    };
  };
  kitchen_ticket_items?: KitchenTicketItem[];
}

export interface KitchenTicketItem {
  id: number;
  organization_id: number;
  kitchen_ticket_id: number;
  sale_item_id: string | null;
  station: 'hot_kitchen' | 'cold_kitchen' | 'bar' | null;
  notes: string | null;
  status: 'pending' | 'in_progress' | 'ready' | 'delivered' | 'cancelled';
  created_at: string;
  updated_at: string;
  preparation_time: number | null;
  product_name?: string | null;
  quantity?: number | null;
  variant_data?: Record<string, string> | null;
  modifiers?: Array<{ name: string; extraPrice: number }> | null;
  cart_line_id?: string | null;
  is_allergy?: boolean;
  adjustment_kind?: 'increase' | 'decrease' | 'void' | 'note' | null;
  quantity_delta?: number | null;
  adjustment_reason?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  /** Comandas v2: tiempos por ítem (cada estación marca lo suyo). */
  started_at?: string | null;
  ready_at?: string | null;
  sale_items?: {
    quantity: number;
    product_id: number;
    /** jsonb de la línea (modificadores, comensal, pesaje) o texto de filas viejas. */
    notes: { modifiers?: Array<{ name: string; extraPrice: number }> | null; [clave: string]: unknown } | string | null;
    products?: {
      id: number;
      name: string;
      category_id: number | null;
      variant_data?: Record<string, string> | null;
      /** «Cómo se vende»: la comanda muestra «0,500 kg» en productos por peso. */
      sale_mode?: string | null;
      qty_decimals?: number | null;
      unit_code?: string | null;
      categories?: {
        name: string;
      };
    };
  };
}

export type ZoneFilter = 'all' | string; // Puede ser cualquier zona
export type StatusFilter = 'all' | 'new' | 'preparing' | 'ready' | 'delivered';
export type StationFilter = 'all' | 'hot_kitchen' | 'cold_kitchen' | 'bar';

/** Fila de `kitchen_tickets` tal como llega de la consulta, antes de tiparla como KitchenTicket. */
interface RegistroTicket {
  table_sessions?: { server_id?: string | null; restaurant_tables?: { zone?: string | null } | null; [clave: string]: unknown } | null;
  [clave: string]: unknown;
}

/** Columnas de la comanda con su mesa, mesero e ítems (tablero y monitor). */
const SELECT_COMANDA = `
          *,
          table_sessions (
            id,
            restaurant_table_id,
            server_id,
            customers,
            restaurant_tables (
              name,
              zone
            )
          ),
          kitchen_ticket_items (
            *,
            sale_items (
              quantity,
              product_id,
              notes,
              products (
                id,
                name,
                category_id,
                variant_data,
                sale_mode,
                qty_decimals,
                unit_code,
                categories (
                  name,
                  station,
                  requires_preparation
                )
              )
            )
          )
        `;

class KitchenService {
  /**
   * Obtener todos los tickets de cocina con filtros
   */
  async getKitchenTickets(filters?: {
    status?: StatusFilter;
    zone?: ZoneFilter;
    organizationId?: number;
    branchId?: number | null;
  }) {
    try {
      let query = supabase
        .from('kitchen_tickets')
        .select(SELECT_COMANDA)
        .order('created_at', { ascending: false });

      if (filters?.organizationId) {
        query = query.eq('organization_id', filters.organizationId);
      }

      if (filters?.branchId != null) {
        query = query.eq('branch_id', filters.branchId);
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filtrar por zona de mesa si se especifica
      let tickets = data || [];
      if (filters?.zone && filters.zone !== 'all') {
        tickets = tickets.filter((ticket: RegistroTicket) =>
          ticket.table_sessions?.restaurant_tables?.zone === filters.zone
        );
      }

      // Adjuntar nombre del mesero (no se puede embeber directamente: server_id
      // referencia auth.users, no profiles, así que se resuelve en una consulta aparte)
      const serverIds = Array.from(
        new Set(
          tickets
            .map((t: RegistroTicket) => t.table_sessions?.server_id)
            .filter(Boolean)
        )
      );

      if (serverIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', serverIds);

        const serverNames: Record<string, string> = {};
        profiles?.forEach((p) => {
          serverNames[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Mesero';
        });

        tickets = tickets.map((t: RegistroTicket) => {
          if (t.table_sessions?.server_id) {
            return {
              ...t,
              table_sessions: {
                ...t.table_sessions,
                serverName: serverNames[t.table_sessions.server_id],
              },
            };
          }
          return t;
        });
      }

      return (await this.adjuntarPedidosWeb(tickets as KitchenTicket[], filters?.organizationId)) as KitchenTicket[];
    } catch (error) {
      console.error('Error obteniendo tickets de cocina:', error);
      throw error;
    }
  }

  /**
   * Comandas v2 — tablero del TURNO ACTUAL (docs/design/POS-ESTACIONES-Y-COMANDAS.md §3.1):
   * las vivas (nuevas, en preparación, listas) creadas desde `desde` (inicio del
   * día de la organización), las entregadas de los últimos 30 min y el conteo
   * de las vivas de días anteriores (van a un aviso, no al tablero). Sin
   * paginación, con tope de 300 vivas.
   */
  async getTableroTurno(params: {
    organizationId: number;
    branchId?: number | null;
    desde: string;
    entregadasDesde: string;
  }): Promise<{ tickets: KitchenTicket[]; vivasAnteriores: number }> {
    const base = () => {
      let q = supabase.from('kitchen_tickets').select(SELECT_COMANDA).eq('organization_id', params.organizationId);
      if (params.branchId != null) q = q.eq('branch_id', params.branchId);
      return q;
    };
    let anteriores = supabase
      .from('kitchen_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', params.organizationId)
      .in('status', ['new', 'preparing', 'ready'])
      .lt('created_at', params.desde);
    if (params.branchId != null) anteriores = anteriores.eq('branch_id', params.branchId);

    const [vivas, entregadas, conteo] = await Promise.all([
      base().in('status', ['new', 'preparing', 'ready']).gte('created_at', params.desde).order('created_at', { ascending: true }).limit(300),
      base().eq('status', 'delivered').gte('updated_at', params.entregadasDesde).order('updated_at', { ascending: false }).limit(60),
      anteriores,
    ]);
    if (vivas.error) throw vivas.error;
    if (entregadas.error) throw entregadas.error;
    const filas = [...(vivas.data ?? []), ...(entregadas.data ?? [])] as RegistroTicket[];
    const conMesero = await this.adjuntarMeseros(filas);
    const tickets = await this.adjuntarPedidosWeb(conMesero as unknown as KitchenTicket[], params.organizationId);
    return { tickets, vivasAnteriores: conteo.error ? 0 : conteo.count ?? 0 };
  }

  /**
   * Historial de comandas (entregadas y canceladas), paginado: el enlace
   * «Ver historial de comandas» del tablero. Lectura con la RLS del usuario.
   */
  async getHistorial(params: {
    organizationId: number;
    branchId?: number | null;
    pagina: number;
    tamano: number;
  }): Promise<{ tickets: KitchenTicket[]; total: number }> {
    const desde = (params.pagina - 1) * params.tamano;
    let q = supabase
      .from('kitchen_tickets')
      .select(SELECT_COMANDA, { count: 'exact' })
      .eq('organization_id', params.organizationId)
      .in('status', ['delivered', 'cancelled'])
      .order('updated_at', { ascending: false })
      .range(desde, desde + params.tamano - 1);
    if (params.branchId != null) q = q.eq('branch_id', params.branchId);
    const { data, error, count } = await q;
    if (error) throw error;
    const conMesero = await this.adjuntarMeseros((data ?? []) as RegistroTicket[]);
    const tickets = await this.adjuntarPedidosWeb(conMesero as unknown as KitchenTicket[], params.organizationId);
    return { tickets, total: count ?? tickets.length };
  }

  /** Una comanda con su mesa, mesero e ítems (imprimir la comanda de un pedido web). */
  async getTicket(organizationId: number, ticketId: number): Promise<KitchenTicket | null> {
    const { data, error } = await supabase
      .from('kitchen_tickets')
      .select(SELECT_COMANDA)
      .eq('organization_id', organizationId)
      .eq('id', ticketId)
      .maybeSingle();
    if (error || !data) return null;
    const [conMesero] = await this.adjuntarMeseros([data as RegistroTicket]);
    const [conWeb] = await this.adjuntarPedidosWeb([conMesero as unknown as KitchenTicket], organizationId);
    return conWeb ?? null;
  }

  /** Nombre del mesero de la mesa (server_id → profiles), en una consulta. */
  private async adjuntarMeseros(tickets: RegistroTicket[]): Promise<RegistroTicket[]> {
    const ids = Array.from(new Set(tickets.map((t) => t.table_sessions?.server_id).filter((x): x is string => !!x)));
    if (ids.length === 0) return tickets;
    const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
    const nombres: Record<string, string> = {};
    profiles?.forEach((p) => {
      nombres[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim();
    });
    return tickets.map((t) =>
      t.table_sessions?.server_id && nombres[t.table_sessions.server_id]
        ? { ...t, table_sessions: { ...t.table_sessions, serverName: nombres[t.table_sessions.server_id] } }
        : t,
    );
  }

  /**
   * Cancelar sin la RPC de Comandas v2 (migración pendiente): mismo efecto que
   * `pos_cocina_cancelar` con las columnas que ya existen, bajo la RLS del
   * usuario. Lo usa el tablero solo si la ruta responde `rpc_no_disponible`.
   */
  async cancelTicketLegacy(ticketId: number, motivo: string) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('kitchen_tickets')
      .update({ status: 'cancelled', cancelled_at: now, cancellation_reason: motivo, updated_at: now })
      .eq('id', ticketId);
    if (error) throw error;
    await supabase
      .from('kitchen_ticket_items')
      .update({ status: 'cancelled', cancelled_at: now, cancel_reason: motivo, updated_at: now })
      .eq('kitchen_ticket_id', ticketId)
      .not('status', 'in', '(cancelled,delivered)');
  }

  /**
   * Adjunta a las comandas web su pedido (número, tipo de entrega, mesa y nota
   * del cliente). Una sola consulta por carga. Se busca por
   * `kitchen_tickets.web_order_id` (E2) y, para las comandas anteriores, por
   * `web_orders.sale_id`. Solo columnas que existen antes y después de E1/E2:
   * la mesa sale de la marca «[Comer aquí] Mesa: X» que el sitio deja en
   * internal_notes. Si la consulta falla, Comandas sigue igual (sin origen).
   */
  private async adjuntarPedidosWeb(tickets: KitchenTicket[], organizationId?: number): Promise<KitchenTicket[]> {
    const web = tickets.filter((t) => t.source === 'web');
    if (web.length === 0) return tickets;
    const ids = Array.from(new Set(web.map((t) => t.web_order_id).filter((x): x is string => !!x)));
    const ventas = Array.from(new Set(web.map((t) => t.sale_id).filter((x): x is string => !!x)));
    const filtros = [
      ...(ids.length ? [`id.in.(${ids.join(',')})`] : []),
      ...(ventas.length ? [`sale_id.in.(${ventas.join(',')})`] : []),
    ];
    if (filtros.length === 0) return tickets;
    try {
      let q = supabase
        .from('web_orders')
        .select('id, sale_id, order_number, delivery_type, customer_notes, internal_notes, estimated_ready_at, payment_status, payment_method, customer_name')
        .or(filtros.join(','));
      if (organizationId) q = q.eq('organization_id', organizationId);
      const { data, error } = await q;
      if (error) throw error;
      const filas = (data ?? []) as Array<{ id: string; sale_id: string | null; order_number: string; delivery_type: string | null; customer_notes: string | null; internal_notes: string | null; estimated_ready_at: string | null; payment_status: string | null; payment_method: string | null; customer_name: string | null }>;
      const porId = new Map(filas.map((f) => [f.id, f]));
      const porVenta = new Map(filas.filter((f) => f.sale_id).map((f) => [f.sale_id as string, f]));
      return tickets.map((t) => {
        if (t.source !== 'web') return t;
        const f = (t.web_order_id && porId.get(t.web_order_id)) || (t.sale_id && porVenta.get(t.sale_id)) || null;
        if (!f) return t;
        return {
          ...t,
          pedido_web: {
            id: f.id,
            order_number: f.order_number,
            tipo: tipoEntregaEfectivo(f),
            mesa: t.table_sessions?.restaurant_tables?.name ?? mesaDelPedido(f),
            customer_notes: f.customer_notes?.trim() || null,
            estimated_ready_at: f.estimated_ready_at,
            payment_status: f.payment_status,
            payment_method: f.payment_method,
            customer_name: f.customer_name,
          },
        };
      });
    } catch (err) {
      console.warn('No se pudo leer el pedido web de las comandas:', err);
      return tickets;
    }
  }

  /**
   * Avisa al cliente del pedido web de una comanda (correo de estado) cuando
   * la comanda pasa a «en preparación» o «lista». El pedido lo avanza el
   * trigger `trg_comanda_web_avanza_pedido` (E5); el aviso solo sale si el
   * pedido de verdad quedó en ese estado (sin E5, no se repite el anterior).
   */
  private async avisarPedidoWeb(ticket: { source?: string | null; sale_id?: string | null; web_order_id?: string | null; organization_id?: number }, status: KitchenTicket['status']) {
    if (ticket.source !== 'web' || (status !== 'preparing' && status !== 'ready')) return;
    try {
      let orderId = ticket.web_order_id ?? null;
      if (!orderId && ticket.sale_id) {
        const { data } = await supabase
          .from('web_orders')
          .select('id')
          .eq('sale_id', ticket.sale_id)
          .limit(1)
          .maybeSingle();
        orderId = data?.id ?? null;
      }
      if (!orderId) return;
      const { webOrdersService } = await import('./webOrdersService');
      await webOrdersService.avisarCambioEstado(orderId, status);
    } catch (err) {
      console.warn('No se pudo avisar al cliente del pedido web:', err);
    }
  }

  /**
   * Actualizar el estado de un ticket
   */
  async updateTicketStatus(ticketId: number, status: KitchenTicket['status']) {
    try {
      const now = new Date().toISOString();
      const updateData: Record<string, unknown> = {
        status,
        updated_at: now,
      };

      if (status === 'ready') {
        updateData.ready_at = now;
      } else if (status === 'new' || status === 'preparing') {
        updateData.ready_at = null;
      }

      const { data, error } = await supabase
        .from('kitchen_tickets')
        .update(updateData)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;

      // Sincronizar el estado de los items para que coincidan con el estado del
      // ticket (evita que un item quede "Preparando" cuando el ticket ya está Listo/Entregado)
      const itemStatusByTicketStatus: Record<KitchenTicket['status'], KitchenTicketItem['status']> = {
        new: 'pending',
        preparing: 'in_progress',
        ready: 'ready',
        delivered: 'delivered',
      };

      const { error: itemsError } = await supabase
        .from('kitchen_ticket_items')
        .update({
          status: itemStatusByTicketStatus[status],
          updated_at: new Date().toISOString(),
        })
        .eq('kitchen_ticket_id', ticketId)
        // Un ítem anulado (comanda de ajuste) sigue anulado aunque la comanda avance.
        .neq('status', 'cancelled');

      if (itemsError) throw itemsError;

      void this.avisarPedidoWeb(data as KitchenTicket, status);
      return data;
    } catch (error) {
      console.error('Error actualizando estado del ticket:', error);
      throw error;
    }
  }

  /**
   * Actualizar el estado de un item específico
   */
  async updateItemStatus(itemId: number, status: KitchenTicketItem['status']) {
    try {
      const { data, error } = await supabase
        .from('kitchen_ticket_items')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error actualizando estado del item:', error);
      throw error;
    }
  }

  /**
   * Marcar ticket como impreso
   */
  async markAsPrinted(ticketId: number) {
    try {
      const { data, error } = await supabase
        .from('kitchen_tickets')
        .update({ 
          printed_at: new Date().toISOString()
        })
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error marcando ticket como impreso:', error);
      throw error;
    }
  }

  /**
   * Suscribirse a cambios en tiempo real
   */
  subscribeToKitchenTickets(
    organizationId: number,
    onTicketsChange: (tickets: KitchenTicket[]) => void
  ) {
    const channel = supabase
      .channel('kitchen_tickets_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kitchen_tickets',
          filter: `organization_id=eq.${organizationId}`
        },
        () => {
          // Notificar al consumidor para que recargue con sus propios filtros
          onTicketsChange([]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kitchen_ticket_items',
          filter: `organization_id=eq.${organizationId}`
        },
        () => {
          // Notificar al consumidor para que recargue con sus propios filtros
          onTicketsChange([]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Crear un ticket de cocina desde el POS (sin mesa/session).
   * A diferencia de las mesas, aquí no hay sale_items previos, así que guardamos
   * product_name, quantity, variant_data y modifiers directamente en kitchen_ticket_items.
   */
  async createKitchenTicketFromPOS(params: {
    organizationId: number;
    branchId: number;
    serverName: string;
    items: Array<{
      productName: string;
      quantity: number;
      station: string | null;
      notes?: string | null;
      variantData?: Record<string, string> | null;
      modifiers?: Array<{ name: string; extraPrice: number }> | null;
    }>;
  }): Promise<{ ticketId: number; createdAt: string; items: Array<{ productName: string; quantity: number; notes: string | null; station: string | null; variantData: Record<string, string> | null; modifiers: Array<{ name: string; extraPrice: number }> | null }> }> {
    const { organizationId, branchId, serverName, items } = params;

    if (!items.length) {
      return { ticketId: 0, createdAt: new Date().toISOString(), items: [] };
    }

    // 1. Crear el ticket de cocina
    const { data: ticket, error: ticketError } = await supabase
      .from('kitchen_tickets')
      .insert({
        organization_id: organizationId,
        branch_id: branchId,
        status: 'new',
        priority: 0,
        source: 'pos',
        server_name: serverName,
      })
      .select()
      .single();

    if (ticketError) throw ticketError;

    // 2. Crear los items del ticket
    const ticketItems = items.map((item) => ({
      organization_id: organizationId,
      kitchen_ticket_id: ticket.id,
      sale_item_id: null,
      station: item.station || null,
      notes: item.notes || null,
      status: 'pending' as const,
      product_name: item.productName,
      quantity: item.quantity,
      variant_data: item.variantData || null,
      modifiers: item.modifiers || null,
    }));

    const { error: itemsError } = await supabase
      .from('kitchen_ticket_items')
      .insert(ticketItems);

    if (itemsError) throw itemsError;

    return {
      ticketId: ticket.id,
      createdAt: ticket.created_at,
      items: items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        notes: i.notes || null,
        station: i.station || null,
        variantData: i.variantData || null,
        modifiers: i.modifiers || null,
      })),
    };
  }

  /**
   * Marcar un ticket como entregado (cuando se completa checkout, se elimina carrito o se procesa deuda)
   */
  async markTicketAsDelivered(ticketId: number) {
    if (!ticketId) return;
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('kitchen_tickets')
        .update({ status: 'delivered', updated_at: now })
        .eq('id', ticketId);

      if (error) throw error;

      await supabase
        .from('kitchen_ticket_items')
        .update({ status: 'delivered', updated_at: now })
        .eq('kitchen_ticket_id', ticketId)
        .neq('status', 'cancelled');

      // Las demás comandas del mismo carrito (rondas y ajustes posteriores,
      // `pos_cocina_enviar_ronda`) se cierran igual. Lo anulado sigue anulado.
      const { data: ticket } = await supabase
        .from('kitchen_tickets')
        .select('cart_id')
        .eq('id', ticketId)
        .maybeSingle();
      if (ticket?.cart_id) {
        const { data: otras } = await supabase
          .from('kitchen_tickets')
          .update({ status: 'delivered', updated_at: now })
          .eq('cart_id', ticket.cart_id)
          .not('status', 'in', '(delivered,cancelled)')
          .select('id');
        const ids = (otras || []).map((t: { id: number }) => t.id);
        if (ids.length > 0) {
          await supabase
            .from('kitchen_ticket_items')
            .update({ status: 'delivered', updated_at: now })
            .in('kitchen_ticket_id', ids)
            .neq('status', 'cancelled');
        }
      }
    } catch (error) {
      console.error('Error marcando ticket como entregado:', error);
    }
  }

  /**
   * Agregar items a un ticket de cocina existente (para cuando se envían más productos al mismo ticket)
   */
  async addItemsToTicket(ticketId: number, organizationId: number, items: Array<{
    productName: string;
    quantity: number;
    station: string | null;
    notes?: string | null;
    variantData?: Record<string, string> | null;
    modifiers?: Array<{ name: string; extraPrice: number }> | null;
  }>) {
    if (!items.length) return;

    const ticketItems = items.map((item) => ({
      organization_id: organizationId,
      kitchen_ticket_id: ticketId,
      sale_item_id: null,
      station: item.station || null,
      notes: item.notes || null,
      status: 'pending' as const,
      product_name: item.productName,
      quantity: item.quantity,
      variant_data: item.variantData || null,
      modifiers: item.modifiers || null,
    }));

    const { error } = await supabase
      .from('kitchen_ticket_items')
      .insert(ticketItems);

    if (error) throw error;

    // Actualizar updated_at del ticket
    await supabase
      .from('kitchen_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId);
  }

  /**
   * Obtener los items de un ticket de cocina específico
   */
  async getTicketItems(ticketId: number): Promise<KitchenTicketItem[]> {
    try {
      const { data, error } = await supabase
        .from('kitchen_ticket_items')
        .select('*')
        .eq('kitchen_ticket_id', ticketId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo items del ticket:', error);
      return [];
    }
  }
}

export default new KitchenService();
