import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { calculateRoi } from '@/lib/services/crm/roiService';

/**
 * POST /api/crm/roi — Calcula ROI desde inputs + formula de una calculadora.
 * Body: { calculator_id, inputs: { key: number, ... } }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.calculator_id || !body?.inputs) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: calculator_id, inputs' },
        { status: 400 }
      );
    }

    const result = await calculateRoi(
      body.calculator_id,
      body.inputs as Record<string, number>,
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ROI] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
