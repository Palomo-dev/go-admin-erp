import { supabase } from '@/lib/supabase/config';

export interface KitchenTicket {
  id: number;
  organization_id: number;
  branch_id: number;
  status: 'new' | 'preparing' | 'ready' | 'delivered';
  printed_at: string | null;
  created_at: string;
  updated_at: string;
  priority: number;
  estimated_time: number | null;
  sale_id: string | null;
  table_session_id: string | null;
  table_sessions?: {
    id: string;
    restaurant_table_id: string | null;
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
  sale_item_id: string;
  station: 'hot_kitchen' | 'cold_kitchen' | 'bar' | null;
  notes: string | null;
  status: 'pending' | 'in_progress' | 'ready' | 'delivered';
  created_at: string;
  updated_at: string;
  preparation_time: number | null;
  sale_items?: {
    quantity: number;
    product_id: number;
    notes: any;
    products?: {
      id: number;
      name: string;
      category_id: number | null;
      categories?: {
        name: string;
      };
    };
  };
}

export type ZoneFilter = 'all' | string; // Puede ser cualquier zona
export type StatusFilter = 'all' | 'new' | 'preparing' | 'ready' | 'delivered';

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
                categories (
                  name
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
      const { data, error } = await supabase
        .from('kitchen_tickets')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;
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
}

export default new KitchenService();
