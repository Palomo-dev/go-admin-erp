import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import { enrollInSequence } from '@/lib/services/crm/sequenceService';

/**
 * POST /api/crm/sequences/[id]/enroll — Inscribe oportunidades en la secuencia.
 *
 * Body: `{ opportunity_id?: uuid, opportunity_ids?: uuid[], customer_id?: uuid }`
 * Requiere rol de admin (§7): una inscripción dispara envíos reales al cliente.
 * La inscripción es atómica (`fn_enroll_in_sequence`) y no duplica: si ya hay
 * una viva devuelve `already_active`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const { id } = await params;
    const body = await request.json();

    const ids: string[] = Array.isArray(body?.opportunity_ids)
      ? body.opportunity_ids.filter((v: unknown) => typeof v === 'string')
      : body?.opportunity_id
        ? [body.opportunity_id]
        : [];

    if (ids.length === 0 && !body?.customer_id) {
      return NextResponse.json(
        { success: false, error: 'Falta opportunity_id, opportunity_ids o customer_id' },
        { status: 400 },
      );
    }
    if (ids.length > 200) {
      return NextResponse.json({ success: false, error: 'Máximo 200 oportunidades por llamada' }, { status: 400 });
    }

    const enrolled: unknown[] = [];
    const skipped: { id: string | null; reason: string }[] = [];

    const targets: (string | null)[] = ids.length > 0 ? ids : [null];
    for (const opportunityId of targets) {
      try {
        const result = await enrollInSequence(ctx.organizationId, id, opportunityId, ctx.supabase, {
          customerId: opportunityId ? null : (body.customer_id as string),
          source: 'manual',
          enrolledBy: ctx.userId,
        });
        if (result.created) enrolled.push(result);
        else skipped.push({ id: opportunityId, reason: result.reason ?? 'not_created' });
      } catch (err) {
        skipped.push({ id: opportunityId, reason: err instanceof Error ? err.message : String(err) });
      }
    }

    const status = enrolled.length > 0 ? 201 : 400;
    return NextResponse.json(
      { success: enrolled.length > 0, data: enrolled, enrolled: enrolled.length, skipped },
      { status },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sequences Enroll] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
