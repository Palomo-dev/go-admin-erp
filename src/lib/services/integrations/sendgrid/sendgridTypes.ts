// ============================================================
// SendGrid Email — Tipos TypeScript
// ============================================================

// --- Credenciales ---

export interface SendGridCredentials {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

// --- Envío de email ---

export interface SendGridEmailAddress {
  email: string;
  name?: string;
}

export interface SendGridPersonalization {
  to: SendGridEmailAddress[];
  cc?: SendGridEmailAddress[];
  bcc?: SendGridEmailAddress[];
  subject?: string;
  dynamic_template_data?: Record<string, unknown>;
  custom_args?: Record<string, string>;
}

export interface SendGridAttachment {
  content: string; // Base64
  type: string; // MIME type
  filename: string;
  disposition?: 'attachment' | 'inline';
  content_id?: string;
}

export interface SendGridContent {
  type: 'text/plain' | 'text/html';
  value: string;
}

export interface SendGridMailRequest {
  personalizations: SendGridPersonalization[];
  from: SendGridEmailAddress;
  reply_to?: SendGridEmailAddress;
  subject?: string;
  content?: SendGridContent[];
  template_id?: string;
  attachments?: SendGridAttachment[];
  categories?: string[];
  custom_args?: Record<string, string>;
  send_at?: number; // Unix timestamp
  batch_id?: string;
  tracking_settings?: {
    click_tracking?: { enable: boolean };
    open_tracking?: { enable: boolean };
  };
}

// --- Respuesta simplificada de envío ---

export interface SendGridSendResult {
  success: boolean;
  statusCode: number;
  messageId?: string;
  error?: string;
}

// --- Dynamic Templates ---

export interface SendGridTemplate {
  id: string;
  name: string;
  generation: 'legacy' | 'dynamic';
  updated_at: string;
  versions?: SendGridTemplateVersion[];
}

export interface SendGridTemplateVersion {
  id: string;
  template_id: string;
  active: number; // 1 = active
  name: string;
  subject: string;
  updated_at: string;
  editor: 'code' | 'design';
}

export interface SendGridTemplatesResponse {
  result: SendGridTemplate[];
  _metadata: {
    self: string;
    count: number;
  };
}

// --- Scopes (verificación de API Key) ---

export interface SendGridScopesResponse {
  scopes: string[];
}

// --- Stats ---

export interface SendGridStatResult {
  date: string;
  stats: Array<{
    metrics: {
      requests: number;
      delivered: number;
      opens: number;
      unique_opens: number;
      clicks: number;
      unique_clicks: number;
      bounces: number;
      spam_reports: number;
      blocks: number;
      deferred: number;
      processed: number;
      drops: number;
      bounce_drops: number;
      spam_report_drops: number;
      unsubscribes: number;
      invalid_emails: number;
    };
  }>;
}

// --- Bounces ---

export interface SendGridBounce {
  email: string;
  status: string;
  reason: string;
  created: number; // Unix timestamp
}

// --- Event Webhook ---

export type SendGridEventType =
  | 'processed'
  | 'deferred'
  | 'delivered'
  | 'bounce'
  | 'dropped'
  | 'open'
  | 'click'
  | 'spamreport'
  | 'unsubscribe'
  | 'group_unsubscribe'
  | 'group_resubscribe';

export interface SendGridWebhookEvent {
  email: string;
  timestamp: number;
  event: SendGridEventType;
  sg_event_id: string;
  sg_message_id: string;
  category?: string[];
  reason?: string;
  status?: string;
  url?: string;
  useragent?: string;
  ip?: string;
  response?: string;
  attempt?: string;
  type?: string;
}

// --- Parámetros para envío simplificado ---

export interface SendGridSimpleEmail {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
  attachments?: SendGridAttachment[];
  categories?: string[];
  replyTo?: string;
  sendAt?: Date;
}
