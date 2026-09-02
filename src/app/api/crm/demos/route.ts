import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getDemos, createDemo } from '@/lib/services/crm/demoService';

/**
 * GET /api/crm/demos — Lista demos con filtros opcionales.
 * Query: opportunity_id, status, date_from, date_to, limit
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const filters: Record<string, unknown> = {};
    if (searchParams.get('opportunity_id')) filters.opportunity_id = searchParams.get('opportunity_id');
    if (searchParams.get('status')) filters.status = searchParams.get('status');
    if (searchParams.get('date_from')) filters.date_from = searchParams.get('date_from');
    if (searchParams.get('date_to')) filters.date_to = searchParams.get('date_to');
    if (searchParams.get('limit')) filters.limit = parseInt(searchParams.get('limit')!, 10);

    const demos = await getDemos(ctx.organizationId, ctx.supabase, filters);

    return NextResponse.json({ success: true, data: demos }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Demos] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/demos — Crea una nueva sesión de demo.
 * Body: { opportunity_id, scheduled_at, duration_minutes, attendees, video_provider?, video_url?, checklist?, notes? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.opportunity_id || !body?.scheduled_at || !body?.duration_minutes || !body?.attendees) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: opportunity_id, scheduled_at, duration_minutes, attendees' },
        { status: 400 }
      );
    }

    const demo = await createDemo(
      ctx.organizationId,
      {
        opportunity_id: body.opportunity_id,
        template_id: body.template_id ?? null,
        scheduled_at: body.scheduled_at,
        duration_minutes: body.duration_minutes,
        attendees: body.attendees,
        video_provider: body.video_provider ?? null,
        video_url: body.video_url ?? null,
        recording_url: body.recording_url ?? null,
        checklist: body.checklist ?? [],
        notes: body.notes ?? null,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: demo }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Demos] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
