import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { assertRelatedBelongsToOrg, RelatedNotFoundError } from '@/lib/services/crm/activityService';

/**
 * POST /api/crm/notes — nota rápida (tabla `notes`) desde QuickActionsBar (FASE-09 §11).
 * Body: { related_type: 'opportunity'|'customer', related_id, body (HTML del RichTextEditor), is_pinned? }
 */
const schema = z.object({
  related_type: z.enum(['opportunity', 'customer']),
  related_id: z.string().uuid(),
  body: z.string().min(1).max(50000),
  is_pinned: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const b = parsed.data;
    await assertRelatedBelongsToOrg(ctx.organizationId, b.related_type, b.related_id, ctx.supabase);
    const { data, error } = await ctx.supabase
      .from('notes')
      .insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        body: b.body,
        related_type: b.related_type,
        related_id: b.related_id,
        is_pinned: b.is_pinned ?? false,
      })
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'sin datos');
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (error instanceof RelatedNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error('[CRM Notes] POST error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
