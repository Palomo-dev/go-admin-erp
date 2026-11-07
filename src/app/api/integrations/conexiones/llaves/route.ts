/**
 * POST /api/integrations/conexiones/llaves — asistente «llaves» (Wompi y pasarelas, SendGrid).
 * Body: { proveedor, ambiente, valores: { <propósito>: <valor> }, conexionId?, nombre?, sucursalId? }.
 *
 * 1. Valida forma (prefijos por ambiente). 2. Prueba las llaves CONTRA EL PROVEEDOR. 3. Solo si
 * responde que son correctas, las guarda desde el servidor (nunca desde el navegador) y deja la
 * conexión `connected`. Con `conexionId` reemplaza las llaves de esa conexión en sitio.
 * La respuesta nunca incluye las llaves. Administración (`withOrg({ admin: true })`).
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { guardarLlaves } from '@/lib/services/integrations/conexiones/conexiones.server';
import { LLAVES, type ProveedorLlaves } from '@/lib/services/integrations/conexiones/definicionesLlaves';
import { fallo, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/llaves';

const PROVEEDORES = Object.keys(LLAVES) as [ProveedorLlaves, ...ProveedorLlaves[]];
const esquema = z.object({
  proveedor: z.enum(PROVEEDORES),
  ambiente: z.enum(['sandbox', 'production']),
  valores: z.record(z.string().max(80), z.string().max(500)),
  conexionId: z.string().uuid().nullish(),
  nombre: z.string().max(80).nullish(),
  sucursalId: z.number().int().positive().nullish(),
});

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  return responder(RUTA, () =>
    guardarLlaves(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, cuerpo.data),
  );
}, { admin: true });
