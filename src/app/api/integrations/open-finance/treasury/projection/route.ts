// ============================================================
// /api/integrations/open-finance/treasury/projection
// Proyeccion de flujo de caja a N dias
// GET - obtiene proyeccion (query: ?organizationId=xxx&days=90)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { treasuryService } from '@/lib/services/integrations/openFinance/treasuryService';

// GET - proyeccion de flujo de caja
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

    const daysParam = searchParams.get('days');
    const days = daysParam ? Number(daysParam) : 90;
    if (Number.isNaN(days) || days <= 0 || days > 365) {
      return NextResponse.json(
        { error: 'days debe ser un numero entre 1 y 365' },
        { status: 400 },
      );
    }

    const projection = await treasuryService.getCashFlowProjection(organizationId, days);

    return NextResponse.json({ success: true, data: projection });
  } catch (error) {
    console.error('[Treasury Projection GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
