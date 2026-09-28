/**
 * POST /api/facturas-venta/[id]/pdf — compatibilidad.
 *
 * Antes: generaba el PDF con los datos del cuerpo y lo subía con `upsert` al
 * bucket PÚBLICO `invoices` (`facturas-venta/<id>.pdf`), cuya URL era el QR
 * impreso. Desde la fase 2 no queda ninguna pantalla que la llame
 * (`PDFService.printInvoiceHTML` usa el motor), pero la ruta se conserva para
 * clientes viejos con el mismo contrato de respuesta (`{ url }`):
 *
 * - Sesión y organización (`getServerOrgContext`); el cuerpo se lee solo para
 *   rechazar una organización ajena (403) y se IGNORA.
 * - El documento lo arma el motor único desde la base (`armarDocumento`), con
 *   permiso, moneda, zona horaria y escape de HTML.
 * - La copia va al bucket privado, en `<organización>/factura-venta/<id>.pdf`,
 *   y la respuesta es una URL FIRMADA de 5 minutos. Nada público.
 */

import { getServerOrgContext, readOrgBody } from '@/lib/utils/orgContext';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { armarDocumento } from '@/lib/documents/server/motor';
import { ErrorPdfNoDisponible, generarPdf } from '@/lib/documents/server/pdf';
import { guardarCopiaPrivada } from '@/lib/documents/server/almacen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request, { route: 'POST /api/facturas-venta/[id]/pdf' });
    const { id } = await params;

    const { html, payload } = await armarDocumento(ctx, { tipo: 'factura-venta', id: String(id ?? ''), papel: 'carta', idioma: 'es' });
    const pdf = await generarPdf(html, 'carta');
    const copia = await guardarCopiaPrivada(ctx.organizationId, payload.tipo, String(id), pdf);

    return new Response(JSON.stringify({ url: copia.urlFirmada, expiresIn: copia.expiraEnSegundos }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    if (err instanceof ErrorPdfNoDisponible) {
      return new Response(JSON.stringify({ error: 'La generación de PDF no está disponible en este momento', code: 'PDF_NO_DISPONIBLE' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
      });
    }
    return routeErrorResponse('facturas-venta/pdf', err);
  }
}
