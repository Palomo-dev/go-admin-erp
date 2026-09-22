/**
 * API Route: Descargar documentos de Factus (PDF/XML)
 * GET /api/factus/download?type=pdf|xml&invoiceNumber=XXX
 *
 * Credenciales via variables de entorno.
 *
 * SEGURIDAD (2026-09-22): la ruta no pedía sesión ni comprobaba a quién
 * pertenecía `invoiceNumber`, así que cualquiera podía descargar el PDF o el
 * XML DIAN de la factura de otra organización con solo adivinar el número.
 * Ahora: `getServerOrgContext` (sesión + membresía activa) y el número debe
 * corresponder a un documento de ESA organización, comprobado contra
 * `electronic_invoicing_jobs` (número devuelto por Factus) o contra
 * `invoice_sales.number` (consecutivo propio). Sin coincidencia → 404, que no
 * distingue «no existe» de «es de otro»: no se filtra la existencia ajena.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService from '@/lib/services/factusService';

/** ¿El número pertenece a un documento electrónico de esta organización? */
async function belongsToOrg(organizationId: number, invoiceNumber: string): Promise<boolean> {
  const supabase = getServiceClient();

  // 1. Número devuelto por Factus, guardado en el job de la organización.
  const { data: job } = await supabase
    .from('electronic_invoicing_jobs')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('response_payload->data->>number', invoiceNumber)
    .limit(1)
    .maybeSingle();
  if (job) return true;

  // 2. Consecutivo propio de la factura (el fallback que usa la interfaz).
  const { data: invoice } = await supabase
    .from('invoice_sales')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('number', invoiceNumber)
    .limit(1)
    .maybeSingle();
  return Boolean(invoice);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'pdf' | 'xml';
    const invoiceNumber = searchParams.get('invoiceNumber');

    if (!type || !invoiceNumber) {
      return NextResponse.json(
        { error: 'Se requieren type e invoiceNumber' },
        { status: 400 }
      );
    }
    if (type !== 'pdf' && type !== 'xml') {
      return NextResponse.json(
        { error: 'Tipo de documento no válido' },
        { status: 400 }
      );
    }

    if (!(await belongsToOrg(ctx.organizationId, invoiceNumber))) {
      console.warn(
        `[factus/download] Descarga rechazada: la organización ${ctx.organizationId} pidió el documento ${invoiceNumber}, que no es suyo`
      );
      return NextResponse.json(
        { error: 'Documento no encontrado' },
        { status: 404 }
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
    }

    const xmlContent = await factusService.downloadXML(environment, accessToken, invoiceNumber);

    return new NextResponse(xmlContent, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="factura-${invoiceNumber}.xml"`,
      },
    });

  } catch (error: any) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Error descargando documento:', error);
    return NextResponse.json(
      { error: error.message || 'Error descargando documento' },
      { status: 500 }
    );
  }
}
