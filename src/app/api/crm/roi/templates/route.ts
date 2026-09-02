import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getRoiCalculators, createRoiCalculator } from '@/lib/services/crm/roiService';

/**
 * GET /api/crm/roi/templates — Lista calculadoras de ROI activas.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const calculators = await getRoiCalculators(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: calculators }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ROI Templates] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/roi/templates — Crea una calculadora de ROI.
 * Body: { name, vertical_id?, inputs, formula, outputs, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name || !body?.inputs || !body?.formula || !body?.outputs) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name, inputs, formula, outputs' },
        { status: 400 }
      );
    }

    const calculator = await createRoiCalculator(
      ctx.organizationId,
      {
        name: body.name,
        vertical_id: body.vertical_id ?? null,
        inputs: body.inputs,
        formula: body.formula,
        outputs: body.outputs,
        is_active: body.is_active ?? true,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: calculator }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ROI Templates] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
