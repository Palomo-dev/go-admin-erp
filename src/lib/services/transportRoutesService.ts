'use client';

import { supabase } from '@/lib/supabase/config';

export interface TransportRoute {
  id: string;
  organization_id: number;
  carrier_id?: string;
  name: string;
  code: string;
  route_type: 'passenger' | 'cargo' | 'mixed';
  origin_stop_id?: string;
  destination_stop_id?: string;
  estimated_distance_km?: number;
  estimated_duration_minutes?: number;
  polyline_encoded?: string;
  waypoints_json?: any[];
  base_fare?: number;
  base_shipping_fee?: number;
  currency?: string;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  origin_stop?: TransportStop;
  destination_stop?: TransportStop;
  transport_carriers?: { id: string; name: string };
  route_stops?: RouteStop[];
  _count?: { route_stops: number };
}

export interface TransportStop {
  id: string;
  organization_id: number;
  name: string;
  code?: string;
  stop_type: 'terminal' | 'station' | 'stop' | 'warehouse' | 'pickup_point';
  address?: string;
  city?: string;
  department?: string;
  country_code?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  google_place_id?: string;
  contact_name?: string;
  contact_phone?: string;
  operating_hours?: Record<string, any>;
  branch_id?: number;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RouteStop {
  id: string;
  route_id: string;
  stop_id: string;
  stop_order: number;
  estimated_arrival_minutes?: number;
  estimated_departure_minutes?: number;
  dwell_time_minutes?: number;
  fare_from_origin?: number;
  is_boarding_allowed: boolean;
  is_alighting_allowed: boolean;
  created_at: string;
  transport_stops?: TransportStop;
}

export interface RouteSchedule {
  id: string;
  organization_id: number;
  route_id: string;
  schedule_name?: string;
  recurrence_type: 'daily' | 'weekly' | 'specific_dates';
  days_of_week?: number[];
  specific_dates?: string[];
  departure_time: string;
  arrival_time?: string;
  default_vehicle_id?: string;
  default_driver_id?: string;
  available_seats?: number;
  fare_override?: number;
  valid_from: string;
  valid_until?: string;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  transport_routes?: TransportRoute;
  vehicles?: { id: string; plate_number: string; model?: string };
  driver_credentials?: { id: string; license_number: string };
}

export interface RouteInput {
  carrier_id?: string;
  name: string;
  code: string;
  route_type: 'passenger' | 'cargo' | 'mixed';
  origin_stop_id?: string;
  destination_stop_id?: string;
  estimated_distance_km?: number;
  estimated_duration_minutes?: number;
  polyline_encoded?: string;
  waypoints_json?: any[];
  base_fare?: number;
  base_shipping_fee?: number;
  currency?: string;
  is_active?: boolean;
}

export interface RouteStopInput {
  stop_id: string;
  stop_order: number;
  estimated_arrival_minutes?: number;
  estimated_departure_minutes?: number;
  dwell_time_minutes?: number;
  fare_from_origin?: number;
  is_boarding_allowed?: boolean;
  is_alighting_allowed?: boolean;
}

export interface ScheduleInput {
  route_id: string;
  schedule_name?: string;
  recurrence_type: 'daily' | 'weekly' | 'specific_dates';
  days_of_week?: number[];
  specific_dates?: string[];
  departure_time: string;
  arrival_time?: string;
  default_vehicle_id?: string;
  default_driver_id?: string;
  available_seats?: number;
  fare_override?: number;
  valid_from: string;
  valid_until?: string;
  is_active?: boolean;
}

export const transportRoutesService = {
  // ROUTES
  async getRoutes(organizationId: number) {
    const { data, error } = await supabase
      .from('transport_routes')
      .select(`
        *,
        origin_stop:transport_stops!transport_routes_origin_stop_id_fkey (id, name, city),
        destination_stop:transport_stops!transport_routes_destination_stop_id_fkey (id, name, city),
        transport_carriers (id, name),
        route_stops (id)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching routes:', error.message);
      return [];
    }
    return (data || []).map((r: any) => ({
      ...r,
      _count: { route_stops: r.route_stops?.length || 0 },
    })) as TransportRoute[];
  },

  async getRouteById(id: string) {
    const { data, error } = await supabase
      .from('transport_routes')
      .select(`
        *,
        origin_stop:transport_stops!transport_routes_origin_stop_id_fkey (*),
        destination_stop:transport_stops!transport_routes_destination_stop_id_fkey (*),
        transport_carriers (id, name),
        route_stops (
          *,
          transport_stops (*)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.warn('Error fetching route:', error.message);
      return null;
    }
    
    if (data?.route_stops) {
      data.route_stops.sort((a: RouteStop, b: RouteStop) => a.stop_order - b.stop_order);
    }
    return data as TransportRoute;
  },

  async createRoute(organizationId: number, input: RouteInput) {
    const { data, error } = await supabase
      .from('transport_routes')
      .insert({
        organization_id: organizationId,
        ...input,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as TransportRoute;
  },

  async updateRoute(id: string, input: Partial<RouteInput>) {
    const { data, error } = await supabase
      .from('transport_routes')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as TransportRoute;
  },

  async deleteRoute(id: string) {
    await supabase.from('route_stops').delete().eq('route_id', id);
    await supabase.from('route_schedules').delete().eq('route_id', id);
    
    const { error } = await supabase
      .from('transport_routes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async toggleRouteStatus(id: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('transport_routes')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as TransportRoute;
  },

  async duplicateRoute(id: string, organizationId: number) {
    const original = await this.getRouteById(id);
    if (!original) throw new Error('Ruta no encontrada');

    const { data: newRoute, error } = await supabase
      .from('transport_routes')
      .insert({
        organization_id: organizationId,
        carrier_id: original.carrier_id,
        name: `${original.name} (copia)`,
        code: `${original.code}_COPY`,
        route_type: original.route_type,
        origin_stop_id: original.origin_stop_id,
        destination_stop_id: original.destination_stop_id,
        estimated_distance_km: original.estimated_distance_km,
        estimated_duration_minutes: original.estimated_duration_minutes,
        polyline_encoded: original.polyline_encoded,
        waypoints_json: original.waypoints_json,
        base_fare: original.base_fare,
        base_shipping_fee: original.base_shipping_fee,
        currency: original.currency,
        is_active: false,
      })
      .select()
      .single();

    if (error) throw error;

    if (original.route_stops?.length) {
      const stopsToInsert = original.route_stops.map((rs) => ({
        route_id: newRoute.id,
        stop_id: rs.stop_id,
        stop_order: rs.stop_order,
        estimated_arrival_minutes: rs.estimated_arrival_minutes,
        estimated_departure_minutes: rs.estimated_departure_minutes,
        dwell_time_minutes: rs.dwell_time_minutes,
        fare_from_origin: rs.fare_from_origin,
        is_boarding_allowed: rs.is_boarding_allowed,
        is_alighting_allowed: rs.is_alighting_allowed,
      }));
      await supabase.from('route_stops').insert(stopsToInsert);
    }

    return newRoute as TransportRoute;
  },

  // ROUTE STOPS
  async addRouteStop(routeId: string, input: RouteStopInput) {
    const { data, error } = await supabase
      .from('route_stops')
      .insert({ route_id: routeId, ...input })
      .select(`*, transport_stops (*)`)
      .single();

    if (error) throw error;
    return data as RouteStop;
  },

  async updateRouteStop(id: string, input: Partial<RouteStopInput>) {
    const { data, error } = await supabase
      .from('route_stops')
      .update(input)
      .eq('id', id)
      .select(`*, transport_stops (*)`)
      .single();

    if (error) throw error;
    return data as RouteStop;
  },

  async deleteRouteStop(id: string) {
    const { error } = await supabase
      .from('route_stops')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async reorderRouteStops(routeId: string, stops: { id: string; stop_order: number }[]) {
    for (const stop of stops) {
      await supabase
        .from('route_stops')
        .update({ stop_order: stop.stop_order })
        .eq('id', stop.id);
    }
  },

  // SCHEDULES
  async getSchedules(organizationId: number) {
    const { data, error } = await supabase
      .from('route_schedules')
      .select(`
        *,
        transport_routes (id, name, code, route_type),
        vehicles (id, plate_number, model),
        driver_credentials (id, license_number)
      `)
      .eq('organization_id', organizationId)
      .order('departure_time', { ascending: true });

    if (error) {
      console.warn('Error fetching schedules:', error.message);
      return [];
    }
    return (data || []) as RouteSchedule[];
  },

  async getSchedulesByRoute(routeId: string) {
    const { data, error } = await supabase
      .from('route_schedules')
      .select(`
        *,
        vehicles (id, plate_number, model),
        driver_credentials (id, license_number)
      `)
      .eq('route_id', routeId)
      .order('departure_time', { ascending: true });

    if (error) {
      console.warn('Error fetching schedules by route:', error.message);
      return [];
    }
    return (data || []) as RouteSchedule[];
  },

  async getScheduleById(id: string) {
    const { data, error } = await supabase
      .from('route_schedules')
      .select(`
        *,
        transport_routes (*),
        vehicles (*),
        driver_credentials (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.warn('Error fetching schedule:', error.message);
      return null;
    }
    return data as RouteSchedule;
  },

  async createSchedule(organizationId: number, input: ScheduleInput) {
    const { data, error } = await supabase
      .from('route_schedules')
      .insert({
        organization_id: organizationId,
        ...input,
        is_active: input.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as RouteSchedule;
  },

  async updateSchedule(id: string, input: Partial<ScheduleInput>) {
    const { data, error } = await supabase
      .from('route_schedules')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as RouteSchedule;
  },

  async deleteSchedule(id: string) {
    const { error } = await supabase
      .from('route_schedules')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async toggleScheduleStatus(id: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('route_schedules')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as RouteSchedule;
  },

  async duplicateSchedule(id: string, organizationId: number) {
    const original = await this.getScheduleById(id);
    if (!original) throw new Error('Horario no encontrado');

    const { data, error } = await supabase
      .from('route_schedules')
      .insert({
        organization_id: organizationId,
        route_id: original.route_id,
        schedule_name: `${original.schedule_name || 'Horario'} (copia)`,
        recurrence_type: original.recurrence_type,
        days_of_week: original.days_of_week,
        specific_dates: original.specific_dates,
        departure_time: original.departure_time,
        arrival_time: original.arrival_time,
        default_vehicle_id: original.default_vehicle_id,
        default_driver_id: original.default_driver_id,
        available_seats: original.available_seats,
        fare_override: original.fare_override,
        valid_from: original.valid_from,
        valid_until: original.valid_until,
        is_active: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data as RouteSchedule;
  },

  // STOPS (helpers)
  async getStops(organizationId: number) {
    const { data, error } = await supabase
      .from('transport_stops')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.warn('Error fetching stops:', error.message);
      return [];
    }
    return (data || []) as TransportStop[];
  },

  async getCarriers(organizationId: number) {
    const { data, error } = await supabase
      .from('transport_carriers')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.warn('Error fetching carriers:', error.message);
      return [];
    }
    return data || [];
  },

  async getVehicles(organizationId: number) {
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, plate_number, model, capacity_passengers')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('plate_number', { ascending: true });

    if (error) {
      console.warn('Error fetching vehicles:', error.message);
      return [];
    }
    return data || [];
  },

  async getDrivers(organizationId: number) {
    const { data, error } = await supabase
      .from('driver_credentials')
      .select('id, license_number, license_category')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('license_number', { ascending: true });

    if (error) {
      console.warn('Error fetching drivers:', error.message);
      return [];
    }
    return data || [];
  },

  // TRIPS (lectura)
  async getTripsByRoute(routeId: string, limit = 20) {
    const { data, error } = await supabase
      .from('trips')
      .select(`
        id,
        trip_date,
        departure_time,
        status,
        vehicles (plate_number),
        driver_credentials (license_number)
      `)
      .eq('route_id', routeId)
      .order('trip_date', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Error fetching trips by route:', error.message);
      return [];
    }
    return data || [];
  },

  // GENERAR VIAJES DESDE HORARIOS
  async generateTripsFromSchedule(
    schedule: RouteSchedule,
    startDate: string,
    endDate: string,
    organizationId: number
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const result = { created: 0, skipped: 0, errors: [] as string[] };
    const dates = this.getScheduleDates(schedule, startDate, endDate);

    for (const date of dates) {
      try {
        // Verificar si ya existe un viaje para esta fecha y horario
        const { data: existingTrip } = await supabase
          .from('trips')
          .select('id')
          .eq('route_id', schedule.route_id)
          .eq('trip_date', date)
          .eq('scheduled_departure', `${date}T${schedule.departure_time}`)
          .single();

        if (existingTrip) {
          result.skipped++;
          continue;
        }

        // Obtener datos de la ruta
        const { data: route } = await supabase
          .from('transport_routes')
          .select('base_fare, estimated_duration_minutes')
          .eq('id', schedule.route_id)
          .single();

        // Calcular hora de llegada
        let scheduledArrival = null;
        if (schedule.arrival_time) {
          scheduledArrival = `${date}T${schedule.arrival_time}`;
        } else if (route?.estimated_duration_minutes) {
          const departure = new Date(`${date}T${schedule.departure_time}`);
          departure.setMinutes(departure.getMinutes() + route.estimated_duration_minutes);
          scheduledArrival = departure.toISOString();
        }

        // Obtener capacidad del vehículo si no hay cupos definidos
        let totalSeats = schedule.available_seats;
        if (!totalSeats && schedule.default_vehicle_id) {
          const { data: vehicle } = await supabase
            .from('vehicles')
            .select('passenger_capacity')
            .eq('id', schedule.default_vehicle_id)
            .single();
          totalSeats = vehicle?.passenger_capacity || 0;
        }

        // Generar código único para el viaje
        const tripCode = `TRP-${schedule.route_id.substring(0, 4).toUpperCase()}-${date.replace(/-/g, '')}-${schedule.departure_time.replace(':', '')}`;

        // Crear el viaje
        const { error: insertError } = await supabase
          .from('trips')
          .insert({
            organization_id: organizationId,
            route_id: schedule.route_id,
            schedule_id: schedule.id,
            trip_code: tripCode,
            trip_date: date,
            scheduled_departure: `${date}T${schedule.departure_time}`,
            scheduled_arrival: scheduledArrival,
            vehicle_id: schedule.default_vehicle_id,
            driver_id: schedule.default_driver_id,
            total_seats: totalSeats || 0,
            available_seats: totalSeats || 0,
            base_fare: schedule.fare_override || route?.base_fare || 0,
            status: 'scheduled',
          });

        if (insertError) {
          result.errors.push(`${date}: ${insertError.message}`);
        } else {
          result.created++;
        }
      } catch (err) {
        result.errors.push(`${date}: Error inesperado`);
      }
    }

    return result;
  },

  // Obtener fechas según tipo de recurrencia
  getScheduleDates(schedule: RouteSchedule, startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const validFrom = new Date(schedule.valid_from);
    const validUntil = schedule.valid_until ? new Date(schedule.valid_until) : null;

    // Ajustar fechas según vigencia del horario
    if (start < validFrom) start.setTime(validFrom.getTime());
    if (validUntil && end > validUntil) end.setTime(validUntil.getTime());

    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();

      switch (schedule.recurrence_type) {
        case 'daily':
          dates.push(dateStr);
          break;
        case 'weekly':
          if (schedule.days_of_week?.includes(dayOfWeek)) {
            dates.push(dateStr);
          }
          break;
        case 'specific_dates':
          if (schedule.specific_dates?.includes(dateStr)) {
            dates.push(dateStr);
          }
          break;
      }

      current.setDate(current.getDate() + 1);
    }

    return dates;
  },

  // Validar disponibilidad de vehículo/conductor
  async checkAvailability(
    vehicleId: string | undefined,
    driverId: string | undefined,
    date: string,
    departureTime: string,
    arrivalTime: string | undefined,
    excludeScheduleId?: string
  ): Promise<{ vehicleAvailable: boolean; driverAvailable: boolean; conflicts: string[] }> {
    const conflicts: string[] = [];
    let vehicleAvailable = true;
    let driverAvailable = true;

    // Verificar conflictos de vehículo
    if (vehicleId) {
      const { data: vehicleConflicts } = await supabase
        .from('trips')
        .select('id, trip_code, scheduled_departure, scheduled_arrival')
        .eq('vehicle_id', vehicleId)
        .eq('trip_date', date)
        .neq('status', 'cancelled');

      if (vehicleConflicts && vehicleConflicts.length > 0) {
        for (const trip of vehicleConflicts) {
          if (this.timesOverlap(departureTime, arrivalTime, trip.scheduled_departure, trip.scheduled_arrival)) {
            vehicleAvailable = false;
            conflicts.push(`Vehículo ocupado en viaje ${trip.trip_code}`);
          }
        }
      }
    }

    // Verificar conflictos de conductor
    if (driverId) {
      const { data: driverConflicts } = await supabase
        .from('trips')
        .select('id, trip_code, scheduled_departure, scheduled_arrival')
        .eq('driver_id', driverId)
        .eq('trip_date', date)
        .neq('status', 'cancelled');

      if (driverConflicts && driverConflicts.length > 0) {
        for (const trip of driverConflicts) {
          if (this.timesOverlap(departureTime, arrivalTime, trip.scheduled_departure, trip.scheduled_arrival)) {
            driverAvailable = false;
            conflicts.push(`Conductor ocupado en viaje ${trip.trip_code}`);
          }
        }
      }
    }

    return { vehicleAvailable, driverAvailable, conflicts };
  },

  // Helper para verificar solapamiento de horarios
  timesOverlap(
    start1: string,
    end1: string | undefined,
    start2: string,
    end2: string | undefined
  ): boolean {
    const getTime = (t: string) => {
      const timePart = t.includes('T') ? t.split('T')[1].substring(0, 5) : t.substring(0, 5);
      const [h, m] = timePart.split(':').map(Number);
      return h * 60 + m;
    };

    const s1 = getTime(start1);
    const e1 = end1 ? getTime(end1) : s1 + 120; // Asumir 2 horas si no hay hora de llegada
    const s2 = getTime(start2);
    const e2 = end2 ? getTime(end2) : s2 + 120;

    return s1 < e2 && s2 < e1;
  },
};
