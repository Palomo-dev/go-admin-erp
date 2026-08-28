// ============================================================
// GET /api/integrations/credential-rotation
// Retorna el estado de rotacion de todas las credenciales QR
// de una organizacion. Query param: ?organizationId=xxx
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import {
  checkAllCredentialsExpiry,
  generateRotationAlert,
  type CredentialExpiry,
  type RotationAlert,
} from '@/lib/services/integrations/qrShared/credentialRotation';

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticacion
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Leer query params
    const { searchParams } = new URL(request.url);
    const organizationIdParam = searchParams.get('organizationId');

    if (!organizationIdParam) {
      return NextResponse.json(
        { error: 'Falta el parametro organizationId' },
        { status: 400 },
      );
    }

    const organizationId = parseInt(organizationIdParam, 10);
    if (Number.isNaN(organizationId)) {
      return NextResponse.json(
        { error: 'organizationId debe ser un numero valido' },
        { status: 400 },
      );
    }

    // Verificar todas las credenciales de la organizacion
    const credentials: CredentialExpiry[] = await checkAllCredentialsExpiry(
      organizationId,
    );

    // Generar alertas para credenciales que requieren atencion
    const alerts: RotationAlert[] = [];
    for (const cred of credentials) {
      if (cred.severity === 'none') {
        continue;
      }

      const daysOverdue = cred.needsRotation
        ? Math.abs(cred.daysUntilRotation)
        : -cred.daysUntilRotation;

      alerts.push(
        generateRotationAlert(cred.provider, cred.connectionId, daysOverdue),
      );
    }

    return NextResponse.json({
      credentials,
      alerts,
      summary: {
        total: credentials.length,
        needsRotation: credentials.filter((c) => c.needsRotation).length,
        upcoming: credentials.filter(
          (c) => c.severity === 'medium' && !c.needsRotation,
        ).length,
        healthy: credentials.filter((c) => c.severity === 'none').length,
      },
    });
  } catch (err) {
    console.error('[API Credential Rotation] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
