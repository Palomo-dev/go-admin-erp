/**
 * POST /api/hrm/marcacion/relojes/[id]/qr — genera un token nuevo para el QR del punto.
 *
 * El token lo crea la base (`fn_hr_reloj_qr_rotar`, 244 bits aleatorios) con el
 * vencimiento del punto. Solo `hr.attendance.manage` (ADR-002 §2).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { rotarQr } from '@/lib/services/hrm/marcacionService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    await readOrgBody<unknown>(ctx, req, { route: 'hrm/marcacion/relojes/qr' });
    const id = await parametroDeRuta(routeParams, 'id');
    return NextResponse.json(await rotarQr(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:rotar-qr');
  }
});
