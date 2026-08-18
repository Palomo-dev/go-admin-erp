// ============================================================
// /api/integrations/open-finance/validate-account
// Valida una cuenta bancaria antes de transferir
// POST - valida cuenta (body: { countryCode, accountNumber, bankCode, accountType, documentNumber, documentType })
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

// POST - valida cuenta bancaria
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      countryCode,
      accountNumber,
      bankCode,
      accountType,
      documentNumber,
      documentType,
    } = body;

    // Validar campos requeridos
    if (!countryCode || !accountNumber || !bankCode || !accountType
      || !documentNumber || !documentType) {
      return NextResponse.json(
        {
          error: 'countryCode, accountNumber, bankCode, accountType, documentNumber y documentType son requeridos',
        },
        { status: 400 },
      );
    }

    const result = await openFinanceService.validateAccount({
      country_code: countryCode,
      account_number: accountNumber,
      bank_code: bankCode,
      account_type: accountType,
      document_number: documentNumber,
      document_type: documentType,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Open Finance Validate Account POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
