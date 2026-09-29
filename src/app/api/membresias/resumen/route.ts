/** GET /api/membresias/resumen — Resumen del módulo (E1/E2). Requiere memberships.view. */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigir, resumenMembresias } from '@/lib/services/membresias/membresias.server';
import { responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/membresias/resumen' });
  return responder(async () => {
    await exigir(ctx, 'ver');
    return resumenMembresias(ctx);
  });
});
