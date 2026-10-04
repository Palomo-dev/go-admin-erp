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
  leerAudienciaSegmento,
  obtenerSegmento,
} from "@/lib/services/crm/segmentosService";
import {
  segmentoMembersQuery,
  validarSegmento,
} from "@/lib/services/crm/segmentosSchemas";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesVer],
      "miembros segmento",
    );
    const query = validarSegmento(
      segmentoMembersQuery,
      sinClavesDeOrganizacion(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const segment = await obtenerSegmento(
      ctx.organizationId,
      (await context.params).id,
      ctx.supabase,
    );
    const { members, counts, has_more, as_of } = await leerAudienciaSegmento(
      ctx.organizationId,
      ctx.supabase,
      { segment, ...query, signal: request.signal },
    );
    return NextResponse.json({
      success: true,
      data: { members, counts, has_more, as_of, ...query },
    });
  } catch (error) {
    return respuestaErrorCrm(error, "GET /api/crm/segments/id/members");
  }
}
