import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import {
  getEnrollments,
  resumeEnrollment,
  unenrollFromSequence,
  type EnrollmentStatus,
} from '@/lib/services/crm/sequenceService';

/**
 * GET /api/crm/sequences/[id]/enrollments — Inscripciones de la secuencia.
 * PATCH `{ enrollment_id, action: 'resume' }` — Reanuda una pausada (admin).
 * DELETE ?enrollment_id=… — Saca a un inscrito (admin).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const search = request.nextUrl.searchParams;

    const result = await getEnrollments(ctx.organizationId, ctx.supabase, {
      sequence_id: id,
      status: (search.get('status') as EnrollmentStatus | null) || undefined,
      limit: search.get('limit') ? parseInt(search.get('limit')!, 10) : undefined,
      offset: search.get('offset') ? parseInt(search.get('offset')!, 10) : undefined,
    });

    return NextResponse.json({ success: true, data: result.data, count: result.count }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sequence Enrollments] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH — Reanuda una inscripción pausada (tester r2 N3).
 *
 * Body: `{ enrollment_id: uuid, action: 'resume' }`. Exige rol de admin porque
 * reanudar vuelve a programar envíos reales al cliente.
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);

    let body: { enrollment_id?: string; action?: string } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    if (typeof body.enrollment_id !== 'string' || body.enrollment_id.length === 0) {
      return NextResponse.json({ success: false, error: 'Falta enrollment_id' }, { status: 400 });
    }
    if (body.action !== 'resume') {
      return NextResponse.json({ success: false, error: "action debe ser 'resume'" }, { status: 400 });
    }

    const result = await resumeEnrollment(ctx.organizationId, body.enrollment_id, ctx.supabase);
    return NextResponse.json({ success: result.resumed, data: result }, { status: result.resumed ? 200 : 409 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sequence Enrollments] PATCH error:', message);
    const status = /enrollment_not_found/.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const enrollmentId = request.nextUrl.searchParams.get('enrollment_id');
    if (!enrollmentId) {
      return NextResponse.json({ success: false, error: 'Falta enrollment_id' }, { status: 400 });
    }

    const result = await unenrollFromSequence(ctx.organizationId, enrollmentId, ctx.supabase);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Inscripción no encontrada o ya finalizada' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sequence Enrollments] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
