import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabase, getProjectRef } from '@/lib/supabase/config';

/**
 * Middleware para manejar autenticación y autorización
 * Verifica sesiones, maneja redirecciones y actualiza actividad de usuario
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Solo agregar debugging para rutas específicas
  const shouldDebug = pathname.startsWith('/app/') || pathname === '/auth/login';
  
  if (shouldDebug) {
    console.log('🔍 [MIDDLEWARE] Procesando ruta:', pathname);
  }
  
  // Para el middleware en el servidor, necesitamos crear un cliente temporal
  // que pueda leer las cookies del request
  const projectRef = getProjectRef();
  const authCookieName = `sb-${projectRef}-auth-token`;
  let authCookie = request.cookies.get(authCookieName);

  if (shouldDebug) {
    console.log('🔍 [MIDDLEWARE] Verificando autenticación...');
    console.log('🔍 [MIDDLEWARE] Project ref:', projectRef);
    console.log('🔍 [MIDDLEWARE] Buscando cookie:', authCookieName);
    console.log('🔍 [MIDDLEWARE] Auth cookie encontrada:', !!authCookie);
    
    // Mostrar todas las cookies disponibles para debugging
    const allCookies = request.headers.get('cookie') || '';
    const cookieList = allCookies.split(';').map(c => c.trim().split('=')[0]).filter(Boolean);
    console.log('🔍 [MIDDLEWARE] Todas las cookies disponibles:', cookieList);
    
    // Buscar cookies relacionadas con Supabase
    const supabaseCookies = cookieList.filter(name => name.includes('sb-') || name.includes('supabase'));
    console.log('🔍 [MIDDLEWARE] Cookies de Supabase encontradas:', supabaseCookies);
    
    // Si no encontramos la cookie exacta, buscar variaciones
    if (!authCookie) {
      const possibleNames = [
        `sb-${projectRef}-auth-token`,
        `sb-${projectRef}-auth-token-code-verifier`,
        `sb-auth-token`,
        'supabase-auth-token'
      ];
      
      for (const name of possibleNames) {
        const cookie = request.cookies.get(name);
        if (cookie) {
          console.log(`🔍 [MIDDLEWARE] Encontrada cookie alternativa: ${name}`);
          authCookie = cookie;
          break;
        }
      }
    }
  }

  let session = null;
  let isAuthenticated = false;
  let isExpired = false;
  
  // Intentar obtener sesión desde cookie si existe

  if (!authCookie?.value) {
    if (shouldDebug) console.log('🔍 [MIDDLEWARE] No se encontró cookie de autenticación');
    return;
  }
  
  if (shouldDebug) console.log('🔍 [MIDDLEWARE] Parseando cookie de autenticación...');
  
  try {
    // Verificar que la cookie no esté corrupta
    if (authCookie.value === '[object Object]' || 
        authCookie.value.includes('[object Object]') ||
        authCookie.value === 'undefined' ||
        authCookie.value === 'null' ||
        !authCookie.value.trim().startsWith('{')) {
      
      if (shouldDebug) {
        console.warn('⚠️ [MIDDLEWARE] Cookie corrupta detectada:', authCookie.value.substring(0, 50) + '...');
      }
      
      // Limpiar cookie corrupta y redirigir a login
      const response = NextResponse.redirect(new URL('/auth/login?error=corrupted-session', request.url));
      response.cookies.delete(authCookieName);
      
      // También limpiar otras cookies relacionadas
      const allSupabaseCookies = [
        `sb-${projectRef}-auth-token`,
        `sb-${projectRef}-auth-token-code-verifier`,
        'sb-auth-token',
        'supabase-auth-token'
      ];
      
      allSupabaseCookies.forEach(cookieName => {
        response.cookies.delete(cookieName);
      });
      
      return response;
    }
    
    const tokenData = JSON.parse(authCookie.value);
  
    const { access_token, refresh_token, expires_at } = tokenData;
  
    if (shouldDebug) {
      console.log('🔍 [MIDDLEWARE] Token data parseado:', {
        hasAccessToken: !!access_token,
        hasRefreshToken: !!refresh_token,
        expiresAt: expires_at
      });
    }
  
    if (!access_token || !refresh_token) {
      if (shouldDebug) console.warn('⚠️ [MIDDLEWARE] Tokens faltantes en cookie');
      return;
    }
  
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  
    if (shouldDebug) {
      console.log('🔍 [MIDDLEWARE] Resultado setSession:', {
        hasSession: !!data.session,
        hasUser: !!data.session?.user,
        userId: data.session?.user?.id,
        error: error?.message
      });
    }
  
    if (error || !data.session) return;
  
    session = data.session;
    const currentTime = Math.floor(Date.now() / 1000);
  
    isExpired = !!session.expires_at && session.expires_at < currentTime;
  
    if (shouldDebug) {
      console.log('🔍 [MIDDLEWARE] Verificación expiración:', {
        expiresAt: session.expires_at,
        currentTime,
        isExpired
      });
    }
  
    if (isExpired) {
      session = null;
      if (shouldDebug) console.warn('⚠️ [MIDDLEWARE] Sesión expirada');
      return;
    }
  
    isAuthenticated = true;
  
    if (shouldDebug) {
      console.log('✅ [MIDDLEWARE] Usuario autenticado:', session.user.email);
    }
  
    // Acción asíncrona: registrar actividad del usuario
    updateUserActivity(supabase, session.user.id, request);
  
  } catch (cookieError) {
    if (shouldDebug) {
      console.warn('❌ [MIDDLEWARE] Cookie de autenticación corrupta o malformada:', cookieError);
      console.warn('❌ [MIDDLEWARE] Valor de cookie problemática:', authCookie.value.substring(0, 100) + '...');
    }
    
    // Limpiar cookie corrupta y redirigir a login
    const response = NextResponse.redirect(new URL('/auth/login?error=session-parse-error', request.url));
    response.cookies.delete(authCookieName);
    
    // También limpiar otras cookies relacionadas
    const allSupabaseCookies = [
      `sb-${projectRef}-auth-token`,
      `sb-${projectRef}-auth-token-code-verifier`,
      'sb-auth-token',
      'supabase-auth-token'
    ];
    
    allSupabaseCookies.forEach(cookieName => {
      response.cookies.delete(cookieName);
    });
    
    return response;
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
  
  // Solo agregar debugging para rutas específicas
  const shouldDebug = pathname.startsWith('/app/') || pathname === '/auth/login';
  
  if (shouldDebug) {
    console.log('🔍 [MIDDLEWARE] handleRouteProtection:', {
      pathname,
      isAuthenticated,
      isExpired
    });
  }
  
  // Rutas que no requieren autenticación
  const isPublicRoute = (
    pathname.startsWith('/auth/') ||
    pathname === '/auth' ||
    pathname === '/' ||
    pathname.includes('/_next/') ||
    pathname.includes('/auth/v1/') // API de Supabase
  );
  
  if (shouldDebug) {
    console.log('🔍 [MIDDLEWARE] Ruta pública:', isPublicRoute);
  }

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
    if (shouldDebug) {
      console.log('🚀 [MIDDLEWARE] Redirigiendo usuario no autenticado a login');
    }
    const redirectUrl = new URL('/auth/login', request.url);
    if (pathname.startsWith('/app/')) {
      redirectUrl.searchParams.set('redirectTo', pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // Redirigir usuarios autenticados fuera de rutas de auth (excepto logout e invite)
  if (isAuthenticated) {
    if (pathname === '/auth/login') {
      if (shouldDebug) {
        console.log('🚀 [MIDDLEWARE] Redirigiendo usuario autenticado desde login a /app/inicio');
      }
      return NextResponse.redirect(new URL('/app/inicio', request.url));
    }
    
    if (pathname.startsWith('/auth/') && 
        pathname !== '/auth/logout' &&
        pathname !== '/auth/session-expired' &&
        !pathname.startsWith('/auth/invite')) {
      if (shouldDebug) {
        console.log('🚀 [MIDDLEWARE] Redirigiendo usuario autenticado desde auth a /app/inicio');
      }
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

  if (shouldDebug) {
    console.log('✅ [MIDDLEWARE] Permitiendo acceso a la ruta');
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
     * - api/test (test endpoints - no auth required)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/test).*)',
  ],
};
