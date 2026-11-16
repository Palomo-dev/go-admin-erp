/**
 * GET /api/hrm/jornada/nomina?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Lo que consume la nómina (fase 3), solo de días «lista para nómina»: horas por
 * categoría, recargo y divisor (la extra, limitada a lo aprobado), descuentos,
 * ausencias con sus tramos de pago, dominicales del mes y días que faltan
 * (ADR-002 §4). `hr.payroll.view`, `hr.payroll.process` o `hr.attendance.view`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { paraNomina } from '@/lib/services/hrm/jornadaService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await paraNomina(ctx, q.get('desde') ?? '', q.get('hasta') ?? ''), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'jornada:nomina');
  }
});
