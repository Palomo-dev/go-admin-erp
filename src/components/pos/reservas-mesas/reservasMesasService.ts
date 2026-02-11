import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';

// ── Tipos ──────────────────────────────────────────────────────────────

export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
export type ReservationSource = 'admin' | 'website' | 'phone' | 'whatsapp';

export interface RestaurantReservation {
  id: string;
  organization_id: number;
  branch_id: number;
  restaurant_table_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_id: string | null;
  party_size: number;
  reservation_date: string; // 'YYYY-MM-DD'
  reservation_time: string; // 'HH:mm:ss'
  duration_minutes: number;
  status: ReservationStatus;
  notes: string | null;
  special_requests: string | null;
  source: ReservationSource;
  created_by: string | null;
  confirmed_at: string | null;
  seated_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones
  restaurant_table?: {
    id: string;
    name: string;
    zone: string | null;
    capacity: number;
    state: string;
  };
}

export interface CreateReservationInput {
  restaurant_table_id?: string | null;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_id?: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  duration_minutes?: number;
  notes?: string;
  special_requests?: string;
  source?: ReservationSource;
}

export interface UpdateReservationInput {
  restaurant_table_id?: string | null;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  party_size?: number;
  reservation_date?: string;
  reservation_time?: string;
  duration_minutes?: number;
  notes?: string;
  special_requests?: string;
}

export interface ReservationFilters {
  status?: ReservationStatus[];
  date_from?: string;
  date_to?: string;
  search?: string;
  source?: ReservationSource;
  restaurant_table_id?: string;
}

export interface ReservationStats {
  total: number;
  pending: number;
  confirmed: number;
  seated: number;
  completed: number;
  cancelled: number;
  no_show: number;
  avg_party_size: number;
}

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  seated: 'Sentada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No se presentó',
};

export const RESERVATION_SOURCE_LABELS: Record<ReservationSource, string> = {
  admin: 'Admin',
  website: 'Website',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
};

// ── Servicio ───────────────────────────────────────────────────────────

class ReservasMesasService {
  private get organizationId() {
    return getOrganizationId();
  }

  private get branchId() {
    return getCurrentBranchId();
  }

  /**
   * Obtener reservas con filtros
   */
  async getReservations(filters?: ReservationFilters): Promise<RestaurantReservation[]> {
    try {
      let query = supabase
        .from('restaurant_reservations')
        .select(`
          *,
          restaurant_table:restaurant_tables(id, name, zone, capacity, state)
        `)
        .eq('organization_id', this.organizationId)
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true });

      if (this.branchId) {
        query = query.eq('branch_id', this.branchId);
      }

      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      if (filters?.date_from) {
        query = query.gte('reservation_date', filters.date_from);
      }

      if (filters?.date_to) {
        query = query.lte('reservation_date', filters.date_to);
      }

      if (filters?.source) {
        query = query.eq('source', filters.source);
      }

      if (filters?.restaurant_table_id) {
        query = query.eq('restaurant_table_id', filters.restaurant_table_id);
      }

      if (filters?.search) {
        query = query.or(
          `customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%,customer_email.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo reservas:', error);
      throw error;
    }
  }

  /**
   * Obtener reservas del día
   */
  async getTodayReservations(): Promise<RestaurantReservation[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getReservations({ date_from: today, date_to: today });
  }

  /**
   * Obtener una reserva por ID
   */
  async getReservationById(id: string): Promise<RestaurantReservation | null> {
    try {
      const { data, error } = await supabase
        .from('restaurant_reservations')
        .select(`
          *,
          restaurant_table:restaurant_tables(id, name, zone, capacity, state)
        `)
        .eq('id', id)
        .eq('organization_id', this.organizationId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo reserva:', error);
      throw error;
    }
  }

  /**
   * Crear nueva reserva
   */
  async createReservation(input: CreateReservationInput): Promise<RestaurantReservation> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('restaurant_reservations')
        .insert({
          organization_id: this.organizationId,
          branch_id: this.branchId,
          restaurant_table_id: input.restaurant_table_id || null,
          customer_name: input.customer_name,
          customer_phone: input.customer_phone || null,
          customer_email: input.customer_email || null,
          customer_id: input.customer_id || null,
          party_size: input.party_size,
          reservation_date: input.reservation_date,
          reservation_time: input.reservation_time,
          duration_minutes: input.duration_minutes || 90,
          status: 'confirmed',
          notes: input.notes || null,
          special_requests: input.special_requests || null,
          source: input.source || 'admin',
          created_by: user?.id || null,
          confirmed_at: new Date().toISOString(),
        })
        .select(`
          *,
          restaurant_table:restaurant_tables(id, name, zone, capacity, state)
        `)
        .single();

      if (error) throw error;

      // Si se asignó mesa, marcarla como reservada
      if (input.restaurant_table_id) {
        await supabase
          .from('restaurant_tables')
          .update({ state: 'reserved', updated_at: new Date().toISOString() })
          .eq('id', input.restaurant_table_id);
      }

      return data;
    } catch (error) {
      console.error('Error creando reserva:', error);
      throw error;
    }
  }

  /**
   * Actualizar reserva
   */
  async updateReservation(id: string, input: UpdateReservationInput): Promise<RestaurantReservation> {
    try {
      const { data, error } = await supabase
        .from('restaurant_reservations')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', this.organizationId)
        .select(`
          *,
          restaurant_table:restaurant_tables(id, name, zone, capacity, state)
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error actualizando reserva:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado de reserva
   */
  async changeStatus(id: string, status: ReservationStatus, reason?: string): Promise<RestaurantReservation> {
    try {
      const updateData: Record<string, any> = {
        status,
        updated_at: new Date().toISOString(),
      };

      const now = new Date().toISOString();

      switch (status) {
        case 'confirmed':
          updateData.confirmed_at = now;
          break;
        case 'seated':
          updateData.seated_at = now;
          break;
        case 'completed':
          updateData.completed_at = now;
          break;
        case 'cancelled':
          updateData.cancelled_at = now;
          updateData.cancellation_reason = reason || null;
          break;
        case 'no_show':
          updateData.cancelled_at = now;
          break;
      }

      const { data, error } = await supabase
        .from('restaurant_reservations')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', this.organizationId)
        .select(`
          *,
          restaurant_table:restaurant_tables(id, name, zone, capacity, state)
        `)
        .single();

      if (error) throw error;

      // Si se sentó, marcar mesa como ocupada; si se completó/canceló/no_show, liberar mesa
      if (data.restaurant_table_id) {
        if (status === 'seated') {
          await supabase
            .from('restaurant_tables')
            .update({ state: 'occupied', updated_at: now })
            .eq('id', data.restaurant_table_id);
        } else if (['completed', 'cancelled', 'no_show'].includes(status)) {
          await supabase
            .from('restaurant_tables')
            .update({ state: 'free', updated_at: now })
            .eq('id', data.restaurant_table_id);
        }
      }

      return data;
    } catch (error) {
      console.error('Error cambiando estado de reserva:', error);
      throw error;
    }
  }

  /**
   * Eliminar reserva
   */
  async deleteReservation(id: string): Promise<void> {
    try {
      // Obtener reserva para liberar mesa si es necesario
      const reservation = await this.getReservationById(id);

      const { error } = await supabase
        .from('restaurant_reservations')
        .delete()
        .eq('id', id)
        .eq('organization_id', this.organizationId);

      if (error) throw error;

      // Liberar mesa si estaba reservada
      if (reservation?.restaurant_table_id && ['pending', 'confirmed'].includes(reservation.status)) {
        await supabase
          .from('restaurant_tables')
          .update({ state: 'free', updated_at: new Date().toISOString() })
          .eq('id', reservation.restaurant_table_id);
      }
    } catch (error) {
      console.error('Error eliminando reserva:', error);
      throw error;
    }
  }

  /**
   * Obtener mesas disponibles para una fecha/hora específica
   */
  async getAvailableTables(
    date: string,
    time: string,
    partySize: number,
    excludeReservationId?: string
  ): Promise<Array<{ id: string; name: string; zone: string | null; capacity: number; state: string }>> {
    try {
      // Obtener todas las mesas del branch
      const { data: tables, error: tablesError } = await supabase
        .from('restaurant_tables')
        .select('id, name, zone, capacity, state')
        .eq('organization_id', this.organizationId)
        .eq('branch_id', this.branchId!)
        .gte('capacity', partySize)
        .order('name');

      if (tablesError) throw tablesError;
      if (!tables) return [];

      // Obtener reservas activas para esa fecha que podrían colisionar
      let reservationsQuery = supabase
        .from('restaurant_reservations')
        .select('restaurant_table_id, reservation_time, duration_minutes')
        .eq('organization_id', this.organizationId)
        .eq('reservation_date', date)
        .in('status', ['pending', 'confirmed', 'seated'])
        .not('restaurant_table_id', 'is', null);

      if (excludeReservationId) {
        reservationsQuery = reservationsQuery.neq('id', excludeReservationId);
      }

      const { data: reservations } = await reservationsQuery;

      // Filtrar mesas que tienen conflicto de horario
      const busyTableIds = new Set<string>();
      const requestedMinutes = this.timeToMinutes(time);

      reservations?.forEach((r) => {
        const resMinutes = this.timeToMinutes(r.reservation_time);
        const resEnd = resMinutes + (r.duration_minutes || 90);
        const requestedEnd = requestedMinutes + 90;

        // Hay overlap si el inicio solicitado está antes del fin de la reserva
        // y el fin solicitado está después del inicio de la reserva
        if (requestedMinutes < resEnd && requestedEnd > resMinutes) {
          busyTableIds.add(r.restaurant_table_id);
        }
      });

      return tables.filter((t) => !busyTableIds.has(t.id));
    } catch (error) {
      console.error('Error obteniendo mesas disponibles:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de reservas para un rango de fechas
   */
  async getStats(dateFrom?: string, dateTo?: string): Promise<ReservationStats> {
    try {
      let query = supabase
        .from('restaurant_reservations')
        .select('id, status, party_size')
        .eq('organization_id', this.organizationId);

      if (this.branchId) {
        query = query.eq('branch_id', this.branchId);
      }

      if (dateFrom) query = query.gte('reservation_date', dateFrom);
      if (dateTo) query = query.lte('reservation_date', dateTo);

      const { data, error } = await query;
      if (error) throw error;

      const reservations = data || [];
      const total = reservations.length;

      const stats: ReservationStats = {
        total,
        pending: 0,
        confirmed: 0,
        seated: 0,
        completed: 0,
        cancelled: 0,
        no_show: 0,
        avg_party_size: 0,
      };

      let totalPartySize = 0;

      reservations.forEach((r) => {
        const s = r.status as ReservationStatus;
        if (s in stats) {
          (stats as any)[s]++;
        }
        totalPartySize += r.party_size || 0;
      });

      stats.avg_party_size = total > 0 ? Math.round((totalPartySize / total) * 10) / 10 : 0;

      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
  }
}

export const reservasMesasService = new ReservasMesasService();
