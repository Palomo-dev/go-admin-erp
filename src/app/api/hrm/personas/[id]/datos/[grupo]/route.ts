/**
 * GET /api/hrm/personas/[id]/datos/[grupo] — lee un grupo de datos sensibles.
 * PUT /api/hrm/personas/[id]/datos/[grupo] — guarda identificación o banco.
 *
 * ADR-001 §7: el permiso del grupo (ver, ver de su equipo o editar) lo resuelve
 * la base con el actor de la sesión, y cada lectura o edición queda en
 * hr_access_log con la IP y el agente de esta petición.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { guardarDatosSensibles, leerDatosSensibles } from '@/lib/services/hrm/datosSensiblesService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, contextoDePeticion, esGrupoDatos } from '@/lib/services/hrm/tipos';
import { registrarIntento } from '@/lib/services/hrm/configuracion/registroAccesosConfig.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    const grupo = await parametroDeRuta(routeParams, 'grupo');
    if (!esGrupoDatos(grupo)) throw new HrmError(400, 'grupo_invalido');
    try {
      const datos = await leerDatosSensibles(ctx, persona, grupo, contextoDePeticion(req));
      return NextResponse.json(datos, { headers: SIN_CACHE });
    } catch (err) {
      // Decisión del dueño (2026-11-15): los intentos sin permiso también quedan registrados.
      if (err instanceof HrmError && err.code === 'sin_permiso') {
        await registrarIntento(ctx, { personaId: persona, grupo, detalle: { accion: 'ver' } }, contextoDePeticion(req));
      }
      throw err;
    }
  } catch (err) {
    return responderError(err, 'datos:leer');
  }
});

export const PUT = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    const grupo = await parametroDeRuta(routeParams, 'grupo');
    if (!esGrupoDatos(grupo)) throw new HrmError(400, 'grupo_invalido');
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/personas/datos' });
    try {
      const r = await guardarDatosSensibles(ctx, persona, grupo, body, contextoDePeticion(req));
      return NextResponse.json(r, { headers: SIN_CACHE });
    } catch (err) {
      if (err instanceof HrmError && err.code === 'sin_permiso') {
        await registrarIntento(ctx, { personaId: persona, grupo, detalle: { accion: 'editar' } }, contextoDePeticion(req));
      }
      throw err;
    }
  } catch (err) {
    return responderError(err, 'datos:guardar');
  }
});
