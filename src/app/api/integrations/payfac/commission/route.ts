// ============================================================
// /api/integrations/payfac/commission
// Gestiona comisiones de organizaciones por proveedor (admin)
// GET  - lista comisiones (query: ?organizationId=xxx)
// POST - crea o actualiza comision
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

// GET - lista comisiones, opcionalmente filtradas por organizacion
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const orgIdNum = organizationId ? Number(organizationId) : undefined;

    const commissions = await commissionService.list(supabase, orgIdNum);

    return NextResponse.json({ success: true, data: commissions });
  } catch (error) {
    console.error('[PayFac Commission GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - crea o actualiza comision de una organizacion
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      organizationId,
      providerCode,
      commissionType,
      commissionValue,
      minCommissionAmount,
    } = body;

    // Validar campos requeridos
    if (!organizationId || !providerCode || !commissionType || commissionValue === undefined) {
      return NextResponse.json(
        { error: 'organizationId, providerCode, commissionType y commissionValue son requeridos' },
        { status: 400 },
      );
    }

    // Convertir organizationId a numero (viene como string desde el body)
    const orgIdNum = Number(organizationId);

    const commission = await commissionService.upsert(supabase, {
      organizationId: orgIdNum,
      providerCode,
      commissionType,
      commissionValue,
      minCommissionAmount,
    });

    return NextResponse.json({ success: true, data: commission });
  } catch (error) {
    console.error('[PayFac Commission POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
