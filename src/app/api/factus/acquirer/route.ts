/**
 * API Route: Consulta de adquiriente en DIAN via Factus
 * GET /api/factus/acquirer?documentType=13&documentNumber=123456789
 *
 * Devuelve nombre y email del adquiriente desde la base oficial de DIAN.
 * No devuelve telefono, direccion, responsabilidades fiscales, etc.
 *
 * Rate limit: 80 req/min por usuario (gestionado por Factus).
 *
 * Variables de entorno (server-side, nunca expuestas al cliente):
 * - FACTUS_CLIENT_ID, FACTUS_CLIENT_SECRET, FACTUS_USERNAME, FACTUS_PASSWORD
 * - FACTUS_ENVIRONMENT: "sandbox" | "production"
 */

import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService from '@/lib/services/factusService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get('documentType');
    const documentNumber = searchParams.get('documentNumber');

    if (!documentType || typeof documentType !== 'string') {
      return NextResponse.json(
        { success: false, error: 'documentType es requerido (codigo DIAN: 13, 31, 41, etc.)' },
        { status: 400 }
      );
    }

    if (!documentNumber || typeof documentNumber !== 'string') {
      return NextResponse.json(
        { success: false, error: 'documentNumber es requerido' },
        { status: 400 }
      );
    }

    const numeroLimpio = String(documentNumber).replace(/[^0-9]/g, '');
    if (!numeroLimpio || numeroLimpio.length < 4) {
      return NextResponse.json(
        { success: false, error: 'Numero de documento invalido (minimo 4 digitos)' },
        { status: 400 }
      );
    }

    const credentials = getCredentials();
    if (!credentials) {
      return NextResponse.json(
        { success: false, error: 'Credenciales de Factus no configuradas' },
        { status: 500 }
      );
    }

    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'No se pudo obtener token de Factus' },
        { status: 500 }
      );
    }

    const data = await factusService.getAcquirer(
      credentials.environment,
      accessToken,
      documentType,
      numeroLimpio
    );

    return NextResponse.json({
      success: true,
      provider: 'factus',
      fromCache: false,
      data,
    });
  } catch (error: unknown) {
    console.error('Error en /api/factus/acquirer:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';

    // 404 = adquiriente no encontrado, devolver como respuesta normal (no error 500)
    if (message.includes('no encontrado') || message.includes('404')) {
      return NextResponse.json(
        { success: false, error: 'Adquiriente no encontrado en DIAN', provider: 'factus' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
