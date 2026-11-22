/**
 * /api/pos/devoluciones/[id]/anular — «Anular devolución» (Figma 873:573997).
 *
 * - GET: el diagnóstico que elige el diálogo (`fn_devolucion_anulacion_estado`):
 *   estado de la nota crédito ante la DIAN, periodos (original y hoy), caja
 *   abierta, asientos a reversar y lo que bloquea.
 * - POST `{ motivo, fecha_espejo, confirmar_saldo_usado, mercancia_vuelve }`: la anulación en una
 *   transacción (`fn_devolucion_anular`).
 *
 * La organización sale de la sesión (`withOrg`); si el body trae otra, 403 y
 * se registra (`readOrgBody`). Cliente de la sesión: el permiso (pos.void) y
 * la sucursal los comprueba la base.
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { anularDevolucion, diagnosticoAnulacion, ErrorAnulacionDevolucion } from '@/lib/pos/devoluciones/anularDevolucionServidor';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

function idDe(params: Record<string, string | string[] | undefined>): string {
  return typeof params.id === 'string' ? params.id : '';
}

function respuestaError(err: ErrorAnulacionDevolucion, contexto: Record<string, unknown>) {
  if (err.status >= 500) console.error('[pos/devoluciones/[id]/anular]', { ...contexto, message: err.message });
  return NextResponse.json(
    { error: err.status >= 500 ? 'No se pudo anular la devolución' : err.codigo, codigo: err.codigo },
    { status: err.status, headers: SIN_CACHE },
  );
}

export const GET = withOrg(async (ctx, _req, routeParams) => {
  const id = idDe(routeParams ? await routeParams.params : {});
  try {
    const diagnostico = await diagnosticoAnulacion(ctx, id);
    return NextResponse.json(diagnostico, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnulacionDevolucion) return respuestaError(err, { id, organizationId: ctx.organizationId, paso: 'diagnostico' });
    throw err;
  }
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = idDe(routeParams ? await routeParams.params : {});
  const cuerpo = await readOrgBody<unknown>(ctx, req);
  try {
    const resultado = await anularDevolucion(ctx, id, cuerpo);
    return NextResponse.json(resultado, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnulacionDevolucion) return respuestaError(err, { id, organizationId: ctx.organizationId, paso: 'anular' });
    throw err;
  }
});
