// ============================================================
// /api/integrations/open-finance/links
// Gestiona conexiones (links) bancarios de la organizacion
// GET  - lista links de la organizacion (query: ?organizationId=xxx)
// POST - crea un nuevo link bancario
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

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

// GET - lista links de la organizacion actual
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

    const links = await openFinanceService.getLinks(supabase, organizationId);

    return NextResponse.json({ success: true, data: links });
  } catch (error) {
    console.error('[Open Finance Links GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - crea un nuevo link bancario
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
      provider,
      institutionCode,
      institutionName,
      consentId,
      metadata,
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
    if (!provider || !institutionCode || !institutionName) {
      return NextResponse.json(
        { error: 'provider, institutionCode e institutionName son requeridos' },
        { status: 400 },
      );
    }

    const link = await openFinanceService.createLink(
      supabase,
      {
        organizationId: orgId,
        provider,
        institutionCode,
        institutionName,
        consentId,
        metadata,
      },
      session.user.id,
    );

    return NextResponse.json({ success: true, data: link }, { status: 201 });
  } catch (error) {
    console.error('[Open Finance Links POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
