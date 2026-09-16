import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { clawbackCommission } from '@/lib/services/crm/commissionAdminService';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requireTeamManager, routeError } from '@/lib/services/crm/f13RouteSupport';

/**
 * POST /api/crm/commissions/[id]/clawback — paid → cancelled con
 * metadata { reason: 'clawback', clawback_of_paid: true, paid_at_before_clawback }.
 * `paid_at` se conserva (el pago ocurrió). Body: { reason } obligatorio.
 * Solo admin/manager. 409 si no está en `paid`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization('CRM Commissions Clawback', body, ctx, request);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return jsonFail(400, 'Falta el motivo del clawback (reason)', { field: 'reason' });
    const commission = await clawbackCommission(id, ctx.organizationId, reason, ctx.supabase, ctx.userId);
    if (!commission) return jsonFail(404, 'Comisión no encontrada en esta organización');
    return jsonOk(commission);
  } catch (error) {
    return routeError(error, 'CRM Commissions Clawback');
  }
}
