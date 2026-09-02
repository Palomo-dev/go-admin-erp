import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getCallQualityMetrics } from '@/lib/services/crm/callAnalysisService';

/**
 * GET /api/crm/call-quality — Métricas de calidad de llamadas vía fn_call_quality RPC.
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), userId?
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const userId = searchParams.get('userId') ?? undefined;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros obligatorios: startDate, endDate' },
        { status: 400 }
      );
    }

    // Validar formato de fecha YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { success: false, error: 'Formato de fecha inválido. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    const metrics = await getCallQualityMetrics(
      ctx.organizationId,
      startDate,
      endDate,
      ctx.supabase,
      userId
    );

    return NextResponse.json({ success: true, data: metrics }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Call Quality] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
