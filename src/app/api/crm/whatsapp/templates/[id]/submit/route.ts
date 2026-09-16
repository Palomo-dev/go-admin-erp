import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { submitHsm } from '@/lib/services/crm/whatsapp/templateService';
import { parseWith, zChannelIdBody } from '@/lib/services/crm/whatsapp/schemas';

import { readOrgBody } from '@/lib/security/organizationBody';
/** POST /api/crm/whatsapp/templates/[id]/submit (admin) { channelId? } → { data } (PENDING, meta_template_id | twilio.content_sid). */
export const runtime = 'nodejs';

export const POST = withWhatsAppRoute(async (ctx, req, params) => {
  const b = parseWith(zChannelIdBody, await readOrgBody<unknown>(ctx, req));
  const data = await submitHsm(ctx.organizationId, params.id, b.channelId ?? null, ctx.supabase);
  return NextResponse.json({ data });
}, { admin: true });
