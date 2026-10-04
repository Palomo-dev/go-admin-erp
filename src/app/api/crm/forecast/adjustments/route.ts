import { NextRequest, NextResponse } from "next/server";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import {
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
} from "@/lib/services/crm/crmRouteSupport";
import { ajustarPronostico } from "@/lib/services/crm/forecastService";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const data = await ajustarPronostico(
      ctx,
      sinClavesDeOrganizacion(await readOrgBody(ctx, request)),
    );
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, "POST /api/crm/forecast/adjustments");
  }
}
