<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/lib/services/trackingService.ts
import { supabase } from '@/lib/supabase/config';

export interface TrackingEvent {
  id: string;
  reference_type: 'trip' | 'shipment';
  reference_id: string;
  event_type: string;
  event_time: string;
  stop_id?: string;
  latitude?: number;
  longitude?: number;
  location_text?: string;
  actor_type: string;
  actor_id?: string;
  description?: string;
  payload?: Record<string, unknown>;
  created_at: string;
  sequence?: number;
  external_event_id?: string;
  source?: string;
  transport_stops?: {
    id: string;
    name: string;
    city: string;
  };
  actor_profile?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  reference_data?: {
    code: string;
    status: string;
    origin?: string;
    destination?: string;
  };
}

export interface TrackingFilters {
  reference_type?: 'trip' | 'shipment' | 'all';
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface TrackingStats {
  totalEvents: number;
  tripEvents: number;
  shipmentEvents: number;
  todayEvents: number;
  stoppedItems: number;
}

class TrackingService {
  async getTrackingEvents(organizationId: number, filters: TrackingFilters = {}): Promise<TrackingEvent[]> {
    let query = supabase
      .from('transport_events')
      .select(`
        *,
        transport_stops(id, name, city)
      `)
      .order('event_time', { ascending: false })
      .order('sequence', { ascending: false })
      .limit(200);

    if (filters.reference_type && filters.reference_type !== 'all') {
      query = query.eq('reference_type', filters.reference_type);
    }

    if (filters.dateFrom) {
      query = query.gte('event_time', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('event_time', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) throw error;

    const events = data || [];

    const enrichedEvents = await this.enrichEventsWithReferences(events, organizationId);

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return enrichedEvents.filter(e => 
        e.reference_data?.code?.toLowerCase().includes(searchLower) ||
        e.description?.toLowerCase().includes(searchLower) ||
        e.location_text?.toLowerCase().includes(searchLower)
      );
    }

    return enrichedEvents;
  }

  private async enrichEventsWithReferences(events: TrackingEvent[], organizationId: number): Promise<TrackingEvent[]> {
    const tripIds = Array.from(new Set(events.filter(e => e.reference_type === 'trip').map(e => e.reference_id)));
    const shipmentIds = Array.from(new Set(events.filter(e => e.reference_type === 'shipment').map(e => e.reference_id)));

    const [tripsResult, shipmentsResult] = await Promise.all([
      tripIds.length > 0 ? supabase
        .from('trips')
        .select('id, trip_code, status, transport_routes(origin_stop:transport_stops!origin_stop_id(name), destination_stop:transport_stops!destination_stop_id(name))')
        .eq('organization_id', organizationId)
        .in('id', tripIds) : { data: [] },
      shipmentIds.length > 0 ? supabase
        .from('shipments')
        .select('id, tracking_number, status, origin_stop:transport_stops!origin_stop_id(name), destination_stop:transport_stops!destination_stop_id(name)')
        .eq('organization_id', organizationId)
        .in('id', shipmentIds) : { data: [] },
    ]);

    const tripsMap = new Map((tripsResult.data || []).map((t: Record<string, unknown>) => [t.id, t]));
    const shipmentsMap = new Map((shipmentsResult.data || []).map((s: Record<string, unknown>) => [s.id, s]));

    return events.map(event => {
      if (event.reference_type === 'trip') {
        const trip = tripsMap.get(event.reference_id) as Record<string, unknown> | undefined;
        if (trip) {
          const route = trip.transport_routes as Record<string, { name: string }> | undefined;
          event.reference_data = {
            code: trip.trip_code as string,
            status: trip.status as string,
            origin: route?.origin_stop?.name,
            destination: route?.destination_stop?.name,
          };
        }
      } else if (event.reference_type === 'shipment') {
        const shipment = shipmentsMap.get(event.reference_id) as Record<string, unknown> | undefined;
        if (shipment) {
          event.reference_data = {
            code: shipment.tracking_number as string,
            status: shipment.status as string,
            origin: (shipment.origin_stop as { name: string })?.name,
            destination: (shipment.destination_stop as { name: string })?.name,
          };
        }
      }
      return event;
    });
  }

  async getTrackingStats(organizationId: number): Promise<TrackingStats> {
    const today = new Date().toISOString().split('T')[0];

    const [allEventsResult, todayEventsResult, stoppedTripsResult, stoppedShipmentsResult] = await Promise.all([
      supabase.from('transport_events').select('reference_type', { count: 'exact', head: true }),
      supabase.from('transport_events').select('id', { count: 'exact', head: true }).gte('event_time', today),
      supabase.from('trips').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', ['delayed', 'incident']),
      supabase.from('shipments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', ['pending', 'received']),
    ]);

    const tripEventsResult = await supabase.from('transport_events').select('id', { count: 'exact', head: true }).eq('reference_type', 'trip');
    const shipmentEventsResult = await supabase.from('transport_events').select('id', { count: 'exact', head: true }).eq('reference_type', 'shipment');

    return {
      totalEvents: allEventsResult.count || 0,
      tripEvents: tripEventsResult.count || 0,
      shipmentEvents: shipmentEventsResult.count || 0,
      todayEvents: todayEventsResult.count || 0,
      stoppedItems: (stoppedTripsResult.count || 0) + (stoppedShipmentsResult.count || 0),
    };
  }

  async registerEvent(event: {
    reference_type: 'trip' | 'shipment';
    reference_id: string;
    event_type: string;
    description?: string;
    location_text?: string;
    stop_id?: string;
    latitude?: number;
    longitude?: number;
    actor_id?: string;
    external_event_id?: string;
    source?: string;
  }): Promise<TrackingEvent> {
    if (event.external_event_id) {
      const { data: existing } = await supabase
        .from('transport_events')
        .select('id')
        .eq('external_event_id', event.external_event_id)
        .maybeSingle();

      if (existing) {
        throw new Error('Evento externo ya registrado (duplicado)');
      }
    }

    const { data: lastEvent } = await supabase
      .from('transport_events')
      .select('sequence')
      .eq('reference_type', event.reference_type)
      .eq('reference_id', event.reference_id)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSequence = (lastEvent?.sequence || 0) + 1;

    const { data, error } = await supabase
      .from('transport_events')
      .insert({
        ...event,
        event_time: new Date().toISOString(),
        actor_type: event.actor_id ? 'user' : 'system',
        sequence: nextSequence,
        source: event.source || 'manual',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getEventsByReference(referenceType: 'trip' | 'shipment', referenceId: string): Promise<TrackingEvent[]> {
    const { data, error } = await supabase
      .from('transport_events')
      .select(`
        *,
        transport_stops(id, name, city)
      `)
      .eq('reference_type', referenceType)
      .eq('reference_id', referenceId)
      .order('event_time', { ascending: true })
      .order('sequence', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getStoppedItems(organizationId: number): Promise<Array<{ type: 'trip' | 'shipment'; id: string; code: string; status: string; lastEvent?: TrackingEvent; stoppedSince?: string; reason?: string }>> {
    const [stoppedTrips, stoppedShipments] = await Promise.all([
      supabase
        .from('trips')
        .select('id, trip_code, status, updated_at')
        .eq('organization_id', organizationId)
        .in('status', ['delayed', 'incident', 'scheduled'])
        .order('updated_at', { ascending: false }),
      supabase
        .from('shipments')
        .select('id, tracking_number, status, updated_at')
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'received'])
        .order('updated_at', { ascending: false }),
    ]);

    const items: Array<{ type: 'trip' | 'shipment'; id: string; code: string; status: string; stoppedSince?: string }> = [];

    (stoppedTrips.data || []).forEach((trip: Record<string, unknown>) => {
      items.push({
        type: 'trip',
        id: trip.id as string,
        code: trip.trip_code as string,
        status: trip.status as string,
        stoppedSince: trip.updated_at as string,
      });
    });

    (stoppedShipments.data || []).forEach((shipment: Record<string, unknown>) => {
      items.push({
        type: 'shipment',
        id: shipment.id as string,
        code: shipment.tracking_number as string,
        status: shipment.status as string,
        stoppedSince: shipment.updated_at as string,
      });
    });

    return items;
  }

  async searchReferences(organizationId: number, query: string): Promise<Array<{ type: 'trip' | 'shipment'; id: string; code: string; status: string }>> {
    const [trips, shipments] = await Promise.all([
      supabase
        .from('trips')
        .select('id, trip_code, status')
        .eq('organization_id', organizationId)
        .ilike('trip_code', `%${query}%`)
        .limit(10),
      supabase
        .from('shipments')
        .select('id, tracking_number, status')
        .eq('organization_id', organizationId)
        .ilike('tracking_number', `%${query}%`)
        .limit(10),
    ]);

    const results: Array<{ type: 'trip' | 'shipment'; id: string; code: string; status: string }> = [];

    (trips.data || []).forEach((trip: Record<string, unknown>) => {
      results.push({
        type: 'trip',
        id: trip.id as string,
        code: trip.trip_code as string,
        status: trip.status as string,
      });
    });

    (shipments.data || []).forEach((shipment: Record<string, unknown>) => {
      results.push({
        type: 'shipment',
        id: shipment.id as string,
        code: shipment.tracking_number as string,
        status: shipment.status as string,
      });
    });

    return results;
  }

  async getTransportStops(organizationId: number): Promise<Array<{ id: string; name: string; city: string }>> {
    const { data, error } = await supabase
      .from('transport_stops')
      .select('id, name, city')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  exportToCSV(events: TrackingEvent[]): string {
    const headers = ['Fecha/Hora', 'Tipo', 'Código', 'Evento', 'Ubicación', 'Descripción', 'Estado'];
    const rows = events.map(e => [
      new Date(e.event_time).toLocaleString('es-CO'),
      e.reference_type === 'trip' ? 'Viaje' : 'Envío',
      e.reference_data?.code || '-',
      e.event_type,
      e.location_text || e.transport_stops?.name || '-',
      e.description || '-',
      e.reference_data?.status || '-',
    ]);

    return [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  }
}

export const trackingService = new TrackingService();
export default trackingService;
=======
import { supabase } from '@/lib/supabase/config';

export interface TrackingEvent {
  id: string;
  reference_type: 'trip' | 'shipment';
  reference_id: string;
  event_type: string;
  event_time: string;
  stop_id?: string;
  latitude?: number;
  longitude?: number;
  location_text?: string;
  actor_type: string;
  actor_id?: string;
  description?: string;
  payload?: Record<string, unknown>;
  created_at: string;
  sequence?: number;
  external_event_id?: string;
  source?: string;
  transport_stops?: {
    id: string;
    name: string;
    city: string;
  };
  actor_profile?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  reference_data?: {
    code: string;
    status: string;
    origin?: string;
    destination?: string;
  };
}

export interface TrackingFilters {
  reference_type?: 'trip' | 'shipment' | 'all';
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface TrackingStats {
  totalEvents: number;
  tripEvents: number;
  shipmentEvents: number;
  todayEvents: number;
  stoppedItems: number;
}

class TrackingService {
  async getTrackingEvents(organizationId: number, filters: TrackingFilters = {}): Promise<TrackingEvent[]> {
    let query = supabase
      .from('transport_events')
      .select(`
        *,
        transport_stops(id, name, city)
      `)
      .order('event_time', { ascending: false })
      .order('sequence', { ascending: false })
      .limit(200);

    if (filters.reference_type && filters.reference_type !== 'all') {
      query = query.eq('reference_type', filters.reference_type);
    }

    if (filters.dateFrom) {
      query = query.gte('event_time', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('event_time', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) throw error;

    const events = data || [];

    const enrichedEvents = await this.enrichEventsWithReferences(events, organizationId);

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return enrichedEvents.filter(e => 
        e.reference_data?.code?.toLowerCase().includes(searchLower) ||
        e.description?.toLowerCase().includes(searchLower) ||
        e.location_text?.toLowerCase().includes(searchLower)
      );
    }

    return enrichedEvents;
  }

  private async enrichEventsWithReferences(events: TrackingEvent[], organizationId: number): Promise<TrackingEvent[]> {
    const tripIds = Array.from(new Set(events.filter(e => e.reference_type === 'trip').map(e => e.reference_id)));
    const shipmentIds = Array.from(new Set(events.filter(e => e.reference_type === 'shipment').map(e => e.reference_id)));

    const [tripsResult, shipmentsResult] = await Promise.all([
      tripIds.length > 0 ? supabase
        .from('trips')
        .select('id, trip_code, status, transport_routes(origin_stop:transport_stops!origin_stop_id(name), destination_stop:transport_stops!destination_stop_id(name))')
        .eq('organization_id', organizationId)
        .in('id', tripIds) : { data: [] },
      shipmentIds.length > 0 ? supabase
        .from('shipments')
        .select('id, tracking_number, status, origin_stop:transport_stops!origin_stop_id(name), destination_stop:transport_stops!destination_stop_id(name)')
        .eq('organization_id', organizationId)
        .in('id', shipmentIds) : { data: [] },
    ]);

    const tripsMap = new Map((tripsResult.data || []).map((t: Record<string, unknown>) => [t.id, t]));
    const shipmentsMap = new Map((shipmentsResult.data || []).map((s: Record<string, unknown>) => [s.id, s]));

    return events.map(event => {
      if (event.reference_type === 'trip') {
        const trip = tripsMap.get(event.reference_id) as Record<string, unknown> | undefined;
        if (trip) {
          const route = trip.transport_routes as Record<string, { name: string }> | undefined;
          event.reference_data = {
            code: trip.trip_code as string,
            status: trip.status as string,
            origin: route?.origin_stop?.name,
            destination: route?.destination_stop?.name,
          };
        }
      } else if (event.reference_type === 'shipment') {
        const shipment = shipmentsMap.get(event.reference_id) as Record<string, unknown> | undefined;
        if (shipment) {
          event.reference_data = {
            code: shipment.tracking_number as string,
            status: shipment.status as string,
            origin: (shipment.origin_stop as { name: string })?.name,
            destination: (shipment.destination_stop as { name: string })?.name,
          };
        }
      }
      return event;
    });
  }

  async getTrackingStats(organizationId: number): Promise<TrackingStats> {
    const today = new Date().toISOString().split('T')[0];

    const [allEventsResult, todayEventsResult, stoppedTripsResult, stoppedShipmentsResult] = await Promise.all([
      supabase.from('transport_events').select('reference_type', { count: 'exact', head: true }),
      supabase.from('transport_events').select('id', { count: 'exact', head: true }).gte('event_time', today),
      supabase.from('trips').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', ['delayed', 'incident']),
      supabase.from('shipments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', ['pending', 'received']),
    ]);

    const tripEventsResult = await supabase.from('transport_events').select('id', { count: 'exact', head: true }).eq('reference_type', 'trip');
    const shipmentEventsResult = await supabase.from('transport_events').select('id', { count: 'exact', head: true }).eq('reference_type', 'shipment');

    return {
      totalEvents: allEventsResult.count || 0,
      tripEvents: tripEventsResult.count || 0,
      shipmentEvents: shipmentEventsResult.count || 0,
      todayEvents: todayEventsResult.count || 0,
      stoppedItems: (stoppedTripsResult.count || 0) + (stoppedShipmentsResult.count || 0),
    };
  }

  async registerEvent(event: {
    organization_id: number;
    reference_type: 'trip' | 'shipment';
    reference_id: string;
    event_type: string;
    description?: string;
    location_text?: string;
    stop_id?: string;
    latitude?: number;
    longitude?: number;
    actor_id?: string;
    external_event_id?: string;
    source?: string;
  }): Promise<TrackingEvent> {
    if (event.external_event_id) {
      const { data: existing } = await supabase
        .from('transport_events')
        .select('id')
        .eq('external_event_id', event.external_event_id)
        .maybeSingle();

      if (existing) {
        throw new Error('Evento externo ya registrado (duplicado)');
      }
    }

    const { data: lastEvent } = await supabase
      .from('transport_events')
      .select('sequence')
      .eq('reference_type', event.reference_type)
      .eq('reference_id', event.reference_id)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSequence = (lastEvent?.sequence || 0) + 1;

    const { data, error } = await supabase
      .from('transport_events')
      .insert({
        ...event,
        event_time: new Date().toISOString(),
        actor_type: event.actor_id ? 'user' : 'system',
        sequence: nextSequence,
        source: event.source || 'manual',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getEventsByReference(referenceType: 'trip' | 'shipment', referenceId: string): Promise<TrackingEvent[]> {
    const { data, error } = await supabase
      .from('transport_events')
      .select(`
        *,
        transport_stops(id, name, city)
      `)
      .eq('reference_type', referenceType)
      .eq('reference_id', referenceId)
      .order('event_time', { ascending: true })
      .order('sequence', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getStoppedItems(organizationId: number): Promise<Array<{ type: 'trip' | 'shipment'; id: string; code: string; status: string; lastEvent?: TrackingEvent; stoppedSince?: string; reason?: string }>> {
    const [stoppedTrips, stoppedShipments] = await Promise.all([
      supabase
        .from('trips')
        .select('id, trip_code, status, updated_at')
        .eq('organization_id', organizationId)
        .in('status', ['delayed', 'incident', 'scheduled'])
        .order('updated_at', { ascending: false }),
      supabase
        .from('shipments')
        .select('id, tracking_number, status, updated_at')
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'received'])
        .order('updated_at', { ascending: false }),
    ]);

    const items: Array<{ type: 'trip' | 'shipment'; id: string; code: string; status: string; stoppedSince?: string }> = [];

    (stoppedTrips.data || []).forEach((trip: Record<string, unknown>) => {
      items.push({
        type: 'trip',
        id: trip.id as string,
        code: trip.trip_code as string,
        status: trip.status as string,
        stoppedSince: trip.updated_at as string,
      });
    });

    (stoppedShipments.data || []).forEach((shipment: Record<string, unknown>) => {
      items.push({
        type: 'shipment',
        id: shipment.id as string,
        code: shipment.tracking_number as string,
        status: shipment.status as string,
        stoppedSince: shipment.updated_at as string,
      });
    });

    return items;
  }

  async searchReferences(organizationId: number, query: string): Promise<Array<{ type: 'trip' | 'shipment'; id: string; code: string; status: string }>> {
    const [trips, shipments] = await Promise.all([
      supabase
        .from('trips')
        .select('id, trip_code, status')
        .eq('organization_id', organizationId)
        .ilike('trip_code', `%${query}%`)
        .limit(10),
      supabase
        .from('shipments')
        .select('id, tracking_number, status')
        .eq('organization_id', organizationId)
        .ilike('tracking_number', `%${query}%`)
        .limit(10),
    ]);

    const results: Array<{ type: 'trip' | 'shipment'; id: string; code: string; status: string }> = [];

    (trips.data || []).forEach((trip: Record<string, unknown>) => {
      results.push({
        type: 'trip',
        id: trip.id as string,
        code: trip.trip_code as string,
        status: trip.status as string,
      });
    });

    (shipments.data || []).forEach((shipment: Record<string, unknown>) => {
      results.push({
        type: 'shipment',
        id: shipment.id as string,
        code: shipment.tracking_number as string,
        status: shipment.status as string,
      });
    });

    return results;
  }

  async getTransportStops(organizationId: number): Promise<Array<{ id: string; name: string; city: string }>> {
    const { data, error } = await supabase
      .from('transport_stops')
      .select('id, name, city')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  exportToCSV(events: TrackingEvent[]): string {
    const headers = ['Fecha/Hora', 'Tipo', 'Código', 'Evento', 'Ubicación', 'Descripción', 'Estado'];
    const rows = events.map(e => [
      new Date(e.event_time).toLocaleString('es-CO'),
      e.reference_type === 'trip' ? 'Viaje' : 'Envío',
      e.reference_data?.code || '-',
      e.event_type,
      e.location_text || e.transport_stops?.name || '-',
      e.description || '-',
      e.reference_data?.status || '-',
    ]);

    return [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  }
}

export const trackingService = new TrackingService();
export default trackingService;
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-7192b2c7/src/lib/services/trackingService.ts
