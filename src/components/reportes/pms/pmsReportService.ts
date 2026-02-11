import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface PMSFilters {
  dateFrom: string;
  dateTo: string;
  branchId: number | null;
  spaceTypeId: string | null;
  channel: string | null;
}

export interface PMSKPI {
  totalReservas: number;
  reservasConfirmadas: number;
  checkins: number;
  checkouts: number;
  ocupacionPct: number;
  adr: number;        // Average Daily Rate
  revpar: number;     // Revenue Per Available Room
  estadiaPromedio: number;
  ingresoTotal: number;
  bloqueosActivos: number;
}

export interface OcupacionPorDia {
  fecha: string;
  ocupadas: number;
  disponibles: number;
  pctOcupacion: number;
}

export interface IngresoPorCanal {
  channel: string;
  total: number;
  count: number;
}

export interface ReservaPorTipoEspacio {
  space_type_id: string;
  space_type_name: string;
  count: number;
  revenue: number;
}

export interface ReservaResumen {
  id: string;
  checkin: string;
  checkout: string;
  status: string;
  channel: string;
  space_label: string;
  space_type_name: string;
  customer_name: string | null;
  total_estimated: number;
  noches: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(d1: string, d2: string): number {
  const a = new Date(d1);
  const b = new Date(d2);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  const d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end) {
    days.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const pmsReportService = {

  async getKPIs(organizationId: number, filters: PMSFilters): Promise<PMSKPI> {
    // Reservas en el período
    let resQuery = supabase
      .from('reservations')
      .select('id, status, checkin, checkout, total_estimated, channel, space_id')
      .eq('organization_id', organizationId)
      .lte('checkin', filters.dateTo)
      .gte('checkout', filters.dateFrom);

    if (filters.branchId) resQuery = resQuery.eq('branch_id', filters.branchId);
    if (filters.spaceTypeId) resQuery = resQuery.eq('space_type_id', filters.spaceTypeId);
    if (filters.channel) resQuery = resQuery.eq('channel', filters.channel);

    const { data: reservas } = await resQuery;

    let totalReservas = 0;
    let reservasConfirmadas = 0;
    let checkins = 0;
    let checkouts = 0;
    let totalRevenue = 0;
    let totalNoches = 0;

    for (const r of reservas || []) {
      totalReservas++;
      if (r.status === 'confirmed' || r.status === 'checked_in' || r.status === 'checked_out') {
        reservasConfirmadas++;
      }
      if (r.status === 'checked_in') checkins++;
      if (r.status === 'checked_out') checkouts++;
      totalRevenue += Number(r.total_estimated) || 0;
      if (r.checkin && r.checkout) {
        totalNoches += daysBetween(r.checkin, r.checkout);
      }
    }

    const estadiaPromedio = totalReservas > 0 ? totalNoches / totalReservas : 0;

    // Total de espacios disponibles
    let spacesQuery = supabase
      .from('spaces')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available');

    if (filters.branchId) spacesQuery = spacesQuery.eq('branch_id', filters.branchId);
    if (filters.spaceTypeId) spacesQuery = spacesQuery.eq('space_type_id', filters.spaceTypeId);

    const { count: totalSpaces } = await spacesQuery;
    const numSpaces = totalSpaces || 1;
    const numDays = daysBetween(filters.dateFrom, filters.dateTo);
    const totalRoomNights = numSpaces * numDays;

    const ocupacionPct = totalRoomNights > 0 ? (totalNoches / totalRoomNights) * 100 : 0;
    const adr = totalNoches > 0 ? totalRevenue / totalNoches : 0;
    const revpar = totalRoomNights > 0 ? totalRevenue / totalRoomNights : 0;

    // Bloqueos activos
    let blockQuery = supabase
      .from('reservation_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .lte('date_from', filters.dateTo)
      .gte('date_to', filters.dateFrom);

    if (filters.branchId) blockQuery = blockQuery.eq('branch_id', filters.branchId);

    const { count: bloqueosActivos } = await blockQuery;

    return {
      totalReservas, reservasConfirmadas, checkins, checkouts,
      ocupacionPct: Math.min(ocupacionPct, 100),
      adr, revpar, estadiaPromedio,
      ingresoTotal: totalRevenue,
      bloqueosActivos: bloqueosActivos || 0,
    };
  },

  async getOcupacionPorDia(
    organizationId: number,
    filters: PMSFilters
  ): Promise<OcupacionPorDia[]> {
    // Todas las reservas que intersectan el rango
    let resQuery = supabase
      .from('reservations')
      .select('checkin, checkout')
      .eq('organization_id', organizationId)
      .lte('checkin', filters.dateTo)
      .gte('checkout', filters.dateFrom)
      .in('status', ['confirmed', 'checked_in', 'checked_out']);

    if (filters.branchId) resQuery = resQuery.eq('branch_id', filters.branchId);
    if (filters.spaceTypeId) resQuery = resQuery.eq('space_type_id', filters.spaceTypeId);

    const { data: reservas } = await resQuery;

    // Total espacios
    let spacesQuery = supabase
      .from('spaces')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'available');
    if (filters.branchId) spacesQuery = spacesQuery.eq('branch_id', filters.branchId);
    if (filters.spaceTypeId) spacesQuery = spacesQuery.eq('space_type_id', filters.spaceTypeId);
    const { count } = await spacesQuery;
    const totalSpaces = count || 1;

    const days = eachDay(filters.dateFrom, filters.dateTo);
    return days.map((fecha) => {
      let ocupadas = 0;
      for (const r of reservas || []) {
        if (r.checkin && r.checkout && r.checkin <= fecha && r.checkout > fecha) {
          ocupadas++;
        }
      }
      return {
        fecha,
        ocupadas,
        disponibles: Math.max(0, totalSpaces - ocupadas),
        pctOcupacion: totalSpaces > 0 ? Math.min((ocupadas / totalSpaces) * 100, 100) : 0,
      };
    });
  },

  async getIngresosPorCanal(
    organizationId: number,
    filters: PMSFilters
  ): Promise<IngresoPorCanal[]> {
    let query = supabase
      .from('reservations')
      .select('channel, total_estimated')
      .eq('organization_id', organizationId)
      .lte('checkin', filters.dateTo)
      .gte('checkout', filters.dateFrom)
      .in('status', ['confirmed', 'checked_in', 'checked_out']);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);

    const { data } = await query;
    if (!data) return [];

    const grouped: Record<string, { total: number; count: number }> = {};
    for (const r of data) {
      const ch = r.channel || 'Directo';
      if (!grouped[ch]) grouped[ch] = { total: 0, count: 0 };
      grouped[ch].total += Number(r.total_estimated) || 0;
      grouped[ch].count += 1;
    }

    return Object.entries(grouped)
      .map(([channel, v]) => ({ channel, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total);
  },

  async getReservasPorTipoEspacio(
    organizationId: number,
    filters: PMSFilters
  ): Promise<ReservaPorTipoEspacio[]> {
    let query = supabase
      .from('reservations')
      .select('space_type_id, total_estimated')
      .eq('organization_id', organizationId)
      .lte('checkin', filters.dateTo)
      .gte('checkout', filters.dateFrom)
      .not('space_type_id', 'is', null);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.channel) query = query.eq('channel', filters.channel);

    const { data } = await query;
    if (!data) return [];

    const grouped: Record<string, { count: number; revenue: number }> = {};
    for (const r of data) {
      const stid = r.space_type_id;
      if (!stid) continue;
      if (!grouped[stid]) grouped[stid] = { count: 0, revenue: 0 };
      grouped[stid].count += 1;
      grouped[stid].revenue += Number(r.total_estimated) || 0;
    }

    const typeIds = Object.keys(grouped);
    if (typeIds.length === 0) return [];

    const { data: types } = await supabase
      .from('space_types')
      .select('id, name')
      .in('id', typeIds);

    const nameMap: Record<string, string> = {};
    for (const t of types || []) nameMap[t.id] = t.name;

    return Object.entries(grouped)
      .map(([stid, v]) => ({
        space_type_id: stid,
        space_type_name: nameMap[stid] || 'Tipo desconocido',
        count: v.count,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  },

  async getReservasDetalle(
    organizationId: number,
    filters: PMSFilters,
    limit: number = 30
  ): Promise<ReservaResumen[]> {
    let query = supabase
      .from('reservations')
      .select('id, checkin, checkout, status, channel, space_id, space_type_id, customer_id, total_estimated')
      .eq('organization_id', organizationId)
      .lte('checkin', filters.dateTo)
      .gte('checkout', filters.dateFrom)
      .order('checkin', { ascending: false })
      .limit(limit);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.spaceTypeId) query = query.eq('space_type_id', filters.spaceTypeId);
    if (filters.channel) query = query.eq('channel', filters.channel);

    const { data, error } = await query;
    if (error || !data) return [];

    // Resolver nombres
    const spaceIds = Array.from(new Set(data.map((d) => d.space_id).filter(Boolean)));
    const typeIds = Array.from(new Set(data.map((d) => d.space_type_id).filter(Boolean)));
    const customerIds = Array.from(new Set(data.map((d) => d.customer_id).filter(Boolean)));

    const [spacesRes, typesRes, custRes] = await Promise.all([
      spaceIds.length > 0 ? supabase.from('spaces').select('id, label').in('id', spaceIds) : { data: [] },
      typeIds.length > 0 ? supabase.from('space_types').select('id, name').in('id', typeIds) : { data: [] },
      customerIds.length > 0 ? supabase.from('customers').select('id, full_name, first_name, last_name').in('id', customerIds) : { data: [] },
    ]);

    const spaceMap: Record<string, string> = {};
    for (const s of spacesRes.data || []) spaceMap[s.id] = s.label;
    const typeMap: Record<string, string> = {};
    for (const t of typesRes.data || []) typeMap[t.id] = t.name;
    const custMap: Record<string, string> = {};
    for (const c of custRes.data || []) {
      custMap[c.id] = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sin nombre';
    }

    return data.map((r) => ({
      id: r.id,
      checkin: r.checkin || '',
      checkout: r.checkout || '',
      status: r.status || '',
      channel: r.channel || 'Directo',
      space_label: spaceMap[r.space_id] || '—',
      space_type_name: typeMap[r.space_type_id] || '—',
      customer_name: custMap[r.customer_id] || null,
      total_estimated: Number(r.total_estimated) || 0,
      noches: r.checkin && r.checkout ? daysBetween(r.checkin, r.checkout) : 0,
    }));
  },

  async getSpaceTypes(organizationId: number): Promise<{ id: string; name: string }[]> {
    const { data } = await supabase
      .from('space_types')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');
    return data || [];
  },

  async getBranches(organizationId: number): Promise<{ id: number; name: string }[]> {
    const { data } = await supabase.from('branches').select('id, name')
      .eq('organization_id', organizationId).eq('is_active', true).order('name');
    return data || [];
  },

  async getChannels(organizationId: number): Promise<string[]> {
    const { data } = await supabase
      .from('reservations')
      .select('channel')
      .eq('organization_id', organizationId)
      .not('channel', 'is', null);

    if (!data) return [];
    return Array.from(new Set(data.map((d) => d.channel).filter(Boolean))) as string[];
  },

  async saveReport(organizationId: number, userId: string, report: { name: string; filters: PMSFilters }) {
    const { data, error } = await supabase.from('saved_reports').insert({
      organization_id: organizationId, user_id: userId,
      name: report.name, module: 'pms', filters: report.filters as any,
    }).select().single();
    if (error) { console.error('Error saving report:', error); return null; }
    return data;
  },

  async getSavedReports(organizationId: number) {
    const { data } = await supabase.from('saved_reports').select('*')
      .eq('organization_id', organizationId).eq('module', 'pms')
      .order('created_at', { ascending: false });
    return data || [];
  },
};
