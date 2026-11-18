/**
 * POST /api/hrm/marcacion/dispositivos/vincular (Figma 20.28.3, 20.29.7).
 * { codigo, tipo: 'kiosco' | 'lector_escritorio', nombre, sede_id, descripcion? }
 * o { codigo, reloj_id } para vincular de nuevo un equipo que perdió su clave.
 * Solo hr.attendance.manage (lo comprueba la base).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { vincularEquipo } from '@/lib/services/hrm/kioscoGestionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/marcacion/dispositivos/vincular' });
    return NextResponse.json(await vincularEquipo(ctx, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:dispositivo-vincular');
  }
});
