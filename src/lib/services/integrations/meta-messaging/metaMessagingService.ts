// ============================================================
// Servicio de mensajería Meta (Facebook Messenger + Instagram)
// para CLIENTES de GO Admin ERP.
//
// Procesa los webhooks entrantes (objeto "page" e "instagram"),
// crea/actualiza customer + identidad + conversación e inserta el
// mensaje entrante con el esquema canónico de la tabla `messages`
// (direction='inbound', role='customer') para que el trigger
// `trg_ai_auto_response` dispare la IA automáticamente.
//
// También expone el envío saliente vía Graph API (sendText).
//
// NOTA sobre identidades: NO se setea `external_message_id` en el
// insert porque el trigger `fn_update_customer_channel_identity`
// derivaría un identity_type inválido (el tipo de canal) y violaría
// el CHECK de `customer_channel_identities`. El id del mensaje de Meta
// se guarda en `payload.mid` (para deduplicar reintentos) y las
// identidades se gestionan explícitamente aquí con el tipo válido.
// ============================================================

import { createHmac, timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/** Versión del Graph API usada para mensajería */
export const META_MESSAGING_API_VERSION = 'v21.0' as const;
const GRAPH_API_BASE = `https://graph.facebook.com/${META_MESSAGING_API_VERSION}`;

/** Plataformas de mensajería Meta soportadas */
export type MetaMessagingPlatform = 'facebook' | 'instagram';

/** Mapeo plataforma → identity_type válido en customer_channel_identities */
const IDENTITY_TYPE_BY_PLATFORM: Record<MetaMessagingPlatform, string> = {
  facebook: 'facebook_psid',
  instagram: 'instagram_user',
};

/** Credenciales normalizadas de un canal de mensajería Meta */
export interface MetaMessagingCredentials {
  pageId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  instagramAccountId: string;
}

/** Información del canal asociada a un webhook */
export interface MetaChannelInfo {
  channelId: string;
  organizationId: number;
  type: string;
  credentials: MetaMessagingCredentials;
}

// ──────────────────────────────────────────────
// Tipos del payload del webhook (Messenger/Instagram)
// ──────────────────────────────────────────────

interface MetaWebhookAttachment {
  type: string;
  payload?: {
    url?: string;
    title?: string;
    coordinates?: { lat: number; long: number };
  };
}

interface MetaWebhookMessage {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  attachments?: MetaWebhookAttachment[];
}

interface MetaWebhookPostback {
  title?: string;
  payload?: string;
}

interface MetaWebhookMessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: MetaWebhookMessage;
  postback?: MetaWebhookPostback;
}

interface MetaWebhookEntry {
  id?: string;
  time?: number;
  messaging?: MetaWebhookMessagingEvent[];
  standby?: MetaWebhookMessagingEvent[];
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: MetaWebhookEntry[];
}

interface ExtractedContent {
  contentType: 'text' | 'image' | 'file' | 'audio' | 'video' | 'location';
  content: string;
  imageUrl?: string;
  caption?: string;
}

class MetaMessagingService {
  // ──────────────────────────────────────────────
  // Credenciales
  // ──────────────────────────────────────────────

  /** Cargar canal + credenciales por channel_id (desde la URL del webhook) */
  async getChannelInfo(channelId: string): Promise<MetaChannelInfo | null> {
    const supabase = getSupabaseAdmin();

    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('id, organization_id, type')
      .eq('id', channelId)
      .maybeSingle();

    if (channelError || !channel) return null;

    const { data: credRow } = await supabase
      .from('channel_credentials')
      .select('credentials')
      .eq('channel_id', channelId)
      .eq('provider', 'meta')
      .maybeSingle();

    const creds = (credRow?.credentials || {}) as Record<string, string>;

    return {
      channelId: channel.id as string,
      organizationId: channel.organization_id as number,
      type: channel.type as string,
      credentials: {
        pageId: creds.page_id || '',
        // Messenger guarda 'page_access_token'; Instagram guarda 'access_token'
        accessToken: creds.page_access_token || creds.access_token || '',
        appSecret: creds.app_secret || '',
        verifyToken: creds.webhook_verify_token || '',
        instagramAccountId: creds.instagram_business_account_id || '',
      },
    };
  }

  // ──────────────────────────────────────────────
  // Verificación de firma del webhook
  // ──────────────────────────────────────────────

  /** Verificar firma HMAC-SHA256 (header x-hub-signature-256: "sha256=...") */
  verifySignature(rawBody: string, signatureHeader: string, appSecret: string): boolean {
    if (!signatureHeader || !appSecret) return false;
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf-8').digest('hex');
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  // ──────────────────────────────────────────────
  // Webhook entrante
  // ──────────────────────────────────────────────

  /** Procesar el payload completo del webhook y guardar en BD */
  async processWebhookPayload(
    platform: MetaMessagingPlatform,
    channel: MetaChannelInfo,
    payload: MetaWebhookPayload
  ): Promise<void> {
    for (const entry of payload.entry || []) {
      const events = entry.messaging || entry.standby || [];
      for (const event of events) {
        await this.processMessagingEvent(platform, channel, event);
      }
    }
  }

  /** Procesar un evento de mensajería individual */
  private async processMessagingEvent(
    platform: MetaMessagingPlatform,
    channel: MetaChannelInfo,
    event: MetaWebhookMessagingEvent
  ): Promise<void> {
    const senderId = event.sender?.id;
    const recipientId = event.recipient?.id;

    // Ignorar echoes (mensajes salientes reflejados) y eventos sin remitente
    if (!senderId || event.message?.is_echo) return;

    // Ignorar mensajes cuyo remitente sea la propia página/cuenta
    if (senderId === channel.credentials.pageId || senderId === channel.credentials.instagramAccountId) {
      return;
    }

    // Solo procesamos mensajes o postbacks
    if (!event.message && !event.postback) return;

    const supabase = getSupabaseAdmin();
    const mid = event.message?.mid || `${platform}_${senderId}_${event.timestamp || Date.now()}`;

    // Deduplicar reintentos de Meta (el mid se guarda en payload.mid)
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('channel_id', channel.channelId)
      .filter('payload->>mid', 'eq', mid)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    // Resolver nombre del remitente (best-effort)
    const senderName = await this.fetchUserName(senderId, channel.credentials.accessToken);

    // Customer + identidad + conversación
    const customerId = await this.findOrCreateCustomer(platform, channel, senderId, senderName);
    if (!customerId) return;
    const conversationId = await this.findOrCreateConversation(channel, customerId);
    if (!conversationId) return;

    // Extraer contenido del mensaje
    const extracted = this.extractContent(event);

    await supabase.from('messages').insert({
      organization_id: channel.organizationId,
      conversation_id: conversationId,
      channel_id: channel.channelId,
      direction: 'inbound',
      role: 'customer',
      sender_customer_id: customerId,
      content_type: extracted.contentType,
      content: extracted.content,
      payload: {
        mid,
        sender_id: senderId,
        recipient_id: recipientId,
        platform,
      },
      metadata: {
        source: platform,
        mid,
        ...(extracted.imageUrl ? { imageUrl: extracted.imageUrl } : {}),
        ...(extracted.caption ? { caption: extracted.caption } : {}),
      },
    });
  }

  /** Extraer content/content_type del evento entrante */
  private extractContent(event: MetaWebhookMessagingEvent): ExtractedContent {
    // Postback (botones)
    if (event.postback) {
      return {
        contentType: 'text',
        content: event.postback.title || event.postback.payload || '[postback]',
      };
    }

    const message = event.message;

    // Texto
    if (message?.text) {
      return { contentType: 'text', content: message.text };
    }

    // Adjuntos
    const attachment = message?.attachments?.[0];
    if (attachment) {
      const url = attachment.payload?.url || '';
      switch (attachment.type) {
        case 'image':
          return { contentType: 'image', content: url || '[imagen]', imageUrl: url };
        case 'video':
          return { contentType: 'video', content: url || '[video]' };
        case 'audio':
          return { contentType: 'audio', content: url || '[audio]' };
        case 'file':
          return { contentType: 'file', content: url || '[archivo]' };
        case 'location': {
          const coords = attachment.payload?.coordinates;
          return {
            contentType: 'location',
            content: coords ? `${coords.lat},${coords.long}` : (attachment.payload?.title || '[ubicación]'),
          };
        }
        default:
          return { contentType: 'text', content: attachment.payload?.title || url || '[contenido]' };
      }
    }

    return { contentType: 'text', content: '[mensaje no soportado]' };
  }

  // ──────────────────────────────────────────────
  // Customer + identidad + conversación
  // ──────────────────────────────────────────────

  /** Buscar o crear customer por su PSID/IGSID (identidad de canal) */
  private async findOrCreateCustomer(
    platform: MetaMessagingPlatform,
    channel: MetaChannelInfo,
    senderId: string,
    senderName: string
  ): Promise<string | null> {
    const supabase = getSupabaseAdmin();
    const identityType = IDENTITY_TYPE_BY_PLATFORM[platform];

    // Buscar identidad existente
    const { data: identity } = await supabase
      .from('customer_channel_identities')
      .select('customer_id')
      .eq('channel_id', channel.channelId)
      .eq('identity_value', senderId)
      .maybeSingle();

    if (identity?.customer_id) {
      await supabase
        .from('customer_channel_identities')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('channel_id', channel.channelId)
        .eq('identity_value', senderId);
      return identity.customer_id as string;
    }

    // Crear customer nuevo
    const { data: newCustomer, error: customerError } = await supabase
      .from('customers')
      .insert({
        organization_id: channel.organizationId,
        first_name: senderName,
        metadata: { source: platform, [`${platform}_id`]: senderId },
      })
      .select('id')
      .single();

    if (customerError || !newCustomer) {
      console.error('[Meta Messaging] Error creando customer:', customerError);
      return null;
    }

    const customerId = newCustomer.id as string;

    // Crear identidad de canal con el identity_type válido
    await supabase.from('customer_channel_identities').insert({
      organization_id: channel.organizationId,
      customer_id: customerId,
      channel_id: channel.channelId,
      identity_type: identityType,
      identity_value: senderId,
      verified: false,
    });

    return customerId;
  }

  /** Buscar conversación abierta o crear una nueva */
  private async findOrCreateConversation(
    channel: MetaChannelInfo,
    customerId: string
  ): Promise<string | null> {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('organization_id', channel.organizationId)
      .eq('channel_id', channel.channelId)
      .eq('customer_id', customerId)
      .in('status', ['open', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) return existing.id as string;

    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        organization_id: channel.organizationId,
        channel_id: channel.channelId,
        customer_id: customerId,
        status: 'open',
        priority: 'normal',
      })
      .select('id')
      .single();

    if (error || !newConv) {
      console.error('[Meta Messaging] Error creando conversación:', error);
      return null;
    }

    return newConv.id as string;
  }

  // ──────────────────────────────────────────────
  // Graph API
  // ──────────────────────────────────────────────

  /** Obtener el nombre del remitente (best-effort, no crítico) */
  private async fetchUserName(userId: string, accessToken: string): Promise<string> {
    if (!accessToken) return userId;
    try {
      const res = await fetch(
        `${GRAPH_API_BASE}/${userId}?fields=name,first_name,last_name,username&access_token=${accessToken}`
      );
      if (!res.ok) return userId;
      const data = await res.json();
      return data.name || data.username || [data.first_name, data.last_name].filter(Boolean).join(' ') || userId;
    } catch {
      return userId;
    }
  }

  /** Enviar un mensaje de texto saliente al usuario (Messenger/Instagram) */
  async sendText(
    platform: MetaMessagingPlatform,
    credentials: MetaMessagingCredentials,
    recipientId: string,
    text: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Para Instagram se usa la cuenta IG si está disponible; si no, la página.
    const senderNodeId =
      platform === 'instagram' && credentials.instagramAccountId
        ? credentials.instagramAccountId
        : credentials.pageId;

    if (!senderNodeId || !credentials.accessToken) {
      return { success: false, error: 'Credenciales incompletas (page_id/access_token)' };
    }

    try {
      const res = await fetch(`${GRAPH_API_BASE}/${senderNodeId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type: 'RESPONSE',
          message: { text },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
      }
      return { success: true, messageId: data.message_id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Error de red' };
    }
  }
}

/** Singleton del servicio */
export const metaMessagingService = new MetaMessagingService();
