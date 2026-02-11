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

  /** Procesar payload completo del webhook y guardar en BD */
  async processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void> {
    const supabase = getSupabaseAdmin();

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value.metadata.phone_number_id;

        // Encontrar canal por phone_number_id
        const channelInfo = await this.findChannelByPhoneNumberId(phoneNumberId);
        if (!channelInfo) {
          console.warn(`[WhatsApp Webhook] Canal no encontrado para phone_number_id: ${phoneNumberId}`);
          continue;
        }

        // Procesar mensajes entrantes
        if (value.messages) {
          for (const msg of value.messages) {
            await this.processIncomingMessage(
              supabase,
              channelInfo.channelId,
              channelInfo.organizationId,
              msg,
              value
            );
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

    // Determinar content_type y payload
    const { contentType, messagePayload } = this.extractMessageContent(message);

    // Insertar mensaje
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      sender_type: 'customer',
      sender_id: null,
      role: 'user',
      content_type: contentType,
      payload: messagePayload,
      external_id: message.id,
      status: 'received',
    });

    // Actualizar last_message_at en conversación
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), status: 'open' })
      .eq('id', conversationId);
  }

  /** Procesar status update de un mensaje saliente */
  private async processStatusUpdate(
    supabase: SupabaseAdmin,
    organizationId: number,
    status: WhatsAppWebhookStatus
  ): Promise<void> {
    // Buscar mensaje por external_id
    const { data: message } = await supabase
      .from('messages')
      .select('id')
      .eq('external_id', status.id)
      .eq('organization_id', organizationId)
      .single();

    if (!message) return;

    // Actualizar status del mensaje
    await supabase
      .from('messages')
      .update({ status: status.status })
      .eq('id', message.id);

    // Registrar evento
    await supabase.from('message_events').insert({
      organization_id: organizationId,
      message_id: message.id,
      event_type: status.status,
      provider_payload: {
        timestamp: status.timestamp,
        recipient_id: status.recipient_id,
        conversation: status.conversation || null,
        pricing: status.pricing || null,
      },
      error_code: status.errors?.[0]?.code?.toString() || null,
      error_message: status.errors?.[0]?.title || null,
    });

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

    // Crear identidad del canal
    await supabase.from('customer_channel_identities').insert({
      customer_id: customerId,
      channel_id: channelId,
      identity_value: phone,
    });

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
