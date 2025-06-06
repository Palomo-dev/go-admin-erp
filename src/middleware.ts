import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This function can be marked `async` if using `await` inside
export async function middleware(request: NextRequest) {
  // Create a Supabase client configured to use cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  // Obtener cookies de autenticación de la solicitud - buscar todas las posibles cookies de Supabase
  const authCookie = request.cookies.get('go-admin-erp-session') || 
                    request.cookies.get('sb-jgmgphmzusbluqhuqihj-auth-token') ||
                    request.cookies.get('sb-auth-token') ||
                    request.cookies.get('sb-access-token') ||
                    request.cookies.get('sb-refresh-token');
  
  // Crear cliente de Supabase con configuración para usar cookies
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  });

  // Verificar si hay una sesión activa
  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    console.log('Sesión activa:', data);
    session = data.session;
    console.log('Sesión activa:', session);
    
    // Si no hay sesión pero existe una cookie de autenticación, intentar restaurar la sesión
    if (!session && authCookie) {
      console.log('Intentando restaurar sesión desde cookie');
      // La sesión podría estar en la cookie pero no accesible por el middleware
      // Usamos este enfoque para considerar que hay una sesión activa si existe la cookie
      session = {}; // Objeto vacío para indicar que hay una sesión
    }
  } catch (error) {
    console.error('Error al verificar sesión:', error);
  }

  // Verificar si hay cookies que indiquen una sesión activa
  // Para middleware, solo podemos verificar cookies, no localStorage
  const hasAuthToken = authCookie || request.cookies.get('sb-access-token');
  
  // Buscar en todas las cookies por cualquier indicio de autenticación
  let hasAnyAuthCookie = false;
  request.cookies.getAll().forEach(cookie => {
    if (cookie.name.includes('auth') || cookie.name.includes('supabase') || cookie.name.includes('sb-')) {
      console.log(`Cookie de autenticación encontrada: ${cookie.name}`);
      hasAnyAuthCookie = true;
    }
  });
  
  // Un usuario está autenticado si tiene una sesión válida o cualquier cookie de autenticación
  const isAuthenticated = !!session || !!hasAuthToken || hasAnyAuthCookie;

  console.log('Sesión activa:', session);
  console.log('Cookies de autenticación:', hasAuthToken);
  console.log('Autenticado:', isAuthenticated);
  console.log('Ruta:', request.nextUrl.pathname);
  
  // Registrar información para depuración
  console.log(`Ruta: ${request.nextUrl.pathname}, Autenticado: ${isAuthenticated}`);
  console.log(`Cookies de autenticación: ${hasAuthToken ? 'Presentes' : 'Ausentes'}`);

  // Verificar si la sesión expiró (había una cookie de sesión pero ya no es válida)
  const sessionExpired = !session && hasAnyAuthCookie;
  
  // Si la sesión expiró y no estamos ya en la página de sesión expirada, redirigir a /auth/session-expired
  if (sessionExpired && request.nextUrl.pathname !== '/auth/session-expired' && 
      !request.nextUrl.pathname.startsWith('/auth/login')) {
    console.log('Redirigiendo a session-expired: Sesión expirada');
    const redirectUrl = new URL('/auth/session-expired', request.url);
    return NextResponse.redirect(redirectUrl);
  }
  
  // Si el usuario no está autenticado y la ruta actual no es /auth/*, redirigir a /auth/login
  if (!isAuthenticated && !request.nextUrl.pathname.startsWith('/auth/')) {
    console.log('Redirigiendo a login: Usuario no autenticado');
    const redirectUrl = new URL('/auth/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Si el usuario está autenticado y la ruta actual es /auth/login, redirigir a /app/inicio
  if (isAuthenticated && request.nextUrl.pathname === '/auth/login') {
    console.log('Redirigiendo a inicio: Usuario ya autenticado en página de login');
    const redirectUrl = new URL('/app/inicio', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Si el usuario está autenticado y la ruta actual es /auth/* (excepto /auth/logout, /auth/invite y /auth/session-expired), redirigir a /app/inicio
  if (isAuthenticated && 
      request.nextUrl.pathname.startsWith('/auth/') && 
      request.nextUrl.pathname !== '/auth/logout' &&
      request.nextUrl.pathname !== '/auth/session-expired' &&
      !request.nextUrl.pathname.startsWith('/auth/invite')) {
    console.log('Redirigiendo a inicio: Usuario autenticado en ruta de autenticación');
    const redirectUrl = new URL('/app/inicio', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Si el usuario no está autenticado y la ruta actual es /app/*, redirigir a /auth/login
  if (!isAuthenticated && request.nextUrl.pathname.startsWith('/app/')) {
    console.log('Redirigiendo a login: Usuario no autenticado intentando acceder a ruta protegida');
    const redirectUrl = new URL('/auth/login', request.url);
    // Agregar la URL actual como parámetro de consulta para poder redirigir después del inicio de sesión
    redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Check for organization in subdomain
  const hostname = request.headers.get('host') || '';
  const subdomain = hostname.split('.')[0];
  
  // If there's a subdomain that's not 'www' and not localhost, set it in a cookie
  if (subdomain !== 'www' && !hostname.includes('localhost')) {
    const response = NextResponse.next();
    response.cookies.set('organization', subdomain, { 
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    return response;
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
