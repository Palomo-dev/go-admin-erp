/**
 * POST /api/integrations/conexiones/importar — importación por CSV (desde la página de Conexiones).
 * Body: { conector: uuid, filas: [{ nombre, sucursalId?, pais?, ambiente? }] } (máx. 200).
 * Crea conexiones en BORRADOR, sin credenciales; nunca `connected`. Administración.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { importarConexiones, MAX_FILAS_IMPORTACION } from '@/lib/services/integrations/conexiones/conexiones.server';
import { fallo, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/importar';

const esquema = z.object({
  conector: z.string().uuid(),
  filas: z
    .array(
      z.object({
        nombre: z.string().max(200),
        sucursalId: z.number().int().positive().nullish(),
        pais: z.string().max(10).nullish(),
        ambiente: z.string().max(20).nullish(),
      }),
    )
    .min(1)
    .max(MAX_FILAS_IMPORTACION),
});

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Archivo inválido.');
  return responder(RUTA, () =>
    importarConexiones(getServiceClient(), { organizationId: ctx.organizationId, userId: ctx.userId }, cuerpo.data.conector, cuerpo.data.filas),
  );
}, { admin: true });
