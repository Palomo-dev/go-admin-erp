// ============================================================
// /api/integrations/open-finance/refresh-balances
// Refresca saldos de todas las cuentas vinculadas de una organizacion
// POST - body: { organizationId: number }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { balanceService } from '@/lib/services/integrations/openFinance/balanceService';

// POST - refresca saldos de cuentas vinculadas
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json() as { organizationId?: number };
    const { organizationId } = body;

    if (!organizationId || typeof organizationId !== 'number') {
      return NextResponse.json(
        { error: 'organizationId es requerido y debe ser un numero' },
        { status: 400 },
      );
    }

    const stats = await balanceService.refreshAllBalances(organizationId);

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('[Open Finance Refresh Balances POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
