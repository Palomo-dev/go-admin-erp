import { supabase } from '@/lib/supabase/config';

export interface AvailableDriver {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  avatar_url?: string;
  license_number?: string;
  license_category?: string;
}

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
  status?: 'draft' | 'pending' | 'assigned' | 'ready' | 'picked' | 'dispatched' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'returned' | 'cancelled';
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
  driver_name?: string;
}

export interface ShipmentFilters {
  status?: string;
  payment_status?: string;
  tripId?: string;
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
    if (filters?.payment_status && filters.payment_status !== 'all') {
      query = query.eq('payment_status', filters.payment_status);
    }
    if (filters?.tripId && filters.tripId !== 'all') {
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

    let results = (data || []) as ShipmentWithDetails[];

    // Derivar payment_status de ventas relacionadas (batch)
    const saleIds = results
      .filter((s) => s.source_type === 'sale' && s.source_id)
      .map((s) => s.source_id as string);

    if (saleIds.length > 0) {
      const { data: salesData } = await supabase
        .from('sales')
        .select('id, payment_status')
        .in('id', saleIds);

      const salePaymentMap = new Map<string, string>();
      (salesData || []).forEach((sale) => {
        salePaymentMap.set(sale.id, sale.payment_status);
      });

      results = results.map((s) => {
        if (!s.payment_status && s.source_type === 'sale' && s.source_id) {
          const salePayment = salePaymentMap.get(s.source_id);
          if (salePayment) {
            s.payment_status = salePayment as ShipmentWithDetails['payment_status'];
          }
        }
        return s;
      });
    }

    // Mapear campos legacy para compatibilidad con ShipmentsList
    results = results.map((s) => {
      const metadata = s.metadata as Record<string, unknown> | null;
      if (!s.sender_name && metadata?.sender_name) {
        s.sender_name = metadata.sender_name as string;
      }
      if (!s.sender_phone && metadata?.sender_phone) {
        s.sender_phone = metadata.sender_phone as string;
      }
      if (!s.receiver_name) {
        s.receiver_name = s.delivery_contact_name || s.customer?.full_name || '';
      }
      if (!s.receiver_phone) {
        s.receiver_phone = s.delivery_contact_phone || s.customer?.phone || '';
      }
      return s;
    });

    // Batch fetch driver names desde metadata.driver_id
    const driverIds = results
      .map((s) => (s.metadata as Record<string, unknown> | null)?.driver_id as string)
      .filter(Boolean) as string[];

    if (driverIds.length > 0) {
      const uniqueDriverIds = [...new Set(driverIds)];

      // Step 1: Get driver_credentials with employment_id
      const { data: driversData } = await supabase
        .from('driver_credentials')
        .select('id, employment_id')
        .in('id', uniqueDriverIds);

      const driverNameMap = new Map<string, string>();

      if (driversData && driversData.length > 0) {
        // Step 2: Get employments to find organization_member_ids
        const employmentIds = driversData.map((d: any) => d.employment_id).filter(Boolean);
        if (employmentIds.length > 0) {
          const { data: employmentsData } = await supabase
            .from('employments')
            .select('id, organization_member_id')
            .in('id', employmentIds);

          if (employmentsData && employmentsData.length > 0) {
            // Step 3: Get organization_members to find user_ids
            const memberIds = employmentsData.map((e: any) => e.organization_member_id).filter(Boolean);
            if (memberIds.length > 0) {
              const { data: membersData } = await supabase
                .from('organization_members')
                .select('id, user_id')
                .in('id', memberIds);

              if (membersData && membersData.length > 0) {
                // Step 4: Get profiles by user_ids
                const userIds = membersData.map((m: any) => m.user_id).filter(Boolean);
                if (userIds.length > 0) {
                  const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name')
                    .in('id', userIds);

                  // Build lookup maps
                  const profileMap = new Map<string, string>();
                  (profilesData || []).forEach((p: any) => {
                    profileMap.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim());
                  });

                  const memberUserMap = new Map<number, string>();
                  membersData.forEach((m: any) => {
                    if (m.user_id) memberUserMap.set(m.id, m.user_id);
                  });

                  const employmentMemberMap = new Map<string, number>();
                  employmentsData.forEach((e: any) => {
                    if (e.organization_member_id) employmentMemberMap.set(e.id, e.organization_member_id);
                  });

                  // Map driver_id -> name
                  driversData.forEach((d: any) => {
                    const memberId = d.employment_id ? employmentMemberMap.get(d.employment_id) : null;
                    const userId = memberId ? memberUserMap.get(memberId) : null;
                    const name = userId ? profileMap.get(userId) : null;
                    if (name) driverNameMap.set(d.id, name);
                  });
                }
              }
            }
          }
        }
      }

      results = results.map((s) => {
        const driverId = (s.metadata as Record<string, unknown> | null)?.driver_id as string | undefined;
        if (driverId) {
          s.driver_name = driverNameMap.get(driverId);
        }
        return s;
      });
    }

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

    const s = data as ShipmentWithDetails;
    const metadata = s.metadata as Record<string, unknown> | null;
    if (!s.sender_name && metadata?.sender_name) {
      s.sender_name = metadata.sender_name as string;
    }
    if (!s.sender_phone && metadata?.sender_phone) {
      s.sender_phone = metadata.sender_phone as string;
    }
    if (!s.receiver_name) {
      s.receiver_name = s.delivery_contact_name || s.customer?.full_name || '';
    }
    if (!s.receiver_phone) {
      s.receiver_phone = s.delivery_contact_phone || s.customer?.phone || '';
    }

    // Derivar payment_status de la venta relacionada si source_type es 'sale'
    if (!s.payment_status && s.source_type === 'sale' && s.source_id) {
      try {
        const { data: sale } = await supabase
          .from('sales')
          .select('payment_status')
          .eq('id', s.source_id)
          .maybeSingle();
        if (sale?.payment_status) {
          s.payment_status = sale.payment_status as ShipmentWithDetails['payment_status'];
        }
      } catch {
        // Si no se puede obtener, dejar como undefined
      }
    }

    return s;
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
      case 'picked':
        updates.picked_at = now;
        break;
      case 'dispatched':
        updates.dispatched_at = now;
        break;
      case 'in_transit':
        updates.dispatched_at = now;
        break;
      case 'delivered':
        updates.delivered_at = now;
        break;
    }

    const updated = await this.updateShipment(id, updates);

    const eventDescriptions: Record<string, string> = {
      picked: 'Pedido recogido',
      dispatched: 'Despachado / Llegó a destino',
      in_transit: 'En tránsito al destino',
      out_for_delivery: 'En entrega final',
      delivered: 'Entregado exitosamente',
      returned: 'Devuelto',
      cancelled: 'Cancelado',
      ready: 'Listo para despacho',
      assigned: 'Conductor asignado',
    };

    try {
      await this.createEvent(id, {
        event_type: status,
        description: eventDescriptions[status] || `Estado cambiado a: ${status}`,
        organization_id: updated.organization_id,
      });
    } catch (eventError) {
      console.error('Error creating transport event:', eventError);
    }

    return updated;
  }

  async getShipmentStats(organizationId: number) {
    const { data, error } = await supabase
      .from('shipments')
      .select('status, total_cost, weight_kg, declared_value, created_at, metadata')
      .eq('organization_id', organizationId);

    if (error) throw error;

    const shipments = data || [];
    const statusCounts: Record<string, number> = {};
    let totalWeight = 0;
    let totalDeclaredValue = 0;
    let unassignedPending = 0;
    const today = new Date().toISOString().split('T')[0];
    let shipmentsToday = 0;

    for (const s of shipments) {
      const st = s.status || 'pending';
      statusCounts[st] = (statusCounts[st] || 0) + 1;
      totalWeight += Number(s.weight_kg) || 0;
      totalDeclaredValue += Number(s.declared_value) || 0;
      if (s.created_at && s.created_at.startsWith(today)) shipmentsToday++;
      const meta = s.metadata as Record<string, unknown> | null;
      if (st === 'pending' && !meta?.driver_id) unassignedPending++;
    }

    const delivered = statusCounts['delivered'] || 0;
    const total = shipments.length;
    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    return {
      total,
      pending: statusCounts['pending'] || 0,
      assigned: statusCounts['assigned'] || 0,
      pickedUp: statusCounts['picked'] || 0,
      dispatched: statusCounts['dispatched'] || 0,
      inTransit: statusCounts['in_transit'] || 0,
      outForDelivery: statusCounts['out_for_delivery'] || 0,
      delivered,
      failed: statusCounts['failed'] || 0,
      returned: statusCounts['returned'] || 0,
      cancelled: statusCounts['cancelled'] || 0,
      revenue: shipments.filter((s) => s.status === 'delivered').reduce((sum, s) => sum + (Number(s.total_cost) || 0), 0),
      totalWeight,
      totalDeclaredValue,
      shipmentsToday,
      unassignedPending,
      deliveryRate,
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

    return (data || []).map((t: any) => ({
      id: t.id,
      trip_code: t.trip_code,
      transport_routes: Array.isArray(t.transport_routes) ? t.transport_routes[0] : t.transport_routes,
    }));
  }

  async getShipmentEvents(shipmentId: string) {
    const { data, error } = await supabase
      .from('transport_events')
      .select(`
        *,
        transport_stops(id, name, city)
      `)
      .eq('reference_type', 'shipment')
      .eq('reference_id', shipmentId)
      .order('event_time', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async createEvent(shipmentId: string, eventData: { event_type: string; description?: string; location_text?: string; organization_id?: number }) {
    const { data: { user } } = await supabase.auth.getUser();

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
        actor_id: user?.id || null,
        source: 'internal',
        organization_id: eventData.organization_id || null,
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

  async searchProducts(organizationId: number, query: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        sku,
        name,
        unit_code,
        description,
        product_prices(price)
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.ilike.%${query}%`)
      .limit(10);

    if (error) throw error;

    return (data || []).map((p: any) => {
      const activePrice = p.product_prices?.find((pp: any) =>
        !pp.effective_to || new Date(pp.effective_to) > new Date()
      );
      return {
        id: p.id,
        sku: p.sku || undefined,
        name: p.name,
        unit_code: p.unit_code?.trim() || undefined,
        description: p.description || undefined,
        price: activePrice?.price ? Number(activePrice.price) : 0,
      };
    });
  }

  async searchCustomers(organizationId: number, query: string) {
    let q = supabase
      .from('customers')
      .select('id, full_name, email, phone, identification_number, address, city')
      .eq('organization_id', organizationId)
      .order('full_name', { ascending: true })
      .limit(20);

    if (query && query.trim()) {
      q = q.or(`full_name.ilike.%${query}%,email.ilike.%${query}%,identification_number.ilike.%${query}%,phone.ilike.%${query}%,company_name.ilike.%${query}%,trade_name.ilike.%${query}%`);
    }

    const { data, error } = await q;

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

    // Procesar para obtener la imagen desde notes.product_image
    const processedData = (data || []).map((item: any) => {
      let productImage: string | null = null;
      if (item.notes) {
        try {
          const parsed = JSON.parse(item.notes);
          if (parsed.product_image) {
            productImage = parsed.product_image;
          }
        } catch {}
      }
      const { ...productData } = item.products || {};
      return { ...item, products: productData.id ? { id: productData.id, name: productData.name, sku: productData.sku } : undefined, product_image: productImage };
    });

    return processedData;
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
    const { data: itemData, error: fetchError } = await supabase
      .from('shipment_items')
      .select('shipment_id, description, products(name)')
      .eq('id', itemId)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from('shipment_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;

    if (itemData?.shipment_id) {
      const itemName = (itemData.products as any)?.name || itemData.description || 'item';
      const { data: shipment } = await supabase
        .from('shipments')
        .select('organization_id')
        .eq('id', itemData.shipment_id)
        .single();
      await this.createEvent(itemData.shipment_id, {
        event_type: 'note',
        description: `Item eliminado: ${itemName}`,
        organization_id: shipment?.organization_id,
      }).catch((err) => console.error('Error creating delete event:', err));
    }
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

  // ==================== DRIVER ASSIGNMENT ====================

  async getAvailableDrivers(organizationId: number) {
    // Step 1: Get all active driver_credentials
    const { data: driversData, error: driversError } = await supabase
      .from('driver_credentials')
      .select('id, license_number, license_category, employment_id')
      .eq('is_active', true);

    if (driversError) throw driversError;
    if (!driversData || driversData.length === 0) return [];

    // Step 2: Get active employments for these drivers
    const employmentIds = driversData.map((d: any) => d.employment_id).filter(Boolean);
    if (employmentIds.length === 0) return [];

    const { data: employmentsData, error: empError } = await supabase
      .from('employments')
      .select('id, status, organization_member_id')
      .in('id', employmentIds)
      .eq('status', 'active');

    if (empError || !employmentsData || employmentsData.length === 0) return [];

    // Step 3: Get organization_members filtered by org
    const memberIds = employmentsData.map((e: any) => e.organization_member_id).filter(Boolean);
    if (memberIds.length === 0) return [];

    const { data: membersData, error: memberError } = await supabase
      .from('organization_members')
      .select('id, user_id, organization_id, is_active')
      .in('id', memberIds)
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (memberError || !membersData || membersData.length === 0) return [];

    // Step 4: Get profiles for these users
    const userIds = membersData.map((m: any) => m.user_id).filter(Boolean);
    if (userIds.length === 0) return [];

    const { data: profilesData, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, phone, email, avatar_url')
      .in('id', userIds);

    if (profileError || !profilesData) return [];

    // Build lookup maps
    const profileMap = new Map<string, any>();
    profilesData.forEach((p: any) => profileMap.set(p.id, p));

    const memberUserMap = new Map<number, string>();
    membersData.forEach((m: any) => {
      if (m.user_id) memberUserMap.set(m.id, m.user_id);
    });

    const employmentMemberMap = new Map<string, number>();
    employmentsData.forEach((e: any) => {
      if (e.organization_member_id) employmentMemberMap.set(e.id, e.organization_member_id);
    });

    // Build result
    const result: AvailableDriver[] = [];
    driversData.forEach((driver: any) => {
      const memberId = driver.employment_id ? employmentMemberMap.get(driver.employment_id) : null;
      if (!memberId) return;
      const userId = memberUserMap.get(memberId);
      if (!userId) return;
      const profile = profileMap.get(userId);
      if (!profile) return;

      result.push({
        id: driver.id,
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        phone: profile.phone || undefined,
        email: profile.email || undefined,
        avatar_url: profile.avatar_url || undefined,
        license_number: driver.license_number || undefined,
        license_category: driver.license_category || undefined,
      });
    });

    return result;
  }

  async assignDriver(shipmentId: string, driverId: string) {
    // Obtener metadata actual
    const { data: current } = await supabase
      .from('shipments')
      .select('metadata')
      .eq('id', shipmentId)
      .single();

    const currentMetadata = (current?.metadata as Record<string, unknown> | null) || {};
    const updatedMetadata = { ...currentMetadata, driver_id: driverId };

    const updated = await this.updateShipment(shipmentId, {
      metadata: updatedMetadata,
      status: 'assigned',
    } as Partial<ShipmentWithDetails>);

    await this.createEvent(shipmentId, {
      event_type: 'driver_assigned',
      description: 'Conductor asignado al envío',
    });

    return updated;
  }

  async unassignDriver(shipmentId: string) {
    const { data: current } = await supabase
      .from('shipments')
      .select('metadata')
      .eq('id', shipmentId)
      .single();

    const currentMetadata = (current?.metadata as Record<string, unknown> | null) || {};
    delete currentMetadata.driver_id;

    const updated = await this.updateShipment(shipmentId, {
      metadata: currentMetadata,
      status: 'pending',
    } as Partial<ShipmentWithDetails>);

    await this.createEvent(shipmentId, {
      event_type: 'driver_unassigned',
      description: 'Conductor desasignado del envío',
    });

    return updated;
  }

  async bulkAssignDriver(shipmentIds: string[], driverId: string) {
    const results = await Promise.allSettled(
      shipmentIds.map((id) => this.assignDriver(id, driverId))
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { succeeded, failed };
  }

  async bulkUpdateStatus(shipmentIds: string[], status: string) {
    const results = await Promise.allSettled(
      shipmentIds.map((id) => this.updateStatus(id, status))
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { succeeded, failed };
  }

  async bulkCancel(shipmentIds: string[]) {
    const results = await Promise.allSettled(
      shipmentIds.map((id) => this.updateStatus(id, 'cancelled'))
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { succeeded, failed };
  }

  async bulkMarkReturned(shipmentIds: string[]) {
    const results = await Promise.allSettled(
      shipmentIds.map((id) => this.updateStatus(id, 'returned'))
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { succeeded, failed };
  }

  async bulkMarkPaid(shipmentIds: string[]) {
    const results = await Promise.allSettled(
      shipmentIds.map((id) => this.updateShipment(id, { payment_status: 'paid' } as Partial<ShipmentWithDetails>))
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { succeeded, failed };
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
