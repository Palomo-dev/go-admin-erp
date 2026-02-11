// ============================================================
// GET /api/integrations/wompi/institutions?connectionId=xxx
// Proxy para obtener instituciones financieras PSE
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { wompiService } from '@/lib/services/integrations/wompi/wompiService';

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticación
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const connectionId = request.nextUrl.searchParams.get('connectionId');
    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    const credentials = await wompiService.getCredentials(connectionId);
    if (!credentials) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales' },
        { status: 404 }
      );
    }

    const result = await wompiService.getPSEInstitutions(credentials);
    if (!result) {
      return NextResponse.json(
        { error: 'Error obteniendo instituciones PSE' },
        { status: 502 }
      );
    }

    return NextResponse.json({ institutions: result.data });
  } catch (err) {
    console.error('[API Wompi PSE] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
