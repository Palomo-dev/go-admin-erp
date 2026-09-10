import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { meetingPatchSchema, MeetingNotFoundError, updateMeeting } from '@/lib/services/crm/meetingsService';

/**
 * PATCH /api/crm/meetings/[id] — actualiza título/fechas/lugar/estado de una reunión.
 * Body: subconjunto de { title, start_at, end_at, location, description, status: 'scheduled'|'done'|'canceled' }
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const parsed = meetingPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const event = await updateMeeting(ctx.organizationId, id, parsed.data, ctx.supabase);
    return NextResponse.json({ success: true, data: event }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (error instanceof MeetingNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Meetings] PATCH error:', message);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
