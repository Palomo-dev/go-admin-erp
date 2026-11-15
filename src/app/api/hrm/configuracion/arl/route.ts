/**
 * Clase de riesgo ARL por sede o cargo (diseño 10.RH.1, «Lo que define tu empresa»).
 * POST { id?, sedeId, cargoId, clase } → crea o edita; DELETE ?id= → quita.
 * La RLS exige hr.parameters.manage.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { guardarReglaArl, quitarReglaArl } from '@/lib/services/hrm/configuracion/parametrosConfig.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req) => {
  try {
    const b = await readOrgBody<{ id?: string | null; sedeId?: number | null; cargoId?: string | null; clase?: number }>(ctx, req, { route: 'hrm/configuracion/arl' });
    await guardarReglaArl(ctx, { id: b?.id ?? null, sedeId: b?.sedeId ?? null, cargoId: b?.cargoId ?? null, clase: Number(b?.clase) });
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:arl');
  }
});

export const DELETE = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: 'hrm/configuracion/arl' });
    await quitarReglaArl(ctx, new URL(req.url).searchParams.get('id') ?? '');
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'config:arl:quitar');
  }
});
