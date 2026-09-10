import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { parseWith, zSendBody } from '@/lib/services/crm/whatsapp/schemas';
import type { SendWhatsAppInput } from '@/lib/services/crm/whatsapp/types';

/**
 * POST /api/crm/whatsapp/send (FASE-16 §4.1) — envío individual desde el CRM.
 * Body: { customerId?, opportunityId?, conversationId?, channelId?,
 *   text? | template?: {templateId, variables?} | media?: {url, mime, filename?, caption?},
 *   scheduledAt?, force?, clientRequestId?, purpose? }
 * 201 {message_id, conversation_id, activity_id, customer_id, channel_id, scheduled, job_id?}
 * Errores: 400/402 NO_CREDITS/404/422 (OPTED_OUT, WINDOW_CLOSED, TEMPLATE_NOT_APPROVED,
 * CHANNEL_NO_TEMPLATES, US_MARKETING_BLOCKED, OUTSIDE_HOURS, MISSING_VARIABLES, DAILY_LIMIT).
 * Rate limit 30/min por usuario (evita "masivo manual" fuera de campañas).
 */
export const runtime = 'nodejs';

export const POST = withWhatsAppRoute(async (ctx, req) => {
  const rl = await checkRateLimit(`wa_send:${ctx.organizationId}:${ctx.userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiados envíos por minuto; usa una campaña para envíos masivos', code: 'RATE_LIMITED' }, { status: 429 });
  const b = parseWith(zSendBody, await readJson<unknown>(req));
  const input: SendWhatsAppInput = {
    orgId: ctx.organizationId,
    channelId: b.channelId ?? b.channel_id ?? null,
    customerId: b.customerId ?? b.customer_id ?? null,
    opportunityId: b.opportunityId ?? b.opportunity_id ?? null,
    conversationId: b.conversationId ?? b.conversation_id ?? null,
    text: typeof b.text === 'string' ? b.text : b.text?.body ?? null,
    template: (b.template as SendWhatsAppInput['template']) ?? null,
    media: (b.media as SendWhatsAppInput['media']) ?? null,
    scheduledAt: b.scheduledAt ?? null,
    force: b.force === true,
    clientRequestId: b.clientRequestId ?? null,
    purpose: b.purpose === 'marketing' ? 'marketing' : 'utility',
    senderMemberId: ctx.memberId,
    senderUserId: ctx.userId,
    source: b.source ?? 'crm',
    role: 'agent',
  };
  const r = await sendWhatsApp(input, ctx.supabase);
  return NextResponse.json({ success: true, ...r }, { status: 201 });
});
