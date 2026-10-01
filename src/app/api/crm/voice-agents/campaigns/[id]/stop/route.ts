import { NextRequest, NextResponse } from "next/server";
import {
  getServerOrgContext,
  requireOrgAdminOrPermission,
} from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import { z } from "zod";
import {
  CRM_PERMISOS,
  CrmHttpError,
  exigirUuid,
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
} from "@/lib/services/crm/crmRouteSupport";
import { stopCampaign } from "@/lib/services/crm/voiceAgentService";
const schema = z
  .object({ reason: z.string().trim().min(3).max(2000) })
  .strict();
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    await requireOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar);
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new CrmHttpError(400, "motivo_invalido", "Escribe el motivo");
    const id = exigirUuid((await params).id);
    if (
      !(await stopCampaign(
        ctx.organizationId,
        id,
        parsed.data.reason,
        ctx.supabase,
      ))
    )
      throw new CrmHttpError(
        404,
        "campana_no_encontrada",
        "Campaña no encontrada",
      );
    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    return respuestaErrorCrm(
      e,
      "POST /api/crm/voice-agents/campaigns/[id]/stop",
    );
  }
}
