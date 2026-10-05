import { NextRequest, NextResponse } from "next/server";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import {
  CRM_PERMISOS,
  exigirPermisoCrm,
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
} from "@/lib/services/crm/crmRouteSupport";
import {
  segmentoPreviewBody,
  validarSegmento,
} from "@/lib/services/crm/segmentosSchemas";
import { leerAudienciaSegmento } from "@/lib/services/crm/segmentosService";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesVer],
      "vista previa segmento",
    );
    const body = validarSegmento(
      segmentoPreviewBody,
      sinClavesDeOrganizacion(await readOrgBody(ctx, request)),
    );
    const { counts, samples, as_of } = await leerAudienciaSegmento(
      ctx.organizationId,
      ctx.supabase,
      { filter: body.filter_json, signal: request.signal },
    );
    return NextResponse.json({
      success: true,
      data: { counts, samples, as_of },
    });
  } catch (error) {
    return respuestaErrorCrm(error, "POST /api/crm/segments/preview");
  }
}
