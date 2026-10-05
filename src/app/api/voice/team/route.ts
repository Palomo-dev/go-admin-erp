import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { phoneConferenceEnabled, phoneRpc } from '@/lib/services/crm/phoneConferenceRepository';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { CrmHttpError } from '@/lib/services/crm/crmErrors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const presence = z.object({ client_key: z.string().uuid(), registered: z.boolean() }).strict();
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    if (!phoneConferenceEnabled()) return NextResponse.json({ success: true, data: [] });
    const data = await phoneRpc(ctx.supabase, 'fn_phone_team', { p_org: ctx.organizationId });
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'equipo_telefonia'); }
}
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const raw = readOrgBody(ctx, await request.json().catch(() => null), { request });
    const parsed = presence.safeParse(sinClavesDeOrganizacion(raw));
    if (!parsed.success) throw new CrmHttpError(400, 'presencia_invalida', 'La presencia no es válida');
    if (phoneConferenceEnabled()) await phoneRpc(ctx.supabase, 'fn_phone_presence', {
      p_org: ctx.organizationId, p_client: parsed.data.client_key, p_registered: parsed.data.registered,
    });
    return NextResponse.json({ success: true });
  } catch (error) { return respuestaErrorCrm(error, 'presencia_telefonia'); }
}
