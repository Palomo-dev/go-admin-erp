import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { bulkPayCommissions } from '@/lib/services/crm/commissionAdminService';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requireTeamManager, routeError } from '@/lib/services/crm/f13RouteSupport';

const MAX_BULK = 200;

/**
 * POST /api/crm/commissions/bulk-pay — pago masivo (accrued → paid, una a una).
 * Body: { commission_ids: string[] }. Solo admin/manager. Responde
 * { paid: string[], failed: [{ id, reason }] }: lo que no esté en `accrued`
 * o no sea de la organización queda en `failed` sin abortar el resto.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    const body = await readJson(request);
    rejectForeignOrganization('CRM Commissions Bulk Pay', body, ctx, request);
    const ids = Array.isArray(body.commission_ids) ? body.commission_ids.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
    if (ids.length === 0) return jsonFail(400, 'Falta commission_ids (array no vacío de ids)', { field: 'commission_ids' });
    if (ids.length > MAX_BULK) return jsonFail(400, `Máximo ${MAX_BULK} comisiones por lote`, { field: 'commission_ids' });
    const result = await bulkPayCommissions(ids, ctx.organizationId, ctx.supabase, ctx.userId);
    return jsonOk(result);
  } catch (error) {
    return routeError(error, 'CRM Commissions Bulk Pay');
  }
}
