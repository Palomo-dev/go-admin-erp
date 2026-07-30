import { NextResponse } from 'next/server';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService from '@/lib/services/factusService';

export async function GET() {
  try {
    const credentials = getCredentials();
    if (!credentials) {
      return NextResponse.json(
        { error: 'Credenciales de Factus no configuradas. Configure las variables de entorno o la configuración de la organización.' },
        { status: 404 }
      );
    }

    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Error de autenticación con Factus' },
        { status: 500 }
      );
    }

    // Usar directamente fetch para ver la respuesta cruda de Factus
    const baseUrl = credentials.environment === 'sandbox'
      ? 'https://api-sandbox.factus.com.co'
      : 'https://api.factus.com.co';

    const factusRes = await fetch(`${baseUrl}/v2/numbering-ranges`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const rawText = await factusRes.text();
    console.log('[numbering-ranges] Factus response status:', factusRes.status);
    console.log('[numbering-ranges] Factus raw response:', rawText.substring(0, 1000));

    if (!factusRes.ok) {
      return NextResponse.json(
        { error: `Factus respondió ${factusRes.status}: ${rawText.substring(0, 500)}` },
        { status: 500 }
      );
    }

    const result = JSON.parse(rawText);
    const ranges = result.data?.data || result.data || [];

    return NextResponse.json({
      success: true,
      data: ranges,
      raw: result,
    });
  } catch (error: any) {
    console.error('Error al obtener rangos de numeración:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener rangos de numeración' },
      { status: 500 }
    );
  }
}
