import { requireSequenceManager, sequenceError } from '@/lib/services/crm/sequenceRouteSupport';
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { enrollInSequence } from '@/lib/services/crm/sequenceService';
import { clasificarErrorCrm } from '@/lib/services/crm/crmRouteSupport';

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
    const ctx = await getServerOrgContext(request);
    await requireSequenceManager(ctx);
    const { id } = await params;
    const body = await readOrgBody(ctx, request);

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
    const skipped: { id: string | null; reason: string; code?: string }[] = [];
    const failedStatuses: number[] = [];

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
        const known = clasificarErrorCrm(err);
        failedStatuses.push(known?.status ?? 500);
        skipped.push({ id: opportunityId, reason: known?.error ?? 'Error interno', code: known?.code ?? 'error_interno' });
        if (!known) console.error('[Sequences Enroll] error al inscribir:', err);
      }
    }

    const failureStatus = [403, 500, 409, 404, 400].find(value => failedStatuses.includes(value)) ?? 400;
    const status = enrolled.length > 0 ? 201 : failureStatus;
    return NextResponse.json(
      { success: enrolled.length > 0, data: enrolled, enrolled: enrolled.length, skipped },
      { status },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    return sequenceError(error, 'sequences.enroll');
  }
}
