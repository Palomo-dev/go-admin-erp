import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { deletePartner, getPartnerById, updatePartner } from '@/lib/services/crm/partnerService';
import { validatePartnerInput } from '@/lib/services/crm/f12Validation';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, requirePartnerManager, routeError, validationFail } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Partners';
type Params = { params: Promise<{ id: string }> };

/** GET /api/crm/partners/[id] — un partner de la organización (404 si es ajeno). */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const partner = await getPartnerById(id, ctx.organizationId, ctx.supabase);
    if (!partner) return jsonFail(404, 'Partner no encontrado en esta organización', { code: 'NOT_FOUND' });
    return jsonOk(partner);
  } catch (error) {
    return routeError(error, TAG);
  }
}

/** PATCH /api/crm/partners/[id] — edición parcial (409 correo de otro partner; 404 tier o partner ajeno). */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body.organization_id, ctx);
    const parsed = validatePartnerInput(body, { partial: true });
    if (!parsed.ok) return validationFail(parsed.errors);
    const partner = await updatePartner(id, ctx.organizationId, parsed.value, ctx.supabase);
    if (!partner) return jsonFail(404, 'Partner no encontrado en esta organización', { code: 'NOT_FOUND' });
    return jsonOk(partner);
  } catch (error) {
    return routeError(error, TAG);
  }
}

/** DELETE /api/crm/partners/[id] — solo admin/manager (por id de rol). Sus deals se borran en cascada (FK). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext();
    requirePartnerManager(ctx);
    const { id } = await params;
    const deleted = await deletePartner(id, ctx.organizationId, ctx.supabase);
    if (!deleted) return jsonFail(404, 'Partner no encontrado en esta organización', { code: 'NOT_FOUND' });
    return jsonOk({ id });
  } catch (error) {
    return routeError(error, TAG);
  }
}
