import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { getVoiceAgentMetrics } from '@/lib/services/crm/voiceAgentMetrics';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const query = new URL(request.url).searchParams;
    readOrgBody(ctx, query, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'GET voice-agent metrics');
    return NextResponse.json({ success: true, data: await getVoiceAgentMetrics(ctx, (await params).id, query) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'GET voice-agent metrics'); }
}
