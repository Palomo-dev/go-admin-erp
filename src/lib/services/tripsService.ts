import { supabase } from '@/lib/supabase/config';

// =====================================================
// TIPOS E INTERFACES
// =====================================================

export interface TripWithDetails {
  id: string;
  organization_id: number;
  route_id: string;
  schedule_id?: string;
  branch_id?: number;
  trip_code: string;
  trip_date: string;
  scheduled_departure: string;
  scheduled_arrival?: string;
  actual_departure?: string;
  actual_arrival?: string;
  vehicle_id?: string;
  driver_id?: string;
  total_seats: number;
  available_seats: number;
  base_fare: number;
  currency: string;
  status: 'scheduled' | 'boarding' | 'in_transit' | 'completed' | 'cancelled';
  delay_reason?: string;
  delay_minutes?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  transport_routes?: {
    id: string;
    name: string;
    code: string;
    origin_stop_id: string;
    destination_stop_id: string;
    origin_stop?: { id: string; name: string; city?: string };
    destination_stop?: { id: string; name: string; city?: string };
  };
  vehicles?: {
    id: string;
    plate: string;
    vehicle_type: string;
    brand?: string;
    model?: string;
    passenger_capacity?: number;
  };
  driver_credentials?: {
    id: string;
    employments?: {
      organization_members?: {
        profiles?: { first_name: string; last_name: string };
      };
    };
  };
  branches?: { id: number; name: string };
}

export interface TripTicket {
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
  boarded_at?: string;
  alighted_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  customers?: { id: string; full_name: string; email?: string; phone?: string; identification_number?: string };
  boarding_stop?: { id: string; name: string; city?: string };
  alighting_stop?: { id: string; name: string; city?: string };
}

export interface TransportEvent {
  id: string;
  organization_id: number;
  reference_type: 'trip' | 'shipment' | 'manifest';
  reference_id: string;
  event_type: string;
  event_time: string;
  sequence?: number;
  stop_id?: string;
  actor_type?: 'system' | 'driver' | 'user' | 'carrier_webhook' | 'customer' | 'api';
  actor_id?: string;
  latitude?: number;
  longitude?: number;
  location_text?: string;
  description?: string;
  external_event_id?: string;
  source?: 'internal' | 'carrier_webhook' | 'driver_app' | 'customer_app' | 'api' | 'system';
  metadata?: Record<string, unknown>;
  created_at: string;
  transport_stops?: { id: string; name: string; city?: string };
}

export interface TripFilters {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  routeId?: string;
  vehicleId?: string;
  driverId?: string;
  branchId?: number;
}

// =====================================================
// SERVICIO DE VIAJES
// =====================================================

class TripsService {
  // ==================== VIAJES ====================

  async getTrips(organizationId: number, filters?: TripFilters): Promise<TripWithDetails[]> {
    let query = supabase
      .from('trips')
      .select(`
        *,
        transport_routes(id, name, code, origin_stop_id, destination_stop_id),
        vehicles(id, plate, vehicle_type, brand, model, passenger_capacity),
        branches(id, name)
      `)
      .eq('organization_id', organizationId)
      .order('trip_date', { ascending: false })
      .order('scheduled_departure', { ascending: true });

    if (filters?.date) {
      query = query.eq('trip_date', filters.date);
    }
    if (filters?.dateFrom) {
      query = query.gte('trip_date', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('trip_date', filters.dateTo);
    }
    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.routeId) {
      query = query.eq('route_id', filters.routeId);
    }
    if (filters?.vehicleId) {
      query = query.eq('vehicle_id', filters.vehicleId);
    }
    if (filters?.driverId) {
      query = query.eq('driver_id', filters.driverId);
    }
    if (filters?.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }

    const { data, error } = await query.limit(200);
    if (error) throw error;
    return (data || []) as TripWithDetails[];
  }

  async getTripById(id: string): Promise<TripWithDetails | null> {
    const { data, error } = await supabase
      .from('trips')
      .select(`
        *,
        transport_routes(
          id, name, code, origin_stop_id, destination_stop_id,
          origin_stop:transport_stops!transport_routes_origin_stop_id_fkey(id, name, city),
          destination_stop:transport_stops!transport_routes_destination_stop_id_fkey(id, name, city)
        ),
        vehicles(id, plate, vehicle_type, brand, model, passenger_capacity),
        branches(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as TripWithDetails;
  }

  async createTrip(trip: Partial<TripWithDetails>): Promise<TripWithDetails> {
    // Generar código de viaje si no existe
    if (!trip.trip_code) {
      const date = trip.trip_date || new Date().toISOString().split('T')[0];
      const dateCode = date.replace(/-/g, '');
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      trip.trip_code = `VJ-${dateCode}-${random}`;
    }

    const { data, error } = await supabase
      .from('trips')
      .insert(trip)
      .select()
      .single();

    if (error) throw error;
    return data as TripWithDetails;
  }

  async updateTrip(id: string, updates: Partial<TripWithDetails>): Promise<TripWithDetails> {
    const { data, error } = await supabase
      .from('trips')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as TripWithDetails;
  }

  async deleteTrip(id: string): Promise<void> {
    const { error } = await supabase
      .from('trips')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async duplicateTrip(id: string, newDate: string): Promise<TripWithDetails> {
    const original = await this.getTripById(id);
    if (!original) throw new Error('Viaje no encontrado');

    const { id: _, created_at, updated_at, actual_departure, actual_arrival, ...tripData } = original;
    
    return this.createTrip({
      ...tripData,
      trip_date: newDate,
      trip_code: undefined, // Se generará uno nuevo
      status: 'scheduled',
      available_seats: original.total_seats,
    });
  }

  async updateTripStatus(id: string, status: TripWithDetails['status'], reason?: string): Promise<TripWithDetails> {
    const updates: Partial<TripWithDetails> = { status };
    
    if (status === 'in_transit') {
      updates.actual_departure = new Date().toISOString();
    } else if (status === 'completed') {
      updates.actual_arrival = new Date().toISOString();
    } else if (status === 'cancelled' && reason) {
      updates.delay_reason = reason;
    }

    return this.updateTrip(id, updates);
  }

  // ==================== BOLETOS ====================

  async getTripTickets(tripId: string): Promise<TripTicket[]> {
    const { data, error } = await supabase
      .from('trip_tickets')
      .select(`
        *,
        customers(id, full_name, email, phone, identification_number),
        boarding_stop:transport_stops!trip_tickets_boarding_stop_id_fkey(id, name, city),
        alighting_stop:transport_stops!trip_tickets_alighting_stop_id_fkey(id, name, city)
      `)
      .eq('trip_id', tripId)
      .order('seat_number');

    if (error) throw error;
    return (data || []) as TripTicket[];
  }

  async getTicketById(id: string): Promise<TripTicket | null> {
    const { data, error } = await supabase
      .from('trip_tickets')
      .select(`
        *,
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
    return data as TripTicket;
  }

  async boardPassenger(ticketId: string): Promise<TripTicket> {
    const { data, error } = await supabase
      .from('trip_tickets')
      .update({
        status: 'boarded',
        boarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;
    return data as TripTicket;
  }

  async markNoShow(ticketId: string): Promise<TripTicket> {
    const { data, error } = await supabase
      .from('trip_tickets')
      .update({
        status: 'no_show',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;
    return data as TripTicket;
  }

  async findTicketByCode(code: string): Promise<TripTicket | null> {
    // Buscar por QR code, checkin_code o ticket_number
    const { data, error } = await supabase
      .from('trip_tickets')
      .select(`
        *,
        customers(id, full_name, email, phone, identification_number),
        boarding_stop:transport_stops!trip_tickets_boarding_stop_id_fkey(id, name, city),
        alighting_stop:transport_stops!trip_tickets_alighting_stop_id_fkey(id, name, city)
      `)
      .or(`qr_code.eq.${code},checkin_code.eq.${code},ticket_number.eq.${code}`)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as TripTicket;
  }

  // ==================== EVENTOS ====================

  async getTripEvents(tripId: string): Promise<TransportEvent[]> {
    const { data, error } = await supabase
      .from('transport_events')
      .select(`
        *,
        transport_stops(id, name, city)
      `)
      .eq('reference_type', 'trip')
      .eq('reference_id', tripId)
      .order('event_time', { ascending: true })
      .order('sequence', { ascending: true });

    if (error) throw error;
    return (data || []) as TransportEvent[];
  }

  async createEvent(event: Partial<TransportEvent>): Promise<TransportEvent> {
    // Obtener el siguiente sequence
    const { data: lastEvent } = await supabase
      .from('transport_events')
      .select('sequence')
      .eq('reference_type', event.reference_type!)
      .eq('reference_id', event.reference_id!)
      .order('sequence', { ascending: false })
      .limit(1)
      .single();

    const sequence = (lastEvent?.sequence || 0) + 1;

    const { data, error } = await supabase
      .from('transport_events')
      .insert({
        ...event,
        sequence,
        event_time: event.event_time || new Date().toISOString(),
        source: event.source || 'internal',
        actor_type: event.actor_type || 'user',
      })
      .select()
      .single();

    if (error) throw error;
    return data as TransportEvent;
  }

  // ==================== INCIDENTES ====================

  async getTripIncidents(tripId: string) {
    const { data, error } = await supabase
      .from('transport_incidents')
      .select('*')
      .eq('reference_type', 'trip')
      .eq('reference_id', tripId)
      .order('occurred_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createIncident(incident: {
    organization_id: number;
    reference_type: string;
    reference_id: string;
    incident_type: string;
    severity: string;
    title: string;
    description?: string;
  }) {
    const { data, error } = await supabase
      .from('transport_incidents')
      .insert({
        ...incident,
        status: 'open',
        occurred_at: new Date().toISOString(),
        reported_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ==================== HELPERS ====================

  async getRoutes(organizationId: number) {
    const { data, error } = await supabase
      .from('transport_routes')
      .select('id, name, code, route_type, is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getVehicles(organizationId: number) {
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, plate, vehicle_type, brand, model, passenger_capacity, status')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('plate');

    if (error) throw error;
    return data || [];
  }

  async getDrivers(organizationId: number) {
    const { data, error } = await supabase
      .from('driver_credentials')
      .select(`
        id,
        is_active,
        employments!inner(
          id,
          organization_members!inner(
            organization_id,
            profiles(first_name, last_name)
          )
        )
      `)
      .eq('employments.organization_members.organization_id', organizationId)
      .eq('is_active', true);

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((d: any) => {
      const emp = Array.isArray(d.employments) ? d.employments[0] : d.employments;
      const orgMember = emp?.organization_members;
      const member = Array.isArray(orgMember) ? orgMember[0] : orgMember;
      const profile = member?.profiles;
      const prof = Array.isArray(profile) ? profile[0] : profile;
      return {
        id: d.id,
        name: prof ? `${prof.first_name || ''} ${prof.last_name || ''}`.trim() || 'Sin nombre' : 'Sin nombre',
      };
    });
  }

  async getBranches(organizationId: number) {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // ==================== ESTADÍSTICAS ====================

  async getTripStats(organizationId: number, date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('trips')
      .select('status, total_seats, available_seats')
      .eq('organization_id', organizationId)
      .eq('trip_date', targetDate);

    if (error) throw error;

    const trips = data || [];
    const totalSeats = trips.reduce((sum, t) => sum + (t.total_seats || 0), 0);
    const availableSeats = trips.reduce((sum, t) => sum + (t.available_seats || 0), 0);

    return {
      total: trips.length,
      scheduled: trips.filter(t => t.status === 'scheduled').length,
      boarding: trips.filter(t => t.status === 'boarding').length,
      in_transit: trips.filter(t => t.status === 'in_transit').length,
      completed: trips.filter(t => t.status === 'completed').length,
      cancelled: trips.filter(t => t.status === 'cancelled').length,
      occupancy: totalSeats > 0 ? Math.round(((totalSeats - availableSeats) / totalSeats) * 100) : 0,
    };
  }
}

export const tripsService = new TripsService();
export default tripsService;
