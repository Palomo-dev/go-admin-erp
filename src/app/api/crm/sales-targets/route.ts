import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { createSalesTarget, getOrgBaseCurrency, getSalesTargets, isActiveMember, listTargetsWithProgress } from '@/lib/services/crm/salesTargetService';
import { QUOTA_PERIODS, QUOTA_TYPES, computeQuotaProgress, validateQuotaInput } from '@/lib/services/crm/quotaProgress';
import { canManageCommissions } from '@/lib/services/crm/commissionTransitions';
import { getOrgTimezone } from '@/lib/services/crm/sellerDashboardService';
import { todayInTz } from '@/lib/utils/dateDisplay';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requireTeamManager, routeError } from '@/lib/services/crm/f13RouteSupport';

/**
 * GET /api/crm/sales-targets — cuotas de la organización.
 * Query: ?user_id=&period=&target_type=&period_start=&period_end=&limit=&offset=&with_progress=1
 * Admin/manager ven las de cualquier miembro; un empleado solo las suyas.
 * Con `with_progress=1` se calcula el cumplimiento en vivo (sin escribir en BD)
 * y se añade `progress` (contrato de `TargetProgress`) y `progress_detail`
 * (porcentaje acotado, días restantes, ritmo necesario, estado).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const sp = new URL(request.url).searchParams;
    const canManage = canManageCommissions(ctx);
    const requestedUser = sp.get('user_id') || undefined;
    const userId = canManage ? requestedUser : ctx.userId;
    const period = sp.get('period') || undefined;
    const targetType = sp.get('target_type') || undefined;
    if (period && !(QUOTA_PERIODS as readonly string[]).includes(period)) return jsonFail(400, 'period inválido', { field: 'period' });
    if (targetType && !(QUOTA_TYPES as readonly string[]).includes(targetType)) return jsonFail(400, 'target_type inválido', { field: 'target_type' });

    if (sp.get('with_progress') === '1' && userId) {
      const tz = await getOrgTimezone(ctx.organizationId, ctx.supabase);
      const today = todayInTz(tz);
      const rows = await listTargetsWithProgress(ctx.organizationId, userId, ctx.supabase, tz);
      const data = rows
        .filter((r) => (!period || r.period === period) && (!targetType || r.target_type === targetType))
        .map((r) => ({
          ...r,
          progress_detail: computeQuotaProgress({
            target_amount: Number(r.target_amount),
            achieved_amount: r.achieved_amount,
            period_start: r.period_start,
            period_end: r.period_end,
            today,
          }),
        }));
      return jsonOk(data, { count: data.length, today, timezone: tz, can_manage: canManage });
    }

    const result = await getSalesTargets(ctx.organizationId, ctx.supabase, {
      user_id: userId,
      period,
      target_type: targetType,
      period_start: sp.get('period_start') || undefined,
      period_end: sp.get('period_end') || undefined,
      limit: sp.get('limit') ? Number.parseInt(sp.get('limit')!, 10) || undefined : undefined,
      offset: sp.get('offset') ? Number.parseInt(sp.get('offset')!, 10) || undefined : undefined,
    });
    return jsonOk(result.data, { count: result.count, can_manage: canManage });
  } catch (error) {
    return routeError(error, 'CRM Sales Targets GET');
  }
}

/**
 * POST /api/crm/sales-targets — crea una cuota (solo admin/manager).
 * Body: { user_id, period, period_start, period_end, target_amount, target_type?, target_currency? }
 * `organization_id` ajeno en el body → 403 y registro (regla dura 5); `user_id`
 * debe ser miembro activo de la organización de la sesión. Los límites deben
 * ser el periodo natural completo. Sin `target_currency` se usa la moneda base
 * de la organización (400 si no está configurada). Duplicado (UNIQUE) → 409.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    const body = await readJson(request);
    rejectForeignOrganization('CRM Sales Targets POST', body.organization_id, ctx);
    const userId = typeof body.user_id === 'string' ? body.user_id : '';
    if (!userId) return jsonFail(400, 'Falta user_id', { field: 'user_id' });
    const v = validateQuotaInput(body);
    if (!v.ok) return jsonFail(400, v.message, { field: v.field });
    const currency = v.value.target_currency ?? (await getOrgBaseCurrency(ctx.organizationId, ctx.supabase));
    if (!currency) {
      return jsonFail(400, 'La organización no tiene moneda base configurada: indica target_currency', { field: 'target_currency' });
    }
    if (!(await isActiveMember(ctx.organizationId, userId, ctx.supabase))) {
      return jsonFail(400, 'El usuario no es miembro activo de esta organización', { field: 'user_id' });
    }
    const target = await createSalesTarget(ctx.organizationId, { user_id: userId, ...v.value, target_currency: currency }, ctx.supabase);
    return jsonOk(target, {}, 201);
  } catch (error) {
    return routeError(error, 'CRM Sales Targets POST');
  }
}
