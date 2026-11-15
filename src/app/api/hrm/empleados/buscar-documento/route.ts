/**
 * POST /api/hrm/empleados/buscar-documento — { tipo, numero }: ¿ya hay una
 * persona con ese documento? Activa → el alta se bloquea; retirada → se ofrece
 * el reingreso en la misma ficha (decisión 11). Exige hr.employees.create y la
 * consulta queda registrada. Va por POST para que el número no quede en la URL.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { buscarDocumento } from '@/lib/services/hrm/personasService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ tipo?: unknown; numero?: unknown }>(ctx, req, { route: 'hrm/empleados/buscar-documento' });
    return NextResponse.json(await buscarDocumento(ctx, body?.tipo, body?.numero, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'empleados:buscar-documento');
  }
});
