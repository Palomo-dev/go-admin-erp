/** GET /api/membresias/planes — planes con su producto, precio vigente (product_prices) y membresías vivas. */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigir, listarPlanes } from '@/lib/services/membresias/membresias.server';
import { responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/membresias/planes' });
  return responder(async () => {
    await exigir(ctx, 'ver');
    return listarPlanes(ctx);
  });
});
