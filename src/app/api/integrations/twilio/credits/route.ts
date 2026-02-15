/**
 * API Route: Consultar créditos de comunicación
 * GET /api/integrations/twilio/credits?orgId=X
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

    const orgId = request.nextUrl.searchParams.get('orgId');
    if (!orgId) {
      return NextResponse.json({ error: 'Falta orgId' }, { status: 400 });
    }

    const [credits, usage] = await Promise.all([
      commCreditsService.getCreditsStatus(Number(orgId)),
      commCreditsService.getMonthlyUsageSummary(Number(orgId)),
    ]);

    if (!credits) {
      return NextResponse.json(
        { error: 'No se encontraron créditos para esta organización' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      credits,
      monthlyUsage: usage,
    });
  } catch (error) {
    console.error('[API] Error consultando créditos:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
