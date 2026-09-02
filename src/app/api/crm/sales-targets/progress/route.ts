import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getTargetProgress } from '@/lib/services/crm/salesTargetService';

/**
 * GET /api/crm/sales-targets/progress — Progreso de cuota.
 * Query: ?user_id=<required>&period=monthly|quarterly|yearly
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get('user_id');
    const period = searchParams.get('period') || 'monthly';

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Parámetro requerido: user_id' },
        { status: 400 }
      );
    }

    const validPeriods = ['monthly', 'quarterly', 'yearly'];
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        { success: false, error: 'period inválido. Valores: monthly, quarterly, yearly' },
        { status: 400 }
      );
    }

    const progress = await getTargetProgress(
      ctx.organizationId,
      userId,
      period as 'monthly' | 'quarterly' | 'yearly',
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: progress }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Sales Targets Progress] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
