// ============================================================
// /api/integrations/open-finance/real-balance
// Obtiene saldos en tiempo real de cuentas bancarias
// GET - saldo real de una cuenta (?bankAccountId=xxx)
//       o de todas las cuentas de la organizacion (?organizationId=xxx)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { balanceService } from '@/lib/services/integrations/openFinance/balanceService';

// GET - obtiene saldo en tiempo real
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bankAccountIdParam = searchParams.get('bankAccountId');
    const organizationIdParam = searchParams.get('organizationId');

    // Caso 1: saldo de una cuenta especifica
    if (bankAccountIdParam) {
      const bankAccountId = Number(bankAccountIdParam);
      if (!bankAccountId || Number.isNaN(bankAccountId)) {
        return NextResponse.json(
          { error: 'bankAccountId debe ser un numero valido' },
          { status: 400 },
        );
      }

      const balance = await balanceService.getRealTimeBalance(bankAccountId);
      return NextResponse.json({ success: true, data: balance });
    }

    // Caso 2: saldos de todas las cuentas de la organizacion
    if (organizationIdParam) {
      const organizationId = Number(organizationIdParam);
      if (!organizationId || Number.isNaN(organizationId)) {
        return NextResponse.json(
          { error: 'organizationId debe ser un numero valido' },
          { status: 400 },
        );
      }

      const balances = await balanceService.getRealTimeBalances(organizationId);
      return NextResponse.json({ success: true, data: balances });
    }

    return NextResponse.json(
      { error: 'Se requiere bankAccountId u organizationId' },
      { status: 400 },
    );
  } catch (error) {
    console.error('[Open Finance Real Balance GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
