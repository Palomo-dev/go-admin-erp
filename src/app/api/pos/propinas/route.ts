/**
 * GET /api/pos/propinas — listado de propinas paginado en el servidor
 * (`fn_propinas_listado`). Query: vista (por_liquidar · liquidadas · anuladas ·
 * todas), q, tipo, persona, desde, hasta (días de la organización), orden,
 * dir, pagina, tamano, sucursal. La organización es la de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { listarPropinas } from '@/lib/pos/propinas/propinasServidor';
import { SIN_CACHE, consultaDe, puedeVerPropinas, respuestaErrorPropinas, sinPermiso } from '@/lib/pos/propinas/respuestas';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  if (!(await puedeVerPropinas(ctx))) return sinPermiso();
  try {
    return NextResponse.json(await listarPropinas(ctx, consultaDe(req)), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorPropinas(err, 'GET /api/pos/propinas', ctx.organizationId);
  }
});
