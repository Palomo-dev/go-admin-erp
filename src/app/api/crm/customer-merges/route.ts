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
import { readMergeHistoryPage } from "@/lib/services/crm/customerMergeHistory";

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
    const result = await readMergeHistoryPage(ctx, start, 25);
    return NextResponse.json({
      success: true,
      data: result.data,
      total: result.total,
      page,
    });
  } catch (error) {
    return respuestaErrorCrm(error, "GET /api/crm/customer-merges");
  }
}
