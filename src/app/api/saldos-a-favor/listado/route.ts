/**
 * GET /api/saldos-a-favor/listado — listado de la pantalla Saldos a favor
 * (Figma `1020:90370`): filas de la página, total filtrado y KPI.
 *
 * Query: q, estado (disponible · vencido · usado · anulado), origen (pago ·
 * nota_credito · devolucion · otro), cliente (uuid), con_saldo=1, desde/hasta
 * (día de creación), orden (`campo.dir`), pagina, tamano, sucursal y
 * kpi_desde/kpi_hasta (periodo de «Aplicado» y «Devuelto»).
 *
 * Permiso `finance.view` aquí y otra vez en la base (`fn_list_customer_credits`,
 * que además limita por sucursal y resuelve el vencido). Organización de la
 * sesión: otra en la query → 403. `GET /api/saldos-a-favor` sigue igual.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ConsultaSaldosInvalida, leerConsultaSaldos } from '@/lib/finanzas/saldosAFavor/listadoLogica';
import { ErrorSaldoFavorServidor, respuestaError, SIN_CACHE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import { listadoSaldos } from '@/lib/services/saldosAFavor/listadoSaldos.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/saldos-a-favor/listado' });
  let consulta;
  try {
    consulta = leerConsultaSaldos(new URL(req.url).searchParams);
  } catch (err) {
    if (err instanceof ConsultaSaldosInvalida) return respuestaError('datos_invalidos', err.message);
    throw err;
  }

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaError('sin_permiso');

  try {
    return NextResponse.json(await listadoSaldos(ctx, consulta), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) return respuestaError(err.codigo);
    throw err;
  }
});
