import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { resolveChannel, resolveRecipient } from '@/lib/services/crm/whatsapp/channelService';
import { getWindow, describeWindow } from '@/lib/services/crm/whatsapp/windowService';
import { canContact } from '@/lib/services/crm/whatsapp/consent';
import { WhatsAppError } from '@/lib/services/crm/whatsapp/types';
import { parseWith, zUuid } from '@/lib/services/crm/whatsapp/schemas';

/**
 * GET /api/crm/whatsapp/window/[customerId]?channelId=
 * → { is_open, last_inbound_at, expires_at, conversation_id, label,
 *     channel:{id,name,provider,capabilities}, recipient, can_contact, can_contact_marketing }
 */
export const GET = withWhatsAppRoute(async (ctx, req, params) => {
  const customerId = parseWith(zUuid, params.customerId, 'customerId');
  const url = new URL(req.url);
  const channelIdParam = url.searchParams.get('channelId');
  if (channelIdParam) parseWith(zUuid, channelIdParam, 'channelId');
  const { data: customer } = await ctx.supabase.from('customers').select('id').eq('id', customerId).eq('organization_id', ctx.organizationId).maybeSingle();
  if (!customer) throw new WhatsAppError('NOT_FOUND', 'Cliente no encontrado', 404);
  const channel = await resolveChannel(ctx.organizationId, url.searchParams.get('channelId'), ctx.supabase);
  const [window, recipient, canUtility, canMarketing] = await Promise.all([
    getWindow(ctx.organizationId, customerId, channel.id, ctx.supabase),
    resolveRecipient(ctx.organizationId, customerId, channel.id, ctx.supabase),
    canContact(ctx.organizationId, customerId, 'whatsapp', 'utility', ctx.supabase),
    canContact(ctx.organizationId, customerId, 'whatsapp', 'marketing', ctx.supabase),
  ]);
  return NextResponse.json({
    ...window,
    label: describeWindow(window),
    channel: { id: channel.id, name: channel.name, status: channel.status, provider: channel.provider, capabilities: channel.capabilities },
    recipient,
    can_contact: canUtility,
    can_contact_marketing: canMarketing,
  });
});
