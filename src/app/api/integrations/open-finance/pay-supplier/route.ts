// ============================================================
// /api/integrations/open-finance/pay-supplier
// Paga una cuenta por pagar a un proveedor via Open Finance
// POST - paga cuenta por pagar (body: { accountPayableId, bankAccountId })
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { paymentInitiationService } from '@/lib/services/integrations/openFinance/paymentInitiationService';

// POST - paga una cuenta por pagar a un proveedor
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { accountPayableId, bankAccountId } = body;

    // Validar campos requeridos
    if (!accountPayableId || !bankAccountId) {
      return NextResponse.json(
        { error: 'accountPayableId y bankAccountId son requeridos' },
        { status: 400 },
      );
    }

    const result = await paymentInitiationService.paySupplier(
      Number(accountPayableId),
      Number(bankAccountId),
      session.user.id,
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('[Open Finance Pay Supplier POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
