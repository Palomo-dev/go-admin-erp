// ============================================================
// /api/integrations/open-finance/sync
// Sincronizacion manual de transacciones Open Finance
// POST - sincroniza un link especifico o todos los links activos
// Body: { linkId?: string; organizationId?: number; dateFrom?: string; dateTo?: string }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { transactionSyncService } from '@/lib/services/integrations/openFinance/transactionSyncService';

/** Cuerpo de la peticion POST de sincronizacion */
interface SyncRequestBody {
  linkId?: string;
  organizationId?: number;
  dateFrom?: string;
  dateTo?: string;
}

// POST - sincroniza transacciones de un link o todos los links
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Verificar sesion
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json() as SyncRequestBody;
    const { linkId, organizationId, dateFrom, dateTo } = body;

    // Si se especifica linkId, sincroniza ese link
    if (linkId) {
      const stats = await transactionSyncService.syncTransactions(
        linkId,
        undefined,
        dateFrom,
        dateTo,
      );
      return NextResponse.json({
        success: true,
        mode: 'single',
        linkId,
        stats,
      });
    }

    // Si no hay linkId, sincroniza todos los links activos
    const stats = await transactionSyncService.syncAllLinks(organizationId);
    return NextResponse.json({
      success: true,
      mode: 'all',
      stats,
    });
  } catch (error) {
    console.error('[Open Finance Sync POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
