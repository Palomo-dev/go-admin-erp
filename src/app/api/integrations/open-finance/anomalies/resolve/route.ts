// ============================================================
// /api/integrations/open-finance/anomalies/resolve
// Marca una anomalia como resuelta
// POST - body: { anomalyId, resolution }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { anomalyDetectionService } from '@/lib/services/integrations/openFinance/anomalyDetectionService';

// POST - marca una anomalia como resuelta
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { anomalyId, resolution } = body;

    // Validar campos requeridos
    if (!anomalyId || !resolution) {
      return NextResponse.json(
        { error: 'anomalyId y resolution son requeridos' },
        { status: 400 },
      );
    }

    const result = await anomalyDetectionService.markAnomalyResolved(
      String(anomalyId),
      String(resolution),
      session.user.id,
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Open Finance Anomalies Resolve POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
