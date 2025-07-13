import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

// Especificar el runtime para este middleware
export const config = {
  runtime: 'edge',
  matcher: [
    /*
     * Excluir rutas para archivos estáticos, api routes, y otros que no deban
     * procesarse con este middleware
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

export async function middleware(request: NextRequest) {
  // Obtener credenciales de Supabase desde variables de entorno
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Extraer referencia del proyecto dinámicamente desde la URL de Supabase
  const projectRef = supabaseUrl.split('.')[0].replace('https://', '');

  // Obtener el token de autenticación de las cookies
  const authCookie = request.cookies.get(`sb-${projectRef}-auth-token`);
  
  // Verificar si es una solicitud POST, PUT, DELETE o PATCH que requiere protección CSRF
  const requiresCsrfCheck = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) &&
    !request.nextUrl.pathname.startsWith('/auth/') &&
    !request.nextUrl.pathname.includes('/api/csrf') &&
    !request.nextUrl.pathname.includes('/auth/v1/');
  
  if (requiresCsrfCheck) {
    const csrfToken = request.headers.get('X-CSRF-Token');
    const csrfCookie = request.cookies.get('csrf_token');
    
    if (!csrfToken || !csrfCookie || csrfToken !== csrfCookie.value) {
      return new NextResponse(JSON.stringify({ error: 'Invalid CSRF token' }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' } 
      });
    }
  }

  // Crear configuración personalizada para el cliente de Supabase
  const supabaseClientOptions = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce' as const, // Usar as const para evitar problemas de tipos
      // Si tenemos un token de autenticación en la cookie, lo usamos como sesión inicial
      ...(authCookie && {
        storageKey: `sb-${projectRef}-auth-token`,
        storage: {
          getItem: () => authCookie.value,
          setItem: () => {},
          removeItem: () => {}
        }
      })
    }
  };

  // Crear cliente de Supabase con la configuración personalizada
  const supabase = createClient(supabaseUrl, supabaseKey, supabaseClientOptions);

  // Verificar si hay una sesión activa usando el cliente de Supabase
  let session = null;
  let isAuthenticated = false;

  try {
    // 1. Primero intentamos obtener la sesión actual
    const { data } = await supabase.auth.getSession();
    session = data.session;

    // 2. Si no hay sesión pero tenemos una cookie de autenticación, intentamos refrescarla
    if (!session && authCookie) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      session = refreshData.session;
    }

    // Determinar si el usuario está autenticado en base a la sesión
    isAuthenticated = !!session;

    console.log('Sesión activa:', !!session ? 'Sí' : 'No');
    console.log('Autenticado:', isAuthenticated);
  } catch (error) {
    console.error('Error al verificar/refrescar sesión:', error);
    isAuthenticated = false;
  }

  // Registrar información para depuración
  console.log(`Ruta: ${request.nextUrl.pathname}`);
  console.log(`Token en cookie: ${!!authCookie}`);

  // Determinar si estamos en una ruta pública (que no requiere autenticación)
  const isPublicRoute = (
    request.nextUrl.pathname.startsWith('/auth/') ||
    request.nextUrl.pathname === '/auth' ||
    request.nextUrl.pathname === '/' ||
    request.nextUrl.pathname.includes('/_next/')
  );

  // Comprobar si estamos accediendo a API de Supabase
  const isSupabaseRequest = request.nextUrl.pathname.includes('/auth/v1/');

  // Si es una solicitud a la API de Supabase, permitir pasar
  if (isSupabaseRequest) {
    return NextResponse.next();
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

  // Generar una respuesta base
  let response = NextResponse.next();
  
  // Verificar CSRF solo para métodos que modifican datos
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && 
      !request.nextUrl.pathname.startsWith('/api/csrf') && 
      !request.nextUrl.pathname.includes('/auth/v1/')) {
    
    const csrfToken = request.headers.get('X-CSRF-Token');
    const csrfCookie = request.cookies.get('csrf_token');
    
    // Si no hay token CSRF o no coincide con la cookie, rechazar la solicitud
    if (!csrfToken || !csrfCookie || csrfToken !== csrfCookie.value) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid CSRF token' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
  
  // Check for organization in subdomain
  const hostname = request.headers.get('host') || '';
  const subdomain = hostname.split('.')[0];
  
  // If there's a subdomain that's not 'www' and not localhost, set it in a cookie
  if (subdomain !== 'www' && !hostname.includes('localhost')) {
    response.cookies.set('organization', subdomain, { 
      path: '/',
      sameSite: 'lax',
      httpOnly: false, // Necesitamos acceder a esto desde JavaScript
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400 * 30 // 30 días
    });
  }

  return response;
}

// La configuración ya está definida arriba
