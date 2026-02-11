import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { metaMarketingService } from '@/lib/services/integrations/meta';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { access_token, app_secret } = body as {
      access_token: string;
      app_secret: string;
    };

    if (!access_token) {
      return NextResponse.json({ error: 'access_token es requerido' }, { status: 400 });
    }

    const result = await metaMarketingService.healthCheck(
      access_token,
      app_secret || ''
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in Meta health check:', error);
    return NextResponse.json(
      { valid: false, message: error instanceof Error ? error.message : 'Error al verificar' },
      { status: 500 }
    );
  }
}
