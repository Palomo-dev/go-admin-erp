import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { parseWith, zReplyBody } from '@/lib/services/crm/whatsapp/schemas';

/**
 * POST /api/crm/whatsapp/reply — respuesta inline en un hilo existente
 * (WhatsAppThreadPreview / WhatsAppEntry). Body: { conversationId, text, opportunityId? }.
 * Usa el canal de la conversación; exige ventana abierta (422 WINDOW_CLOSED si no).
 */
export const runtime = 'nodejs';

export const POST = withWhatsAppRoute(async (ctx, req) => {
  const b = parseWith(zReplyBody, await readJson<unknown>(req));
  const { data: conv } = await ctx.supabase.from('conversations').select('id, channel_id').eq('id', b.conversationId).eq('organization_id', ctx.organizationId).maybeSingle();
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada', code: 'NOT_FOUND' }, { status: 404 });
  const r = await sendWhatsApp({
    orgId: ctx.organizationId,
    channelId: (conv as { channel_id: string }).channel_id,
    conversationId: b.conversationId,
    opportunityId: b.opportunityId ?? null,
    text: b.text,
    senderMemberId: ctx.memberId,
    senderUserId: ctx.userId,
    source: 'crm',
    role: 'agent',
  }, ctx.supabase);
  return NextResponse.json({ success: true, ...r }, { status: 201 });
});
