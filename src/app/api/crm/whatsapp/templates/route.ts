import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { createHsm, listHsm, type CreateHsmInput } from '@/lib/services/crm/whatsapp/templateService';
import { parseWith, searchParamsToObject, zCreateHsmBody, zHsmListQuery } from '@/lib/services/crm/whatsapp/schemas';
import type { HsmCategory, HsmStatus } from '@/lib/services/crm/whatsapp/types';

/**
 * GET  /api/crm/whatsapp/templates?status=APPROVED&category=&q=&channelId=&includeInactive=1 → { data }
 * POST /api/crm/whatsapp/templates (admin) CreateHsmInput → 201 { data } (status DRAFT)
 */
export const GET = withWhatsAppRoute(async (ctx, req) => {
  const p = parseWith(zHsmListQuery, searchParamsToObject(new URL(req.url).searchParams), 'query');
  const data = await listHsm(ctx.organizationId, {
    status: (p.status as HsmStatus | 'ALL' | undefined) ?? undefined,
    category: (p.category as HsmCategory | undefined) ?? undefined,
    q: p.q,
    channelId: p.channelId,
    includeInactive: p.includeInactive === '1',
  }, ctx.supabase);
  return NextResponse.json({ data });
});

export const POST = withWhatsAppRoute(async (ctx, req) => {
  const b = parseWith(zCreateHsmBody, await readJson<unknown>(req));
  const data = await createHsm(ctx.organizationId, ctx.userId, b as CreateHsmInput, ctx.supabase);
  return NextResponse.json({ data }, { status: 201 });
}, { admin: true });
