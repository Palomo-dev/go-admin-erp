// ============================================================
// Tipos TypeScript para la integración WhatsApp Cloud API
// Mensajería, Webhooks, Templates, Media
// ============================================================

// --- Credenciales ---

export interface WhatsAppCloudCredentials {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  webhookVerifyToken: string;
  appId?: string;
  appSecret?: string;
}

// --- Envío de Mensajes ---

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'sticker'
  | 'template'
  | 'interactive'
  | 'location'
  | 'contacts'
  | 'reaction';

export interface WhatsAppSendTextPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text';
  text: { body: string; preview_url?: boolean };
}

export interface WhatsAppSendImagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'image';
  image: { link?: string; id?: string; caption?: string };
}

export interface WhatsAppSendDocumentPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'document';
  document: { link?: string; id?: string; caption?: string; filename?: string };
}

export interface WhatsAppSendAudioPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'audio';
  audio: { link?: string; id?: string };
}

export interface WhatsAppSendVideoPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'video';
  video: { link?: string; id?: string; caption?: string };
}

export interface WhatsAppSendTemplatePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: WhatsAppTemplateComponent[];
  };
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters?: WhatsAppTemplateParameter[];
  sub_type?: 'quick_reply' | 'url';
  index?: number;
}

export interface WhatsAppTemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
  image?: { link: string };
  document?: { link: string };
  video?: { link: string };
}

export interface WhatsAppMarkReadPayload {
  messaging_product: 'whatsapp';
  status: 'read';
  message_id: string;
}

export type WhatsAppSendPayload =
  | WhatsAppSendTextPayload
  | WhatsAppSendImagePayload
  | WhatsAppSendDocumentPayload
  | WhatsAppSendAudioPayload
  | WhatsAppSendVideoPayload
  | WhatsAppSendTemplatePayload;

// --- Respuesta de envío ---

export interface WhatsAppSendResult {
  messaging_product: 'whatsapp';
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

// --- Webhook: Payload entrante ---

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  value: WhatsAppWebhookValue;
  field: 'messages' | 'message_template_status_update';
}

export interface WhatsAppWebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppWebhookContact[];
  messages?: WhatsAppWebhookMessage[];
  statuses?: WhatsAppWebhookStatus[];
  errors?: WhatsAppWebhookError[];
}

export interface WhatsAppWebhookContact {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: WhatsAppMessageType;
  text?: { body: string };
  image?: WhatsAppWebhookMedia;
  document?: WhatsAppWebhookMedia & { filename?: string };
  audio?: WhatsAppWebhookMedia;
  video?: WhatsAppWebhookMedia;
  sticker?: WhatsAppWebhookMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: Record<string, unknown>[];
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string; description?: string } };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
  errors?: WhatsAppWebhookError[];
}

export interface WhatsAppWebhookMedia {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppWebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: { type: string };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: WhatsAppWebhookError[];
}

export interface WhatsAppWebhookError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details: string };
}

// --- Templates ---

export interface WhatsAppMessageTemplate {
  id: string;
  name: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: WhatsAppTemplateComponentDef[];
}

export interface WhatsAppTemplateComponentDef {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  example?: Record<string, unknown>;
}

export interface WhatsAppTemplatesResponse {
  data: WhatsAppMessageTemplate[];
  paging?: { cursors: { before: string; after: string }; next?: string };
}

// --- Business Profile ---

export interface WhatsAppBusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
}

// --- Health Check / Validate ---

export interface WhatsAppValidateResult {
  valid: boolean;
  message: string;
  phoneNumber?: string;
  displayName?: string;
  qualityRating?: string;
}

// --- Estadísticas internas ---

export interface WhatsAppCloudStats {
  totalMessages: number;
  sentToday: number;
  deliveredRate: number;
  failedCount: number;
  templatesSent: number;
}
