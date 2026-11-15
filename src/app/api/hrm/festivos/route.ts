/**
 * GET /api/hrm/festivos?desde=2026-01-01&hasta=2026-12-31[&sede=12]
 * Festivos de la plataforma (país de la organización) y días propios de la
 * organización o de la sede (ADR-001 §5).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { festivos } from '@/lib/services/hrm/parametrosService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const q = new URL(req.url).searchParams;
    const sede = q.get('sede');
    if (sede !== null && !/^\d{1,9}$/.test(sede)) throw new HrmError(400, 'sede_invalida');
    const lista = await festivos(ctx, q.get('desde') ?? '', q.get('hasta') ?? '', sede === null ? null : Number(sede));
    return NextResponse.json({ festivos: lista }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'festivos');
  }
});
