import { supabase } from '@/lib/supabase/config';

export interface UnassignedReservation {
  id: string;
  code: string;
  customerName: string;
  customerEmail: string;
  checkin: string;
  checkout: string;
  nights: number;
  occupantCount: number;
  spaceTypeId: string | null;
  spaceTypeName: string | null;
  status: string;
  notes: string | null;
}

export interface AvailableSpace {
  id: string;
  label: string;
  spaceTypeId: string;
  spaceTypeName: string;
  floorZone: string | null;
  status: string;
  capacity: number;
  isAvailable: boolean;
  conflictReason?: string;
}

export interface AssignmentConflict {
  type: 'reservation' | 'block' | 'status';
  message: string;
  details?: string;
}

class RoomAssignmentService {
  async getUnassignedReservations(organizationId: number): Promise<UnassignedReservation[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('reservations')
      .select(`
        id,
        metadata,
        checkin,
        checkout,
        occupant_count,
        space_type_id,
        status,
        notes,
        customers (
          first_name,
          last_name,
          email
        ),
        space_types (
          id,
          name
        ),
        reservation_spaces (
          space_id
        )
      `)
      .eq('organization_id', organizationId)
      .is('space_id', null)
      .in('status', ['confirmed', 'tentative'])
      .gte('checkin', today)
      .order('checkin', { ascending: true });

    if (error) {
      console.error('Error fetching unassigned reservations:', error);
      throw error;
    }

    // Filtrar reservas que ya tienen espacios asignados via reservation_spaces
    const trulyUnassigned = (data || []).filter((r: any) => {
      return !r.reservation_spaces || r.reservation_spaces.length === 0;
    });

    return trulyUnassigned.map((r: any) => {
      const checkin = new Date(r.checkin);
      const checkout = new Date(r.checkout);
      const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: r.id,
        code: r.metadata?.code || r.id.substring(0, 8).toUpperCase(),
        customerName: r.customers 
          ? `${r.customers.first_name || ''} ${r.customers.last_name || ''}`.trim() 
          : 'Sin cliente',
        customerEmail: r.customers?.email || '',
        checkin: r.checkin,
        checkout: r.checkout,
        nights,
        occupantCount: r.occupant_count || 1,
        spaceTypeId: r.space_type_id,
        spaceTypeName: r.space_types?.name || null,
        status: r.status,
        notes: r.notes,
      };
    });
  }

  async getAvailableSpaces(
    organizationId: number,
    checkin: string,
    checkout: string,
    spaceTypeId?: string | null
  ): Promise<AvailableSpace[]> {
    // Get all branch IDs for this organization
    const { data: branchesData } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', organizationId);

    const branchIds = (branchesData || []).map(b => b.id);
    if (branchIds.length === 0) {
      return [];
    }

    let query = supabase
      .from('spaces')
      .select(`
        id,
        label,
        floor_zone,
        status,
        space_type_id,
        space_types (
          id,
          name,
          capacity
        )
      `)
      .in('branch_id', branchIds);

    if (spaceTypeId) {
      query = query.eq('space_type_id', spaceTypeId);
    }

    const { data: spacesData, error: spacesError } = await query.order('label');

    if (spacesError) {
      console.error('Error fetching spaces:', spacesError);
      throw spacesError;
    }

    // Get reservations that overlap with the date range (direct space_id)
    const { data: reservationsData } = await supabase
      .from('reservations')
      .select('id, space_id, checkin, checkout')
      .eq('organization_id', organizationId)
      .not('status', 'eq', 'cancelled')
      .not('space_id', 'is', null)
      .or(`checkin.lt.${checkout},checkout.gt.${checkin}`);

    // Get reservations with spaces via reservation_spaces (overlap)
    const { data: rsReservationsData } = await supabase
      .from('reservation_spaces')
      .select(`
        space_id,
        reservations!inner (
          id,
          status,
          checkin,
          checkout
        )
      `)
      .eq('reservations.organization_id', organizationId)
      .neq('reservations.status', 'cancelled')
      .lt('reservations.checkin', checkout)
      .gt('reservations.checkout', checkin);

    // Get blocks that overlap with the date range
    const { data: blocksData } = await supabase
      .from('reservation_blocks')
      .select('space_id, date_from, date_to, reason')
      .eq('organization_id', organizationId)
      .or(`date_from.lte.${checkout},date_to.gte.${checkin}`);

    const occupiedSpaceIds = new Set<string>();
    const conflictReasons: Record<string, string> = {};

    // Check direct reservation conflicts
    (reservationsData || []).forEach((r: any) => {
      if (r.space_id) {
        const resCheckin = new Date(r.checkin);
        const resCheckout = new Date(r.checkout);
        const targetCheckin = new Date(checkin);
        const targetCheckout = new Date(checkout);

        if (targetCheckin < resCheckout && targetCheckout > resCheckin) {
          occupiedSpaceIds.add(r.space_id);
          conflictReasons[r.space_id] = 'Reserva existente';
        }
      }
    });

    // Check reservation_spaces conflicts
    (rsReservationsData || []).forEach((rs: any) => {
      if (rs.space_id) {
        occupiedSpaceIds.add(rs.space_id);
        conflictReasons[rs.space_id] = 'Reserva existente';
      }
    });

    // Check block conflicts
    (blocksData || []).forEach((b: any) => {
      if (b.space_id) {
        const blockFrom = new Date(b.date_from);
        const blockTo = new Date(b.date_to);
        const targetCheckin = new Date(checkin);
        const targetCheckout = new Date(checkout);

        if (targetCheckin <= blockTo && targetCheckout >= blockFrom) {
          occupiedSpaceIds.add(b.space_id);
          conflictReasons[b.space_id] = b.reason || 'Bloqueo';
        }
      }
    });

    return (spacesData || []).map((s: any) => {
      const isOccupied = occupiedSpaceIds.has(s.id);
      const hasStatusIssue = s.status === 'maintenance' || s.status === 'out_of_order';
      
      return {
        id: s.id,
        label: s.label,
        spaceTypeId: s.space_type_id,
        spaceTypeName: s.space_types?.name || 'Sin tipo',
        floorZone: s.floor_zone,
        status: s.status,
        capacity: s.space_types?.capacity || 1,
        isAvailable: !isOccupied && !hasStatusIssue,
        conflictReason: isOccupied 
          ? conflictReasons[s.id] 
          : hasStatusIssue 
            ? `Estado: ${s.status}` 
            : undefined,
      };
    });
  }

  async assignSpace(reservationId: string, spaceId: string): Promise<void> {
    const { error } = await supabase
      .from('reservations')
      .update({ 
        space_id: spaceId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId);

    if (error) {
      console.error('Error assigning space:', error);
      throw error;
    }

    // Also create entry in reservation_spaces
    const { data: reservation } = await supabase
      .from('reservations')
      .select('checkin, checkout')
      .eq('id', reservationId)
      .single();

    if (reservation) {
      await supabase
        .from('reservation_spaces')
        .upsert({
          reservation_id: reservationId,
          space_id: spaceId,
          checkin: reservation.checkin,
          checkout: reservation.checkout,
        }, {
          onConflict: 'reservation_id,space_id',
        });
    }
  }

  async unassignSpace(reservationId: string): Promise<void> {
    const { error } = await supabase
      .from('reservations')
      .update({ 
        space_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reservationId);

    if (error) {
      console.error('Error unassigning space:', error);
      throw error;
    }

    // Remove from reservation_spaces
    await supabase
      .from('reservation_spaces')
      .delete()
      .eq('reservation_id', reservationId);
  }

  async bulkAssign(assignments: { reservationId: string; spaceId: string }[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const assignment of assignments) {
      try {
        await this.assignSpace(assignment.reservationId, assignment.spaceId);
        success++;
      } catch (error: any) {
        failed++;
        errors.push(`Error asignando ${assignment.reservationId}: ${error.message}`);
      }
    }

    return { success, failed, errors };
  }

  async getAssignmentStats(organizationId: number): Promise<{
    totalUnassigned: number;
    arrivingToday: number;
    arrivingTomorrow: number;
    arrivingThisWeek: number;
  }> {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const { data } = await supabase
      .from('reservations')
      .select('checkin')
      .eq('organization_id', organizationId)
      .is('space_id', null)
      .in('status', ['confirmed', 'tentative'])
      .gte('checkin', todayStr);

    const reservations = data || [];

    return {
      totalUnassigned: reservations.length,
      arrivingToday: reservations.filter(r => r.checkin === todayStr).length,
      arrivingTomorrow: reservations.filter(r => r.checkin === tomorrowStr).length,
      arrivingThisWeek: reservations.filter(r => r.checkin <= weekEndStr).length,
    };
  }
}

export default new RoomAssignmentService();
