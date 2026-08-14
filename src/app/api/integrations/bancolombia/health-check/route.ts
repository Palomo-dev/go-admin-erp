// ============================================================
// POST /api/integrations/bancolombia/health-check
// Verifica que las credenciales de Bancolombia sean validas
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { bancolombiaService } from '@/lib/services/integrations/bancolombia';

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticacion
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { connectionId } = await request.json();
    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId es requerido' },
        { status: 400 }
      );
    }

    const result = await bancolombiaService.healthCheck(connectionId);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[API Bancolombia Health] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
