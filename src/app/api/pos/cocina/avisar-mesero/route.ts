/**
 * POST /api/pos/cocina/avisar-mesero — «Avisar al mesero»: aviso en la campana
 * del mesero de la mesa (idempotente por minuto en la base).
 */
import { avisarMeseroSchema } from '@/lib/pos/cocina/rutasCocina';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ejecutarRpcCocina, respuestaOrgError } from '@/lib/pos/cocina/rutaRpcCocina';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/cocina/avisar-mesero';

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    return await ejecutarRpcCocina(ctx, body, {
      ruta: RUTA,
      schema: avisarMeseroSchema,
      nivel: 'operar',
      rpc: 'pos_cocina_avisar_mesero',
      args: (ctx, d) => ({ p_organization_id: ctx.organizationId, p_actor: ctx.userId, p_ticket_id: d.ticket_id }),
    });
  } catch (err) {
    const r = respuestaOrgError(err);
    if (r) return r;
    throw err;
  }
}
