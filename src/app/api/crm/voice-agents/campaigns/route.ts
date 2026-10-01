import { NextRequest, NextResponse } from "next/server";
import { getServerOrgContext, hasOrgAdminOrPermission } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import { getVoiceAgentCampaigns } from "@/lib/services/crm/voiceAgentService";
import { guardarCampanaVoz } from "@/lib/services/crm/voiceCampaignWriteService";
import {
  CRM_PERMISOS,
  exigirPermisoCrm,
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
} from "@/lib/services/crm/crmRouteSupport";
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.oportunidadesVer],
      "ver campañas",
    );
    return NextResponse.json({
      success: true,
      data: await getVoiceAgentCampaigns(ctx.organizationId, ctx.supabase),
      can_manage: await hasOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar),
    });
  } catch (e) {
    return respuestaErrorCrm(e, "GET /api/crm/voice-agents/campaigns");
  }
}
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    return NextResponse.json(
      { success: true, data: await guardarCampanaVoz(ctx, body) },
      { status: 201 },
    );
  } catch (e) {
    return respuestaErrorCrm(e, "POST /api/crm/voice-agents/campaigns");
  }
}
