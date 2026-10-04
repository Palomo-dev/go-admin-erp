import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getVoiceAgents, createVoiceAgent } from '@/lib/services/crm/voiceAgentService';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { parseVoiceAgentConfig, validateAgentReferences } from '@/lib/services/crm/voiceAgentConfig';
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, new URL(request.url).searchParams, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'GET agentes IA');
    return NextResponse.json({ success: true, data: await getVoiceAgents(ctx.organizationId, ctx.supabase) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'GET agentes IA'); }
}
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const raw = await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'POST agente IA');
    const body = parseVoiceAgentConfig(sinClavesDeOrganizacion(raw), true);
    if (!body.name) throw new CrmHttpError(400, 'nombre_requerido', 'El nombre es obligatorio');
    await validateAgentReferences(ctx, body);
    const data = await createVoiceAgent(ctx.organizationId, { ...body, name: body.name, voice_id: body.voice_id ?? undefined }, ctx.supabase, ctx.userId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) { return respuestaErrorCrm(error, 'POST agente IA'); }
}
