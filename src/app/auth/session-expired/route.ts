import { NextResponse, type NextRequest } from 'next/server';
import { destinoSesionVencida } from '@/lib/auth/redireccionesAcceso';

/**
 * R2 (docs/design/AUTH-ACCESO-V2.md §6, decisión v2-10): la pantalla de sesión
 * vencida pasa a ser el aviso del login (`?reason=expired`), que además intenta
 * recuperar la sesión con el refresh token del dispositivo. La limpieza del
 * almacenamiento que hacía esta pantalla vive ahora en /auth/logout (R3).
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(destinoSesionVencida(request.nextUrl.searchParams), request.url), 308);
}
