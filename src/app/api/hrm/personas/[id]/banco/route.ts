/**
 * GET  /api/hrm/personas/[id]/banco[?mostrar=1] — cuentas con el número
 *      enmascarado; «Mostrar» trae el completo y queda registrado aparte.
 * POST /api/hrm/personas/[id]/banco — { bank_name, account_type, account_number,
 *      holder_name?, motivo?, nota? }: el cambio de cuenta pasa por aprobación
 *      (decisión 7). Exige hr.data.banco.edit.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { leerBanco, solicitarCambioCuenta } from '@/lib/services/hrm/personasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    const completo = new URL(req.url).searchParams.get('mostrar') === '1';
    return NextResponse.json(await leerBanco(ctx, persona, completo, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'banco:leer');
  }
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/personas/banco' });
    return NextResponse.json(await solicitarCambioCuenta(ctx, persona, body ?? {}, contextoDePeticion(req)), {
      status: 201,
      headers: SIN_CACHE,
    });
  } catch (err) {
    return responderError(err, 'banco:solicitar');
  }
});
