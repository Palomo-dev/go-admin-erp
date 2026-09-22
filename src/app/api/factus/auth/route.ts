/**
 * API Route: Autenticación Factus
 * POST /api/factus/auth
 *
 * Credenciales via variables de entorno:
 * - FACTUS_CLIENT_ID
 * - FACTUS_CLIENT_SECRET
 * - FACTUS_USERNAME
 * - FACTUS_PASSWORD
 * - FACTUS_ENVIRONMENT (sandbox | production)
 *
 * SEGURIDAD (2026-09-22): esta ruta devolvía el `accessToken` de Factus a
 * cualquiera que hiciera POST, sin sesión. Con ese bearer se puede emitir y
 * consultar documentos electrónicos en nombre de la empresa ante la DIAN.
 * Ahora: exige sesión y pertenencia a una organización (`getServerOrgContext`)
 * y **no devuelve el token**. Su único consumidor es
 * `electronicInvoicingConfigService.testConnection`, que solo mira `ok`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';

export async function POST(request: NextRequest) {
  try {
    await getServerOrgContext(request);

    const credentials = getCredentials();

    if (!credentials) {
      return NextResponse.json(
        { error: 'Credenciales de Factus no configuradas. Configure las variables de entorno.' },
        { status: 404 }
      );
    }

    // El token se queda en el servidor: al cliente solo le interesa si la
    // conexión con Factus funciona.
    const accessToken = await getValidToken();
    if (accessToken) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Error de autenticación con Factus' },
      { status: 500 }
    );

  } catch (error: any) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Error en autenticación Factus:', error);
    return NextResponse.json(
      { error: error.message || 'Error de autenticación' },
      { status: 500 }
    );
  }
}
