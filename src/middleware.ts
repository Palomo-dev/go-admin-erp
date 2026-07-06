import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabase, getProjectRef } from '@/lib/supabase/config';
import { decodeJwt } from 'jose';
import { moduleManagementService } from '@/lib/services/moduleManagementService';

const ACTIVITY_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutos


/**
 * Obtiene sesión desde la cookie de forma SIMPLE y tolerante a fallos.
 * 
 * PRINCIPIO: El middleware NUNCA intenta refrescar tokens.
 * Solo verifica que la cookie existe y contiene un JWT decodificable.
 * El refresh lo maneja exclusivamente el client-side (auth-manager.ts).
 * Esto elimina race conditions por refresh token rotation.
 */
async function getValidatedSession(authCookie: any) {
  try {
    const tokenData = JSON.parse(authCookie.value);
    const { access_token, refresh_token } = tokenData;
    
    // Si no hay tokens básicos, no hay sesión
    if (!access_token) {
      return { session: null, isAuthenticated: false, isExpired: false, newCookieValue: null };
    }
    
    // Decodificar el JWT sin verificar firma (solo para obtener payload/exp)
    let payload: any = null;
    try {
      payload = decodeJwt(access_token);
    } catch {
      // Si ni siquiera se puede decodificar, la cookie está corrupta
      return { session: null, isAuthenticated: false, isExpired: false, newCookieValue: null };
    }
    
    // Verificar expiración
    const currentTime = Math.floor(Date.now() / 1000);
    const isExpired = payload.exp ? payload.exp < currentTime : false;
    
    // SIEMPRE considerar autenticado si tenemos un JWT decodificable con sub (user id)
    // El client-side se encarga de refrescar si está expirado
    if (payload.sub) {
      const session = {
        access_token,
        refresh_token,
        expires_at: payload.exp,
        user: payload
      };
      
      // Solo marcar como NO autenticado si expiró hace más de 7 días
      // (sesión abandonada, no un refresh pendiente)
      const HARD_EXPIRY = 7 * 24 * 60 * 60; // 7 días en segundos
      const timeSinceExpiry = currentTime - (payload.exp || currentTime);
      
      if (isExpired && timeSinceExpiry > HARD_EXPIRY) {
        return { session: null, isAuthenticated: false, isExpired: true, newCookieValue: null };
      }
      
      // Token válido o expirado recientemente → autenticado (client refreshará)
      return { session, isAuthenticated: true, isExpired: false, newCookieValue: null };
    }
    
    return { session: null, isAuthenticated: false, isExpired: false, newCookieValue: null };
    
  } catch (error) {
    // Error parseando JSON → cookie corrupta
    return { session: null, isAuthenticated: false, isExpired: false, newCookieValue: null };
  }
}

/**
 * Verifica si la ruta debe ser excluida del middleware
 */
function shouldSkipRoute(pathname: string): boolean {
  const skipPatterns = [
    '/_next/',
    '/favicon.ico',
    '/public/',
    '/api/test',
    '/api/stripe/',  // <-- Excluir APIs de Stripe
    '/api/sessions/', // <-- Excluir APIs de sesiones
    '/api/integrations/twilio/', // <-- Excluir webhooks de Twilio (autenticación propia via firma)
    '/api/super-admin-access', // <-- Excluir canje de token de super admin (autenticación propia via token BD)
    '/api/super-admin-cleanup', // <-- Excluir cleanup de super admin (autenticación propia via body)
    '/auth/v1/',
    '/auth/callback', // <-- Excluir callback de OAuth para no interferir con PKCE
    '/.well-known/',
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.json'
  ];
  
  return skipPatterns.some(pattern => pathname.startsWith(pattern)) ||
         !!pathname.match(/\.(ico|png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|eot)$/);
}

/**
 * Middleware para manejar autenticación y autorización
 * Verifica sesiones, maneja redirecciones y actualiza actividad de usuario
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Interceptar OAuth code en raíz: Supabase redirige a /?code=xxx, reenviar a /auth/callback
  if (pathname === '/' && request.nextUrl.searchParams.has('code')) {
    const code = request.nextUrl.searchParams.get('code');
    const callbackUrl = new URL('/auth/callback', request.url);
    callbackUrl.searchParams.set('code', code!);
    return NextResponse.redirect(callbackUrl);
  }
  
  // Verificar si debemos saltar esta ruta completamente
  if (shouldSkipRoute(pathname)) {
    return NextResponse.next();
  }
  
  // Para el middleware en el servidor, necesitamos crear un cliente temporal
  // que pueda leer las cookies del request
  const projectRef = getProjectRef();
  const authCookieName = `sb-${projectRef}-auth-token`;
  let authCookie = request.cookies.get(authCookieName);

  // Si no encontramos la cookie exacta, buscar chunked cookies o variaciones
  if (!authCookie) {
    // Supabase SSR divide cookies grandes en chunks: .0, .1, .2...
    const chunk0 = request.cookies.get(`${authCookieName}.0`);
    if (chunk0) {
      let fullValue = chunk0.value;
      let i = 1;
      while (true) {
        const chunk = request.cookies.get(`${authCookieName}.${i}`);
        if (!chunk) break;
        fullValue += chunk.value;
        i++;
      }
      authCookie = { name: authCookieName, value: fullValue };
    }
  }
  
  if (!authCookie) {
    const possibleNames = [
      `sb-auth-token`,
      'supabase-auth-token'
    ];
    
    for (const name of possibleNames) {
      const cookie = request.cookies.get(name);
      if (cookie) {
        authCookie = cookie;
        break;
      }
      // También buscar chunks de estas variaciones
      const chunk0 = request.cookies.get(`${name}.0`);
      if (chunk0) {
        let fullValue = chunk0.value;
        let i = 1;
        while (true) {
          const chunk = request.cookies.get(`${name}.${i}`);
          if (!chunk) break;
          fullValue += chunk.value;
          i++;
        }
        authCookie = { name, value: fullValue };
        break;
      }
    }
  }

  // Usar la nueva función optimizada para validar sesión
  let session = null;
  let isAuthenticated = false;
  let isExpired = false;
  
  if (!authCookie?.value) {
    // No hay cookie de autenticación
  } else {
    // Verificar que la cookie no esté corrupta
    if (authCookie.value === '[object Object]' || 
        authCookie.value.includes('[object Object]') ||
        authCookie.value === 'undefined' ||
        authCookie.value === 'null' ||
        !authCookie.value.trim().startsWith('{')) {
      
      // Cookie corrupta detectada
      
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
    
    // Validar sesión de forma simple (sin refresh, sin llamadas externas)
    const sessionResult = await getValidatedSession(authCookie);
    session = sessionResult.session;
    isAuthenticated = sessionResult.isAuthenticated;
    isExpired = sessionResult.isExpired;
    
    if (isAuthenticated && session?.user?.sub) {
      // Acción asíncrona: registrar actividad del usuario (optimizada)
      updateUserActivityOptimized(session.user.sub, request);
    }
  }
  

  return await handleRouteProtection(request, isAuthenticated, isExpired);
}

/**
 * Actualiza la actividad del usuario de forma asíncrona (versión optimizada)
 */
function updateUserActivityOptimized(userId: string, request: NextRequest) {
  const lastActivityUpdate = request.cookies.get('last_activity_update')?.value;
  const currentTime = Date.now();
  
  // Solo actualizar si han pasado más de 10 minutos
  if (!lastActivityUpdate || (currentTime - parseInt(lastActivityUpdate)) > ACTIVITY_UPDATE_INTERVAL) {
    // Actualizar de forma completamente asíncrona sin bloquear
    Promise.resolve().then(async () => {
      try {
        await supabase
          .from('user_devices')
          .update({ last_active_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('is_active', true);
      } catch (error) {
        // Ignorar errores de actividad para no afectar navegación
        console.warn('⚠️ [MIDDLEWARE] Error actualizando actividad:', error);
      }
    });
  }
}


/**
 * Mapeo de rutas a módulos
 */
const routeToModuleMap: Record<string, string> = {
  '/app/organizacion': 'organizations',
  '/app/branding': 'branding',
  '/app/sucursales': 'branches',
  '/app/pos': 'pos',
  '/app/inventario': 'inventory',
  '/app/pms': 'pms_hotel',
  '/app/parking': 'parking',
  '/app/crm': 'crm',
  '/app/hrm': 'hrm',
  '/app/finanzas': 'finance',
  '/app/reportes': 'reports',
  '/app/notificaciones': 'notifications',
  '/app/integraciones': 'integrations',
  '/app/transporte': 'transport',
  '/app/calendario': 'calendar',
  '/app/timeline': 'operations',
  '/app/chat': 'chat',
  '/app/gym': 'gym',
};

/**
 * Obtiene el código del módulo basado en la ruta
 */
function getModuleFromPath(pathname: string): string | null {
  // Buscar coincidencia exacta primero
  if (routeToModuleMap[pathname]) {
    return routeToModuleMap[pathname];
  }
  
  // Buscar por prefijo (para subrutas)
  for (const [route, module] of Object.entries(routeToModuleMap)) {
    if (pathname.startsWith(route + '/')) {
      return module;
    }
  }
  
  return null;
}

/**
 * Verifica el acceso a módulos para una ruta específica
 */
async function checkModuleAccess(request: NextRequest, pathname: string): Promise<NextResponse | null> {
  try {
    const moduleCode = getModuleFromPath(pathname);
    if (!moduleCode) {
      // Si no hay módulo asociado, permitir acceso
      return null;
    }

    // Obtener información del usuario desde las cookies
    const authCookie = request.cookies.get('sb-jgmgphmzusbluqhuqihj-auth-token');
    if (!authCookie?.value) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Parsear el token para obtener user_id
    let userId: string;
    let organizationId: number;
    
    try {
      const authData = JSON.parse(authCookie.value);
      userId = authData.user?.id;
      
      // Obtener organization_id desde localStorage via currentOrganizationId
      // En middleware no tenemos acceso a localStorage, así que usamos cookies
      const orgCookie = request.cookies.get('organization');
      
      if (!orgCookie?.value) {
        console.warn('⚠️ [MIDDLEWARE] No organization cookie found - allowing access');
        return null; // Permitir acceso si no hay organización definida
      }
      
      // Buscar la organización por subdomain
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('subdomain', orgCookie.value)
        .single();
      
      if (orgError || !org) {
        console.warn('⚠️ [MIDDLEWARE] Organization not found or error:', orgCookie.value, orgError);
        // Permitir acceso en caso de error para no bloquear la navegación
        return null;
      }
      
      organizationId = org.id;
      
    } catch (error) {
      console.error('❌ [MIDDLEWARE] Error parsing auth data:', error);
      // Permitir acceso en caso de error para no bloquear
      return null;
    }

    // Verificar si la organización puede acceder al módulo
    const canAccess = await moduleManagementService.canAccessModule(organizationId, moduleCode);
    
    if (!canAccess) {
      console.log(`🚫 [MIDDLEWARE] Access denied to module ${moduleCode} for organization ${organizationId}`);
      
      // Redirigir a página de acceso denegado o inicio
      const redirectUrl = new URL('/app/inicio', request.url);
      redirectUrl.searchParams.set('error', 'module_not_activated');
      redirectUrl.searchParams.set('module', moduleCode);
      return NextResponse.redirect(redirectUrl);
    }

    return null; // Permitir acceso
    
  } catch (error) {
    console.error('❌ [MIDDLEWARE] Error checking module access:', error);
    return null; // En caso de error, permitir acceso para evitar bloqueos
  }
}

/**
 * Maneja la protección de rutas y redirecciones
 */
async function handleRouteProtection(request: NextRequest, isAuthenticated: boolean, isExpired: boolean) {
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

  // Manejar sesión expirada - solo redirigir si está REALMENTE expirada (fuera de grace period)
  // El client-side SDK maneja el refresh automáticamente en la mayoría de casos
  if (isExpired && !isPublicRoute) {
    console.log('🔒 [MIDDLEWARE] Sesión expirada fuera de grace period, redirigiendo a login');
    const redirectUrl = new URL('/auth/login', request.url);
    if (pathname.startsWith('/app/')) {
      redirectUrl.searchParams.set('redirectTo', pathname);
    }
    redirectUrl.searchParams.set('reason', 'expired');
    return NextResponse.redirect(redirectUrl);
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
        !pathname.startsWith('/auth/invite') &&
        !pathname.startsWith('/auth/select-organization') &&
        !pathname.startsWith('/auth/signup') &&
        !pathname.startsWith('/auth/super-admin-access')) {
      if (shouldDebug) {
        console.log('🚀 [MIDDLEWARE] Redirigiendo usuario autenticado desde auth a /app/inicio');
      }
      return NextResponse.redirect(new URL('/app/inicio', request.url));
    }

    // Verificar acceso a módulos para rutas protegidas
    // Excluir rutas core que siempre deben ser accesibles
    const coreRoutes = ['/app/inicio', '/app/clientes', '/app/organizacion', '/app/roles', '/app/plan'];
    const isCorePath = coreRoutes.some(r => pathname === r || pathname.startsWith(r + '/'));
    
    if (pathname.startsWith('/app/') && !isCorePath) {
      const moduleAccessResult = await checkModuleAccess(request, pathname);
      if (moduleAccessResult) {
        return moduleAccessResult;
      }
    }
  }

  // Manejar subdominios para organizaciones
  const hostname = request.headers.get('host') || '';
  const parts = hostname.split('.');
  
  // Para app.goadmin.io → parts = ['app', 'goadmin', 'io'] → NO es subdominio de organización
  // Para empresa1.app.goadmin.io → parts = ['empresa1', 'app', 'goadmin', 'io'] → SÍ es subdominio de organización
  
  // Si es localhost (desarrollo)
  if (hostname.includes('localhost')) {
    return NextResponse.next();
  }
  
  // Si tiene 4 partes o más, es un subdominio de tercer nivel (organización)
  // Ejemplo: empresa1.app.goadmin.io
  if (parts.length >= 4) {
    const orgSubdomain = parts[0]; // El primer segmento es la organización
    
    if (orgSubdomain !== 'www') {
      const response = NextResponse.next();
      response.cookies.set('organization', orgSubdomain, { 
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });
      return response;
    }
  }
  
  // Si tiene 3 partes (app.goadmin.io o goadmin.io), no es subdominio de organización
  // No establecer cookie de organización

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
     * - api/stripe (Stripe API endpoints - handle their own auth)
     * - api/sessions (Session API endpoints - handle their own auth)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/test|api/stripe|api/sessions|api/integrations/twilio|api/super-admin-access|api/super-admin-cleanup).*)',
  ],
};
