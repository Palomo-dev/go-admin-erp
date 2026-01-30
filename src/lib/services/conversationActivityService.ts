import { supabase } from '@/lib/supabase/config';

export type ActivityType = 'status_change' | 'assignment' | 'tag_added' | 'tag_removed' | 'ai_job' | 'audit';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: string;
  actor?: {
    type: 'member' | 'system' | 'ai';
    id?: string | number;
    name?: string;
  };
  data: Record<string, any>;
  description: string;
}

export interface StatusChangeActivity {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by_member_id: number | null;
  reason: string | null;
  created_at: string;
}

export interface AssignmentActivity {
  id: string;
  assigned_member_id: number | null;
  assigned_by_member_id: number | null;
  reason: string | null;
  created_at: string;
}

export interface TagActivity {
  id: string;
  tag_id: string;
  created_by: number | null;
  created_at: string;
  tag?: {
    name: string;
    color: string;
  };
}

export interface AIJobActivity {
  id: string;
  job_type: string;
  status: string;
  response_text: string | null;
  confidence_score: number | null;
  total_cost: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AuditLogActivity {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, any> | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface ActivityStats {
  totalActivities: number;
  statusChanges: number;
  assignments: number;
  tagChanges: number;
  aiJobs: number;
  auditLogs: number;
}

class ConversationActivityService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAllActivities(conversationId: string): Promise<ActivityItem[]> {
    const [statusChanges, assignments, tagRelations, aiJobs, auditLogs] = await Promise.all([
      this.getStatusHistory(conversationId),
      this.getAssignments(conversationId),
      this.getTagRelations(conversationId),
      this.getAIJobs(conversationId),
      this.getAuditLogs(conversationId)
    ]);

    const activities: ActivityItem[] = [];

    statusChanges.forEach(item => {
      activities.push({
        id: item.id,
        type: 'status_change',
        timestamp: item.created_at,
        actor: item.changed_by_member_id 
          ? { type: 'member', id: item.changed_by_member_id }
          : { type: 'system' },
        data: item,
        description: this.formatStatusChange(item)
      });
    });

    assignments.forEach(item => {
      activities.push({
        id: item.id,
        type: 'assignment',
        timestamp: item.created_at,
        actor: item.assigned_by_member_id
          ? { type: 'member', id: item.assigned_by_member_id }
          : { type: 'system' },
        data: item,
        description: this.formatAssignment(item)
      });
    });

    tagRelations.forEach(item => {
      activities.push({
        id: item.id,
        type: 'tag_added',
        timestamp: item.created_at,
        actor: item.created_by
          ? { type: 'member', id: item.created_by }
          : { type: 'system' },
        data: item,
        description: this.formatTagChange(item)
      });
    });

    aiJobs.forEach(item => {
      activities.push({
        id: item.id,
        type: 'ai_job',
        timestamp: item.created_at,
        actor: { type: 'ai' },
        data: item,
        description: this.formatAIJob(item)
      });
    });

    auditLogs.forEach(item => {
      activities.push({
        id: item.id,
        type: 'audit',
        timestamp: item.created_at,
        actor: {
          type: item.actor_type as 'member' | 'system' | 'ai',
          id: item.actor_id || undefined
        },
        data: item,
        description: this.formatAuditLog(item)
      });
    });

    return activities.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async getStatusHistory(conversationId: string): Promise<StatusChangeActivity[]> {
    const { data, error } = await supabase
      .from('conversation_status_history')
      .select('*')
      .eq('organization_id', this.organizationId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo historial de estados:', error);
      return [];
    }
    return data || [];
  }

  async getAssignments(conversationId: string): Promise<AssignmentActivity[]> {
    const { data, error } = await supabase
      .from('conversation_assignments')
      .select('*')
      .eq('organization_id', this.organizationId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo asignaciones:', error);
      return [];
    }
    return data || [];
  }

  async getTagRelations(conversationId: string): Promise<TagActivity[]> {
    const { data, error } = await supabase
      .from('conversation_tag_relations')
      .select(`
        id,
        tag_id,
        created_by,
        created_at,
        conversation_tags (
          name,
          color
        )
      `)
      .eq('organization_id', this.organizationId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo etiquetas:', error);
      return [];
    }

    return (data || []).map(item => ({
      ...item,
      tag: item.conversation_tags as any
    }));
  }

  async getAIJobs(conversationId: string): Promise<AIJobActivity[]> {
    const { data, error } = await supabase
      .from('ai_jobs')
      .select('*')
      .eq('organization_id', this.organizationId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo trabajos IA:', error);
      return [];
    }
    return data || [];
  }

  async getAuditLogs(conversationId: string): Promise<AuditLogActivity[]> {
    const { data, error } = await supabase
      .from('chat_audit_logs')
      .select('*')
      .eq('organization_id', this.organizationId)
      .eq('entity_id', conversationId)
      .eq('entity_type', 'conversation')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo logs de auditoría:', error);
      return [];
    }
    return data || [];
  }

  async getStats(conversationId: string): Promise<ActivityStats> {
    const activities = await this.getAllActivities(conversationId);

    return {
      totalActivities: activities.length,
      statusChanges: activities.filter(a => a.type === 'status_change').length,
      assignments: activities.filter(a => a.type === 'assignment').length,
      tagChanges: activities.filter(a => a.type === 'tag_added' || a.type === 'tag_removed').length,
      aiJobs: activities.filter(a => a.type === 'ai_job').length,
      auditLogs: activities.filter(a => a.type === 'audit').length
    };
  }

  exportToCSV(activities: ActivityItem[]): string {
    const headers = ['Fecha', 'Tipo', 'Actor', 'Descripción'];
    const rows = activities.map(a => [
      new Date(a.timestamp).toLocaleString('es-ES'),
      this.getTypeLabel(a.type),
      a.actor?.type === 'ai' ? 'IA' : a.actor?.type === 'system' ? 'Sistema' : `Miembro #${a.actor?.id}`,
      a.description
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  private formatStatusChange(item: StatusChangeActivity): string {
    const statusLabels: Record<string, string> = {
      open: 'Abierta',
      pending: 'Pendiente',
      closed: 'Cerrada'
    };
    const from = item.from_status ? statusLabels[item.from_status] || item.from_status : 'Sin estado';
    const to = statusLabels[item.to_status] || item.to_status;
    return `Estado cambiado de "${from}" a "${to}"${item.reason ? `. Razón: ${item.reason}` : ''}`;
  }

  private formatAssignment(item: AssignmentActivity): string {
    if (item.assigned_member_id) {
      return `Conversación asignada al miembro #${item.assigned_member_id}${item.reason ? `. Razón: ${item.reason}` : ''}`;
    }
    return `Asignación removida${item.reason ? `. Razón: ${item.reason}` : ''}`;
  }

  private formatTagChange(item: TagActivity): string {
    const tagName = item.tag?.name || `Tag #${item.tag_id}`;
    return `Etiqueta "${tagName}" agregada`;
  }

  private formatAIJob(item: AIJobActivity): string {
    const jobTypes: Record<string, string> = {
      suggested_response: 'Respuesta sugerida',
      auto_response: 'Respuesta automática',
      summary: 'Resumen',
      intent_classification: 'Clasificación de intención'
    };
    const type = jobTypes[item.job_type] || item.job_type;
    const status = item.status === 'completed' ? 'completado' : 
                   item.status === 'failed' ? 'fallido' : item.status;
    return `Trabajo IA "${type}" ${status}${item.confidence_score ? ` (confianza: ${Math.round(item.confidence_score * 100)}%)` : ''}`;
  }

  private formatAuditLog(item: AuditLogActivity): string {
    const actions: Record<string, string> = {
      create: 'Creación',
      update: 'Actualización',
      delete: 'Eliminación',
      assign: 'Asignación',
      unassign: 'Desasignación'
    };
    return `${actions[item.action] || item.action} de ${item.entity_type}`;
  }

  getTypeLabel(type: ActivityType): string {
    const labels: Record<ActivityType, string> = {
      status_change: 'Cambio de estado',
      assignment: 'Asignación',
      tag_added: 'Etiqueta agregada',
      tag_removed: 'Etiqueta removida',
      ai_job: 'Trabajo IA',
      audit: 'Auditoría'
    };
    return labels[type] || type;
  }

  getTypeColor(type: ActivityType): string {
    const colors: Record<ActivityType, string> = {
      status_change: 'blue',
      assignment: 'green',
      tag_added: 'purple',
      tag_removed: 'orange',
      ai_job: 'violet',
      audit: 'gray'
    };
    return colors[type] || 'gray';
  }
}

export default ConversationActivityService;
