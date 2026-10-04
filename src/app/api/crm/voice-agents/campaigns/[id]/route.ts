import { NextRequest, NextResponse } from "next/server";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import { obtenerCampanaVoz } from "@/lib/services/crm/voiceCampaignDetailService";
import { z } from "zod";
import {
  guardarCampanaVoz,
  eliminarCampanaVoz,
} from "@/lib/services/crm/voiceCampaignWriteService";
import {
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
} from "@/lib/services/crm/crmRouteSupport";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .safeParse(request.nextUrl.searchParams.get("page") ?? 1);
    if (!page.success)
      return NextResponse.json(
        { success: false, error: "Página inválida" },
        { status: 400 },
      );
    return NextResponse.json(
      {
        success: true,
        data: await obtenerCampanaVoz(ctx, (await params).id, page.data),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return respuestaErrorCrm(e, "GET /api/crm/voice-agents/campaigns/[id]");
  }
}
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    return NextResponse.json({
      success: true,
      data: await guardarCampanaVoz(ctx, body, (await params).id),
    });
  } catch (e) {
    return respuestaErrorCrm(e, "PATCH /api/crm/voice-agents/campaigns/[id]");
  }
}
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    await eliminarCampanaVoz(ctx, (await params).id, body);
    return NextResponse.json({ success: true });
  } catch (e) {
    return respuestaErrorCrm(e, "DELETE /api/crm/voice-agents/campaigns/[id]");
  }
}
