// Re-exportar funciones desde archivos separados
export {
  getNotificationDetail,
  retryNotificationDelivery,
  getDeliveryLogs,
  getSystemAlerts,
  getSystemAlertStats,
  resolveSystemAlert,
  deleteSystemAlert,
  resolveAllSystemAlerts
} from './notificationServiceExtensions';

// Re-exportar funciones existentes del archivo principal
export * from './notificationService';
