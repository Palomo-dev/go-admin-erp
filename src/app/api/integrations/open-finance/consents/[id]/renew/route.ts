// ============================================================
// /api/integrations/open-finance/consents/[id]/renew
// Renueva un consentimiento existente
// POST - renueva el consentimiento (extiende 90 dias)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { consentService } from '@/lib/services/integrations/openFinance/consentService';

// POST - renueva un consentimiento
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: 'ID de consentimiento requerido' },
        { status: 400 },
      );
    }

    const result = await consentService.renewConsent(id, session.user.id);

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('[Open Finance Consent Renew POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
