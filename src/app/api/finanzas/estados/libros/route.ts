/**
 * GET /api/finanzas/estados/libros?libro=mayor&desde=…&hasta=…&largo=4
 * Libros contables de la organización de la sesión. Permiso `finance.view`.
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { ErrorEstados, leerLibro } from '@/lib/finanzas/estados/fuente.server';
import { rangoDe } from '@/lib/finanzas/estados/fechas';
import { esLibro } from '@/lib/finanzas/estados/libros';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, req) => {
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  const params = new URL(req.url).searchParams;
  const libro = params.get('libro');
  const periodo = rangoDe(params.get('desde'), params.get('hasta'));
  if (!esLibro(libro) || !periodo) {
    return NextResponse.json({ codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  const largo = Number(params.get('largo') ?? 4);
  try {
    const datos = await leerLibro(ctx, libro, periodo.desde, periodo.hasta, largo);
    return NextResponse.json(datos, { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof ErrorEstados) {
      return NextResponse.json({ codigo: error.codigo }, { status: error.estado, headers: SIN_CACHE });
    }
    throw error;
  }
});
