/**
 * API Route: Descargar documentos de Factus (PDF/XML)
 * GET /api/factus/download?type=pdf|xml&invoiceNumber=XXX
 * 
 * Credenciales via variables de entorno
 */

import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService from '@/lib/services/factusService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'pdf' | 'xml';
    const invoiceNumber = searchParams.get('invoiceNumber');

    if (!type || !invoiceNumber) {
      return NextResponse.json(
        { error: 'Se requieren type e invoiceNumber' },
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
      const pdfBuffer = await factusService.downloadPDF(environment, accessToken, invoiceNumber);
      
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="factura-${invoiceNumber}.pdf"`,
        },
      });
    } else if (type === 'xml') {
      const xmlContent = await factusService.downloadXML(environment, accessToken, invoiceNumber);
      
      return new NextResponse(xmlContent, {
        headers: {
          'Content-Type': 'application/xml',
          'Content-Disposition': `attachment; filename="factura-${invoiceNumber}.xml"`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Tipo de documento no válido' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Error descargando documento:', error);
    return NextResponse.json(
      { error: error.message || 'Error descargando documento' },
      { status: 500 }
    );
  }
}
