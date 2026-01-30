import { supabase } from '@/lib/supabase/config';

export interface Group {
  id: string;
  name: string;
  company: string | null;
  pickupDate: string | null;
  releaseDate: string | null;
  roomNights: number | null;
  reservationsCount: number;
  totalEstimated: number;
  createdAt: string;
}

export interface GroupReservation {
  id: string;
  code: string;
  customerName: string;
  checkin: string;
  checkout: string;
  spaceLabel: string | null;
  status: string;
  totalEstimated: number;
}

export interface GroupDetails extends Group {
  reservations: GroupReservation[];
}

export interface GroupStats {
  totalGroups: number;
  activeGroups: number;
  totalRoomNights: number;
  totalRevenue: number;
}

class GroupReservationsService {
  async getGroups(branchId: number): Promise<Group[]> {
    const { data, error } = await supabase
      .from('groups')
      .select(`
        id,
        name,
        company,
        pickup_date,
        release_date,
        room_nights,
        created_at,
        reservation_groups (
          reservation_id,
          reservations (
            id,
            total_estimated
          )
        )
      `)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching groups:', error);
      throw error;
    }

    return (data || []).map((g: any) => {
      const reservations = g.reservation_groups || [];
      const totalEstimated = reservations.reduce((sum: number, rg: any) => {
        return sum + (rg.reservations?.total_estimated || 0);
      }, 0);

      return {
        id: g.id,
        name: g.name,
        company: g.company,
        pickupDate: g.pickup_date,
        releaseDate: g.release_date,
        roomNights: g.room_nights,
        reservationsCount: reservations.length,
        totalEstimated,
        createdAt: g.created_at,
      };
    });
  }

  async getGroupDetails(groupId: string): Promise<GroupDetails | null> {
    const { data: groupData, error: groupError } = await supabase
      .from('groups')
      .select(`
        id,
        name,
        company,
        pickup_date,
        release_date,
        room_nights,
        created_at
      `)
      .eq('id', groupId)
      .single();

    if (groupError) {
      console.error('Error fetching group:', groupError);
      throw groupError;
    }

    if (!groupData) return null;

    const { data: reservationsData, error: reservationsError } = await supabase
      .from('reservation_groups')
      .select(`
        reservations (
          id,
          metadata,
          checkin,
          checkout,
          status,
          total_estimated,
          space_id,
          customers (
            first_name,
            last_name
          ),
          spaces (
            label
          )
        )
      `)
      .eq('group_id', groupId);

    if (reservationsError) {
      console.error('Error fetching group reservations:', reservationsError);
      throw reservationsError;
    }

    const reservations: GroupReservation[] = (reservationsData || []).map((rg: any) => {
      const r = rg.reservations;
      return {
        id: r.id,
        code: r.metadata?.code || r.id.substring(0, 8).toUpperCase(),
        customerName: r.customers 
          ? `${r.customers.first_name || ''} ${r.customers.last_name || ''}`.trim() 
          : 'Sin cliente',
        checkin: r.checkin,
        checkout: r.checkout,
        spaceLabel: r.spaces?.label || null,
        status: r.status,
        totalEstimated: r.total_estimated || 0,
      };
    });

    const totalEstimated = reservations.reduce((sum, r) => sum + r.totalEstimated, 0);

    return {
      id: groupData.id,
      name: groupData.name,
      company: groupData.company,
      pickupDate: groupData.pickup_date,
      releaseDate: groupData.release_date,
      roomNights: groupData.room_nights,
      reservationsCount: reservations.length,
      totalEstimated,
      createdAt: groupData.created_at,
      reservations,
    };
  }

  async createGroup(data: {
    branchId: number;
    name: string;
    company?: string;
    pickupDate?: string;
    releaseDate?: string;
    roomNights?: number;
  }): Promise<Group> {
    const { data: group, error } = await supabase
      .from('groups')
      .insert({
        branch_id: data.branchId,
        name: data.name,
        company: data.company || null,
        pickup_date: data.pickupDate || null,
        release_date: data.releaseDate || null,
        room_nights: data.roomNights || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating group:', error);
      throw error;
    }

    return {
      id: group.id,
      name: group.name,
      company: group.company,
      pickupDate: group.pickup_date,
      releaseDate: group.release_date,
      roomNights: group.room_nights,
      reservationsCount: 0,
      totalEstimated: 0,
      createdAt: group.created_at,
    };
  }

  async updateGroup(
    groupId: string,
    data: {
      name?: string;
      company?: string | null;
      pickupDate?: string | null;
      releaseDate?: string | null;
      roomNights?: number | null;
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('groups')
      .update({
        name: data.name,
        company: data.company,
        pickup_date: data.pickupDate,
        release_date: data.releaseDate,
        room_nights: data.roomNights,
        updated_at: new Date().toISOString(),
      })
      .eq('id', groupId);

    if (error) {
      console.error('Error updating group:', error);
      throw error;
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    // First remove all reservation associations
    await supabase
      .from('reservation_groups')
      .delete()
      .eq('group_id', groupId);

    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      console.error('Error deleting group:', error);
      throw error;
    }
  }

  async addReservationToGroup(groupId: string, reservationId: string): Promise<void> {
    const { error } = await supabase
      .from('reservation_groups')
      .insert({
        group_id: groupId,
        reservation_id: reservationId,
      });

    if (error) {
      console.error('Error adding reservation to group:', error);
      throw error;
    }
  }

  async removeReservationFromGroup(groupId: string, reservationId: string): Promise<void> {
    const { error } = await supabase
      .from('reservation_groups')
      .delete()
      .eq('group_id', groupId)
      .eq('reservation_id', reservationId);

    if (error) {
      console.error('Error removing reservation from group:', error);
      throw error;
    }
  }

  async getAvailableReservations(organizationId: number, groupId?: string): Promise<GroupReservation[]> {
    // Get reservations not in any group, or in the specified group
    let query = supabase
      .from('reservations')
      .select(`
        id,
        metadata,
        checkin,
        checkout,
        status,
        total_estimated,
        customers (
          first_name,
          last_name
        ),
        spaces (
          label
        )
      `)
      .eq('organization_id', organizationId)
      .in('status', ['confirmed', 'tentative', 'checked_in']);

    const { data, error } = await query.order('checkin', { ascending: true });

    if (error) {
      console.error('Error fetching available reservations:', error);
      throw error;
    }

    // Get reservations already in groups
    const { data: groupedData } = await supabase
      .from('reservation_groups')
      .select('reservation_id, group_id');

    const groupedIds = new Set(
      (groupedData || [])
        .filter((rg: any) => !groupId || rg.group_id !== groupId)
        .map((rg: any) => rg.reservation_id)
    );

    return (data || [])
      .filter((r: any) => !groupedIds.has(r.id))
      .map((r: any) => ({
        id: r.id,
        code: r.metadata?.code || r.id.substring(0, 8).toUpperCase(),
        customerName: r.customers 
          ? `${r.customers.first_name || ''} ${r.customers.last_name || ''}`.trim() 
          : 'Sin cliente',
        checkin: r.checkin,
        checkout: r.checkout,
        spaceLabel: r.spaces?.label || null,
        status: r.status,
        totalEstimated: r.total_estimated || 0,
      }));
  }

  async getGroupStats(branchId: number): Promise<GroupStats> {
    const groups = await this.getGroups(branchId);
    const today = new Date().toISOString().split('T')[0];

    const activeGroups = groups.filter(g => 
      !g.releaseDate || g.releaseDate >= today
    );

    const totalRoomNights = groups.reduce((sum, g) => sum + (g.roomNights || 0), 0);
    const totalRevenue = groups.reduce((sum, g) => sum + g.totalEstimated, 0);

    return {
      totalGroups: groups.length,
      activeGroups: activeGroups.length,
      totalRoomNights,
      totalRevenue,
    };
  }
}

export default new GroupReservationsService();
