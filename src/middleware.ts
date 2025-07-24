import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Obtener credenciales de Supabase desde variables de entorno
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Extraer referencia del proyecto dinámicamente desde la URL de Supabase
  const projectRef = supabaseUrl.split('.')[0].replace('https://', '');

  // Obtener el token de autenticación de las cookies
  const authCookie = request.cookies.get(`sb-${projectRef}-auth-token`);

  // Crear configuración personalizada para el cliente de Supabase
  const supabaseClientOptions = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce' as const, // Use const assertion to fix type error
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
  let isExpired = false;

  try {
    // 1. Primero intentamos obtener la sesión actual
    const { data } = await supabase.auth.getSession();
    session = data.session;

    // Comprobar si la sesión está expirada por tiempo
    if (session) {
      const expiresAt = session.expires_at;
      const currentTime = Math.floor(Date.now() / 1000); // Convertir a segundos
      
      // Si la sesión ha expirado, marcarla como tal
      if (expiresAt && expiresAt < currentTime) {
        console.log('Sesión expirada por tiempo:', expiresAt ? new Date(expiresAt * 1000).toLocaleString() : 'unknown');
        isExpired = true;
        session = null; // Invalidar la sesión
      } else {
        console.log('Sesión válida hasta:', expiresAt ? new Date(expiresAt * 1000).toLocaleString() : 'unknown');
      }
    }
    
    // 2. Si no hay sesión pero tenemos una cookie de autenticación, intentamos refrescarla
    if (!session && authCookie && !isExpired) {
      try {
        const { data: refreshData, error } = await supabase.auth.refreshSession();
        
        if (error) {
          console.error('Error al refrescar sesión:', error.message);
          if (error.message.includes('expired')) {
            isExpired = true;
          }
        } else {
          session = refreshData.session;
        }
      } catch (refreshError) {
        console.error('Error en proceso de refresh:', refreshError);
        isExpired = true;
      }
    }

    // Determinar si el usuario está autenticado en base a la sesión
    isAuthenticated = !!session;
    
    // Actualizar la actividad del dispositivo si el usuario está autenticado
    if (isAuthenticated && session) {
      try {
        // Obtener el tiempo de última actualización de actividad de la cookie
        const lastActivityUpdate = request.cookies.get('last_activity_update')?.value;
        const currentTime = Date.now();
        console.log('Tiempo de última actualización:', lastActivityUpdate);
        // Solo actualizar si han pasado más de 10 minutos desde la última actualización
        // o si no hay cookie de última actividad
        if (!lastActivityUpdate || (currentTime - parseInt(lastActivityUpdate)) > 600000) {
          // Crear respuesta que será modificada y configurar cookie
          const nextResponse = NextResponse.next();
          
          // Registrar la última actualización en la cookie (10 minutos de vigencia)
          nextResponse.cookies.set('last_activity_update', currentTime.toString(), { 
            maxAge: 600, // 10 minutos en segundos
            path: '/' 
          });
          
          // Hacer una petición asíncrona para actualizar la actividad
          // Usamos el cliente normal en lugar de admin
          try {
            // Ejecutamos la consulta de forma asíncrona sin esperar respuesta
            // para no bloquear la navegación
            void supabase.from('user_devices')
              .update({ last_active_at: new Date().toISOString() })
              .eq('user_id', session.user.id)
              // La sesión en Supabase no tiene una propiedad 'id' directamente
              .eq('is_active', true);
              
            console.log('Solicitud de actualización de actividad enviada');
          } catch (activityUpdateError) {
            console.error('Error al actualizar actividad:', activityUpdateError);
          }
        }
      } catch (activityError) {
        // Ignoramos errores en la actualización de actividad para no bloquear la navegación
        console.error('Error al intentar actualizar actividad:', activityError);
      }
    }

    console.log('Sesión activa:', !!session ? 'Sí' : 'No');
    console.log('Autenticado:', isAuthenticated);
    console.log('Sesión expirada:', isExpired ? 'Sí' : 'No');
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

  // Si la sesión está expirada, redirigir a la página de sesión expirada
  if (isExpired && !request.nextUrl.pathname.startsWith('/auth/session-expired')) {
    console.log('Redirigiendo a página de sesión expirada');
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
  
  // No permitir acceso a la página de sesión expirada si la sesión no está expirada
  if (!isExpired && request.nextUrl.pathname === '/auth/session-expired') {
    console.log('Redirigiendo a inicio: Usuario intentando acceder a sesión expirada sin estar expirado');
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
     * - api/test (test endpoints - no auth required)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/test).*)',
  ],
};
