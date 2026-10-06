/**
 * POST /api/pos/cocina/item — tocar un ítem en la cocina: hecho (listo) o
 * deshacer. La comanda se deriva en la base (`pos_cocina_marcar_item`).
 */
import { itemComandaSchema } from '@/lib/pos/cocina/rutasCocina';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ejecutarRpcCocina, respuestaOrgError } from '@/lib/pos/cocina/rutaRpcCocina';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/cocina/item';

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    return await ejecutarRpcCocina(ctx, body, {
      ruta: RUTA,
      schema: itemComandaSchema,
      nivel: 'operar',
      rpc: 'pos_cocina_marcar_item',
      args: (ctx, d) => ({ p_organization_id: ctx.organizationId, p_actor: ctx.userId, p_item_id: d.item_id, p_hecho: d.hecho }),
    });
  } catch (err) {
    const r = respuestaOrgError(err);
    if (r) return r;
    throw err;
  }
}
