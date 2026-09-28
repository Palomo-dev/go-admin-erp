import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { payCommission } from '@/lib/services/crm/commissionAdminService';
import { normalizeCommissionPayment } from '@/lib/services/crm/commissionTransitions';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requireTeamManager, routeError } from '@/lib/services/crm/f13RouteSupport';

/**
 * POST /api/crm/commissions/[id]/pay — accrued → paid.
 * Solo admin/manager (rol de sesión). 404 si no es de la organización; 409 si el
 * estado de partida no es `accrued` (validado en el servidor y en el UPDATE).
 * Body opcional: { payment_method?, bank_account_id?, reference? } — de dónde
 * sale el dinero (el asiento del pago acredita esa cuenta); la cuenta bancaria
 * debe ser de la organización (400 si no). Quién pagó sale de la sesión.
 * Si trae `organization_id` de otra organización → 403 y registro.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    const body = await readJson(request);
    rejectForeignOrganization('CRM Commissions Pay', body, ctx, request);
    const { id } = await params;
    const commission = await payCommission(id, ctx.organizationId, ctx.supabase, ctx.userId, normalizeCommissionPayment(body));
    if (!commission) return jsonFail(404, 'Comisión no encontrada en esta organización');
    return jsonOk(commission);
  } catch (error) {
    return routeError(error, 'CRM Commissions Pay');
  }
}
