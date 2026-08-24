// ============================================================
// /api/integrations/open-finance/validate-balance
// Valida el saldo real del banco contra el saldo del extracto de una conciliacion
// POST - body: { reconciliationId: number }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { balanceService } from '@/lib/services/integrations/openFinance/balanceService';

// POST - valida saldo de una conciliacion
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json() as { reconciliationId?: number };
    const { reconciliationId } = body;

    if (!reconciliationId || typeof reconciliationId !== 'number') {
      return NextResponse.json(
        { error: 'reconciliationId es requerido y debe ser un numero' },
        { status: 400 },
      );
    }

    const validation = await balanceService.validateBalance(reconciliationId);

    return NextResponse.json({ success: true, data: validation });
  } catch (error) {
    console.error('[Open Finance Validate Balance POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
