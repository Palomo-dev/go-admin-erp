// ============================================================
// /api/integrations/open-finance/transfer
// Inicia una transferencia bancaria
// POST - inicia transferencia (body: { accountNumber, bankCode, accountType, documentNumber, documentType, amount, currency, description, reference })
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

// POST - inicia transferencia bancaria
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      accountNumber,
      bankCode,
      accountType,
      documentNumber,
      documentType,
      amount,
      currency,
      description,
      reference,
    } = body;

    // Validar campos requeridos
    if (!accountNumber || !bankCode || !accountType || !documentNumber
      || !documentType || !amount || !currency) {
      return NextResponse.json(
        {
          error: 'accountNumber, bankCode, accountType, documentNumber, documentType, amount y currency son requeridos',
        },
        { status: 400 },
      );
    }

    const result = await openFinanceService.initiateTransfer(
      supabase,
      {
        account_number: accountNumber,
        bank_code: bankCode,
        account_type: accountType,
        document_number: documentNumber,
        document_type: documentType,
        amount: Number(amount),
        currency,
        description,
        reference,
      },
      session.user.id,
    );

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('[Open Finance Transfer POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
