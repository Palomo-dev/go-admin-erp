/**
 * Configuración › Recursos humanos › Aprobaciones (diseño 10.RH.2).
 * GET → reglas, delegaciones y opciones.
 * POST { accion, ... }:
 *   guardar { regla } · activar { id, activa } · quitar { id } · reordenar { tipo, ids }
 *   recomendadas · probar { tipo, vinculoId, fecha, dias?, monto?, horas?, aumentoPct? }
 *   delegar { deId, aId, desde, hasta, tipos, motivo } · terminar { id }
 * Todo exige hr.approvals.manage, que también comprueba la base.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import {
  activarRegla,
  cargarAprobaciones,
  crearDelegacion,
  guardarRegla,
  probarRegla,
  quitarRegla,
  reordenarReglas,
  terminarDelegacion,
  usarRecomendadas,
} from '@/lib/services/hrm/configuracion/aprobacionesConfig.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError } from '@/lib/services/hrm/tipos';
import type { Regla } from '@/lib/hrm/configuracion/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await cargarAprobaciones(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:aprobaciones');
  }
});

type Cuerpo = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === 'string' ? v : '');
const numero = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export const POST = withOrg(async (ctx, req) => {
  try {
    const b = await readOrgBody<Cuerpo>(ctx, req, { route: 'hrm/configuracion/aprobaciones' });
    switch (b?.accion) {
      case 'guardar':
        return NextResponse.json(await guardarRegla(ctx, (b.regla ?? {}) as Partial<Regla>), { headers: SIN_CACHE });
      case 'activar':
        await activarRegla(ctx, texto(b.id), b.activa === true);
        return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
      case 'quitar':
        await quitarRegla(ctx, texto(b.id));
        return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
      case 'reordenar':
        await reordenarReglas(ctx, texto(b.tipo), b.ids);
        return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
      case 'recomendadas':
        return NextResponse.json({ creadas: await usarRecomendadas(ctx) }, { headers: SIN_CACHE });
      case 'probar':
        return NextResponse.json(
          await probarRegla(ctx, {
            tipo: texto(b.tipo),
            vinculoId: texto(b.vinculoId),
            fecha: texto(b.fecha),
            dias: numero(b.dias),
            monto: numero(b.monto),
            horas: numero(b.horas),
            aumentoPct: numero(b.aumentoPct),
          }),
          { headers: SIN_CACHE }
        );
      case 'delegar':
        return NextResponse.json(
          await crearDelegacion(ctx, {
            deId: texto(b.deId),
            aId: texto(b.aId),
            desde: texto(b.desde),
            hasta: texto(b.hasta),
            tipos: Array.isArray(b.tipos) ? (b.tipos as string[]) : null,
            motivo: texto(b.motivo),
          }),
          { status: 201, headers: SIN_CACHE }
        );
      case 'terminar':
        await terminarDelegacion(ctx, texto(b.id));
        return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
      default:
        throw new HrmError(400, 'accion_invalida');
    }
  } catch (err) {
    return responderError(err, 'config:aprobaciones:accion');
  }
});
