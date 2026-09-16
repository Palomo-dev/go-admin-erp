import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  getOpportunityObjections,
  addOpportunityObjection,
  resolveOpportunityObjection,
  ObjectionRequestError,
} from '@/lib/services/crm/objectionService';

/**
 * GET /api/crm/objections/opportunity/[opportunityId] — Lista las objections de una oportunidad.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { opportunityId } = await params;

    const objections = await getOpportunityObjections(opportunityId, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: objections }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections Opportunity] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/objections/opportunity/[opportunityId] — Vincula una objection a una oportunidad.
 * Body: { objection_id, notes? } | { resolveId } — marca una opportunity_objection como resuelta.
 * La oportunidad sale SOLO de la ruta (un `opportunity_id` en el body se ignora) y
 * `detected_by` es siempre 'manual' desde aquí: la IA escribe por otro camino.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { opportunityId } = await params;
    const body = await readOrgBody(ctx, request);


    // Si viene resolveId en el body, resolver en lugar de vincular
    if (body?.resolveId) {
      const resolved = await resolveOpportunityObjection(body.resolveId, ctx.organizationId, ctx.supabase);
      return NextResponse.json({ success: true, data: resolved }, { status: 200 });
    }

    if (!body?.objection_id) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: objection_id' },
        { status: 400 }
      );
    }

    const result = await addOpportunityObjection(
      ctx.organizationId,
      opportunityId,
      body.objection_id,
      { notes: body.notes, detected_by: 'manual' },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    // ObjectionRequestError cubre 404 (no encontrada) y 400 (nota > NOTES_MAX): el statusCode viaja tal cual.
    if (error instanceof OrgContextError || error instanceof ObjectionRequestError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections Opportunity] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
