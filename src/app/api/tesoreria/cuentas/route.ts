/**
 * GET /api/tesoreria/cuentas — cajas abiertas del POS como cuentas de dinero
 * (C1 de docs/design/FINANZAS-TESORERIA-V2.md §2.4). Las cuentas bancarias las
 * lee la pantalla con su servicio; las cajas salen de aquí porque su saldo es
 * el efectivo esperado y el cierre ciego se resuelve en el servidor
 * (`cajasComoCuentasDeDinero`): sin `pos.cajas.ver_esperado`, `saldo = null`.
 * Organización de la sesión; permiso `finance.view`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { cajasComoCuentasDeDinero } from '@/lib/pos/cajas/cuentasDeDinero';

export const dynamic = 'force-dynamic';

const RUTA = 'GET /api/tesoreria/cuentas';

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);
    const { modo, cuentas } = await cajasComoCuentasDeDinero(ctx);
    return NextResponse.json({ modo, cajas: cuentas }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return routeErrorResponse(RUTA, err);
  }
});
