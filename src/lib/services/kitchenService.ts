import { supabase } from '@/lib/supabase/config';

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
  table_sessions?: {
    id: string;
    restaurant_table_id: string | null;
    server_id: string | null;
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
  status: 'pending' | 'in_progress' | 'ready' | 'delivered';
  created_at: string;
  updated_at: string;
  preparation_time: number | null;
  product_name?: string | null;
  quantity?: number | null;
  variant_data?: Record<string, string> | null;
  modifiers?: Array<{ name: string; extraPrice: number }> | null;
  sale_items?: {
    quantity: number;
    product_id: number;
    notes: any;
    products?: {
      id: number;
      name: string;
      category_id: number | null;
      variant_data?: Record<string, string> | null;
      categories?: {
        name: string;
      };
    };
  };
}

export type ZoneFilter = 'all' | string; // Puede ser cualquier zona
export type StatusFilter = 'all' | 'new' | 'preparing' | 'ready' | 'delivered';
export type StationFilter = 'all' | 'hot_kitchen' | 'cold_kitchen' | 'bar';

class KitchenService {
  /**
   * Obtener todos los tickets de cocina con filtros
   */
  async getKitchenTickets(filters?: {
    status?: StatusFilter;
    zone?: ZoneFilter;
    organizationId?: number;
  }) {
    try {
      let query = supabase
        .from('kitchen_tickets')
        .select(`
          *,
          table_sessions (
            id,
            restaurant_table_id,
            server_id,
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
                categories (
                  name,
                  station,
                  requires_preparation
                )
              )
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (filters?.organizationId) {
        query = query.eq('organization_id', filters.organizationId);
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filtrar por zona de mesa si se especifica
      let tickets = data || [];
      if (filters?.zone && filters.zone !== 'all') {
        tickets = tickets.filter((ticket: any) => 
          ticket.table_sessions?.restaurant_tables?.zone === filters.zone
        );
      }

      // Adjuntar nombre del mesero (no se puede embeber directamente: server_id
      // referencia auth.users, no profiles, así que se resuelve en una consulta aparte)
      const serverIds = Array.from(
        new Set(
          tickets
            .map((t: any) => t.table_sessions?.server_id)
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

        tickets = tickets.map((t: any) => {
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

      return tickets as KitchenTicket[];
    } catch (error) {
      console.error('Error obteniendo tickets de cocina:', error);
      throw error;
    }
  }

  /**
   * Actualizar el estado de un ticket
   */
  async updateTicketStatus(ticketId: number, status: KitchenTicket['status']) {
    try {
      const now = new Date().toISOString();
      const updateData: Record<string, any> = {
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
        .eq('kitchen_ticket_id', ticketId);

      if (itemsError) throw itemsError;

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
        .eq('kitchen_ticket_id', ticketId);
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
