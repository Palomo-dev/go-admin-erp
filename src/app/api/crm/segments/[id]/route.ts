import { NextRequest, NextResponse } from "next/server";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import {
  CRM_PERMISOS,
  exigirPermisoCrm,
  tienePermisoCrm,
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
} from "@/lib/services/crm/crmRouteSupport";
import {
  guardarSegmento,
  obtenerSegmento,
  borrarSegmento,
} from "@/lib/services/crm/segmentosService";
import {
  segmentoBody,
  validarSegmento,
} from "@/lib/services/crm/segmentosSchemas";
type Params = { params: Promise<{ id: string }> };
import { z } from 'zod';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], "ver segmento");
    const data = await obtenerSegmento(
      ctx.organizationId,
      (await context.params).id,
      ctx.supabase,
    );
    return NextResponse.json({
      success: true,
      data,
      can_manage: await tienePermisoCrm(ctx, CRM_PERMISOS.segmentosGestionar),
    });
  } catch (error) {
    return respuestaErrorCrm(error, "GET /api/crm/segments/id");
  }
}
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = validarSegmento(
      segmentoBody,
      sinClavesDeOrganizacion(await readOrgBody(ctx, request)),
    );
    const data = await guardarSegmento(ctx, {
      ...body,
      id: (await context.params).id,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, "PATCH /api/crm/segments/id");
  }
}
export async function DELETE(request: NextRequest, context: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = validarSegmento(z.object({ expected_updated_at: z.string().datetime({ offset: true }) }).strict(), sinClavesDeOrganizacion(await readOrgBody(ctx, request)));
    await borrarSegmento(ctx, (await context.params).id, body.expected_updated_at);
    return NextResponse.json({ success: true, data: null });
  } catch (error) { return respuestaErrorCrm(error, 'DELETE /api/crm/segments/id'); }
}
