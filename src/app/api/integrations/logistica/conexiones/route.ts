/**
 * /api/integrations/logistica/conexiones
 *   GET  → conexiones de logística de la organización de la sesión. Con `?proveedor=<code>`
 *          además el estado del adaptador y los ambientes de ese proveedor.
 *   POST → { connectorCode, environment } crea (o devuelve) la conexión en `draft`.
 *
 * Organización de la sesión (`withOrg({ admin: true })`); un organizationId ajeno en el body o en la
 * query → 403 y registro (`readOrgBody`). Service role solo después de resolver la organización:
 * las credenciales van al Vault, que solo service_role puede tocar.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { catalogoProveedorLogistica, crearConexionLogistica, listarConexionesLogistica } from '@/lib/services/transporte/conexionesLogistica.server';
import { fallo, responder } from '@/lib/services/transporte/respuestaLogistica';

export const dynamic = 'force-dynamic';

const RUTA = '/api/integrations/logistica/conexiones';

const esquemaCrear = z.object({
  connectorCode: z.string().min(1).max(80),
  environment: z.enum(['sandbox', 'production']),
});

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  const proveedor = new URL(request.url).searchParams.get('proveedor');
  if (proveedor !== null && !/^[a-z0-9_]{1,40}$/.test(proveedor)) return fallo(404, 'CONEXION', 'Proveedor de logística no encontrado.');
  return responder(RUTA, async () => {
    const db = getServiceClient();
    const conexiones = await listarConexionesLogistica(db, ctx.organizationId);
    if (!proveedor) return { conexiones };
    return {
      proveedor: await catalogoProveedorLogistica(db, proveedor),
      conexiones: conexiones.filter((c) => c.proveedor === proveedor),
    };
  });
}, { admin: true });

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquemaCrear.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Proveedor o ambiente inválido.');
  return responder(RUTA, () =>
    crearConexionLogistica(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, cuerpo.data.connectorCode, cuerpo.data.environment),
  );
}, { admin: true });
