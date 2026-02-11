import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface AuditoriaFilters {
  dateFrom: string;
  dateTo: string;
  module: string | null;  // ops | finance | products | roles | integration
  action: string | null;  // create | update | delete
  userId: string | null;
}

export interface AuditoriaKPI {
  totalEventos: number;
  creates: number;
  updates: number;
  deletes: number;
  usuariosActivos: number;
  erroresIntegracion: number;
  cambiosProductos: number;
  cambiosFinanzas: number;
}

export interface EventosPorDia {
  fecha: string;
  creates: number;
  updates: number;
  deletes: number;
}

export interface EventosPorModulo {
  module: string;
  count: number;
}

export interface UsuarioActivo {
  user_id: string;
  user_name: string;
  total_actions: number;
  creates: number;
  updates: number;
  deletes: number;
}

export interface ErrorIntegracion {
  source: string;
  event_type: string;
  count: number;
  last_error: string;
}

export interface EventoAuditoria {
  id: string;
  module: string;
  entity_type: string;
  entity_id: string;
  action: string;
  user_name: string;
  created_at: string;
  ip_address: string | null;
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const auditoriaReportService = {

  async getKPIs(organizationId: number, filters: AuditoriaFilters): Promise<AuditoriaKPI> {
    // ops_audit_log
    const { data: opsData } = await supabase
      .from('ops_audit_log')
      .select('action, user_id')
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    // finance_audit_log
    const { data: finData } = await supabase
      .from('finance_audit_log')
      .select('action, user_id')
      .eq('organization_id', organizationId)
      .gte('timestamp', filters.dateFrom)
      .lte('timestamp', filters.dateTo + 'T23:59:59.999Z');

    // products_audit_log
    const { data: prodData } = await supabase
      .from('products_audit_log')
      .select('action_type, user_id')
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    // integration errors
    const { count: erroresIntegracion } = await supabase
      .from('integration_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'error')
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    // Contar acciones
    const allActions: { action: string; user_id: string }[] = [];
    for (const e of opsData || []) allActions.push({ action: e.action, user_id: e.user_id });
    for (const e of finData || []) allActions.push({ action: e.action, user_id: e.user_id });
    for (const e of prodData || []) allActions.push({ action: e.action_type, user_id: e.user_id });

    let creates = 0, updates = 0, deletes = 0;
    const userSet = new Set<string>();
    for (const a of allActions) {
      const act = (a.action || '').toLowerCase();
      if (act.includes('create') || act.includes('insert')) creates++;
      else if (act.includes('update') || act.includes('edit')) updates++;
      else if (act.includes('delete') || act.includes('remove')) deletes++;
      if (a.user_id) userSet.add(a.user_id);
    }

    return {
      totalEventos: allActions.length,
      creates, updates, deletes,
      usuariosActivos: userSet.size,
      erroresIntegracion: erroresIntegracion || 0,
      cambiosProductos: (prodData || []).length,
      cambiosFinanzas: (finData || []).length,
    };
  },

  async getEventosPorDia(
    organizationId: number,
    filters: AuditoriaFilters
  ): Promise<EventosPorDia[]> {
    const { data: opsData } = await supabase
      .from('ops_audit_log')
      .select('action, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    const grouped: Record<string, { creates: number; updates: number; deletes: number }> = {};
    for (const e of opsData || []) {
      const fecha = new Date(e.created_at).toISOString().split('T')[0];
      if (!grouped[fecha]) grouped[fecha] = { creates: 0, updates: 0, deletes: 0 };
      const act = (e.action || '').toLowerCase();
      if (act.includes('create') || act.includes('insert')) grouped[fecha].creates++;
      else if (act.includes('update') || act.includes('edit')) grouped[fecha].updates++;
      else if (act.includes('delete') || act.includes('remove')) grouped[fecha].deletes++;
    }

    return Object.entries(grouped)
      .map(([fecha, v]) => ({ fecha, ...v }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  },

  async getEventosPorModulo(
    organizationId: number,
    filters: AuditoriaFilters
  ): Promise<EventosPorModulo[]> {
    const results: EventosPorModulo[] = [];

    // ops
    const { count: opsCount } = await supabase
      .from('ops_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');
    if (opsCount) results.push({ module: 'Operaciones', count: opsCount });

    // finance
    const { count: finCount } = await supabase
      .from('finance_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('timestamp', filters.dateFrom)
      .lte('timestamp', filters.dateTo + 'T23:59:59.999Z');
    if (finCount) results.push({ module: 'Finanzas', count: finCount });

    // products
    const { count: prodCount } = await supabase
      .from('products_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');
    if (prodCount) results.push({ module: 'Productos', count: prodCount });

    // roles
    const { count: rolesCount } = await supabase
      .from('roles_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');
    if (rolesCount) results.push({ module: 'Roles', count: rolesCount });

    // integration
    const { count: intCount } = await supabase
      .from('integration_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');
    if (intCount) results.push({ module: 'Integraciones', count: intCount });

    return results.sort((a, b) => b.count - a.count);
  },

  async getUsuariosActivos(
    organizationId: number,
    filters: AuditoriaFilters,
    limit: number = 10
  ): Promise<UsuarioActivo[]> {
    const { data } = await supabase
      .from('ops_audit_log')
      .select('user_id, action')
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    if (!data || data.length === 0) return [];

    const grouped: Record<string, { total: number; creates: number; updates: number; deletes: number }> = {};
    for (const e of data) {
      const uid = e.user_id;
      if (!uid) continue;
      if (!grouped[uid]) grouped[uid] = { total: 0, creates: 0, updates: 0, deletes: 0 };
      grouped[uid].total++;
      const act = (e.action || '').toLowerCase();
      if (act.includes('create') || act.includes('insert')) grouped[uid].creates++;
      else if (act.includes('update') || act.includes('edit')) grouped[uid].updates++;
      else if (act.includes('delete') || act.includes('remove')) grouped[uid].deletes++;
    }

    const userIds = Object.keys(grouped);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', userIds);

    const nameMap: Record<string, string> = {};
    for (const p of profiles || []) {
      nameMap[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre';
    }

    return Object.entries(grouped)
      .map(([uid, v]) => ({
        user_id: uid,
        user_name: nameMap[uid] || uid.substring(0, 8),
        total_actions: v.total,
        creates: v.creates, updates: v.updates, deletes: v.deletes,
      }))
      .sort((a, b) => b.total_actions - a.total_actions)
      .slice(0, limit);
  },

  async getErroresIntegracion(
    organizationId: number,
    filters: AuditoriaFilters,
    limit: number = 10
  ): Promise<ErrorIntegracion[]> {
    const { data } = await supabase
      .from('integration_events')
      .select('source, event_type, error_message')
      .eq('organization_id', organizationId)
      .eq('status', 'error')
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z')
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) return [];

    const grouped: Record<string, { count: number; lastError: string }> = {};
    for (const e of data) {
      const key = `${e.source || 'unknown'}|${e.event_type || 'unknown'}`;
      if (!grouped[key]) grouped[key] = { count: 0, lastError: '' };
      grouped[key].count++;
      if (!grouped[key].lastError && e.error_message) grouped[key].lastError = e.error_message;
    }

    return Object.entries(grouped)
      .map(([key, v]) => {
        const [source, event_type] = key.split('|');
        return { source, event_type, count: v.count, last_error: v.lastError };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  async getEventosRecientes(
    organizationId: number,
    filters: AuditoriaFilters,
    limit: number = 30
  ): Promise<EventoAuditoria[]> {
    let query = supabase
      .from('ops_audit_log')
      .select('id, entity_type, entity_id, action, user_id, created_at, ip_address')
      .eq('organization_id', organizationId)
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters.action) {
      query = query.ilike('action', `%${filters.action}%`);
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    const userIds = Array.from(new Set(data.map((d) => d.user_id).filter(Boolean)));
    const { data: profiles } = userIds.length > 0
      ? await supabase.from('profiles').select('id, first_name, last_name').in('id', userIds)
      : { data: [] };

    const nameMap: Record<string, string> = {};
    for (const p of profiles || []) {
      nameMap[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre';
    }

    return data.map((e) => ({
      id: e.id,
      module: 'ops',
      entity_type: e.entity_type || '',
      entity_id: e.entity_id || '',
      action: e.action || '',
      user_name: nameMap[e.user_id] || e.user_id?.substring(0, 8) || '—',
      created_at: e.created_at,
      ip_address: e.ip_address || null,
    }));
  },

  async getBranches(organizationId: number): Promise<{ id: number; name: string }[]> {
    const { data } = await supabase.from('branches').select('id, name')
      .eq('organization_id', organizationId).eq('is_active', true).order('name');
    return data || [];
  },

  async saveReport(organizationId: number, userId: string, report: { name: string; filters: AuditoriaFilters }) {
    const { data, error } = await supabase.from('saved_reports').insert({
      organization_id: organizationId, user_id: userId,
      name: report.name, module: 'auditoria', filters: report.filters as any,
    }).select().single();
    if (error) { console.error('Error saving report:', error); return null; }
    return data;
  },

  async getSavedReports(organizationId: number) {
    const { data } = await supabase.from('saved_reports').select('*')
      .eq('organization_id', organizationId).eq('module', 'auditoria')
      .order('created_at', { ascending: false });
    return data || [];
  },
};
