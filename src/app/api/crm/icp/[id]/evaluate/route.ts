import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { assignICPBand } from '@/lib/services/crm/icpService';

/**
 * POST /api/crm/icp/[id]/evaluate — Evalúa un customer contra el ICP y asigna el band.
 * Body: { customer_id, assign?: boolean }
 * Si assign es true (default), actualiza opportunities.icp_band e icp_fit_score.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id: _profileId } = await params;
    const body = await request.json();

    if (!body?.customer_id) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: customer_id' },
        { status: 400 }
      );
    }

    const assign = body.assign !== false; // default: true
    const customerId: string = body.customer_id;

    if (assign) {
      const result = await assignICPBand(ctx.organizationId, customerId, ctx.supabase);
      return NextResponse.json({ success: true, data: result }, { status: 200 });
    } else {
      // Solo evaluar sin asignar — importar evaluateICP dinámicamente
      const { evaluateICP } = await import('@/lib/services/crm/icpService');
      const evaluations = await evaluateICP(ctx.organizationId, customerId, ctx.supabase);
      return NextResponse.json({ success: true, data: { evaluations } }, { status: 200 });
    }
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM ICP Evaluate] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
