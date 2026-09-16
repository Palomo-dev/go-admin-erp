import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getDemos, createDemo, type DemoFilters } from '@/lib/services/crm/demoService';
import { validateCreateDemo, DEMO_STATUSES, type DemoStatus } from '@/lib/services/crm/demoInput';
import { failResponse, foreignOrgResponse, isSafeId, readJson } from '@/lib/services/crm/f10RouteHelpers';

export const runtime = 'nodejs';

/**
 * GET /api/crm/demos — Lista demos con filtros opcionales.
 * Query: opportunity_id, status, date_from, date_to, limit
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);
    const filters: DemoFilters = {};
    const opp = searchParams.get('opportunity_id');
    if (isSafeId(opp)) filters.opportunity_id = opp;
    const status = searchParams.get('status');
    if (status && (DEMO_STATUSES as readonly string[]).includes(status)) filters.status = status as DemoStatus;
    for (const key of ['date_from', 'date_to'] as const) {
      const v = searchParams.get(key);
      if (v && !Number.isNaN(Date.parse(v))) filters[key] = new Date(v).toISOString();
    }
    const limit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    if (Number.isFinite(limit) && limit > 0) filters.limit = Math.min(limit, 200);
    const demos = await getDemos(ctx.organizationId, ctx.supabase, filters);
    return NextResponse.json({ success: true, data: demos }, { status: 200 });
  } catch (error) {
    return failResponse('CRM Demos GET', error);
  }
}

/**
 * POST /api/crm/demos — Agenda una demo (F10). Body validado por `demoInput`;
 * la oportunidad debe ser de la organización (404 si no).
 * `scheduled_at` es un instante ISO construido por la UI en la tz de la organización.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await readJson(request);
    const forbidden = foreignOrgResponse('CRM Demos POST', body, ctx, request);
    if (forbidden) return forbidden;
    const v = validateCreateDemo(body);
    if (!v.ok) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    const { data: opp } = await ctx.supabase.from('opportunities').select('id').eq('id', v.value.opportunity_id).eq('organization_id', ctx.organizationId).maybeSingle();
    if (!opp) return NextResponse.json({ success: false, error: 'Oportunidad no encontrada' }, { status: 404 });
    const demo = await createDemo(
      ctx.organizationId,
      {
        opportunity_id: v.value.opportunity_id,
        scheduled_at: v.value.scheduled_at,
        duration_minutes: v.value.duration_minutes,
        attendees: v.value.attendees,
        video_provider: v.value.video_provider,
        video_url: v.value.video_url,
        checklist: v.value.checklist,
        notes: v.value.notes,
      },
      ctx.supabase,
    );
    return NextResponse.json({ success: true, data: demo }, { status: 201 });
  } catch (error) {
    return failResponse('CRM Demos POST', error);
  }
}
