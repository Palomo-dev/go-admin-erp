/**
 * Tipos para el sistema de disparadores de eventos
 */

export type NotificationChannel = 'email' | 'whatsapp' | 'webhook' | 'push' | 'sms';

export interface EventTrigger {
  id: string;
  organization_id: number;
  name: string;
  event_code: string;
  template_id?: string;
  channels: NotificationChannel[];
  priority: number;
  silent_window_minutes: number;
  active: boolean;
  conditions: Record<string, any>;
  webhook_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEventTriggerData {
  name: string;
  event_code: string;
  template_id?: string;
  channels: NotificationChannel[];
  priority?: number;
  silent_window_minutes?: number;
  active?: boolean;
  conditions?: Record<string, any>;
  webhook_url?: string;
}

export interface UpdateEventTriggerData {
  name?: string;
  event_code?: string;
  template_id?: string;
  channels?: NotificationChannel[];
  priority?: number;
  silent_window_minutes?: number;
  active?: boolean;
  conditions?: Record<string, any>;
  webhook_url?: string;
}

export interface EventTriggerFilter {
  page?: number;
  limit?: number;
  search?: string;
  event_code?: string;
  channel?: NotificationChannel;
  active?: boolean;
  priority?: number;
}

export interface EventTriggerResponse {
  data: EventTrigger[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Tipos para catálogo de eventos
export interface EventCatalogItem {
  code: string;
  module: string;
  description: string;
  sample_payload: Record<string, any>;
  created_at: string;
}

// Tipos para plantillas
export interface NotificationTemplate {
  id: string;
  organization_id: number;
  channel: NotificationChannel;
  name: string;
  subject?: string;
  body_html?: string;
  body_text: string;
  variables: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateData {
  channel: NotificationChannel;
  name: string;
  subject?: string;
  body_html?: string;
  body_text: string;
  variables: string[];
}

export interface UpdateTemplateData {
  name?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
  variables?: string[];
}

// Tipos para pruebas
export interface TriggerTestResult {
  success: boolean;
  message: string;
  executed_at?: string;
  trigger_id?: string;
  event_data?: Record<string, any>;
  notifications_created?: number;
  details?: Record<string, any>;
}

// Resultado de acciones
export interface ActionResult {
  success: boolean;
  message: string;
  affected_count?: number;
}

// Estadísticas de triggers
export interface TriggerStats {
  total: number;
  active: number;
  inactive: number;
  by_channel: Record<NotificationChannel, number>;
  by_priority: Record<number, number>;
  by_event_code: Record<string, number>;
}
