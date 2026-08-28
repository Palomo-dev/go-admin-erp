// ============================================================
// /api/integrations/open-finance/payment-history
// Obtiene el historial de pagos a un proveedor via Open Finance
// GET - retorna historial (query: ?supplierId=xxx&organizationId=xxx)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { paymentInitiationService } from '@/lib/services/integrations/openFinance/paymentInitiationService';

// GET - historial de pagos a un proveedor via Open Finance
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplierId');
    const organizationId = searchParams.get('organizationId');

    // Validar parametros requeridos
    if (!supplierId || !organizationId) {
      return NextResponse.json(
        { error: 'supplierId y organizationId son requeridos' },
        { status: 400 },
      );
    }

    const history = await paymentInitiationService.getPaymentHistory(
      Number(supplierId),
      Number(organizationId),
    );

    return NextResponse.json({ success: true, data: history });
  } catch (error) {
    console.error('[Open Finance Payment History GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
