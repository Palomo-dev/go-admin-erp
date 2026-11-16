/**
 * Configuración › Recursos humanos › Parámetros legales (diseño 10.RH.1).
 * GET → valores de ley, lo que define la empresa, reglas ARL, sedes y cargos.
 * PUT { cambios: CambioEmpresa[] } → guarda lo que define la empresa.
 * Exige «Configurar Recursos humanos» (hr.parameters.manage), resuelto en la base.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { cargarParametros, guardarEmpresa } from '@/lib/services/hrm/configuracion/parametrosConfig.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await cargarParametros(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:parametros');
  }
});

export const PUT = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ cambios?: unknown }>(ctx, req, { route: 'hrm/configuracion/parametros' });
    return NextResponse.json({ guardados: await guardarEmpresa(ctx, body?.cambios) }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:parametros:guardar');
  }
});
