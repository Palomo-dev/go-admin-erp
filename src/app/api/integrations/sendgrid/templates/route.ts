// ============================================================
// GET /api/integrations/sendgrid/templates
// Lista los Dynamic Templates de SendGrid
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendgridService } from '@/lib/services/integrations/sendgrid/sendgridService';

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
    const connectionId = searchParams.get('connection_id');
    const organizationId = searchParams.get('organization_id');

    if (!connectionId && !organizationId) {
      return NextResponse.json(
        { error: 'Se requiere connection_id o organization_id' },
        { status: 400 }
      );
    }

    // Obtener credenciales
    let credentials;
    if (connectionId) {
      credentials = await sendgridService.getCredentials(connectionId);
    } else if (organizationId) {
      const result = await sendgridService.getCredentialsByOrganization(
        parseInt(organizationId, 10)
      );
      credentials = result.credentials;
    }

    if (!credentials) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de SendGrid' },
        { status: 404 }
      );
    }

    const templates = await sendgridService.getTemplates(credentials, 'dynamic', 50);

    return NextResponse.json({
      success: true,
      templates,
      count: templates.length,
    });
  } catch (err) {
    console.error('[API SendGrid Templates] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
