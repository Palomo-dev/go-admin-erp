/**
 * POST /api/pos/cocina/cerrar-anteriores — «Revisar y cerrar»: cierra como
 * entregadas, con motivo, las comandas vivas creadas antes del turno actual
 * (`antes` = inicio del día de la organización, lo calcula el cliente con la
 * zona horaria de la organización; la base rechaza una fecha futura).
 */
import { cerrarAnterioresSchema } from '@/lib/pos/cocina/rutasCocina';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ejecutarRpcCocina, respuestaOrgError } from '@/lib/pos/cocina/rutaRpcCocina';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/cocina/cerrar-anteriores';

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    return await ejecutarRpcCocina(ctx, body, {
      ruta: RUTA,
      schema: cerrarAnterioresSchema,
      nivel: 'gestionar',
      rpc: 'pos_cocina_cerrar_anteriores',
      args: (ctx, d) => ({
        p_organization_id: ctx.organizationId,
        p_actor: ctx.userId,
        p_branch_id: d.branch_id,
        p_antes: d.antes,
        p_motivo: d.motivo,
      }),
    });
  } catch (err) {
    const r = respuestaOrgError(err);
    if (r) return r;
    throw err;
  }
}
