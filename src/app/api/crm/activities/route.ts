import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  activityInputSchema,
  createActivity,
  DuplicateActivityError,
  RelatedNotFoundError,
} from '@/lib/services/crm/activityService';

/**
 * POST /api/crm/activities — crea una actividad CRM (FASE-09 §4.1).
 *
 * Body: { activity_type, related_type: 'opportunity'|'customer', related_id, notes?, channel?,
 *         outcome?, duration_seconds?, occurred_at?, metadata?, call_id?, email_message_id?, message_id? }
 * 201 { success, data } · 400 zod · 404 entidad ajena · 409 call_id ya tiene actividad
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const json = await request.json().catch(() => null);
    const parsed = activityInputSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const activity = await createActivity(ctx.organizationId, ctx.userId, parsed.data, ctx.supabase);
    return NextResponse.json({ success: true, data: activity }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (error instanceof RelatedNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof DuplicateActivityError) {
      return NextResponse.json({ success: false, error: error.message, data: error.existing }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Activities] POST error:', message);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
