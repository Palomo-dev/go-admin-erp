/**
 * API Route: enviar una nota crédito a la DIAN (vía Factus)
 * POST /api/factus/credit-note
 * Body: { invoiceId: <id de la nota crédito en invoice_sales>, reason, correctionConceptCode? }
 *
 * La organización sale de la sesión (el middleware no cubre /api/factus/): un
 * organizationId ajeno en el body o la query → 403.
 *
 * Encola la nota y la envía por la cola (`colaFacturacion`), con el payload v2
 * de Factus: concepto de corrección, número DIAN de la factura, cliente y
 * pagos. El CUFE/CUDE, el número y el QR quedan en las columnas reales
 * (`xml_uuid`, `einvoice_number`, `einvoice_qr`, `einvoice_status`). Los
 * `items` del body ya no se aceptan: las líneas salen de la nota guardada.
 */

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { encolarDocumento, procesarAhora } from '@/lib/services/einvoicing/colaFacturacion.server';
import { CONCEPTOS_NOTA_CREDITO } from '@/lib/services/einvoicing/payloadsFactus';
import { respuestaDeEnvio } from '@/lib/services/einvoicing/respuestaRuta';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<{ invoiceId?: string; reason?: string; correctionConceptCode?: string }>(ctx, request, {
      route: 'factus/credit-note',
    });
    const notaId = typeof body?.invoiceId === 'string' ? body.invoiceId : null;
    const motivo = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!notaId || !motivo) {
      return NextResponse.json({ error: 'Se requieren invoiceId y reason' }, { status: 400 });
    }
    const concepto = body?.correctionConceptCode;
    if (concepto !== undefined && !(CONCEPTOS_NOTA_CREDITO as readonly string[]).includes(String(concepto))) {
      return NextResponse.json({ error: 'correctionConceptCode debe ser 1, 2, 3, 4 o 5' }, { status: 400 });
    }

    const { data: nota } = await ctx.supabase
      .from('invoice_sales')
      .select('id, document_type, related_invoice_id')
      .eq('id', notaId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (!nota || nota.document_type !== 'credit_note') {
      return NextResponse.json({ error: 'Nota de crédito no encontrada' }, { status: 404 });
    }
    if (!nota.related_invoice_id) {
      return NextResponse.json({ error: 'La nota de crédito no tiene factura original relacionada' }, { status: 400 });
    }

    const { job, servicioActivo } = await encolarDocumento({
      organizationId: ctx.organizationId,
      documentType: 'credit_note',
      invoiceId: notaId,
      opciones: { observacion: motivo.slice(0, 250), ...(concepto ? { concepto: String(concepto) } : {}) },
    });
    const resultado = servicioActivo ? await procesarAhora(job.id) : null;
    return respuestaDeEnvio(job, resultado, servicioActivo);
  } catch (error: unknown) {
    if (error instanceof OrgContextError) throw error;
    console.error('[factus/credit-note] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudo encolar la nota crédito' }, { status: 500 });
  }
});
