import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getTimeline,
  type TimelineEntityType,
  type TimelineEntryType,
} from '@/lib/services/crm/timelineService';

/**
 * GET /api/crm/timeline/[type]/[id] — Timeline unificado de una entidad.
 *
 * [type]: customer | opportunity
 * [id]: UUID de la entidad
 *
 * Query params:
 *   - type: filtrar por tipo de entry (activity|task|note|call|email|whatsapp)
 *   - date_from: fecha mínima (ISO)
 *   - date_to: fecha máxima (ISO)
 *   - user_id: filtrar por usuario
 *   - limit: número de entries (default 50, max 200)
 *   - cursor: cursor de paginación (timestamp|id)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { type, id } = await params;

    // Validar tipo de entidad
    if (type !== 'customer' && type !== 'opportunity') {
      return NextResponse.json(
        { success: false, error: 'Tipo de entidad inválido. Use: customer | opportunity' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filters: Record<string, unknown> = {};

    const entryType = searchParams.get('type');
    if (entryType) filters.type = entryType as TimelineEntryType;
    if (searchParams.get('date_from')) filters.date_from = searchParams.get('date_from')!;
    if (searchParams.get('date_to')) filters.date_to = searchParams.get('date_to')!;
    if (searchParams.get('user_id')) filters.user_id = searchParams.get('user_id')!;
    if (searchParams.get('limit')) filters.limit = parseInt(searchParams.get('limit')!, 10);
    if (searchParams.get('cursor')) filters.cursor = searchParams.get('cursor')!;

    const result = await getTimeline(
      ctx.organizationId,
      type as TimelineEntityType,
      id,
      ctx.supabase,
      filters
    );

    return NextResponse.json(
      { success: true, data: result.entries, next_cursor: result.next_cursor },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Timeline] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
