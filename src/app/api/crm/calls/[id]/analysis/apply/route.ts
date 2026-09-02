import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { applyAnalysis } from '@/lib/services/crm/callAnalysisService';

/**
 * POST /api/crm/calls/[id]/analysis/apply — Aplica las acciones sugeridas por el análisis.
 * Body opcional: { analysisId?: string } — si no se pasa, usa el análisis más reciente.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    let body: { analysisId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Body vacío es válido
    }

    // Si no viene analysisId, buscar el análisis más reciente de la llamada
    let analysisId = body.analysisId;
    if (!analysisId) {
      const { getAnalysis } = await import('@/lib/services/crm/callAnalysisService');
      const existing = await getAnalysis(id, ctx.organizationId, ctx.supabase);
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'No hay análisis para aplicar' },
          { status: 404 }
        );
      }
      analysisId = existing.id;
    }

    const result = await applyAnalysis(analysisId, ctx.organizationId, ctx.userId, ctx.supabase);

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'No se pudo aplicar el análisis' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Analysis Apply] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
