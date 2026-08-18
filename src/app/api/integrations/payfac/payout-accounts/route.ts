// ============================================================
// /api/integrations/payfac/payout-accounts
// Gestiona cuentas de dispersion de la organizacion actual
// GET  - lista cuentas de dispersion
// POST - crea cuenta de dispersion
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { payoutService } from '@/lib/services/integrations/payfac';

// Obtiene el organizationId activo del usuario desde la sesion
async function getActiveOrganizationId(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return Number(data.organization_id);
}

// GET - lista cuentas de dispersion de la organizacion actual
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // organizationId puede venir por query o deducirse de la sesion
    const { searchParams } = new URL(request.url);
    const orgIdQuery = searchParams.get('organizationId');
    let organizationId = orgIdQuery ? Number(orgIdQuery) : undefined;

    if (!organizationId) {
      organizationId = await getActiveOrganizationId(supabase, session.user.id) ?? undefined;
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: 'No se pudo determinar la organizacion activa' },
        { status: 400 },
      );
    }

    const accounts = await payoutService.listAccounts(supabase, organizationId);

    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    console.error('[PayFac Payout Accounts GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - crea cuenta de dispersion
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
      bankName,
      accountType,
      accountNumber,
      accountHolderName,
      accountHolderId,
      accountHolderIdType,
      brebKeyValue,
      bankAccountId,
    } = body;

    // organizationId puede venir en el body o deducirse de la sesion
    let orgId = organizationId ? Number(organizationId) : undefined;
    if (!orgId) {
      orgId = await getActiveOrganizationId(supabase, session.user.id) ?? undefined;
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'No se pudo determinar la organizacion activa' },
        { status: 400 },
      );
    }

    // Validar campos requeridos
    if (!bankName || !accountType || !accountNumber || !accountHolderName
      || !accountHolderId || !accountHolderIdType) {
      return NextResponse.json(
        {
          error: 'bankName, accountType, accountNumber, accountHolderName, accountHolderId y accountHolderIdType son requeridos',
        },
        { status: 400 },
      );
    }

    const account = await payoutService.createAccount(
      supabase,
      {
        bankName,
        accountType,
        accountNumber,
        accountHolderName,
        accountHolderId,
        accountHolderIdType,
        brebKeyValue,
        // Vinculacion opcional con cuenta contable existente
        bankAccountId: bankAccountId ? Number(bankAccountId) : undefined,
      },
      orgId,
    );

    return NextResponse.json({ success: true, data: account }, { status: 201 });
  } catch (error) {
    console.error('[PayFac Payout Accounts POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
