import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { createMeeting, meetingInputSchema } from '@/lib/services/crm/meetingsService';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';

/**
 * POST /api/crm/meetings — crea calendar_events + activity 'meeting' (FASE-09 §4.1).
 * Body: { title, start_at, end_at, timezone?, location?, description?, customer_id?, opportunity_id?,
 *         assigned_to?, attendees?: string[], send_invite?: boolean, client_key? }
 * 201 { success, data: { event, activity_id } }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const parsed = meetingInputSchema.safeParse(sinClavesDeOrganizacion(readOrgBody(ctx, await request.json().catch(() => null), { request })));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await createMeeting(ctx.organizationId, ctx.userId, parsed.data, ctx.supabase);
    return NextResponse.json(
      { success: true, data: { event: result.event, activity_id: result.activityId, invite_sent: false } },
      { status: 201 }
    );
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'POST meetings');
  }
}
