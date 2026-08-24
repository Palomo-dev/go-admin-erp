// ============================================================
// /api/integrations/open-finance/suggest-matches/[transactionId]
// Sugerencias de matching con IA para una transaccion especifica.
// GET - retorna sugerencias para la transaccion indicada en el path
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { aiMatchingService } from '@/lib/services/integrations/openFinance/aiMatchingService';
import { getActiveOrganizationId } from '@/lib/services/integrations/openFinance/authHelpers';

// GET - sugerencias de matching para una transaccion especifica
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Resolver la organizacion activa del usuario
    const organizationId = await getActiveOrganizationId(supabase, session.user.id);
    if (!organizationId) {
      return NextResponse.json(
        { error: 'No se pudo determinar la organizacion activa' },
        { status: 400 },
      );
    }

    const { transactionId: transactionIdParam } = await params;
    const transactionId = Number(transactionIdParam);
    if (!Number.isInteger(transactionId) || transactionId <= 0) {
      return NextResponse.json(
        { error: 'transactionId debe ser un entero valido' },
        { status: 400 },
      );
    }

    // El servicio verifica que la transaccion pertenezca a organizationId
    const suggestions = await aiMatchingService.suggestMatchesForTransaction(
      transactionId,
      organizationId,
    );

    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('[Open Finance Suggest-Matches Transaction GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
