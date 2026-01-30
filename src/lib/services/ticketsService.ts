import { supabase } from '@/lib/supabase/config';

// =====================================================
// TIPOS E INTERFACES
// =====================================================

export interface TicketWithDetails {
  id: string;
  organization_id: number;
  trip_id: string;
  customer_id?: string;
  ticket_number: string;
  seat_number?: string;
  boarding_stop_id?: string;
  alighting_stop_id?: string;
  fare: number;
  discount?: number;
  total: number;
  currency: string;
  status: 'reserved' | 'confirmed' | 'boarded' | 'completed' | 'no_show' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'partial' | 'refunded' | 'cancelled';
  qr_code?: string;
  checkin_code?: string;
  passenger_name?: string;
  passenger_doc?: string;
  passenger_phone?: string;
  passenger_email?: string;
  boarded_at?: string;
  alighted_at?: string;
  notes?: string;
  sale_id?: string;
  created_at: string;
  updated_at: string;
  trips?: {
    id: string;
    trip_code: string;
    trip_date: string;
    scheduled_departure: string;
    transport_routes?: { id: string; name: string; code: string };
  };
  customers?: { id: string; full_name: string; email?: string; phone?: string; identification_number?: string };
  boarding_stop?: { id: string; name: string; city?: string };
  alighting_stop?: { id: string; name: string; city?: string };
}

export interface TicketFilters {
  status?: string;
  paymentStatus?: string;
  tripId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// =====================================================
// SERVICIO DE BOLETOS
// =====================================================

class TicketsService {
  async getTickets(organizationId: number, filters?: TicketFilters): Promise<TicketWithDetails[]> {
    let query = supabase
      .from('trip_tickets')
      .select(`
        *,
        trips(
          id, trip_code, trip_date, scheduled_departure,
          transport_routes(id, name, code)
        ),
        customers(id, full_name, email, phone, identification_number),
        boarding_stop:transport_stops!trip_tickets_boarding_stop_id_fkey(id, name, city),
        alighting_stop:transport_stops!trip_tickets_alighting_stop_id_fkey(id, name, city)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.paymentStatus && filters.paymentStatus !== 'all') {
      query = query.eq('payment_status', filters.paymentStatus);
    }
    if (filters?.tripId) {
      query = query.eq('trip_id', filters.tripId);
    }
    if (filters?.dateFrom) {
      query = query.gte('created_at', `${filters.dateFrom}T00:00:00`);
    }
    if (filters?.dateTo) {
      query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
    }

    const { data, error } = await query.limit(500);
    if (error) throw error;

    let results = (data || []) as TicketWithDetails[];

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      results = results.filter((t) =>
        t.ticket_number?.toLowerCase().includes(search) ||
        t.passenger_name?.toLowerCase().includes(search) ||
        t.passenger_doc?.toLowerCase().includes(search) ||
        t.passenger_phone?.includes(search) ||
        t.customers?.full_name?.toLowerCase().includes(search)
      );
    }

    return results;
  }

  async getTicketById(id: string): Promise<TicketWithDetails | null> {
    const { data, error } = await supabase
      .from('trip_tickets')
      .select(`
        *,
        trips(
          id, trip_code, trip_date, scheduled_departure,
          transport_routes(id, name, code)
        ),
        customers(id, full_name, email, phone, identification_number),
        boarding_stop:transport_stops!trip_tickets_boarding_stop_id_fkey(id, name, city),
        alighting_stop:transport_stops!trip_tickets_alighting_stop_id_fkey(id, name, city)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as TicketWithDetails;
  }

  async createTicket(ticket: Partial<TicketWithDetails>): Promise<TicketWithDetails> {
    if (!ticket.ticket_number) {
      const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      ticket.ticket_number = `TKT-${random}`;
    }
    if (!ticket.checkin_code) {
      ticket.checkin_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    const { data, error } = await supabase
      .from('trip_tickets')
      .insert(ticket)
      .select()
      .single();

    if (error) throw error;
    return data as TicketWithDetails;
  }

  async updateTicket(id: string, updates: Partial<TicketWithDetails>): Promise<TicketWithDetails> {
    const { data, error } = await supabase
      .from('trip_tickets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as TicketWithDetails;
  }

  async deleteTicket(id: string): Promise<void> {
    const { error } = await supabase
      .from('trip_tickets')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async cancelTicket(id: string, reason?: string): Promise<TicketWithDetails> {
    return this.updateTicket(id, {
      status: 'cancelled',
      notes: reason ? `Cancelado: ${reason}` : 'Cancelado',
    });
  }

  async confirmTicket(id: string): Promise<TicketWithDetails> {
    return this.updateTicket(id, { status: 'confirmed' });
  }

  async boardTicket(id: string): Promise<TicketWithDetails> {
    return this.updateTicket(id, {
      status: 'boarded',
      boarded_at: new Date().toISOString(),
    });
  }

  async markNoShow(id: string): Promise<TicketWithDetails> {
    return this.updateTicket(id, { status: 'no_show' });
  }

  async reassignSeat(id: string, newSeat: string): Promise<TicketWithDetails> {
    return this.updateTicket(id, { seat_number: newSeat });
  }

  async processRefund(id: string): Promise<TicketWithDetails> {
    return this.updateTicket(id, {
      status: 'cancelled',
      payment_status: 'refunded',
    });
  }

  async getTicketStats(organizationId: number) {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('trip_tickets')
      .select('status, payment_status, total')
      .eq('organization_id', organizationId)
      .gte('created_at', `${today}T00:00:00`);

    if (error) throw error;

    const tickets = data || [];
    return {
      total: tickets.length,
      reserved: tickets.filter((t) => t.status === 'reserved').length,
      confirmed: tickets.filter((t) => t.status === 'confirmed').length,
      boarded: tickets.filter((t) => t.status === 'boarded').length,
      cancelled: tickets.filter((t) => t.status === 'cancelled').length,
      noShow: tickets.filter((t) => t.status === 'no_show').length,
      revenue: tickets.filter((t) => t.payment_status === 'paid').reduce((sum, t) => sum + (Number(t.total) || 0), 0),
    };
  }

  async getTrips(organizationId: number) {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('trips')
      .select('id, trip_code, trip_date, scheduled_departure, available_seats, transport_routes(name)')
      .eq('organization_id', organizationId)
      .gte('trip_date', today)
      .order('trip_date', { ascending: true })
      .order('scheduled_departure', { ascending: true })
      .limit(100);

    if (error) throw error;
    return data || [];
  }

  async getStops(organizationId: number) {
    const { data, error } = await supabase
      .from('transport_stops')
      .select('id, name, city, address')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async duplicateTicket(id: string, organizationId: number): Promise<TicketWithDetails> {
    const original = await this.getTicketById(id);
    if (!original) throw new Error('Boleto no encontrado');

    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    const checkinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabase
      .from('trip_tickets')
      .insert({
        organization_id: organizationId,
        trip_id: original.trip_id,
        ticket_number: `TKT-${random}`,
        checkin_code: checkinCode,
        passenger_name: original.passenger_name,
        passenger_doc_type: original.passenger_doc?.split('-')[0],
        passenger_doc_number: original.passenger_doc?.split('-')[1] || original.passenger_doc,
        passenger_phone: original.passenger_phone,
        passenger_email: original.passenger_email,
        boarding_stop_id: original.boarding_stop_id,
        alighting_stop_id: original.alighting_stop_id,
        fare: original.fare,
        discount: original.discount,
        total: original.total,
        currency: original.currency,
        status: 'reserved',
        payment_status: 'pending',
        notes: `Duplicado de ${original.ticket_number}`,
      })
      .select()
      .single();

    if (error) throw error;
    return data as TicketWithDetails;
  }

  async changeRoute(
    id: string,
    newBoardingStopId?: string,
    newAlightingStopId?: string
  ): Promise<TicketWithDetails> {
    return this.updateTicket(id, {
      boarding_stop_id: newBoardingStopId,
      alighting_stop_id: newAlightingStopId,
    });
  }

  async changeTrip(id: string, newTripId: string): Promise<TicketWithDetails> {
    return this.updateTicket(id, { trip_id: newTripId });
  }

  async searchCustomers(organizationId: number, query: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, email, phone, doc_number')
      .eq('organization_id', organizationId)
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,doc_number.ilike.%${query}%`)
      .limit(10);

    if (error) throw error;
    return (data || []).map(c => ({
      id: c.id,
      name: c.full_name || '',
      email: c.email,
      phone: c.phone,
      document_number: c.doc_number,
    }));
  }

  async resendQR(id: string): Promise<{ success: boolean; message: string }> {
    const ticket = await this.getTicketById(id);
    if (!ticket) throw new Error('Boleto no encontrado');
    
    // TODO: Implementar integración con servicio de notificaciones
    console.log(`[Simulated] Sending QR for ticket ${ticket.ticket_number} to ${ticket.passenger_email || ticket.passenger_phone}`);
    
    return {
      success: true,
      message: `QR enviado a ${ticket.passenger_email || ticket.passenger_phone || 'N/A'}`,
    };
  }

  // =====================================================
  // MÉTODOS PARA GESTIÓN DE ASIENTOS
  // =====================================================

  /**
   * Obtiene los asientos disponibles para un viaje específico
   */
  async getTripSeats(tripId: string): Promise<TripSeat[]> {
    const { data, error } = await supabase
      .from('trip_seats')
      .select(`
        id,
        seat_label,
        status,
        ticket_id,
        vehicle_seats(seat_row, seat_column, seat_type, price_modifier, position_x, position_y)
      `)
      .eq('trip_id', tripId)
      .order('seat_label');

    if (error) throw error;
    
    // Mapear respuesta de Supabase (relación como array) a interface
    return (data || []).map((seat: Record<string, unknown>) => ({
      id: seat.id as string,
      seat_label: seat.seat_label as string,
      status: seat.status as TripSeat['status'],
      ticket_id: seat.ticket_id as string | undefined,
      vehicle_seats: Array.isArray(seat.vehicle_seats) && seat.vehicle_seats[0] 
        ? seat.vehicle_seats[0] as TripSeat['vehicle_seats']
        : seat.vehicle_seats as TripSeat['vehicle_seats'],
    }));
  }

  /**
   * Inicializa los asientos de un viaje basándose en el vehículo asignado
   */
  async initializeTripSeats(tripId: string): Promise<number> {
    const { data, error } = await supabase.rpc('fn_initialize_trip_seats', { p_trip_id: tripId });
    if (error) throw error;
    return data as number;
  }

  /**
   * Reserva un asiento para un boleto
   */
  async reserveSeat(tripId: string, seatLabel: string, ticketId?: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('fn_reserve_seat', {
      p_trip_id: tripId,
      p_seat_label: seatLabel,
      p_ticket_id: ticketId || null,
    });
    if (error) throw error;
    return data as string | null;
  }

  /**
   * Libera un asiento previamente reservado
   */
  async releaseSeat(tripId: string, seatLabel: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_release_seat', {
      p_trip_id: tripId,
      p_seat_label: seatLabel,
    });
    if (error) throw error;
    return data as boolean;
  }

  // =====================================================
  // MÉTODOS PARA RUTAS Y PARADAS
  // =====================================================

  /**
   * Obtiene las paradas de una ruta específica en orden
   */
  async getRouteStops(routeId: string): Promise<RouteStop[]> {
    const { data, error } = await supabase
      .from('route_stops')
      .select(`
        id,
        stop_order,
        is_boarding_allowed,
        is_alighting_allowed,
        fare_from_origin,
        transport_stops(id, name, city, address)
      `)
      .eq('route_id', routeId)
      .order('stop_order');

    if (error) throw error;
    
    return (data || []).map((stop: Record<string, unknown>) => ({
      id: stop.id as string,
      stop_order: stop.stop_order as number,
      is_boarding_allowed: stop.is_boarding_allowed as boolean,
      is_alighting_allowed: stop.is_alighting_allowed as boolean,
      fare_from_origin: stop.fare_from_origin as number | undefined,
      transport_stops: Array.isArray(stop.transport_stops) && stop.transport_stops[0]
        ? stop.transport_stops[0] as RouteStop['transport_stops']
        : stop.transport_stops as RouteStop['transport_stops'],
    }));
  }

  /**
   * Obtiene información completa del viaje incluyendo ruta, vehículo y tarifa
   */
  async getTripDetails(tripId: string): Promise<TripDetails | null> {
    const { data, error } = await supabase
      .from('trips')
      .select(`
        id,
        trip_code,
        trip_date,
        scheduled_departure,
        total_seats,
        available_seats,
        base_fare,
        currency,
        route_id,
        vehicle_id,
        transport_routes(
          id,
          name,
          code,
          origin_stop_id,
          destination_stop_id,
          base_fare,
          origin_stop:transport_stops!transport_routes_origin_stop_id_fkey(id, name, city),
          destination_stop:transport_stops!transport_routes_destination_stop_id_fkey(id, name, city)
        ),
        vehicles(id, plate, vehicle_type, passenger_capacity)
      `)
      .eq('id', tripId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    
    if (!data) return null;
    
    // Mapear relaciones de Supabase
    const rawData = data as Record<string, unknown>;
    const routes = rawData.transport_routes as Record<string, unknown>[] | Record<string, unknown> | null;
    const routeData = Array.isArray(routes) ? routes[0] : routes;
    const vehicles = rawData.vehicles as Record<string, unknown>[] | Record<string, unknown> | null;
    const vehicleData = Array.isArray(vehicles) ? vehicles[0] : vehicles;
    
    return {
      id: rawData.id as string,
      trip_code: rawData.trip_code as string,
      trip_date: rawData.trip_date as string,
      scheduled_departure: rawData.scheduled_departure as string,
      total_seats: rawData.total_seats as number,
      available_seats: rawData.available_seats as number,
      base_fare: rawData.base_fare as number,
      currency: rawData.currency as string,
      route_id: rawData.route_id as string,
      vehicle_id: rawData.vehicle_id as string | undefined,
      transport_routes: routeData ? {
        id: (routeData as Record<string, unknown>).id as string,
        name: (routeData as Record<string, unknown>).name as string,
        code: (routeData as Record<string, unknown>).code as string,
        origin_stop_id: (routeData as Record<string, unknown>).origin_stop_id as string | undefined,
        destination_stop_id: (routeData as Record<string, unknown>).destination_stop_id as string | undefined,
        base_fare: (routeData as Record<string, unknown>).base_fare as number | undefined,
        origin_stop: Array.isArray((routeData as Record<string, unknown>).origin_stop) 
          ? ((routeData as Record<string, unknown>).origin_stop as Record<string, unknown>[])[0] as TripDetails['transport_routes'] extends { origin_stop?: infer T } ? T : never
          : (routeData as Record<string, unknown>).origin_stop as TripDetails['transport_routes'] extends { origin_stop?: infer T } ? T : never,
        destination_stop: Array.isArray((routeData as Record<string, unknown>).destination_stop)
          ? ((routeData as Record<string, unknown>).destination_stop as Record<string, unknown>[])[0] as TripDetails['transport_routes'] extends { destination_stop?: infer T } ? T : never
          : (routeData as Record<string, unknown>).destination_stop as TripDetails['transport_routes'] extends { destination_stop?: infer T } ? T : never,
      } : undefined,
      vehicles: vehicleData as TripDetails['vehicles'],
    };
  }

  /**
   * Calcula la tarifa entre dos paradas de una ruta
   */
  async calculateFare(routeId: string, boardingStopId: string, alightingStopId: string): Promise<number> {
    // Primero buscar en transport_fares
    const { data: fareData } = await supabase
      .from('transport_fares')
      .select('amount')
      .eq('route_id', routeId)
      .eq('from_stop_id', boardingStopId)
      .eq('to_stop_id', alightingStopId)
      .eq('is_active', true)
      .single();

    if (fareData?.amount) {
      return Number(fareData.amount);
    }

    // Si no hay tarifa específica, usar base_fare de la ruta
    const { data: routeData } = await supabase
      .from('transport_routes')
      .select('base_fare')
      .eq('id', routeId)
      .single();

    return Number(routeData?.base_fare) || 0;
  }
}

// =====================================================
// INTERFACES ADICIONALES
// =====================================================

export interface TripSeat {
  id: string;
  seat_label: string;
  status: 'available' | 'reserved' | 'sold' | 'blocked';
  ticket_id?: string;
  vehicle_seats?: {
    seat_row: number;
    seat_column: string;
    seat_type: string;
    price_modifier: number;
    position_x?: number;
    position_y?: number;
  };
}

export interface RouteStop {
  id: string;
  stop_order: number;
  is_boarding_allowed: boolean;
  is_alighting_allowed: boolean;
  fare_from_origin?: number;
  transport_stops?: {
    id: string;
    name: string;
    city?: string;
    address?: string;
  };
}

export interface TripDetails {
  id: string;
  trip_code: string;
  trip_date: string;
  scheduled_departure: string;
  total_seats: number;
  available_seats: number;
  base_fare: number;
  currency: string;
  route_id: string;
  vehicle_id?: string;
  transport_routes?: {
    id: string;
    name: string;
    code: string;
    origin_stop_id?: string;
    destination_stop_id?: string;
    base_fare?: number;
    origin_stop?: { id: string; name: string; city?: string };
    destination_stop?: { id: string; name: string; city?: string };
  };
  vehicles?: {
    id: string;
    plate: string;
    vehicle_type: string;
    passenger_capacity: number;
  };
}

export const ticketsService = new TicketsService();
export default ticketsService;
