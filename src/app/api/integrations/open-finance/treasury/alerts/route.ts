// ============================================================
// /api/integrations/open-finance/treasury/alerts
// Alertas de tesoreria
// GET - obtiene alertas (query: ?organizationId=xxx)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { treasuryService } from '@/lib/services/integrations/openFinance/treasuryService';

// GET - alertas de tesoreria
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationIdParam = searchParams.get('organizationId');

    if (!organizationIdParam) {
      return NextResponse.json(
        { error: 'organizationId es requerido' },
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

    const alerts = await treasuryService.getTreasuryAlerts(organizationId);

    return NextResponse.json({ success: true, data: alerts });
  } catch (error) {
    console.error('[Treasury Alerts GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
