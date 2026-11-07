/**
 * /api/integrations/conexiones/ical — calendarios iCal de hospedaje (Airbnb, Booking.com, Expedia,
 * Tripadvisor, Google Vacation Rentals), reutilizando el PMS (`/api/pms/ical/<token>` y
 * `/api/pms/ical/sync`).
 *   GET  ?canal=<canal> → { espacios: {id, nombre, sucursal}[], enlaces: {espacioId, urlImportacion,
 *        urlExportacion, ultimaSync, estadoSync, error}[] }. Permiso `integrations.view`.
 *   POST { canal, enlaces: [{ espacioId, urlImportacion }] } → { conexionId, enlaces: [{ espacioId,
 *        urlExportacion }] }. Espacio de otra organización → 404; URL no https o privada → 400.
 *        Administración.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { exigirPermiso, PERMISO_INTEGRACIONES_VER } from '@/lib/services/integrations/accesoIntegraciones';
import { CANALES_ICAL, esCanalIcal, guardarIcal, listarIcal } from '@/lib/services/integrations/conexiones/otaIcal.server';
import { validarDestino } from '@/lib/services/integrations/conexiones/desarrolladores.server';
import { fallo, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/ical';

const esquema = z.object({
  canal: z.enum(CANALES_ICAL),
  enlaces: z
    .array(z.object({ espacioId: z.string().uuid(), urlImportacion: z.string().min(1).max(2000) }))
    .min(1)
    .max(300),
});

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);
  const canal = new URL(request.url).searchParams.get('canal');
  if (!esCanalIcal(canal)) return fallo(400, 'CANAL', 'Canal no válido.');
  return responder(RUTA, () => listarIcal(getServiceClient(), ctx.organizationId, canal));
});

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  return responder(RUTA, () =>
    guardarIcal(
      getServiceClient(),
      { organizationId: ctx.organizationId, userId: ctx.userId },
      cuerpo.data.canal,
      cuerpo.data.enlaces,
      (url) => validarDestino(url),
    ),
  );
}, { admin: true });
