'use client';

import { supabase } from '@/lib/supabase/config';

// Interfaces
export interface DispatchManifest {
  id: string;
  organization_id: number;
  branch_id?: number;
  manifest_number: string;
  manifest_date: string;
  manifest_type: 'delivery' | 'pickup' | 'transfer';
  carrier_id?: string;
  vehicle_id?: string;
  driver_id?: string;
  route_id?: string;
  planned_start?: string;
  planned_end?: string;
  started_at?: string;
  completed_at?: string;
  total_shipments: number;
  total_weight_kg: number;
  total_packages: number;
  total_cod_amount: number;
  delivered_count: number;
  failed_count: number;
  pending_count: number;
  status: 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  driver_notes?: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ManifestWithDetails extends DispatchManifest {
  vehicles?: {
    id: string;
    plate: string;
    vehicle_type: string;
    brand?: string;
    model?: string;
  };
  transport_carriers?: {
    id: string;
    name: string;
    code: string;
  };
  driver_credentials?: {
    id: string;
    license_number: string;
    employments?: {
      id: string;
      profiles?: {
        full_name?: string;
      };
    };
  };
  transport_routes?: {
    id: string;
    name?: string;
    code?: string;
  };
  manifest_shipments?: ManifestShipment[];
}

export interface ManifestShipment {
  id: string;
  manifest_id: string;
  shipment_id: string;
  stop_sequence?: number;
  eta?: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'skipped';
  arrived_at?: string;
  completed_at?: string;
  failure_reason?: string;
  driver_notes?: string;
  distance_from_prev_km?: number;
  duration_from_prev_minutes?: number;
  created_at: string;
  updated_at: string;
  shipments?: {
    id: string;
    shipment_number: string;
    tracking_number?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_contact_name?: string;
    delivery_contact_phone?: string;
    weight_kg?: number;
    package_count?: number;
    cod_amount?: number;
    status?: string;
  };
}

export interface ManifestCreateInput {
  manifest_date: string;
  manifest_type?: 'delivery' | 'pickup' | 'transfer';
  carrier_id?: string;
  vehicle_id?: string;
  driver_id?: string;
  route_id?: string;
  planned_start?: string;
  planned_end?: string;
  notes?: string;
}

export interface ManifestUpdateInput {
  manifest_date?: string;
  manifest_type?: 'delivery' | 'pickup' | 'transfer';
  carrier_id?: string;
  vehicle_id?: string;
  driver_id?: string;
  route_id?: string;
  planned_start?: string;
  planned_end?: string;
  notes?: string;
  driver_notes?: string;
  status?: 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
}

export interface ManifestFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  carrierId?: string;
  vehicleId?: string;
  driverId?: string;
  search?: string;
}

class ManifestsService {
  /**
   * Genera un número único de manifiesto
   */
  private generateManifestNumber(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MAN-${year}${month}${day}-${random}`;
  }

  /**
   * Obtiene todos los manifiestos de una organización
   */
  async getManifests(organizationId: number, filters?: ManifestFilters): Promise<ManifestWithDetails[]> {
    let query = supabase
      .from('dispatch_manifests')
      .select(`
        *,
        vehicles(id, plate, vehicle_type, brand, model),
        transport_carriers(id, name, code),
        transport_routes(id, name, code)
      `)
      .eq('organization_id', organizationId)
      .order('manifest_date', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.dateFrom) {
      query = query.gte('manifest_date', filters.dateFrom);
    }

    if (filters?.dateTo) {
      query = query.lte('manifest_date', filters.dateTo);
    }

    if (filters?.carrierId) {
      query = query.eq('carrier_id', filters.carrierId);
    }

    if (filters?.vehicleId) {
      query = query.eq('vehicle_id', filters.vehicleId);
    }

    if (filters?.search) {
      query = query.ilike('manifest_number', `%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []) as ManifestWithDetails[];
  }

  /**
   * Obtiene un manifiesto por ID con todos sus detalles
   */
  async getManifestById(manifestId: string): Promise<ManifestWithDetails | null> {
    const { data, error } = await supabase
      .from('dispatch_manifests')
      .select(`
        *,
        vehicles(id, plate, vehicle_type, brand, model),
        transport_carriers(id, name, code),
        transport_routes(id, name, code),
        manifest_shipments(
          *,
          shipments(
            id, shipment_number, tracking_number, delivery_address,
            delivery_city, delivery_contact_name, delivery_contact_phone,
            weight_kg, package_count, cod_amount, status
          )
        )
      `)
      .eq('id', manifestId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as ManifestWithDetails;
  }

  /**
   * Crea un nuevo manifiesto
   */
  async createManifest(organizationId: number, input: ManifestCreateInput): Promise<ManifestWithDetails> {
    const manifestNumber = this.generateManifestNumber();

    const { data, error } = await supabase
      .from('dispatch_manifests')
      .insert({
        organization_id: organizationId,
        manifest_number: manifestNumber,
        manifest_date: input.manifest_date,
        manifest_type: input.manifest_type || 'delivery',
        carrier_id: input.carrier_id,
        vehicle_id: input.vehicle_id,
        driver_id: input.driver_id,
        route_id: input.route_id,
        planned_start: input.planned_start,
        planned_end: input.planned_end,
        notes: input.notes,
        status: 'draft',
        total_shipments: 0,
        total_weight_kg: 0,
        total_packages: 0,
        total_cod_amount: 0,
        delivered_count: 0,
        failed_count: 0,
        pending_count: 0,
      })
      .select(`
        *,
        vehicles(id, plate, vehicle_type, brand, model),
        transport_carriers(id, name, code),
        transport_routes(id, name, code)
      `)
      .single();

    if (error) throw error;
    return data as ManifestWithDetails;
  }

  /**
   * Actualiza un manifiesto
   */
  async updateManifest(manifestId: string, input: ManifestUpdateInput): Promise<ManifestWithDetails> {
    const { data, error } = await supabase
      .from('dispatch_manifests')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', manifestId)
      .select(`
        *,
        vehicles(id, plate, vehicle_type, brand, model),
        transport_carriers(id, name, code),
        transport_routes(id, name, code)
      `)
      .single();

    if (error) throw error;
    return data as ManifestWithDetails;
  }

  /**
   * Duplica un manifiesto existente
   */
  async duplicateManifest(manifestId: string): Promise<ManifestWithDetails> {
    const original = await this.getManifestById(manifestId);
    if (!original) throw new Error('Manifiesto no encontrado');

    const newManifest = await this.createManifest(original.organization_id, {
      manifest_date: new Date().toISOString().split('T')[0],
      manifest_type: original.manifest_type,
      carrier_id: original.carrier_id,
      vehicle_id: original.vehicle_id,
      driver_id: original.driver_id,
      route_id: original.route_id,
      notes: original.notes,
    });

    // Copiar los envíos si existen
    if (original.manifest_shipments && original.manifest_shipments.length > 0) {
      const shipmentsToAdd = original.manifest_shipments.map((ms) => ({
        manifest_id: newManifest.id,
        shipment_id: ms.shipment_id,
        stop_sequence: ms.stop_sequence,
        status: 'pending' as const,
      }));

      await supabase.from('manifest_shipments').insert(shipmentsToAdd);
      await this.recalculateTotals(newManifest.id);
    }

    return this.getManifestById(newManifest.id) as Promise<ManifestWithDetails>;
  }

  /**
   * Cambia el estado del manifiesto
   */
  async changeStatus(manifestId: string, newStatus: ManifestUpdateInput['status']): Promise<ManifestWithDetails> {
    const updates: Partial<DispatchManifest> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'in_progress') {
      updates.started_at = new Date().toISOString();
    } else if (newStatus === 'completed') {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('dispatch_manifests')
      .update(updates)
      .eq('id', manifestId)
      .select(`
        *,
        vehicles(id, plate, vehicle_type, brand, model),
        transport_carriers(id, name, code),
        transport_routes(id, name, code)
      `)
      .single();

    if (error) throw error;
    return data as ManifestWithDetails;
  }

  /**
   * Agrega envíos al manifiesto
   */
  async addShipments(manifestId: string, shipmentIds: string[]): Promise<void> {
    // Obtener el máximo stop_sequence actual
    const { data: existing } = await supabase
      .from('manifest_shipments')
      .select('stop_sequence')
      .eq('manifest_id', manifestId)
      .order('stop_sequence', { ascending: false })
      .limit(1);

    let nextSequence = (existing?.[0]?.stop_sequence || 0) + 1;

    const shipmentsToAdd = shipmentIds.map((shipmentId) => ({
      manifest_id: manifestId,
      shipment_id: shipmentId,
      stop_sequence: nextSequence++,
      status: 'pending',
    }));

    const { error } = await supabase.from('manifest_shipments').insert(shipmentsToAdd);
    if (error) throw error;

    await this.recalculateTotals(manifestId);
  }

  /**
   * Quita envíos del manifiesto
   */
  async removeShipments(manifestId: string, shipmentIds: string[]): Promise<void> {
    const { error } = await supabase
      .from('manifest_shipments')
      .delete()
      .eq('manifest_id', manifestId)
      .in('shipment_id', shipmentIds);

    if (error) throw error;
    await this.recalculateTotals(manifestId);
  }

  /**
   * Reordena los envíos del manifiesto
   */
  async reorderShipments(manifestId: string, orderedShipmentIds: string[]): Promise<void> {
    const updates = orderedShipmentIds.map((shipmentId, index) => ({
      manifest_id: manifestId,
      shipment_id: shipmentId,
      stop_sequence: index + 1,
    }));

    for (const update of updates) {
      await supabase
        .from('manifest_shipments')
        .update({ stop_sequence: update.stop_sequence })
        .eq('manifest_id', update.manifest_id)
        .eq('shipment_id', update.shipment_id);
    }
  }

  /**
   * Recalcula los totales del manifiesto
   */
  async recalculateTotals(manifestId: string): Promise<void> {
    const { data: shipments } = await supabase
      .from('manifest_shipments')
      .select(`
        status,
        shipments(weight_kg, package_count, cod_amount)
      `)
      .eq('manifest_id', manifestId);

    if (!shipments) return;

    let totalShipments = shipments.length;
    let totalWeightKg = 0;
    let totalPackages = 0;
    let totalCodAmount = 0;
    let deliveredCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    for (const ms of shipments) {
      const shipment = Array.isArray(ms.shipments) ? ms.shipments[0] : ms.shipments;
      if (shipment) {
        totalWeightKg += Number(shipment.weight_kg) || 0;
        totalPackages += Number(shipment.package_count) || 0;
        totalCodAmount += Number(shipment.cod_amount) || 0;
      }

      if (ms.status === 'delivered') deliveredCount++;
      else if (ms.status === 'failed') failedCount++;
      else pendingCount++;
    }

    await supabase
      .from('dispatch_manifests')
      .update({
        total_shipments: totalShipments,
        total_weight_kg: totalWeightKg,
        total_packages: totalPackages,
        total_cod_amount: totalCodAmount,
        delivered_count: deliveredCount,
        failed_count: failedCount,
        pending_count: pendingCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', manifestId);
  }

  /**
   * Obtiene envíos disponibles para agregar al manifiesto
   */
  async getAvailableShipments(organizationId: number, manifestId?: string): Promise<Array<{
    id: string;
    shipment_number: string;
    tracking_number?: string;
    delivery_address?: string;
    delivery_city?: string;
    weight_kg?: number;
  }>> {
    // Obtener IDs de envíos ya asignados a manifiestos activos
    const { data: assignedData } = await supabase
      .from('manifest_shipments')
      .select('shipment_id, dispatch_manifests!inner(status)')
      .not('dispatch_manifests.status', 'in', '(completed,cancelled)');

    const assignedIds = (assignedData || []).map((d) => d.shipment_id);

    // Obtener envíos disponibles
    let query = supabase
      .from('shipments')
      .select('id, shipment_number, tracking_number, delivery_address, delivery_city, weight_kg')
      .eq('organization_id', organizationId)
      .in('status', ['pending', 'received', 'processing'])
      .order('created_at', { ascending: false });

    if (assignedIds.length > 0) {
      query = query.not('id', 'in', `(${assignedIds.join(',')})`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene los vehículos disponibles
   */
  async getVehicles(organizationId: number): Promise<Array<{ id: string; plate: string; vehicle_type: string }>> {
    const { data, error } = await supabase
      .from('vehicles')
      .select('id, plate, vehicle_type')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('plate');

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene los carriers disponibles
   */
  async getCarriers(organizationId: number): Promise<Array<{ id: string; name: string; code: string }>> {
    const { data, error } = await supabase
      .from('transport_carriers')
      .select('id, name, code')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene las rutas disponibles
   */
  async getRoutes(organizationId: number): Promise<Array<{ id: string; name: string; code: string }>> {
    const { data, error } = await supabase
      .from('transport_routes')
      .select('id, name, code')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  /**
   * Importa manifiestos desde CSV
   */
  async importFromCSV(organizationId: number, csvData: string): Promise<{ success: number; errors: string[] }> {
    const lines = csvData.split('\n').filter((line) => line.trim());
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

    let success = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });

        if (!row.manifest_date) {
          errors.push(`Línea ${i + 1}: manifest_date es requerido`);
          continue;
        }

        await this.createManifest(organizationId, {
          manifest_date: row.manifest_date,
          manifest_type: (row.manifest_type as ManifestCreateInput['manifest_type']) || 'delivery',
          vehicle_id: row.vehicle_id || undefined,
          carrier_id: row.carrier_id || undefined,
          notes: row.notes || undefined,
        });

        success++;
      } catch (error) {
        errors.push(`Línea ${i + 1}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      }
    }

    return { success, errors };
  }

  /**
   * Elimina un manifiesto (solo si está en draft)
   */
  async deleteManifest(manifestId: string): Promise<void> {
    // Verificar que está en draft
    const { data: manifest } = await supabase
      .from('dispatch_manifests')
      .select('status')
      .eq('id', manifestId)
      .single();

    if (manifest?.status !== 'draft') {
      throw new Error('Solo se pueden eliminar manifiestos en estado borrador');
    }

    // Eliminar envíos asociados
    await supabase.from('manifest_shipments').delete().eq('manifest_id', manifestId);

    // Eliminar manifiesto
    const { error } = await supabase.from('dispatch_manifests').delete().eq('id', manifestId);
    if (error) throw error;
  }

  // ==================== DELIVERY ATTEMPTS ====================

  /**
   * Registra un intento de entrega
   */
  async createDeliveryAttempt(shipmentId: string, data: {
    status: 'delivered' | 'failed' | 'partial';
    failure_reason_code?: string;
    failure_reason_text?: string;
    latitude?: number;
    longitude?: number;
    driver_id?: string;
    driver_notes?: string;
    reschedule_date?: string;
    reschedule_notes?: string;
    photo_urls?: string[];
  }): Promise<void> {
    // Obtener el número de intento
    const { data: attempts } = await supabase
      .from('delivery_attempts')
      .select('attempt_number')
      .eq('shipment_id', shipmentId)
      .order('attempt_number', { ascending: false })
      .limit(1);

    const attemptNumber = (attempts?.[0]?.attempt_number || 0) + 1;

    const { error } = await supabase.from('delivery_attempts').insert({
      shipment_id: shipmentId,
      attempt_number: attemptNumber,
      status: data.status,
      failure_reason_code: data.failure_reason_code,
      failure_reason_text: data.failure_reason_text,
      latitude: data.latitude,
      longitude: data.longitude,
      driver_id: data.driver_id,
      driver_notes: data.driver_notes,
      reschedule_date: data.reschedule_date,
      reschedule_notes: data.reschedule_notes,
      photo_urls: data.photo_urls,
    });

    if (error) throw error;
  }

  /**
   * Obtiene los intentos de entrega de un envío
   */
  async getDeliveryAttempts(shipmentId: string): Promise<Array<{
    id: string;
    attempt_number: number;
    attempted_at: string;
    status: string;
    failure_reason_code?: string;
    failure_reason_text?: string;
    driver_notes?: string;
    photo_urls?: string[];
  }>> {
    const { data, error } = await supabase
      .from('delivery_attempts')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('attempt_number', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ==================== PROOF OF DELIVERY ====================

  /**
   * Registra una prueba de entrega (POD)
   */
  async createProofOfDelivery(shipmentId: string, data: {
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
  }): Promise<void> {
    const { error } = await supabase.from('proof_of_delivery').insert({
      shipment_id: shipmentId,
      delivered_at: new Date().toISOString(),
      recipient_name: data.recipient_name,
      recipient_doc_type: data.recipient_doc_type,
      recipient_doc_number: data.recipient_doc_number,
      recipient_relationship: data.recipient_relationship,
      signature_url: data.signature_url,
      photo_urls: data.photo_urls,
      latitude: data.latitude,
      longitude: data.longitude,
      delivery_location_type: data.delivery_location_type,
      driver_id: data.driver_id,
      notes: data.notes,
    });

    if (error) throw error;
  }

  /**
   * Obtiene la prueba de entrega de un envío
   */
  async getProofOfDelivery(shipmentId: string): Promise<{
    id: string;
    delivered_at: string;
    recipient_name: string;
    recipient_doc_type?: string;
    recipient_doc_number?: string;
    recipient_relationship?: string;
    signature_url?: string;
    photo_urls?: string[];
    notes?: string;
  } | null> {
    const { data, error } = await supabase
      .from('proof_of_delivery')
      .select('*')
      .eq('shipment_id', shipmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  // ==================== TRANSPORT EVENTS ====================

  /**
   * Crea un evento de transporte
   */
  async createTransportEvent(data: {
    organization_id: number;
    reference_type: 'manifest' | 'shipment' | 'trip';
    reference_id: string;
    event_type: string;
    stop_id?: string;
    latitude?: number;
    longitude?: number;
    location_text?: string;
    actor_type: 'driver' | 'system' | 'user';
    actor_id?: string;
    description?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await supabase.from('transport_events').insert({
      organization_id: data.organization_id,
      reference_type: data.reference_type,
      reference_id: data.reference_id,
      event_type: data.event_type,
      event_time: new Date().toISOString(),
      stop_id: data.stop_id,
      latitude: data.latitude,
      longitude: data.longitude,
      location_text: data.location_text,
      actor_type: data.actor_type,
      actor_id: data.actor_id,
      description: data.description,
      payload: data.payload || {},
      source: 'internal',
    });

    if (error) throw error;
  }

  /**
   * Obtiene los eventos de una referencia
   */
  async getTransportEvents(referenceType: string, referenceId: string): Promise<Array<{
    id: string;
    event_type: string;
    event_time: string;
    location_text?: string;
    description?: string;
    actor_type: string;
  }>> {
    const { data, error } = await supabase
      .from('transport_events')
      .select('*')
      .eq('reference_type', referenceType)
      .eq('reference_id', referenceId)
      .order('event_time', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ==================== MANIFEST SHIPMENT STATUS ====================

  /**
   * Marca un envío del manifiesto como entregado
   */
  async markShipmentDelivered(manifestId: string, shipmentId: string, podData: {
    recipient_name: string;
    recipient_doc_type?: string;
    recipient_doc_number?: string;
    recipient_relationship?: string;
    notes?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<void> {
    // Actualizar estado en manifest_shipments
    const { error: msError } = await supabase
      .from('manifest_shipments')
      .update({
        status: 'delivered',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('manifest_id', manifestId)
      .eq('shipment_id', shipmentId);

    if (msError) throw msError;

    // Actualizar estado del envío
    await supabase
      .from('shipments')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', shipmentId);

    // Crear POD
    await this.createProofOfDelivery(shipmentId, podData);

    // Crear intento de entrega exitoso
    await this.createDeliveryAttempt(shipmentId, {
      status: 'delivered',
      latitude: podData.latitude,
      longitude: podData.longitude,
    });

    // Crear evento
    await this.createTransportEvent({
      reference_type: 'shipment',
      reference_id: shipmentId,
      event_type: 'delivered',
      actor_type: 'user',
      description: `Entregado a ${podData.recipient_name}`,
      latitude: podData.latitude,
      longitude: podData.longitude,
    });

    // Recalcular totales del manifiesto
    await this.recalculateTotals(manifestId);
  }

  /**
   * Marca un envío del manifiesto como fallido
   */
  async markShipmentFailed(manifestId: string, shipmentId: string, failureData: {
    failure_reason_code: string;
    failure_reason_text: string;
    driver_notes?: string;
    reschedule_date?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<void> {
    // Actualizar estado en manifest_shipments
    const { error: msError } = await supabase
      .from('manifest_shipments')
      .update({
        status: 'failed',
        failure_reason: failureData.failure_reason_text,
        driver_notes: failureData.driver_notes,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('manifest_id', manifestId)
      .eq('shipment_id', shipmentId);

    if (msError) throw msError;

    // Crear intento de entrega fallido
    await this.createDeliveryAttempt(shipmentId, {
      status: 'failed',
      failure_reason_code: failureData.failure_reason_code,
      failure_reason_text: failureData.failure_reason_text,
      driver_notes: failureData.driver_notes,
      reschedule_date: failureData.reschedule_date,
      latitude: failureData.latitude,
      longitude: failureData.longitude,
    });

    // Crear evento
    await this.createTransportEvent({
      reference_type: 'shipment',
      reference_id: shipmentId,
      event_type: 'delivery_failed',
      actor_type: 'user',
      description: failureData.failure_reason_text,
      latitude: failureData.latitude,
      longitude: failureData.longitude,
    });

    // Recalcular totales del manifiesto
    await this.recalculateTotals(manifestId);
  }

  /**
   * Actualiza notas del conductor para un envío
   */
  async updateShipmentNotes(manifestId: string, shipmentId: string, notes: string): Promise<void> {
    const { error } = await supabase
      .from('manifest_shipments')
      .update({
        driver_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq('manifest_id', manifestId)
      .eq('shipment_id', shipmentId);

    if (error) throw error;
  }

  /**
   * Actualiza la secuencia de un envío
   */
  async updateShipmentSequence(manifestId: string, shipmentId: string, newSequence: number): Promise<void> {
    const { error } = await supabase
      .from('manifest_shipments')
      .update({
        stop_sequence: newSequence,
        updated_at: new Date().toISOString(),
      })
      .eq('manifest_id', manifestId)
      .eq('shipment_id', shipmentId);

    if (error) throw error;
  }
}

export const manifestsService = new ManifestsService();
export default manifestsService;
