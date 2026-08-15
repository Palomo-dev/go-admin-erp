// ============================================================
// /api/integrations/open-finance/accounts
// Lista cuentas bancarias asociadas a un link
// GET - lista cuentas (query: ?linkId=xxx)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

// GET - lista cuentas de un link
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('linkId');

    if (!linkId) {
      return NextResponse.json(
        { error: 'linkId es requerido' },
        { status: 400 },
      );
    }

    const accounts = await openFinanceService.getAccounts(supabase, linkId);

    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    console.error('[Open Finance Accounts GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
