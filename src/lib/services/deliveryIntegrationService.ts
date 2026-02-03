import { supabase } from '@/lib/supabase/config';
import type { WebOrder } from './webOrdersService';

export interface DeliveryShipment {
  id: string;
  organization_id: number;
  branch_id?: number;
  source_type: string;
  source_id: string;
  shipment_number: string;
  tracking_number: string;
  customer_id?: string;
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
  expected_delivery_date?: string;
  picked_at?: string;
  dispatched_at?: string;
  delivered_at?: string;
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned' | 'cancelled';
  notes?: string;
  internal_notes?: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Relaciones
  vehicle?: DeliveryVehicle;
  driver?: DeliveryDriver;
  web_order?: WebOrder;
}

export interface DeliveryVehicle {
  id: string;
  plate: string;
  vehicle_type: string;
  brand?: string;
  model?: string;
  color?: string;
  capacity_kg?: number;
  status: 'available' | 'in_use' | 'maintenance' | 'inactive';
  current_driver_id?: string;
  current_driver?: DeliveryDriver;
}

export interface DeliveryDriver {
  id: string;
  employment_id: string;
  license_number: string;
  license_category: string;
  license_expiry: string;
  is_active: boolean;
  employee?: {
    id: string;
    first_name: string;
    last_name: string;
    phone?: string;
    photo_url?: string;
  };
}

export interface TransportEvent {
  id: string;
  reference_type: string;
  reference_id: string;
  event_type: string;
  event_time: string;
  latitude?: number;
  longitude?: number;
  location_text?: string;
  actor_type: string;
  actor_id?: string;
  description?: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface ProofOfDelivery {
  id: string;
  shipment_id: string;
  delivered_at: string;
  recipient_name: string;
  recipient_doc_type?: string;
  recipient_doc_number?: string;
  recipient_relationship?: string;
  signature_url?: string;
  photo_urls?: string[];
  latitude?: number;
  longitude?: number;
  delivery_location_type?: string;
  driver_id?: string;
  notes?: string;
  customer_feedback?: string;
  customer_rating?: number;
  created_at: string;
}

class DeliveryIntegrationService {
  /**
   * Crea un shipment automáticamente desde un web_order con delivery_type = 'delivery_own'
   */
  async createShipmentFromWebOrder(webOrder: WebOrder): Promise<DeliveryShipment> {
    if (webOrder.delivery_type !== 'delivery_own') {
      throw new Error('Solo se pueden crear shipments para pedidos con delivery propio');
    }

    // Verificar si ya existe un shipment para este pedido
    const existing = await this.getShipmentByWebOrderId(webOrder.id);
    if (existing) {
      return existing;
    }

    // Generar número de tracking
    const trackingNumber = await this.generateTrackingNumber(webOrder.organization_id);

    // Extraer datos de dirección (soporta múltiples formatos)
    const addr = (webOrder.delivery_address || {}) as Record<string, unknown>;
    
    const shipmentData = {
      organization_id: webOrder.organization_id,
      branch_id: webOrder.branch_id,
      source_type: 'web_order',
      source_id: webOrder.id,
      shipment_number: `DEL-${webOrder.order_number}`,
      tracking_number: trackingNumber,
      customer_id: webOrder.customer_id,
      delivery_address: (addr.address || addr.street || '') as string,
      delivery_city: (addr.city || '') as string,
      delivery_department: (addr.department || addr.state || addr.neighborhood || '') as string,
      delivery_postal_code: (addr.postal_code || '') as string,
      delivery_latitude: (addr.lat || addr.latitude || null) as number | null,
      delivery_longitude: (addr.lng || addr.longitude || null) as number | null,
      delivery_contact_name: webOrder.customer_name,
      delivery_contact_phone: webOrder.customer_phone,
      delivery_instructions: (addr.instructions || webOrder.customer_notes || '') as string,
      expected_delivery_date: webOrder.estimated_delivery_at || null,
      status: 'pending' as const,
      notes: `Pedido web: ${webOrder.order_number}`,
      metadata: {
        web_order_number: webOrder.order_number,
        web_order_total: webOrder.total,
        items_count: webOrder.items?.length || 0,
      },
    };

    const { data, error } = await supabase
      .from('shipments')
      .insert(shipmentData)
      .select()
      .single();

    if (error) throw error;

    // Registrar evento de creación
    await this.createTransportEvent({
      reference_type: 'shipment',
      reference_id: data.id,
      event_type: 'created',
      actor_type: 'system',
      description: `Envío creado desde pedido web ${webOrder.order_number}`,
    });

    return data as DeliveryShipment;
  }

  /**
   * Obtiene el shipment asociado a un web_order
   */
  async getShipmentByWebOrderId(webOrderId: string): Promise<DeliveryShipment | null> {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('source_type', 'web_order')
      .eq('source_id', webOrderId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as DeliveryShipment;
  }

  /**
   * Obtiene un shipment con todas sus relaciones
   */
  async getShipmentWithDetails(shipmentId: string): Promise<DeliveryShipment | null> {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        customer:customers(id, full_name, phone, email)
      `)
      .eq('id', shipmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    // Obtener vehículo asignado si existe
    if (data.metadata?.vehicle_id) {
      const vehicle = await this.getVehicleById(data.metadata.vehicle_id as string);
      if (vehicle) {
        data.vehicle = vehicle;
      }
    }

    return data as DeliveryShipment;
  }

  /**
   * Asigna un vehículo y conductor a un shipment
   */
  async assignVehicleAndDriver(
    shipmentId: string,
    vehicleId: string,
    driverId: string,
    estimatedDeliveryTime?: string
  ): Promise<DeliveryShipment> {
    // Actualizar el shipment
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .update({
        status: 'assigned',
        metadata: {
          vehicle_id: vehicleId,
          driver_id: driverId,
          assigned_at: new Date().toISOString(),
        },
        expected_delivery_date: estimatedDeliveryTime || null,
      })
      .eq('id', shipmentId)
      .select()
      .single();

    if (shipmentError) throw shipmentError;

    // Actualizar estado del vehículo
    await supabase
      .from('vehicles')
      .update({
        status: 'in_use',
        current_driver_id: driverId,
      })
      .eq('id', vehicleId);

    // Registrar evento
    await this.createTransportEvent({
      reference_type: 'shipment',
      reference_id: shipmentId,
      event_type: 'assigned',
      actor_type: 'driver',
      actor_id: driverId,
      description: 'Conductor y vehículo asignados',
      payload: { vehicle_id: vehicleId, driver_id: driverId },
    });

    return shipment as DeliveryShipment;
  }

  /**
   * Marca el shipment como recogido (inicio de delivery)
   */
  async markAsPickedUp(
    shipmentId: string,
    driverId: string,
    location?: { latitude: number; longitude: number }
  ): Promise<DeliveryShipment> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('shipments')
      .update({
        status: 'out_for_delivery',
        picked_at: now,
        dispatched_at: now,
      })
      .eq('id', shipmentId)
      .select()
      .single();

    if (error) throw error;

    // Actualizar web_order si existe
    if (data.source_type === 'web_order' && data.source_id) {
      await supabase
        .from('web_orders')
        .update({ status: 'in_delivery' })
        .eq('id', data.source_id);
    }

    // Registrar evento
    await this.createTransportEvent({
      reference_type: 'shipment',
      reference_id: shipmentId,
      event_type: 'picked_up',
      actor_type: 'driver',
      actor_id: driverId,
      latitude: location?.latitude,
      longitude: location?.longitude,
      description: 'Pedido recogido, en camino a entrega',
    });

    return data as DeliveryShipment;
  }

  /**
   * Registra la entrega exitosa
   */
  async markAsDelivered(
    shipmentId: string,
    driverId: string,
    proofData: {
      recipientName: string;
      recipientDocType?: string;
      recipientDocNumber?: string;
      recipientRelationship?: string;
      signatureUrl?: string;
      photoUrls?: string[];
      notes?: string;
      latitude?: number;
      longitude?: number;
    }
  ): Promise<{ shipment: DeliveryShipment; proof: ProofOfDelivery }> {
    const now = new Date().toISOString();

    // Actualizar shipment
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .update({
        status: 'delivered',
        delivered_at: now,
      })
      .eq('id', shipmentId)
      .select()
      .single();

    if (shipmentError) throw shipmentError;

    // Crear prueba de entrega
    const { data: proof, error: proofError } = await supabase
      .from('proof_of_delivery')
      .insert({
        shipment_id: shipmentId,
        delivered_at: now,
        recipient_name: proofData.recipientName,
        recipient_doc_type: proofData.recipientDocType,
        recipient_doc_number: proofData.recipientDocNumber,
        recipient_relationship: proofData.recipientRelationship,
        signature_url: proofData.signatureUrl,
        photo_urls: proofData.photoUrls,
        latitude: proofData.latitude,
        longitude: proofData.longitude,
        driver_id: driverId,
        notes: proofData.notes,
      })
      .select()
      .single();

    if (proofError) throw proofError;

    // Actualizar web_order si existe
    if (shipment.source_type === 'web_order' && shipment.source_id) {
      await supabase
        .from('web_orders')
        .update({
          status: 'delivered',
          delivered_at: now,
        })
        .eq('id', shipment.source_id);
    }

    // Liberar vehículo
    if (shipment.metadata?.vehicle_id) {
      await supabase
        .from('vehicles')
        .update({
          status: 'available',
          current_driver_id: null,
        })
        .eq('id', shipment.metadata.vehicle_id);
    }

    // Registrar evento
    await this.createTransportEvent({
      reference_type: 'shipment',
      reference_id: shipmentId,
      event_type: 'delivered',
      actor_type: 'driver',
      actor_id: driverId,
      latitude: proofData.latitude,
      longitude: proofData.longitude,
      description: `Entregado a ${proofData.recipientName}`,
      payload: { proof_id: proof.id },
    });

    return {
      shipment: shipment as DeliveryShipment,
      proof: proof as ProofOfDelivery,
    };
  }

  /**
   * Registra un intento de entrega fallido
   */
  async registerFailedAttempt(
    shipmentId: string,
    driverId: string,
    failureData: {
      reasonCode: string;
      reasonText: string;
      rescheduleDate?: string;
      notes?: string;
      photoUrls?: string[];
      latitude?: number;
      longitude?: number;
    }
  ): Promise<void> {
    // Contar intentos previos
    const { count } = await supabase
      .from('delivery_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('shipment_id', shipmentId);

    const attemptNumber = (count || 0) + 1;

    // Registrar intento
    await supabase.from('delivery_attempts').insert({
      shipment_id: shipmentId,
      attempt_number: attemptNumber,
      status: 'failed',
      failure_reason_code: failureData.reasonCode,
      failure_reason_text: failureData.reasonText,
      reschedule_date: failureData.rescheduleDate,
      reschedule_notes: failureData.notes,
      photo_urls: failureData.photoUrls,
      latitude: failureData.latitude,
      longitude: failureData.longitude,
      driver_id: driverId,
    });

    // Registrar evento
    await this.createTransportEvent({
      reference_type: 'shipment',
      reference_id: shipmentId,
      event_type: 'delivery_failed',
      actor_type: 'driver',
      actor_id: driverId,
      latitude: failureData.latitude,
      longitude: failureData.longitude,
      description: `Intento ${attemptNumber} fallido: ${failureData.reasonText}`,
      payload: { attempt_number: attemptNumber, reason_code: failureData.reasonCode },
    });
  }

  /**
   * Obtiene vehículos disponibles para delivery
   */
  async getAvailableVehicles(organizationId: number): Promise<DeliveryVehicle[]> {
    const { data, error } = await supabase
      .from('vehicles')
      .select(`
        *,
        current_driver:driver_credentials!vehicles_current_driver_id_fkey(
          id,
          employment_id,
          license_number,
          is_active
        )
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'available')
      .eq('is_active', true)
      .in('vehicle_type', ['motorcycle', 'car', 'van', 'bicycle']);

    if (error) throw error;
    return (data || []) as DeliveryVehicle[];
  }

  /**
   * Obtiene conductores disponibles
   */
  async getAvailableDrivers(organizationId: number): Promise<DeliveryDriver[]> {
    const { data, error } = await supabase
      .from('driver_credentials')
      .select(`
        *,
        employee:employments!driver_credentials_employment_id_fkey(
          id,
          employees(
            id,
            first_name,
            last_name,
            phone,
            photo_url
          )
        )
      `)
      .eq('is_active', true)
      .gte('license_expiry', new Date().toISOString().split('T')[0]);

    if (error) throw error;

    // Filtrar solo conductores de la organización
    // (se filtra por la relación employment -> organization_id)
    return (data || []).map(driver => ({
      ...driver,
      employee: driver.employee?.employees,
    })) as DeliveryDriver[];
  }

  /**
   * Obtiene un vehículo por ID
   */
  async getVehicleById(vehicleId: string): Promise<DeliveryVehicle | null> {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicleId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as DeliveryVehicle;
  }

  /**
   * Obtiene el historial de eventos de un shipment
   */
  async getShipmentEvents(shipmentId: string): Promise<TransportEvent[]> {
    const { data, error } = await supabase
      .from('transport_events')
      .select('*')
      .eq('reference_type', 'shipment')
      .eq('reference_id', shipmentId)
      .order('event_time', { ascending: true });

    if (error) throw error;
    return (data || []) as TransportEvent[];
  }

  /**
   * Obtiene la prueba de entrega de un shipment
   */
  async getProofOfDelivery(shipmentId: string): Promise<ProofOfDelivery | null> {
    const { data, error } = await supabase
      .from('proof_of_delivery')
      .select('*')
      .eq('shipment_id', shipmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as ProofOfDelivery;
  }

  /**
   * Obtiene entregas pendientes para un conductor
   */
  async getPendingDeliveriesForDriver(driverId: string): Promise<DeliveryShipment[]> {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        customer:customers(id, full_name, phone, email)
      `)
      .contains('metadata', { driver_id: driverId })
      .in('status', ['assigned', 'out_for_delivery'])
      .order('expected_delivery_date', { ascending: true });

    if (error) throw error;
    return (data || []) as DeliveryShipment[];
  }

  /**
   * Obtiene estadísticas de entregas
   */
  async getDeliveryStats(organizationId: number, dateFrom?: string, dateTo?: string): Promise<{
    total: number;
    pending: number;
    assigned: number;
    inTransit: number;
    delivered: number;
    failed: number;
    avgDeliveryTime: number;
  }> {
    let query = supabase
      .from('shipments')
      .select('status, picked_at, delivered_at')
      .eq('organization_id', organizationId)
      .eq('source_type', 'web_order');

    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const shipments = data || [];
    const delivered = shipments.filter(s => s.status === 'delivered');

    // Calcular tiempo promedio de entrega
    let totalDeliveryTime = 0;
    let deliveredWithTime = 0;
    delivered.forEach(s => {
      if (s.picked_at && s.delivered_at) {
        const pickTime = new Date(s.picked_at).getTime();
        const deliverTime = new Date(s.delivered_at).getTime();
        totalDeliveryTime += (deliverTime - pickTime) / 60000; // minutos
        deliveredWithTime++;
      }
    });

    return {
      total: shipments.length,
      pending: shipments.filter(s => s.status === 'pending').length,
      assigned: shipments.filter(s => s.status === 'assigned').length,
      inTransit: shipments.filter(s => s.status === 'out_for_delivery').length,
      delivered: delivered.length,
      failed: shipments.filter(s => s.status === 'returned').length,
      avgDeliveryTime: deliveredWithTime > 0 ? Math.round(totalDeliveryTime / deliveredWithTime) : 0,
    };
  }

  // Métodos privados

  private async generateTrackingNumber(organizationId: number): Promise<string> {
    const prefix = 'TRK';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  private async createTransportEvent(eventData: {
    organization_id: number;
    reference_type: string;
    reference_id: string;
    event_type: string;
    actor_type: string;
    actor_id?: string;
    latitude?: number;
    longitude?: number;
    location_text?: string;
    description?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await supabase.from('transport_events').insert({
      ...eventData,
      event_time: new Date().toISOString(),
      source: 'internal',
    });
  }
}

export const deliveryIntegrationService = new DeliveryIntegrationService();
