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
import factusService from '@/lib/services/factusService';

// Cache de token en memoria (para evitar autenticaciones repetidas)
let tokenCache: {
  accessToken: string;
  expiresAt: Date;
} | null = null;

function getFactusCredentials() {
  const clientId = process.env.FACTUS_CLIENT_ID;
  const clientSecret = process.env.FACTUS_CLIENT_SECRET;
  const username = process.env.FACTUS_USERNAME;
  const password = process.env.FACTUS_PASSWORD;
  const environment = (process.env.FACTUS_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

  if (!clientId || !clientSecret || !username || !password) {
    return null;
  }

  return { clientId, clientSecret, username, password, environment };
}

export async function POST(request: NextRequest) {
  try {
    const credentials = getFactusCredentials();

    if (!credentials) {
      return NextResponse.json(
        { error: 'Credenciales de Factus no configuradas. Configure las variables de entorno.' },
        { status: 404 }
      );
    }

    // Verificar si el token en cache es válido
    if (tokenCache && tokenCache.expiresAt > new Date()) {
      return NextResponse.json({
        success: true,
        accessToken: tokenCache.accessToken,
        expiresAt: tokenCache.expiresAt.toISOString(),
        fromCache: true,
      });
    }

    // Autenticar con Factus
    const token = await factusService.authenticate(credentials);

    // Guardar en cache
    tokenCache = {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    };

    return NextResponse.json({
      success: true,
      accessToken: token.accessToken,
      expiresAt: token.expiresAt.toISOString(),
      fromCache: false,
    });

  } catch (error: any) {
    console.error('Error en autenticación Factus:', error);
    return NextResponse.json(
      { error: error.message || 'Error de autenticación' },
      { status: 500 }
    );
  }
}
