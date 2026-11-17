/**
 * GET /api/hrm/marcacion/dispositivos/[id]/pantalla — datos de la Pantalla de QR
 * (clave del punto para calcular el código cada 30 s, sede y hora del servidor).
 * GET …/pantalla?paso=N — qué códigos del paso ya se usaron, para pasar al siguiente.
 * Solo `hr.attendance.manage` (lo comprueba la base). La vinculación de la pantalla
 * con clave propia, sin la sesión de una persona, llega con el kiosco (M1).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { pantallaQr, usosPantallaQr } from '@/lib/services/hrm/marcacionGestionService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await parametroDeRuta(routeParams, 'id');
    const paso = new URL(req.url).searchParams.get('paso');
    return NextResponse.json(paso === null ? await pantallaQr(ctx, id) : await usosPantallaQr(ctx, id, paso), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:pantalla');
  }
});
