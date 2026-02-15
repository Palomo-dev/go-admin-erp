/**
 * API Route: Historial de uso de comunicaciones
 * GET /api/integrations/twilio/usage?orgId=X&channel=sms&limit=50&offset=0
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { commCreditsService } from '@/lib/services/commCreditsService';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json({ error: 'Falta orgId' }, { status: 400 });
    }

    const { data, count } = await commCreditsService.getUsageHistory(Number(orgId), {
      channel: searchParams.get('channel') || undefined,
      module: searchParams.get('module') || undefined,
      limit: Number(searchParams.get('limit')) || 50,
      offset: Number(searchParams.get('offset')) || 0,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    });

    return NextResponse.json({ data, count });
  } catch (error) {
    console.error('[API] Error consultando historial:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
