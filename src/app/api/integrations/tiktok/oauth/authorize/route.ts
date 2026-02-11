// ============================================================
// API Route: Generar URL de autorización OAuth de TikTok
// POST /api/integrations/tiktok/oauth/authorize
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { buildTikTokOAuthUrl } from '@/lib/services/integrations/tiktok/tiktokMarketingConfig';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { organization_id } = body;

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id requerido' }, { status: 400 });
    }

    // Codificar estado para pasarlo por el flujo OAuth
    const state = Buffer.from(JSON.stringify({
      organization_id,
      user_id: session.user.id,
      timestamp: Date.now(),
    })).toString('base64');

    const url = buildTikTokOAuthUrl(state);

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Error generando URL OAuth TikTok:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
