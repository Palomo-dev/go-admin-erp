import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabase, getProjectRef } from '@/lib/supabase/config';
import { jwtVerify, importSPKI } from 'jose';
import { moduleManagementService } from '@/lib/services/moduleManagementService';

// Session cache para evitar llamadas repetidas a Supabase
interface CachedSession {
  session: any;
  expiresAt: number;
  cachedAt: number;
}

const sessionCache = new Map<string, CachedSession>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const ACTIVITY_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutos

// Supabase JWT public key para validación local
let supabasePublicKey: any = null;

/**
 * Obtiene la clave pública de Supabase para validación JWT local
 */
async function getSupabasePublicKey() {
  if (supabasePublicKey) return supabasePublicKey;
  
  try {
    const projectRef = getProjectRef();
    const response = await fetch(`https://${projectRef}.supabase.co/auth/v1/jwks`);
    const jwks = await response.json();
    
    if (jwks.keys && jwks.keys[0]) {
      const key = jwks.keys[0];
      const pemKey = `-----BEGIN PUBLIC KEY-----\n${key.x5c[0]}\n-----END PUBLIC KEY-----`;
      supabasePublicKey = await importSPKI(pemKey, key.alg);
    }
  } catch (error) {
    console.warn('⚠️ [MIDDLEWARE] Error obteniendo clave pública:', error);
  }
  
  return supabasePublicKey;
}

/**
 * Valida JWT localmente sin llamar a Supabase
 */
async function validateJWTLocally(token: string): Promise<{ valid: boolean; payload?: any; expired?: boolean }> {
  try {
    const publicKey = await getSupabasePublicKey();
    if (!publicKey) return { valid: false };
    
    const { payload } = await jwtVerify(token, publicKey);
    const currentTime = Math.floor(Date.now() / 1000);
    const expired = payload.exp ? payload.exp < currentTime : false;
    
    return { valid: true, payload, expired };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Obtiene sesión desde cache o valida con Supabase
 */
async function getValidatedSession(authCookie: any) {
  const cacheKey = authCookie.value.substring(0, 50); // Usar parte del token como key
  const cached = sessionCache.get(cacheKey);
  const currentTime = Date.now();
  
  // Verificar cache válido
  if (cached && (currentTime - cached.cachedAt) < CACHE_DURATION && cached.expiresAt > currentTime) {
    return { session: cached.session, isAuthenticated: true, isExpired: false };
  }
  
  try {
    const tokenData = JSON.parse(authCookie.value);
    const { access_token, refresh_token, expires_at } = tokenData;
    
    if (!access_token || !refresh_token) {
      return { session: null, isAuthenticated: false, isExpired: false };
    }
    
    // Intentar validación JWT local primero
    const jwtValidation = await validateJWTLocally(access_token);
    
    if (jwtValidation.valid && !jwtValidation.expired) {
      // Crear sesión mock para cache (sin llamar a Supabase)
      const mockSession = {
        access_token,
        refresh_token,
        expires_at,
        user: jwtValidation.payload
      };
      
      // Guardar en cache
      sessionCache.set(cacheKey, {
        session: mockSession,
        expiresAt: (expires_at || 0) * 1000,
        cachedAt: currentTime
      });
      
      // Validación JWT local exitosa
      
      return { session: mockSession, isAuthenticated: true, isExpired: false };
    }
    
    // Si JWT local falla, usar Supabase como fallback
    
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    
    if (error || !data.session) {
      return { session: null, isAuthenticated: false, isExpired: false };
    }
    
    const session = data.session;
    const sessionExpired = !!session.expires_at && session.expires_at < Math.floor(Date.now() / 1000);
    
    if (!sessionExpired) {
      // Guardar en cache
      sessionCache.set(cacheKey, {
        session,
        expiresAt: (session.expires_at || 0) * 1000,
        cachedAt: currentTime
      });
    }
    
    return { 
      session: sessionExpired ? null : session, 
      isAuthenticated: !sessionExpired, 
      isExpired: sessionExpired 
    };
    
  } catch (error) {
    return { session: null, isAuthenticated: false, isExpired: false };
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
    '/auth/v1/',
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
  
  // Verificar si debemos saltar esta ruta completamente
  if (shouldSkipRoute(pathname)) {
    return NextResponse.next();
  }
  
  // Para el middleware en el servidor, necesitamos crear un cliente temporal
  // que pueda leer las cookies del request
  const projectRef = getProjectRef();
  const authCookieName = `sb-${projectRef}-auth-token`;
  let authCookie = request.cookies.get(authCookieName);

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
        authCookie = cookie;
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
    
    // Usar la función optimizada de validación
    const sessionResult = await getValidatedSession(authCookie);
    session = sessionResult.session;
    isAuthenticated = sessionResult.isAuthenticated;
    isExpired = sessionResult.isExpired;
    
    if (isAuthenticated && session?.user?.id) {
      // Acción asíncrona: registrar actividad del usuario (optimizada)
      updateUserActivityOptimized(session.user.id, request);
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
 * Actualiza la actividad del usuario de forma asíncrona (versión legacy)
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
 * Mapeo de rutas a módulos
 */
const routeToModuleMap: Record<string, string> = {
  '/app/organizacion': 'organizations',
  '/app/branding': 'branding',
  '/app/sucursales': 'branches',
  '/app/pos': 'pos_retail',
  '/app/inventario': 'inventory',
  '/app/pms': 'pms_hotel',
  '/app/pms/parking': 'parking',
  '/app/crm': 'crm',
  '/app/hrm': 'hrm',
  '/app/finanzas': 'finance',
  '/app/reportes': 'reports',
  '/app/notificaciones': 'notifications',
  '/app/integraciones': 'integrations',
  '/app/transporte': 'transport',
  '/app/calendario': 'calendar',
  '/app/timeline': 'operations'
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
      
      // Obtener organization_id desde cookies o headers
      const orgCookie = request.cookies.get('organization');
      if (!orgCookie?.value) {
        console.warn('⚠️ [MIDDLEWARE] No organization cookie found');
        return null; // Permitir acceso si no hay organización definida
      }
      
      // Buscar la organización por subdomain
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('subdomain', orgCookie.value)
        .single();
      
      if (!org) {
        console.warn('⚠️ [MIDDLEWARE] Organization not found:', orgCookie.value);
        return null;
      }
      
      organizationId = org.id;
      
    } catch (error) {
      console.error('❌ [MIDDLEWARE] Error parsing auth data:', error);
      return NextResponse.redirect(new URL('/auth/login', request.url));
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

    // Verificar acceso a módulos para rutas protegidas
    if (pathname.startsWith('/app/') && pathname !== '/app/inicio') {
      const moduleAccessResult = await checkModuleAccess(request, pathname);
      if (moduleAccessResult) {
        return moduleAccessResult;
      }
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
