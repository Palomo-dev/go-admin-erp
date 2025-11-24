import { supabase } from '@/lib/supabase/config';

export interface ReservationDetail {
  id: string;
  organization_id: number;
  branch_id: number | null;
  customer_id: string;
  status: string;
  channel: string;
  checkin: string;
  checkout: string;
  start_date: string;
  end_date: string;
  occupant_count: number;
  total_estimated: number;
  notes: string;
  metadata: any;
  created_at: string;
  updated_at: string;
  // Relaciones
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  spaces: Array<{
    id: string;
    label: string;
    space_type: {
      name: string;
      base_rate: number;
    };
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    status: string;
    reference: string;
    created_at: string;
  }>;
}

class ReservationDetailService {
  /**
   * Obtener detalle completo de una reserva
   */
  async getReservationDetail(reservationId: string): Promise<ReservationDetail> {
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        *,
        customers (
          id,
          first_name,
          last_name,
          email,
          phone
        ),
        reservation_spaces (
          spaces (
            id,
            label,
            space_types (
              name,
              base_rate
            )
          )
        )
      `)
      .eq('id', reservationId)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Reserva no encontrada');

    // Obtener pagos relacionados
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .eq('source', 'pms')
      .eq('source_id', reservationId)
      .order('created_at', { ascending: false });

    return {
      id: data.id,
      organization_id: data.organization_id,
      branch_id: data.branch_id,
      customer_id: data.customer_id,
      status: data.status,
      channel: data.channel,
      checkin: data.checkin,
      checkout: data.checkout,
      start_date: data.start_date,
      end_date: data.end_date,
      occupant_count: data.occupant_count,
      total_estimated: parseFloat(data.total_estimated) || 0,
      notes: data.notes || '',
      metadata: data.metadata || {},
      created_at: data.created_at,
      updated_at: data.updated_at,
      customer: data.customers || {},
      spaces: (data.reservation_spaces || []).map((rs: any) => ({
        id: rs.spaces?.id || '',
        label: rs.spaces?.label || '',
        space_type: {
          name: rs.spaces?.space_types?.name || '',
          base_rate: rs.spaces?.space_types?.base_rate || 0,
        },
      })),
      payments: paymentsData || [],
    };
  }

  /**
   * Calcular resumen financiero de la reserva
   */
  calculateFinancials(reservation: ReservationDetail) {
    const totalPaid = reservation.payments
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

    const balance = reservation.total_estimated - totalPaid;

    return {
      total: reservation.total_estimated,
      paid: totalPaid,
      balance,
      isPaidInFull: balance <= 0,
    };
  }

  /**
   * Calcular noches
   */
  calculateNights(checkin: string, checkout: string): number {
    const checkinDate = new Date(checkin);
    const checkoutDate = new Date(checkout);
    const diffTime = Math.abs(checkoutDate.getTime() - checkinDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Actualizar notas de la reserva
   */
  async updateNotes(reservationId: string, notes: string): Promise<void> {
    const { error } = await supabase
      .from('reservations')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', reservationId);

    if (error) throw error;
  }

  /**
   * Registrar un nuevo pago
   */
  async createPayment(data: {
    organizationId: number;
    branchId: number | null;
    reservationId: string;
    amount: number;
    method: string;
    reference?: string;
    currency: string;
  }): Promise<void> {
    const { error } = await supabase
      .from('payments')
      .insert([{
        organization_id: data.organizationId,
        branch_id: data.branchId,
        source: 'pms',
        source_id: data.reservationId,
        amount: data.amount,
        method: data.method,
        currency: data.currency,
        reference: data.reference || `PAGO-${Date.now()}`,
        status: 'completed',
      }]);

    if (error) throw error;
  }

  /**
   * Obtener la moneda base de la organización
   */
  async getBaseCurrency(organizationId: number): Promise<string> {
    const { data, error } = await supabase
      .from('organization_currencies')
      .select('currency_code')
      .eq('organization_id', organizationId)
      .eq('is_base', true)
      .single();

    if (error || !data) {
      console.warn('No base currency found, defaulting to COP');
      return 'COP';
    }
    
    return data.currency_code;
  }
}

export default new ReservationDetailService();
