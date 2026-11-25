import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getOrgPartnerDeals } from '@/lib/services/crm/partnerService';
import { canManagePartners, jsonOk, rejectForeignOrganization, routeError } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Partner Deals (organización)';

/**
 * GET /api/crm/partners/deals — deals de partner de toda la organización de la
 * sesión, con partner y oportunidad (pestañas «Deals» y «Comisiones» de
 * Partners, Figma 1316:773848 y 1319:94585). Solo lectura; la organización sale
 * de la sesión (403 si la query trae otra). `can_manage` lo decide el servidor;
 * sin él, los montos de comisión salen en `null` (solo admin/manager los ve).
 * Query: ?limit= (1..2000, por defecto 1000).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    rejectForeignOrganization(TAG, null, ctx, request);
    const limitRaw = Number.parseInt(new URL(request.url).searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 1000;
    const deals = await getOrgPartnerDeals(ctx.organizationId, ctx.supabase, limit);
    const canManage = canManagePartners(ctx);
    // Anotación Figma 1411:43453: los montos de comisión solo los ve admin/manager.
    const data = canManage
      ? deals
      : deals.map((d) => ({ ...d, commission_amount: null, commission_suggested: null, commission_adjusted_by: null, commission_adjusted_at: null }));
    return jsonOk(data, { count: data.length, can_manage: canManage });
  } catch (error) {
    return routeError(error, TAG);
  }
}
