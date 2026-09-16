import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { transitionPartnerDeal } from '@/lib/services/crm/partnerService';
import { jsonOk, readJson, rejectForeignOrganization, requirePartnerManager, routeError } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Partner Deal Status';

/**
 * PATCH /api/crm/partners/[id]/deals/[dealId] — transición de la comisión
 * (`pending → approved → paid | rejected`). Solo admin/manager por id de rol
 * (nunca por el body). `paid` fija `commission_paid_at`. Es un REGISTRO: nada
 * de dinero real se mueve.
 * Body: { commission_status }
 * 400 estado desconocido · 403 rol · 404 deal ajeno o de otro partner · 409 transición o carrera.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; dealId: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id, dealId } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    requirePartnerManager(ctx);
    const deal = await transitionPartnerDeal(dealId, id, ctx.organizationId, body.commission_status, ctx.supabase);
    return jsonOk(deal);
  } catch (error) {
    return routeError(error, TAG);
  }
}
