/**
 * /api/integrations/desarrolladores/llaves
 *   GET  → llaves de API de la organización (solo máscara `goak_··xxxx`) y los canales del Chat
 *          que se pueden asociar a una llave.
 *   POST → { nombre, alcances[], expira?, canal? } crea una llave con `crypto.randomBytes`; guarda
 *          solo su SHA-256 y devuelve la llave completa UNA vez. `canal` (uuid) la asocia a un canal
 *          del Chat de la organización; uno de otra organización → 400. Administración.
 *
 * Único lugar donde se crean llaves de API (Figma 12.9): Chat y CRM solo enlazan aquí.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { crearLlave, listarCanalesLlave, listarLlaves } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/desarrolladores/llaves';
const esquema = z.object({
  nombre: z.string().min(1).max(80),
  alcances: z.array(z.string().max(40)).min(1).max(20),
  expira: z.string().max(40).nullish(),
  canal: z.string().uuid().nullish(),
});

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  return responder(RUTA, async () => {
    const db = getServiceClient();
    // Los canales son solo de la organización de la sesión; sin canales la lista de llaves sale igual.
    const canales = await listarCanalesLlave(db, ctx.organizationId).catch(() => []);
    return { llaves: await listarLlaves(db, ctx.organizationId, canales), canales };
  });
}, { admin: true });

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  return responder(RUTA, () =>
    crearLlave(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId, memberId: ctx.memberId }, cuerpo.data),
  );
}, { admin: true });
