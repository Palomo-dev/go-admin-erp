// ============================================================
// /api/integrations/open-finance/movements
// Obtiene movimientos de una cuenta y los persiste
// GET - obtiene movimientos (query: ?linkId=xxx&accountId=xxx&dateFrom=xxx&dateTo=xxx)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

// GET - obtiene movimientos y los guarda en base de datos
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('linkId');
    const accountId = searchParams.get('accountId') ?? undefined;
    const dateFrom = searchParams.get('dateFrom') ?? undefined;
    const dateTo = searchParams.get('dateTo') ?? undefined;

    if (!linkId || !accountId || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'linkId, accountId, dateFrom y dateTo son requeridos' },
        { status: 400 },
      );
    }

    // Obtener movimientos desde el proveedor
    const movements = await openFinanceService.getMovements(
      supabase,
      linkId,
      accountId,
      dateFrom,
      dateTo,
    );

    // Persistir transacciones en base de datos
    const saved = await openFinanceService.saveTransactions(supabase, linkId, accountId, movements);

    return NextResponse.json({ success: true, data: movements, saved });
  } catch (error) {
    console.error('[Open Finance Movements GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
