/**
 * POST /api/integrations/conexiones/[id]/estado — { accion: 'pausar' | 'reanudar' | 'desconectar' }.
 * Desconectar revoca las credenciales (no las borra) y desenlaza los métodos de pago.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { cambiarEstado } from '@/lib/services/integrations/conexiones/conexiones.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/[id]/estado';
const esquema = z.object({ accion: z.enum(['pausar', 'reanudar', 'desconectar']) });

export const POST = withOrg(async (ctx, request, routeParams) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Acción inválida.');
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  return responder(RUTA, () =>
    cambiarEstado(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, id, cuerpo.data.accion),
  );
}, { admin: true });
