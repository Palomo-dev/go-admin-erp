import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { transitionReferral } from '@/lib/services/crm/referralsService';
import { jsonOk, readJson, rejectForeignOrganization, routeError } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Referrals Status';

/**
 * POST /api/crm/referrals/[id]/status — cambia el estado por la máquina pura
 * (`pending → contacted → qualified → converted | rejected`). `converted`
 * exige enlace (oportunidad o cliente): para crearlo está `/convert`.
 * Body: { status }
 * 400 estado desconocido · 404 ajeno · 409 transición no permitida o carrera perdida.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    const referral = await transitionReferral(id, ctx.organizationId, body.status, ctx.supabase);
    return jsonOk(referral);
  } catch (error) {
    return routeError(error, TAG);
  }
}
