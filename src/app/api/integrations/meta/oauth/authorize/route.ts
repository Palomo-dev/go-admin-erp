import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import { getProjectRef } from '@/lib/supabase/config';
import { buildMetaOAuthUrl } from '@/lib/services/integrations/meta/metaMarketingConfig';

/**
 * Obtiene el user_id (sub) decodificando el JWT de la cookie de sesión.
 * GO Admin guarda la sesión como cookie JSON propia `sb-<ref>-auth-token`,
 * por lo que se decodifica el access_token igual que en el middleware.
 */
function getUserIdFromCookies(
  cookieStore: { get: (name: string) => { value: string } | undefined }
): string | null {
  const projectRef = getProjectRef();
  const cookieNames = [`sb-${projectRef}-auth-token`, 'sb-auth-token', 'supabase-auth-token'];

  for (const name of cookieNames) {
    let value = cookieStore.get(name)?.value;

    // Supabase puede dividir cookies grandes en chunks: .0, .1, .2...
    if (!value) {
      const chunk0 = cookieStore.get(`${name}.0`)?.value;
      if (chunk0) {
        value = chunk0;
        let i = 1;
        let chunk = cookieStore.get(`${name}.${i}`)?.value;
        while (chunk) {
          value += chunk;
          i++;
          chunk = cookieStore.get(`${name}.${i}`)?.value;
        }
      }
    }

    if (!value || !value.trim().startsWith('{')) continue;

    try {
      const data = JSON.parse(value);
      const accessToken = data.access_token;
      if (!accessToken) continue;
      const payload = decodeJwt(accessToken);
      if (payload.sub) return payload.sub as string;
    } catch {
      // Cookie corrupta o token inválido: probar el siguiente nombre
    }
  }

  return null;
}

/**
 * POST /api/integrations/meta/oauth/authorize
 * Genera la URL de autorización OAuth de Facebook.
 * El frontend redirige al usuario a esta URL.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = getUserIdFromCookies(cookieStore);

    if (!userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return NextResponse.json(
        { error: 'META_APP_ID y META_APP_SECRET no configurados en el servidor' },
        { status: 500 }
      );
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL no configurado en el servidor' },
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
      user_id: userId,
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
