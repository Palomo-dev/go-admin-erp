/**
 * POST /api/hrm/ausencias/simular — vista previa de una solicitud (Figma 20.13 «Solicitar
 * vacaciones», 20.14 «Registrar incapacidad» y «Registrar licencia»).
 *
 * Mismo cuerpo que `POST /api/hrm/ausencias`. La base corre la solicitud real y la deshace:
 * días calendario y hábiles, domingos y festivos, regreso, saldo, cruces del equipo, tramos de
 * pago y quién aprueba. Nada queda guardado. La organización y el actor salen de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { simular } from '@/lib/services/hrm/ausenciasService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/ausencias/simular' });
    return NextResponse.json(await simular(ctx, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'ausencias:simular');
  }
});
