import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { updateDemo } from '@/lib/services/crm/demoService';

/**
 * PATCH /api/crm/demos/[id] — Actualiza una sesión de demo.
 * Body: { scheduled_at?, duration_minutes?, attendees?, video_provider?, video_url?,
 *        recording_url?, status?, checklist?, notes? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const demo = await updateDemo(id, ctx.organizationId, body, ctx.supabase);

    if (!demo) {
      return NextResponse.json(
        { success: false, error: 'Demo no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: demo }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Demos] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
