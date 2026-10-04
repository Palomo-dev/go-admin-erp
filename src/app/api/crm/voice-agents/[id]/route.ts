import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getVoiceAgent, updateVoiceAgent, deleteVoiceAgent } from '@/lib/services/crm/voiceAgentService';
import { CRM_PERMISOS, CrmHttpError, exigirUuid, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { parseVoiceAgentConfig, validateAgentReferences } from '@/lib/services/crm/voiceAgentConfig';
type Params = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, new URL(request.url).searchParams, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'GET agente IA');
    const { id } = await params; exigirUuid(id, 'agente');
    const data = await getVoiceAgent(id, ctx.organizationId, ctx.supabase);
    if (!data) throw new CrmHttpError(404, 'agente_no_encontrado', 'Agente no encontrado');
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'GET agente IA'); }
}
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const raw = await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'PATCH agente IA');
    const { id } = await params; exigirUuid(id, 'agente');
    const current = await getVoiceAgent(id, ctx.organizationId, ctx.supabase);
    if (!current) throw new CrmHttpError(404, 'agente_no_encontrado', 'Agente no encontrado');
    const body = parseVoiceAgentConfig(sinClavesDeOrganizacion(raw));
    await validateAgentReferences(ctx, body, current);
    const data = await updateVoiceAgent(id, ctx.organizationId, { ...body, voice_id: body.voice_id === null ? '' : body.voice_id }, ctx.supabase);
    if (!data) throw new CrmHttpError(404, 'agente_no_encontrado', 'Agente no encontrado');
    return NextResponse.json({ success: true, data });
  } catch (error) { return respuestaErrorCrm(error, 'PATCH agente IA'); }
}
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'DELETE agente IA');
    const { id } = await params; exigirUuid(id, 'agente');
    await deleteVoiceAgent(id, ctx.organizationId, ctx.supabase);
    return NextResponse.json({ success: true });
  } catch (error) { return respuestaErrorCrm(error, 'DELETE agente IA'); }
}
