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
import { applyTemplateStatusUpdate, parseTemplateStatusUpdate, templateEventKey } from '@/lib/services/crm/whatsapp/webhookTemplateStatus';
import { isTemplateField, normalizeMetaId } from './webhookAuthorization';
import { receiveWhatsAppCloud } from '@/lib/services/crm/whatsapp/recepcionCloudService';
import { recordWhatsAppProviderStatus } from '@/lib/services/crm/whatsapp/campaignEvents';
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
/** Opciones de `processWebhookPayload` (F0-SEC r4, H4). */
export interface ProcessWebhookOptions {
  /**
   * Organizaciones autorizadas por la firma (plan con ámbito `channel`).
   * `undefined` = ámbito global, sin intersección. `[]` = ninguna (fail-closed).
   */
  authorizedOrganizationIds?: number[];
}

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

  /**
   * Canales cuyo `credentials.business_account_id` es el WABA dado. Lo usa la
   * autorización por entrada del webhook (F0-SEC r2) para los cambios que no
   * traen `phone_number_id` (estado/calidad de plantillas): `entry.id` es el WABA.
   */
  async findChannelsByBusinessAccountId(businessAccountId: string): Promise<Array<{ channelId: string; organizationId: number }>> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('channel_credentials')
      .select('channel_id, channels!inner(organization_id)')
      .eq('provider', 'meta')
      .filter('credentials->>business_account_id', 'eq', businessAccountId);

    if (error || !data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => ({
      channelId: row.channel_id as string,
      organizationId: row.channels?.organization_id as number,
    }));
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
        components,
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
        const errorMsg = (errorData as { error?: { message?: string } } | null)?.error?.message || `HTTP ${response.status}`;
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
    } catch (error: unknown) {
      return { valid: false, message: `Error de conexión: ${error instanceof Error ? error.message : 'desconocido'}` };
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
   *
   * F0-SEC r4 (H4, regla 6 de `webhookAuthorization.ts`): `opts.authorizedOrganizationIds`
   * son las organizaciones que el plan de autorización resolvió para el secreto
   * que firmó (ámbito `channel`). Todo lo que el servicio resuelva por su
   * cuenta (WABA de la entrada para plantillas, `phone_number_id` para
   * mensajes) se INTERSECA con ellas; lo que quede fuera se descarta y se
   * registra. `undefined` = ámbito global (app de la plataforma): sin
   * intersección, como hasta r3. Un array vacío autoriza a nadie (fail-closed).
   */
  async processWebhookPayload(payload: WhatsAppWebhookPayload, opts: ProcessWebhookOptions = {}): Promise<void> {
    const supabase = getSupabaseAdmin();
    const failures: string[] = [];
    const authorized = opts.authorizedOrganizationIds === undefined ? null : new Set(opts.authorizedOrganizationIds);
    const isAuthorized = (organizationId: number): boolean => authorized === null || authorized.has(organizationId);

    for (const entry of payload.entry ?? []) {
      // F0-SEC r3 (H1/H2): los identificadores de Meta se normalizan con la
      // MISMA función que el plan de autorización (`normalizeMetaId`): un
      // `phone_number_id` numérico o un WABA de tipo raro nunca llega a un
      // filtro PostgREST por coerción implícita.
      const wabaId = normalizeMetaId(entry?.id);
      // Organizaciones dueñas del WABA de esta entrada (se resuelve una vez, y
      // solo si hay un cambio de plantilla que lo necesite).
      let wabaOrganizationIds: number[] | null = null;

      for (const change of entry?.changes ?? []) {
        // F16 (B15): estado/calidad de plantillas HSM → templates.metadata.
        // Los `field` de plantilla se resuelven SIEMPRE por el WABA de la
        // entrada (H4): un `metadata.phone_number_id` en el value ni se mira.
        if (isTemplateField(change.field)) {
          const update = parseTemplateStatusUpdate(change.field, change.value);
          if (!update) continue;
          // H2: la actualización se aplica SOLO a las organizaciones cuyo canal
          // tiene este WABA. Sin WABA resoluble no hay organización → se descarta:
          // `meta_template_id` es único en Meta pero aquí no puede autorizar
          // por sí solo un cambio en plantillas de otra organización.
          if (wabaOrganizationIds === null) {
            wabaOrganizationIds = wabaId
              ? Array.from(new Set((await this.findChannelsByBusinessAccountId(wabaId)).map((c) => c.organizationId)))
              : [];
          }
          if (wabaOrganizationIds.length === 0) {
            console.warn('[WhatsApp Webhook] template update descartado: el WABA de la entrada no resuelve a ningún canal', { field: change.field, wabaId });
            continue;
          }
          // H4: WABA ∩ autorizadas por la firma. Lo que el plan no autorizó no se toca.
          const targetOrganizationIds = wabaOrganizationIds.filter(isAuthorized);
          if (targetOrganizationIds.length === 0) {
            console.warn('[WhatsApp Webhook] template update descartado: el WABA de la entrada no pertenece a ninguna organización autorizada por la firma', {
              field: change.field,
              wabaId,
              wabaOrganizationIds,
              authorizedOrganizationIds: opts.authorizedOrganizationIds,
            });
            continue;
          }
          // Idempotencia (replay de un cuerpo firmado): clave por `entry.time` si viene.
          const eventKey = templateEventKey(update, (entry as { time?: unknown })?.time);
          const r = await applyTemplateStatusUpdate(update, wabaId, supabase, targetOrganizationIds, eventKey);
          console.log('[WhatsApp Webhook] template update', { field: change.field, event: update.event, name: update.message_template_name, ...r });
          continue;
        }
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = normalizeMetaId(value?.metadata?.phone_number_id);
        if (!phoneNumberId) continue;

        // Encontrar canal por phone_number_id
        const channelInfo = await this.findChannelByPhoneNumberId(phoneNumberId);
        if (!channelInfo) {
          console.warn(`[WhatsApp Webhook] Canal no encontrado para phone_number_id: ${phoneNumberId}`);
          continue;
        }
        // H4: el canal del número tiene que ser de una organización autorizada por la firma.
        if (!isAuthorized(channelInfo.organizationId)) {
          console.warn('[WhatsApp Webhook] mensajes descartados: el canal del phone_number_id no pertenece a ninguna organización autorizada por la firma', {
            phoneNumberId,
            organizationId: channelInfo.organizationId,
            authorizedOrganizationIds: opts.authorizedOrganizationIds,
          });
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
            await this.processStatusUpdate(supabase, channelInfo.organizationId, channelInfo.channelId, status);
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
    const { contentType: metaType, messagePayload } = this.extractMessageContent(message);
    try {
      await receiveWhatsAppCloud(organizationId, channelId, message, value.contacts,
        { ...messagePayload, meta_type: metaType }, supabase);
    } catch (error) {
      throw new WhatsAppInboundPersistError(message.id, error instanceof Error ? error.message : 'Recepción incompleta', error);
    }
  }

  /** Firma y canal ya validados por el consumidor del webhook. */
  private async processStatusUpdate(
    supabase: SupabaseAdmin,
    organizationId: number,
    channelId: string,
    status: WhatsAppWebhookStatus,
  ): Promise<void> {
    await recordWhatsAppProviderStatus(organizationId, channelId, status, supabase);
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
