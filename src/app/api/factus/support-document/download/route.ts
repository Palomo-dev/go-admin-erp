/**
 * API Route: Descargar PDF/XML de Documento Soporte (Factus API v2)
 * GET /api/factus/support-document/download?type=pdf|xml&number=XXX
 *
 * Credenciales via variables de entorno (factusTokenManager)
 */

import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { NextRequest, NextResponse } from 'next/server';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService from '@/lib/services/factusService';

export async function GET(request: NextRequest) {
  try {
    // /api/factus está fuera del middleware: sin esta guarda, cualquiera en
    // internet usaba la cuenta de Factus de la plataforma.
    let ctx: Awaited<ReturnType<typeof getServerOrgContext>>;
    try {
      ctx = await getServerOrgContext(request);
    } catch (err) {
      if (err instanceof OrgContextError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
      }
      throw err;
    }
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'pdf' | 'xml';
    const number = searchParams.get('number');

    if (!type || !number) {
      return NextResponse.json(
        { error: 'Se requieren type (pdf|xml) y number' },
        { status: 400 }
      );
    }

    // El número llega en la URL: solo se descarga si el documento soporte es
    // de la organización de la sesión (antes se descargaba cualquier número).
    const { data: propio, error: errorPropio } = await ctx.supabase
      .from('support_documents')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('number', number)
      .maybeSingle();
    if (errorPropio) throw errorPropio;
    if (!propio) {
      return NextResponse.json({ error: 'Documento soporte no encontrado' }, { status: 404 });
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
  } catch (error: unknown) {
    console.error('Error descargando documento soporte:', error);
    return NextResponse.json(
      { error: (error instanceof Error && error.message) || 'Error descargando documento soporte' },
      { status: 500 }
    );
  }
}
