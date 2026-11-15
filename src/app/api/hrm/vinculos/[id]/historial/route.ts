/**
 * Historial con fecha de efecto de un vínculo laboral (ADR-001 §3).
 *
 * GET  ?campo=cargo&fecha=2026-07-15              → valor vigente en la fecha
 * GET  ?campo=cargo&desde=2026-07-01&hasta=…      → tramos del período
 * POST { campo, efectivo_desde, valor, motivo }   → registra el cambio
 *
 * Va con la sesión del usuario: `fn_hr_registrar_cambio` y `fn_hr_valor_vigente`
 * resuelven el permiso en la base (editar, o proponer si es su equipo y hay
 * regla de aprobación) y dejan el registro de acceso cuando es salario.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { registrarCambio, tramosDeValor, valorVigente } from '@/lib/services/hrm/historialService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, contextoDePeticion, esCampoHistorial } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const vinculo = await parametroDeRuta(routeParams, 'id');
    const q = new URL(req.url).searchParams;
    const campo = q.get('campo');
    if (!esCampoHistorial(campo)) throw new HrmError(400, 'campo_invalido');
    const desde = q.get('desde');
    const hasta = q.get('hasta');
    if (desde || hasta) {
      return NextResponse.json({ tramos: await tramosDeValor(ctx, vinculo, campo, desde ?? '', hasta ?? '') }, { headers: SIN_CACHE });
    }
    return NextResponse.json({ valor: await valorVigente(ctx, vinculo, campo, q.get('fecha') ?? '') }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'historial:leer');
  }
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const vinculo = await parametroDeRuta(routeParams, 'id');
    const body = await readOrgBody<{ campo?: unknown; efectivo_desde?: unknown; valor?: unknown; motivo?: unknown }>(ctx, req, {
      route: 'hrm/vinculos/historial',
    });
    if (!esCampoHistorial(body?.campo)) throw new HrmError(400, 'campo_invalido');
    const r = await registrarCambio(
      ctx,
      {
        vinculoId: vinculo,
        campo: body.campo,
        efectivoDesde: String(body.efectivo_desde ?? ''),
        valor: body.valor,
        motivo: String(body.motivo ?? ''),
      },
      contextoDePeticion(req)
    );
    return NextResponse.json(r, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'historial:registrar');
  }
});
