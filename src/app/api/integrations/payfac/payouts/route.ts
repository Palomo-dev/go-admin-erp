// ============================================================
// /api/integrations/payfac/payouts
// Gestiona dispersiones de fondos a organizaciones (admin + organizacion)
// GET  - lista payouts (query: ?organizationId=xxx&status=xxx&limit=100)
// POST - crea payout
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { payoutService } from '@/lib/services/integrations/payfac';
import type { PayoutStatus } from '@/lib/services/integrations/payfac';

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

// GET - lista payouts con filtros opcionales
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
    const status = (searchParams.get('status') ?? undefined) as PayoutStatus | undefined;
    const limit = parseInt(searchParams.get('limit') ?? '100', 10);

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

    const payouts = await payoutService.list(supabase, {
      organizationId: orgIdNum,
      status,
      limit,
    });

    return NextResponse.json({ success: true, data: payouts });
  } catch (error) {
    console.error('[PayFac Payouts GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - crea un payout para una organizacion
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      organizationId,
      providerCode,
      periodStart,
      periodEnd,
      payoutMethod,
      bankAccountId,
    } = body;

    // Validar campos requeridos
    if (!organizationId || !providerCode || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'organizationId, providerCode, periodStart y periodEnd son requeridos' },
        { status: 400 },
      );
    }

    // Convertir organizationId a numero (viene como string desde el body)
    const orgIdNum = Number(organizationId);

    const payout = await payoutService.create(
      supabase,
      {
        organizationId: orgIdNum,
        providerCode,
        periodStart,
        periodEnd,
        payoutMethod,
        bankAccountId,
      },
      session.user.id,
    );

    return NextResponse.json({ success: true, data: payout }, { status: 201 });
  } catch (error) {
    console.error('[PayFac Payouts POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
