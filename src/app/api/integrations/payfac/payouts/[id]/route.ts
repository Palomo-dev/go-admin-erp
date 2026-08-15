// ============================================================
// /api/integrations/payfac/payouts/[id]
// Gestiona un payout individual con sus items
// GET  - obtiene payout con items
// POST - procesa o cancela payout (body: { action, reason? })
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

// GET - obtiene payout con items
export async function GET(
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
        { error: 'ID de payout requerido' },
        { status: 400 },
      );
    }

    const payout = await payoutService.getById(supabase, id);

    if (!payout) {
      return NextResponse.json(
        { error: 'Payout no encontrado' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: payout });
  } catch (error) {
    console.error('[PayFac Payout GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - procesa o cancela un payout
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Procesar/cancelar payouts requiere permisos de admin
    const isAdmin = await verifyPlatformAdmin(supabase, session.user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Acceso restringido a administradores de plataforma' },
        { status: 403 },
      );
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: 'ID de payout requerido' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { action, reason } = body;

    // Validar accion
    if (!action || (action !== 'process' && action !== 'cancel')) {
      return NextResponse.json(
        { error: "action debe ser 'process' o 'cancel'" },
        { status: 400 },
      );
    }

    const payout = await payoutService.process(supabase, id, action, reason);

    return NextResponse.json({ success: true, data: payout });
  } catch (error) {
    console.error('[PayFac Payout POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
