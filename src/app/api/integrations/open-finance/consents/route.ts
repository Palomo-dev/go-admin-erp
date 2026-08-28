// ============================================================
// /api/integrations/open-finance/consents
// Gestion de consentimientos Open Finance (Decreto 0368 de 2026)
// GET  - lista consentimientos de la organizacion
//        (query: ?organizationId=xxx&status=xxx&consentType=xxx)
// POST - crea un nuevo consentimiento
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consentService } from '@/lib/services/integrations/openFinance/consentService';

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

// GET - lista consentimientos de la organizacion
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgIdQuery = searchParams.get('organizationId');
    const status = searchParams.get('status') || undefined;
    const consentType = searchParams.get('consentType') || undefined;

    let organizationId = orgIdQuery ? Number(orgIdQuery) : undefined;
    if (!organizationId) {
      organizationId = (await getActiveOrganizationId(supabase, session.user.id)) ?? undefined;
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: 'No se pudo determinar la organizacion activa' },
        { status: 400 },
      );
    }

    const consents = await consentService.listConsents(organizationId, { status, consentType });

    return NextResponse.json({ success: true, data: consents });
  } catch (error) {
    console.error('[Open Finance Consents GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - crea un nuevo consentimiento
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
      linkId,
      consentType,
      purpose,
      scope,
      expiresAt,
    } = body;

    // organizationId puede venir en el body o deducirse de la sesion
    let orgId = organizationId ? Number(organizationId) : undefined;
    if (!orgId) {
      orgId = (await getActiveOrganizationId(supabase, session.user.id)) ?? undefined;
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'No se pudo determinar la organizacion activa' },
        { status: 400 },
      );
    }

    // Validar campos requeridos
    if (!consentType || !purpose) {
      return NextResponse.json(
        { error: 'consentType y purpose son requeridos' },
        { status: 400 },
      );
    }

    const validTypes = ['data_access', 'payment_initiation', 'account_validation'];
    if (!validTypes.includes(consentType)) {
      return NextResponse.json(
        { error: 'consentType no valido' },
        { status: 400 },
      );
    }

    // IP y user agent del request para auditoria
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || null;
    const userAgent = request.headers.get('user-agent') || null;

    const result = await consentService.createConsent({
      organizationId: orgId,
      linkId,
      consentType,
      purpose,
      scope,
      expiresAt,
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined,
      userId: session.user.id,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('[Open Finance Consents POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
