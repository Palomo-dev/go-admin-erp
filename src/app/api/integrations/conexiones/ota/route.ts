/**
 * /api/integrations/conexiones/ota — modo API de Booking.com y Expedia.
 *   GET  ?canal=booking|expedia → { cuentaSocio, conexion: { id, propiedadId, estado } | null,
 *        espacios: {id, nombre, sucursal}[] }. Permiso `integrations.view`.
 *   POST { canal, propiedadId } → sin cuenta de proveedor de conectividad en el servidor: 409
 *        `{ codigo: 'CUENTA_SOCIO' }` SIN crear nada. Con ella: crea la conexión con el servicio del
 *        canal y la verifica pidiendo un token real → { conexionId, verificada } (sin token queda en
 *        `error`, nunca `connected`). Administración.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { exigirPermiso, PERMISO_INTEGRACIONES_VER } from '@/lib/services/integrations/accesoIntegraciones';
import { channelManagerClientsFor } from '@/lib/services/integrations/channelManagerAccess';
import { createBookingServices } from '@/lib/services/integrations/booking';
import { createExpediaServices } from '@/lib/services/integrations/expedia';
import { crearConexionOta, estadoOta, type ServiciosOta } from '@/lib/services/integrations/conexiones/otaIcal.server';
import type { CanalOta } from '@/lib/services/integrations/conexiones/credencialesOta';
import { fallo, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/ota';

const esquema = z.object({ canal: z.enum(['booking', 'expedia']), propiedadId: z.string().min(1).max(40) });

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
  await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);
  const canal = new URL(request.url).searchParams.get('canal');
  if (canal !== 'booking' && canal !== 'expedia') return fallo(400, 'CANAL', 'Canal no válido.');
  return responder(RUTA, () => estadoOta(getServiceClient(), ctx.organizationId, canal));
});

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  const canal: CanalOta = cuerpo.data.canal;
  return responder(RUTA, () => {
    const clients = channelManagerClientsFor(ctx);
    const servicios: ServiciosOta =
      canal === 'booking'
        ? (() => {
            const s = createBookingServices(clients);
            return {
              crear: (hotelId) => s.connections.createConnection({ organizationId: ctx.organizationId, hotelId }),
              token: (id) => s.auth.getValidToken(id),
            };
          })()
        : (() => {
            const s = createExpediaServices(clients);
            return {
              crear: (propertyId) => s.connections.createConnection({ organizationId: ctx.organizationId, propertyId }),
              token: (id) => s.auth.getValidToken(id),
            };
          })();
    return crearConexionOta(getServiceClient(), ctx.organizationId, canal, cuerpo.data.propiedadId, servicios);
  });
}, { admin: true });
