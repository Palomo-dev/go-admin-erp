// ============================================================
// /api/integrations/open-finance/consents/[id]
// Operaciones sobre un consentimiento especifico
// GET    - obtiene un consentimiento por ID
// DELETE - revoca un consentimiento (body: { reason })
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { consentService } from '@/lib/services/integrations/openFinance/consentService';

// GET - obtiene un consentimiento por ID
export async function GET(
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

    const consent = await consentService.getConsent(id);

    if (!consent) {
      return NextResponse.json(
        { error: 'Consentimiento no encontrado' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: consent });
  } catch (error) {
    console.error('[Open Finance Consent GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE - revoca un consentimiento
export async function DELETE(
  request: NextRequest,
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

    const body = await request.json().catch(() => ({}));
    const { reason } = body as { reason?: string };

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'El motivo de revocacion es requerido' },
        { status: 400 },
      );
    }

    const result = await consentService.revokeConsent(id, reason);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[Open Finance Consent DELETE] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
