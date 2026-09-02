import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { enrollInSequence } from '@/lib/services/crm/sequenceService';

/**
 * POST /api/crm/sequences/[id]/enroll — Inscribe una oportunidad en la secuencia.
 * Body: { opportunity_id }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    if (!body?.opportunity_id) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: opportunity_id' },
        { status: 400 },
      );
    }

    const enrollment = await enrollInSequence(
      ctx.organizationId,
      id,
      body.opportunity_id,
      ctx.supabase,
    );

    return NextResponse.json({ success: true, data: enrollment }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sequences Enroll] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
