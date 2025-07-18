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
  read_at: string | null;
  created_at: string;
}

export interface NotificationsProps {
  organizationId: string | null;
}
