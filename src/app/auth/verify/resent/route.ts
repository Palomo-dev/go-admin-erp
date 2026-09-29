import { NextResponse, type NextRequest } from 'next/server';
import { destinoVerificacionReenviada } from '@/lib/auth/redireccionesAcceso';

/**
 * R9 (docs/design/AUTH-ACCESO-V2.md §6): «enlace reenviado» ya no es una
 * pantalla aparte; es un estado de /auth/verify/failed. Se conserva la ruta
 * para los enlaces y el código que aún apunten aquí.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(destinoVerificacionReenviada(request.nextUrl.searchParams), request.url), 308);
}
