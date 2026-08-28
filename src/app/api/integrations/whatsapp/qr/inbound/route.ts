import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';
import type { QrInboundPayload } from '@/lib/services/integrations/whatsapp/whatsappQrService';

// POST: Webhook de Evolution API
// Este endpoint NO requiere auth de usuario: lo llama Evolution API.
// Opcionalmente valida apikey si EVOLUTION_API_KEY está configurada.
export async function POST(request: NextRequest) {
  try {
    // Validación opcional de apikey (Evolution API envía header apikey)
    const expectedKey = process.env.EVOLUTION_API_KEY || '';
    if (expectedKey) {
      const apiKey = request.headers.get('apikey') || request.headers.get('x-qr-server-secret');
      if (apiKey !== expectedKey) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }

    const rawText = await request.text();
    if (!rawText || rawText.trim() === '') {
      // Body vacío (Evolution a veces envía pings vacíos)
      return NextResponse.json({ received: true, skipped: true }, { status: 200 });
    }
    const body = JSON.parse(rawText);
    console.log('[WhatsApp QR inbound] Raw webhook:', JSON.stringify(body).substring(0, 500));

    // Mapear formato Evolution API → QrInboundPayload interno
    const payload = mapEvolutionWebhook(body);
    if (!payload) {
      // Formato no reconocido, responder OK para evitar reintentos
      return NextResponse.json({ received: true, skipped: true }, { status: 200 });
    }

    console.log('[WhatsApp QR inbound] Event:', payload.event, 'from:', payload.from);

    try {
      await whatsappQrService.processInboundCallback(payload);
      return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
      console.error('[WhatsApp QR inbound] Error procesando:', error);
      return NextResponse.json(
        { received: false, error: error instanceof Error ? error.message : 'Error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[WhatsApp QR inbound] Error:', error);
    return NextResponse.json({ received: true, error: 'Parse error' }, { status: 200 });
  }
}

/**
 * Mapear webhook de Evolution API al formato interno QrInboundPayload.
 * Evolution API envía: { event, instance, data: { ... } }
 */
function mapEvolutionWebhook(body: unknown): QrInboundPayload | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const event = raw.event as string | undefined;
  const instance = raw.instance as string | undefined;
  const data = (raw.data || {}) as Record<string, unknown>;

  if (!event || !instance) return null;

  // Evolution API v2 envía eventos en minúsculas con puntos: messages.upsert, connection.update, qrcode.updated
  const normalizedEvent = event.toUpperCase().replace(/\./g, '_');

  switch (normalizedEvent) {
    case 'MESSAGES_UPSERT': {
      const key = (data.key || {}) as Record<string, unknown>;
      const message = (data.message || {}) as Record<string, unknown>;
      const fromMe = key.fromMe as boolean;
      // Evolution API v2 puede enviar remoteJid como LID (@lid) y senderPn como número real
      const remoteJid = (key.remoteJid as string) || '';
      const senderPn = (key.senderPn as string) || '';
      const from = senderPn || remoteJid;

      // Ignorar mensajes propios o de grupos
      if (fromMe || !from || from.endsWith('@g.us')) return null;

      // Extraer texto del mensaje
      let text = '';
      let type = 'text';
      if (message.conversation) {
        text = message.conversation as string;
      } else if (message.extendedTextMessage) {
        text = (message.extendedTextMessage as Record<string, unknown>).text as string;
      } else if (message.imageMessage) {
        type = 'image';
        text = ((message.imageMessage as Record<string, unknown>).caption as string) || '';
      } else if (message.videoMessage) {
        type = 'video';
        text = ((message.videoMessage as Record<string, unknown>).caption as string) || '';
      } else if (message.audioMessage) {
        type = 'audio';
      } else if (message.documentMessage) {
        type = 'document';
      } else if (message.locationMessage) {
        type = 'location';
      } else {
        // Tipo no soportado, ignorar
        return null;
      }

      return {
        sessionRef: instance,
        event: 'message',
        from,
        messageId: (key.id as string) || undefined,
        timestamp: (data.messageTimestamp as number) || Math.floor(Date.now() / 1000),
        type,
        text,
        raw: data,
      };
    }

    case 'CONNECTION_UPDATE': {
      const state = (data.state as string) || '';
      if (state === 'open') {
        return {
          sessionRef: instance,
          event: 'connected',
          phone: (data.wuid as string) || null,
        };
      }
      if (state === 'close') {
        return { sessionRef: instance, event: 'disconnected' };
      }
      return null;
    }

    case 'QRCODE_UPDATED': {
      const qrcode = (data.qrcode as Record<string, unknown>) || null;
      const qr = (qrcode?.base64 as string) || (qrcode?.qrcode as string) || (data.qrcode as string) || null;
      return {
        sessionRef: instance,
        event: 'qr',
        qr,
      };
    }

    default:
      return null;
  }
}
