import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Especificar que este endpoint usa Edge Runtime
export const runtime = 'edge';

/**
 * Genera un token CSRF seguro usando la Web Crypto API compatible con Edge Runtime
 */
function generateCsrfToken() {
  const randomValues = new Uint8Array(32);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function GET() {
  // En Next.js 15.3.1 con Edge Runtime
  try {
    // Obtener las cookies - es asíncrono en Next.js 15.3.1
    const cookieStore = await cookies();
    const existingCsrfToken = cookieStore.get('csrf_token');
    
    // Usar el token existente o generar uno nuevo
    const csrfToken = existingCsrfToken?.value || generateCsrfToken();
    
    // Crear la respuesta
    const response = NextResponse.json({ success: true });
    
    // Establecer la cookie y el encabezado
    response.cookies.set('csrf_token', csrfToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400 // 24 horas
    });
    
    // Incluir el token CSRF en los encabezados para que el cliente pueda acceder
    response.headers.set('X-CSRF-Token', csrfToken);
    
    return response;
  } catch (error) {
    // En caso de error, devolver una respuesta con información de diagnóstico
    console.error('Error en la generación de token CSRF:', error);
    return NextResponse.json({ error: 'Error generando token CSRF' }, { status: 500 });
  }
}
