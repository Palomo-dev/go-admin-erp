/**
 * Post-proceso de un inbound de WhatsApp ya insertado en `messages` (FASE-16
 * §2.2 paso "inbound → content + last_inbound_at + opt-out + activity +
 * notificación"). Consentimiento, atribución, actividad y notificación usan la RPC privada
 * crm_process_whatsapp_inbound con resultado idempotente.
 *
 * `last_inbound_at` sí lo mantiene el trigger real `trg_messages_set_last_inbound`.
 * Lo llaman: webhook Cloud (whatsappCloudService.processIncomingMessage).
 * QR (whatsappQrService, WIP del dueño) y Twilio (incoming-message, SEC) pueden
 * llamarlo con la misma firma.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { WhatsAppError } from './types';
import { errorWhatsAppDb } from './erroresDbLogica';

export interface InboundInput {
  orgId: number;
  channelId: string;
  conversationId: string;
  customerId: string;
  messageId: string;
  text: string;
  contentType: string;
}

export interface InboundResult {
  consent: 'opted_out' | 'opted_in' | 'none';
  campaign_id: string | null;
  opportunity_id: string | null;
  activity_id: string | null;
  notified_user_id: string | null;
}

export async function handleWhatsAppInbound(input: InboundInput, service: SupabaseClient = getServiceClient()): Promise<InboundResult> {
  const { data, error } = await service.rpc('crm_process_whatsapp_inbound', {
    p_org: input.orgId, p_message: input.messageId, p_channel: input.channelId,
    p_conversation: input.conversationId, p_customer: input.customerId,
  });
  if (error) throw errorWhatsAppDb(error);
  const result = data as Partial<InboundResult> | null;
  if (!result || !['none', 'opted_in', 'opted_out'].includes(String(result.consent))
    || typeof result.activity_id !== 'string'
    || !['campaign_id', 'opportunity_id', 'notified_user_id'].every((key) => {
      const value = (result as Record<string, unknown>)[key];
      return value === null || typeof value === 'string';
    })) throw new WhatsAppError('INTERNAL', 'Respuesta inválida del postprocesado entrante.', 500);
  return result as InboundResult;
}

/** Texto legible de un mensaje inbound de Meta (text.body | caption | [tipo] | botón). */
export function extractInboundText(msg: { type?: string; text?: { body?: string }; image?: { caption?: string }; document?: { caption?: string; filename?: string }; video?: { caption?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; location?: { name?: string; address?: string }; reaction?: { emoji?: string } }): string {
  switch (msg.type) {
    case 'text': return msg.text?.body ?? '';
    case 'image': return msg.image?.caption?.trim() || '[Imagen]';
    case 'document': return msg.document?.caption?.trim() || `[Documento ${msg.document?.filename ?? ''}]`.trim();
    case 'video': return msg.video?.caption?.trim() || '[Video]';
    case 'audio': return '[Audio]';
    case 'sticker': return '[Sticker]';
    case 'location': return `[Ubicación${msg.location?.name ? ` ${msg.location.name}` : ''}]`;
    case 'button': return msg.button?.text ?? '[Botón]';
    case 'interactive': return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '[Interactivo]';
    case 'reaction': return msg.reaction?.emoji ?? '[Reacción]';
    case 'contacts': return '[Contacto]';
    default: return `[${msg.type ?? 'mensaje'}]`;
  }
}

/** content_type válido para el CHECK de `messages` a partir del tipo Meta. */
export function inboundContentType(type: string | undefined): 'text' | 'image' | 'file' | 'audio' | 'video' | 'location' {
  switch (type) {
    case 'image': case 'sticker': return 'image';
    case 'document': return 'file';
    case 'audio': return 'audio';
    case 'video': return 'video';
    case 'location': return 'location';
    default: return 'text';
  }
}
