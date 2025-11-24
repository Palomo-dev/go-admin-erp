import { supabase } from '@/lib/supabase/config';
import { type Customer } from './reservationsService';

export interface ReservationEditData {
  id: string;
  organization_id: number;
  branch_id: number | null;
  customer_id: string;
  checkin: string;
  checkout: string;
  occupant_count: number;
  status: string;
  channel: string;
  total_estimated: number;
  notes: string;
  metadata: {
    extras?: any[];
    category?: string;
  };
  customer: Customer;
  spaces: Array<{
    id: string;
    space_id: string;
    label: string;
    space_type_id: string;
    space_type_name: string;
    category_id: string;
    base_rate: number;
    floor_zone: string;
    capacity: number;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    created_at: string;
  }>;
}

class ReservationEditService {
  /**
   * Obtener datos completos de una reserva para edición
   */
  async getReservationForEdit(reservationId: string): Promise<ReservationEditData> {
    // Obtener reserva con cliente
    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .select(`
        *,
        customers (
          id,
          first_name,
          last_name,
          email,
          phone,
          identification_type,
          identification_number,
          address,
          city
        )
      `)
      .eq('id', reservationId)
      .single();

    if (reservationError) throw reservationError;
    if (!reservation) throw new Error('Reserva no encontrada');

    // Obtener espacios reservados
    const { data: reservationSpaces, error: spacesError } = await supabase
      .from('reservation_spaces')
      .select(`
        id,
        space_id,
        spaces (
          id,
          label,
          space_type_id,
          floor_zone,
          space_types (
            id,
            name,
            category_code,
            base_rate,
            capacity
          )
        )
      `)
      .eq('reservation_id', reservationId);

    if (spacesError) throw spacesError;

    // Obtener pagos
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('source', 'pms')
      .eq('source_id', reservationId)
      .order('created_at', { ascending: false });

    return {
      id: reservation.id,
      organization_id: reservation.organization_id,
      branch_id: reservation.branch_id,
      customer_id: reservation.customer_id,
      checkin: reservation.checkin,
      checkout: reservation.checkout,
      occupant_count: reservation.occupant_count || 1,
      status: reservation.status,
      channel: reservation.channel,
      total_estimated: parseFloat(reservation.total_estimated) || 0,
      notes: reservation.notes || '',
      metadata: reservation.metadata || {},
      customer: {
        id: reservation.customers.id,
        organization_id: reservation.organization_id,
        first_name: reservation.customers.first_name,
        last_name: reservation.customers.last_name,
        email: reservation.customers.email,
        phone: reservation.customers.phone || '',
        document_type: reservation.customers.identification_type || '',
        document_number: reservation.customers.identification_number || '',
        address: reservation.customers.address || '',
        city: reservation.customers.city || '',
      },
      spaces: (reservationSpaces || []).map((rs: any) => ({
        id: rs.id,
        space_id: rs.space_id,
        label: rs.spaces?.label || '',
        space_type_id: rs.spaces?.space_type_id || '',
        space_type_name: rs.spaces?.space_types?.name || '',
        category_id: rs.spaces?.space_types?.category_code || '',
        base_rate: parseFloat(rs.spaces?.space_types?.base_rate) || 0,
        floor_zone: rs.spaces?.floor_zone || '',
        capacity: rs.spaces?.space_types?.capacity || 0,
      })),
      payments: (payments || []).map((p: any) => ({
        id: p.id,
        amount: parseFloat(p.amount) || 0,
        method: p.method || '',
        created_at: p.created_at || '',
      })),
    };
  }

  /**
   * Actualizar una reserva existente
   */
  async updateReservation(data: {
    reservationId: string;
    customerId: string;
    checkin: string;
    checkout: string;
    occupantCount: number;
    selectedSpaces: string[];
    extras: any[];
    notes: string;
    organizationId: number;
    branchId: number | null;
    totalEstimated: number;
    category: string;
  }): Promise<void> {
    // 1. Actualizar datos de la reserva
    const { error: updateError } = await supabase
      .from('reservations')
      .update({
        customer_id: data.customerId,
        checkin: data.checkin,
        checkout: data.checkout,
        occupant_count: data.occupantCount,
        notes: data.notes,
        total_estimated: data.totalEstimated,
        metadata: {
          extras: data.extras,
          category: data.category,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.reservationId);

    if (updateError) throw updateError;

    // 2. Actualizar espacios reservados
    // Primero eliminar los existentes
    const { error: deleteSpacesError } = await supabase
      .from('reservation_spaces')
      .delete()
      .eq('reservation_id', data.reservationId);

    if (deleteSpacesError) throw deleteSpacesError;

    // Luego insertar los nuevos
    if (data.selectedSpaces.length > 0) {
      const spacesToInsert = data.selectedSpaces.map((spaceId) => ({
        reservation_id: data.reservationId,
        space_id: spaceId,
        checkin: data.checkin,
        checkout: data.checkout,
      }));

      const { error: insertSpacesError } = await supabase
        .from('reservation_spaces')
        .insert(spacesToInsert);

      if (insertSpacesError) throw insertSpacesError;
    }
  }

  /**
   * Verificar disponibilidad de espacios excluyendo la reserva actual
   */
  async checkAvailabilityForEdit(
    reservationId: string,
    spaceIds: string[],
    checkin: string,
    checkout: string
  ): Promise<{ available: boolean; conflicts: string[] }> {
    const { data, error } = await supabase
      .from('reservation_spaces')
      .select(`
        space_id,
        reservations!inner (
          id,
          checkin,
          checkout,
          status
        )
      `)
      .in('space_id', spaceIds)
      .neq('reservation_id', reservationId)
      .in('reservations.status', ['confirmed', 'checked_in']);

    if (error) throw error;

    const conflicts: string[] = [];

    // Verificar solapamiento de fechas
    (data || []).forEach((rs: any) => {
      const existingCheckin = new Date(rs.reservations.checkin);
      const existingCheckout = new Date(rs.reservations.checkout);
      const newCheckin = new Date(checkin);
      const newCheckout = new Date(checkout);

      // Hay conflicto si las fechas se solapan
      if (
        (newCheckin >= existingCheckin && newCheckin < existingCheckout) ||
        (newCheckout > existingCheckin && newCheckout <= existingCheckout) ||
        (newCheckin <= existingCheckin && newCheckout >= existingCheckout)
      ) {
        if (!conflicts.includes(rs.space_id)) {
          conflicts.push(rs.space_id);
        }
      }
    });

    return {
      available: conflicts.length === 0,
      conflicts,
    };
  }
}

export default new ReservationEditService();
