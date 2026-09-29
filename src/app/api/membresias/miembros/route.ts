/** GET /api/membresias/miembros — personas con membresía. Query: q, estado (todos|con_vigente|sin_vigente), pagina, porPagina. */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigir, listarMiembros } from '@/lib/services/membresias/membresias.server';
import { entero, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/membresias/miembros' });
  const sp = new URL(req.url).searchParams;
  const estado = sp.get('estado');
  return responder(async () => {
    await exigir(ctx, 'ver');
    return listarMiembros(ctx, {
      q: (sp.get('q') ?? '').slice(0, 120),
      estado: estado === 'con_vigente' || estado === 'sin_vigente' ? estado : 'todos',
      pagina: entero(sp.get('pagina')),
      porPagina: entero(sp.get('porPagina')),
    });
  });
});
