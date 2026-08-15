// ============================================================
// /api/integrations/payfac/payouts/pending
// Lista payouts pendientes de dispersion (admin + organizacion)
// GET - lista payouts pendientes (query: ?organizationId=xxx)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { payoutService } from '@/lib/services/integrations/payfac';

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

// GET - lista payouts pendientes, opcionalmente filtrados por organizacion
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const orgIdNum = organizationId ? Number(organizationId) : undefined;

    // Si no se especifica organizationId, requiere permisos de admin
    if (!orgIdNum) {
      const isAdmin = await verifyPlatformAdmin(supabase, session.user.id);
      if (!isAdmin) {
        return NextResponse.json(
          { error: 'Se requiere organizationId o permisos de administrador' },
          { status: 403 },
        );
      }
    }

    const pending = await payoutService.listPending(supabase, orgIdNum);

    return NextResponse.json({ success: true, data: pending });
  } catch (error) {
    console.error('[PayFac Payouts Pending GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
