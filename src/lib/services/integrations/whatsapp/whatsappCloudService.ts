// ============================================================
// Servicio WhatsApp Cloud API para CLIENTES de GO Admin ERP
// Envío de mensajes, recepción via webhook, templates, media
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = SupabaseClient<any, 'public', any>;
import {
  getMessagesEndpoint,
  getTemplatesEndpoint,
  getPhoneNumberEndpoint,
  getBusinessProfileEndpoint,
  getMediaEndpoint,
  verifyWhatsAppWebhookSignature,
  formatPhoneE164,
  WHATSAPP_CREDENTIAL_KEYS,
} from './whatsappCloudConfig';
import { applyTemplateStatusUpdate, parseTemplateStatusUpdate } from '@/lib/services/crm/whatsapp/webhookTemplateStatus';
import { extractInboundText, handleWhatsAppInbound, inboundContentType } from '@/lib/services/crm/whatsapp/inboundService';
import { applyMessageEventToCampaign } from '@/lib/services/crm/whatsapp/campaignEvents';
import type {
  WhatsAppCloudCredentials,
  WhatsAppSendPayload,
  WhatsAppSendResult,
  WhatsAppMarkReadPayload,
  WhatsAppTemplateComponent,
  WhatsAppWebhookPayload,
  WhatsAppWebhookValue,
  WhatsAppWebhookMessage,
  WhatsAppWebhookStatus,
  WhatsAppMessageTemplate,
  WhatsAppTemplatesResponse,
  WhatsAppBusinessProfile,
  WhatsAppValidateResult,
} from './whatsappCloudTypes';

/**
 * El INSERT de un mensaje entrante falló. Se propaga (no se traga con un
 * `console.error`) para que el webhook responda error y el fallo sea visible:
 * un inbound perdido desactiva la ventana de 24 h, el opt-out por palabra
 * clave y la atribución de respuestas a campañas.
 */
export class WhatsAppInboundPersistError extends Error {
  code = 'INBOUND_NOT_PERSISTED';
  externalMessageId: string;
  cause?: unknown;
  constructor(externalMessageId: string, detail: string, cause?: unknown) {
    super(`No se pudo guardar el mensaje entrante ${externalMessageId}: ${detail}`);
    this.name = 'WhatsAppInboundPersistError';
    this.externalMessageId = externalMessageId;
    this.cause = cause;
  }
}

// Supabase admin client para operaciones server-side
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

class WhatsAppCloudService {
  // ──────────────────────────────────────────────
  // Credenciales
  // ──────────────────────────────────────────────

  /** Obtener credenciales de un canal WhatsApp por channel_id */
  async getCredentialsByChannelId(channelId: string): Promise<WhatsAppCloudCredentials | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('channel_credentials')
      .select('credentials')
      .eq('channel_id', channelId)
      .eq('provider', 'meta')
      .single();

    if (error || !data?.credentials) return null;

    const creds = data.credentials as Record<string, string>;
    return {
      phoneNumberId: creds[WHATSAPP_CREDENTIAL_KEYS.PHONE_NUMBER_ID] || '',
      businessAccountId: creds[WHATSAPP_CREDENTIAL_KEYS.BUSINESS_ACCOUNT_ID] || '',
      accessToken: creds[WHATSAPP_CREDENTIAL_KEYS.ACCESS_TOKEN] || '',
      webhookVerifyToken: creds[WHATSAPP_CREDENTIAL_KEYS.WEBHOOK_VERIFY_TOKEN] || '',
      appId: creds[WHATSAPP_CREDENTIAL_KEYS.APP_ID] || '',
      appSecret: creds[WHATSAPP_CREDENTIAL_KEYS.APP_SECRET] || '',
    };
  }

  /** Buscar canal por phone_number_id (para webhook routing) */
  async findChannelByPhoneNumberId(phoneNumberId: string): Promise<{ channelId: string; organizationId: number } | null> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('channel_credentials')
      .select('channel_id, channels!inner(organization_id)')
      .eq('provider', 'meta')
      .filter('credentials->>phone_number_id', 'eq', phoneNumberId);

    if (error || !data || data.length === 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data[0] as any;
    return {
      channelId: row.channel_id as string,
      organizationId: row.channels?.organization_id as number,
    };
  }

  // ──────────────────────────────────────────────
  // Envío de mensajes
  // ──────────────────────────────────────────────

  /** Enviar un mensaje genérico via Cloud API */
  async sendMessage(
    phoneNumberId: string,
    accessToken: string,
    payload: WhatsAppSendPayload
  ): Promise<WhatsAppSendResult> {
    const url = getMessagesEndpoint(phoneNumberId);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `WhatsApp API error ${response.status}: ${JSON.stringify(errorData)}`
      );
    }

    return response.json();
  }

  /** Enviar mensaje de texto */
  async sendText(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    body: string,
    previewUrl = false
  ): Promise<WhatsAppSendResult> {
    return this.sendMessage(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to: formatPhoneE164(to),
      type: 'text',
      text: { body, preview_url: previewUrl },
    });
  }

  /** Enviar mensaje template */
  async sendTemplate(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: WhatsAppTemplateComponent[]
  ): Promise<WhatsAppSendResult> {
    return this.sendMessage(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to: formatPhoneE164(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components as any,
      },
    });
  }

  /** Enviar imagen */
  async sendImage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<WhatsAppSendResult> {
    return this.sendMessage(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to: formatPhoneE164(to),
      type: 'image',
      image: { link: imageUrl, caption },
    });
  }

  /** Enviar documento */
  async sendDocument(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    documentUrl: string,
    filename?: string,
    caption?: string
  ): Promise<WhatsAppSendResult> {
    return this.sendMessage(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to: formatPhoneE164(to),
      type: 'document',
      document: { link: documentUrl, filename, caption },
    });
  }

  /** Marcar mensaje como leído */
  async markAsRead(
    phoneNumberId: string,
    accessToken: string,
    messageId: string
  ): Promise<boolean> {
    const url = getMessagesEndpoint(phoneNumberId);
    const payload: WhatsAppMarkReadPayload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return response.ok;
  }

  // ──────────────────────────────────────────────
  // Templates
  // ──────────────────────────────────────────────

  /** Listar message templates de un WABA */
  async listTemplates(
    businessAccountId: string,
    accessToken: string,
    limit = 20
  ): Promise<WhatsAppMessageTemplate[]> {
    const url = `${getTemplatesEndpoint(businessAccountId)}?fields=name,language,status,category,components&limit=${limit}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Error fetching templates: ${response.status}`);
    }

    const data: WhatsAppTemplatesResponse = await response.json();
    return data.data || [];
  }

  // ──────────────────────────────────────────────
  // Validación de credenciales
  // ──────────────────────────────────────────────

  /** Validar credenciales haciendo GET al phone number */
  async validateCredentials(
    phoneNumberId: string,
    accessToken: string
  ): Promise<WhatsAppValidateResult> {
    try {
      const url = `${getPhoneNumberEndpoint(phoneNumberId)}?fields=verified_name,display_phone_number,quality_rating`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = (errorData as any)?.error?.message || `HTTP ${response.status}`;
        return { valid: false, message: `Error de validación: ${errorMsg}` };
      }

      const data = await response.json();
      return {
        valid: true,
        message: 'Credenciales válidas',
        phoneNumber: data.display_phone_number,
        displayName: data.verified_name,
        qualityRating: data.quality_rating,
      };
    } catch (error: any) {
      return { valid: false, message: `Error de conexión: ${error.message}` };
    }
  }

  /** Obtener business profile */
  async getBusinessProfile(
    phoneNumberId: string,
    accessToken: string
  ): Promise<WhatsAppBusinessProfile | null> {
    const url = `${getBusinessProfileEndpoint(phoneNumberId)}?fields=about,address,description,email,profile_picture_url,websites,vertical`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.data?.[0] || null;
  }

  // ──────────────────────────────────────────────
  // Media
  // ──────────────────────────────────────────────

  /** Obtener URL de descarga de un media (imagen, audio, video, doc) */
  async getMediaUrl(
    mediaId: string,
    accessToken: string
  ): Promise<string | null> {
    const url = getMediaEndpoint(mediaId);
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.url || null;
  }

  /** Descargar media binario */
  async downloadMedia(
    mediaUrl: string,
    accessToken: string
  ): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
    const response = await fetch(mediaUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) return null;

    return {
      buffer: await response.arrayBuffer(),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  // ──────────────────────────────────────────────
  // Webhook: Verificación de firma
  // ──────────────────────────────────────────────

  /** Verificar firma HMAC-SHA256 del webhook */
  verifySignature(rawBody: string, signature: string, appSecret: string): boolean {
    return verifyWhatsAppWebhookSignature(rawBody, signature, appSecret);
  }

  // ──────────────────────────────────────────────
  // Webhook: Procesamiento de mensajes entrantes
  // ──────────────────────────────────────────────

  /**
   * Procesar payload completo del webhook y guardar en BD.
   * Los mensajes que no se puedan PERSISTIR no se silencian: se procesa el
   * resto del lote y al final se lanza un error con todos los fallos, para que
   * la ruta del webhook devuelva 5xx y Meta reintente.
   */
  async processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void> {
    const supabase = getSupabaseAdmin();
    const failures: string[] = [];

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        // F16 (B15): estado/calidad de plantillas HSM → templates.metadata
        if (change.field === 'message_template_status_update' || change.field === 'message_template_quality_update') {
          const update = parseTemplateStatusUpdate(change.field, change.value);
          if (update) {
            const r = await applyTemplateStatusUpdate(update, entry.id ?? null, supabase);
            console.log('[WhatsApp Webhook] template update', { field: change.field, event: update.event, name: update.message_template_name, ...r });
          }
          continue;
        }
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Encontrar canal por phone_number_id
        const channelInfo = await this.findChannelByPhoneNumberId(phoneNumberId);
        if (!channelInfo) {
          console.warn(`[WhatsApp Webhook] Canal no encontrado para phone_number_id: ${phoneNumberId}`);
          continue;
        }

        // Procesar mensajes entrantes
        if (value.messages) {
          for (const msg of value.messages) {
            try {
              await this.processIncomingMessage(
                supabase,
                channelInfo.channelId,
                channelInfo.organizationId,
                msg,
                value
              );
            } catch (err) {
              failures.push(err instanceof Error ? err.message : String(err));
            }
          }
        }

        // Procesar status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await this.processStatusUpdate(supabase, channelInfo.organizationId, status);
          }
        }
      }
    }

    if (failures.length) {
      throw new WhatsAppInboundPersistError('lote', `${failures.length} mensaje(s) entrante(s) no se pudieron guardar :: ${failures.join(' | ')}`);
    }
  }

  /** Procesar un mensaje entrante individual */
  private async processIncomingMessage(
    supabase: SupabaseAdmin,
    channelId: string,
    organizationId: number,
    message: WhatsAppWebhookMessage,
    value: WhatsAppWebhookValue
  ): Promise<void> {
    const contactInfo = value.contacts?.[0];
    const senderPhone = message.from;
    const senderName = contactInfo?.profile?.name || senderPhone;

    // Buscar o crear customer por teléfono
    const customerId = await this.findOrCreateCustomer(
      supabase,
      organizationId,
      channelId,
      senderPhone,
      senderName
    );

    // Buscar o crear conversación
    const conversationId = await this.findOrCreateConversation(
      supabase,
      organizationId,
      channelId,
      customerId
    );

    // Determinar payload (tipo Meta) y content/content_type con la shape viva (F16, cierra C20/A2)
    const { contentType: metaType, messagePayload } = this.extractMessageContent(message);
    const content = extractInboundText(message as Parameters<typeof extractInboundText>[0]) || '[mensaje]';
    const contentType = inboundContentType(message.type);

    // Idempotencia por external_message_id (Meta reintenta webhooks)
    const { data: dup } = await supabase
      .from('messages')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('external_message_id', message.id)
      .limit(1)
      .maybeSingle();
    if (dup) return;

    const insertRow = {
      organization_id: organizationId,
      conversation_id: conversationId,
      channel_id: channelId,
      direction: 'inbound',
      role: 'customer',
      sender_customer_id: customerId,
      content_type: contentType,
      content,
      payload: { ...messagePayload, meta_type: metaType, raw: message, phone: senderPhone, wa_id: senderPhone },
      external_message_id: message.id,
      is_read: false,
      metadata: { wa_id: senderPhone, profile_name: senderName, source: 'whatsapp_cloud', timestamp: message.timestamp },
    };
    const { data: inserted, error: insertError } = await supabase.from('messages').insert(insertRow).select('id').single();
    if (insertError || !inserted) {
      // NO se traga el fallo (tester r1 · fallo 1): este INSERT llevaba tiempo
      // reventando en silencio por el trigger `fn_update_customer_channel_identity`
      // (inserta identity_type='whatsapp', valor que el CHECK de
      // customer_channel_identities no admite) y el resultado era que NINGÚN
      // mensaje entrante de la Cloud API se guardaba: sin `last_inbound_at` no
      // hay ventana de 24 h, ni opt-out por palabra clave, ni atribución de
      // respuestas a campañas. Se registra con todo el detalle y se propaga
      // para que el webhook devuelva error y Meta reintente.
      const detail = insertError?.message ?? 'insert sin filas devueltas';
      console.error('[WhatsApp Webhook] INBOUND NO PERSISTIDO', {
        organization_id: organizationId,
        channel_id: channelId,
        conversation_id: conversationId,
        external_message_id: message.id,
        code: (insertError as { code?: string } | null)?.code ?? null,
        details: (insertError as { details?: string } | null)?.details ?? null,
        hint: (insertError as { hint?: string } | null)?.hint ?? null,
        error: detail,
      });
      throw new WhatsAppInboundPersistError(message.id, detail, insertError ?? null);
    }

    // Conversación reabierta (last_message_at/last_inbound_at los mantienen los triggers)
    await supabase.from('conversations').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', conversationId);

    // Opt-out / opt-in, respuesta a campaña, actividad y notificación (F16)
    await handleWhatsAppInbound(
      { orgId: organizationId, channelId, conversationId, customerId, messageId: (inserted as { id: string }).id, text: content, contentType },
      supabase as unknown as Parameters<typeof handleWhatsAppInbound>[1],
    ).catch((err) => console.warn('[WhatsApp Webhook] handleWhatsAppInbound:', err instanceof Error ? err.message : err));
  }

  /** Procesar status update de un mensaje saliente */
  private async processStatusUpdate(
    supabase: SupabaseAdmin,
    organizationId: number,
    status: WhatsAppWebhookStatus
  ): Promise<void> {
    // Buscar mensaje por la columna real external_message_id (F16; antes `external_id`, inexistente)
    const { data: message } = await supabase
      .from('messages')
      .select('id, metadata')
      .eq('external_message_id', status.id)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle();

    if (!message) return;

    const eventTime = status.timestamp ? new Date(parseInt(status.timestamp, 10) * 1000).toISOString() : new Date().toISOString();
    const providerPayload = {
      timestamp: status.timestamp,
      recipient_id: status.recipient_id,
      conversation: status.conversation || null,
      pricing: status.pricing || null,
      errors: status.errors || null,
    };
    const errorCode = status.errors?.[0]?.code?.toString() || null;
    const errorMessage = status.errors?.[0]?.title || null;

    // Registrar evento (messages no tiene columna de estado: el estado es el último message_event)
    await supabase.from('message_events').insert({
      organization_id: organizationId,
      message_id: message.id,
      event_type: status.status,
      provider_payload: providerPayload,
      error_code: errorCode,
      error_message: errorMessage,
      event_time: eventTime,
    });

    // Campañas: delivered/read/failed (131049 → skipped 24 h, 131056/130429 → reencolar)
    await applyMessageEventToCampaign(
      { message_id: message.id as string, event_type: status.status, error_code: errorCode, error_message: errorMessage, provider_payload: providerPayload, event_time: eventTime },
      supabase as unknown as Parameters<typeof applyMessageEventToCampaign>[1],
    ).catch((err) => console.warn('[WhatsApp Webhook] applyMessageEventToCampaign:', err instanceof Error ? err.message : err));

    // Si leído, actualizar read_at
    if (status.status === 'read') {
      await supabase
        .from('messages')
        .update({ read_at: new Date(parseInt(status.timestamp) * 1000).toISOString() })
        .eq('id', message.id);
    }
  }

  /** Buscar o crear customer por teléfono */
  private async findOrCreateCustomer(
    supabase: SupabaseAdmin,
    organizationId: number,
    channelId: string,
    phone: string,
    name: string
  ): Promise<string> {
    // Buscar identidad existente
    const { data: identity } = await supabase
      .from('customer_channel_identities')
      .select('customer_id')
      .eq('channel_id', channelId)
      .eq('identity_value', phone)
      .single();

    if (identity) {
      // Actualizar last_seen_at
      await supabase
        .from('customer_channel_identities')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('channel_id', channelId)
        .eq('identity_value', phone);
      return (identity as any).customer_id as string;
    }

    // Buscar customer por teléfono
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone', phone)
      .single();

    let customerId: string;

    if (existingCustomer) {
      customerId = (existingCustomer as any).id as string;
    } else {
      // Crear nuevo customer
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
          organization_id: organizationId,
          first_name: name,
          phone,
          metadata: { source: 'whatsapp' },
        })
        .select('id')
        .single();

      customerId = (newCustomer as any)?.id;
    }

    // Crear identidad del canal.
    // `organization_id` e `identity_type` son NOT NULL y el CHECK exige
    // 'whatsapp_phone' (NO 'whatsapp'): sin ellos este INSERT fallaba siempre
    // en silencio.
    const { error: identityError } = await supabase.from('customer_channel_identities').insert({
      organization_id: organizationId,
      customer_id: customerId,
      channel_id: channelId,
      identity_type: 'whatsapp_phone',
      identity_value: phone,
    });
    if (identityError) {
      console.error('[WhatsApp Webhook] No se pudo crear customer_channel_identities', {
        organization_id: organizationId,
        channel_id: channelId,
        identity_value: phone,
        error: identityError.message,
      });
    }

    return customerId;
  }

  /** Buscar o crear conversación */
  private async findOrCreateConversation(
    supabase: SupabaseAdmin,
    organizationId: number,
    channelId: string,
    customerId: string
  ): Promise<string> {
    // Buscar conversación abierta existente
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('channel_id', channelId)
      .eq('customer_id', customerId)
      .in('status', ['open', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) return existing.id;

    // Crear nueva conversación
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        organization_id: organizationId,
        channel_id: channelId,
        customer_id: customerId,
        status: 'open',
        priority: 'normal',
      })
      .select('id')
      .single();

    return (newConv as any)?.id;
  }

  /** Extraer contenido del mensaje según tipo */
  private extractMessageContent(message: WhatsAppWebhookMessage): {
    contentType: string;
    messagePayload: Record<string, unknown>;
  } {
    switch (message.type) {
      case 'text':
        return {
          contentType: 'text',
          messagePayload: { text: message.text?.body || '' },
        };
      case 'image':
        return {
          contentType: 'image',
          messagePayload: {
            media_id: message.image?.id,
            mime_type: message.image?.mime_type,
            caption: message.image?.caption,
          },
        };
      case 'document':
        return {
          contentType: 'document',
          messagePayload: {
            media_id: message.document?.id,
            mime_type: message.document?.mime_type,
            filename: message.document?.filename,
            caption: message.document?.caption,
          },
        };
      case 'audio':
        return {
          contentType: 'audio',
          messagePayload: {
            media_id: message.audio?.id,
            mime_type: message.audio?.mime_type,
          },
        };
      case 'video':
        return {
          contentType: 'video',
          messagePayload: {
            media_id: message.video?.id,
            mime_type: message.video?.mime_type,
            caption: message.video?.caption,
          },
        };
      case 'sticker':
        return {
          contentType: 'sticker',
          messagePayload: {
            media_id: message.sticker?.id,
            mime_type: message.sticker?.mime_type,
          },
        };
      case 'location':
        return {
          contentType: 'location',
          messagePayload: {
            latitude: message.location?.latitude,
            longitude: message.location?.longitude,
            name: message.location?.name,
            address: message.location?.address,
          },
        };
      case 'reaction':
        return {
          contentType: 'reaction',
          messagePayload: {
            emoji: message.reaction?.emoji,
            reacted_message_id: message.reaction?.message_id,
          },
        };
      case 'interactive':
        return {
          contentType: 'interactive',
          messagePayload: {
            type: message.interactive?.type,
            button_reply: message.interactive?.button_reply,
            list_reply: message.interactive?.list_reply,
          },
        };
      default:
        return {
          contentType: message.type || 'unknown',
          messagePayload: { raw: message },
        };
    }
  }
}

/** Singleton del servicio */
export const whatsappCloudService = new WhatsAppCloudService();
