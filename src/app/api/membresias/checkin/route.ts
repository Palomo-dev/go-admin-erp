/**
 * Check-in (requiere memberships.checkin):
 *   GET  ?q=  — busca por nombre, documento (customers.identification_number), correo, teléfono o código.
 *   POST { clienteId, sucursalId, metodo?, membresiaId? } — valida con la copia de reglas del plan
 *        (vigencia, gracia con aviso, sede, horario, tope diario) y registra la entrada o el rechazo.
 */
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { buscarParaEntrada, registrarEntrada } from '@/lib/services/membresias/membresias.server';
import { fallo, responder } from '@/lib/services/membresias/respuestaHttp';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/membresias/checkin' });
  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 120);
  return responder(() => buscarParaEntrada(ctx, q));
});

const esquema = z.object({
  clienteId: z.string().uuid(),
  sucursalId: z.number().int().positive(),
  metodo: z.enum(['qr', 'manual', 'rfid', 'fingerprint', 'facial']).optional(),
  membresiaId: z.number().int().positive().optional().nullable(),
});

export const POST = withOrg(async (ctx, req) => {
  const cuerpo = esquema.safeParse(await readOrgBody(ctx, req, { route: 'POST /api/membresias/checkin' }));
  if (!cuerpo.success) return fallo(400, 'datos_invalidos');
  return responder(() => registrarEntrada(ctx, cuerpo.data));
});
