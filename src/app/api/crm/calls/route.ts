import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerOrgContext } from "@/lib/utils/orgContext";
import { readOrgBody } from "@/lib/security/organizationBody";
import {
  CRM_PERMISOS,
  CrmHttpError,
  respuestaErrorCrm,
  tienePermisoCrm,
} from "@/lib/services/crm/crmRouteSupport";
import {
  listCallsWithRelations,
  createCall,
  type CallFilters,
} from "@/lib/services/crm/callManagementService";
import { CALL_DIRECTIONS, CALL_MODES, CALL_STATUSES } from "@/lib/crm/enums";
import { getOrganizationTimezone } from "@/lib/services/organizationTimezoneService";
import { normalizarFechasLlamadas } from "@/lib/services/crm/callFiltersLogica";
import { todayInTz } from "@/lib/utils/dateCore";
import { isValidPlainDate } from "@/lib/services/crm/revenueOs/dateRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = z.string().uuid();
const fecha = z
  .string()
  .datetime({ offset: true })
  .or(z.string().refine(isValidPlainDate));
const filtersSchema = z.object({
  status: z.enum(CALL_STATUSES).optional(),
  direction: z.enum(CALL_DIRECTIONS).optional(),
  mode: z.enum(CALL_MODES).optional(),
  customer_id: uuid.optional(),
  user_id: z.union([uuid, z.literal("me")]).optional(),
  opportunity_id: uuid.optional(),
  provider_call_sid: z.string().max(64).optional(),
  outcome: z.string().max(40).optional(),
  has_recording: z.enum(["true", "1", "false", "0"]).optional(),
  q: z.string().max(200).optional(),
  from_date: fecha.optional(),
  to_date: fecha.optional(),
  stats_today: z.enum(["true", "1"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** La RPC aplica los mismos filtros al listado, al total y a los indicadores. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const parsed = filtersSchema.safeParse(
      Object.fromEntries(
        [...new URL(request.url).searchParams].filter(([, v]) => v !== ""),
      ),
    );
    if (!parsed.success)
      throw new CrmHttpError(400, "filtros_invalidos", "Filtros inválidos");
    const { stats_today, ...f } = parsed.data;
    const canViewAll = await tienePermisoCrm(
      ctx,
      CRM_PERMISOS.llamadasVerTodas,
    );
    const requestedUser = f.user_id === "me" ? ctx.userId : f.user_id;
    if (!canViewAll && requestedUser && requestedUser !== ctx.userId)
      throw new CrmHttpError(
        403,
        "sin_permiso",
        "No puedes ver las llamadas de otro vendedor",
      );
    const timezone = await getOrganizationTimezone(
      ctx.organizationId,
      ctx.supabase,
    );
    const day = todayInTz(timezone);
    const filters: CallFilters = normalizarFechasLlamadas(
      {
        ...f,
        user_id: canViewAll ? requestedUser : ctx.userId,
        has_recording:
          f.has_recording === undefined
            ? undefined
            : ["true", "1"].includes(f.has_recording),
        ...(stats_today ? { from_date: day, to_date: day } : {}),
      },
      timezone,
    );
    const result = await listCallsWithRelations(
      ctx.organizationId,
      ctx.supabase,
      filters,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return respuestaErrorCrm(error, "GET /api/crm/calls");
  }
}

const createSchema = z.object({
  provider: z.string().min(1).max(40),
  direction: z.enum(CALL_DIRECTIONS),
  mode: z.enum(CALL_MODES).optional(),
  from_number: z.string().min(3).max(32),
  to_number: z.string().min(3).max(32),
  status: z.enum(CALL_STATUSES).optional(),
  customer_id: uuid.nullable().optional(),
  opportunity_id: uuid.nullable().optional(),
  started_at: z.string().datetime({ offset: true }).optional(),
  ended_at: z.string().datetime({ offset: true }).nullable().optional(),
  duration_seconds: z.number().int().min(0).nullable().optional(),
  recording_enabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const parsed = createSchema.safeParse(await readOrgBody(ctx, request));
    if (!parsed.success)
      throw new CrmHttpError(
        400,
        "cuerpo_invalido",
        "Datos de llamada inválidos",
      );
    for (const [table, id] of [
      ["customers", parsed.data.customer_id],
      ["opportunities", parsed.data.opportunity_id],
    ] as const) {
      if (!id) continue;
      const { data, error } = await ctx.supabase
        .from(table)
        .select("id")
        .eq("id", id)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new CrmHttpError(
          404,
          "registro_no_encontrado",
          "El registro no existe en la organización",
        );
    }
    const call = await createCall(
      ctx.organizationId,
      {
        ...parsed.data,
        mode: parsed.data.mode ?? "manual",
        status: parsed.data.status ?? "completed",
        user_id: ctx.userId,
        duration_source:
          parsed.data.duration_seconds != null ? "manual" : "estimated",
      },
      ctx.supabase,
    );
    return NextResponse.json({ success: true, data: call }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, "POST /api/crm/calls");
  }
}
