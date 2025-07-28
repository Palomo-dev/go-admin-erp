import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

/**
 * Middleware para manejar autenticación y autorización
 * Verifica sesiones, maneja redirecciones y actualiza actividad de usuario
 */
export async function middleware(request: NextRequest) {
  // Configuración de Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const projectRef = supabaseUrl.split('.')[0].replace('https://', '');
  const authCookie = request.cookies.get(`sb-${projectRef}-auth-token`);

  // Crear cliente de Supabase para middleware
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  });

  let session = null;
  let isAuthenticated = false;
  let isExpired = false;

  try {
    // Intentar obtener sesión desde cookie si existe
    if (authCookie?.value) {
      try {
        const tokenData = JSON.parse(authCookie.value);
        if (tokenData.access_token && tokenData.refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token
          });
          
          if (!error && data.session) {
            session = data.session;
            
            // Verificar expiración
            const expiresAt = session.expires_at;
            const currentTime = Math.floor(Date.now() / 1000);
            
            if (expiresAt && expiresAt < currentTime) {
              isExpired = true;
              session = null;
            }
          }
        }
      } catch (parseError) {
        // Cookie malformada, continuar sin sesión
      }
    }

    isAuthenticated = !!session && !isExpired;
    
    // Actualizar actividad del usuario (sin bloquear)
    if (isAuthenticated && session) {
      updateUserActivity(supabase, session.user.id, request);
    }
    
  } catch (error) {
    // Error en verificación de sesión, continuar sin autenticación
    isAuthenticated = false;
  }

  return handleRouteProtection(request, isAuthenticated, isExpired);
}

/**
 * Actualiza la actividad del usuario de forma asíncrona
 */
function updateUserActivity(supabase: any, userId: string, request: NextRequest) {
  const lastActivityUpdate = request.cookies.get('last_activity_update')?.value;
  const currentTime = Date.now();
  const TEN_MINUTES = 600000; // 10 minutos en ms
  
  // Solo actualizar si han pasado más de 10 minutos
  if (!lastActivityUpdate || (currentTime - parseInt(lastActivityUpdate)) > TEN_MINUTES) {
    // Actualizar de forma asíncrona sin bloquear
    void supabase
      .from('user_devices')
      .update({ last_active_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_active', true)
      .then(() => {
        // Marcar la actualización en cookie
        // Nota: No podemos modificar cookies aquí, se haría en el response
      })
      .catch(() => {
        // Ignorar errores de actividad para no afectar navegación
      });
  }
}

/**
 * Maneja la protección de rutas y redirecciones
 */
function handleRouteProtection(request: NextRequest, isAuthenticated: boolean, isExpired: boolean) {
  const { pathname } = request.nextUrl;
  
  // Rutas que no requieren autenticación
  const isPublicRoute = (
    pathname.startsWith('/auth/') ||
    pathname === '/auth' ||
    pathname === '/' ||
    pathname.includes('/_next/') ||
    pathname.includes('/auth/v1/') // API de Supabase
  );

  // Permitir acceso a API de Supabase
  if (pathname.includes('/auth/v1/')) {
    return NextResponse.next();
  }

  // Manejar sesión expirada
  if (isExpired && !pathname.startsWith('/auth/session-expired')) {
    return NextResponse.redirect(new URL('/auth/session-expired', request.url));
  }
  
  // Prevenir acceso a página de sesión expirada si no está expirada
  if (!isExpired && pathname === '/auth/session-expired') {
    return NextResponse.redirect(new URL('/app/inicio', request.url));
  }

  // Redirigir usuarios no autenticados a login
  if (!isAuthenticated && !isPublicRoute) {
    const redirectUrl = new URL('/auth/login', request.url);
    if (pathname.startsWith('/app/')) {
      redirectUrl.searchParams.set('redirectTo', pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // Redirigir usuarios autenticados fuera de rutas de auth (excepto logout e invite)
  if (isAuthenticated) {
    if (pathname === '/auth/login') {
      return NextResponse.redirect(new URL('/app/inicio', request.url));
    }
    
    if (pathname.startsWith('/auth/') && 
        pathname !== '/auth/logout' &&
        pathname !== '/auth/session-expired' &&
        !pathname.startsWith('/auth/invite')) {
      return NextResponse.redirect(new URL('/app/inicio', request.url));
    }
  }

  // Manejar subdominios para organizaciones
  const hostname = request.headers.get('host') || '';
  const subdomain = hostname.split('.')[0];
  
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
