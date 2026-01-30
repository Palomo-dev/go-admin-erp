import { supabase } from '@/lib/supabase/config';

export interface AuditLog {
  id: string;
  organization_id: number;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, any> | null;
  metadata: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditStats {
  total: number;
  today: number;
  thisWeek: number;
  byAction: Record<string, number>;
  byEntity: Record<string, number>;
}

export interface AuditFilters {
  action?: string;
  entityType?: string;
  actorType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export const AUDIT_ACTIONS = [
  { value: 'create_tag', label: 'Crear etiqueta' },
  { value: 'update_tag', label: 'Actualizar etiqueta' },
  { value: 'delete_tag', label: 'Eliminar etiqueta' },
  { value: 'create_quick_reply', label: 'Crear respuesta rápida' },
  { value: 'update_quick_reply', label: 'Actualizar respuesta rápida' },
  { value: 'delete_quick_reply', label: 'Eliminar respuesta rápida' },
  { value: 'create_api_key', label: 'Crear llave API' },
  { value: 'revoke_api_key', label: 'Revocar llave API' },
  { value: 'block_session', label: 'Bloquear sesión' },
  { value: 'unblock_session', label: 'Desbloquear sesión' },
  { value: 'create_channel', label: 'Crear canal' },
  { value: 'update_channel', label: 'Actualizar canal' },
  { value: 'delete_channel', label: 'Eliminar canal' },
  { value: 'send_message', label: 'Enviar mensaje' },
  { value: 'assign_conversation', label: 'Asignar conversación' },
  { value: 'close_conversation', label: 'Cerrar conversación' },
  { value: 'update_ai_settings', label: 'Actualizar configuración IA' },
  { value: 'create_fragment', label: 'Crear fragmento' },
  { value: 'update_fragment', label: 'Actualizar fragmento' },
  { value: 'delete_fragment', label: 'Eliminar fragmento' },
];

export const ENTITY_TYPES = [
  { value: 'conversation_tag', label: 'Etiqueta' },
  { value: 'quick_reply', label: 'Respuesta rápida' },
  { value: 'channel_api_key', label: 'Llave API' },
  { value: 'widget_session', label: 'Sesión widget' },
  { value: 'channel', label: 'Canal' },
  { value: 'conversation', label: 'Conversación' },
  { value: 'message', label: 'Mensaje' },
  { value: 'ai_settings', label: 'Configuración IA' },
  { value: 'knowledge_fragment', label: 'Fragmento de conocimiento' },
  { value: 'customer', label: 'Cliente' },
];

export const ACTOR_TYPES = [
  { value: 'member', label: 'Miembro' },
  { value: 'system', label: 'Sistema' },
  { value: 'ai', label: 'IA' },
  { value: 'api', label: 'API' },
  { value: 'customer', label: 'Cliente' },
];

class ChatAuditService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  private async setOrgContext(): Promise<void> {
    await supabase.rpc('set_org_context', { org_id: this.organizationId });
  }

  async getLogs(filters?: AuditFilters, limit: number = 100, offset: number = 0): Promise<{ logs: AuditLog[]; total: number }> {
    await this.setOrgContext();

    let query = supabase
      .from('chat_audit_logs')
      .select('*', { count: 'exact' })
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });

    if (filters?.action) {
      query = query.eq('action', filters.action);
    }

    if (filters?.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }

    if (filters?.actorType) {
      query = query.eq('actor_type', filters.actorType);
    }

    if (filters?.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }

    if (filters?.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    if (filters?.search) {
      query = query.or(`action.ilike.%${filters.search}%,entity_type.ilike.%${filters.search}%`);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('Error obteniendo logs de auditoría:', error);
      return { logs: [], total: 0 };
    }

    return { logs: data || [], total: count || 0 };
  }

  async getLogById(id: string): Promise<AuditLog | null> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('chat_audit_logs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      console.error('Error obteniendo log:', error);
      return null;
    }

    return data;
  }

  async getStats(): Promise<AuditStats> {
    await this.setOrgContext();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: allLogs } = await supabase
      .from('chat_audit_logs')
      .select('id, action, entity_type, created_at')
      .eq('organization_id', this.organizationId);

    if (!allLogs) {
      return { total: 0, today: 0, thisWeek: 0, byAction: {}, byEntity: {} };
    }

    const stats: AuditStats = {
      total: allLogs.length,
      today: allLogs.filter(l => l.created_at >= todayStart).length,
      thisWeek: allLogs.filter(l => l.created_at >= weekStart).length,
      byAction: {},
      byEntity: {}
    };

    allLogs.forEach(log => {
      stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
      stats.byEntity[log.entity_type] = (stats.byEntity[log.entity_type] || 0) + 1;
    });

    return stats;
  }

  async exportLogs(filters?: AuditFilters): Promise<AuditLog[]> {
    await this.setOrgContext();

    let query = supabase
      .from('chat_audit_logs')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });

    if (filters?.action) {
      query = query.eq('action', filters.action);
    }

    if (filters?.entityType) {
      query = query.eq('entity_type', filters.entityType);
    }

    if (filters?.actorType) {
      query = query.eq('actor_type', filters.actorType);
    }

    if (filters?.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }

    if (filters?.dateTo) {
      query = query.lte('created_at', filters.dateTo);
    }

    const { data, error } = await query.limit(5000);

    if (error) {
      console.error('Error exportando logs:', error);
      return [];
    }

    return data || [];
  }

  getActionLabel(action: string): string {
    return AUDIT_ACTIONS.find(a => a.value === action)?.label || action;
  }

  getEntityLabel(entityType: string): string {
    return ENTITY_TYPES.find(e => e.value === entityType)?.label || entityType;
  }

  getActorLabel(actorType: string): string {
    return ACTOR_TYPES.find(a => a.value === actorType)?.label || actorType;
  }
}

export default ChatAuditService;
