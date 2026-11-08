/**
 * GET /api/integrations/conexiones → catálogo (30 servicios con su estado honesto) y las
 * conexiones de la organización de la sesión (sin secretos).
 * Organización de la sesión (`withOrg`); organización ajena en la query → 403 (`readOrgBody`).
 * Permiso del servidor: `integrations.view` (o administración).
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { exigirPermiso, PERMISO_INTEGRACIONES_VER } from '@/lib/services/integrations/accesoIntegraciones';
import { catalogo, conectoresImportables, listarConexiones } from '@/lib/services/integrations/conexiones/conexiones.server';
import { responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones';

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);
  return responder(RUTA, async () => {
    const db = getServiceClient();
    const [items, conexiones, conectores] = await Promise.all([
      catalogo(db, ctx.organizationId),
      listarConexiones(db, ctx.organizationId),
      conectoresImportables(db),
    ]);
    return { catalogo: items, conexiones, conectores };
  });
});
