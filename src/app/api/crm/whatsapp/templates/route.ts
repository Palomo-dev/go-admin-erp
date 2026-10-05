import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { createHsm, listHsm, type CreateHsmInput } from '@/lib/services/crm/whatsapp/templateService';
import { parseWith, searchParamsToObject, zCreateHsmBody, zHsmListQuery } from '@/lib/services/crm/whatsapp/schemas';
import type { HsmCategory, HsmStatus } from '@/lib/services/crm/whatsapp/types';

import { readOrgBody } from '@/lib/security/organizationBody';
import { canManageTemplates, requireTemplateRead, assertTemplateQuery } from '@/lib/services/crm/email/templateAccess';
/**
 * GET  /api/crm/whatsapp/templates?status=APPROVED&category=&q=&channelId=&includeInactive=1 → { data }
 * POST /api/crm/whatsapp/templates (admin) CreateHsmInput → 201 { data } (status DRAFT)
 */
export const GET = withWhatsAppRoute(async (ctx, req) => {
  assertTemplateQuery(ctx, req); await requireTemplateRead(ctx);
  const p = parseWith(zHsmListQuery, searchParamsToObject(new URL(req.url).searchParams), 'query');
  const data = await listHsm(ctx.organizationId, {
    status: (p.status as HsmStatus | 'ALL' | undefined) ?? undefined,
    category: (p.category as HsmCategory | undefined) ?? undefined,
    q: p.q,
    channelId: p.channelId,
    includeInactive: p.includeInactive === '1',
  }, ctx.supabase);
  return NextResponse.json({ data, can_manage: await canManageTemplates(ctx) });
});

export const POST = withWhatsAppRoute(async (ctx, req) => {
  const b = parseWith(zCreateHsmBody, await readOrgBody<unknown>(ctx, req));
  const data = await createHsm(ctx.organizationId, ctx.userId, b as CreateHsmInput, ctx.supabase);
  return NextResponse.json({ data }, { status: 201 });
}, { admin: true, permission: 'crm.campaigns.manage' });
