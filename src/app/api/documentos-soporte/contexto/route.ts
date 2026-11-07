/**
 * GET /api/documentos-soporte/contexto?sucursal=<id>
 * Lo que necesita el formulario: métodos de pago y monedas de la organización,
 * facturas de compra recientes y la resolución de documento soporte que se
 * usará en la sucursal. Permiso finance.view. Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS } from '@/lib/security/orgGuards';
import { errorSoporte, SIN_CACHE, tienePermiso } from '@/lib/finanzas/soporte/rutasSoporte.server';
import { contextoDocumentoSoporte } from '@/lib/services/soporte/documentosSoporte.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/documentos-soporte/contexto' });
  if (!(await tienePermiso(ctx, PERMISOS_FINANZAS.VER))) return errorSoporte(ctx, 'sin_permiso', 'GET /api/documentos-soporte/contexto');
  const sucursal = Number(new URL(req.url).searchParams.get('sucursal'));
  return NextResponse.json(await contextoDocumentoSoporte(ctx, Number.isInteger(sucursal) && sucursal > 0 ? sucursal : null), { headers: SIN_CACHE });
});
