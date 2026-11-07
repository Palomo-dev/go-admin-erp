/**
 * POST /api/integrations/conexiones/[id]/uso — paso «Dónde se usa»: enlaza la conexión al método
 * de pago de su proveedor. Fusiona `settings` (no lo sobrescribe), no toca otros métodos y no roba
 * un método enlazado a otra conexión (409). Body: { tienda, pos, sucursales: number[] }.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { enlazarUso } from '@/lib/services/integrations/conexiones/conexiones.server';
import { fallo, idDeRuta, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/[id]/uso';

const esquema = z.object({
  tienda: z.boolean(),
  pos: z.boolean(),
  sucursales: z.array(z.number().int().positive()).max(200).default([]),
});

export const POST = withOrg(async (ctx, request, routeParams) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  const id = await idDeRuta(routeParams);
  if (!id) return fallo(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  return responder(RUTA, () => enlazarUso(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, id, cuerpo.data));
}, { admin: true });
