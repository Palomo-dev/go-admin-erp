/**
 * POST /api/pos/cocina/cancelar — cancelar una comanda con motivo (la venta no
 * cambia; para quitar productos de la cuenta está la comanda de ajuste).
 */
import { cancelarComandaSchema } from '@/lib/pos/cocina/rutasCocina';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ejecutarRpcCocina, respuestaOrgError } from '@/lib/pos/cocina/rutaRpcCocina';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/cocina/cancelar';

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    return await ejecutarRpcCocina(ctx, body, {
      ruta: RUTA,
      schema: cancelarComandaSchema,
      nivel: 'gestionar',
      rpc: 'pos_cocina_cancelar',
      args: (ctx, d) => ({ p_organization_id: ctx.organizationId, p_actor: ctx.userId, p_ticket_id: d.ticket_id, p_motivo: d.motivo }),
    });
  } catch (err) {
    const r = respuestaOrgError(err);
    if (r) return r;
    throw err;
  }
}
