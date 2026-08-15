// ============================================================
// /api/integrations/open-finance/institutions
// Lista instituciones bancarias disponibles por proveedor
// GET - lista instituciones (query: ?provider=prometeo)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

// GET - lista instituciones bancarias disponibles
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Proveedor opcional via query param (default: prometeo)
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') ?? 'prometeo';

    const institutions = await openFinanceService.getInstitutions(provider);

    return NextResponse.json({ success: true, data: institutions });
  } catch (error) {
    console.error('[Open Finance Institutions GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
