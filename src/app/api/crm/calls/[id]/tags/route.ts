import { NextRequest, NextResponse } from 'next/server';
import { exigirAccesoLlamada } from '@/lib/services/crm/callAccessService';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getCallTagsForCall, tagCall } from '@/lib/services/crm/callTagService';
import { assertDbEnum, CALL_TAG_SOURCE_VALUES } from '@/lib/services/crm/callAnalysisRules';

/**
 * GET /api/crm/calls/[id]/tags — Lista los tags vinculados a una llamada.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    readOrgBody(ctx, {}, { request });
    await exigirAccesoLlamada(ctx, id, 'lectura');

    const tags = await getCallTagsForCall(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: tags }, { status: 200 });
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'llamada_auxiliar');
  }
}

/**
 * POST /api/crm/calls/[id]/tags — Vincula un tag a una llamada.
 * Body: { tagId: string, source?: 'manual' | 'ia', confidence?: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const body = await readOrgBody(ctx, request);
    await exigirAccesoLlamada(ctx, id, 'gestion');

    if (!body?.tagId) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: tagId' },
        { status: 400 }
      );
    }

    // `call_tag_relations_source_check` = manual|ia: el valor del body pasa por
    // la comprobación en vez de escribirse suelto (tester r2 nº 5).
    let source: 'manual' | 'ia';
    try {
      source = assertDbEnum(String(body.source ?? 'manual'), CALL_TAG_SOURCE_VALUES, 'call_tag_relations.source');
    } catch {
      return NextResponse.json(
        { success: false, error: `source inválido: usa ${CALL_TAG_SOURCE_VALUES.join(' o ')}` },
        { status: 400 }
      );
    }

    const relation = await tagCall(
      ctx.organizationId,
      id,
      body.tagId,
      source,
      ctx.supabase,
      body.confidence
    );

    if (!relation) {
      return NextResponse.json(
        { success: false, error: 'No se pudo vincular el tag' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: relation }, { status: 201 });
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'llamada_auxiliar');
  }
}
