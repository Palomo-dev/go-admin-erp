/**
 * API Route: Descargar documentos de Factus (PDF/XML)
 * GET /api/factus/download?type=pdf|xml&invoiceId=<uuid de invoice_sales>
 *
 * Credenciales: la cuenta de Factus de la ORGANIZACIÓN (Vault; las carga la
 * plataforma). Las `FACTUS_*` del entorno solo sirven en desarrollo.
 *
 * SEGURIDAD
 * - 2026-09-22: la ruta no pedía sesión ni comprobaba a quién pertenecía
 *   `invoiceNumber`. Se añadió `getServerOrgContext` y una comprobación por
 *   número.
 * - 2026-09-23 (GO-sec, auditoría de integraciones §3.4): la comprobación por
 *   número no basta. Los rangos de numeración de Factus son de la cuenta
 *   compartida, así que el consecutivo interno de una organización puede
 *   coincidir con el número DIAN de un documento de otra; y el número guardado
 *   en `electronic_invoicing_jobs.response_payload` lo puede escribir el propio
 *   cliente (la RLS de esa tabla admite escritura a cualquier miembro). Ahora
 *   la ruta pide la FACTURA (`invoiceId`), comprueba en BD que es de la
 *   organización de la sesión y pregunta a Factus el número por el
 *   `reference_code` que el servidor deriva del id de esa factura
 *   (`INV-` + 8 primeros hex, el mismo que usa `/api/factus/invoice`). El número
 *   que se descarga sale de Factus, nunca del cliente. Sin coincidencia → 404,
 *   que no distingue «no existe» de «es de otro».
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import factusService from '@/lib/services/factusService';
import { obtenerAccesoFactus } from '@/lib/services/einvoicing/accesoFactus.server';

const RUTA = 'factus/download';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `reference_code` con que la cola envió la factura a Factus: el guardado en
 * la factura (lo escribe la cola al enviarla) o, para las enviadas antes de
 * la cola, `INV-` + 8 primeros hex del id.
 */
function referenciaFactusDeFactura(invoiceId: string, guardada: string | null | undefined): string {
  return guardada && guardada.trim() !== '' ? guardada : `INV-${invoiceId.substring(0, 8)}`;
}

/** Número DIAN que devuelve Factus para una referencia (v2 lo anida en `bill`). */
function numeroDesdeFactus(respuesta: unknown, referencia: string): string | null {
  const data = (respuesta as { data?: Record<string, unknown> } | null)?.data;
  if (!data) return null;
  const bill = (data.bill as Record<string, unknown> | undefined) ?? data;
  const ref = bill.reference_code;
  if (typeof ref === 'string' && ref !== referencia) return null;
  const numero = bill.number;
  return typeof numero === 'string' && numero.trim() !== '' ? numero : null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const invoiceId = searchParams.get('invoiceId');

    if (!type || !invoiceId) {
      return NextResponse.json(
        { error: 'Se requieren type e invoiceId' },
        { status: 400 }
      );
    }
    if (type !== 'pdf' && type !== 'xml') {
      return NextResponse.json(
        { error: 'Tipo de documento no válido' },
        { status: 400 }
      );
    }
    if (!UUID_RE.test(invoiceId)) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    // 1. La factura es de la organización de la sesión (cliente de sesión + filtro explícito).
    const { data: factura, error: errorFactura } = await ctx.supabase
      .from('invoice_sales')
      .select('id, reference_code')
      .eq('id', invoiceId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (errorFactura || !factura) {
      console.warn(`[${RUTA}] Descarga rechazada: la factura pedida no es de la organización de la sesión`, {
        organizationId: ctx.organizationId,
      });
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    // Cuenta de Factus de la organización (la demo del entorno solo en desarrollo).
    const { environment, accessToken } = await obtenerAccesoFactus(ctx.organizationId, { permitirDemoDesarrollo: true });

    // 2. El número DIAN lo dice Factus para la referencia de la factura.
    const referencia = referenciaFactusDeFactura(
      factura.id as string,
      (factura as { reference_code?: string | null }).reference_code,
    );
    let invoiceNumber: string | null = null;
    try {
      const consulta = await factusService.getInvoiceByReference(environment, accessToken, referencia);
      invoiceNumber = numeroDesdeFactus(consulta, referencia);
    } catch {
      invoiceNumber = null;
    }
    if (!invoiceNumber) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

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
  } catch (error: unknown) {
    return routeErrorResponse('Factus download GET', error);
  }
}
