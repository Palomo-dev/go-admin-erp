// ============================================================
// Configuración de WhatsApp Cloud API para clientes de GO Admin ERP
// ============================================================

import crypto from 'crypto';

/** URL base del Graph API de Meta */
export const WHATSAPP_GRAPH_API_URL = 'https://graph.facebook.com' as const;

/** Versión del Graph API */
export const WHATSAPP_API_VERSION = 'v21.0' as const;

/** URL completa base */
export function getWhatsAppApiUrl(): string {
  return `${WHATSAPP_GRAPH_API_URL}/${WHATSAPP_API_VERSION}`;
}

/** Mapeo de propósitos de credenciales en channel_credentials */
export const WHATSAPP_CREDENTIAL_KEYS = {
  PHONE_NUMBER_ID: 'phone_number_id',
  BUSINESS_ACCOUNT_ID: 'business_account_id',
  ACCESS_TOKEN: 'access_token',
  WEBHOOK_VERIFY_TOKEN: 'webhook_verify_token',
  APP_ID: 'app_id',
  APP_SECRET: 'app_secret',
} as const;

/** Permisos requeridos del token (System User) */
export const WHATSAPP_REQUIRED_PERMISSIONS = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
] as const;

/** Eventos de webhook soportados */
export const WHATSAPP_WEBHOOK_FIELDS = [
  'messages',
  'message_template_status_update',
] as const;

/** Tipos de contenido soportados y sus límites */
export const WHATSAPP_MEDIA_LIMITS = {
  audio: { maxSizeMB: 16, formats: ['aac', 'amr', 'mp3', 'mp4', 'ogg'] },
  video: { maxSizeMB: 16, formats: ['mp4', '3gpp'] },
  image: { maxSizeMB: 5, formats: ['jpeg', 'png'] },
  document: { maxSizeMB: 100, formats: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
  sticker: { maxSizeKB: 100, formats: ['webp'] },
} as const;

/** Categorías de templates */
export const WHATSAPP_TEMPLATE_CATEGORIES = [
  'MARKETING',
  'UTILITY',
  'AUTHENTICATION',
] as const;

/** Rate limits por número */
export const WHATSAPP_RATE_LIMITS = {
  messagesPerSecond: 80,
  mediaUploadsPerMinute: 500,
} as const;

/** Tiers de mensajería */
export const WHATSAPP_MESSAGING_TIERS = {
  UNVERIFIED: { label: 'Sin verificar', maxUniqueContacts24h: 250 },
  TIER_1: { label: 'Tier 1', maxUniqueContacts24h: 1000 },
  TIER_2: { label: 'Tier 2', maxUniqueContacts24h: 10000 },
  TIER_3: { label: 'Tier 3', maxUniqueContacts24h: 100000 },
  TIER_4: { label: 'Tier 4', maxUniqueContacts24h: Infinity },
} as const;

/** Verificar firma HMAC-SHA256 del webhook */
export function verifyWhatsAppWebhookSignature(
  rawBody: string,
  signature: string,
  appSecret: string
): boolean {
  if (!signature || !appSecret) return false;
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  return `sha256=${expectedSignature}` === signature;
}

/** Formatear número de teléfono a formato E.164 (sin +) */
export function formatPhoneE164(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

/** Construir URL del endpoint de mensajes */
export function getMessagesEndpoint(phoneNumberId: string): string {
  return `${getWhatsAppApiUrl()}/${phoneNumberId}/messages`;
}

/** Construir URL del endpoint de templates */
export function getTemplatesEndpoint(businessAccountId: string): string {
  return `${getWhatsAppApiUrl()}/${businessAccountId}/message_templates`;
}

/** Construir URL del endpoint de business profile */
export function getBusinessProfileEndpoint(phoneNumberId: string): string {
  return `${getWhatsAppApiUrl()}/${phoneNumberId}/whatsapp_business_profile`;
}

/** Construir URL del endpoint de media */
export function getMediaEndpoint(mediaId: string): string {
  return `${getWhatsAppApiUrl()}/${mediaId}`;
}

/** Construir URL del endpoint para info del número */
export function getPhoneNumberEndpoint(phoneNumberId: string): string {
  return `${getWhatsAppApiUrl()}/${phoneNumberId}`;
}
