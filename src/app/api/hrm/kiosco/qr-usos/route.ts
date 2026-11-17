/**
 * GET /api/hrm/kiosco/qr-usos?paso= — qué códigos del QR del kiosco ya se usaron
 * en el paso de 30 s, para pasar al siguiente apenas alguien marca (D9).
 */
import { NextResponse } from 'next/server';
import { autenticarKiosco, usosQrKiosco } from '@/lib/services/hrm/kioscoService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await autenticarKiosco(req);
  if (!auth.ok) return auth.respuesta;
  try {
    return NextResponse.json(await usosQrKiosco(auth.equipo, new URL(req.url).searchParams.get('paso')), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'kiosco:qr-usos');
  }
}
