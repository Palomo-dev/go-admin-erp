/**
 * GET /api/hrm/kiosco/config — configuración del equipo vinculado (Figma 20.29.1):
 * organización y sede (del equipo, nunca de la petición), métodos activos, clave
 * del QR que cambia cada 30 s, foto de evidencia y bloqueo del teclado.
 * Autentica con `Authorization: Bearer <clave del equipo>`.
 */
import { NextResponse } from 'next/server';
import { autenticarKiosco, configKiosco } from '@/lib/services/hrm/kioscoService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await autenticarKiosco(req);
  if (!auth.ok) return auth.respuesta;
  try {
    return NextResponse.json(await configKiosco(auth.equipo), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'kiosco:config');
  }
}
