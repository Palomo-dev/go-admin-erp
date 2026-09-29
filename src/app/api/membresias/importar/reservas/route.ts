/**
 * POST /api/membresias/importar/reservas — { filas, soloValidar? } (§13).
 * Requiere memberships.classes.manage. Miembro por documento o correo; clase por título + fecha y
 * hora en la zona de la sede. Todo o nada, máximo 500 filas. La organización es la de la sesión.
 */
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { importarReservas } from '@/lib/services/membresias/operacionClases.server';
import { esquemaImportarReservas } from '@/lib/services/membresias/esquemasImportacion';
import { fallo, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  const cuerpo = esquemaImportarReservas.safeParse(await readOrgBody(ctx, req, { route: 'POST /api/membresias/importar/reservas' }));
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => importarReservas(ctx, cuerpo.data.filas, cuerpo.data.soloValidar));
});
