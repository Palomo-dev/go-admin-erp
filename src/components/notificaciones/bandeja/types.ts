// ── Tipos para la Bandeja de Notificaciones ──────────────

export interface BandejaNotification {
  id: string;
  organization_id: number;
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: string;
  template_id: string | null;
  payload: Record<string, any>;
  status: string;
  error_msg: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  delivery_logs?: DeliveryLog[];
}

export interface DeliveryLog {
  id: string;
  notification_id: string;
  attempt_no: number;
  provider_response: Record<string, any> | null;
  delivered_at: string;
  status: string;
  created_at: string;
}

export interface NotificationTemplate {
  id: string;
  organization_id: number;
  channel: string;
  name: string;
  subject: string | null;
  body_html: string | null;
  body_text: string;
  variables: string[] | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface UserNotificationPreference {
  user_id: string;
  channel: string;
  mute: boolean;
  allowed_types: string[];
  dnd_start: string | null;
  dnd_end: string | null;
}

export interface OrgMember {
  user_id: string;
  role_id: number | null;
  is_super_admin: boolean;
  is_active: boolean;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
  roles: {
    name: string;
  } | null;
}

export interface Branch {
  id: number;
  name: string;
}

// ── Filtros ──────────────────────────────────────────────

export interface BandejaFilters {
  readStatus: 'all' | 'unread' | 'read';
  status: string; // pending | sent | delivered | read | failed | all
  channel: string; // app | email | sms | push | all
  type: string; // ar_overdue, stock_low, etc. o 'all'
  dateFrom: string;
  dateTo: string;
  search: string;
}

export const DEFAULT_FILTERS: BandejaFilters = {
  readStatus: 'all',
  status: 'all',
  channel: 'all',
  type: 'all',
  dateFrom: '',
  dateTo: '',
  search: '',
};

// ── Stats rápidas ────────────────────────────────────────

export interface BandejaStats {
  total: number;
  unread: number;
  failed: number;
  today: number;
}

// ── Crear notificación manual ────────────────────────────

export interface CreateNotificationPayload {
  recipientUserId: string | null;
  channel: string;
  type: string;
  title: string;
  content: string;
}
