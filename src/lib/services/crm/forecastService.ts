import { z } from "zod";
import { calcularPronosticoMensual } from "./forecastMensualLogica";
import { getServiceClient } from "@/lib/supabase/server-service";
import { resolverContextoMoneda } from "@/lib/services/monedaOrganizacion";
import { sumarEnMonedaBase } from "@/components/crm/kit/monedaCrm";
import {
  CRM_PERMISOS,
  CrmHttpError,
  exigirPermisoCrm,
  tienePermisoCrm,
  type CrmSesion,
} from "./crmRouteSupport";
import {
  calcularFilaPronostico,
  calcularPronostico,
  categoriaPronostico,
  FORECAST_CATEGORIES,
  type ForecastSnapshot,
} from "./forecastLogica";
const period = z.string().regex(/^[1-9]\d{3}-Q[1-4]$/);
export const forecastQuerySchema = z.object({
  period: period.optional(),
  user_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export const categorySchema = z
  .object({
    category: z.enum(FORECAST_CATEGORIES),
    expected_updated_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export const adjustmentSchema = z
  .object({
    period,
    user_id: z.string().uuid(),
    amount_after: z.number().finite().min(0).max(1e15).optional(),
    expected_before: z.number().finite(),
    expected_adjustment_id: z.string().uuid().nullable(),
    reason_code: z.enum([
      "verbal_agreement",
      "deal_risk",
      "upside",
      "correction",
      "reversal",
    ]),
    reason_text: z.string().trim().min(3).max(2000),
    reverses_id: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) =>
    v.reason_code === "reversal"
      ? Boolean(v.reverses_id)
      : v.amount_after !== undefined && !v.reverses_id,
  );
export async function leerSnapshotPronostico(
  ctx: CrmSesion,
  period: string,
  user?: string,
  team?: string,
): Promise<ForecastSnapshot> {
  const { data, error } = await ctx.supabase.rpc("crm_forecast_snapshot", {
    p_org: ctx.organizationId,
    p_period: period,
    p_user: user ?? null,
    p_team: team ?? null,
  });
  if (error) throw error;
  const snapshot = data as ForecastSnapshot;
  snapshot.adjustments = snapshot.adjustments.map(
    ({
      id,
      user_id,
      amount_before,
      amount_after,
      currency,
      reason_code,
      reason_text,
      adjusted_by,
      created_at,
      reverses_id,
      author,
    }) => ({
      id,
      user_id,
      amount_before,
      amount_after,
      currency,
      reason_code,
      reason_text,
      adjusted_by,
      created_at,
      reverses_id,
      author,
    }),
  );
  return snapshot;
}
export async function listarPronostico(
  ctx: CrmSesion,
  filters: z.infer<typeof forecastQuerySchema> & { period: string },
) {
  await exigirPermisoCrm(
    ctx,
    [CRM_PERMISOS.oportunidadesVer],
    "leer pronóstico",
  );
  if (
    filters.user_id &&
    filters.user_id !== ctx.userId &&
    !(await tienePermisoCrm(ctx, CRM_PERMISOS.pronosticoVerTodas))
  )
    throw new CrmHttpError(403, "sin_permiso", "No puedes ver otro vendedor");
  const snapshot = await leerSnapshotPronostico(
    ctx,
    filters.period,
    undefined,
    filters.team_id,
  );
  const [moneda, teams, canEdit] = await Promise.all([
    resolverContextoMoneda(ctx.supabase, ctx.organizationId, snapshot.base),
    ctx.supabase
      .from("sales_teams")
      .select("id,name")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true)
      .order("name"),
    tienePermisoCrm(ctx, CRM_PERMISOS.oportunidadesEditar),
  ]);
  if (teams.error) throw teams.error;
  const sellers = snapshot.users;
  if (filters.user_id) {
    if (!sellers.some((u) => u.id === filters.user_id))
      throw new CrmHttpError(
        404,
        "vendedor_no_disponible",
        "Vendedor no disponible",
      );
    snapshot.opportunities = snapshot.opportunities.filter(
      (o) => o.salesperson_id === filters.user_id,
    );
    snapshot.targets = snapshot.targets.filter(
      (t) => t.user_id === filters.user_id,
    );
    snapshot.teamQuotas = snapshot.teamQuotas.filter(
      (t) => t.user_id === filters.user_id,
    );
    snapshot.adjustments = snapshot.adjustments.filter(
      (a) => a.user_id === filters.user_id,
    );
    snapshot.currentUser = filters.user_id;
  }
  const result = calcularPronostico(snapshot);
  const opportunities = snapshot.opportunities
    .filter((o) => o.status === "open")
    .map((o) => ({
      ...o,
      category: categoriaPronostico(o),
      canEdit:
        snapshot.canEditAny || (canEdit && o.salesperson_id === ctx.userId),
    }))
    .sort(
      (a, b) =>
        (a.expected_close_date ?? "").localeCompare(
          b.expected_close_date ?? "",
        ) || a.id.localeCompare(b.id),
    );
  // El navegador recibe solo la página visible; los totales incluyen todas las filas.
  return {
    ...result,
    monthly: calcularPronosticoMensual(snapshot),
    currentUserId: ctx.userId,
    sellers,
    moneda,
    teams: teams.data,
    period: snapshot.period,
    date: snapshot.date,
    canViewAll: snapshot.canViewAll,
    canAdjust: snapshot.canAdjust && snapshot.canViewAll,
    opportunities: opportunities.slice(
      (filters.page - 1) * 25,
      filters.page * 25,
    ),
    opportunityCount: opportunities.length,
    adjustments: snapshot.adjustments,
  };
}
export async function ajustarPronostico(ctx: CrmSesion, body: unknown) {
  await exigirPermisoCrm(
    ctx,
    [CRM_PERMISOS.pronosticoAjustar],
    "ajustar pronóstico",
  );
  if (!(await tienePermisoCrm(ctx, CRM_PERMISOS.pronosticoVerTodas)))
    throw new CrmHttpError(
      403,
      "sin_permiso",
      "No puedes ajustar otro vendedor",
    );
  const parsed = adjustmentSchema.safeParse(body);
  if (!parsed.success)
    throw new CrmHttpError(400, "datos_invalidos", "Datos de ajuste inválidos");
  const v = parsed.data;
  const snapshot = await leerSnapshotPronostico(ctx, v.period, v.user_id);
  const row = calcularFilaPronostico(snapshot, v.user_id);
  if (row.commit.sinTasa.length)
    throw new CrmHttpError(
      409,
      "sin_tasa",
      "Registra las tasas antes de ajustar",
    );
  const moneda = await resolverContextoMoneda(
    ctx.supabase,
    ctx.organizationId,
    snapshot.base,
  );
  const round = (amount: number) =>
    Math.round(amount * 10 ** moneda.decimals) / 10 ** moneda.decimals;
  if (
    round(row.commit.total) !== round(v.expected_before) ||
    (row.latestAdjustment?.id ?? null) !== v.expected_adjustment_id
  )
    throw new CrmHttpError(
      409,
      "registro_modificado",
      "El pronóstico cambió; actualiza antes de guardar",
    );
  let after = v.amount_after;
  if (v.reverses_id) {
    const latest = row.latestAdjustment;
    if (!latest || latest.id !== v.reverses_id)
      throw new CrmHttpError(
        409,
        "ajuste_no_vigente",
        "Solo puedes revertir el último ajuste",
      );
    const delta = sumarEnMonedaBase(
      [
        {
          monto: Number(latest.amount_after) - Number(latest.amount_before),
          moneda: latest.currency,
        },
      ],
      snapshot.base,
      snapshot.rates,
      snapshot.date,
    );
    if (delta.sinTasa.length)
      throw new CrmHttpError(
        409,
        "sin_tasa",
        "Registra las tasas antes de revertir",
      );
    after = round(row.commit.total - delta.total);
  }
  if (after === undefined || after < 0)
    throw new CrmHttpError(
      400,
      "monto_invalido",
      "El compromiso debe ser positivo",
    );
  // Necesario: el usuario no puede enviar amount_before ni adjusted_by a la tabla/RPC.
  // La RPC de servicio valida actor, organización, vendedor y token de concurrencia.
  const { data, error } = await getServiceClient().rpc(
    "crm_record_forecast_adjustment",
    {
      p_org: ctx.organizationId,
      p_user: v.user_id,
      p_period: v.period,
      p_actor: ctx.userId,
      p_before: round(row.commit.total),
      p_after: round(after),
      p_currency: snapshot.base,
      p_reason: v.reason_code,
      p_detail: v.reason_text,
      p_snapshot: snapshot.snapshotToken,
      p_reverses: v.reverses_id ?? null,
    },
  );
  if (error) throw error;
  const { snapshot_token: _token, ...audit } = data as Record<string, unknown>;
  void _token;
  return audit;
}
