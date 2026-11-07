/**
 * GET /api/dinero-terceros — «Dinero de terceros» (Figma `2335:139939`):
 * propinas (tabla `tips` del POS) y recaudos para terceros (auxiliar por
 * tercero de la cuenta de recaudos, 2815 si no está configurada), con lo
 * recibido, lo liquidado y lo que falta pagar, más la cuenta de cada concepto
 * y si el Contador ya la confirmó. Solo lectura con el cliente de la sesión.
 * Permiso `finance.view`. La organización es la de la sesión (`withOrg`).
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ErrorDineroTerceros, resumenDineroTerceros } from '@/lib/services/dineroTerceros/dineroTerceros.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/dinero-terceros' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ error: 'sin_permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json(await resumenDineroTerceros(ctx), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorDineroTerceros) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: 500, headers: SIN_CACHE });
    }
    throw err;
  }
});
