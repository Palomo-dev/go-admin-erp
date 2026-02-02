'use client';

import { supabase } from '@/lib/supabase/config';

export interface TimelineEvent {
  event_id: string;
  organization_id: number;
  source_category: 'audit' | 'domain_event' | 'status_history';
  source_table: string;
  event_type: string;
  action: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  branch_id: number | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  event_time: string;
  correlation_id: string | null;
  created_at: string;
  // Campos resueltos (JOINs)
  actor_name?: string;
  actor_email?: string;
  branch_name?: string;
}

export interface TimelineFilters {
  startDate: string;
  endDate: string;
  sourceCategory?: string;
  sourceTable?: string;
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  branchId?: number;
  correlationId?: string;
  searchText?: string;
}

export interface TimelineStats {
  totalEvents: number;
  todayEvents: number;
  byCategory: Record<string, number>;
  byAction: Record<string, number>;
  topActors: Array<{ actor_id: string; count: number; name?: string }>;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  hasMore: boolean;
}

// Mapeo de categorías a nombres legibles
export const SOURCE_CATEGORY_LABELS: Record<string, string> = {
  audit: 'Auditoría',
  domain_event: 'Evento de Sistema',
  status_history: 'Historial de Estado',
};

// Mapeo de tablas a nombres legibles
export const SOURCE_TABLE_LABELS: Record<string, string> = {
  ops_audit_log: 'Operaciones',
  finance_audit_log: 'Finanzas',
  products_audit_log: 'Productos',
  roles_audit_log: 'Roles y Permisos',
  chat_audit_logs: 'Chat/Inbox',
  transport_events: 'Transporte',
  integration_events: 'Integraciones',
  electronic_invoicing_events: 'Facturación DIAN',
  attendance_events: 'Asistencia',
  membership_events: 'Membresías',
  message_events: 'Mensajes',
  conversation_status_history: 'Conversaciones',
  plan_history: 'Planes',
};

// Mapeo de acciones a nombres legibles
export const ACTION_LABELS: Record<string, string> = {
  create: 'Crear',
  update: 'Actualizar',
  delete: 'Eliminar',
  assign: 'Asignar',
  close: 'Cerrar',
  open: 'Abrir',
  approve: 'Aprobar',
  reject: 'Rechazar',
  reconcile: 'Conciliar',
  void: 'Anular',
  transfer: 'Transferir',
  status_change: 'Cambio de Estado',
  plan_change: 'Cambio de Plan',
};

// Colores por categoría
export const SOURCE_CATEGORY_COLORS: Record<string, string> = {
  audit: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  domain_event: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  status_history: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

// Colores por tabla fuente
export const SOURCE_TABLE_COLORS: Record<string, string> = {
  ops_audit_log: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  finance_audit_log: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  products_audit_log: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  roles_audit_log: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  chat_audit_logs: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  transport_events: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  integration_events: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  electronic_invoicing_events: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  attendance_events: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  membership_events: 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400',
  message_events: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  conversation_status_history: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  plan_history: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

class TimelineService {
  /**
   * Obtiene eventos del timeline con filtros y paginación
   */
  async getEvents(
    organizationId: number,
    filters: TimelineFilters,
    page: number = 1,
    pageSize: number = 50
  ): Promise<PaginatedResult<TimelineEvent>> {
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('timeline_unified')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .gte('event_time', filters.startDate)
      .lte('event_time', filters.endDate)
      .order('event_time', { ascending: false })
      .range(offset, offset + pageSize - 1);

    // Aplicar filtros opcionales
    if (filters.sourceCategory) {
      query = query.eq('source_category', filters.sourceCategory);
    }
    if (filters.sourceTable) {
      query = query.eq('source_table', filters.sourceTable);
    }
    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    if (filters.actorId) {
      query = query.eq('actor_id', filters.actorId);
    }
    if (filters.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }
    if (filters.entityId) {
      query = query.eq('entity_id', filters.entityId);
    }
    if (filters.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }
    if (filters.correlationId) {
      query = query.eq('correlation_id', filters.correlationId);
    }
    if (filters.searchText) {
      // Búsqueda en múltiples campos
      query = query.or(
        `event_type.ilike.%${filters.searchText}%,action.ilike.%${filters.searchText}%,entity_type.ilike.%${filters.searchText}%,entity_id.ilike.%${filters.searchText}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching timeline events:', error);
      throw error;
    }

    return {
      data: data || [],
      count: count || 0,
      hasMore: (count || 0) > offset + pageSize,
    };
  }

  /**
   * Obtiene un evento específico por ID
   */
  async getEventById(eventId: string): Promise<TimelineEvent | null> {
    const { data, error } = await supabase
      .from('timeline_unified')
      .select('*')
      .eq('event_id', eventId)
      .single();

    if (error) {
      console.error('Error fetching event:', error);
      return null;
    }

    return data;
  }

  /**
   * Obtiene eventos agrupados por correlation_id
   */
  async getCorrelatedEvents(
    organizationId: number,
    correlationId: string
  ): Promise<TimelineEvent[]> {
    const { data, error } = await supabase
      .from('timeline_unified')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('correlation_id', correlationId)
      .order('event_time', { ascending: true });

    if (error) {
      console.error('Error fetching correlated events:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Obtiene estadísticas del timeline
   */
  async getStats(
    organizationId: number,
    startDate: string,
    endDate: string
  ): Promise<TimelineStats> {
    const today = new Date().toISOString().split('T')[0];

    // Total de eventos en el rango
    const { count: totalEvents } = await supabase
      .from('timeline_unified')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('event_time', startDate)
      .lte('event_time', endDate);

    // Eventos de hoy
    const { count: todayEvents } = await supabase
      .from('timeline_unified')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('event_time', today);

    // Por categoría
    const { data: categoryData } = await supabase
      .from('timeline_unified')
      .select('source_category')
      .eq('organization_id', organizationId)
      .gte('event_time', startDate)
      .lte('event_time', endDate);

    const byCategory: Record<string, number> = {};
    categoryData?.forEach((item) => {
      byCategory[item.source_category] = (byCategory[item.source_category] || 0) + 1;
    });

    // Por acción (top 10)
    const { data: actionData } = await supabase
      .from('timeline_unified')
      .select('action')
      .eq('organization_id', organizationId)
      .gte('event_time', startDate)
      .lte('event_time', endDate);

    const byAction: Record<string, number> = {};
    actionData?.forEach((item) => {
      byAction[item.action] = (byAction[item.action] || 0) + 1;
    });

    // Top actores
    const { data: actorData } = await supabase
      .from('timeline_unified')
      .select('actor_id')
      .eq('organization_id', organizationId)
      .gte('event_time', startDate)
      .lte('event_time', endDate)
      .not('actor_id', 'is', null);

    const actorCounts: Record<string, number> = {};
    actorData?.forEach((item) => {
      if (item.actor_id) {
        actorCounts[item.actor_id] = (actorCounts[item.actor_id] || 0) + 1;
      }
    });

    const topActors = Object.entries(actorCounts)
      .map(([actor_id, count]) => ({ actor_id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalEvents: totalEvents || 0,
      todayEvents: todayEvents || 0,
      byCategory,
      byAction,
      topActors,
    };
  }

  /**
   * Obtiene las tablas fuente disponibles
   */
  async getAvailableSourceTables(organizationId: number): Promise<string[]> {
    const { data } = await supabase
      .from('timeline_unified')
      .select('source_table')
      .eq('organization_id', organizationId)
      .limit(1000);

    const tables = new Set<string>();
    data?.forEach((item) => tables.add(item.source_table));
    return Array.from(tables).sort();
  }

  /**
   * Obtiene las acciones disponibles
   */
  async getAvailableActions(organizationId: number): Promise<string[]> {
    const { data } = await supabase
      .from('timeline_unified')
      .select('action')
      .eq('organization_id', organizationId)
      .limit(1000);

    const actions = new Set<string>();
    data?.forEach((item) => actions.add(item.action));
    return Array.from(actions).sort();
  }

  /**
   * Obtiene tipos de entidad disponibles
   */
  async getAvailableEntityTypes(organizationId: number): Promise<string[]> {
    const { data } = await supabase
      .from('timeline_unified')
      .select('entity_type')
      .eq('organization_id', organizationId)
      .limit(1000);

    const types = new Set<string>();
    data?.forEach((item) => types.add(item.entity_type));
    return Array.from(types).sort();
  }

  /**
   * Exporta eventos a JSON
   */
  async exportToJSON(
    organizationId: number,
    filters: TimelineFilters
  ): Promise<TimelineEvent[]> {
    const { data } = await this.getEvents(organizationId, filters, 1, 10000);
    return data;
  }

  /**
   * Exporta eventos a CSV
   */
  async exportToCSV(
    organizationId: number,
    filters: TimelineFilters
  ): Promise<string> {
    const events = await this.exportToJSON(organizationId, filters);
    
    const headers = [
      'Fecha/Hora',
      'Categoría',
      'Módulo',
      'Acción',
      'Tipo Entidad',
      'ID Entidad',
      'Actor ID',
      'IP',
      'Correlation ID',
    ];

    const rows = events.map((event) => [
      new Date(event.event_time).toLocaleString('es-CO'),
      SOURCE_CATEGORY_LABELS[event.source_category] || event.source_category,
      SOURCE_TABLE_LABELS[event.source_table] || event.source_table,
      ACTION_LABELS[event.action] || event.action,
      event.entity_type,
      event.entity_id,
      event.actor_id || '',
      event.ip_address || '',
      event.correlation_id || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Resuelve nombres de actores
   */
  async resolveActorNames(actorIds: string[]): Promise<Record<string, string>> {
    if (actorIds.length === 0) return {};

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', actorIds);

    const names: Record<string, string> = {};
    data?.forEach((profile) => {
      names[profile.id] = profile.full_name || profile.email || 'Usuario';
    });

    return names;
  }

  /**
   * Resuelve nombres de sucursales
   */
  async resolveBranchNames(branchIds: number[]): Promise<Record<number, string>> {
    if (branchIds.length === 0) return {};

    const { data } = await supabase
      .from('branches')
      .select('id, name')
      .in('id', branchIds);

    const names: Record<number, string> = {};
    data?.forEach((branch) => {
      names[branch.id] = branch.name;
    });

    return names;
  }
}

export const timelineService = new TimelineService();
export default timelineService;
