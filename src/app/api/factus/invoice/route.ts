/**
 * API Route: enviar una factura de venta a la DIAN (vía Factus)
 * POST /api/factus/invoice   Body: { invoiceId }
 *
 * Requiere sesión y membresía activa (`withOrg`; el middleware no cubre
 * /api/factus/). La organización sale de la sesión: un organizationId ajeno
 * en el body o la query → 403.
 *
 * Ya no envía por su cuenta: encola el documento (un solo job por factura) e
 * intenta enviarlo en el momento por el MISMO camino que usa el cron
 * (`colaFacturacion`). Si el servicio de facturación electrónica de la
 * organización no está activo, la factura queda en cola, retenida, y la
 * respuesta lo dice (202).
 */

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { encolarDocumento, procesarAhora } from '@/lib/services/einvoicing/colaFacturacion.server';
import { respuestaDeEnvio } from '@/lib/services/einvoicing/respuestaRuta';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ invoiceId?: string }>(ctx, request, { route: 'factus/invoice' });
    const invoiceId = typeof body?.invoiceId === 'string' ? body.invoiceId : null;
    if (!invoiceId) {
      return NextResponse.json({ error: 'Se requiere invoiceId' }, { status: 400 });
    }

    // La factura tiene que ser de la organización de la sesión (RLS + filtro explícito).
    const { data: factura } = await ctx.supabase
      .from('invoice_sales')
      .select('id, document_type')
      .eq('id', invoiceId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (!factura) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }
    if (factura.document_type && factura.document_type !== 'invoice') {
      return NextResponse.json({ error: 'El documento no es una factura de venta' }, { status: 400 });
    }

    const { job, servicioActivo } = await encolarDocumento({
      organizationId: ctx.organizationId,
      documentType: 'invoice',
      invoiceId,
    });
    const resultado = servicioActivo ? await procesarAhora(job.id) : null;
    return respuestaDeEnvio(job, resultado, servicioActivo);
  } catch (error: unknown) {
    if (error instanceof OrgContextError) throw error;
    console.error('[factus/invoice] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudo encolar la factura electrónica' }, { status: 500 });
  }
});
