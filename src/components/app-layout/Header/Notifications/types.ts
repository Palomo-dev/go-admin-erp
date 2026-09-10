/**
 * Tipos para el sistema de notificaciones
 */

export interface Notification {
  id: string;
  organization_id: number;
  recipient_user_id?: string;
  channel: string;
  payload: {
    type: string;
    title: string;
    content: string;
    [key: string]: any; // Para cualquier campo adicional en payload
  };
  status: string;
  read_at: string | null; // Deprecado: usar is_read_by_me para el estado por usuario
  is_read_by_me?: boolean; // true si el usuario actual tiene fila en notification_reads
  created_at: string;
}

export interface NotificationsProps {
  organizationId: string | null;
}
