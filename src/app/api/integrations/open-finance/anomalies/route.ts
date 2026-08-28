// ============================================================
// /api/integrations/open-finance/anomalies
// Deteccion de anomalias en transacciones bancarias
// GET - retorna todas las anomalias (query: ?organizationId=xxx)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { anomalyDetectionService } from '@/lib/services/integrations/openFinance/anomalyDetectionService';

// GET - obtiene todas las anomalias de una organizacion
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

    const summary = await anomalyDetectionService.getAllAnomalies(organizationId);

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error('[Open Finance Anomalies GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
