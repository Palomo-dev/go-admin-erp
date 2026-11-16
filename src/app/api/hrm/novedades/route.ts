/**
 * POST /api/hrm/novedades — novedades de asistencia que registra una persona (ADR-002 §4).
 *
 * { accion: 'justificar', novedad_id, justificacion }
 * { accion: 'ausencia', vinculo_id, fecha, minutos?, motivo? }           (hr.attendance.manage)
 * { accion: 'cambio_turno', asignacion_id, con_asignacion_id | con_vinculo_id, motivo? }
 * { accion: 'aceptar_cambio' | 'rechazar_cambio', novedad_id }           (la contraparte)
 *
 * Aprobar o rechazar va por /api/hrm/aprobaciones/[id] (motor de la fase 0).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { registrarNovedad } from '@/lib/services/hrm/ausenciasService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/novedades' });
    return NextResponse.json(await registrarNovedad(ctx, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'novedades:registrar');
  }
});
