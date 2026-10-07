/**
 * Pronóstico trimestral por categorías — servidor. Lee la foto con la sesión
 * del usuario (`crm_forecast_snapshot`: permiso `crm.opportunities.view`; sin
 * `crm.forecast.view_all` solo ve lo suyo) y calcula con `forecastLogica`.
 *
 * Escrituras:
 *  - categoría de una oportunidad → `crm_set_forecast_category` con la sesión
 *    (la RPC exige editar la oportunidad y bloquea por `updated_at`);
 *  - ajuste con motivo → `crm_record_forecast_adjustment`, que SOLO ejecuta
 *    `service_role`: el usuario no puede escribir `amount_before` ni
 *    `adjusted_by`. Antes de usar el cliente de servicio se validan aquí el
 *    permiso `crm.forecast.adjust` (+ `view_all`), el vendedor, el monto
 *    calculado y el token de la foto; la RPC vuelve a validar actor,
 *    organización y token bajo bloqueo. SOLO servidor.
 */
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server-service';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { sumarEnMonedaBase } from '@/lib/crm/monedaCrm';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, tienePermisoCrm, type CrmSesion } from './crmRouteSupport';
import {
  FORECAST_CATEGORIES,
  MOTIVOS_AJUSTE,
  TAMANO_PAGINA_PRONOSTICO,
  calcularFilaPronostico,
  calcularPronostico,
  categoriaPronostico,
  type ForecastSnapshot,
} from './forecastLogica';

const periodo = z.string().regex(/^[1-9]\d{3}-Q[1-4]$/);

export const forecastQuerySchema = z.object({
  period: periodo.optional(),
  user_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const categorySchema = z
  .object({
    category: z.enum(FORECAST_CATEGORIES),
    expected_updated_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export const adjustmentSchema = z
  .object({
    period: periodo,
    user_id: z.string().uuid(),
    amount_after: z.number().finite().min(0).max(1e15).optional(),
    expected_before: z.number().finite(),
    expected_adjustment_id: z.string().uuid().nullable(),
    reason_code: z.enum(MOTIVOS_AJUSTE),
    reason_text: z.string().trim().min(3).max(2000),
    reverses_id: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => (v.reason_code === 'reversal' ? Boolean(v.reverses_id) : v.amount_after !== undefined && !v.reverses_id));

export async function leerSnapshotPronostico(ctx: CrmSesion, period: string, user?: string, team?: string): Promise<ForecastSnapshot> {
  const { data, error } = await ctx.supabase.rpc('crm_forecast_snapshot', {
    p_org: ctx.organizationId,
    p_period: period,
    p_user: user ?? null,
    p_team: team ?? null,
  });
  if (error) throw error;
  const s = data as ForecastSnapshot;
  // Solo los campos que la pantalla usa (el token de cada ajuste no sale).
  s.adjustments = (s.adjustments ?? []).map(({ id, user_id, amount_before, amount_after, currency, reason_code, reason_text, adjusted_by, created_at, reverses_id, author }) => ({
    id, user_id, amount_before, amount_after, currency, reason_code, reason_text, adjusted_by, created_at, reverses_id, author,
  }));
  return s;
}

export async function listarPronostico(ctx: CrmSesion, f: z.infer<typeof forecastQuerySchema> & { period: string }) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'leer pronóstico');
  if (f.user_id && f.user_id !== ctx.userId && !(await tienePermisoCrm(ctx, CRM_PERMISOS.pronosticoVerTodo))) {
    throw new CrmHttpError(403, 'sin_permiso', 'No puedes ver otro vendedor');
  }
  const s = await leerSnapshotPronostico(ctx, f.period, undefined, f.team_id);
  const [moneda, equipos, puedeEditar] = await Promise.all([
    resolverContextoMoneda(ctx.supabase, ctx.organizationId, s.base),
    ctx.supabase.from('sales_teams').select('id,name').eq('organization_id', ctx.organizationId).eq('is_active', true).order('name'),
    tienePermisoCrm(ctx, CRM_PERMISOS.oportunidadesEditar),
  ]);
  if (equipos.error) throw equipos.error;
  const vendedores = s.users;
  if (f.user_id) {
    if (!vendedores.some((u) => u.id === f.user_id)) throw new CrmHttpError(404, 'vendedor_no_disponible', 'Vendedor no disponible');
    s.opportunities = s.opportunities.filter((o) => o.salesperson_id === f.user_id);
    s.targets = s.targets.filter((t) => t.user_id === f.user_id);
    s.teamQuotas = s.teamQuotas.filter((t) => t.user_id === f.user_id);
    s.adjustments = s.adjustments.filter((a) => a.user_id === f.user_id);
    s.currentUser = f.user_id;
  }
  const calculo = calcularPronostico(s);
  const abiertas = s.opportunities
    .filter((o) => o.status === 'open')
    .map((o) => ({ ...o, category: categoriaPronostico(o), canEdit: s.canEditAny || (puedeEditar && o.salesperson_id === ctx.userId) }))
    .sort((a, b) => (a.expected_close_date ?? '').localeCompare(b.expected_close_date ?? '') || a.id.localeCompare(b.id));
  // El navegador recibe solo la página visible; los totales cuentan todas.
  return {
    ...calculo,
    currentUserId: ctx.userId,
    sellers: vendedores,
    moneda,
    teams: equipos.data ?? [],
    period: s.period,
    date: s.date,
    canViewAll: s.canViewAll,
    canAdjust: s.canAdjust && s.canViewAll,
    opportunities: abiertas.slice((f.page - 1) * TAMANO_PAGINA_PRONOSTICO, f.page * TAMANO_PAGINA_PRONOSTICO),
    opportunityCount: abiertas.length,
    adjustments: s.adjustments,
  };
}

export type RespuestaPronostico = Awaited<ReturnType<typeof listarPronostico>>;

export async function cambiarCategoriaPronostico(ctx: CrmSesion, id: string, body: unknown) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesEditar, CRM_PERMISOS.oportunidadesEditarCualquiera], 'cambiar categoría del pronóstico');
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) throw new CrmHttpError(400, 'datos_invalidos', 'Categoría inválida');
  const { data, error } = await ctx.supabase.rpc('crm_set_forecast_category', {
    p_org: ctx.organizationId,
    p_id: id,
    p_category: parsed.data.category,
    p_expected_updated_at: parsed.data.expected_updated_at,
  });
  if (error) throw error;
  const fila = data as { id: string; forecast_category: string | null; updated_at: string };
  return { id: fila.id, forecast_category: fila.forecast_category, updated_at: fila.updated_at };
}

export async function ajustarPronostico(ctx: CrmSesion, body: unknown) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.pronosticoAjustar], 'ajustar pronóstico');
  if (!(await tienePermisoCrm(ctx, CRM_PERMISOS.pronosticoVerTodo))) throw new CrmHttpError(403, 'sin_permiso', 'No puedes ajustar otro vendedor');
  const parsed = adjustmentSchema.safeParse(body);
  if (!parsed.success) throw new CrmHttpError(400, 'datos_invalidos', 'Datos de ajuste inválidos');
  const v = parsed.data;
  const s = await leerSnapshotPronostico(ctx, v.period, v.user_id);
  const fila = calcularFilaPronostico(s, v.user_id);
  if (fila.commit.sinTasa.length) throw new CrmHttpError(409, 'sin_tasa', 'Registra las tasas antes de ajustar');
  const moneda = await resolverContextoMoneda(ctx.supabase, ctx.organizationId, s.base);
  const redondear = (n: number) => Math.round(n * 10 ** moneda.decimals) / 10 ** moneda.decimals;
  if (redondear(fila.commit.total) !== redondear(v.expected_before) || (fila.latestAdjustment?.id ?? null) !== v.expected_adjustment_id) {
    throw new CrmHttpError(409, 'registro_modificado', 'El pronóstico cambió; actualiza antes de guardar');
  }
  let despues = v.amount_after;
  if (v.reverses_id) {
    const ultimo = fila.latestAdjustment;
    if (!ultimo || ultimo.id !== v.reverses_id) throw new CrmHttpError(409, 'ajuste_no_vigente', 'Solo puedes revertir el último ajuste');
    const delta = sumarEnMonedaBase([{ monto: Number(ultimo.amount_after) - Number(ultimo.amount_before), moneda: ultimo.currency }], s.base, s.rates, s.date);
    if (delta.sinTasa.length) throw new CrmHttpError(409, 'sin_tasa', 'Registra las tasas antes de revertir');
    despues = redondear(fila.commit.total - delta.total);
  }
  if (despues === undefined || despues < 0) throw new CrmHttpError(400, 'monto_invalido', 'El compromiso no puede ser negativo');
  // Cliente de servicio JUSTIFICADO: la RPC solo acepta service_role (ver
  // cabecera). Organización, actor y permiso ya están validados arriba.
  const { data, error } = await getServiceClient().rpc('crm_record_forecast_adjustment', {
    p_org: ctx.organizationId,
    p_user: v.user_id,
    p_period: v.period,
    p_actor: ctx.userId,
    p_before: redondear(fila.commit.total),
    p_after: redondear(despues),
    p_currency: s.base,
    p_reason: v.reason_code,
    p_detail: v.reason_text,
    p_snapshot: s.snapshotToken,
    p_reverses: v.reverses_id ?? null,
  });
  if (error) throw error;
  const { snapshot_token: _token, ...auditoria } = data as Record<string, unknown>;
  void _token;
  return auditoria;
}
