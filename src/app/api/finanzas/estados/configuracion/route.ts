/**
 * GET  /api/finanzas/estados/configuracion — notas, certificación, políticas y marcas.
 * PUT  /api/finanzas/estados/configuracion — guarda notas, certificación o políticas.
 * Escribir exige `finance.approve`, aquí y en la función de la base. La
 * organización es siempre la de la sesión.
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ErrorEstados, guardarConfiguracion, leerConfiguracion } from '@/lib/finanzas/estados/fuente.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

function respuestaError(error: unknown) {
  if (error instanceof ErrorEstados) {
    return NextResponse.json({ codigo: error.codigo }, { status: error.estado, headers: SIN_CACHE });
  }
  throw error;
}

export const GET = withOrg(async (ctx) => {
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json(await leerConfiguracion(ctx), { headers: SIN_CACHE });
  } catch (error) {
    return respuestaError(error);
  }
});

export const PUT = withOrg(async (ctx, req) => {
  const body = await readOrgBody(ctx, req, { route: 'PUT /api/finanzas/estados/configuracion' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.approve'))) {
    return NextResponse.json({ codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json(await guardarConfiguracion(ctx, body as Record<string, unknown>), { headers: SIN_CACHE });
  } catch (error) {
    return respuestaError(error);
  }
});
