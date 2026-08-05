import { supabase } from '@/lib/supabase/config';

export interface CheckinReservation {
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
  metadata: any;
}

export interface CheckinStats {
  total_arrivals: number;
  checked_in: number;
  pending: number;
  rooms_ready: number;
  rooms_not_ready: number;
}

class CheckinService {
  /**
   * Obtener reservas con llegada para un rango de fechas
   */
  async getArrivals(
    organizationId: number,
    startDate: string,
    endDate?: string
  ): Promise<CheckinReservation[]> {
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
            status,
            space_types (
              name
            )
          )
        )
      `)
      .eq('organization_id', organizationId);

    // Aplicar filtro de fecha
    if (endDate && endDate !== startDate) {
      query = query.gte('checkin', startDate).lte('checkin', endDate);
    } else {
      query = query.eq('checkin', startDate);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    // Obtener estados de housekeeping para los espacios
    const spaceIds = (data || [])
      .flatMap((r: any) => r.reservation_spaces?.map((rs: any) => rs.spaces?.id))
      .filter(Boolean);

    // Crear mapa de estados de housekeeping
    let housekeepingMap: Record<string, string> = {};

    if (spaceIds.length > 0) {
      // Obtener la tarea de housekeeping MÁS RECIENTE de cada espacio
      const { data: housekeepingData } = await supabase
        .from('housekeeping_tasks')
        .select('space_id, status, task_date')
        .in('space_id', spaceIds)
        .order('task_date', { ascending: false })
        .order('created_at', { ascending: false });

      // Crear mapa con el estado más reciente de cada espacio
      housekeepingMap = (housekeepingData || []).reduce((acc: any, task: any) => {
        // Solo guardar el primer (más reciente) estado de cada espacio
        if (!acc[task.space_id]) {
          acc[task.space_id] = task.status;
        }
        return acc;
      }, {});
    }

    // Transformar datos
    return (data || []).map((reservation: any) => {
      const customer = reservation.customers;
      const spaces = reservation.reservation_spaces || [];

      const checkinDate = new Date(reservation.checkin + 'T00:00:00');
      const checkoutDate = new Date(reservation.checkout + 'T00:00:00');
      const nights = Math.ceil(
        (checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const spacesData = spaces.map((rs: any) => {
        const space = rs.spaces;
        const spaceStatus = space?.status || 'available';
        const housekeepingStatus = housekeepingMap[space?.id];

        // Si hay tarea de housekeeping, usar su estado
        // Si no hay tarea y el espacio está disponible, considerarlo listo
        const isReady = housekeepingStatus
          ? housekeepingStatus === 'done'
          : spaceStatus === 'available';

        return {
          id: space?.id || '',
          label: space?.label || '',
          space_type_name: space?.space_types?.name || '',
          floor_zone: space?.floor_zone || '',
          housekeeping_status: housekeepingStatus || (spaceStatus === 'available' ? 'done' : 'pending'),
          is_ready: isReady,
        };
      });

      return {
        id: reservation.id,
        code: reservation.id.substring(0, 8).toUpperCase(),
        customer_name: customer
          ? `${customer.first_name} ${customer.last_name}`
          : 'N/A',
        customer_email: customer?.email || '',
        customer_phone: customer?.phone || '',
        customer_id: customer?.id || '',
        checkin: reservation.checkin,
        checkout: reservation.checkout,
        nights,
        occupant_count: reservation.occupant_count,
        total_estimated: parseFloat(reservation.total_estimated) || 0,
        status: reservation.status,
        spaces: spacesData,
        metadata: reservation.metadata || {},
      };
    });
  }

  /**
   * Obtener una reserva individual con todos los datos para check-in
   */
  async getReservationForCheckin(reservationId: string): Promise<CheckinReservation | null> {
    const { data: reservation, error } = await supabase
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
            status,
            space_types (
              name
            )
          )
        )
      `)
      .eq('id', reservationId)
      .single();

    if (error || !reservation) return null;

    // Obtener estados de housekeeping
    const spaceIds = (reservation.reservation_spaces || [])
      .map((rs: any) => rs.spaces?.id)
      .filter(Boolean);

    let housekeepingMap: Record<string, string> = {};
    if (spaceIds.length > 0) {
      const { data: housekeepingData } = await supabase
        .from('housekeeping_tasks')
        .select('space_id, status, task_date')
        .in('space_id', spaceIds)
        .order('task_date', { ascending: false })
        .order('created_at', { ascending: false });

      housekeepingMap = (housekeepingData || []).reduce((acc: any, task: any) => {
        if (!acc[task.space_id]) {
          acc[task.space_id] = task.status;
        }
        return acc;
      }, {});
    }

    const customer = reservation.customers;
    const spaces = reservation.reservation_spaces || [];

    const checkinDate = new Date(reservation.checkin + 'T00:00:00');
    const checkoutDate = new Date(reservation.checkout + 'T00:00:00');
    const nights = Math.ceil(
      (checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const spacesData = spaces.map((rs: any) => {
      const space = rs.spaces;
      const spaceStatus = space?.status || 'available';
      const housekeepingStatus = housekeepingMap[space?.id];
      const isReady = housekeepingStatus
        ? housekeepingStatus === 'done'
        : spaceStatus === 'available';

      return {
        id: space?.id || '',
        label: space?.label || '',
        space_type_name: space?.space_types?.name || '',
        floor_zone: space?.floor_zone || '',
        housekeeping_status: housekeepingStatus || (spaceStatus === 'available' ? 'done' : 'pending'),
        is_ready: isReady,
      };
    });

    return {
      id: reservation.id,
      code: reservation.id.substring(0, 8).toUpperCase(),
      customer_name: customer
        ? `${customer.first_name} ${customer.last_name}`
        : 'N/A',
      customer_email: customer?.email || '',
      customer_phone: customer?.phone || '',
      customer_id: customer?.id || '',
      checkin: reservation.checkin,
      checkout: reservation.checkout,
      nights,
      occupant_count: reservation.occupant_count,
      total_estimated: parseFloat(reservation.total_estimated) || 0,
      status: reservation.status,
      spaces: spacesData,
      metadata: reservation.metadata || {},
    };
  }

  /**
   * Obtener reservas con llegada para hoy (método de conveniencia)
   */
  async getTodayArrivals(organizationId: number): Promise<CheckinReservation[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getArrivals(organizationId, today);
  }

  /**
   * Obtener estadísticas de check-in para un rango de fechas
   */
  async getStats(
    organizationId: number,
    startDate: string,
    endDate?: string
  ): Promise<CheckinStats> {
    const arrivals = await this.getArrivals(organizationId, startDate, endDate);

    const total_arrivals = arrivals.length;
    const checked_in = arrivals.filter((r) => r.status === 'checked_in').length;
    const pending = arrivals.filter((r) => r.status === 'confirmed').length;

    const allSpaces = arrivals.flatMap((r) => r.spaces);
    const rooms_ready = allSpaces.filter((s) => s.is_ready).length;
    const rooms_not_ready = allSpaces.filter((s) => !s.is_ready).length;

    return {
      total_arrivals,
      checked_in,
      pending,
      rooms_ready,
      rooms_not_ready,
    };
  }

  /**
   * Obtener estadísticas de check-in del día (método de conveniencia)
   */
  async getTodayStats(organizationId: number): Promise<CheckinStats> {
    const today = new Date().toISOString().split('T')[0];
    return this.getStats(organizationId, today);
  }

  /**
   * Realizar check-in de una reserva
   */
  async performCheckin(data: {
    reservationId: string;
    userId?: string;
    notes?: string;
    depositAmount?: number;
    signatureData?: string;
    identificationType?: string;
    identificationNumber?: string;
    nationality?: string;
    originCity?: string;
    originCountry?: string;
    destinationCity?: string;
    destinationCountry?: string;
    updateCheckinDate?: boolean;
  }): Promise<void> {
    const { 
      reservationId, 
      userId,
      notes, 
      depositAmount, 
      signatureData,
      identificationType,
      identificationNumber,
      nationality,
      originCity,
      originCountry,
      destinationCity,
      destinationCountry,
      updateCheckinDate,
    } = data;

    // Obtener la reserva para actualizar el customer
    const { data: reservation } = await supabase
      .from('reservations')
      .select('customer_id, metadata')
      .eq('id', reservationId)
      .single();

    if (!reservation) throw new Error('Reserva no encontrada');

    // Actualizar datos del customer si se proporcionaron
    if (identificationType || identificationNumber) {
      const customerUpdate: any = {};
      
      if (identificationType) {
        customerUpdate.identification_type = identificationType;
      }
      if (identificationNumber) {
        customerUpdate.identification_number = identificationNumber;
      }

      await supabase
        .from('customers')
        .update(customerUpdate)
        .eq('id', reservation.customer_id);
    }

    // Actualizar estado de la reserva con campos de auditoría y metadata
    const todayStr = new Date().toISOString().split('T')[0];
    const updateData: any = {
      status: 'checked_in',
      updated_at: new Date().toISOString(),
      // Campos de auditoría
      actual_checkin_at: new Date().toISOString(),
      checkin_by: userId || null,
      checkin_notes: notes || null,
      // Si es check-in anticipado y el usuario confirmó, actualizar fechas
      ...(updateCheckinDate ? {
        checkin: todayStr,
        start_date: todayStr,
      } : {}),
      // Metadata adicional
      metadata: {
        ...(reservation?.metadata || {}),
        deposit_amount: depositAmount,
        signature: signatureData,
        // Datos de procedencia y destino
        nationality,
        origin_city: originCity,
        origin_country: originCountry,
        destination_city: destinationCity,
        destination_country: destinationCountry,
        // Tipo de huésped
        guest_type: nationality === 'Colombiana' ? 'nacional' : 'extranjero',
      },
    };

    const { error } = await supabase
      .from('reservations')
      .update(updateData)
      .eq('id', reservationId);

    if (error) throw error;

    // Si es check-in anticipado, actualizar también reservation_spaces
    if (updateCheckinDate) {
      await supabase
        .from('reservation_spaces')
        .update({ checkin: todayStr })
        .eq('reservation_id', reservationId);
    }

    // Actualizar estado de los espacios a "occupied"
    await this.updateSpaceStatus(reservationId, 'occupied');

    // Crear folio si no existe
    await this.createFolioIfNeeded(reservationId);
  }

  /**
   * Crear folio para la reserva si no existe
   */
  private async createFolioIfNeeded(reservationId: string): Promise<void> {
    // Verificar si ya existe un folio
    const { data: existingFolio } = await supabase
      .from('folios')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (existingFolio) return;

    // Crear folio con solo los campos que existen en la tabla
    const { error } = await supabase.from('folios').insert([
      {
        reservation_id: reservationId,
        status: 'open',
        balance: 0,
      },
    ]);

    if (error) throw error;
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
   * Registrar depósito de seguridad
   */
  async registerDeposit(data: {
    reservationId: string;
    amount: number;
    method: string;
    reference?: string;
  }): Promise<void> {
    const { reservationId, amount, method, reference } = data;

    // Obtener datos de la reserva
    const { data: reservation } = await supabase
      .from('reservations')
      .select('organization_id, branch_id')
      .eq('id', reservationId)
      .single();

    if (!reservation) throw new Error('Reserva no encontrada');

    // Registrar pago de depósito
    const { error } = await supabase.from('payments').insert([
      {
        organization_id: reservation.organization_id,
        branch_id: reservation.branch_id,
        source: 'pms',
        source_id: reservationId,
        amount,
        method,
        currency: 'COP',
        reference: reference || `DEP-${Date.now()}`,
        status: 'completed',
      },
    ]);

    if (error) throw error;
  }

  /**
   * Verificar si un espacio está listo
   */
  async checkRoomStatus(spaceId: string): Promise<{
    is_ready: boolean;
    status: string;
    task_id?: string;
  }> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('housekeeping_tasks')
      .select('id, status')
      .eq('space_id', spaceId)
      .eq('task_date', today)
      .maybeSingle();

    if (error) throw error;
    
    if (!data) {
      return {
        is_ready: false,
        status: 'pending',
      };
    }

    return {
      is_ready: data.status === 'completed',
      status: data.status,
      task_id: data.id,
    };
  }

  /**
   * Imprimir tarjeta de registro (datos para PDF)
   */
  async getRegistrationCardData(reservationId: string): Promise<any> {
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        id,
        checkin,
        checkout,
        occupant_count,
        total_estimated,
        metadata,
        customers (
          first_name,
          last_name,
          email,
          phone,
          identification_type,
          identification_number,
          address,
          city,
          country
        ),
        reservation_spaces (
          spaces (
            label,
            floor_zone,
            space_types (
              name
            )
          )
        )
      `)
      .eq('id', reservationId)
      .single();

    if (error) throw error;
    return data;
  }
}

export default new CheckinService();
