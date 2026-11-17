/**
 * GET /api/hrm/marcacion/en-vivo?sede= — Marcación › En vivo (Figma 20.26): marcas de
 * hoy con su método, intentos rechazados e indicadores. Las mismas filas que lee
 * Asistencia (D1). Alcance y permisos: `fn_hr_marcacion_en_vivo`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { sedeDeQuery } from '@/lib/services/hrm/asistenciaService.server';
import { enVivo } from '@/lib/services/hrm/marcacionGestionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const sede = sedeDeQuery(new URL(req.url).searchParams.get('sede'));
    return NextResponse.json(await enVivo(ctx, sede), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:en-vivo');
  }
});
