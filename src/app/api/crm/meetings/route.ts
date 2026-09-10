import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { createMeeting, meetingInputSchema } from '@/lib/services/crm/meetingsService';
import { RelatedNotFoundError } from '@/lib/services/crm/activityService';

/**
 * POST /api/crm/meetings — crea calendar_events + activity 'meeting' (FASE-09 §4.1).
 * Body: { title, start_at, end_at, timezone?, location?, description?, customer_id?, opportunity_id?,
 *         assigned_to?, attendees?: string[], send_invite?: boolean, client_key? }
 * 201 { success, data: { event, activity_id } }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const parsed = meetingInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await createMeeting(ctx.organizationId, ctx.userId, parsed.data, ctx.supabase);
    return NextResponse.json(
      { success: true, data: { event: result.event, activity_id: result.activityId, invite_sent: false } },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (error instanceof RelatedNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Meetings] POST error:', message);
    const status = /debe ser posterior|Se requiere/.test(message) ? 400 : 500;
    return NextResponse.json({ success: false, error: status === 400 ? message : 'Error interno' }, { status });
  }
}
