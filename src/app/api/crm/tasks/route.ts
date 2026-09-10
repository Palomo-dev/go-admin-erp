import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { assertRelatedBelongsToOrg, RelatedNotFoundError } from '@/lib/services/crm/activityService';
import { TASK_PRIORITIES } from '@/lib/crm/enums';

/**
 * POST /api/crm/tasks — tarea rápida desde QuickActionsBar (FASE-09 §5.2).
 * Body: { related_to_type: 'opportunity'|'customer', related_to_id, title, description?, due_date?,
 *         priority?: low|med|high|critical (default med), assigned_to? (default usuario) }
 * Inserta en `tasks` con status 'open' (CHECK real). No existe /api/tasks en el repo.
 */
const schema = z.object({
  related_to_type: z.enum(['opportunity', 'customer']),
  related_to_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  due_date: z.string().datetime({ offset: true }).optional().nullable(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const b = parsed.data;
    const rel = await assertRelatedBelongsToOrg(ctx.organizationId, b.related_to_type, b.related_to_id, ctx.supabase);
    const { data, error } = await ctx.supabase
      .from('tasks')
      .insert({
        organization_id: ctx.organizationId,
        title: b.title,
        description: b.description ?? null,
        due_date: b.due_date ?? null,
        priority: b.priority ?? 'med',
        status: 'open',
        assigned_to: b.assigned_to ?? ctx.userId,
        created_by: ctx.userId,
        related_to_type: b.related_to_type,
        related_to_id: b.related_to_id,
        customer_id: b.related_to_type === 'customer' ? b.related_to_id : rel.customer_id,
        type: 'crm',
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
    console.error('[CRM Tasks] POST error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
