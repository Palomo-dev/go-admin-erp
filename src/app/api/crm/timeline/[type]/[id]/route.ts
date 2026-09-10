import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getTimeline,
  TimelineEntityNotFoundError,
  TIMELINE_KINDS,
  type TimelineEntityType,
  type TimelineKind,
  type TimelineQuery,
} from '@/lib/services/crm/timelineService';

/**
 * GET /api/crm/timeline/[type]/[id] — Timeline unificado v2 (FASE-09 §4.1).
 *
 * [type]: customer | opportunity · [id]: UUID de la entidad (debe ser de la org → 404 si no)
 *
 * Query:
 *   - kinds=call,email,whatsapp,ai_call,task,note,meeting,system,sms,activity,call_live
 *   - channels=phone,voice_ai,email,whatsapp,sms   (alias: type= / channel= v1)
 *   - user_id=uuid · from=ISO · to=ISO
 *   - limit=30 (máx 50) · cursor=<base64url occurred_at|id>
 *
 * Respuesta: { success, data: TimelineEntry[], next_cursor: string|null }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    const { type, id } = await params;

    if (type !== 'customer' && type !== 'opportunity') {
      return NextResponse.json(
        { success: false, error: 'Tipo de entidad inválido. Use: customer | opportunity' },
        { status: 400 }
      );
    }
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ success: false, error: 'id inválido' }, { status: 400 });
    }

    const sp = request.nextUrl.searchParams;
    const csv = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

    const kindsRaw = [...csv(sp.get('kinds')), ...csv(sp.get('type'))];
    const invalid = kindsRaw.filter((k) => !(TIMELINE_KINDS as readonly string[]).includes(k));
    if (invalid.length) {
      return NextResponse.json({ success: false, error: `kinds inválidos: ${invalid.join(', ')}` }, { status: 400 });
    }

    const q: TimelineQuery = {};
    if (kindsRaw.length) q.kinds = kindsRaw as TimelineKind[];
    const channels = [...csv(sp.get('channels')), ...csv(sp.get('channel'))];
    if (channels.length) q.channels = channels;
    const userId = sp.get('user_id') ?? sp.get('user');
    if (userId) q.userId = userId;
    const from = sp.get('from') ?? sp.get('date_from');
    const to = sp.get('to') ?? sp.get('date_to');
    if (from) {
      if (Number.isNaN(Date.parse(from))) return NextResponse.json({ success: false, error: 'from inválido' }, { status: 400 });
      q.from = from;
    }
    if (to) {
      if (Number.isNaN(Date.parse(to))) return NextResponse.json({ success: false, error: 'to inválido' }, { status: 400 });
      q.to = to;
    }
    if (sp.get('limit')) {
      const n = parseInt(sp.get('limit')!, 10);
      if (!Number.isFinite(n) || n < 1) return NextResponse.json({ success: false, error: 'limit inválido' }, { status: 400 });
      q.limit = Math.min(n, 50);
    }
    if (sp.get('cursor')) q.cursor = sp.get('cursor')!;

    const result = await getTimeline(ctx.organizationId, type as TimelineEntityType, id, ctx.supabase, q);

    return NextResponse.json(
      { success: true, data: result.entries, next_cursor: result.next_cursor },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (error instanceof TimelineEntityNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Timeline] GET error:', message);
    return NextResponse.json({ success: false, error: 'Error interno del timeline' }, { status: 500 });
  }
}
