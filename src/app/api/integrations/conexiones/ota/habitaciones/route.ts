/**
 * POST /api/integrations/conexiones/ota/habitaciones — relaciona habitaciones de Booking.com o
 * Expedia con espacios del PMS. Body: { conexionId, relaciones: [{ espacioId, externoId }] } →
 * { guardadas }. Conexión o espacio de otra organización → 404. Administración.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { guardarHabitaciones } from '@/lib/services/integrations/conexiones/otaIcal.server';
import { fallo, responder } from '@/lib/services/integrations/conexiones/respuestaConexiones';

export const dynamic = 'force-dynamic';
const RUTA = '/api/integrations/conexiones/ota/habitaciones';

const esquema = z.object({
  conexionId: z.string().uuid(),
  relaciones: z
    .array(z.object({ espacioId: z.string().uuid(), externoId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/) }))
    .max(300),
});

export const POST = withOrg(async (ctx, request) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, request, { route: `POST ${RUTA}` }));
  if (!cuerpo.success) return fallo(400, 'VALIDATION', 'Datos inválidos.');
  return responder(RUTA, () =>
    guardarHabitaciones(getServiceClient(), ctx.organizationId, cuerpo.data.conexionId, cuerpo.data.relaciones),
  );
}, { admin: true });
