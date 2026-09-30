import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { actualizarConAutoria, borrarConAutoria, actividadEdicionSchema } from '@/lib/services/crm/activityEditService';

/**
 * /api/crm/activities/[id] — editar o borrar una actividad (CRM ola 1, paso 1.7).
 *
 * Solo lo propio (`user_id` = sesión) salvo `crm.activities.edit_any`
 * (Admin y Manager, D5). 400 cuerpo · 403 ajena · 404 no es de la organización
 * · 409 actividad de sistema. Ver `activityEditService`.
 */
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    const parsed = actividadEdicionSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await actualizarConAutoria(ctx, 'activities', id, parsed.data, 'PATCH /api/crm/activities/[id]');
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'PATCH /api/crm/activities/[id]');
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    const data = await borrarConAutoria(ctx, 'activities', id, 'DELETE /api/crm/activities/[id]');
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'DELETE /api/crm/activities/[id]');
  }
}
