/** POST /api/pos/cocina/mover-item — enviar un ítem de la comanda a otra estación. */
import { moverItemSchema } from '@/lib/pos/cocina/rutasCocina';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ejecutarRpcCocina, respuestaOrgError } from '@/lib/pos/cocina/rutaRpcCocina';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/cocina/mover-item';

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    return await ejecutarRpcCocina(ctx, body, {
      ruta: RUTA,
      schema: moverItemSchema,
      nivel: 'gestionar',
      rpc: 'pos_cocina_mover_item',
      args: (ctx, d) => ({ p_organization_id: ctx.organizationId, p_actor: ctx.userId, p_item_id: d.item_id, p_station: d.station }),
    });
  } catch (err) {
    const r = respuestaOrgError(err);
    if (r) return r;
    throw err;
  }
}
