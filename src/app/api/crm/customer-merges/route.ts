import { NextRequest, NextResponse } from "next/server";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import {
  CRM_PERMISOS,
  exigirPermisoCrm,
  respuestaErrorCrm,
  sinClavesDeOrganizacion,
} from "@/lib/services/crm/crmRouteSupport";
import { fusionarClientes } from "@/lib/services/crm/customerMergeService";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesFusionar],
      "POST /api/crm/customer-merges",
    );
    const body = await readOrgBody(ctx, request);
    const data = await fusionarClientes(ctx, sinClavesDeOrganizacion(body));
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, "POST /api/crm/customer-merges");
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.clientesFusionar],
      "GET /api/crm/customer-merges",
    );
    const sp = new URL(request.url).searchParams;
    const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
    const start = (page - 1) * 25;
    // El snapshot incluye datos personales: la lista entrega únicamente auditoría.
    const { data, error, count } = await ctx.supabase
      .from("customer_merges")
      .select(
        "id, primary_customer_id, secondary_customer_id, merged_at, merged_by, undone_at, undone_by, moved_rows, principal:customers!customer_merges_primary_customer_id_fkey(full_name), secundario:customers!customer_merges_secondary_customer_id_fkey(full_name), autor:profiles!customer_merges_merged_by_fkey(first_name,last_name)",
        { count: "exact" },
      )
      .eq("organization_id", ctx.organizationId)
      .gte("merged_at", new Date(Date.now() - 90 * 86400000).toISOString())
      .order("merged_at", { ascending: false })
      .order("id")
      .range(start, start + 24);
    if (error) throw error;
    const rows = (data ?? []).map(({ moved_rows, ...row }) => ({
      ...row,
      moved_counts: Array.isArray(moved_rows)
        ? moved_rows.map((move: { table: string; ids: unknown[] }) => ({
            table: move.table,
            count: move.ids.length,
          }))
        : [],
    }));
    return NextResponse.json({
      success: true,
      data: rows,
      total: count ?? 0,
      page,
    });
  } catch (error) {
    return respuestaErrorCrm(error, "GET /api/crm/customer-merges");
  }
}
