/**
 * Barrel exports para el módulo de notificaciones
 * Facilita las importaciones y mantiene una estructura limpia
 */

// Componentes Core
export { NotificacionesManager } from './core/NotificacionesManager';
export { NotificacionesDataLoader } from './core/NotificacionesDataLoader';

// Componentes UI
export { NotificacionesList } from './ui/NotificacionesList';
export { default as NotificacionItem } from './ui/NotificacionItem';
export { NotificacionAlert } from './ui/NotificacionAlert';
export { NotificacionesActions } from './ui/NotificacionesActions';
export { NotificacionesStats } from './ui/NotificacionesStats';
export { NotificacionesRealtimeIndicator } from './ui/NotificacionesRealtimeIndicator';
export { ArchivedNotificationsView } from './ui/ArchivedNotificationsView';
export { SimpleBreadcrumb } from './ui/SimpleBreadcrumb';
export { SimplePagination } from './ui/SimplePagination';

// Componentes Forms
export { NotificacionesFilters } from './forms/NotificacionesFilters';

// Componentes Detalle
export { NotificationDetailView } from './detalle/NotificationDetailView';
export { NotificationAttachments } from './detalle/NotificationAttachments';
export { NotificationLinks } from './detalle/NotificationLinks';
export { DeliveryHistory } from './detalle/DeliveryHistory';

// Re-exportar tipos importantes para facilitar el uso
export type {
  Notification,
  SystemAlert,
  NotificationFilter,
  SystemAlertFilter,
  NotificationStats,
  SystemAlertStats,
  ActionResult,
  NotificationChannel,
  AlertSeverity,
  SourceModule,
} from '@/types/notification';

// Re-exportar hook para facilitar el uso
export { useNotifications } from '@/lib/hooks/useNotifications';

// Re-exportar servicios principales
export {
  getNotifications,
  getSystemAlerts,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  resolveSystemAlert,
  resolveAllSystemAlerts,
  deleteSystemAlert,
  getNotificationStats,
  getSystemAlertStats,
} from '@/lib/services/notificationService';
