/**
 * GET  /api/hrm/nomina/embargos — embargos de la organización (Figma 20.21). Grupo salario_pago, con registro de accesos.
 * POST /api/hrm/nomina/embargos — { vinculo_id, tipo, modo, valor, recibido, total?, hasta?, oficio?, beneficiario? } o { id, vinculo_id, estado }
 *
 * Registra o actualiza un embargo. Grupo salario_pago.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { guardarEmbargo } from '@/lib/services/hrm/nomina/nominaService.server';
import { listarEmbargos } from '@/lib/services/hrm/nomina/nominaLecturas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, req, { route: 'hrm/nomina/embargos' });
    return NextResponse.json(await guardarEmbargo(ctx, body ?? {}, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:embargos');
  }
});

export const GET = withOrg(async (ctx, req) => {
  try {
    return NextResponse.json(await listarEmbargos(ctx, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:embargos:get');
  }
});
