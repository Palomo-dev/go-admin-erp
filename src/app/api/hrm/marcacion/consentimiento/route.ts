/**
 * POST /api/hrm/marcacion/consentimiento — { otorgar: boolean }
 *
 * El empleado autoriza (o retira) que se guarde su ubicación SOLO en el momento
 * de marcar (ADR-002 §2). Queda una fila nueva en `hr_geo_consents` con la versión
 * del texto, la IP y el agente de la petición original.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { consentimientoUbicacion } from '@/lib/services/hrm/marcacionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<{ otorgar?: unknown }>(ctx, req, { route: 'hrm/marcacion/consentimiento' });
    return NextResponse.json(await consentimientoUbicacion(ctx, body?.otorgar, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:consentimiento');
  }
});
