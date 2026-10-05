import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { testVoiceAgent } from '@/lib/services/crm/voiceAgentTestService';
import { InsufficientCreditsError } from '@/lib/services/crm/aiCostService';
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'POST prueba agente nuevo');
    return NextResponse.json({ success: true, data: await testVoiceAgent(ctx, null, sinClavesDeOrganizacion(body)) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: 402 });
    return respuestaErrorCrm(error, 'POST prueba agente nuevo');
  }
}
