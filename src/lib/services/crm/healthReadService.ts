import { composeHealthResult, getOrgHealthConfig, toHealthRpcRow, type HealthScoreResult, type HealthSnapshot } from './healthScoreServer';
import { bandForScore, normalizeBand, type HealthConfigJson, type HealthRpcRow } from './healthBands';
import { CRM_PERMISOS, CrmHttpError, exigirUuid, type CrmSesion } from './crmRouteSupport';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';

export interface HealthListRow extends HealthScoreResult {
  phone: string | null;
  email: string | null;
  do_not_call: boolean | null;
  owner_id: string | null;
  previous_score: number | null;
  measured_at: string | null;
  snapshot_raw: HealthRpcRow | null;
}
export interface HealthDashboard {
  scores: HealthListRow[];
  config: HealthConfigJson | null;
  can_manage: boolean;
  user_id: string;
  trend_error: boolean;
  trend: { score: number; band: 'green' | 'yellow' | 'red'; created_at: string }[];
}
export interface HealthCustomerDetail { health: HealthListRow | null; history: HealthSnapshot[]; invoice_count: number; history_error: boolean; can_measure: boolean }

/** Lecturas con la sesión: un fallo nunca se presenta como cero clientes. */
async function rpcRows(ctx: CrmSesion, customerId: string | null): Promise<HealthRpcRow[]> {
  const rows: HealthRpcRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await ctx.supabase.rpc('fn_customer_health', { p_org_id: ctx.organizationId, p_customer_id: customerId }).order('customer_id').range(from, from + 999);
    if (error) throw error;
    if (!Array.isArray(data)) throw new CrmHttpError(502, 'datos_invalidos', 'Respuesta de salud inválida');
    for (const row of data) {
      if (!row || typeof row.customer_id !== 'string' || ['invoices_12m', 'revenue_12m', 'overdue_balance', 'score'].some(key => row[key] == null || !Number.isFinite(Number(row[key])))) throw new CrmHttpError(502, 'datos_invalidos', 'Indicadores de salud inválidos');
      rows.push(toHealthRpcRow(row as Record<string, unknown>));
    }
    if (data.length < 1000) return rows;
  }
}
async function snapshots(ctx: CrmSesion, customerId?: string, limit?: number): Promise<HealthSnapshot[]> {
  const rows: HealthSnapshot[] = [];
  for (let from = 0; ; from += 1000) {
    let q = ctx.supabase.from('health_score_snapshots').select('id, customer_id, score, band, indicators, created_at').eq('organization_id', ctx.organizationId).order('created_at', { ascending: false }).order('id');
    if (customerId) q = q.eq('customer_id', customerId);
    const end = limit ? Math.min(from + 999, limit - 1) : from + 999;
    const { data, error } = await q.range(from, end);
    if (error) throw error;
    if (!Array.isArray(data)) throw new CrmHttpError(502, 'datos_invalidos', 'Respuesta de historial inválida');
    for (const row of data) {
      if (!row.created_at || !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(row.score)) throw new CrmHttpError(502, 'datos_invalidos', 'Medición de historial inválida');
      rows.push({ ...row, band: normalizeBand(row.band) } as HealthSnapshot);
    }
    if (data.length < end - from + 1 || (limit && rows.length >= limit)) return rows;
  }
}
function snapshotRaw(snap: HealthSnapshot | undefined): HealthRpcRow | null {
  if (!snap?.indicators || typeof snap.indicators !== 'object') return null;
  return toHealthRpcRow({ ...snap.indicators, customer_id: snap.customer_id, score: snap.score, band: snap.band });
}
export async function readHealthDashboard(ctx: CrmSesion): Promise<HealthDashboard> {
  const [config, rows, historyResult] = await Promise.all([getOrgHealthConfig(ctx.organizationId, ctx.supabase), rpcRows(ctx, null), snapshots(ctx).then(rows => ({ rows, failed: false })).catch(() => ({ rows: [] as HealthSnapshot[], failed: true }))]);
  const history = historyResult.rows;
  const customers = new Map<string, { full_name: string | null; phone: string | null; email: string | null; do_not_call: boolean | null; owner_id: string | null; branch_id: number | null }>();
  for (let from = 0; from < rows.length; from += 200) {
    const { data, error } = await ctx.supabase.from('customers').select('id, full_name, phone, email, do_not_call, owner_id, branch_id').eq('organization_id', ctx.organizationId).in('id', rows.slice(from, from + 200).map(row => row.customer_id));
    if (error) throw error;
    if (!Array.isArray(data)) throw new CrmHttpError(502, 'datos_invalidos', 'Respuesta de clientes inválida');
    for (const c of data) customers.set(c.id, c);
  }
  const branchAccess = new Map<number | null, boolean>();
  for (const branchId of new Set([...customers.values()].map(c => c.branch_id))) {
    const access = await ctx.supabase.rpc('app_branch_access', { p_branch_id: branchId });
    if (access.error) throw access.error;
    branchAccess.set(branchId, access.data === true);
  }
  if (rows.some(row => !customers.has(row.customer_id))) throw new CrmHttpError(409, 'cliente_no_encontrado', 'Un cliente de salud no está disponible');
  const visibleRows = rows.filter(row => branchAccess.get(customers.get(row.customer_id)?.branch_id ?? null));
  const visibleIds = new Set(visibleRows.map(row => row.customer_id));
  const histories = new Map<string, HealthSnapshot[]>();
  for (const snap of history) { const own = histories.get(snap.customer_id) ?? []; own.push(snap); histories.set(snap.customer_id, own); }
  const scores = visibleRows.map(row => {
    const c = customers.get(row.customer_id);
    if (!c) throw new CrmHttpError(409, 'cliente_no_encontrado', 'Un cliente de salud no está disponible');
    const ownHistory = histories.get(row.customer_id) ?? [];
    const previous = ownHistory.find(snap => Date.parse(snap.created_at) <= Date.now() - 30 * 86400000);
    return { ...composeHealthResult(row, config, c.full_name ?? ''), phone: c.phone, email: c.email, do_not_call: c.do_not_call, owner_id: c.owner_id, previous_score: previous?.score ?? null, measured_at: ownHistory[0]?.created_at ?? null, snapshot_raw: snapshotRaw(ownHistory[0]) };
  });
  const weeks = new Map<string, { scores: Map<string, number>; at: string }>();
  for (const snap of history.filter(snap => visibleIds.has(snap.customer_id) && Date.parse(snap.created_at) >= Date.now() - 84 * 86400000)) {
    const week = String(Math.floor(Date.parse(snap.created_at) / (7 * 86400000)));
    const value = weeks.get(week) ?? { scores: new Map<string, number>(), at: snap.created_at };
    if (!value.scores.has(snap.customer_id)) value.scores.set(snap.customer_id, snap.score);
    weeks.set(week, value);
  }
  return { scores, config, can_manage: await hasOrgAdminOrPermission(ctx), user_id: ctx.userId, trend_error: historyResult.failed, trend: [...weeks.values()].map(value => { const score = Math.round([...value.scores.values()].reduce((sum, n) => sum + n, 0) / value.scores.size); return { score, band: bandForScore(score, config?.bands), created_at: value.at }; }).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) };
}
export async function readHealthCustomer(ctx: CrmSesion, id: string, limit = 30): Promise<HealthCustomerDetail> {
  exigirUuid(id, 'cliente');
  const customer = await ctx.supabase.from('customers').select('id, full_name, phone, email, do_not_call, owner_id, branch_id').eq('organization_id', ctx.organizationId).eq('id', id).maybeSingle();
  if (customer.error) throw customer.error;
  if (!customer.data) throw new CrmHttpError(404, 'cliente_no_encontrado', 'Cliente no encontrado');
  const access = await ctx.supabase.rpc('app_branch_access', { p_branch_id: customer.data.branch_id });
  if (access.error) throw access.error;
  if (access.data !== true) throw new CrmHttpError(403, 'sin_permiso', 'No tienes acceso a la sucursal del cliente');
  const [config, rows, historyResult, invoices, canMeasure] = await Promise.all([
    getOrgHealthConfig(ctx.organizationId, ctx.supabase), rpcRows(ctx, id), snapshots(ctx, id, limit).then(rows => ({ rows, failed: false })).catch(() => ({ rows: [] as HealthSnapshot[], failed: true })),
    ctx.supabase.from('invoice_sales').select('id', { head: true, count: 'exact' }).eq('organization_id', ctx.organizationId).eq('customer_id', id).neq('status', 'void'),
    hasOrgAdminOrPermission(ctx, CRM_PERMISOS.clientesEditar),
  ]);
  if (invoices.error) throw invoices.error;
  if (invoices.count === null) throw new CrmHttpError(502, 'datos_invalidos', 'Recuento de facturas inválido');
  const history = historyResult.rows;
  const c = customer.data;
  return { health: rows[0] ? { ...composeHealthResult(rows[0], config, c.full_name ?? ''), phone: c.phone, email: c.email, do_not_call: c.do_not_call, owner_id: c.owner_id, previous_score: history.find(snap => Date.parse(snap.created_at) <= Date.now() - 30 * 86400000)?.score ?? null, measured_at: history[0]?.created_at ?? null, snapshot_raw: snapshotRaw(history[0]) } : null, history: history.reverse(), invoice_count: invoices.count, history_error: historyResult.failed, can_measure: canMeasure };
}
