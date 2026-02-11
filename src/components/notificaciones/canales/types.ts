// ── Tipos para Canales de Notificación ───────────────

export type ChannelCode = 'app' | 'email' | 'push' | 'whatsapp' | 'sms' | 'webhook';

export interface NotificationChannel {
  id: string;
  organization_id: number;
  code: ChannelCode;
  provider_name: string;
  config_json: Record<string, any>;
  is_active: boolean;
  connection_id: string | null;
  created_at: string;
  updated_at: string;
  // join opcional desde integration_connections
  linked_connection?: LinkedConnection | null;
}

export interface LinkedConnection {
  id: string;
  name: string;
  status: string;
  environment: string;
  provider_code: string;
  provider_name: string;
  provider_logo_url: string | null;
  category: string;
}

export interface ChannelFormData {
  code: ChannelCode;
  provider_name: string;
  config_json: Record<string, any>;
  is_active: boolean;
  connection_id: string | null;
}

export const CHANNEL_CODE_OPTIONS: { value: ChannelCode; label: string }[] = [
  { value: 'app', label: 'In-App' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'webhook', label: 'Webhook' },
];

export const CHANNEL_TO_PROVIDER_CODES: Record<string, string[]> = {
  app: [],
  email: ['sendgrid'],
  sms: ['twilio'],
  push: [],
  whatsapp: ['whatsapp', 'twilio'],
  webhook: [],
};
