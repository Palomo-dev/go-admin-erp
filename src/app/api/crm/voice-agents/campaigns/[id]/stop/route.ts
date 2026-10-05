import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { detenerCampanaVoz } from '@/lib/services/crm/voiceCampaignWriteService';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    return NextResponse.json({ success: true, data: await detenerCampanaVoz(ctx, (await params).id, body) });
  } catch (e) {
    return respuestaErrorCrm(e, 'POST /api/crm/voice-agents/campaigns/[id]/stop');
  }
}
