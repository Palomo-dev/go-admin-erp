// ============================================================
// /api/integrations/open-finance/suggest-matches
// Sugerencias de matching con IA para conciliacion bancaria.
// GET  - retorna sugerencias para una reconciliacion (?reconciliationId=xxx)
// POST - auto-concilia matches de alta confianza (body: { reconciliationId })
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { aiMatchingService } from '@/lib/services/integrations/openFinance/aiMatchingService';
import { getActiveOrganizationId } from '@/lib/services/integrations/openFinance/authHelpers';

// GET - sugerencias de matching para una reconciliacion
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Resolver la organizacion activa del usuario
    const organizationId = await getActiveOrganizationId(supabase, session.user.id);
    if (!organizationId) {
      return NextResponse.json(
        { error: 'No se pudo determinar la organizacion activa' },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const reconciliationId = searchParams.get('reconciliationId');

    if (!reconciliationId) {
      return NextResponse.json(
        { error: 'reconciliationId es requerido' },
        { status: 400 },
      );
    }

    // El servicio verifica que la reconciliacion pertenezca a organizationId
    const suggestions = await aiMatchingService.suggestMatches(reconciliationId, organizationId);

    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('[Open Finance Suggest-Matches GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - auto-concilia matches de alta confianza
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Resolver la organizacion activa del usuario
    const organizationId = await getActiveOrganizationId(supabase, session.user.id);
    if (!organizationId) {
      return NextResponse.json(
        { error: 'No se pudo determinar la organizacion activa' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { reconciliationId } = body as { reconciliationId?: string };

    if (!reconciliationId) {
      return NextResponse.json(
        { error: 'reconciliationId es requerido' },
        { status: 400 },
      );
    }

    // El servicio verifica que la reconciliacion pertenezca a organizationId
    const stats = await aiMatchingService.autoMatchHighConfidence(reconciliationId, organizationId);

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('[Open Finance Suggest-Matches POST] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
