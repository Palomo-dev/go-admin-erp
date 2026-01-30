import { supabase } from '@/lib/supabase/config';

export interface CheckoutReservation {
  id: string;
  code: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_id: string;
  checkin: string;
  checkout: string;
  nights: number;
  occupant_count: number;
  total_estimated: number;
  status: string;
  spaces: Array<{
    id: string;
    label: string;
    space_type_name: string;
    floor_zone: string;
    housekeeping_status?: string;
    is_ready: boolean;
  }>;
  folio: {
    id: string;
    balance: number;
    total_charges: number;
    total_payments: number;
    items: Array<{
      description: string;
      amount: number;
      source: string;
      created_at: string;
    }>;
  } | null;
  metadata: any;
}

export interface CheckoutStats {
  total_departures: number;
  checked_out: number;
  pending: number;
  with_balance: number;
  rooms_cleaned: number;
}

export interface CheckoutData {
  reservationId: string;
  userId?: string;
  notes?: string;
  generateInvoice: boolean;
  generateReceipt: boolean;
}

class CheckoutService {
  /**
   * Obtener reservas con salida para un rango de fechas
   */
  async getDepartures(
    organizationId: number,
    startDate: string,
    endDate?: string
  ): Promise<CheckoutReservation[]> {
    let query = supabase
      .from('reservations')
      .select(`
        id,
        customer_id,
        checkin,
        checkout,
        occupant_count,
        total_estimated,
        status,
        metadata,
        customers (
          id,
          first_name,
          last_name,
          email,
          phone
        ),
        reservation_spaces (
          space_id,
          spaces (
            id,
            label,
            floor_zone,
            space_types (
              name
            )
          )
        )
      `)
      .eq('organization_id', organizationId);

    // Aplicar filtro de fecha
    if (endDate && endDate !== startDate) {
      query = query.gte('checkout', startDate).lte('checkout', endDate);
    } else {
      query = query.eq('checkout', startDate);
    }

    // Solo reservas que están checked_in (listas para hacer checkout)
    query = query.eq('status', 'checked_in');

    const { data, error } = await query.order('checkout', { ascending: true });

    if (error) throw error;

    // Establecer parámetro de sesión para RLS de folios
    await supabase.rpc('set_session_org_id', {
      org_id: organizationId
    });

    // Transformar datos
    const departures: CheckoutReservation[] = await Promise.all(
      (data || []).map(async (reservation: any) => {
        // Obtener folio para esta reserva
        let folioData = null;
        const { data: folios } = await supabase
          .from('folios')
          .select('id, balance, status')
          .eq('reservation_id', reservation.id)
          .maybeSingle();

        if (folios) {
          const folio = folios;
          
          // Obtener items del folio
          const { data: folioItems } = await supabase
            .from('folio_items')
            .select('description, amount, source, created_at')
            .eq('folio_id', folio.id)
            .order('created_at', { ascending: true });

          // Obtener pagos del folio
          const { data: payments } = await supabase
            .from('payments')
            .select('amount')
            .eq('source', 'folio')
            .eq('source_id', folio.id);

          const totalCharges = (folioItems || []).reduce((sum, item) => sum + Number(item.amount), 0);
          const totalPayments = (payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);

          folioData = {
            id: folio.id,
            balance: Number(folio.balance),
            total_charges: totalCharges,
            total_payments: totalPayments,
            items: folioItems || [],
          };
        }

        const customer = reservation.customers || {};
        const spaces = (reservation.reservation_spaces || []).map((rs: any) => ({
          id: rs.spaces?.id || '',
          label: rs.spaces?.label || '',
          space_type_name: rs.spaces?.space_types?.name || '',
          floor_zone: rs.spaces?.floor_zone || '',
          housekeeping_status: 'pending',
          is_ready: false,
        }));

        const checkin = new Date(reservation.checkin);
        const checkout = new Date(reservation.checkout);
        const nights = Math.ceil(
          (checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)
        );

          return {
            id: reservation.id,
            code: reservation.metadata?.code || `RES-${reservation.id.slice(0, 8)}`,
            customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
            customer_email: customer.email || '',
            customer_phone: customer.phone || '',
            customer_id: reservation.customer_id,
            checkin: reservation.checkin,
            checkout: reservation.checkout,
            nights,
            occupant_count: reservation.occupant_count || 1,
            total_estimated: Number(reservation.total_estimated || 0),
            status: reservation.status,
            spaces,
            folio: folioData,
            metadata: reservation.metadata || {},
        };
      })
    );

    return departures;
  }

  /**
   * Obtener estadísticas de salidas
   */
  async getStats(
    organizationId: number,
    startDate: string,
    endDate?: string
  ): Promise<CheckoutStats> {
    // Establecer parámetro de sesión para RLS de folios
    await supabase.rpc('set_session_org_id', {
      org_id: organizationId
    });

    let query = supabase
      .from('reservations')
      .select('id, status')
      .eq('organization_id', organizationId);

    // Aplicar filtro de fecha
    if (endDate && endDate !== startDate) {
      query = query.gte('checkout', startDate).lte('checkout', endDate);
    } else {
      query = query.eq('checkout', startDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    const stats = {
      total_departures: data?.length || 0,
      checked_out: data?.filter((r) => r.status === 'closed').length || 0,
      pending: data?.filter((r) => r.status === 'checked_in').length || 0,
      with_balance: 0,
      rooms_cleaned: 0,
    };

    // Contar reservas con saldo pendiente obteniendo folios individualmente
    let withBalanceCount = 0;
    if (data && data.length > 0) {
      for (const reservation of data) {
        const { data: folio } = await supabase
          .from('folios')
          .select('balance')
          .eq('reservation_id', reservation.id)
          .maybeSingle();
        
        if (folio && Number(folio.balance) > 0) {
          withBalanceCount++;
        }
      }
    }
    stats.with_balance = withBalanceCount;

    return stats;
  }

  /**
   * Realizar checkout de una reserva
   */
  async performCheckout(data: CheckoutData): Promise<void> {
    const { reservationId, userId, notes, generateInvoice, generateReceipt } = data;

    // Obtener metadata actual de la reserva
    const { data: currentReservation } = await supabase
      .from('reservations')
      .select('metadata')
      .eq('id', reservationId)
      .single();

    // Actualizar estado de la reserva con campos de auditoría
    const { error: reservationError } = await supabase
      .from('reservations')
      .update({
        status: 'checked_out',
        updated_at: new Date().toISOString(),
        // Campos de auditoría
        actual_checkout_at: new Date().toISOString(),
        checkout_by: userId || null,
        checkout_notes: notes || null,
        // Preservar metadata existente
        metadata: {
          ...(currentReservation?.metadata || {}),
        },
      })
      .eq('id', reservationId);

    if (reservationError) throw reservationError;

    // Cerrar el folio
    const { data: folio, error: folioQueryError } = await supabase
      .from('folios')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (folioQueryError) throw folioQueryError;

    if (folio) {
      await supabase.rpc('set_session_org_id', {
        org_id: await this.getOrganizationIdFromReservation(reservationId)
      });

      const { error: folioError } = await supabase
        .from('folios')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', folio.id);

      if (folioError) throw folioError;
    }

    // Crear tarea de limpieza para las habitaciones
    await this.createHousekeepingTasks(reservationId);

    // Actualizar estado de espacios a 'cleaning' después de crear tareas de limpieza
    await this.updateSpaceStatus(reservationId, 'cleaning');

    // TODO: Implementar generación de factura/recibo si es necesario
    if (generateInvoice) {
      // Lógica para generar factura
      console.log('Generar factura para reserva:', reservationId);
    }

    if (generateReceipt) {
      // Lógica para generar recibo
      console.log('Generar recibo para reserva:', reservationId);
    }
  }

  /**
   * Crear tareas de housekeeping después del checkout
   */
  private async createHousekeepingTasks(reservationId: string): Promise<void> {
    // Obtener espacios de la reserva
    const { data: reservationSpaces } = await supabase
      .from('reservation_spaces')
      .select('space_id')
      .eq('reservation_id', reservationId);

    if (!reservationSpaces || reservationSpaces.length === 0) return;

    // Crear tarea de limpieza para cada espacio
    const tasks = reservationSpaces.map((rs) => ({
      space_id: rs.space_id,
      task_date: new Date().toISOString().split('T')[0],
      status: 'pending' as const,
      notes: `Limpieza post check-out - Reserva ${reservationId.slice(0, 8)}`,
    }));

    const { error } = await supabase.from('housekeeping_tasks').insert(tasks);

    if (error) throw error;
  }

  /**
   * Obtener organization_id de una reserva
   */
  private async getOrganizationIdFromReservation(reservationId: string): Promise<number> {
    const { data, error } = await supabase
      .from('reservations')
      .select('organization_id')
      .eq('id', reservationId)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Reserva no encontrada');

    return data.organization_id;
  }

  /**
   * Actualizar estado de los espacios de una reserva
   */
  private async updateSpaceStatus(
    reservationId: string,
    status: 'available' | 'occupied' | 'reserved' | 'maintenance' | 'cleaning' | 'out_of_order'
  ): Promise<void> {
    // Obtener los espacios asociados a la reserva
    const { data: reservationSpaces, error: rsError } = await supabase
      .from('reservation_spaces')
      .select('space_id')
      .eq('reservation_id', reservationId);

    if (rsError) throw rsError;

    if (reservationSpaces && reservationSpaces.length > 0) {
      // Actualizar el estado de cada espacio
      const spaceIds = reservationSpaces.map((rs) => rs.space_id);
      
      const { error: updateError } = await supabase
        .from('spaces')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', spaceIds);

      if (updateError) throw updateError;
    }
  }

  /**
   * Obtener detalle del folio para una reserva
   */
  async getFolioDetails(reservationId: string) {
    const { data: folio, error: folioError } = await supabase
      .from('folios')
      .select(`
        id,
        balance,
        status,
        created_at
      `)
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (folioError) throw folioError;
    if (!folio) return null;

    // Establecer parámetro de sesión para RLS
    const orgId = await this.getOrganizationIdFromReservation(reservationId);
    await supabase.rpc('set_session_org_id', { org_id: orgId });

    // Obtener items
    const { data: items } = await supabase
      .from('folio_items')
      .select('*')
      .eq('folio_id', folio.id)
      .order('created_at', { ascending: true });

    // Obtener pagos
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('source', 'folio')
      .eq('source_id', folio.id)
      .order('created_at', { ascending: true });

    return {
      ...folio,
      items: items || [],
      payments: payments || [],
    };
  }
}

export default new CheckoutService();
