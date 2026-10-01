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
import type { SegmentoRegistro } from "@/lib/services/crm/segmentosAudiencia";
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
    const rows: SegmentoRegistro[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await ctx.supabase
        .from("segments")
        .select("*")
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, from + 499);
      if (error) throw error;
      const batch = (data ?? []) as SegmentoRegistro[];
      if (batch.length) {
        const usage = await ctx.supabase.rpc("crm_segment_usages", {
          p_org: ctx.organizationId,
          p_ids: batch.map((s) => s.id),
        });
        if (usage.error) throw usage.error;
        if (!Array.isArray(usage.data))
          throw new Error("Usos de segmentos no disponibles");
        const byId = new Map(
          (
            usage.data as Array<{
              id: string;
              campaigns: number;
              voice_campaigns: number;
              sequences: number;
            }>
          ).map((row) => [row.id, row]),
        );
        for (const segment of batch) {
          const value = byId.get(segment.id);
          if (!value) throw new Error("Usos de segmento incompletos");
          segment.usage = {
            campaigns: value.campaigns,
            voice_campaigns: value.voice_campaigns,
            sequences: value.sequences,
          };
        }
      }
      rows.push(...batch);
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
