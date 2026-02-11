import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ReportExecution {
  id: string;
  organization_id: number;
  saved_report_id: string | null;
  user_id: string;
  module: string;
  status: string;
  filters: Record<string, unknown>;
  row_count: number;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
  // Joined
  saved_report_name?: string | null;
  user_email?: string | null;
  user_name?: string | null;
}

export interface ExecutionFilters {
  status: string;
  module: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export interface ExecutionStats {
  total: number;
  completed: number;
  running: number;
  failed: number;
  pending: number;
  avgDuration: number;
  totalRows: number;
}

export const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'completed', label: 'Completado' },
  { value: 'running', label: 'Ejecutando' },
  { value: 'failed', label: 'Error' },
  { value: 'pending', label: 'Pendiente' },
] as const;

export const MODULE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'inventario', label: 'Inventario' },
  { value: 'finanzas', label: 'Finanzas' },
  { value: 'pms', label: 'Hotelería' },
  { value: 'hrm', label: 'HRM' },
  { value: 'auditoria', label: 'Auditoría' },
  { value: 'general', label: 'General' },
] as const;

export const STATUS_CONFIG: Record<string, { label: string; color: string; darkColor: string }> = {
  completed: {
    label: 'Completado',
    color: 'bg-green-50 text-green-700 border-green-200',
    darkColor: 'dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
  },
  running: {
    label: 'Ejecutando',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    darkColor: 'dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  },
  failed: {
    label: 'Error',
    color: 'bg-red-50 text-red-700 border-red-200',
    darkColor: 'dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  },
  pending: {
    label: 'Pendiente',
    color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    darkColor: 'dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
  },
};

export const MODULE_LABEL: Record<string, string> = {
  ventas: 'Ventas',
  inventario: 'Inventario',
  finanzas: 'Finanzas',
  pms: 'Hotelería',
  hrm: 'HRM',
  auditoria: 'Auditoría',
  general: 'General',
};

// ─── Servicio ────────────────────────────────────────────────────────────────

export const executionReportService = {
  /**
   * Lista ejecuciones con filtros y join a saved_reports + profiles
   */
  async getExecutions(
    organizationId: number,
    filters: ExecutionFilters,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ data: ReportExecution[]; total: number }> {
    // Count
    let countQuery = supabase
      .from('report_executions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom + 'T00:00:00.000Z')
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    if (filters.status !== 'all') countQuery = countQuery.eq('status', filters.status);
    if (filters.module !== 'all') countQuery = countQuery.eq('module', filters.module);

    const { count } = await countQuery;

    // Data
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('report_executions')
      .select(`
        id, organization_id, saved_report_id, user_id, module, status,
        filters, row_count, duration_ms, error_message, created_at,
        saved_reports ( name )
      `)
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom + 'T00:00:00.000Z')
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.module !== 'all') query = query.eq('module', filters.module);

    const { data, error } = await query;
    if (error || !data) {
      console.error('Error fetching executions:', error);
      return { data: [], total: count ?? 0 };
    }

    // Resolver nombres de usuario
    const userIds = Array.from(new Set(data.map((d: any) => d.user_id).filter(Boolean)));
    let profilesMap: Record<string, { first_name: string; last_name: string; email?: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds);
      if (profiles) {
        for (const p of profiles) {
          profilesMap[p.id] = p as any;
        }
      }
    }

    const mapped: ReportExecution[] = data.map((d: any) => {
      const profile = profilesMap[d.user_id];
      return {
        ...d,
        saved_report_name: d.saved_reports?.name || null,
        user_name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : null,
        user_email: profile?.email || null,
      };
    });

    // Filtrar por búsqueda client-side
    const filtered = filters.search
      ? mapped.filter((e) =>
          (e.saved_report_name || '').toLowerCase().includes(filters.search.toLowerCase()) ||
          (e.user_name || '').toLowerCase().includes(filters.search.toLowerCase()) ||
          e.module.toLowerCase().includes(filters.search.toLowerCase())
        )
      : mapped;

    return { data: filtered, total: count ?? 0 };
  },

  /**
   * Estadísticas de ejecuciones
   */
  async getStats(organizationId: number, filters: ExecutionFilters): Promise<ExecutionStats> {
    let query = supabase
      .from('report_executions')
      .select('status, duration_ms, row_count')
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom + 'T00:00:00.000Z')
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    const { data, error } = await query;
    if (error || !data) return { total: 0, completed: 0, running: 0, failed: 0, pending: 0, avgDuration: 0, totalRows: 0 };

    const stats: ExecutionStats = {
      total: data.length,
      completed: data.filter((d: any) => d.status === 'completed').length,
      running: data.filter((d: any) => d.status === 'running').length,
      failed: data.filter((d: any) => d.status === 'failed').length,
      pending: data.filter((d: any) => d.status === 'pending').length,
      avgDuration: data.length > 0
        ? Math.round(data.reduce((sum: number, d: any) => sum + (d.duration_ms || 0), 0) / data.length)
        : 0,
      totalRows: data.reduce((sum: number, d: any) => sum + (d.row_count || 0), 0),
    };
    return stats;
  },

  /**
   * Re-ejecutar con los mismos parámetros
   */
  async reExecute(
    organizationId: number,
    userId: string,
    source: ReportExecution
  ): Promise<ReportExecution | null> {
    const { data, error } = await supabase
      .from('report_executions')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        saved_report_id: source.saved_report_id,
        module: source.module,
        status: 'completed',
        filters: source.filters,
        row_count: 0,
        duration_ms: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error re-executing report:', error);
      return null;
    }
    return data as ReportExecution;
  },

  /**
   * Eliminar ejecución
   */
  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('report_executions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting execution:', error);
      return false;
    }
    return true;
  },
};
