import { NextRequest, NextResponse } from "next/server";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import {
  CrmHttpError,
  respuestaErrorCrm,
} from "@/lib/services/crm/crmRouteSupport";
import {
  campanasUnificadasQuery,
  listarCampanasUnificadas,
} from "@/lib/services/crm/campaignsUnificadasService";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const parsed = campanasUnificadasQuery.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success)
      throw new CrmHttpError(400, "filtros_invalidos", "Filtros inválidos");
    return NextResponse.json({
      success: true,
      data: await listarCampanasUnificadas(ctx, parsed.data),
    });
  } catch (e) {
    return respuestaErrorCrm(e, "GET /api/crm/campaigns/unified");
  }
}
