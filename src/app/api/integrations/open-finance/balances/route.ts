// ============================================================
// /api/integrations/open-finance/balances
// Obtiene saldos de cuentas bancarias
// GET - obtiene saldos (query: ?linkId=xxx&accountId=xxx)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

// GET - obtiene saldos de una cuenta
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

    if (!linkId) {
      return NextResponse.json(
        { error: 'linkId es requerido' },
        { status: 400 },
      );
    }

    const balances = await openFinanceService.getBalances(supabase, linkId, accountId);

    return NextResponse.json({ success: true, data: balances });
  } catch (error) {
    console.error('[Open Finance Balances GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
