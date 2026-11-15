/**
 * Configuración › Recursos humanos › Festivos (diseño 10.RH.1).
 * GET ?anio= (por defecto, el año de hoy en la zona de la organización) → festivos de ley y días propios; POST → agrega un día propio.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { agregarDiaPropio, cargarFestivos } from '@/lib/services/hrm/configuracion/festivosConfig.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import type { NuevoDiaPropio } from '@/lib/hrm/configuracion/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const anio = new URL(req.url).searchParams.get('anio');
    return NextResponse.json(await cargarFestivos(ctx, anio ? Number(anio) : null), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:festivos');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const b = await readOrgBody<NuevoDiaPropio>(ctx, req, { route: 'hrm/configuracion/festivos' });
    return NextResponse.json(await agregarDiaPropio(ctx, b), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:festivos:agregar');
  }
});
