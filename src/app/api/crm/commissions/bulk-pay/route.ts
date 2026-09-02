import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { bulkPayCommissions } from '@/lib/services/crm/commissionService';

/**
 * POST /api/crm/commissions/bulk-pay — Pago masivo de comisiones.
 * Body: { commission_ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.commission_ids || !Array.isArray(body.commission_ids) || body.commission_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: commission_ids (array no vacío)' },
        { status: 400 }
      );
    }

    const result = await bulkPayCommissions(body.commission_ids, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Commissions Bulk Pay] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
