/**
 * POST /api/hrm/kiosco/vinculo — { llave_hash } (Figma 20.29.7).
 * La tablet o el computador sin vincular pide su código de 6 caracteres con el
 * SHA-256 de la clave que generó; vuelve a llamar hasta que RR. HH. lo vincule
 * (`{ estado: 'vinculado' }`). Sin sesión y fuera del middleware: es el canje de
 * un código de un solo uso con límite por IP (`checkRateLimit` en
 * `codigoDeVinculo`) y la base no devuelve nada de la organización.
 */
import { NextResponse } from 'next/server';
import { codigoDeVinculo } from '@/lib/services/hrm/kioscoService.server';
import { responderError } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const cuerpo: unknown = await req.json().catch(() => null);
    if (cuerpo === null) return NextResponse.json({ error: 'llave_invalida', code: 'llave_invalida' }, { status: 422 });
    return await codigoDeVinculo(req, cuerpo);
  } catch (err) {
    return responderError(err, 'kiosco:vinculo');
  }
}
