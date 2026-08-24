// ============================================================
// /api/integrations/open-finance/sync-status
// Estado de sincronizacion de un link Open Finance
// GET - retorna estado de sincronizacion
// Query: ?linkId=xxx
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { transactionSyncService } from '@/lib/services/integrations/openFinance/transactionSyncService';

// GET - retorna estado de sincronizacion de un link
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Verificar sesion
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

    const status = await transactionSyncService.getSyncStatus(linkId);

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error('[Open Finance Sync Status GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
