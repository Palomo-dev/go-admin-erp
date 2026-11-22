/**
 * GET /api/pos/propinas/cifras — cifras de la cabecera de Propinas
 * (`fn_propinas_cifras`): por liquidar, liquidado en el mes de la
 * organización, propina promedio, ventas con propina, resumen por persona y
 * contadores de las pestañas. Query: desde, hasta, sucursal.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { cifrasPropinas } from '@/lib/pos/propinas/propinasServidor';
import { SIN_CACHE, consultaDe, puedeVerPropinas, respuestaErrorPropinas, sinPermiso } from '@/lib/pos/propinas/respuestas';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  if (!(await puedeVerPropinas(ctx))) return sinPermiso();
  try {
    return NextResponse.json(await cifrasPropinas(ctx, consultaDe(req)), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorPropinas(err, 'GET /api/pos/propinas/cifras', ctx.organizationId);
  }
});
