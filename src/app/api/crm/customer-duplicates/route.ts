import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import {
  CRM_PERMISOS,
  CrmHttpError,
  exigirPermisoCrm,
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
  tienePermisoCrm,
} from "@/lib/services/crm/crmRouteSupport";
import { buscarDuplicados } from "@/lib/services/crm/customerDuplicateScanService";
import {
  paginaPares,
  type GrupoDuplicado,
  type ParExcluido,
} from "@/lib/services/crm/customerDuplicatesLogica";
import { isOrgAdminLike } from "@/lib/utils/orgAdmin";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesVer],
      "GET /api/crm/customer-duplicates",
    );
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
    const groups = await buscarDuplicados(ctx.organizationId, ctx.supabase);
    const exclusions: ParExcluido[] = [];
    // Las exclusiones también se paginan: un límite implícito no debe volver a sugerir pares.
    for (let start = 0; ; start += 1000) {
      const { data, error } = await ctx.supabase
        .from("customer_merge_exclusions")
        .select("customer_a,customer_b")
        .eq("organization_id", ctx.organizationId)
        .order("customer_a")
        .order("customer_b")
        .range(start, start + 999);
      if (error) throw error;
      exclusions.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    const { data: scan, error } = await ctx.supabase
      .from("customer_duplicate_scans")
      .select(
        "id,status,processed,total,created_at,completed_at,job_id,job:outbound_jobs(status)",
      )
      .eq("organization_id", ctx.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const canMerge = await tienePermisoCrm(ctx, CRM_PERMISOS.clientesFusionar);
    const search = sp.get("q")?.trim().toLocaleLowerCase().slice(0, 100);
    const filtered = search
      ? groups.filter((g) =>
          g.customers.some((c) =>
            [c.full_name, c.email, c.phone, c.identification_number].some((v) =>
              v?.toLocaleLowerCase().includes(search),
            ),
          ),
        )
      : groups;
    const result = paginaPares(filtered as GrupoDuplicado[], exclusions, page);
    const stats = Object.fromEntries(
      ["phone", "email", "document"].map((kind) => [
        kind,
        paginaPares(
          groups.filter((g) => g.identity_type === kind),
          exclusions,
          1,
        ).total,
      ]),
    );
    return NextResponse.json({
      success: true,
      ...result,
      stats,
      scan: scan && {
        ...scan,
        status:
          ["queued", "running"].includes(scan.status) &&
          !["queued", "running"].includes(
            (scan.job as unknown as { status?: string } | null)?.status ?? "",
          )
            ? "failed"
            : scan.status,
        job: undefined,
      },
      canMerge,
      canUndo: canMerge && isOrgAdminLike(ctx),
    });
  } catch (error) {
    return respuestaErrorCrm(error, "GET /api/crm/customer-duplicates");
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesFusionar],
      "POST /api/crm/customer-duplicates",
    );
    const body = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    if (Object.keys(body).length)
      throw new CrmHttpError(
        400,
        "cuerpo_invalido",
        "La búsqueda no necesita datos del cliente",
      );
    const { data, error } = await ctx.supabase.rpc("crm_start_duplicate_scan", {
      p_org: ctx.organizationId,
    });
    if (error) throw error;
    return NextResponse.json(
      { success: true, data: { id: data } },
      { status: 202 },
    );
  } catch (error) {
    return respuestaErrorCrm(error, "POST /api/crm/customer-duplicates");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesFusionar],
      "DELETE /api/crm/customer-duplicates",
    );
    const body = sinClavesDeOrganizacion(await readOrgBody(ctx, request));
    const parsed = z
      .object({ customer_a: z.string().uuid(), customer_b: z.string().uuid() })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      throw new CrmHttpError(
        400,
        "seleccion_invalida",
        "Selecciona dos clientes",
      );
    const { error } = await ctx.supabase.rpc("crm_exclude_customer_pair", {
      p_org: ctx.organizationId,
      p_a: parsed.data.customer_a,
      p_b: parsed.data.customer_b,
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return respuestaErrorCrm(error, "DELETE /api/crm/customer-duplicates");
  }
}
