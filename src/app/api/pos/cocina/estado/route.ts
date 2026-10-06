/**
 * POST /api/pos/cocina/estado — Empezar / Marcar lista / Entregar / Devolver a
 * «Nuevas» una comanda, de una estación (`station`) o de todas (null).
 * El estado de la comanda lo deriva la base de sus ítems
 * (`pos_cocina_cambiar_estado`). Devolver exige gestionar la cocina.
 */
import { estadoComandaSchema } from '@/lib/pos/cocina/rutasCocina';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ejecutarRpcCocina, respuestaOrgError } from '@/lib/pos/cocina/rutaRpcCocina';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/cocina/estado';

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    return await ejecutarRpcCocina(ctx, body, {
      ruta: RUTA,
      schema: estadoComandaSchema,
      nivel: (d) => (d.estado === 'new' ? 'gestionar' : 'operar'),
      rpc: 'pos_cocina_cambiar_estado',
      args: (ctx, d) => ({
        p_organization_id: ctx.organizationId,
        p_actor: ctx.userId,
        p_ticket_id: d.ticket_id,
        p_station: d.station ?? null,
        p_estado: d.estado,
        p_motivo: d.motivo ?? null,
      }),
    });
  } catch (err) {
    const r = respuestaOrgError(err);
    if (r) return r;
    throw err;
  }
}
