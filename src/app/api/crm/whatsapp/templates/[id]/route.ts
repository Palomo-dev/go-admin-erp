import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { deleteHsm, requireHsm, updateHsm, type UpdateHsmInput } from '@/lib/services/crm/whatsapp/templateService';
import { parseWith, zUpdateHsmBody } from '@/lib/services/crm/whatsapp/schemas';

/** GET | PATCH (admin) | DELETE (admin) /api/crm/whatsapp/templates/[id] */
export const GET = withWhatsAppRoute(async (ctx, _req, params) => {
  const data = await requireHsm(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ data });
});

export const PATCH = withWhatsAppRoute(async (ctx, req, params) => {
  const b = parseWith(zUpdateHsmBody, await readJson<unknown>(req));
  const data = await updateHsm(ctx.organizationId, params.id, b as UpdateHsmInput, ctx.supabase);
  return NextResponse.json({ data });
}, { admin: true });

export const DELETE = withWhatsAppRoute(async (ctx, _req, params) => {
  const r = await deleteHsm(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ success: true, ...r });
}, { admin: true });
