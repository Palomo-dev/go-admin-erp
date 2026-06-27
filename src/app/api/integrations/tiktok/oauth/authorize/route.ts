// ============================================================
// API Route: Generar URL de autorización OAuth de TikTok
// POST /api/integrations/tiktok/oauth/authorize
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import { getProjectRef } from '@/lib/supabase/config';
import { buildTikTokOAuthUrl } from '@/lib/services/integrations/tiktok/tiktokMarketingConfig';

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

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = getUserIdFromCookies(cookieStore);

    if (!userId) {
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
      user_id: userId,
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
