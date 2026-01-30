import { supabase } from '@/lib/supabase/config';

export interface TapeChartSpace {
  id: string;
  label: string;
  spaceTypeName: string;
  floorZone: string | null;
  status: string;
}

export interface TapeChartReservation {
  id: string;
  code: string;
  customerName: string;
  spaceId: string;
  checkin: string;
  checkout: string;
  status: string;
  color: string;
}

export interface TapeChartBlock {
  id: string;
  spaceId: string;
  dateFrom: string;
  dateTo: string;
  blockType: string;
  reason: string | null;
  color: string;
}

export interface TapeChartData {
  spaces: TapeChartSpace[];
  reservations: TapeChartReservation[];
  blocks: TapeChartBlock[];
}

export interface OccupancyData {
  date: string;
  occupied: number;
  total: number;
  percentage: number;
}

const statusColors: Record<string, string> = {
  confirmed: '#3b82f6',
  tentative: '#f59e0b',
  checked_in: '#22c55e',
  checked_out: '#6b7280',
  cancelled: '#ef4444',
  no_show: '#dc2626',
};

const blockColors: Record<string, string> = {
  maintenance: '#ef4444',
  cleaning: '#f59e0b',
  out_of_order: '#dc2626',
  reserved: '#8b5cf6',
  other: '#6b7280',
};

class TapeChartService {
  async getTapeChartData(
    organizationId: number,
    startDate: string,
    endDate: string
  ): Promise<TapeChartData> {
    // Get spaces
    const { data: spacesData, error: spacesError } = await supabase
      .from('spaces')
      .select(`
        id,
        label,
        floor_zone,
        status,
        space_types (
          id,
          name
        )
      `)
      .eq('branch_id', organizationId)
      .order('label');

    if (spacesError) {
      console.error('Error fetching spaces:', spacesError);
      throw spacesError;
    }

    const spaces: TapeChartSpace[] = (spacesData || []).map((s: any) => ({
      id: s.id,
      label: s.label,
      spaceTypeName: s.space_types?.name || 'Sin tipo',
      floorZone: s.floor_zone,
      status: s.status,
    }));

    // Get reservations in date range (overlap check: checkin <= endDate AND checkout >= startDate)
    const { data: reservationsData, error: reservationsError } = await supabase
      .from('reservations')
      .select(`
        id,
        metadata,
        checkin,
        checkout,
        status,
        space_id,
        customers (
          first_name,
          last_name
        ),
        reservation_spaces (
          space_id
        )
      `)
      .eq('organization_id', organizationId)
      .not('status', 'eq', 'cancelled')
      .lte('checkin', endDate)
      .gte('checkout', startDate);

    if (reservationsError) {
      console.error('Error fetching reservations:', reservationsError);
      throw reservationsError;
    }

    const reservations: TapeChartReservation[] = [];
    (reservationsData || []).forEach((r: any) => {
      const customerName = r.customers 
        ? `${r.customers.first_name || ''} ${r.customers.last_name || ''}`.trim() 
        : 'Sin cliente';
      const code = r.metadata?.code || r.id.substring(0, 8).toUpperCase();
      
      // Get all space_ids for this reservation
      const spaceIds: string[] = [];
      if (r.space_id) {
        spaceIds.push(r.space_id);
      }
      if (r.reservation_spaces && Array.isArray(r.reservation_spaces)) {
        r.reservation_spaces.forEach((rs: any) => {
          if (rs.space_id && !spaceIds.includes(rs.space_id)) {
            spaceIds.push(rs.space_id);
          }
        });
      }

      spaceIds.forEach((spaceId) => {
        reservations.push({
          id: r.id,
          code,
          customerName,
          spaceId,
          checkin: r.checkin,
          checkout: r.checkout,
          status: r.status,
          color: statusColors[r.status] || '#6b7280',
        });
      });
    });

    // Get blocks in date range (overlap check: date_from <= endDate AND date_to >= startDate)
    const { data: blocksData, error: blocksError } = await supabase
      .from('reservation_blocks')
      .select('id, space_id, date_from, date_to, block_type, reason')
      .eq('organization_id', organizationId)
      .lte('date_from', endDate)
      .gte('date_to', startDate);

    if (blocksError) {
      console.error('Error fetching blocks:', blocksError);
      throw blocksError;
    }

    const blocks: TapeChartBlock[] = (blocksData || []).map((b: any) => ({
      id: b.id,
      spaceId: b.space_id,
      dateFrom: b.date_from,
      dateTo: b.date_to,
      blockType: b.block_type,
      reason: b.reason,
      color: blockColors[b.block_type] || '#6b7280',
    }));

    return { spaces, reservations, blocks };
  }

  async getOccupancyData(
    organizationId: number,
    startDate: string,
    endDate: string
  ): Promise<OccupancyData[]> {
    const { data: spacesData } = await supabase
      .from('spaces')
      .select('id')
      .eq('branch_id', organizationId);

    const totalSpaces = spacesData?.length || 0;

    if (totalSpaces === 0) {
      return [];
    }

    const { data: reservationsData } = await supabase
      .from('reservations')
      .select('checkin, checkout, space_id')
      .eq('organization_id', organizationId)
      .in('status', ['confirmed', 'checked_in'])
      .or(`checkin.lte.${endDate},checkout.gte.${startDate}`);

    const occupancyMap: Record<string, Set<string>> = {};

    // Initialize dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      occupancyMap[dateStr] = new Set();
    }

    // Count occupied spaces per day
    (reservationsData || []).forEach((r: any) => {
      if (!r.space_id) return;
      
      const checkin = new Date(r.checkin);
      const checkout = new Date(r.checkout);
      
      for (let d = new Date(Math.max(checkin.getTime(), start.getTime())); 
           d < checkout && d <= end; 
           d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (occupancyMap[dateStr]) {
          occupancyMap[dateStr].add(r.space_id);
        }
      }
    });

    return Object.entries(occupancyMap).map(([date, spaces]) => ({
      date,
      occupied: spaces.size,
      total: totalSpaces,
      percentage: Math.round((spaces.size / totalSpaces) * 100),
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  checkConflicts(
    reservations: TapeChartReservation[],
    blocks: TapeChartBlock[],
    spaceId: string,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): { hasConflict: boolean; conflictType: 'reservation' | 'block' | null; details?: string } {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check reservation conflicts
    for (const reservation of reservations) {
      if (reservation.spaceId !== spaceId) continue;
      if (excludeId && reservation.id === excludeId) continue;

      const resStart = new Date(reservation.checkin);
      const resEnd = new Date(reservation.checkout);

      if (start < resEnd && end > resStart) {
        return {
          hasConflict: true,
          conflictType: 'reservation',
          details: `Conflicto con reserva ${reservation.code} (${reservation.customerName})`,
        };
      }
    }

    // Check block conflicts
    for (const block of blocks) {
      if (block.spaceId !== spaceId) continue;

      const blockStart = new Date(block.dateFrom);
      const blockEnd = new Date(block.dateTo);

      if (start < blockEnd && end > blockStart) {
        return {
          hasConflict: true,
          conflictType: 'block',
          details: `Conflicto con bloqueo: ${block.reason || block.blockType}`,
        };
      }
    }

    return { hasConflict: false, conflictType: null };
  }

  generateDateRange(startDate: string, days: number): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    
    for (let i = 0; i < days; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    return dates;
  }

  async getReservationDetails(reservationId: string): Promise<any> {
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        id,
        checkin,
        checkout,
        status,
        occupant_count,
        total_estimated,
        notes,
        space_id,
        metadata,
        actual_checkin_at,
        actual_checkout_at,
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
            label
          )
        )
      `)
      .eq('id', reservationId)
      .single();

    if (error) throw error;

    const customer = data.customers as any;
    
    // Obtener spaceId de space_id directo o de reservation_spaces
    let spaceId = data.space_id;
    let spaceName = null;
    
    if (!spaceId && data.reservation_spaces && Array.isArray(data.reservation_spaces) && data.reservation_spaces.length > 0) {
      const rs = data.reservation_spaces[0] as any;
      spaceId = rs.space_id;
      spaceName = rs.spaces?.label;
    }
    
    // Si tenemos spaceId pero no spaceName, buscar el nombre
    if (spaceId && !spaceName) {
      const { data: spaceData } = await supabase
        .from('spaces')
        .select('label')
        .eq('id', spaceId)
        .single();
      spaceName = spaceData?.label;
    }

    return {
      id: data.id,
      code: data.metadata?.code || data.id.substring(0, 8).toUpperCase(),
      customerName: customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : 'Sin cliente',
      customerEmail: customer?.email,
      customerPhone: customer?.phone,
      customerId: customer?.id,
      spaceId,
      spaceName,
      checkin: data.checkin,
      checkout: data.checkout,
      status: data.status,
      occupantCount: data.occupant_count,
      totalEstimated: data.total_estimated,
      notes: data.notes,
      actualCheckinAt: data.actual_checkin_at,
      actualCheckoutAt: data.actual_checkout_at,
    };
  }

  async updateReservation(
    reservationId: string,
    updates: {
      checkin?: string;
      checkout?: string;
      spaceId?: string;
      occupantCount?: number;
      notes?: string;
      status?: string;
    }
  ): Promise<void> {
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.checkin) updateData.checkin = updates.checkin;
    if (updates.checkout) updateData.checkout = updates.checkout;
    if (updates.spaceId) updateData.space_id = updates.spaceId;
    if (updates.occupantCount !== undefined) updateData.occupant_count = updates.occupantCount;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.status) updateData.status = updates.status;

    const { error } = await supabase
      .from('reservations')
      .update(updateData)
      .eq('id', reservationId);

    if (error) throw error;

    // If space changed, update reservation_spaces table
    if (updates.spaceId) {
      // Delete existing space assignments
      await supabase
        .from('reservation_spaces')
        .delete()
        .eq('reservation_id', reservationId);

      // Insert new space assignment
      await supabase
        .from('reservation_spaces')
        .insert({
          reservation_id: reservationId,
          space_id: updates.spaceId,
        });
    }
  }

  async moveReservation(
    reservationId: string,
    newSpaceId: string,
    newCheckin: string,
    newCheckout: string
  ): Promise<void> {
    await this.updateReservation(reservationId, {
      spaceId: newSpaceId,
      checkin: newCheckin,
      checkout: newCheckout,
    });
  }

  async resizeReservation(
    reservationId: string,
    newCheckin: string,
    newCheckout: string
  ): Promise<void> {
    await this.updateReservation(reservationId, {
      checkin: newCheckin,
      checkout: newCheckout,
    });
  }

  async deleteReservation(reservationId: string): Promise<void> {
    // Delete reservation_spaces first
    await supabase
      .from('reservation_spaces')
      .delete()
      .eq('reservation_id', reservationId);

    // Delete reservation
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', reservationId);

    if (error) throw error;
  }

  async performCheckin(reservationId: string): Promise<void> {
    const { error } = await supabase
      .from('reservations')
      .update({
        status: 'checked_in',
        actual_checkin_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId);

    if (error) throw error;
  }

  async performCheckout(reservationId: string): Promise<void> {
    const { error } = await supabase
      .from('reservations')
      .update({
        status: 'checked_out',
        actual_checkout_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId);

    if (error) throw error;
  }

  async createBlock(
    organizationId: number,
    spaceId: string,
    dateFrom: string,
    dateTo: string,
    blockType: string,
    reason: string
  ): Promise<void> {
    const { error } = await supabase
      .from('reservation_blocks')
      .insert({
        organization_id: organizationId,
        space_id: spaceId,
        date_from: dateFrom,
        date_to: dateTo,
        block_type: blockType,
        reason: reason || null,
      });

    if (error) throw error;
  }
}

export default new TapeChartService();
