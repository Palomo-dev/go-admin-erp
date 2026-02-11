// ── Tipos para Plantillas de Notificación ────────────

export type TemplateChannel = 'app' | 'email' | 'push' | 'whatsapp' | 'sms' | 'webhook';

export interface NotificationTemplate {
  id: string;
  organization_id: number;
  channel: TemplateChannel;
  name: string;
  subject: string | null;
  body_html: string | null;
  body_text: string;
  variables: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateFilters {
  channel: string;
  search: string;
}

export const DEFAULT_TEMPLATE_FILTERS: TemplateFilters = {
  channel: 'all',
  search: '',
};

export interface TemplateFormData {
  channel: TemplateChannel;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  variables: string[];
}

export const CHANNEL_OPTIONS: { value: TemplateChannel; label: string }[] = [
  { value: 'app', label: 'In-App' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'webhook', label: 'Webhook' },
];
