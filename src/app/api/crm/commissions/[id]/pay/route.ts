import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { payCommission } from '@/lib/services/crm/commissionAdminService';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requireTeamManager, routeError } from '@/lib/services/crm/f13RouteSupport';

/**
 * POST /api/crm/commissions/[id]/pay — accrued → paid.
 * Solo admin/manager (rol de sesión). 404 si no es de la organización; 409 si el
 * estado de partida no es `accrued` (validado en el servidor y en el UPDATE).
 * Body opcional; si trae `organization_id` de otra organización → 403 y registro.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    rejectForeignOrganization('CRM Commissions Pay', await readJson(request), ctx, request);
    const { id } = await params;
    const commission = await payCommission(id, ctx.organizationId, ctx.supabase, ctx.userId);
    if (!commission) return jsonFail(404, 'Comisión no encontrada en esta organización');
    return jsonOk(commission);
  } catch (error) {
    return routeError(error, 'CRM Commissions Pay');
  }
}
