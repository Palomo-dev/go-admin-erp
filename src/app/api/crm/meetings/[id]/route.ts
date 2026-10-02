import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { meetingPatchSchema, updateMeeting } from '@/lib/services/crm/meetingsService';

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
    const event = await updateMeeting(ctx.organizationId, id, parsed.data, ctx.supabase);
    return NextResponse.json({ success: true, data: event }, { status: 200 });
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'PATCH meetings');
  }
}
