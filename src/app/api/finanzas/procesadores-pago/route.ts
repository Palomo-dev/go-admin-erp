/**
 * GET /api/finanzas/procesadores-pago?mes=YYYY-MM — tablero de procesadores de pago
 * (Figma «07 Finanzas» 2704:150133): saldos por procesador con su alerta, datos de
 * cada procesador (NIT, origen, retención), abonos registrados, cuentas bancarias y
 * si la organización es responsable de IVA. Permiso finance.view (lo exige también
 * `fn_procesadores_pago_saldos`). Organización de la sesión (`withOrg`).
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ErrorProcesadores, estadoDeError, resumenProcesadores } from '@/lib/services/procesadoresPago/procesadoresPago.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/finanzas/procesadores-pago' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ error: 'sin_permiso', codigo: 'SIN_PERMISO' }, { status: 403, headers: SIN_CACHE });
  }
  const mesParam = new URL(req.url).searchParams.get('mes');
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? `${mesParam}-01` : null;
  try {
    return NextResponse.json(await resumenProcesadores(ctx, mes), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorProcesadores) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoDeError(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
