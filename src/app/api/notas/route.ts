/**
 * GET /api/notas — listado de notas crédito o débito de venta
 * (`?tipo=credito|debito`, búsqueda, estado, estado DIAN, cliente, periodo,
 * sucursal, orden y página). KPIs del periodo y contador por pestaña.
 *
 * Permiso `finance.view`, resuelto en el servidor. La organización sale de la
 * sesión: una organización distinta en la query → 403 y se registra.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { leerConsultaNotas } from '@/lib/finanzas/notas/contratoNotas';
import { ErrorNotasServidor, listadoNotas } from '@/lib/services/ventas/notas.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/notas' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  const consulta = leerConsultaNotas(new URL(req.url).searchParams);
  if (!consulta) return NextResponse.json({ error: 'Consulta inválida', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  try {
    return NextResponse.json(await listadoNotas(ctx, consulta), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorNotasServidor) return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: 500, headers: SIN_CACHE });
    throw err;
  }
});
