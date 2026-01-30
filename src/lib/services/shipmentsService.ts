import { supabase } from '@/lib/supabase/config';

export interface ShipmentWithDetails {
  id: string;
  organization_id: number;
  branch_id?: number;
  source_type?: string;
  source_id?: string;
  shipment_number?: string;
  tracking_number?: string;
  customer_id?: string;
  address_id?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_department?: string;
  delivery_postal_code?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_contact_name?: string;
  delivery_contact_phone?: string;
  delivery_instructions?: string;
  carrier_id?: string;
  service_level?: string;
  external_tracking_url?: string;
  package_count?: number;
  weight_kg?: number;
  volume_m3?: number;
  declared_value?: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  shipping_fee?: number;
  insurance_fee?: number;
  cod_amount?: number;
  total_cost?: number;
  currency?: string;
  expected_pickup_date?: string;
  expected_delivery_date?: string;
  picked_at?: string;
  dispatched_at?: string;
  delivered_at?: string;
  status?: 'pending' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned' | 'cancelled' | 'received' | 'arrived';
  notes?: string;
  internal_notes?: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  customer?: { id: string; full_name: string; phone?: string; email?: string };
  // Compatibilidad con componentes legacy
  sender_name?: string;
  sender_phone?: string;
  sender_customer_id?: string;
  sender_address_id?: string;
  receiver_name?: string;
  receiver_phone?: string;
  receiver_customer_id?: string;
  receiver_address_id?: string;
  origin_stop_id?: string;
  destination_stop_id?: string;
  package_type?: string;
  dimensions?: { length: number; width: number; height: number };
  freight_cost?: number;
  insurance_cost?: number;
  delivery_type?: string;
  is_fragile?: boolean;
  requires_signature?: boolean;
  received_at?: string;
  arrived_at?: string;
  payment_status?: 'pending' | 'paid' | 'cod' | 'cancelled';
  origin_stop?: { id: string; name: string; city?: string };
  destination_stop?: { id: string; name: string; city?: string };
  sender_customer?: { id: string; full_name: string; phone?: string; email?: string };
  receiver_customer?: { id: string; full_name: string; phone?: string; email?: string };
}

export interface ShipmentFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

class ShipmentsService {
  async getShipments(organizationId: number, filters?: ShipmentFilters): Promise<ShipmentWithDetails[]> {
    let query = supabase
      .from('shipments')
      .select(`
        *,
        customer:customers(id, full_name, phone, email)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.dateFrom) {
      query = query.gte('created_at', `${filters.dateFrom}T00:00:00`);
    }
    if (filters?.dateTo) {
      query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
    }

    const { data, error } = await query.limit(500);
    if (error) throw error;

    let results = (data || []) as ShipmentWithDetails[];

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      results = results.filter((s) =>
        s.shipment_number?.toLowerCase().includes(search) ||
        s.tracking_number?.toLowerCase().includes(search) ||
        s.delivery_contact_name?.toLowerCase().includes(search) ||
        s.delivery_contact_phone?.includes(search) ||
        s.delivery_city?.toLowerCase().includes(search)
      );
    }

    return results;
  }

  async getShipmentById(id: string): Promise<ShipmentWithDetails | null> {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        customer:customers(id, full_name, phone, email)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as ShipmentWithDetails;
  }

  async createShipment(shipment: Partial<ShipmentWithDetails>): Promise<ShipmentWithDetails> {
    if (!shipment.tracking_number) {
      const random = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      shipment.tracking_number = `SHP${random}`;
    }

    const { data, error } = await supabase
      .from('shipments')
      .insert(shipment)
      .select()
      .single();

    if (error) throw error;
    return data as ShipmentWithDetails;
  }

  async updateShipment(id: string, updates: Partial<ShipmentWithDetails>): Promise<ShipmentWithDetails> {
    const { data, error } = await supabase
      .from('shipments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as ShipmentWithDetails;
  }

  async deleteShipment(id: string): Promise<void> {
    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async updateStatus(id: string, status: ShipmentWithDetails['status']): Promise<ShipmentWithDetails> {
    const updates: Partial<ShipmentWithDetails> = { status };
    const now = new Date().toISOString();

    switch (status) {
      case 'picked_up':
        updates.picked_at = now;
        break;
      case 'in_transit':
        updates.dispatched_at = now;
        break;
      case 'delivered':
        updates.delivered_at = now;
        break;
    }

    return this.updateShipment(id, updates);
  }

  async getShipmentStats(organizationId: number) {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('shipments')
      .select('status, total_cost')
      .eq('organization_id', organizationId)
      .gte('created_at', `${today}T00:00:00`);

    if (error) throw error;

    const shipments = data || [];
    return {
      total: shipments.length,
      pending: shipments.filter((s) => s.status === 'pending').length,
      pickedUp: shipments.filter((s) => s.status === 'picked_up').length,
      inTransit: shipments.filter((s) => s.status === 'in_transit').length,
      delivered: shipments.filter((s) => s.status === 'delivered').length,
      cancelled: shipments.filter((s) => s.status === 'cancelled').length,
      revenue: shipments.filter((s) => s.status === 'delivered').reduce((sum, s) => sum + (Number(s.total_cost) || 0), 0),
    };
  }

  async getTrips(organizationId: number) {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('trips')
      .select('id, trip_code, trip_date, transport_routes(name)')
      .eq('organization_id', organizationId)
      .gte('trip_date', today)
      .order('trip_date', { ascending: true })
      .limit(100);

    if (error) throw error;
    return data || [];
  }

  async getShipmentEvents(shipmentId: string) {
    const { data, error } = await supabase
      .from('transport_events')
      .select(`
        *,
        transport_stops(id, name, city)
      `)
      .eq('shipment_id', shipmentId)
      .order('event_time', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async createEvent(shipmentId: string, eventData: { event_type: string; description?: string; location_text?: string }) {
    const { data, error } = await supabase
      .from('transport_events')
      .insert({
        reference_type: 'shipment',
        reference_id: shipmentId,
        event_type: eventData.event_type,
        description: eventData.description,
        location_text: eventData.location_text,
        event_time: new Date().toISOString(),
        actor_type: 'user',
        source: 'internal',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
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

  async getCarriers(organizationId: number) {
    const { data, error } = await supabase
      .from('transport_carriers')
      .select('id, name, code, contact_phone')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async searchCustomers(organizationId: number, query: string) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, email, phone, identification_number, address, city')
      .eq('organization_id', organizationId)
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,identification_number.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(10);

    if (error) throw error;
    return data || [];
  }

  async duplicateShipment(id: string, organizationId: number): Promise<ShipmentWithDetails> {
    const original = await this.getShipmentById(id);
    if (!original) throw new Error('Envío no encontrado');

    const random = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');

    const { data, error } = await supabase
      .from('shipments')
      .insert({
        organization_id: organizationId,
        source_type: original.source_type || 'manual',
        shipment_number: `SHP${random}`,
        tracking_number: original.tracking_number ? `${original.tracking_number}-DUP` : undefined,
        customer_id: original.customer_id,
        delivery_address: original.delivery_address,
        delivery_city: original.delivery_city,
        delivery_department: original.delivery_department,
        delivery_contact_name: original.delivery_contact_name,
        delivery_contact_phone: original.delivery_contact_phone,
        delivery_instructions: original.delivery_instructions,
        carrier_id: original.carrier_id,
        service_level: original.service_level,
        package_count: original.package_count,
        weight_kg: original.weight_kg,
        declared_value: original.declared_value,
        shipping_fee: original.shipping_fee,
        insurance_fee: original.insurance_fee,
        total_cost: original.total_cost,
        currency: original.currency,
        status: 'pending',
        notes: `Duplicado de ${original.shipment_number}`,
      })
      .select()
      .single();

    if (error) throw error;
    return data as ShipmentWithDetails;
  }

  async markReturned(id: string, reason?: string): Promise<ShipmentWithDetails> {
    return this.updateShipment(id, {
      status: 'returned',
      notes: reason ? `Devuelto: ${reason}` : 'Devuelto',
    });
  }

  async updateTracking(id: string, trackingNumber: string): Promise<ShipmentWithDetails> {
    return this.updateShipment(id, { tracking_number: trackingNumber });
  }

  // ==================== SHIPMENT ITEMS ====================

  async getShipmentItems(shipmentId: string) {
    const { data, error } = await supabase
      .from('shipment_items')
      .select(`
        *,
        products(id, name, sku)
      `)
      .eq('shipment_id', shipmentId)
      .order('created_at');

    if (error) throw error;
    return data || [];
  }

  async addShipmentItem(shipmentId: string, item: {
    description: string;
    sku?: string;
    qty: number;
    unit?: string;
    unit_value?: number;
    weight_kg?: number;
    product_id?: number;
    notes?: string;
  }) {
    const total_value = (item.qty || 1) * (item.unit_value || 0);
    
    const { data, error } = await supabase
      .from('shipment_items')
      .insert({
        shipment_id: shipmentId,
        ...item,
        total_value,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateShipmentItem(itemId: string, updates: Partial<{
    description: string;
    qty: number;
    unit_value: number;
    notes: string;
  }>) {
    const { data, error } = await supabase
      .from('shipment_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteShipmentItem(itemId: string) {
    const { error } = await supabase
      .from('shipment_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
  }

  // ==================== DELIVERY ATTEMPTS ====================

  async getDeliveryAttempts(shipmentId: string) {
    const { data, error } = await supabase
      .from('delivery_attempts')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('attempt_number', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async createDeliveryAttempt(shipmentId: string, attempt: {
    status: 'successful' | 'failed' | 'partial';
    failure_reason_code?: string;
    failure_reason_text?: string;
    driver_notes?: string;
    reschedule_date?: string;
    reschedule_notes?: string;
    photo_urls?: string[];
  }) {
    const attempts = await this.getDeliveryAttempts(shipmentId);
    const attemptNumber = attempts.length + 1;

    const { data, error } = await supabase
      .from('delivery_attempts')
      .insert({
        shipment_id: shipmentId,
        attempt_number: attemptNumber,
        attempted_at: new Date().toISOString(),
        ...attempt,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ==================== PROOF OF DELIVERY ====================

  async getProofOfDelivery(shipmentId: string) {
    const { data, error } = await supabase
      .from('proof_of_delivery')
      .select('*')
      .eq('shipment_id', shipmentId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async createProofOfDelivery(shipmentId: string, pod: {
    recipient_name: string;
    recipient_doc_type?: string;
    recipient_doc_number?: string;
    recipient_relationship?: string;
    signature_url?: string;
    photo_urls?: string[];
    delivery_location_type?: string;
    notes?: string;
    customer_feedback?: string;
    customer_rating?: number;
  }) {
    const { data, error } = await supabase
      .from('proof_of_delivery')
      .insert({
        shipment_id: shipmentId,
        delivered_at: new Date().toISOString(),
        ...pod,
      })
      .select()
      .single();

    if (error) throw error;

    await this.updateStatus(shipmentId, 'delivered');

    return data;
  }

  // ==================== INCIDENTS ====================

  async getShipmentIncidents(shipmentId: string) {
    const { data, error } = await supabase
      .from('transport_incidents')
      .select('*')
      .eq('reference_type', 'shipment')
      .eq('reference_id', shipmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async createShipmentIncident(shipmentId: string, organizationId: number, incident: {
    incident_type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description?: string;
    location_description?: string;
  }) {
    const { data, error } = await supabase
      .from('transport_incidents')
      .insert({
        organization_id: organizationId,
        reference_type: 'shipment',
        reference_id: shipmentId,
        status: 'open',
        reported_at: new Date().toISOString(),
        occurred_at: new Date().toISOString(),
        ...incident,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateIncidentStatus(incidentId: string, status: string, resolution?: string) {
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    
    if (status === 'resolved') {
      updates.resolved_at = new Date().toISOString();
      if (resolution) updates.resolution_summary = resolution;
    } else if (status === 'closed') {
      updates.closed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('transport_incidents')
      .update(updates)
      .eq('id', incidentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ==================== COD PAYMENT ====================

  async registerCODPayment(shipmentId: string, organizationId: number, amount: number, paymentMethod: string = 'cash') {
    await this.updateShipment(shipmentId, { payment_status: 'paid' });
    
    await this.createEvent(shipmentId, {
      event_type: 'cod_collected',
      description: `Pago COD de ${amount} recibido (${paymentMethod})`,
    });

    return { success: true };
  }
}

export const shipmentsService = new ShipmentsService();
export default shipmentsService;
