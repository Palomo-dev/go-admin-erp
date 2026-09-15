import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { rejectCommission } from '@/lib/services/crm/commissionAdminService';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requireTeamManager, routeError } from '@/lib/services/crm/f13RouteSupport';

/**
 * POST /api/crm/commissions/[id]/reject — accrued → cancelled (metadata.reason = 'rejected').
 * Body: { reason: string } (obligatorio). Solo admin/manager. 409 si no está en `accrued`.
 * Una pagada no se rechaza: para eso está el clawback.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization('CRM Commissions Reject', body.organization_id, ctx);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return jsonFail(400, 'Falta el motivo del rechazo (reason)', { field: 'reason' });
    const commission = await rejectCommission(id, ctx.organizationId, reason, ctx.supabase, ctx.userId);
    if (!commission) return jsonFail(404, 'Comisión no encontrada en esta organización');
    return jsonOk(commission);
  } catch (error) {
    return routeError(error, 'CRM Commissions Reject');
  }
}
