import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getObjections,
  createObjection,
} from '@/lib/services/crm/objectionService';

/**
 * GET /api/crm/objections — Lista las objections de la organización.
 * Query params opcionales: category, vertical_id, includeInactive
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const filters = {
      category: searchParams.get('category') || undefined,
      vertical_id: searchParams.get('vertical_id') || undefined,
      includeInactive: searchParams.get('includeInactive') === 'true',
    };

    const objections = await getObjections(ctx.organizationId, ctx.supabase, filters);

    return NextResponse.json({ success: true, data: objections }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/objections — Crea una nueva objection.
 * Body: { title, category?, detection_signals?, recommended_response?, discovery_questions?, related_case_studies?, vertical_id?, is_active?, sort_order? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    // Regla dura 5: la organización sale de la sesión; un body con otra → 403 y se registra.
    if (body?.organization_id != null && Number(body.organization_id) !== ctx.organizationId) {
      console.warn('[CRM Objections] POST con organization_id ajeno en el body', { session: ctx.organizationId, body: body.organization_id });
      return NextResponse.json({ success: false, error: 'Organización no permitida' }, { status: 403 });
    }

    if (!body?.title || typeof body.title !== 'string' || !body?.category || typeof body.category !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: title, category' },
        { status: 400 }
      );
    }

    const objection = await createObjection(
      ctx.organizationId,
      {
        title: body.title,
        category: body.category,
        detection_signals: body.detection_signals,
        recommended_response: body.recommended_response,
        discovery_questions: body.discovery_questions,
        related_case_studies: body.related_case_studies,
        vertical_id: body.vertical_id,
        is_active: body.is_active,
        sort_order: body.sort_order,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: objection }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
