/**
 * POST /api/hrm/kiosco/marcas — { marcas: [...] } (plan de Marcación §7, D7).
 * Lote idempotente por `id_local`: las del kiosco en vivo (ya identificadas, con
 * la foto si la persona la autorizó) y las guardadas sin conexión (con su
 * credencial y su hora). Reenviar el mismo lote no duplica marcas.
 */
import { NextResponse } from 'next/server';
import { autenticarKiosco, marcar } from '@/lib/services/hrm/kioscoService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await autenticarKiosco(req);
  if (!auth.ok) return auth.respuesta;
  try {
    const cuerpo: unknown = await req.json().catch(() => null);
    return NextResponse.json(await marcar(auth.equipo, cuerpo), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'kiosco:marcas');
  }
}
