/**
 * Tipos para el sistema de notificaciones
 * Basado en las tablas 'notifications' y 'system_alerts' de Supabase
 */

// ========================
// TIPOS BASE
// ========================

/**
 * Estados posibles de una notificación
 * - pending: Recién creada, esperando envío
 * - sent: Enviada exitosamente al proveedor
 * - delivered: Confirmada como entregada al destinatario
 * - failed: Fallo en el envío
 * - read: Leída por el usuario (estado final)
 */
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'read';

/**
 * Canales de notificación disponibles
 */
export type NotificationChannel = 'email' | 'sms' | 'push' | 'whatsapp' | 'webhook';
// Nota: Los canales válidos según constraints de BD son: email, push, whatsapp, sms, webhook

/**
 * Severidad de las alertas del sistema
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Estado de las alertas del sistema
 */
export type AlertStatus = 'pending' | 'active' | 'resolved';

/**
 * Módulos del sistema que pueden generar alertas
 */
export type SourceModule = 'sistema' | 'ventas' | 'inventario' | 'pms' | 'rrhh' | 'crm' | 'finanzas';

// ========================
// INTERFACES PRINCIPALES
// ========================

/**
 * Interface para la tabla 'delivery_logs'
 */
export interface DeliveryLog {
  id: string;
  notification_id: string;
  attempt_no: number;
  provider_response: Record<string, any>;
  delivered_at: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  created_at: string;
}

/**
 * Interface para notificación detallada con logs de entrega
 */
export interface NotificationDetail extends Notification {
  delivery_logs?: DeliveryLog[];
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
    size?: number;
  }>;
  links?: Array<{
    name: string;
    url: string;
    description?: string;
  }>;
  
  // Propiedades enriquecidas extraídas del payload
  title?: string;
  message?: string;
  content?: string;
}

/**
 * Acción disponible para una notificación
 */
export interface NotificationDetailAction {
  id: string;
  label: string;
  icon: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  onClick: () => void;
}

/**
 * Interface para la tabla 'notifications'
 */
export interface Notification {
  id: string;
  organization_id: number;
  recipient_user_id?: string;
  recipient_email?: string;
  recipient_phone?: string;
  channel: NotificationChannel;
  template_id?: string;
  payload: Record<string, any>;
  status: NotificationStatus;
  error_msg?: string;
  sent_at?: string;
  read_at?: string | null; // NULL = no leída
  created_at: string;
  updated_at: string;
  
  // Campos enriquecidos (no de BD)
  user_name?: string;
  is_read?: boolean;
  time_ago?: string;
  source_module?: SourceModule; // Módulo derivado del tipo
  notification_type?: NotificationType; // Tipo explícito de la notificación
}

/**
 * Interface para la tabla 'system_alerts'
 */
export interface SystemAlert {
  id: string;
  organization_id: number;
  rule_id?: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  source_module: SourceModule;
  source_id?: string;
  metadata?: Record<string, any>;
  status: AlertStatus;
  resolved_by?: string;
  resolved_at?: string;
  sent_channels?: string[];
  created_at: string;
  updated_at: string;
  
  // Campos enriquecidos (no de BD)
  resolved_by_name?: string;
  is_resolved?: boolean;
  time_ago?: string;
  priority_order?: number; // Para ordenar por severidad
  
  // Campos de traducción
  severity_display?: string;
  status_display?: string;
  source_module_display?: string;
}

// ========================
// TIPOS PARA FILTROS
// ========================

/**
 * Tipos de notificación disponibles
 */
export type NotificationType = 
  | 'stage_change'
  | 'opportunity_won'
  | 'opportunity_lost'
  | 'opportunity_regressed'
  | 'proposal_stage'
  | 'client_created'
  | 'client_updated'
  | 'payment_received'
  | 'invoice_created'
  | 'task_assigned'
  | 'task_due'
  | 'task_created_for_client'
  | 'booking_created'
  | 'booking_updated'
  | 'product_low_stock'
  | 'product_out_of_stock'
  | 'employee_added'
  | 'employee_updated'
  | 'system_alert';

/**
 * Filtros para notificaciones
 */
export interface NotificationFilter {
  page?: number;
  limit?: number;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  is_read?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
  user_id?: string;
  source_module?: SourceModule; // Nuevo: filtro por módulo
  notification_type?: NotificationType; // Nuevo: filtro por tipo específico
}

/**
 * Filtros para alertas del sistema
 */
export interface SystemAlertFilter {
  page?: number;
  limit?: number;
  severity?: AlertSeverity;
  status?: AlertStatus;
  source_module?: SourceModule;
  date_from?: string;
  date_to?: string;
  search?: string;
  resolved_by?: string;
}

// ========================
// TIPOS PARA RESPUESTAS
// ========================

/**
 * Respuesta paginada para notificaciones
 */
export interface NotificationResponse {
  data: Notification[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Respuesta paginada para alertas del sistema
 */
export interface SystemAlertResponse {
  data: SystemAlert[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ========================
// TIPOS PARA ESTADÍSTICAS
// ========================

/**
 * Estadísticas de notificaciones
 */
export interface NotificationStats {
  total: number;
  unread: number;
  by_channel: Record<NotificationChannel, number>;
  by_status: Record<NotificationStatus, number>;
  today: number;
  this_week: number;
  this_month: number;
}

/**
 * Estadísticas de alertas del sistema
 */
export interface SystemAlertStats {
  total: number;
  pending: number;
  resolved: number;
  by_severity: Record<AlertSeverity, number>;
  by_module: Record<SourceModule, number>;
  critical_count: number;
  today: number;
  this_week: number;
}

// ========================
// TIPOS PARA ACCIONES
// ========================

/**
 * Tipo para acciones individuales
 */
export type NotificationAction = 'mark_read' | 'delete' | 'resend';
export type AlertAction = 'resolve' | 'delete' | 'escalate';

/**
 * Resultado de una acción
 */
export interface ActionResult {
  success: boolean;
  message: string;
  affected_count?: number;
}

// ========================
// TIPOS PARA CONFIGURACIÓN
// ========================

/**
 * Configuración de filtros por módulo
 */
export interface ModuleConfig {
  label: string;
  color: string;
  icon: string;
  description: string;
}

/**
 * Configuración de severidad
 */
export interface SeverityConfig {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  icon: string;
}

/**
 * Configuración de canales
 */
export interface ChannelConfig {
  label: string;
  icon: string;
  description: string;
}

// ========================
// EXPORTACIONES COMBINADAS
// ========================

/**
 * Tipo combinado para notificaciones y alertas
 */
export type NotificationItem = Notification | SystemAlert;

/**
 * Tipo para identificar el tipo de item
 */
export type ItemType = 'notification' | 'system_alert';

/**
 * Interface para items combinados en la UI
 */
export interface CombinedNotificationItem {
  type: ItemType;
  item: NotificationItem;
  timestamp: string;
  is_urgent?: boolean;
}

// ========================
// TIPOS PARA HOOKS
// ========================

/**
 * Estado del hook de notificaciones
 */
export interface NotificationHookState {
  notifications: Notification[];
  systemAlerts: SystemAlert[];
  loading: boolean;
  error: string | null;
  stats: {
    notifications: NotificationStats | null;
    alerts: SystemAlertStats | null;
  };
  filters: {
    notifications: NotificationFilter;
    alerts: SystemAlertFilter;
  };
  pagination: {
    notifications: {
      hasMore: boolean;
      loading: boolean;
      totalPages: number;
      currentPage: number;
      total: number;
    };
    alerts: {
      hasMore: boolean;
      loading: boolean;
      totalPages: number;
      currentPage: number;
      total: number;
    };
  };
}

/**
 * Acciones del hook de notificaciones
 */
export interface NotificationHookActions {
  // Cargar datos
  loadNotifications: (filters?: NotificationFilter) => Promise<void>;
  loadSystemAlerts: (filters?: SystemAlertFilter) => Promise<void>;
  refreshAll: () => Promise<void>;
  
  // Paginación
  loadMoreNotifications: () => Promise<void>;
  loadMoreAlerts: () => Promise<void>;
  goToNotificationPage: (page: number) => Promise<void>;
  goToAlertPage: (page: number) => Promise<void>;
  
  // Acciones individuales
  markNotificationAsRead: (id: string) => Promise<ActionResult>;
  deleteNotification: (id: string) => Promise<ActionResult>;
  resolveAlert: (id: string) => Promise<ActionResult>;
  deleteAlert: (id: string) => Promise<ActionResult>;
  
  // Acciones masivas
  markAllNotificationsAsRead: () => Promise<ActionResult>;
  deleteAllNotifications: () => Promise<ActionResult>;
  resolveAllAlerts: () => Promise<ActionResult>;
  
  // Filtros
  updateNotificationFilters: (filters: Partial<NotificationFilter>) => void;
  updateAlertFilters: (filters: Partial<SystemAlertFilter>) => void;
  clearFilters: () => void;
}
