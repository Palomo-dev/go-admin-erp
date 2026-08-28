// ============================================================
// /api/integrations/open-finance/treasury/concentration
// Concentracion de pagos por proveedor
// GET - obtiene concentracion (query: ?organizationId=xxx&dateFrom=xxx&dateTo=xxx)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { treasuryService } from '@/lib/services/integrations/openFinance/treasuryService';

// GET - concentracion de pagos por proveedor
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationIdParam = searchParams.get('organizationId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    if (!organizationIdParam) {
      return NextResponse.json(
        { error: 'organizationId es requerido' },
        { status: 400 },
      );
    }

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'dateFrom y dateTo son requeridos' },
        { status: 400 },
      );
    }

    const organizationId = Number(organizationIdParam);
    if (Number.isNaN(organizationId)) {
      return NextResponse.json(
        { error: 'organizationId debe ser un numero valido' },
        { status: 400 },
      );
    }

    const concentration = await treasuryService.getPaymentConcentration(
      organizationId,
      dateFrom,
      dateTo,
    );

    return NextResponse.json({ success: true, data: concentration });
  } catch (error) {
    console.error('[Treasury Concentration GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
