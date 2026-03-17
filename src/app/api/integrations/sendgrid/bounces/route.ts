// ============================================================
// GET /api/integrations/sendgrid/bounces
// Obtiene la lista de bounces (emails rebotados) de SendGrid
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
    const limit = Number(searchParams.get('limit') || '50');

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

    const bounces = await sendgridService.getBounces(credentials, limit);

    return NextResponse.json({ success: true, bounces });
  } catch (err) {
    console.error('[API SendGrid Bounces] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
