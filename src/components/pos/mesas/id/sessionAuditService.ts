import { supabase } from '@/lib/supabase/config';

export interface SessionAuditEvent {
  id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  sessionId: string;
  changedFields: string[] | null;
  previousData: Record<string, any> | null;
  newData: Record<string, any> | null;
  userId: string | null;
  userName: string;
  createdAt: string;
  descriptions: string[];
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  bill_requested: 'Cuenta solicitada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Sin estado';
  return STATUS_LABELS[status] || status;
}

/**
 * Construye descripciones legibles para un evento de auditoría de table_sessions,
 * comparando previous_data vs new_data según changed_fields.
 */
function buildDescriptions(
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  changedFields: string[] | null,
  previousData: Record<string, any> | null,
  newData: Record<string, any> | null,
  serverNames: Record<string, string>
): string[] {
  if (action === 'INSERT') {
    const customers = newData?.customers;
    const serverName = newData?.server_id ? serverNames[newData.server_id] : undefined;
    const parts = ['Sesión de mesa abierta'];
    if (customers) parts.push(`${customers} comensal(es)`);
    if (serverName) parts.push(`atendida por ${serverName}`);
    return [parts.join(' — ')];
  }

  if (action === 'DELETE') {
    return ['Sesión de mesa eliminada'];
  }

  // UPDATE
  const descriptions: string[] = [];
  const fields = changedFields || [];

  if (fields.includes('server_id')) {
    const prevName = previousData?.server_id ? serverNames[previousData.server_id] : 'Sin asignar';
    const newName = newData?.server_id ? serverNames[newData.server_id] : 'Sin asignar';
    if (prevName !== newName) {
      descriptions.push(`Mesero cambiado: ${prevName} → ${newName}`);
    }
  }

  if (fields.includes('status')) {
    descriptions.push(
      `Estado: ${statusLabel(previousData?.status)} → ${statusLabel(newData?.status)}`
    );
  }

  if (fields.includes('customers') && previousData?.customers !== newData?.customers) {
    descriptions.push(`Comensales actualizados: ${previousData?.customers ?? 0} → ${newData?.customers ?? 0}`);
  }

  if (fields.includes('closed_at') && newData?.closed_at) {
    descriptions.push('Sesión cerrada');
  }

  if (fields.includes('sale_id') && newData?.sale_id && !previousData?.sale_id) {
    descriptions.push('Venta asociada a la sesión');
  }

  if (fields.includes('notes')) {
    descriptions.push('Notas actualizadas');
  }

  if (descriptions.length === 0) {
    descriptions.push(`Actualización (${fields.join(', ') || 'sin detalle'})`);
  }

  return descriptions;
}

export class SessionAuditService {
  /**
   * Obtiene el historial de auditoría (timeline) de todas las sesiones
   * asociadas a una mesa, usando ops_audit_log (poblado automáticamente
   * por el trigger trg_branch_audit en table_sessions).
   */
  static async getTableSessionTimeline(tableId: string, limit = 100): Promise<SessionAuditEvent[]> {
    const { data, error } = await supabase
      .from('ops_audit_log')
      .select('id, action, entity_id, changed_fields, previous_data, new_data, user_id, created_at')
      .eq('entity_type', 'table_sessions')
      .or(
        `new_data->>restaurant_table_id.eq.${tableId},previous_data->>restaurant_table_id.eq.${tableId}`
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error obteniendo timeline de sesión:', error);
      throw error;
    }

    if (!data || data.length === 0) return [];

    // Resolver nombres de meseros involucrados
    const userIds = new Set<string>();
    data.forEach((row) => {
      if (row.user_id) userIds.add(row.user_id);
      const prevServer = (row.previous_data as any)?.server_id;
      const newServer = (row.new_data as any)?.server_id;
      if (prevServer) userIds.add(prevServer);
      if (newServer) userIds.add(newServer);
    });

    let serverNames: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', Array.from(userIds));

      profiles?.forEach((p) => {
        serverNames[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Mesero';
      });
    }

    return data.map((row) => {
      const action = row.action as 'INSERT' | 'UPDATE' | 'DELETE';
      const previousData = row.previous_data as Record<string, any> | null;
      const newData = row.new_data as Record<string, any> | null;
      const changedFields = row.changed_fields as string[] | null;

      return {
        id: row.id,
        action,
        sessionId: row.entity_id,
        changedFields,
        previousData,
        newData,
        userId: row.user_id,
        userName: row.user_id ? serverNames[row.user_id] || 'Usuario' : 'Sistema',
        createdAt: row.created_at,
        descriptions: buildDescriptions(action, changedFields, previousData, newData, serverNames),
      };
    });
  }
}
