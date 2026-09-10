/**
 * Tipos compartidos del módulo de email (FASE-07).
 *
 * Columnas que la BD aún NO tiene (pedidas a DB en F7-r1) viven en
 * `email_messages.metadata` / `templates.metadata` con las claves de
 * `EmailMessageMeta` / `TemplateMeta`. Cuando existan las columnas, solo
 * cambia `readMeta*` en cada servicio.
 */

export type EmailKind = 'transactional' | 'marketing' | 'sequence' | 'system';
export type EmailDirection = 'outbound' | 'inbound';

/** CHECK real de email_messages.status (sin scheduled/canceled/received). */
export type EmailMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'unsubscribed'
  | 'failed';

export type EmailDomainStatus = 'pending' | 'verifying' | 'verified' | 'failed';
export type EmailDomainRegion = 'us-east-1' | 'eu-west-1' | 'sa-east-1' | 'ap-northeast-1';

export interface EmailAttachmentRef {
  filename: string;
  content_type: string;
  bytes: number;
  document_id?: string;
}

/** Campos extra guardados en email_messages.metadata hasta que DB añada columnas. */
export interface EmailMessageMeta {
  direction?: EmailDirection;
  kind?: EmailKind;
  preheader?: string;
  in_reply_to?: string | null;
  thread_id?: string;
  attachments?: EmailAttachmentRef[];
  list_unsubscribe_token?: string;
  from_user_id?: string | null;
  email_domain_id?: string | null;
  sender_mode?: 'org' | 'global';
  provider_inbound_id?: string;
  received_at?: string;
  body_text_snapshot?: string;
  client_request_id?: string;
  scheduled?: boolean;
  scheduled_job_id?: string;
  canceled_at?: string;
  failed_at?: string;
  last_error?: string;
  missing_variables?: string[];
  soft_bounces?: number;
  test?: boolean;
  campaign_id?: string;
  reply_to?: string;
  [key: string]: unknown;
}

export interface EmailMessage {
  id: string;
  organization_id: number;
  provider: string;
  provider_message_id: string | null;
  template_id: string | null;
  to_email: string;
  to_customer_id: string | null;
  cc: string[] | null;
  bcc: string[] | null;
  from_email: string;
  subject: string;
  body_html_snapshot: string | null;
  related_type: string | null;
  related_id: string | null;
  sequence_step_run_id: string | null;
  status: EmailMessageStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  first_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  bounce_type: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  idempotency_key: string;
  cost_amount: number | null;
  metadata: EmailMessageMeta;
  created_at: string;
  updated_at: string;
}

export interface EmailEvent {
  id: string;
  organization_id: number;
  email_message_id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown> | null;
  provider_event_id: string;
}

export interface DnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  status?: string;
  priority?: number;
  recommended?: boolean;
}

/** Ajustes de dominio que aún no tienen columna (viven en provider_configs.settings.email_domains[id]). */
export interface EmailDomainExtras {
  region: EmailDomainRegion;
  tracking_subdomain: string;
  open_tracking: boolean;
  click_tracking: boolean;
  receiving_enabled: boolean;
  provider_status: string | null;
  api_key_id: string | null;
  last_checked_at: string | null;
}

export interface EmailDomain extends EmailDomainExtras {
  id: string;
  organization_id: number;
  domain: string;
  provider: string;
  provider_domain_id: string | null;
  credential_id: string | null;
  status: EmailDomainStatus;
  dns_records: DnsRecord[];
  dmarc_configured: boolean;
  from_name: string | null;
  from_email: string;
  reply_to: string | null;
  is_default: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  /** true si la org tiene API key propia guardada para este dominio Y es legible. */
  has_api_key: boolean;
  /**
   * true si hay una credencial guardada que NINGUNA clave de cifrado
   * disponible descifra (se cambió/rotó el secreto). Hay que regenerarla.
   */
  api_key_unreadable?: boolean;
}

export type TemplateEngine = 'blocks' | 'html' | 'react';
export type TemplateKind = 'transactional' | 'marketing' | 'sequence' | 'signature' | 'hsm' | 'onboarding';

export interface TemplateMeta {
  is_system?: boolean;
  usage_count?: number;
  last_used_at?: string;
  parent_template_id?: string;
  body_text?: string;
  seed_key?: string;
  [key: string]: unknown;
}

export interface Template {
  id: string;
  organization_id: number;
  name: string;
  channel: 'email' | 'whatsapp' | 'sms';
  kind: TemplateKind | null;
  engine: TemplateEngine;
  subject: string | null;
  preheader: string | null;
  description: string | null;
  body_html: string;
  blocks_json: Record<string, unknown> | null;
  variables: string[] | null;
  is_active: boolean;
  version: number;
  created_by: string | null;
  metadata: TemplateMeta;
  created_at: string;
  updated_at: string;
}

export type TemplateSummary = Omit<Template, 'body_html' | 'blocks_json'>;

/** Error tipado con código y status HTTP (respuesta {success:false,error,code}). */
export class EmailError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message?: string, status = 400, details?: unknown) {
    super(message ?? code);
    this.name = 'EmailError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isEmailError(err: unknown): err is EmailError {
  return err instanceof EmailError;
}

export const EMAIL_STATUS_RANK: Record<EmailMessageStatus, number> = {
  pending: 0,
  sent: 2,
  delivered: 3,
  opened: 4,
  clicked: 5,
  failed: 8,
  bounced: 8,
  complained: 9,
  unsubscribed: 9,
};

export const MAX_RECIPIENTS = 50;
export const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;
export const MAX_SCHEDULE_DAYS = 30;
/** Ventana en la que se delega la programación a Resend (scheduledAt); por encima, cola propia. */
export const RESEND_SCHEDULE_WINDOW_MS = 60 * 60 * 1000;
