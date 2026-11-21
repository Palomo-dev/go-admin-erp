/**
 * GET /api/pos/propinas/caja?sucursal= — la caja abierta en la que saldría el
 * efectivo de una liquidación (misma regla del cobro, `fn_caja_abierta_para`)
 * y su efectivo esperado con la máscara del cierre ciego. `{ caja: null }` si
 * no hay caja abierta.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { cajaAbiertaPropinas, sucursalDe } from '@/lib/pos/propinas/propinasServidor';
import { SIN_CACHE, consultaDe, puedeVerPropinas, respuestaErrorPropinas, sinPermiso } from '@/lib/pos/propinas/respuestas';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  if (!(await puedeVerPropinas(ctx))) return sinPermiso();
  try {
    return NextResponse.json({ caja: await cajaAbiertaPropinas(ctx, sucursalDe(consultaDe(req))) }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorPropinas(err, 'GET /api/pos/propinas/caja', ctx.organizationId);
  }
});
