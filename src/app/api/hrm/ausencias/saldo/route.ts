/**
 * GET /api/hrm/ausencias/saldo?vinculo=<uuid>&fecha=YYYY-MM-DD
 *
 * Saldo de vacaciones por causación (15 días hábiles por año, base 360): causados,
 * disfrutados, programados, pendientes y disponibles (ADR-002 §5). Lo ve el
 * titular, su jefe y quien tiene `hr.leaves.view` o `hr.leaves.approve`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { saldoVacaciones } from '@/lib/services/hrm/ausenciasService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await saldoVacaciones(ctx, q.get('vinculo') ?? '', q.get('fecha')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'ausencias:saldo');
  }
});
