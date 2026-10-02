import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, readOrgBody } from '@/lib/utils/orgContext';
import { exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { phoneConferenceEnabled } from '@/lib/services/crm/phoneConferenceRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Contexto mínimo: la RPC autoriza invitación propia, pertenencia y llamada. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const { callId } = await params; exigirUuid(callId);
    if (!phoneConferenceEnabled()) return NextResponse.json({ success: false, error: 'Telefonía entrante todavía no disponible', code: 'PHONE_NOT_AVAILABLE' }, { status: 503 });
    const result = await ctx.supabase.rpc('fn_phone_inbound_context', { p_org: ctx.organizationId, p_call: callId });
    if (result.error) {
      if (['42883', 'PGRST202'].includes(result.error.code)) return NextResponse.json({ success: false, error: 'Telefonía entrante todavía no disponible', code: 'PHONE_NOT_AVAILABLE' }, { status: 503 });
      throw result.error;
    }
    return NextResponse.json({ success: true, data: result.data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'GET contexto entrante'); }
}
