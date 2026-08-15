// ============================================================
// /api/integrations/payfac/payout-accounts/[id]
// Desactiva una cuenta de dispersion por id
// DELETE - desactiva cuenta
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { payoutService } from '@/lib/services/integrations/payfac';

// DELETE - desactiva cuenta de dispersion por id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: 'ID de cuenta requerido' },
        { status: 400 },
      );
    }

    await payoutService.deactivateAccount(supabase, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PayFac Payout Accounts DELETE] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
