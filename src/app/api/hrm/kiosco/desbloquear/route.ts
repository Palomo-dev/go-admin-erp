/**
 * POST /api/hrm/kiosco/desbloquear — { pin, credencial_id? } (Figma 20.29.9).
 * Un supervisor con hr.attendance.manage escribe su PIN para desbloquear el
 * teclado del kiosco y, si se sabe, el PIN de la persona. Queda registrado quién
 * y cuándo. Sus fallos tienen su propio tope (5 en 15 min).
 */
import { NextResponse } from 'next/server';
import { autenticarKiosco, desbloquear } from '@/lib/services/hrm/kioscoService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await autenticarKiosco(req);
  if (!auth.ok) return auth.respuesta;
  try {
    const cuerpo: unknown = await req.json().catch(() => null);
    return NextResponse.json(await desbloquear(auth.equipo, cuerpo), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'kiosco:desbloquear');
  }
}
