import { supabase } from '@/lib/supabase/config';

export interface ReservationListItem {
  id: string;
  code: string;
  customer_name: string;
  customer_email: string;
  checkin: string;
  checkout: string;
  nights: number;
  status: string;
  channel: string;
  total_estimated: number;
  balance: number;
  spaces: string[];
  space_types: string[];
  occupant_count: number;
  created_at: string;
}

export interface ReservationFilters {
  status?: string;
  channel?: string;
  startDate?: string;
  endDate?: string;
  searchTerm?: string;
}

class ReservationListService {
  /**
   * Obtener lista de reservas con filtros
   */
  async getReservations(
    organizationId: number,
    filters?: ReservationFilters
  ): Promise<ReservationListItem[]> {
    let query = supabase
      .from('reservations')
      .select(`
        id,
        checkin,
        checkout,
        status,
        channel,
        total_estimated,
        occupant_count,
        created_at,
        notes,
        customers (
          id,
          first_name,
          last_name,
          email
        ),
        reservation_spaces (
          space_id,
          spaces (
            label,
            space_types (
              name
            )
          )
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    // Aplicar filtros
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters?.channel) {
      query = query.eq('channel', filters.channel);
    }
    
    if (filters?.startDate) {
      query = query.gte('checkin', filters.startDate);
    }
    
    if (filters?.endDate) {
      query = query.lte('checkout', filters.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Obtener IDs de reservas para consultar pagos
    const reservationIds = (data || []).map((r: any) => r.id);
    
    // Consultar pagos de todas las reservas de una vez
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('source_id, amount, status')
      .eq('source', 'pms')
      .in('source_id', reservationIds);

    // Crear mapa de pagos por reserva
    const paymentsByReservation = (paymentsData || []).reduce((acc: any, payment: any) => {
      if (!acc[payment.source_id]) {
        acc[payment.source_id] = [];
      }
      acc[payment.source_id].push(payment);
      return acc;
    }, {});

    // Transformar datos
    return (data || []).map((reservation: any) => {
      const customer = reservation.customers;
      const spaces = reservation.reservation_spaces || [];
      
      // Calcular noches
      const checkinDate = new Date(reservation.checkin);
      const checkoutDate = new Date(reservation.checkout);
      const nights = Math.ceil((checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24));

      // Obtener nombres de espacios y tipos
      const spaceLabels = spaces.map((rs: any) => rs.spaces?.label).filter(Boolean) as string[];
      const spaceTypesList = spaces.map((rs: any) => rs.spaces?.space_types?.name).filter(Boolean) as string[];
      const spaceTypes = Array.from(new Set(spaceTypesList)) as string[];

      // Calcular total pagado
      const payments = paymentsByReservation[reservation.id] || [];
      const totalPaid = payments
        .filter((p: any) => p.status === 'completed')
        .reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);

      const total = parseFloat(reservation.total_estimated) || 0;
      const balance = total - totalPaid;

      return {
        id: reservation.id,
        code: reservation.id.substring(0, 8).toUpperCase(),
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : 'N/A',
        customer_email: customer?.email || '',
        checkin: reservation.checkin,
        checkout: reservation.checkout,
        nights,
        status: reservation.status,
        channel: reservation.channel,
        total_estimated: total,
        balance: balance,
        spaces: spaceLabels,
        space_types: spaceTypes,
        occupant_count: reservation.occupant_count,
        created_at: reservation.created_at,
      };
    });
  }

  /**
   * Actualizar estado de reserva
   */
  async updateReservationStatus(reservationId: string, status: string): Promise<void> {
    const { error } = await supabase
      .from('reservations')
      .update({ status })
      .eq('id', reservationId);

    if (error) throw error;
  }

  /**
   * Realizar check-in
   */
  async checkIn(reservationId: string): Promise<void> {
    await this.updateReservationStatus(reservationId, 'checked_in');
  }

  /**
   * Realizar check-out
   */
  async checkOut(reservationId: string): Promise<void> {
    await this.updateReservationStatus(reservationId, 'checked_out');
  }

  /**
   * Cancelar reserva
   */
  async cancelReservation(reservationId: string): Promise<void> {
    await this.updateReservationStatus(reservationId, 'cancelled');
  }

  /**
   * Obtener estadísticas de reservas
   */
  async getReservationStats(organizationId: number): Promise<{
    total: number;
    confirmed: number;
    checkedIn: number;
    checkedOut: number;
    cancelled: number;
  }> {
    const { data, error } = await supabase
      .from('reservations')
      .select('status')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      confirmed: 0,
      checkedIn: 0,
      checkedOut: 0,
      cancelled: 0,
    };

    data?.forEach((r: any) => {
      if (r.status === 'confirmed') stats.confirmed++;
      if (r.status === 'checked_in') stats.checkedIn++;
      if (r.status === 'checked_out') stats.checkedOut++;
      if (r.status === 'cancelled') stats.cancelled++;
    });

    return stats;
  }
}

export default new ReservationListService();
