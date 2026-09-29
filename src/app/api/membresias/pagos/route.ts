/** GET /api/membresias/pagos — ventas y facturas con líneas membresía. Query: desde, hasta (YYYY-MM-DD), pagina, porPagina. */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigir, listarPagos } from '@/lib/services/membresias/membresias.server';
import { entero, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/membresias/pagos' });
  const sp = new URL(req.url).searchParams;
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  return responder(async () => {
    await exigir(ctx, 'ver');
    return listarPagos(ctx, {
      desde: desde && DIA.test(desde) ? desde : undefined,
      hasta: hasta && DIA.test(hasta) ? hasta : undefined,
      pagina: entero(sp.get('pagina')),
      porPagina: entero(sp.get('porPagina')),
    });
  });
});
