/**
 * Registrar un cambio (Figma 20.4): uno o varios campos con la misma fecha de
 * efecto, en UNA solicitud que se aprueba o se rechaza completa (decisión 5).
 *
 * GET  ?fecha=YYYY-MM-DD → { cerrado, primera_fecha_libre } (período de nómina
 *      cerrado: el cambio se bloquea, decisión 4).
 * POST { efectivo_desde, cambios: [{ campo, valor }], motivo, nota?, soporte_documento_id? }
 *
 * Va con la sesión del usuario: `fn_hr_registrar_cambios` resuelve el permiso
 * (editar, o proponer si es su equipo y hay a quién enviarlo) y deja el registro.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { periodoCerrado, registrarCambios } from '@/lib/services/hrm/personasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const fecha = new URL(req.url).searchParams.get('fecha') ?? '';
    return NextResponse.json(await periodoCerrado(ctx, fecha), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'cambios:periodo');
  }
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const vinculo = await parametroDeRuta(routeParams, 'id');
    const b = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/vinculos/cambios' });
    const r = await registrarCambios(
      ctx,
      {
        vinculoId: vinculo,
        efectivoDesde: String(b?.efectivo_desde ?? ''),
        cambios: b?.cambios,
        motivo: String(b?.motivo ?? ''),
        nota: typeof b?.nota === 'string' ? b.nota : null,
        soporteDocumentoId: typeof b?.soporte_documento_id === 'string' && b.soporte_documento_id ? b.soporte_documento_id : null,
      },
      contextoDePeticion(req)
    );
    return NextResponse.json(r, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'cambios:registrar');
  }
});
