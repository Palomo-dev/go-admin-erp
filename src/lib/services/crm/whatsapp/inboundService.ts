/**
 * Post-proceso de un inbound de WhatsApp ya insertado en `messages` (FASE-16
 * §2.2 paso "inbound → content + last_inbound_at + opt-out + activity +
 * notificación"). Sustituye en TS a los triggers `fn_whatsapp_detect_optout`,
 * `fn_campaign_link_reply` y `fn_messages_crm_activity` (DB no los creó).
 *
 * `last_inbound_at` sí lo mantiene el trigger real `trg_messages_set_last_inbound`.
 * Lo llaman: webhook Cloud (whatsappCloudService.processIncomingMessage).
 * QR (whatsappQrService, WIP del dueño) y Twilio (incoming-message, SEC) pueden
 * llamarlo con la misma firma.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { applyInboundConsent } from './consent';
import { getOrgSettings } from './channelService';
import { linkInboundReply } from './campaignEvents';
import { createWhatsAppActivity } from './outboundService';

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
  consent: 'opted_out' | 'opted_in' | 'implicit_opt_in' | 'none';
  campaign_id: string | null;
  opportunity_id: string | null;
  activity_id: string | null;
  notified_user_id: string | null;
}

export async function handleWhatsAppInbound(input: InboundInput, service: SupabaseClient = getServiceClient()): Promise<InboundResult> {
  const { orgId, customerId, messageId } = input;
  const settings = await getOrgSettings(orgId, service).catch(() => null);
  const consent = input.contentType === 'text'
    ? await applyInboundConsent({ orgId, customerId, messageId, text: input.text, optoutKeywords: settings?.optout_keywords, optinKeywords: settings?.optin_keywords }, service)
    : 'none';

  const reply = await linkInboundReply(orgId, customerId, messageId, service).catch(() => null);

  // Oportunidad: la de la campaña, o la abierta más reciente del cliente
  let opportunityId = reply?.opportunity_id ?? null;
  let salespersonId: string | null = null;
  if (!opportunityId) {
    const { data: opp } = await service.from('opportunities').select('id, salesperson_id').eq('organization_id', orgId).eq('customer_id', customerId).eq('status', 'open').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (opp) { opportunityId = (opp as { id: string }).id; salespersonId = (opp as { salesperson_id: string | null }).salesperson_id ?? null; }
  } else {
    const { data: opp } = await service.from('opportunities').select('salesperson_id').eq('id', opportunityId).maybeSingle();
    salespersonId = (opp as { salesperson_id: string | null } | null)?.salesperson_id ?? null;
  }
  if (opportunityId) {
    await service.from('messages').update({ related_opportunity_id: opportunityId, ...(reply ? { metadata: { campaign_id: reply.campaign_id, campaign_reply: true } } : {}) }).eq('id', messageId).is('related_opportunity_id', null);
  }

  const { data: cust } = await service.from('customers').select('full_name, first_name').eq('id', customerId).maybeSingle();
  const name = (cust as { full_name?: string | null; first_name?: string | null } | null)?.full_name || (cust as { first_name?: string | null } | null)?.first_name || 'cliente';
  const activityId = await createWhatsAppActivity({
    orgId, messageId, conversationId: input.conversationId, customerId, opportunityId, userId: salespersonId,
    content: input.text, contentType: input.contentType, customerName: name, direction: 'inbound', campaignId: reply?.campaign_id ?? null,
  }, service);

  let notified: string | null = null;
  if (salespersonId) {
    const { error } = await service.rpc('fn_create_org_notification', {
      p_organization_id: orgId,
      p_recipient_user_id: salespersonId,
      p_channel: 'app',
      p_type: 'whatsapp_reply',
      p_title: `WhatsApp de ${name}`,
      p_content: input.text.slice(0, 140),
      p_metadata: { conversation_id: input.conversationId, opportunity_id: opportunityId, message_id: messageId, customer_id: customerId, campaign_id: reply?.campaign_id ?? null },
    });
    if (!error) notified = salespersonId;
  }
  return { consent, campaign_id: reply?.campaign_id ?? null, opportunity_id: opportunityId, activity_id: activityId, notified_user_id: notified };
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
