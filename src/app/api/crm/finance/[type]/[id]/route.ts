import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getCustomerFinance360,
  getOpportunityFinance360,
} from '@/lib/services/crm/crmFinanceService';

/**
 * GET /api/crm/finance/[type]/[id] — Vista 360° financiera.
 *
 * [type]: customer | opportunity
 * [id]: UUID del cliente o de la oportunidad
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { type, id } = await params;

    if (type === 'customer') {
      const data = await getCustomerFinance360(ctx.organizationId, id, ctx.supabase);
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    if (type === 'opportunity') {
      const data = await getOpportunityFinance360(ctx.organizationId, id, ctx.supabase);
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    return NextResponse.json(
      { success: false, error: 'Tipo inválido. Use: customer | opportunity' },
      { status: 400 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Finance] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
