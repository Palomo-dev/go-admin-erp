import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { getMeetingForCalendar, meetingPatchSchema, updateMeeting } from '@/lib/services/crm/meetingsService';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    exigirUuid(id);
    readOrgBody(ctx, {}, { request });
    const data = await getMeetingForCalendar(ctx, id);
    await exigirPermisoCrm(ctx, [data.event.opportunity_id ? CRM_PERMISOS.oportunidadesVer : CRM_PERMISOS.clientesVer], 'GET meetings');
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: unknown) {
    const response = respuestaErrorCrm(error, 'GET meetings');
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}

/**
 * PATCH /api/crm/meetings/[id] — actualiza título/fechas/lugar/estado de una reunión.
 * Body: subconjunto de { title, start_at, end_at, location, description, status: 'scheduled'|'done'|'canceled' }
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    exigirUuid(id);
    const parsed = meetingPatchSchema.safeParse(sinClavesDeOrganizacion(readOrgBody(ctx, await request.json().catch(() => null), { request })));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    // Rechazar referencias ambiguas antes de llegar al núcleo. La RPC sigue
    // siendo el único escritor y vuelve a comprobar permisos al bloquear filas.
    const current = await getMeetingForCalendar(ctx, id);
    if (!current.can_edit) return NextResponse.json({ success: false, error: 'No tienes permiso para esta acción', code: 'sin_permiso' }, { status: 403 });
    const event = await updateMeeting(ctx.organizationId, id, parsed.data, ctx.supabase);
    return NextResponse.json({ success: true, data: event }, { status: 200 });
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'PATCH meetings');
  }
}
