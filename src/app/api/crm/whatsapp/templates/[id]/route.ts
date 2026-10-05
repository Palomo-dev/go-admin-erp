import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { deleteHsm, requireHsm, updateHsm, type UpdateHsmInput } from '@/lib/services/crm/whatsapp/templateService';
import { parseWith, zUpdateHsmBody } from '@/lib/services/crm/whatsapp/schemas';

import { readOrgBody } from '@/lib/security/organizationBody';
import { canManageTemplates, requireTemplateRead, assertTemplateQuery } from '@/lib/services/crm/email/templateAccess';
/** GET | PATCH (admin) | DELETE (admin) /api/crm/whatsapp/templates/[id] */
export const GET = withWhatsAppRoute(async (ctx, _req, params) => {
  assertTemplateQuery(ctx, _req); await requireTemplateRead(ctx);
  const data = await requireHsm(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ data, can_manage: await canManageTemplates(ctx) });
});

export const PATCH = withWhatsAppRoute(async (ctx, req, params) => {
  const b = parseWith(zUpdateHsmBody, await readOrgBody<unknown>(ctx, req));
  const data = await updateHsm(ctx.organizationId, params.id, b as UpdateHsmInput, ctx.supabase);
  return NextResponse.json({ data });
}, { admin: true, permission: 'crm.campaigns.manage' });

export const DELETE = withWhatsAppRoute(async (ctx, req, params) => {
  await readOrgBody(ctx, req);
  const r = await deleteHsm(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ success: true, ...r });
}, { admin: true, permission: 'crm.campaigns.manage' });
