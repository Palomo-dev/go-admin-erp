/**
 * API Route: Descargar PDF/XML de Documento Soporte (Factus API v2)
 * GET /api/factus/support-document/download?type=pdf|xml&number=XXX
 *
 * Credenciales via variables de entorno (factusTokenManager)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService from '@/lib/services/factusService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'pdf' | 'xml';
    const number = searchParams.get('number');

    if (!type || !number) {
      return NextResponse.json(
        { error: 'Se requieren type (pdf|xml) y number' },
        { status: 400 }
      );
    }

    const credentials = getCredentials();
    if (!credentials) {
      return NextResponse.json(
        { error: 'Credenciales de Factus no configuradas' },
        { status: 404 }
      );
    }

    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No se pudo obtener token de Factus' },
        { status: 500 }
      );
    }

    const environment = credentials.environment;

    if (type === 'pdf') {
      const pdfBuffer = await factusService.downloadSupportDocumentPDF(
        environment as 'sandbox' | 'production',
        accessToken,
        number
      );

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="documento-soporte-${number}.pdf"`,
        },
      });
    }

    if (type === 'xml') {
      const xmlContent = await factusService.downloadSupportDocumentXML(
        environment as 'sandbox' | 'production',
        accessToken,
        number
      );

      return new NextResponse(xmlContent, {
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `attachment; filename="documento-soporte-${number}.xml"`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Tipo de documento no válido. Use pdf o xml.' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error descargando documento soporte:', error);
    return NextResponse.json(
      { error: error.message || 'Error descargando documento soporte' },
      { status: 500 }
    );
  }
}
