// ============================================================
// Servicio WhatsApp QR (Evolution API) – puente ERP ↔ Evolution
// Ref: docs/integraciones/whatsapp-qr-evolution.md
// ============================================================
// Evolution API es un gateway self-hosted construido sobre Baileys
// con manejo correcto de LID, persistencia Redis/DB y API REST estable.
// Documentación: https://doc.evolution-api.com
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = SupabaseClient<any, 'public', any>;

// ─── Config ────────────────────────────────────────────────────────────────
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Tipos ─────────────────────────────────────────────────────────────────
export interface QrSessionStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'reconnecting' | 'banned' | 'error';
  qr: string | null;
  phone?: string | null;
}

export interface QrInboundPayload {
  sessionRef: string;
  event: 'message' | 'qr' | 'connected' | 'disconnected' | 'error';
  from?: string;
  messageId?: string;
  timestamp?: number;
  type?: string;
  text?: string;
  [key: string]: unknown;
}

// ─── Helper HTTP ───────────────────────────────────────────────────────────
async function evolutionFetch(pathname: string, init?: RequestInit) {
  const res = await fetch(`${EVOLUTION_URL}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Evolution API ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}

/** Nombre de instancia único por canal */
function instanceNameFor(channelId: string): string {
  return `wa-qr-${channelId}`;
}

/** Mapear estado de Evolution API → estado interno del ERP */
function mapEvolutionState(state: string): QrSessionStatus['status'] {
  switch (state) {
    case 'open':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'close':
      return 'disconnected';
    case 'qr':
      return 'qr_ready';
    default:
      return 'error';
  }
}

// ─── Servicio ──────────────────────────────────────────────────────────────
class WhatsAppQrService {
  // ── Estado de sesión ─────────────────────────────────────────────────────

  /** Obtener estado + QR de una sesión */
  async getStatus(channelId: string): Promise<QrSessionStatus> {
    const instance = instanceNameFor(channelId);
    try {
      // v2: /instance/connectionState/:name
      const data = await evolutionFetch(`/instance/connectionState/${instance}`);
      const state = data?.instance?.state || data?.state || 'close';
      const status = mapEvolutionState(state);

      // Si está conectado, obtener info adicional
      let phone: string | null = null;
      if (status === 'connected') {
        try {
          const info = await evolutionFetch(`/instance/fetchInstances?instanceName=${instance}`);
          const inst = Array.isArray(info) ? info[0] : info?.instances?.[0];
          phone = inst?.number || inst?.ownerJid || null;
        } catch {
          /* noop */
        }
      }

      // Si está connecting, intentar obtener QR
      let qr: string | null = null;
      if (status === 'connecting') {
        try {
          // v2: /instance/connect/:name
          const connectData = await evolutionFetch(`/instance/connect/${instance}`);
          // v2.3 retorna: { base64: "data:image/png;base64,...", code: "2@...", pairingCode: null }
          if (connectData?.base64) {
            qr = connectData.base64;
          } else if (connectData?.qrcode) {
            qr = connectData.qrcode.base64 || connectData.qrcode.qrcode || null;
          } else if (connectData?.code && typeof connectData.code === 'string' && connectData.code.startsWith('data:image')) {
            qr = connectData.code;
          }
        } catch {
          /* noop */
        }
      }

      // Si tenemos QR, el estado es qr_ready (no connecting)
      const finalStatus = qr ? 'qr_ready' as const : status;
      return { status: finalStatus, qr, phone };
    } catch {
      return { status: 'disconnected', qr: null };
    }
  }

  /** Iniciar sesión (crea instancia en Evolution API y genera QR) */
  async startSession(channelId: string): Promise<QrSessionStatus> {
    const instance = instanceNameFor(channelId);
    const supabase = getSupabaseAdmin();

    // Obtener organization_id del canal
    const { data: channel } = await supabase
      .from('channels')
      .select('organization_id')
      .eq('id', channelId)
      .single();
    if (!channel) throw new Error('Canal no encontrado');

    // Persistir fila en whatsapp_qr_sessions
    await supabase.from('whatsapp_qr_sessions').upsert(
      {
        channel_id: channelId,
        organization_id: channel.organization_id,
        session_ref: instance,
        status: 'connecting',
        auth_state_path: instance,
      },
      { onConflict: 'channel_id' }
    );

    // Construir URL del webhook del ERP
    // En desarrollo local, Evolution API corre en Docker y necesita host.docker.internal
    // En producción, NEXT_PUBLIC_APP_URL es la URL pública del ERP
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:61592';
    const isLocalDev = appUrl.includes('localhost') && !appUrl.includes('host.docker');
    const webhookUrl = isLocalDev
      ? 'http://host.docker.internal:61592/api/integrations/whatsapp/qr/inbound'
      : `${appUrl}/api/integrations/whatsapp/qr/inbound`;

    try {
      // Crear instancia en Evolution API (v2)
      await evolutionFetch('/instance/create', {
        method: 'POST',
        body: JSON.stringify({
          instanceName: instance,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });
    } catch {
      // La instancia ya existe → reconectar
    }

    // Configurar webhook (v2 requiere endpoint separado)
    try {
      await evolutionFetch(`/webhook/set/${instance}`, {
        method: 'POST',
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
          },
        }),
      });
    } catch {
      /* noop */
    }

    // Conectar y obtener QR (v2: /instance/connect/:name)
    const data = await evolutionFetch(`/instance/connect/${instance}`);

    // v2.3 retorna: { base64: "data:image/png;base64,...", code: "2@...", pairingCode: null }
    let qr: string | null = null;
    if (data?.base64) {
      qr = data.base64;
    } else if (data?.qrcode) {
      qr = data.qrcode.base64 || data.qrcode.qrcode || null;
    } else if (data?.code && typeof data.code === 'string' && data.code.startsWith('data:image')) {
      qr = data.code;
    }
    if (qr) {
      await supabase
        .from('whatsapp_qr_sessions')
        .update({ status: 'qr_ready', qr_code: qr, qr_generated_at: new Date().toISOString() })
        .eq('channel_id', channelId);
    }

    return { status: qr ? 'qr_ready' : 'connecting', qr };
  }

  /** Detener sesión (mantiene creds para reconexión automática) */
  async stopSession(channelId: string): Promise<void> {
    const instance = instanceNameFor(channelId);
    try {
      // v2: /instance/logout/:name
      await evolutionFetch(`/instance/logout/${instance}`, { method: 'DELETE' });
    } catch {
      /* noop */
    }
    const supabase = getSupabaseAdmin();
    await supabase
      .from('whatsapp_qr_sessions')
      .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
      .eq('channel_id', channelId);
  }

  /** Logout total: borrar creds y requerir re-escaneo */
  async logoutSession(channelId: string): Promise<void> {
    const instance = instanceNameFor(channelId);
    try {
      // v2: /instance/delete/:name
      await evolutionFetch(`/instance/delete/${instance}`, { method: 'DELETE' });
    } catch {
      /* noop */
    }
    const supabase = getSupabaseAdmin();
    await supabase
      .from('whatsapp_qr_sessions')
      .update({
        status: 'disconnected',
        qr_code: null,
        connected_at: null,
        disconnected_at: new Date().toISOString(),
      })
      .eq('channel_id', channelId);
  }

  // ── Envío de mensajes ────────────────────────────────────────────────────

  /** Enviar texto via Evolution API (v2: /message/sendText/:instance) */
  async sendText(channelId: string, to: string, text: string): Promise<{ externalId: string | null }> {
    const instance = instanceNameFor(channelId);
    // Evolution API espera solo el número (sin @s.whatsapp.net ni @lid)
    const number = to.replace(/@(s\.whatsapp\.net|lid)$/, '');
    const data = await evolutionFetch(`/message/sendText/${instance}`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    });
    return { externalId: data?.key?.id || null };
  }

  /** Enviar media por URL via Evolution API (v2: /message/sendMedia/:instance) */
  async sendMedia(
    channelId: string,
    to: string,
    type: 'image' | 'video' | 'document' | 'audio',
    url: string,
    caption?: string
  ): Promise<{ externalId: string | null }> {
    const instance = instanceNameFor(channelId);
    const number = to.replace(/@(s\.whatsapp\.net|lid)$/, '');
    const data = await evolutionFetch(`/message/sendMedia/${instance}`, {
      method: 'POST',
      body: JSON.stringify({ number, mediatype: type, media: url, caption }),
    });
    return { externalId: data?.key?.id || null };
  }

  /** Marcar como leído */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async markAsRead(channelId: string, jid: string, messageId: string): Promise<boolean> {
    // Evolution API no tiene endpoint directo para marcar leído
    // Se maneja internamente cuando se lee el mensaje
    void channelId; void jid; void messageId;
    return true;
  }

  // ── Callback inbound (llamado desde /api/integrations/whatsapp/qr/inbound)
  // ─────────────────────────────────────────────────────────────────────────

  /** Procesar webhook de Evolution API */
  async processInboundCallback(payload: QrInboundPayload): Promise<void> {
    const supabase = getSupabaseAdmin();

    // Resolver channel_id + organization_id desde session_ref
    const { data: session } = await supabase
      .from('whatsapp_qr_sessions')
      .select('channel_id, organization_id')
      .eq('session_ref', payload.sessionRef)
      .single();
    if (!session) {
      console.warn(`[WhatsApp QR] Sesión no encontrada: ${payload.sessionRef}`);
      return;
    }

    const channelId = session.channel_id;
    const organizationId = session.organization_id;

    switch (payload.event) {
      case 'qr':
        await supabase
          .from('whatsapp_qr_sessions')
          .update({ status: 'qr_ready', qr_code: payload.qr, qr_generated_at: new Date().toISOString() })
          .eq('channel_id', channelId);
        break;

      case 'connected':
        await supabase
          .from('whatsapp_qr_sessions')
          .update({
            status: 'connected',
            qr_code: null,
            connected_at: new Date().toISOString(),
            phone_number: payload.phone || null,
          })
          .eq('channel_id', channelId);
        break;

      case 'disconnected':
        await supabase
          .from('whatsapp_qr_sessions')
          .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
          .eq('channel_id', channelId);
        break;

      case 'error':
        await supabase
          .from('whatsapp_qr_sessions')
          .update({ status: 'error', last_error: String(payload.error || 'unknown') })
          .eq('channel_id', channelId);
        break;

      case 'message':
        await this.processIncomingMessage(supabase, channelId, organizationId, payload);
        break;
    }
  }

  /** Procesar mensaje entrante (mismo patrón que whatsappCloudService) */
  private async processIncomingMessage(
    supabase: SupabaseAdmin,
    channelId: string,
    organizationId: number,
    payload: QrInboundPayload
  ): Promise<void> {
    const from = payload.from || '';
    // from viene como JID (57300xxx@s.whatsapp.net o @lid) → extraer phone
    const phone = from.replace(/@(s\.whatsapp\.net|lid)$/, '');
    console.log('[WhatsApp QR] processIncomingMessage from:', from, 'phone:', phone);

    // Buscar o crear customer
    const customerId = await this.findOrCreateCustomer(supabase, organizationId, channelId, phone, phone);
    console.log('[WhatsApp QR] customerId:', customerId);

    // Buscar o crear conversación
    const conversationId = await this.findOrCreateConversation(supabase, organizationId, channelId, customerId);
    console.log('[WhatsApp QR] conversationId:', conversationId);

    // Mapear tipo → content_type del ERP
    const { contentType, messagePayload } = this.mapMessageContent(payload);
    // Nota: NO incluir phone ni external_message_id en el insert para evitar que el trigger
    // fn_update_customer_channel_identity falle (usa channels.type='whatsapp' como identity_type
    // pero el constraint exige 'whatsapp_phone'). La identidad se crea manualmente en findOrCreateCustomer.

    // Insertar mensaje (campos reales de la tabla messages)
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      channel_id: channelId,
      direction: 'inbound',
      role: 'customer',
      sender_customer_id: customerId,
      content_type: contentType,
      content: payload.text || '',
      payload: messagePayload,
    });
    if (error) {
      console.error('[WhatsApp QR] Error insertando mensaje:', error);
    } else {
      console.log('[WhatsApp QR] Mensaje insertado OK');
    }

    // Actualizar conversación
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), status: 'open' })
      .eq('id', conversationId);
  }

  private mapMessageContent(payload: QrInboundPayload): {
    contentType: string;
    messagePayload: Record<string, unknown>;
  } {
    switch (payload.type) {
      case 'text':
        return { contentType: 'text', messagePayload: { text: payload.text || '' } };
      case 'image':
        return {
          contentType: 'image',
          messagePayload: { mime_type: payload.mime, caption: payload.caption, has_media: payload.hasMedia },
        };
      case 'audio':
        return { contentType: 'audio', messagePayload: { mime_type: payload.mime, has_media: payload.hasMedia } };
      case 'video':
        return {
          contentType: 'video',
          messagePayload: { mime_type: payload.mime, caption: payload.caption, has_media: payload.hasMedia },
        };
      case 'document':
        return {
          contentType: 'document',
          messagePayload: { mime_type: payload.mime, filename: payload.filename, has_media: payload.hasMedia },
        };
      case 'location':
        return {
          contentType: 'location',
          messagePayload: { latitude: payload.latitude, longitude: payload.longitude, name: payload.name },
        };
      default:
        return { contentType: payload.type || 'unknown', messagePayload: { raw: payload.raw } };
    }
  }

  // ── Helpers (duplicados de whatsappCloudService para mantener aislamiento)
  // ─────────────────────────────────────────────────────────────────────────

  private async findOrCreateCustomer(
    supabase: SupabaseAdmin,
    organizationId: number,
    channelId: string,
    phone: string,
    name: string
  ): Promise<string> {
    const { data: identity } = await supabase
      .from('customer_channel_identities')
      .select('customer_id')
      .eq('channel_id', channelId)
      .eq('identity_value', phone)
      .single();

    if (identity) {
      await supabase
        .from('customer_channel_identities')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('channel_id', channelId)
        .eq('identity_value', phone);
      return (identity as { customer_id: string }).customer_id;
    }

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone', phone)
      .single();

    let customerId: string;
    if (existingCustomer) {
      customerId = (existingCustomer as { id: string }).id;
    } else {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert({ organization_id: organizationId, first_name: name, phone, metadata: { source: 'whatsapp_qr' } })
        .select('id')
        .single();
      customerId = (newCustomer as { id: string } | null)?.id || '';
    }

    await supabase.from('customer_channel_identities').insert({
      organization_id: organizationId,
      customer_id: customerId,
      channel_id: channelId,
      identity_type: 'whatsapp_phone',
      identity_value: phone,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });

    return customerId;
  }

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
      .eq('channel_id', channelId)
      .eq('customer_id', customerId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return (existing as { id: string }).id;

    // Crear nueva conversación
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({ organization_id: organizationId, channel_id: channelId, customer_id: customerId, status: 'open' })
      .select('id')
      .single();
    return (newConv as { id: string } | null)?.id || '';
  }
}

export const whatsappQrService = new WhatsAppQrService();
