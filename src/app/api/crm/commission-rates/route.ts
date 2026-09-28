import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import {
  UUID_RE,
  deleteCommissionRate,
  listCommissionRates,
  parseSaveCommissionRate,
  saveCommissionRate,
} from '@/lib/services/crm/commissionRatesServer';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requireTeamManager, routeError } from '@/lib/services/crm/f13RouteSupport';

/** GET /api/crm/commission-rates — tasa general y por vendedor (con nombre) de la organización de la sesión. */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    return jsonOk(await listCommissionRates(ctx.organizationId, ctx.supabase));
  } catch (error) {
    return routeError(error, 'CRM Commission Rates GET');
  }
}

/**
 * POST /api/crm/commission-rates — guarda la tasa general (`salesperson_id`
 * nulo) o la de un vendedor. Body: { id?, salesperson_id?, rate, valid_from?, valid_to? }.
 * Solo admin/manager; la RPC lo vuelve a exigir en la base.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    const body = await readJson(request);
    rejectForeignOrganization('CRM Commission Rates POST', body, ctx, request);
    return jsonOk(await saveCommissionRate(ctx.organizationId, ctx.supabase, parseSaveCommissionRate(body)));
  } catch (error) {
    return routeError(error, 'CRM Commission Rates POST');
  }
}

/** DELETE /api/crm/commission-rates?id=<uuid> — solo admin/manager. */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireTeamManager(ctx);
    rejectForeignOrganization('CRM Commission Rates DELETE', {}, ctx, request);
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!UUID_RE.test(id)) return jsonFail(400, 'Falta el id de la tasa', { field: 'id' });
    const deleted = await deleteCommissionRate(ctx.organizationId, ctx.supabase, id);
    if (!deleted) return jsonFail(404, 'La tasa no existe en esta organización');
    return jsonOk({ id });
  } catch (error) {
    return routeError(error, 'CRM Commission Rates DELETE');
  }
}
