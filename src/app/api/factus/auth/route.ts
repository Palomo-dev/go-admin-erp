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
 */

import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';

export async function POST(request: NextRequest) {
  try {
    const credentials = getCredentials();

    if (!credentials) {
      return NextResponse.json(
        { error: 'Credenciales de Factus no configuradas. Configure las variables de entorno.' },
        { status: 404 }
      );
    }

    // Verificar si el token en cache es válido (el token manager lo gestiona)
    const accessToken = await getValidToken();
    if (accessToken) {
      return NextResponse.json({
        success: true,
        accessToken,
        fromCache: true,
      });
    }

    // Si getValidToken falló, retornar error
    return NextResponse.json(
      { error: 'Error de autenticación con Factus' },
      { status: 500 }
    );

  } catch (error: any) {
    console.error('Error en autenticación Factus:', error);
    return NextResponse.json(
      { error: error.message || 'Error de autenticación' },
      { status: 500 }
    );
  }
}
