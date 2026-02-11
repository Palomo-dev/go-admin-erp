// ── Tipos para Preferencias de Notificación del Usuario ──

export interface UserNotificationPreference {
  user_id: string;
  channel: string;
  mute: boolean;
  allowed_types: string[];
  dnd_start: string | null;
  dnd_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreferenceUpdate {
  mute?: boolean;
  allowed_types?: string[];
  dnd_start?: string | null;
  dnd_end?: string | null;
}

export const CHANNEL_META: Record<string, { label: string; description: string; icon: string }> = {
  app: { label: 'In-App', description: 'Notificaciones dentro de la aplicación', icon: 'bell' },
  email: { label: 'Email', description: 'Correos electrónicos', icon: 'mail' },
  sms: { label: 'SMS', description: 'Mensajes de texto', icon: 'smartphone' },
  push: { label: 'Push', description: 'Notificaciones push en el navegador', icon: 'bell-ring' },
  whatsapp: { label: 'WhatsApp', description: 'Mensajes por WhatsApp', icon: 'message-square' },
  webhook: { label: 'Webhook', description: 'Llamadas HTTP a endpoints externos', icon: 'webhook' },
};

export const NOTIFICATION_TYPES = [
  { value: 'system_alert', label: 'Alertas del sistema' },
  { value: 'stock_low', label: 'Stock bajo' },
  { value: 'payment', label: 'Pagos y cobros' },
  { value: 'invoice', label: 'Facturas' },
  { value: 'reservation', label: 'Reservaciones' },
  { value: 'task', label: 'Tareas asignadas' },
  { value: 'calendar', label: 'Calendario' },
  { value: 'crm', label: 'CRM / Oportunidades' },
  { value: 'hrm', label: 'HRM / Nómina' },
  { value: 'pos', label: 'POS / Caja' },
  { value: 'member', label: 'Miembros y roles' },
  { value: 'channel_test', label: 'Pruebas de canal' },
] as const;

export const DEFAULT_CHANNELS = ['app', 'email', 'sms', 'push', 'whatsapp', 'webhook'] as const;
