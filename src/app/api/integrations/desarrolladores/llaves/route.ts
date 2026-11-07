/**
 * /api/integrations/desarrolladores/llaves
 *   GET  → llaves de API de la organización (solo máscara `goak_··xxxx`).
 *   POST → { nombre, alcances[], expira? } crea una llave con `crypto.randomBytes`; guarda solo su
 *          SHA-256 y devuelve la llave completa UNA vez. Administración.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { crearLlave, listarLlaves } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/llaves';
const esquema = z.object({
  nombre: z.string().min(1).max(80),
  alcances: z.array(z.string().max(40)).min(1).max(20),
  expira: z.string().max(40).nullish(),
});

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  return responder(RUTA, async () => ({ llaves: await listarLlaves(getServiceClient(), ctx.organizationId) }));
}, { admin: true });

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  return responder(RUTA, () =>
    crearLlave(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId, memberId: ctx.memberId }, cuerpo.data),
  );
}, { admin: true });
