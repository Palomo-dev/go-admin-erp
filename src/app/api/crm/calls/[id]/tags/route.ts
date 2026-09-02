import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getCallTagsForCall, tagCall } from '@/lib/services/crm/callTagService';

/**
 * GET /api/crm/calls/[id]/tags — Lista los tags vinculados a una llamada.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const tags = await getCallTagsForCall(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: tags }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Tags] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
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
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    if (!body?.tagId) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: tagId' },
        { status: 400 }
      );
    }

    const relation = await tagCall(
      ctx.organizationId,
      id,
      body.tagId,
      body.source ?? 'manual',
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
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Tags] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
