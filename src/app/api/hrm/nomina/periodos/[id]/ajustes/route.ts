/**
 * POST /api/hrm/nomina/periodos/[id]/ajustes — { vinculo_id, novedades: [{ concepto, valor?, cantidad? }], motivo }
 *
 * Ajuste controlado de un período cerrado: con las reglas originales y la diferencia por concepto.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, parametroDeRuta, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { ajustar } from '@/lib/services/hrm/nomina/nominaService.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, rp) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/nomina/ajustes' });
    return NextResponse.json(await ajustar(ctx, await parametroDeRuta(rp, 'id'), body ?? {}, contextoDePeticion(req)), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:periodos/[id]/ajustes');
  }
});
