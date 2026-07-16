import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getBranchFilter } from '@/lib/hooks/useOrganization';

export interface HistorialSesion {
  id: string;
  tableId: string;
  tableName: string;
  zone: string | null;
  serverId: string | null;
  serverName: string;
  customers: number;
  status: 'active' | 'bill_requested' | 'completed';
  openedAt: string;
  closedAt: string | null;
  durationMinutes: number | null;
  saleTotal: number | null;
}

export interface HistorialFiltros {
  dateFrom: string; // ISO date (yyyy-MM-dd) inclusive, se interpreta desde 00:00:00
  dateTo: string; // ISO date (yyyy-MM-dd) inclusive, se interpreta hasta 23:59:59
  tableId?: string | null;
  serverId?: string | null;
}

export interface HistorialStats {
  totalSesiones: number;
  totalFacturado: number;
  duracionPromedioMin: number;
  comensalesTotales: number;
}

export interface HistorialItemEliminado {
  id: string;
  tableSessionId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  userName: string;
  createdAt: string;
  motivo: string | null;
}

export interface HistorialLiberacion {
  tableSessionId: string;
  userName: string;
  releasedAt: string;
}

function computeDurationMinutes(openedAt: string, closedAt: string | null): number | null {
  if (!closedAt) return null;
  const diffMs = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

export class MesasHistorialService {
  /** Lista de meseros de la organización, para el filtro */
  static async getMeseros(): Promise<{ id: string; name: string }[]> {
    const organizationId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id, profiles:user_id (id, first_name, last_name)')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (error) throw error;

    return (data || [])
      .map((m: any) => {
        const profile = m.profiles;
        const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
        return { id: m.user_id, name: fullName || 'Sin nombre' };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Lista de mesas de la sucursal (o de toda la organización si "todas las sucursales"), para el filtro */
  static async getMesas(): Promise<{ id: string; name: string; zone: string | null }[]> {
    const organizationId = getOrganizationId();
    const branchFilter = getBranchFilter();

    let query = supabase
      .from('restaurant_tables')
      .select('id, name, zone')
      .eq('organization_id', organizationId)
      .order('name');

    if (branchFilter) query = query.eq('branch_id', branchFilter);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /** Historial de sesiones de mesa con filtros de fecha, mesa y mesero */
  static async getHistorial(filtros: HistorialFiltros): Promise<HistorialSesion[]> {
    const organizationId = getOrganizationId();
    const branchFilter = getBranchFilter();

    const fromIso = `${filtros.dateFrom}T00:00:00`;
    const toIso = `${filtros.dateTo}T23:59:59.999`;

    let query = supabase
      .from('table_sessions')
      .select(`
        id,
        restaurant_table_id,
        server_id,
        customers,
        status,
        opened_at,
        closed_at,
        sale_id,
        restaurant_tables(name, zone),
        sales(total)
      `)
      .eq('organization_id', organizationId)
      .gte('opened_at', fromIso)
      .lte('opened_at', toIso)
      .order('opened_at', { ascending: false });

    if (branchFilter) query = query.eq('branch_id', branchFilter);
    if (filtros.tableId) query = query.eq('restaurant_table_id', filtros.tableId);
    if (filtros.serverId) query = query.eq('server_id', filtros.serverId);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Resolver nombres de meseros
    const serverIds = Array.from(new Set(data.map((s: any) => s.server_id).filter(Boolean)));
    let serverNames: Record<string, string> = {};
    if (serverIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', serverIds);

      profiles?.forEach((p: any) => {
        serverNames[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Mesero';
      });
    }

    return data.map((s: any) => ({
      id: s.id,
      tableId: s.restaurant_table_id,
      tableName: s.restaurant_tables?.name || 'Mesa',
      zone: s.restaurant_tables?.zone || null,
      serverId: s.server_id,
      serverName: s.server_id ? serverNames[s.server_id] || 'Mesero' : 'Sin asignar',
      customers: s.customers || 0,
      status: s.status,
      openedAt: s.opened_at,
      closedAt: s.closed_at,
      durationMinutes: computeDurationMinutes(s.opened_at, s.closed_at),
      saleTotal: s.sales?.total ?? null,
    }));
  }

  /**
   * Obtiene los productos eliminados/cancelados de las sesiones indicadas,
   * agrupados por table_session_id, a partir del registro en ops_audit_log
   * que escribe PedidosService.eliminarItem().
   */
  static async getItemsEliminados(
    sessionIds: string[],
    filtros: Pick<HistorialFiltros, 'dateFrom' | 'dateTo'>
  ): Promise<Record<string, HistorialItemEliminado[]>> {
    if (sessionIds.length === 0) return {};

    const organizationId = getOrganizationId();
    const fromIso = `${filtros.dateFrom}T00:00:00`;
    const toIso = `${filtros.dateTo}T23:59:59.999`;

    const { data, error } = await supabase
      .from('ops_audit_log')
      .select('id, user_id, previous_data, metadata, created_at')
      .eq('organization_id', organizationId)
      .eq('entity_type', 'sale_items')
      .eq('action', 'DELETE')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return {};

    const sessionIdSet = new Set(sessionIds);
    const relevant = data.filter((row: any) => sessionIdSet.has(row.metadata?.table_session_id));
    if (relevant.length === 0) return {};

    // Resolver nombres de usuarios que eliminaron items
    const userIds = Array.from(new Set(relevant.map((r: any) => r.user_id).filter(Boolean)));
    let userNames: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds);

      profiles?.forEach((p: any) => {
        userNames[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Usuario';
      });
    }

    const result: Record<string, HistorialItemEliminado[]> = {};
    relevant.forEach((row: any) => {
      const sessionId = row.metadata?.table_session_id as string;
      const prev = row.previous_data || {};
      const evento: HistorialItemEliminado = {
        id: row.id,
        tableSessionId: sessionId,
        productName: prev.product_name || 'Producto',
        quantity: prev.quantity || 0,
        unitPrice: prev.unit_price || 0,
        total: prev.total || 0,
        userName: row.user_id ? userNames[row.user_id] || 'Usuario' : 'Sistema',
        createdAt: row.created_at,
        motivo: row.metadata?.motivo || null,
      };
      if (!result[sessionId]) result[sessionId] = [];
      result[sessionId].push(evento);
    });

    return result;
  }

  /**
   * Obtiene los eventos de liberación de mesa desde ops_audit_log,
   * agrupados por table_session_id, para mostrar quién liberó cada sesión.
   */
  static async getLiberaciones(
    sessionIds: string[],
    filtros: Pick<HistorialFiltros, 'dateFrom' | 'dateTo'>
  ): Promise<Record<string, HistorialLiberacion>> {
    if (sessionIds.length === 0) return {};

    const organizationId = getOrganizationId();
    const fromIso = `${filtros.dateFrom}T00:00:00`;
    const toIso = `${filtros.dateTo}T23:59:59.999`;

    const { data, error } = await supabase
      .from('ops_audit_log')
      .select('id, user_id, metadata, created_at')
      .eq('organization_id', organizationId)
      .eq('entity_type', 'table_sessions')
      .eq('action', 'RELEASE')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return {};

    const sessionIdSet = new Set(sessionIds);
    const relevant = data.filter((row: any) => sessionIdSet.has(row.metadata?.table_session_id));
    if (relevant.length === 0) return {};

    const userIds = Array.from(new Set(relevant.map((r: any) => r.user_id).filter(Boolean)));
    let userNames: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds);

      profiles?.forEach((p: any) => {
        userNames[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Usuario';
      });
    }

    const result: Record<string, HistorialLiberacion> = {};
    relevant.forEach((row: any) => {
      const sessionId = row.metadata?.table_session_id as string;
      if (!sessionId || result[sessionId]) return;
      result[sessionId] = {
        tableSessionId: sessionId,
        userName: row.user_id ? userNames[row.user_id] || 'Usuario' : 'Sistema',
        releasedAt: row.metadata?.released_at || row.created_at,
      };
    });

    return result;
  }

  /** Calcula estadísticas resumidas sobre un conjunto de sesiones ya cargado */
  static computeStats(sesiones: HistorialSesion[]): HistorialStats {
    const totalSesiones = sesiones.length;
    const totalFacturado = sesiones.reduce((sum, s) => sum + (s.saleTotal || 0), 0);
    const comensalesTotales = sesiones.reduce((sum, s) => sum + (s.customers || 0), 0);
    const conDuracion = sesiones.filter((s) => s.durationMinutes !== null);
    const duracionPromedioMin = conDuracion.length > 0
      ? Math.round(conDuracion.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / conDuracion.length)
      : 0;

    return { totalSesiones, totalFacturado, duracionPromedioMin, comensalesTotales };
  }
}
