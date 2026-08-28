// ============================================================
// /api/integrations/open-finance/validate-supplier
// Valida la cuenta bancaria de un proveedor via Open Finance
// POST - valida cuenta de proveedor (body: { supplierId })
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { paymentInitiationService } from '@/lib/services/integrations/openFinance/paymentInitiationService';

// POST - valida la cuenta bancaria de un proveedor
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { supplierId } = body;

    // Validar campo requerido
    if (!supplierId) {
      return NextResponse.json(
        { error: 'supplierId es requerido' },
        { status: 400 },
      );
    }

    const result = await paymentInitiationService.validateSupplierAccount(Number(supplierId));

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Open Finance Validate Supplier POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
