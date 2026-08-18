// ============================================================
// /api/integrations/payfac/commission/summary
// Resume comisiones por organizacion con totales recaudados (admin)
// GET - lista organizaciones con comisiones y totales
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { commissionService } from '@/lib/services/integrations/payfac';

// Verifica que el usuario sea administrador de plataforma
async function verifyPlatformAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('id, role, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error || !data) return false;
  return data.role === 'super_admin' || data.role === 'admin';
}

// GET - lista organizaciones con comisiones y totales recaudados
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const isAdmin = await verifyPlatformAdmin(supabase, session.user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Acceso restringido a administradores de plataforma' },
        { status: 403 },
      );
    }

    const summary = await commissionService.getSummary(supabase);

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error('[PayFac Commission Summary GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
