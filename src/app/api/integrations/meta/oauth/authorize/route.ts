import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { buildMetaOAuthUrl } from '@/lib/services/integrations/meta/metaMarketingConfig';

/**
 * POST /api/integrations/meta/oauth/authorize
 * Genera la URL de autorización OAuth de Facebook.
 * El frontend redirige al usuario a esta URL.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return NextResponse.json(
        { error: 'META_APP_ID y META_APP_SECRET no configurados en el servidor' },
        { status: 500 }
      );
    }

    const { organization_id, connection_id } = await request.json();

    if (!organization_id) {
      return NextResponse.json(
        { error: 'Se requiere organization_id' },
        { status: 400 }
      );
    }

    // State contiene datos que necesitamos en el callback
    const state = JSON.stringify({
      organization_id,
      connection_id: connection_id || '',
      user_id: session.user.id,
      ts: Date.now(),
    });

    // Codificar en base64 para seguridad
    const encodedState = Buffer.from(state).toString('base64');
    const oauthUrl = buildMetaOAuthUrl(encodedState);

    return NextResponse.json({ url: oauthUrl });
  } catch (error) {
    console.error('Error generating Meta OAuth URL:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al generar URL de OAuth' },
      { status: 500 }
    );
  }
}
