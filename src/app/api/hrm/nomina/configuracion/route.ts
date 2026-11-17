/**
 * GET /api/hrm/nomina/configuracion
 *
 * Bandera de la nómina, vista previa del plan de cuentas, terceros sin NIT y catálogo
 * de conceptos resuelto (Figma 20.24). Solo lectura: encender la nómina es de la plataforma.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';
import { configuracionNomina } from '@/lib/services/hrm/nomina/nominaLecturas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    return NextResponse.json(await configuracionNomina(ctx, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'nomina:configuracion');
  }
});
