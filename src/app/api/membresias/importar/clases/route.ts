/**
 * POST /api/membresias/importar/clases — { filas, soloValidar? } (§13).
 * Requiere memberships.classes.manage. Todo o nada: con `soloValidar` devuelve el reporte por fila
 * sin escribir (vista previa); sin él, importa solo si ninguna fila tiene errores. Máximo 500 filas.
 * La organización es la de la sesión; una organización ajena en el body o la query: 403.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { importarClases } from '@/lib/services/membresias/operacionClases.server';
import { esquemaImportarClases } from '@/lib/services/membresias/esquemasImportacion';
import { fallo, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  const cuerpo = esquemaImportarClases.safeParse(await readOrgBody(ctx, req, { route: 'POST /api/membresias/importar/clases' }));
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => importarClases(ctx, cuerpo.data.filas, cuerpo.data.soloValidar));
});
