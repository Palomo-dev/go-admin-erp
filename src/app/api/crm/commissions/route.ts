import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { plainDateToInstant } from '@/lib/utils/dateDisplay';
import { listCommissions, listCommissionSummaryRows } from '@/lib/services/crm/commissionAdminService';
import { COMMISSION_STATUSES, canManageCommissions, summarizeCommissionsByCurrency } from '@/lib/services/crm/commissionTransitions';
import { addDaysPlain } from '@/lib/services/crm/quotaProgress';
import { getOrgBaseCurrency } from '@/lib/services/crm/salesTargetService';
import { getOrgTimezone } from '@/lib/services/crm/sellerDashboardService';
import { jsonFail, jsonOk, routeError } from '@/lib/services/crm/f13RouteSupport';

const SOURCE_TYPES = ['sale', 'invoice_sale', 'invoice_purchase', 'opportunity'];
const COMMISSION_TYPES = ['salesperson', 'intermediation_sale', 'intermediation_purchase'];
const PLAIN_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/crm/commissions — lista + resumen (devengado / pagado / pendiente) del filtro.
 * Query: ?status=&payee_id=&source_type=&commission_type=&from=YYYY-MM-DD&to=YYYY-MM-DD&search=&limit=&offset=
 * `from`/`to` son días calendario en la zona horaria de la organización (`to` inclusivo).
 * Un empleado solo ve sus propias comisiones (`payee_id` forzado al usuario de la sesión).
 * `summary` es SOLO de la moneda base (`currency`); `summary_others` trae las demás
 * monedas cada una aparte: nunca se suman importes de monedas distintas.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const sp = new URL(request.url).searchParams;
    const status = sp.get('status') || undefined;
    const sourceType = sp.get('source_type') || undefined;
    const commissionType = sp.get('commission_type') || undefined;
    const from = sp.get('from') || undefined;
    const to = sp.get('to') || undefined;

    if (status && !(COMMISSION_STATUSES as readonly string[]).includes(status)) return jsonFail(400, 'status inválido: accrued, paid o cancelled');
    if (sourceType && !SOURCE_TYPES.includes(sourceType)) return jsonFail(400, 'source_type inválido');
    if (commissionType && !COMMISSION_TYPES.includes(commissionType)) return jsonFail(400, 'commission_type inválido');
    if ((from && !PLAIN_RE.test(from)) || (to && !PLAIN_RE.test(to))) return jsonFail(400, 'from/to deben ser YYYY-MM-DD');

    const canManage = canManageCommissions(ctx);
    const [tz, baseCurrency] = await Promise.all([getOrgTimezone(ctx.organizationId, ctx.supabase), getOrgBaseCurrency(ctx.organizationId, ctx.supabase)]);
    const filters = {
      status,
      source_type: sourceType,
      commission_type: commissionType,
      payee_id: canManage ? sp.get('payee_id') || undefined : ctx.userId,
      from: from ? plainDateToInstant(from, tz, '00:00') : undefined,
      to: to ? plainDateToInstant(addDaysPlain(to, 1), tz, '00:00') : undefined,
      search: sp.get('search')?.slice(0, 80) || undefined,
      limit: sp.get('limit') ? Number.parseInt(sp.get('limit')!, 10) || undefined : undefined,
      offset: sp.get('offset') ? Number.parseInt(sp.get('offset')!, 10) || undefined : undefined,
    };

    const [list, summaryRows] = await Promise.all([
      listCommissions(ctx.organizationId, ctx.supabase, filters),
      listCommissionSummaryRows(ctx.organizationId, ctx.supabase, filters),
    ]);

    const summary = summarizeCommissionsByCurrency(summaryRows, baseCurrency);
    return jsonOk(list.data, {
      count: list.count,
      summary: summary.primary,
      summary_others: summary.others,
      currency: summary.primary.currency || null,
      can_manage: canManage,
      timezone: tz,
    });
  } catch (error) {
    return routeError(error, 'CRM Commissions GET');
  }
}
