import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { analyzeCall, getAnalysis } from '@/lib/services/crm/callAnalysisService';

/**
 * POST /api/crm/calls/[id]/analyze — Fuerza el análisis IA de una llamada.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const analysis = await analyzeCall(id, ctx.organizationId, ctx.supabase);

    if (!analysis) {
      return NextResponse.json(
        { success: false, error: 'No se pudo analizar la llamada. Verifique que exista una transcripción completada.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: analysis }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Analyze] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * GET /api/crm/calls/[id]/analyze — Obtiene el análisis de una llamada.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const analysis = await getAnalysis(id, ctx.organizationId, ctx.supabase);

    if (!analysis) {
      return NextResponse.json(
        { success: false, error: 'Análisis no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: analysis }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Analyze] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
