/**
 * PUT /api/integrations/logistica/conexiones/[id]/credenciales — { valores: { campo: valor } }.
 * Valida contra el `settings_schema` del conector: los secretos van al Vault y los ajustes a la
 * conexión. Un secreto vacío conserva el guardado. La conexión vuelve a `draft` hasta que se pruebe.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { guardarCredencialesLogistica } from '@/lib/services/transporte/conexionesLogistica.server';
import { fallo, idConexion, responder } from '@/lib/services/transporte/respuestaLogistica';

export const dynamic = 'force-dynamic';

const RUTA = '/api/integrations/logistica/conexiones/[id]/credenciales';

const esquema = z.object({
  valores: z.record(z.string().max(80), z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])),
});

export const PUT = withOrg(async (ctx, request, routeParams) => {
  const id = await idConexion(routeParams);
  if (!id) return fallo(404, 'CONEXION', 'Conexión no encontrada.');
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `PUT ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos de la conexión inválidos.');
  return responder(RUTA, () => guardarCredencialesLogistica(getServiceClient(), ctx.organizationId, id, cuerpo.data.valores));
}, { admin: true });
