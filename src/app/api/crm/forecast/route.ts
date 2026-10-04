import { NextRequest, NextResponse } from "next/server";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import {
  CrmHttpError,
  respuestaErrorCrm,
} from "@/lib/services/crm/crmRouteSupport";
import {
  forecastQuerySchema,
  listarPronostico,
} from "@/lib/services/crm/forecastService";
import { trimestreDelDia } from "@/lib/services/crm/forecastLogica";
import { getOrganizationTimezone } from "@/lib/services/organizationTimezoneService";
import { todayInTz } from "@/lib/utils/dateCore";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const parsed = forecastQuerySchema.safeParse(
      Object.fromEntries(
        [...new URL(request.url).searchParams].filter(([, v]) => v !== ""),
      ),
    );
    if (!parsed.success)
      throw new CrmHttpError(400, "filtros_invalidos", "Filtros inválidos");
    const period =
      parsed.data.period ??
      trimestreDelDia(
        todayInTz(
          await getOrganizationTimezone(ctx.organizationId, ctx.supabase),
        ),
      );
    const data = await listarPronostico(ctx, { ...parsed.data, period });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, "GET /api/crm/forecast");
  }
}
