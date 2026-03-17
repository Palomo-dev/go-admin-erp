// ============================================================
// GET /api/integrations/sendgrid/stats
// Obtiene estadísticas de envío de SendGrid
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendgridService } from '@/lib/services/integrations/sendgrid';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');
    const organizationId = searchParams.get('organizationId');
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD
    const endDate = searchParams.get('endDate'); // YYYY-MM-DD

    let credentials;

    if (connectionId) {
      credentials = await sendgridService.getCredentials(connectionId);
    } else if (organizationId) {
      const result = await sendgridService.getCredentialsByOrganization(
        Number(organizationId)
      );
      credentials = result.credentials;
    }

    if (!credentials) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de SendGrid' },
        { status: 404 }
      );
    }

    // Default: últimos 7 días si no se especifican fechas
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 7);
    const start = startDate || defaultStart.toISOString().split('T')[0];

    const stats = await sendgridService.getStats(
      credentials,
      start,
      endDate || undefined
    );

    return NextResponse.json({ success: true, stats });
  } catch (err) {
    console.error('[API SendGrid Stats] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
