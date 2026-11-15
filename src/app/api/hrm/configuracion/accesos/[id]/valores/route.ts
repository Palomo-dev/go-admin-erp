/**
 * POST /api/hrm/configuracion/accesos/[id]/valores — «Mostrar valores».
 * Decisión del dueño (2026-11-15): los valores se ocultan hasta este clic, y el
 * clic también queda registrado (con la IP y el agente de esta petición).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { mostrarValores, registrarIntento } from '@/lib/services/hrm/configuracion/registroAccesosConfig.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/configuracion/accesos/valores' });
    const id = Number(await parametroDeRuta(routeParams, 'id'));
    try {
      return NextResponse.json(await mostrarValores(ctx, id, contextoDePeticion(req)), { headers: SIN_CACHE });
    } catch (err) {
      if (err instanceof HrmError && err.code === 'sin_permiso') {
        await registrarIntento(ctx, { grupo: 'registro_accesos', detalle: { accion: 'mostrar_valores', registro: id } }, contextoDePeticion(req));
      }
      throw err;
    }
  } catch (err) {
    return responderError(err, 'config:accesos:valores');
  }
});
