/**
 * POST /api/membresias/reservas/[id]/entrada — { metodo? } (§13).
 * Registra la entrada del miembro de la reserva en la sede de la clase (requiere memberships.checkin).
 * Las reglas son las del check-in (vencida, congelada, gracia con aviso, sede, horario, tope diario);
 * si se permite, la reserva queda `checked_in`. Idempotente: un segundo clic devuelve la misma
 * entrada con `repetida: true`. Reserva de otra organización o de una sede sin acceso: 404.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { registrarEntradaDesdeReserva } from '@/lib/services/membresias/operacionClases.server';
import { fallo, idEntero, parametros, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

const esquema = z.object({
  metodo: z.enum(['qr', 'manual', 'rfid', 'fingerprint', 'facial']).optional(),
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  const id = idEntero((await parametros(routeParams)).id);
  if (!id) return fallo(404, 'reserva_no_encontrada');
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, req, { route: 'POST /api/membresias/reservas/[id]/entrada' }));
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => registrarEntradaDesdeReserva(ctx, id, cuerpo.data.metodo ?? 'manual'));
});
