/**
 * Tipos compartidos del módulo WhatsApp del CRM (FASE-16).
 *
 * Desviaciones respecto al doc (schema real, 2026-09-08):
 * - `campaigns.status` CHECK = draft|scheduled|sending|sent → pausa/cancelación
 *   viven en `campaigns.statistics.state` hasta que DB amplíe el CHECK.
 * - `campaign_contacts.state` CHECK = sent|opened|clicked|replied|bounced →
 *   pending/queued/failed/skipped viven en `campaign_contacts.metadata.state`.
 * - Config por org (canal por defecto, palabras de baja, horario, límite diario)
 *   vive en `provider_configs(category='whatsapp').settings` (comm_settings no
 *   tiene esas columnas).
 */

export type WhatsAppErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'NO_CHANNEL'
  | 'NO_PHONE'
  | 'OPTED_OUT'
  | 'WINDOW_CLOSED'
  | 'TEMPLATE_NOT_APPROVED'
  | 'CHANNEL_NO_TEMPLATES'
  | 'US_MARKETING_BLOCKED'
  | 'OUTSIDE_HOURS'
  | 'MISSING_VARIABLES'
  | 'DAILY_LIMIT'
  | 'NO_CREDITS'
  | 'NAME_EXISTS'
  | 'INVALID_COMPONENTS'
  | 'NOT_EDITABLE'
  | 'NOT_MATERIALIZED'
  | 'TIER_EXCEEDED'
  | 'PROVIDER'
  | 'ADMIN_REQUIRED'
  | 'INTERNAL';

export class WhatsAppError extends Error {
  code: WhatsAppErrorCode;
  status: number;
  details?: unknown;
  constructor(code: WhatsAppErrorCode, message?: string, status = 400, details?: unknown) {
    super(message ?? code);
    this.name = 'WhatsAppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type WhatsAppProvider = 'meta' | 'twilio' | 'baileys';

export interface ChannelCapabilities {
  templates: boolean;
  media: boolean;
  free_text: boolean;
}

export interface ChannelSummary {
  id: string;
  name: string;
  status: string;
  provider: WhatsAppProvider;
  capabilities: ChannelCapabilities;
  is_default: boolean;
}

export interface WindowState {
  is_open: boolean;
  last_inbound_at: string | null;
  expires_at: string | null;
  conversation_id: string | null;
}

export type HsmCategory = 'utility' | 'marketing' | 'authentication';
export type HsmStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL';

export interface HsmButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface HsmComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  text?: string;
  buttons?: HsmButton[];
  example?: Record<string, unknown>;
}

/** Metadata guardada en `templates.metadata` para channel='whatsapp', kind='hsm'. */
export interface HsmMeta {
  provider: WhatsAppProvider;
  meta_template_id?: string | null;
  waba_id?: string | null;
  channel_id?: string | null;
  status: HsmStatus;
  category: HsmCategory;
  language: string;
  components: HsmComponent[];
  parameter_format: 'named' | 'positional';
  /** param → dot-path del contexto CRM (con filtros/defaults `contact.first_name|cliente`). */
  variable_map: Record<string, string>;
  quality_score?: string | null;
  rejected_reason?: string | null;
  last_synced_at?: string | null;
  twilio?: { content_sid?: string | null; approval_status?: string | null; positional_map?: string[] };
  [key: string]: unknown;
}

export interface WhatsAppTemplate {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  meta: HsmMeta;
}

export interface RenderedTemplate {
  header: string | null;
  body: string;
  footer: string | null;
  buttons: HsmButton[];
  /** Variables resueltas param → valor. */
  values: Record<string, string>;
  missing: string[];
  /** Payload `template` para Graph API (`type:'template'`). */
  payload: { name: string; language: { code: string }; components: unknown[] };
}

export interface SendWhatsAppInput {
  orgId: number;
  channelId?: string | null;
  customerId?: string | null;
  opportunityId?: string | null;
  conversationId?: string | null;
  text?: string | null;
  /** Variables para interpolar `{{...}}` en `text` (el motor de F7). */
  variables?: Record<string, unknown> | null;
  template?: { templateId: string; variables?: Record<string, unknown> } | null;
  /** Payload Meta ya construido (compatibilidad con /api/integrations/whatsapp/send). */
  rawTemplate?: { name: string; language: { code: string }; components?: unknown[] } | null;
  media?: { url: string; mime: string; filename?: string; caption?: string } | null;
  mediaUrl?: string | null;
  senderMemberId?: number | null;
  senderUserId?: string | null;
  relatedOpportunityId?: string | null;
  purpose?: 'utility' | 'marketing';
  role?: 'agent' | 'ai';
  source?: 'crm' | 'campaign' | 'sequence' | 'agent' | 'bulk' | 'platform_send';
  campaignId?: string | null;
  clientRequestId?: string | null;
  /** Saltar horario permitido (solo utility). */
  force?: boolean;
  scheduledAt?: string | null;
}

export interface SendWhatsAppResult {
  message_id: string;
  conversation_id: string;
  activity_id: string | null;
  customer_id: string;
  channel_id: string;
  scheduled: boolean;
  job_id?: string | null;
  /** El envío ya existía con esta `clientRequestId`: no se ha vuelto a mandar. */
  duplicate?: boolean;
}

export type CampaignChannel = 'whatsapp' | 'email';
export type CampaignDbStatus = 'draft' | 'scheduled' | 'sending' | 'sent';
export type CampaignEffectiveStatus = CampaignDbStatus | 'paused' | 'canceled' | 'materializing';
export type AudienceSource = 'segment' | 'stage' | 'manual';

export interface CampaignAudience {
  source: AudienceSource;
  segment_id?: string | null;
  pipeline_id?: string | null;
  stage_ids?: string[];
  opportunity_ids?: string[];
  customer_ids?: string[];
}

/** Config v2 guardada en `campaigns.statistics` (columnas pendientes de DB). */
export interface CampaignConfig {
  audience?: CampaignAudience;
  channel_id?: string | null;
  throttle_mps?: number;
  respect_allowed_hours?: boolean;
  default_variables?: Record<string, unknown>;
  purpose?: 'utility' | 'marketing';
  state?: 'paused' | 'canceled' | 'materializing' | null;
  paused_at?: string | null;
  canceled_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  next_batch_no?: number;
  /** Lotes seguidos sin reclamar nada; al llegar al tope la campaña se pausa (F16 r3 · F-2). */
  stalled_batches?: number;
  total_contacts?: number;
  pending?: number;
  skipped?: number;
  exclusions?: Record<string, number>;
  estimated_cost?: number | null;
  actual_cost?: number;
  error_summary?: Record<string, number>;
  messaging_limit?: { tier: string | null; limit?: number | null; checked_at: string; warning?: string } | null;
  counts?: CampaignCounts;
  sent_count?: number;
  replied_count?: number;
  no_credits?: boolean;
  description?: string | null;
  materialized_at?: string | null;
  launched_at?: string | null;
  launched_by?: string | null;
  resumed_at?: string | null;
  credits_reserved?: number;
  pause_reason?: string | null;
  template_paused?: boolean;
  [key: string]: unknown;
}

export interface CampaignCounts {
  total: number;
  pending: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  skipped: number;
  cost: number;
}

export interface Campaign {
  id: string;
  organization_id: number;
  name: string;
  channel: CampaignChannel | null;
  status: CampaignDbStatus;
  scheduled_at: string | null;
  template_id: string | null;
  segment_id: string | null;
  content: string | null;
  statistics: CampaignConfig;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  effective_status: CampaignEffectiveStatus;
}

export type ContactState = 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed' | 'skipped';

export interface CampaignContactMeta {
  state?: ContactState;
  skipped_reason?: string | null;
  opportunity_id?: string | null;
  recipient?: string | null;
  message_id?: string | null;
  email_message_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  previous_message_id?: string | null;
  attempts?: number;
  batch_no?: number | null;
  /** Marca del lote que reclamó la fila (reclamación atómica de `campaignBatch`). */
  claim_token?: string | null;
  claimed_at?: string | null;
  variables?: Record<string, unknown>;
  retry_after?: string | null;
  cost_amount?: number | null;
  delivered_at?: string | null;
  read_at?: string | null;
  failed_at?: string | null;
  conversation_id?: string | null;
  reply_message_id?: string | null;
  organization_id?: number;
  [key: string]: unknown;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  customer_id: string;
  state: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  metadata: CampaignContactMeta | null;
  created_at: string;
  updated_at: string;
  customer?: { id: string; full_name: string | null; first_name?: string | null; email?: string | null; phone?: string | null } | null;
}

/** Ajustes WhatsApp por org (provider_configs.settings, category 'whatsapp'). */
export interface WhatsAppOrgSettings {
  default_channel_id: string | null;
  optout_keywords: string[];
  optin_keywords: string[];
  allowed_hours: { tz: string; days: number[]; from: string; to: string } | null;
  daily_limit: number | null;
  messaging_limit?: { tier: string | null; checked_at: string } | null;
  /**
   * Indicativo de país (sin «+») con el que se completan los teléfonos que la
   * organización guardó en formato NACIONAL. `null` = usar la cascada
   * (`WHATSAPP_DEFAULT_COUNTRY_CODE` → último recurso). Ver `defaultCountryOf`.
   */
  default_country_code?: string | null;
}

export const DEFAULT_OPTOUT_KEYWORDS = ['STOP', 'BAJA', 'CANCELAR', 'NO MAS', 'NO MÁS', 'UNSUBSCRIBE', 'SALIR', 'DETENER'];
export const DEFAULT_OPTIN_KEYWORDS = ['START', 'ALTA', 'VOLVER', 'INICIAR'];

export function effectiveCampaignStatus(status: string, stats: CampaignConfig | null | undefined): CampaignEffectiveStatus {
  const s = stats?.state;
  if (s === 'canceled') return 'canceled';
  if (s === 'paused') return 'paused';
  if (s === 'materializing') return 'materializing';
  return status as CampaignDbStatus;
}

export function contactState(c: { state: string | null; metadata: CampaignContactMeta | null }): ContactState {
  const m = c.metadata?.state;
  if (c.state === 'sent') {
    // La columna solo admite sent|opened|clicked|replied|bounced; el avance del
    // ciclo (delivered/read/replied) vive en metadata y gana sobre 'sent'
    // (tester r1 · fallo 12: 'replied' se perdía y no se podía filtrar por él).
    if (m === 'delivered' || m === 'read' || m === 'replied') return m;
    return 'sent';
  }
  if (c.state) return c.state as ContactState;
  return (m ?? 'pending') as ContactState;
}
