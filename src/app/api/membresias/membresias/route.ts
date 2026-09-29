/**
 * GET /api/membresias/membresias — listado de membresías (contratos) con conteo por estado.
 * Query: q, estado (todas|activa|en_gracia|congelada|pendiente|vencida|cancelada|por_vencer),
 * plan, cliente, pagina, porPagina. Requiere memberships.view.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigir, listarMembresias } from '@/lib/services/membresias/membresias.server';
import { entero, responder } from '@/lib/services/membresias/respuestaHttp';
import type { FiltroEstado } from '@/lib/services/membresias/tipos';

export const dynamic = 'force-dynamic';

const ESTADOS: FiltroEstado[] = ['todas', 'activa', 'en_gracia', 'congelada', 'pendiente', 'vencida', 'cancelada', 'por_vencer'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/membresias/membresias' });
  const sp = new URL(req.url).searchParams;
  const estado = sp.get('estado') as FiltroEstado | null;
  const cliente = sp.get('cliente');
  return responder(async () => {
    await exigir(ctx, 'ver');
    return listarMembresias(ctx, {
      q: (sp.get('q') ?? '').slice(0, 120),
      estado: estado && ESTADOS.includes(estado) ? estado : 'todas',
      planId: entero(sp.get('plan')),
      clienteId: cliente && UUID_RE.test(cliente) ? cliente : undefined,
      pagina: entero(sp.get('pagina')),
      porPagina: entero(sp.get('porPagina')),
    });
  });
});
