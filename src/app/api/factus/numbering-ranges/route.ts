/**
 * API Route: rangos de numeración de la cuenta de Factus de la organización.
 * GET /api/factus/numbering-ranges
 *
 * Requiere sesión (`getServerOrgContext`: /api/factus está fuera del
 * middleware). Usa la cuenta de Factus DE LA ORGANIZACIÓN (Vault); la demo del
 * entorno solo en desarrollo. Ya no devuelve la respuesta cruda de Factus.
 * Para copiarlos a la numeración de una sucursal:
 * POST /api/factus/config { action: 'sincronizar_rangos', branchId }.
 */

import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { NextResponse } from 'next/server';
import { obtenerAccesoFactus, FacturacionNoActivadaError } from '@/lib/services/einvoicing/accesoFactus.server';
import { leerRangosFactus } from '@/lib/services/einvoicing/rangosFactus.server';

export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const acceso = await obtenerAccesoFactus(ctx.organizationId, { permitirDemoDesarrollo: true });
    const rangos = await leerRangosFactus(acceso);
    return NextResponse.json({ success: true, data: rangos, origen: acceso.origen });
  } catch (error: unknown) {
    if (error instanceof FacturacionNoActivadaError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error('[factus/numbering-ranges] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudieron obtener los rangos de numeración de Factus' }, { status: 502 });
  }
}
