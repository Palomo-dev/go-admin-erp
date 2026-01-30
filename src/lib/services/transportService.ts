import { supabase } from '@/lib/supabase/config';

// =====================================================
// TIPOS E INTERFACES
// =====================================================

export interface TransportCarrier {
  id: string;
  organization_id: number;
  code: string;
  name: string;
  carrier_type: 'own_fleet' | 'third_party';
  service_type: 'cargo' | 'passenger' | 'both';
  tax_id?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  city?: string;
  api_provider?: string;
  api_credentials?: Record<string, any>;
  tracking_url_template?: string;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  organization_id: number;
  carrier_id?: string;
  branch_id?: number;
  plate_number: string;
  vehicle_type: 'motorcycle' | 'car' | 'van' | 'truck' | 'minibus' | 'bus';
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  capacity_kg?: number;
  capacity_m3?: number;
  capacity_seats?: number;
  fuel_type?: string;
  vin?: string;
  soat_expiry?: string;
  tech_review_expiry?: string;
  insurance_expiry?: string;
  insurance_policy?: string;
  current_driver_id?: string;
  status: 'available' | 'in_use' | 'maintenance' | 'inactive';
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  transport_carriers?: TransportCarrier;
  branches?: { id: number; name: string };
}

export interface DriverCredential {
  id: string;
  organization_id: number;
  employment_id: string;
  license_number: string;
  license_category: string;
  license_expiry: string;
  medical_cert_expiry?: string;
  certifications?: string[];
  is_active_driver: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  employments?: {
    id: string;
    organization_members?: {
      id: number;
      profiles?: { id: string; first_name: string; last_name: string; email: string; phone?: string };
    };
  };
}

export interface TransportStop {
  id: string;
  organization_id: number;
  branch_id?: number;
  code: string;
  name: string;
  stop_type: 'terminal' | 'station' | 'warehouse' | 'stop' | 'branch' | 'customer';
  address?: string;
  city?: string;
  department?: string;
  country?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  google_place_id?: string;
  contact_name?: string;
  contact_phone?: string;
  operating_hours?: Record<string, any>;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  branches?: { id: number; name: string };
}

export interface Trip {
  id: string;
  organization_id: number;
  route_id: string;
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
  created_at: string;
  updated_at: string;
  transport_routes?: { id: string; name: string; origin_stop_id: string; destination_stop_id: string };
  vehicles?: Vehicle;
}

export interface Shipment {
  id: string;
  organization_id: number;
  shipment_number: string;
  source_type: string;
  source_id?: string;
  customer_id?: string;
  carrier_id?: string;
  tracking_number?: string;
  status: 'draft' | 'ready' | 'picked' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'returned' | 'cancelled';
  shipping_fee: number;
  cod_amount: number;
  expected_delivery_date?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
  customers?: { id: string; full_name: string; email?: string; phone?: string };
  transport_carriers?: TransportCarrier;
}

export interface TransportIncident {
  id: string;
  organization_id: number;
  reference_type: 'trip' | 'shipment' | 'manifest' | 'vehicle' | 'route';
  reference_id: string;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  status: 'open' | 'investigating' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
  assigned_to?: number;
  occurred_at: string;
  resolved_at?: string;
  sla_hours?: number;
  sla_breached: boolean;
  estimated_cost?: number;
  actual_cost?: number;
  created_at: string;
  updated_at: string;
}

export interface TransportStats {
  trips: {
    scheduled: number;
    in_transit: number;
    completed: number;
    cancelled: number;
  };
  shipments: {
    ready: number;
    in_transit: number;
    delivered: number;
    failed: number;
  };
  tickets: {
    sold_today: number;
    revenue_today: number;
    occupancy_avg: number;
  };
  incidents: {
    open: number;
    critical: number;
    sla_breached: number;
  };
}

export interface DashboardFilters {
  branchId?: string;
  carrierId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

// =====================================================
// SERVICIO PRINCIPAL
// =====================================================

class TransportService {
  // ==================== DASHBOARD ====================

  async getStatsWithFilters(organizationId: number, filters?: DashboardFilters): Promise<TransportStats> {
    const dateFrom = filters?.dateFrom 
      ? filters.dateFrom.toISOString().split('T')[0] 
      : new Date().toISOString().split('T')[0];
    const dateTo = filters?.dateTo 
      ? filters.dateTo.toISOString().split('T')[0] 
      : new Date().toISOString().split('T')[0];

    // Trips stats with filters
    let tripsQuery = supabase
      .from('trips')
      .select('status, vehicle_id, vehicles(carrier_id)')
      .eq('organization_id', organizationId)
      .gte('trip_date', dateFrom)
      .lte('trip_date', dateTo);
    
    const { data: tripsData, error: tripsError } = await tripsQuery;
    if (tripsError) console.warn('Error fetching trips stats:', tripsError.message);

    // Filter by carrier if specified
    let filteredTrips = tripsData || [];
    if (filters?.carrierId && filters.carrierId !== 'all') {
      filteredTrips = filteredTrips.filter((t: any) => 
        t.vehicles?.carrier_id === filters.carrierId
      );
    }

    const trips = {
      scheduled: filteredTrips.filter((t: any) => t.status === 'scheduled').length,
      in_transit: filteredTrips.filter((t: any) => t.status === 'in_transit' || t.status === 'boarding').length,
      completed: filteredTrips.filter((t: any) => t.status === 'completed').length,
      cancelled: filteredTrips.filter((t: any) => t.status === 'cancelled').length,
    };

    // Shipments stats with filters
    let shipmentsQuery = supabase
      .from('shipments')
      .select('status, carrier_id, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`)
      .in('status', ['ready', 'picked', 'in_transit', 'out_for_delivery', 'delivered', 'failed']);
    
    if (filters?.carrierId && filters.carrierId !== 'all') {
      shipmentsQuery = shipmentsQuery.eq('carrier_id', filters.carrierId);
    }

    const { data: shipmentsData, error: shipmentsError } = await shipmentsQuery;
    if (shipmentsError) console.warn('Error fetching shipments stats:', shipmentsError.message);

    const shipments = {
      ready: shipmentsData?.filter(s => s.status === 'ready' || s.status === 'picked').length || 0,
      in_transit: shipmentsData?.filter(s => s.status === 'in_transit' || s.status === 'out_for_delivery').length || 0,
      delivered: shipmentsData?.filter(s => s.status === 'delivered').length || 0,
      failed: shipmentsData?.filter(s => s.status === 'failed').length || 0,
    };

    // Tickets stats with filters
    const { data: ticketsData, error: ticketsError } = await supabase
      .from('trip_tickets')
      .select('total, status')
      .eq('organization_id', organizationId)
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`);
    
    if (ticketsError) console.warn('Error fetching tickets stats:', ticketsError.message);

    const soldTickets = ticketsData?.filter(t => t.status !== 'cancelled') || [];
    const tickets = {
      sold_today: soldTickets.length,
      revenue_today: soldTickets.reduce((sum, t) => sum + (Number(t.total) || 0), 0),
      occupancy_avg: 0,
    };

    // Calculate occupancy
    if (filteredTrips.length > 0) {
      const { data: tripsWithSeats } = await supabase
        .from('trips')
        .select('total_seats, available_seats')
        .eq('organization_id', organizationId)
        .gte('trip_date', dateFrom)
        .lte('trip_date', dateTo);
      
      if (tripsWithSeats && tripsWithSeats.length > 0) {
        const totalSeats = tripsWithSeats.reduce((sum, t) => sum + (t.total_seats || 0), 0);
        const availableSeats = tripsWithSeats.reduce((sum, t) => sum + (t.available_seats || 0), 0);
        tickets.occupancy_avg = totalSeats > 0 ? Math.round(((totalSeats - availableSeats) / totalSeats) * 100) : 0;
      }
    }

    // Incidents stats
    const { data: incidentsData, error: incidentsError } = await supabase
      .from('transport_incidents')
      .select('status, severity, sla_breached')
      .eq('organization_id', organizationId)
      .in('status', ['open', 'investigating', 'in_progress']);
    
    if (incidentsError) console.warn('Error fetching incidents stats:', incidentsError.message);

    const incidents = {
      open: incidentsData?.length || 0,
      critical: incidentsData?.filter(i => i.severity === 'critical').length || 0,
      sla_breached: incidentsData?.filter(i => i.sla_breached).length || 0,
    };

    return { trips, shipments, tickets, incidents };
  }

  async getStats(organizationId: number): Promise<TransportStats> {
    const today = new Date().toISOString().split('T')[0];

    // Trips stats
    const { data: tripsData, error: tripsError } = await supabase
      .from('trips')
      .select('status')
      .eq('organization_id', organizationId)
      .gte('trip_date', today);
    
    if (tripsError) console.warn('Error fetching trips stats:', tripsError.message);

    const trips = {
      scheduled: tripsData?.filter(t => t.status === 'scheduled').length || 0,
      in_transit: tripsData?.filter(t => t.status === 'in_transit' || t.status === 'boarding').length || 0,
      completed: tripsData?.filter(t => t.status === 'completed').length || 0,
      cancelled: tripsData?.filter(t => t.status === 'cancelled').length || 0,
    };

    // Shipments stats
    const { data: shipmentsData, error: shipmentsError } = await supabase
      .from('shipments')
      .select('status')
      .eq('organization_id', organizationId)
      .in('status', ['ready', 'picked', 'in_transit', 'out_for_delivery', 'delivered', 'failed']);
    
    if (shipmentsError) console.warn('Error fetching shipments stats:', shipmentsError.message);

    const shipments = {
      ready: shipmentsData?.filter(s => s.status === 'ready' || s.status === 'picked').length || 0,
      in_transit: shipmentsData?.filter(s => s.status === 'in_transit' || s.status === 'out_for_delivery').length || 0,
      delivered: shipmentsData?.filter(s => s.status === 'delivered').length || 0,
      failed: shipmentsData?.filter(s => s.status === 'failed').length || 0,
    };

    // Tickets stats
    const { data: ticketsData, error: ticketsError } = await supabase
      .from('trip_tickets')
      .select('total, status')
      .eq('organization_id', organizationId)
      .gte('created_at', `${today}T00:00:00`);
    
    if (ticketsError) console.warn('Error fetching tickets stats:', ticketsError.message);

    const soldTickets = ticketsData?.filter(t => t.status !== 'cancelled') || [];
    const tickets = {
      sold_today: soldTickets.length,
      revenue_today: soldTickets.reduce((sum, t) => sum + (Number(t.total) || 0), 0),
      occupancy_avg: 0,
    };

    // Calculate occupancy
    if (tripsData && tripsData.length > 0) {
      const { data: tripsWithSeats } = await supabase
        .from('trips')
        .select('total_seats, available_seats')
        .eq('organization_id', organizationId)
        .eq('trip_date', today);
      
      if (tripsWithSeats && tripsWithSeats.length > 0) {
        const totalSeats = tripsWithSeats.reduce((sum, t) => sum + t.total_seats, 0);
        const availableSeats = tripsWithSeats.reduce((sum, t) => sum + t.available_seats, 0);
        tickets.occupancy_avg = totalSeats > 0 ? Math.round(((totalSeats - availableSeats) / totalSeats) * 100) : 0;
      }
    }

    // Incidents stats
    const { data: incidentsData, error: incidentsError } = await supabase
      .from('transport_incidents')
      .select('status, severity, sla_breached')
      .eq('organization_id', organizationId)
      .in('status', ['open', 'investigating', 'in_progress']);
    
    if (incidentsError) console.warn('Error fetching incidents stats:', incidentsError.message);

    const incidents = {
      open: incidentsData?.length || 0,
      critical: incidentsData?.filter(i => i.severity === 'critical').length || 0,
      sla_breached: incidentsData?.filter(i => i.sla_breached).length || 0,
    };

    return { trips, shipments, tickets, incidents };
  }

  async getRecentEvents(organizationId: number, limit: number = 10) {
    const { data, error } = await supabase
      .from('transport_events')
      .select(`
        id, reference_type, reference_id, event_type, event_time,
        latitude, longitude, location_text, description
      `)
      .eq('organization_id', organizationId)
      .order('event_time', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Error fetching recent events:', error.message);
      return [];
    }
    return data || [];
  }

  // ==================== CARRIERS ====================

  async getCarriers(organizationId: number) {
    const { data, error } = await supabase
      .from('transport_carriers')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');

    if (error) {
      console.warn('Error fetching carriers:', error.message);
      return [];
    }
    return (data || []) as TransportCarrier[];
  }

  async getCarrierById(id: string) {
    const { data, error } = await supabase
      .from('transport_carriers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as TransportCarrier;
  }

  async createCarrier(carrier: Partial<TransportCarrier>) {
    const { data, error } = await supabase
      .from('transport_carriers')
      .insert(carrier)
      .select()
      .single();

    if (error) throw error;
    return data as TransportCarrier;
  }

  async updateCarrier(id: string, updates: Partial<TransportCarrier>) {
    const { data, error } = await supabase
      .from('transport_carriers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as TransportCarrier;
  }

  async deleteCarrier(id: string) {
    const { error } = await supabase
      .from('transport_carriers')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ==================== VEHICLES ====================

  async getVehicles(organizationId: number) {
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
        *,
        transport_carriers(id, name, code),
        branches(id, name)
      `)
      .eq('organization_id', organizationId)
      .order('plate_number');

    if (error) {
      console.warn('Error fetching vehicles:', error.message);
      return [];
    }
    return (data || []) as Vehicle[];
  }

  async getVehicleById(id: string) {
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
        *,
        transport_carriers(id, name, code),
        branches(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Vehicle;
  }

  async createVehicle(vehicle: Partial<Vehicle>) {
    const { data, error } = await supabase
      .from('vehicles')
      .insert(vehicle)
      .select()
      .single();

    if (error) throw error;
    return data as Vehicle;
  }

  async updateVehicle(id: string, updates: Partial<Vehicle>) {
    const { data, error } = await supabase
      .from('vehicles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Vehicle;
  }

  async deleteVehicle(id: string) {
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async getVehiclesWithExpiringDocs(organizationId: number, daysAhead: number = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const dateStr = futureDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(`soat_expiry.lte.${dateStr},tech_review_expiry.lte.${dateStr},insurance_expiry.lte.${dateStr}`);

    if (error) throw error;
    return data as Vehicle[];
  }

  async getVehicleTrips(vehicleId: string) {
    const { data, error } = await supabase
      .from('trips')
      .select(`
        *,
        transport_routes(id, name, origin_stop_id, destination_stop_id)
      `)
      .eq('vehicle_id', vehicleId)
      .order('trip_date', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('Error fetching vehicle trips:', error.message);
      return [];
    }
    return (data || []) as Trip[];
  }

  async getDriverTrips(driverId: string) {
    const { data, error } = await supabase
      .from('trips')
      .select(`
        *,
        transport_routes(id, name, origin_stop_id, destination_stop_id)
      `)
      .eq('driver_id', driverId)
      .order('trip_date', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('Error fetching driver trips:', error.message);
      return [];
    }
    return (data || []) as Trip[];
  }

  // ==================== DRIVERS ====================

  async getDrivers(organizationId: number) {
    const { data, error } = await supabase
      .from('driver_credentials')
      .select(`
        *,
        employments(
          id,
          organization_members(
            id,
            profiles(id, first_name, last_name, email, phone)
          )
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching drivers:', error.message);
      return [];
    }
    return (data || []) as DriverCredential[];
  }

  async getDriverById(id: string) {
    const { data, error } = await supabase
      .from('driver_credentials')
      .select(`
        *,
        employments(
          id,
          organization_members(
            id,
            profiles(id, first_name, last_name, email, phone)
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as DriverCredential;
  }

  async createDriver(driver: Partial<DriverCredential>) {
    const { data, error } = await supabase
      .from('driver_credentials')
      .insert(driver)
      .select()
      .single();

    if (error) throw error;
    return data as DriverCredential;
  }

  async updateDriver(id: string, updates: Partial<DriverCredential>) {
    const { data, error } = await supabase
      .from('driver_credentials')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as DriverCredential;
  }

  async deleteDriver(id: string) {
    const { error } = await supabase
      .from('driver_credentials')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async getDriversWithExpiringDocs(organizationId: number, daysAhead: number = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const dateStr = futureDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('driver_credentials')
      .select(`
        *,
        employments(
          id,
          organization_members(
            id,
            profiles(id, first_name, last_name)
          )
        )
      `)
      .eq('organization_id', organizationId)
      .eq('is_active_driver', true)
      .or(`license_expiry.lte.${dateStr},medical_cert_expiry.lte.${dateStr}`);

    if (error) throw error;
    return data as DriverCredential[];
  }

  // ==================== STOPS ====================

  async getStops(organizationId: number) {
    const { data, error } = await supabase
      .from('transport_stops')
      .select(`
        *,
        branches(id, name)
      `)
      .eq('organization_id', organizationId)
      .order('name');

    if (error) {
      console.warn('Error fetching stops:', error.message);
      return [];
    }
    return (data || []) as TransportStop[];
  }

  async getStopById(id: string) {
    const { data, error } = await supabase
      .from('transport_stops')
      .select(`
        *,
        branches(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as TransportStop;
  }

  async createStop(stop: Partial<TransportStop>) {
    const { data, error } = await supabase
      .from('transport_stops')
      .insert(stop)
      .select()
      .single();

    if (error) throw error;
    return data as TransportStop;
  }

  async updateStop(id: string, updates: Partial<TransportStop>) {
    const { data, error } = await supabase
      .from('transport_stops')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as TransportStop;
  }

  async deleteStop(id: string) {
    const { error } = await supabase
      .from('transport_stops')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ==================== TRIPS ====================

  async getTrips(organizationId: number, filters?: { date?: string; status?: string }) {
    let query = supabase
      .from('trips')
      .select(`
        *,
        transport_routes(id, name, origin_stop_id, destination_stop_id),
        vehicles(id, plate_number, vehicle_type)
      `)
      .eq('organization_id', organizationId)
      .order('scheduled_departure', { ascending: true });

    if (filters?.date) {
      query = query.eq('trip_date', filters.date);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Trip[];
  }

  // ==================== SHIPMENTS ====================

  async getShipments(organizationId: number, filters?: { status?: string }) {
    let query = supabase
      .from('shipments')
      .select(`
        *,
        customers(id, full_name, email, phone),
        transport_carriers(id, name, code)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Shipment[];
  }

  // ==================== INCIDENTS ====================

  async getIncidents(organizationId: number, filters?: { status?: string; severity?: string }) {
    let query = supabase
      .from('transport_incidents')
      .select('*')
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as TransportIncident[];
  }

  async createIncident(incident: Partial<TransportIncident>) {
    const { data, error } = await supabase
      .from('transport_incidents')
      .insert(incident)
      .select()
      .single();

    if (error) throw error;
    return data as TransportIncident;
  }

  // ==================== HELPERS ====================

  async getAvailableEmployeesForDriver(organizationId: number) {
    const { data, error } = await supabase
      .from('employments')
      .select(`
        id,
        organization_members!inner(
          id,
          organization_id,
          profiles(id, first_name, last_name, email)
        )
      `)
      .eq('organization_members.organization_id', organizationId)
      .eq('status', 'active');

    if (error) throw error;
    return data || [];
  }

  async getBranches(organizationId: number) {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, address, city')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }
}

export const transportService = new TransportService();
export default transportService;
