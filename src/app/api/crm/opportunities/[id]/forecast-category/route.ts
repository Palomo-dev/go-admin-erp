import { NextRequest, NextResponse } from "next/server";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import {
  CRM_PERMISOS,
  CrmHttpError,
  exigirPermisoCrm,
  exigirUuid,
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
} from "@/lib/services/crm/crmRouteSupport";
import { categorySchema } from "@/lib/services/crm/forecastService";
export const runtime = "nodejs";
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    await exigirPermisoCrm(
      ctx,
      [
        CRM_PERMISOS.oportunidadesEditar,
        CRM_PERMISOS.oportunidadesEditarCualquiera,
      ],
      "cambiar categoría del pronóstico",
    );
    const id = exigirUuid((await params).id);
    const parsed = categorySchema.safeParse(body);
    if (!parsed.success)
      throw new CrmHttpError(400, "datos_invalidos", "Categoría inválida");
    const { data, error } = await ctx.supabase.rpc(
      "crm_set_forecast_category",
      {
        p_org: ctx.organizationId,
        p_id: id,
        p_category: parsed.data.category,
        p_expected_updated_at: parsed.data.expected_updated_at,
      },
    );
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(
      error,
      "PATCH /api/crm/opportunities/[id]/forecast-category",
    );
  }
}
