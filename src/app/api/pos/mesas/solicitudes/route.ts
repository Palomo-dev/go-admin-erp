/**
 * POST /api/pos/mesas/solicitudes — «Voy» / «Atendida» sobre una solicitud que
 * el comensal hizo desde la Carta QR de su mesa (llamar al mesero, pedir la
 * cuenta). Mismo esqueleto que Comandas v2: organización y actor de la sesión,
 * permiso «operar» resuelto en el servidor y la RPC lo vuelve a comprobar.
 * Sin la migración aplicada responde 501 `rpc_no_disponible`.
 */
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ejecutarRpcCocina, respuestaOrgError } from '@/lib/pos/cocina/rutaRpcCocina';
import { RPC_ATENDER_SOLICITUD, atenderSolicitudSchema } from '@/lib/pos/mesas/solicitudesMesaRuta';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/pos/mesas/solicitudes';

export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: RUTA });
    return await ejecutarRpcCocina(ctx, body, {
      ruta: RUTA,
      schema: atenderSolicitudSchema,
      nivel: 'operar',
      rpc: RPC_ATENDER_SOLICITUD,
      args: (ctx, d) => ({ p_organization_id: ctx.organizationId, p_actor: ctx.userId, p_request_id: d.request_id, p_estado: d.estado }),
    });
  } catch (err) {
    const r = respuestaOrgError(err);
    if (r) return r;
    throw err;
  }
}
