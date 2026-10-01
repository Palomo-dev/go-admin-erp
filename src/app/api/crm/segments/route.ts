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
import { guardarSegmento } from "@/lib/services/crm/segmentosService";
import {
  segmentoBody,
  validarSegmento,
} from "@/lib/services/crm/segmentosSchemas";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], "listar segmentos");
    const rows: unknown[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await ctx.supabase
        .from("segments")
        .select("*")
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, from + 499);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return NextResponse.json({
      success: true,
      data: rows,
      can_manage: await tienePermisoCrm(ctx, CRM_PERMISOS.segmentosGestionar),
    });
  } catch (error) {
    return respuestaErrorCrm(error, "GET /api/crm/segments");
  }
}
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = validarSegmento(
      segmentoBody,
      sinClavesDeOrganizacion(await readOrgBody(ctx, request)),
    );
    return NextResponse.json(
      { success: true, data: await guardarSegmento(ctx, body) },
      { status: 201 },
    );
  } catch (error) {
    return respuestaErrorCrm(error, "POST /api/crm/segments");
  }
}
