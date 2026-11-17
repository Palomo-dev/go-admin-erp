/**
 * POST /api/hrm/kiosco/identificar — { id_local, credencial: { tipo, valor } }
 * (Figma 20.29.2, 20.29.5, 20.29.8). PIN o carné → quién es, si autorizó la foto y
 * qué marca le toca. Cuenta los intentos fallidos (5 → bloqueo de 15 min). La
 * organización sale del equipo autenticado, nunca del cuerpo.
 */
import { NextResponse } from 'next/server';
import { autenticarKiosco, identificar } from '@/lib/services/hrm/kioscoService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await autenticarKiosco(req);
  if (!auth.ok) return auth.respuesta;
  try {
    const cuerpo: unknown = await req.json().catch(() => null);
    return NextResponse.json(await identificar(auth.equipo, cuerpo), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'kiosco:identificar');
  }
}
