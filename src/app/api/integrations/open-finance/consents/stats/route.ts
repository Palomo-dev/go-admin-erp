// ============================================================
// /api/integrations/open-finance/consents/stats
// Estadisticas de consentimientos de la organizacion
// GET - estadisticas (query: ?organizationId=xxx)
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

// GET - estadisticas de consentimientos
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgIdQuery = searchParams.get('organizationId');

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

    const stats = await consentService.getConsentStats(organizationId);

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('[Open Finance Consents Stats GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
