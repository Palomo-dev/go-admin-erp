/**
 * POST /api/membresias/membresias/[id]/congelar — { desde: YYYY-MM-DD, hasta: YYYY-MM-DD, motivo? }.
 * Requiere memberships.freeze. Topes del plan, fechas y estado los valida fn_membresia_congelar.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { congelarMembresia } from '@/lib/services/membresias/membresias.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const esquema = z.object({
  desde: z.string().regex(DIA),
  hasta: z.string().regex(DIA),
  motivo: z.string().max(500).optional().nullable(),
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = idEntero((await parametros(routeParams)).id);
  if (!id) return fallo(404, 'membresia_no_encontrada');
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, req, { route: 'POST /api/membresias/membresias/[id]/congelar' }));
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => congelarMembresia(ctx, id, cuerpo.data));
});
