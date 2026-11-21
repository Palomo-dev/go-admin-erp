/**
 * POST /api/finanzas/procesadores-pago/abonos/[id]/anular — anula un abono con su
 * contra-asiento (`fn_procesador_abono_anular`, que exige finance.void y un motivo).
 * El abono tiene que ser de la organización de la sesión. Body: `{ motivo }`.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { sinClavesDeOrganizacion } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import { anularAbono, ErrorProcesadores, estadoDeError } from '@/lib/services/procesadoresPago/procesadoresPago.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const esquema = z.object({ motivo: z.string().trim().min(3).max(500) }).strict();

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ABONO_INEXISTENTE', codigo: 'ABONO_INEXISTENTE' }, { status: 404, headers: SIN_CACHE });
  }
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/finanzas/procesadores-pago/abonos/[id]/anular' });
  const parsed = esquema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return NextResponse.json({ error: 'MOTIVO_REQUERIDO', codigo: 'MOTIVO_REQUERIDO' }, { status: 400, headers: SIN_CACHE });
  try {
    return NextResponse.json(await anularAbono(ctx, id, parsed.data.motivo), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorProcesadores) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo, mensaje: err.message }, { status: estadoDeError(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
