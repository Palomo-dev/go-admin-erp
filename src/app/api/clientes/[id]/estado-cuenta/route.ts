/**
 * GET /api/clientes/[id]/estado-cuenta?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Estado de cuenta del cliente para el diálogo del kit: saldos, vencido, por
 * vencer y movimientos con saldo corrido. Sale del MISMO cargador que el PDF
 * del motor de documentos (permiso del tipo `estado-cuenta`, cliente de la
 * organización de la sesión: otro → 404). Los días son de la organización.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { idiomaDelUsuario } from '@/lib/finanzas/textosServidor.server';
import { estadoCuentaCliente } from '@/lib/services/cartera/estadoCuenta.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/clientes/[id]/estado-cuenta' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Cliente no encontrado', codigo: 'cliente_no_encontrado' }, { status: 404, headers: SIN_CACHE });
  }
  const q = new URL(req.url).searchParams;
  const desde = q.get('desde');
  const hasta = q.get('hasta');
  try {
    const idioma = await idiomaDelUsuario(ctx, q.get('idioma'));
    const datos = await estadoCuentaCliente(
      ctx,
      id,
      { desde: desde && DIA_RE.test(desde) ? desde : null, hasta: hasta && DIA_RE.test(hasta) ? hasta : null },
      idioma,
    );
    return NextResponse.json({ datos }, { headers: SIN_CACHE });
  } catch (err) {
    return routeErrorResponse('clientes/estado-cuenta', err);
  }
});
