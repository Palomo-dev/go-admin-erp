import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';
import { decodeJwt } from 'jose';
import {
  edgeSelect,
  edgePatch,
  getProjectRef,
  MW_DB_BUDGET_MS,
} from '@/lib/supabase/edge-rest';

const ACTIVITY_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutos

/**
 * Cookie con el veredicto de acceso ya calculado, para no repetir las 6
 * consultas de gating en cada navegacion. Solo se cachean veredictos
 * POSITIVOS (acceso permitido); un bloqueo nunca se cachea.
 *
 * La cookie va FIRMADA con HMAC-SHA256. Sin firma, el cliente podria
 * fabricarla y saltarse la verificacion de modulos durante GATE_TTL_SECONDS,
 * porque tanto los modulos como la organizacion viajaban en claro y las
 * cookies de organizacion las controla el propio navegador.
 *
 * Si GATE_COOKIE_SECRET no esta definido, el cache se desactiva por completo
 * (se hacen las consultas reales). Nunca se confia en una cookie sin firmar.
 */
const GATE_COOKIE = 'ga_gate';
const GATE_TTL_SECONDS = 60;
const GATE_SECRET = process.env.GATE_COOKIE_SECRET || '';

/** La clave HMAC se importa una sola vez por instancia del runtime. */
let gateKeyPromise: Promise<CryptoKey> | null = null;
function getGateKey(): Promise<CryptoKey> {
  if (!gateKeyPromise) {
    gateKeyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(GATE_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
  return gateKeyPromise;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gateSignature(payload: string): Promise<string> {
  const key = await getGateKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(sig));
}

/** Comparacion en tiempo constante: no revela el prefijo correcto de la firma. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


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
    '/api/integrations/whatsapp/webhook', // <-- Excluir webhook de WhatsApp Cloud API (verificación Meta)
    '/api/integrations/whatsapp/qr/inbound', // <-- Excluir callback del microservicio Baileys (autenticación propia via shared secret)
    '/api/integrations/whatsapp/qr/dispatch-pending', // <-- F0: despacho QR invocado por cron (fail-closed via Authorization: Bearer CRON_SECRET)
    '/api/voice/', // <-- F0: webhooks Twilio de voz (firma X-Twilio-Signature fail-closed) y rutas de sesión (getServerOrgContext → 401 JSON, no redirect)
    '/api/super-admin-access', // <-- Excluir canje de token de super admin (autenticación propia via token BD)
    '/api/super-admin-cleanup', // <-- Excluir cleanup de super admin (autenticación propia via body)
    '/api/factus/', // <-- Excluir APIs de Factus (usan credenciales de entorno, no requieren sesión)
    '/api/facebook-feed', // <-- Excluir feed de Facebook (autenticación propia via token en query param)
    '/api/cron/', // <-- Excluir cron jobs de Vercel (autenticación propia via Authorization: Bearer CRON_SECRET)
    '/api/crm/jobs/run', // <-- Runner de la cola CRM (pg_cron / Vercel Cron; fail-closed via Authorization: Bearer CRON_SECRET)
    '/api/email/webhook', // <-- F7: webhook de Resend (firma svix fail-closed)
    '/api/crm/webhooks/', // <-- F4: webhook de ElevenLabs Scribe (firma ElevenLabs-Signature fail-closed via constructEvent)
    '/u/', // <-- F7: página pública de baja de correo (token HMAC firmado)
    '/api/web-orders/', // <-- Excluir webhooks de pedidos web (autenticación propia via x-webhook-secret header)
    '/api/auth/invite/resend', // <-- Reenvío de magic link para invitaciones (usuario no autenticado, valida contra tabla invitations)
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
export async function middleware(request: NextRequest, event: NextFetchEvent) {
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

  // Limpiar cookie OAuth stale en rutas que no son select-organization.
  // Esta cookie contiene tokens completos y si no se borra causa HTTP 431.
  if (pathname !== '/auth/select-organization') {
    const oauthCookie = request.cookies.get('go-admin-oauth-session');
    if (oauthCookie) {
      const response = NextResponse.next();
      response.cookies.delete('go-admin-oauth-session');
      return response;
    }
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

  // Decodificar el valor de la cookie si está URL-encoded
  // Todas las funciones que setean cookies usan encodeURIComponent,
  // pero Next.js middleware no decodifica automáticamente los valores.
  if (authCookie?.value) {
    try {
      if (authCookie.value.startsWith('%7B') || authCookie.value.startsWith('%5B')) {
        authCookie = { name: authCookie.name, value: decodeURIComponent(authCookie.value) };
      }
    } catch {
      // Si falla la decodificación, mantener el valor original
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
    
  }

  // Registrar actividad del usuario como mucho una vez cada 10 minutos.
  // La cookie de throttle se escribe sobre la respuesta final; antes se leia
  // pero nunca se escribia, asi que se disparaba un UPDATE en CADA peticion.
  const activityUserId = isAuthenticated ? session?.user?.sub ?? null : null;
  // JWT del usuario para que las consultas del gate pasen por RLS como el.
  const activityAccessToken = isAuthenticated ? session?.access_token ?? null : null;
  const touchActivity = !!activityUserId && needsActivityUpdate(request);

  const response = await handleRouteProtection(request, isAuthenticated, isExpired, activityUserId, activityAccessToken);

  if (touchActivity && activityUserId) {
    // waitUntil: la escritura corre despues de responder, sin retrasar al usuario
    // y sin que el runtime la mate a medias.
    event.waitUntil(updateUserActivityOptimized(activityUserId));
    response.cookies.set('last_activity_update', String(Date.now()), {
      path: '/',
      maxAge: ACTIVITY_UPDATE_INTERVAL / 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return response;
}

/**
 * True si toca refrescar la marca de actividad (throttle de 10 minutos).
 */
function needsActivityUpdate(request: NextRequest): boolean {
  const last = request.cookies.get('last_activity_update')?.value;
  if (!last) return true;
  const parsed = parseInt(last, 10);
  if (isNaN(parsed)) return true;
  return Date.now() - parsed > ACTIVITY_UPDATE_INTERVAL;
}

/**
 * Marca actividad del usuario. Best-effort: no se espera y nunca bloquea
 * la respuesta. Timeout corto para que jamas cuelgue la invocacion.
 */
function updateUserActivityOptimized(userId: string): Promise<unknown> {
  const query = `user_devices?user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true`;
  return edgePatch(query, { last_active_at: new Date().toISOString() }, { timeoutMs: 800 });
}

/**
 * Mapeo de rutas a módulos
 */
const routeToModuleMap: Record<string, string> = {
  '/app/organizacion': 'organizations',
  '/app/branding': 'branding',
  '/app/organizacion/sucursales': 'branches',
  '/app/clientes': 'clientes',
  '/app/roles': 'roles',
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
 * Contexto compartido por las verificaciones de una misma peticion:
 * presupuesto de tiempo, identidad y memo de consultas repetidas.
 */
type GateContext = {
  request: NextRequest;
  /** Instante (ms) despues del cual ya no se lanzan mas consultas. */
  deadline: number;
  userId: string | null;
  /**
   * JWT del usuario. Las consultas del gate van con el, no con la clave anon:
   * las tablas del tenant filtran por `auth.uid()` y como anon devolverian
   * cero filas siempre (ver `baseHeaders` en `edge-rest.ts`).
   */
  accessToken: string | null;
  /** Memo de la busqueda de organizacion por subdominio. */
  orgBySubdomain?: { id: number; status: string } | null;
};

/**
 * Veredicto positivo cacheado en cookie.
 *  o: organizacion activa, e: expiracion (epoch s),
 *  s: 1 si el estado org/suscripcion quedo verificado,
 *  m: modulos cuyo acceso quedo verificado,
 *  u: usuario (sub del JWT) al que pertenece el veredicto.
 *
 * `u` va dentro de la carga firmada y se compara con el usuario de la sesion
 * actual, para que una cookie valida no pueda reutilizarse en otra sesion.
 */
type GateCache = { o: string; e: number; s?: 1; m: string[]; u: string };

/** Clave que identifica la organizacion activa segun las cookies. */
function orgKeyFromCookies(request: NextRequest): string {
  const id = request.cookies.get('org_id')?.value || '';
  const sub = request.cookies.get('organization')?.value || '';
  return `${id}:${sub}`;
}

/**
 * Lee y VERIFICA la cookie de veredicto. Devuelve null ante cualquier duda:
 * sin secreto, sin firma, firma invalida, caducada, otra organizacion u otro
 * usuario. Devolver null solo significa "hay que consultar de verdad".
 */
async function readGateCache(request: NextRequest, userId: string | null): Promise<GateCache | null> {
  if (!GATE_SECRET) return null;

  const raw = request.cookies.get(GATE_COOKIE)?.value;
  if (!raw) return null;

  try {
    const decoded = decodeURIComponent(raw);
    const separator = decoded.lastIndexOf('.');
    if (separator <= 0) return null;

    const payload = decoded.slice(0, separator);
    const signature = decoded.slice(separator + 1);

    // Verificar la firma ANTES de interpretar el contenido.
    const expected = await gateSignature(payload);
    if (!safeEqual(signature, expected)) return null;

    const json = new TextDecoder().decode(base64UrlToBytes(payload));
    const parsed = JSON.parse(json) as GateCache;
    if (!parsed || typeof parsed.e !== 'number') return null;
    if (parsed.e < Math.floor(Date.now() / 1000)) return null;
    // Si cambio la organizacion activa, el cache no aplica.
    if (parsed.o !== orgKeyFromCookies(request)) return null;
    // Un veredicto solo vale para el usuario que lo obtuvo.
    if (parsed.u !== (userId || '')) return null;

    return {
      o: parsed.o,
      e: parsed.e,
      s: parsed.s === 1 ? 1 : undefined,
      m: Array.isArray(parsed.m) ? parsed.m : [],
      u: parsed.u,
    };
  } catch {
    return null;
  }
}

/**
 * Construye el valor firmado de la cookie. Se calcula en el camino async del
 * gate para que escribirla sobre la respuesta siga siendo sincrono.
 * Devuelve null si no hay secreto configurado (cache desactivado).
 */
async function buildGateCookie(gate: {
  orgKey: string;
  statusOk: boolean;
  modules: string[];
  userId: string | null;
}): Promise<string | null> {
  if (!GATE_SECRET) return null;

  const value: GateCache = {
    o: gate.orgKey,
    e: Math.floor(Date.now() / 1000) + GATE_TTL_SECONDS,
    ...(gate.statusOk ? { s: 1 as const } : {}),
    m: gate.modules.slice(-12),
    u: gate.userId || '',
  };

  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const signature = await gateSignature(payload);
  return encodeURIComponent(`${payload}.${signature}`);
}

function writeGateCookie(response: NextResponse, signedValue: string) {
  response.cookies.set(GATE_COOKIE, signedValue, {
    path: '/',
    httpOnly: true,
    maxAge: GATE_TTL_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Busca la organizacion por el subdominio en cookie. Se memoiza por peticion. */
async function getOrgBySubdomain(ctx: GateContext): Promise<{ id: number; status: string } | null> {
  if (ctx.orgBySubdomain !== undefined) return ctx.orgBySubdomain;

  const subdomain = ctx.request.cookies.get('organization')?.value;
  if (!subdomain) {
    ctx.orgBySubdomain = null;
    return null;
  }

  const rows = await edgeSelect<{ id: number; status: string }>(
    `organizations?select=id,status&subdomain=eq.${encodeURIComponent(subdomain)}&limit=1`,
    { deadline: ctx.deadline, accessToken: ctx.accessToken }
  );
  ctx.orgBySubdomain = rows && rows.length > 0 ? rows[0] : null;
  return ctx.orgBySubdomain;
}

/**
 * Organizacion activa segun las cookies, con el MISMO criterio para todas las
 * verificaciones del gate: primero `org_id` y, solo si falta, el subdominio de
 * la cookie `organization`.
 *
 * `checkModuleAccess` resolvia antes solo por subdominio. Como la cookie
 * `organization` unicamente se reescribe cuando quien guarda la organizacion
 * conoce su subdominio, podia quedarse en la organizacion ANTERIOR mientras
 * `org_id` ya apuntaba a la nueva: el gating de modulos se evaluaba contra otro
 * tenant y bloqueaba modulos que la organizacion activa si tiene contratados.
 *
 * `status` viene null cuando la organizacion se resolvio por `org_id`: quien lo
 * necesite lo consulta.
 */
async function resolveOrgFromCookies(
  ctx: GateContext
): Promise<{ id: number; status: string | null } | null> {
  const orgIdCookie = ctx.request.cookies.get('org_id')?.value;
  if (orgIdCookie) {
    const parsed = parseInt(orgIdCookie, 10);
    if (!isNaN(parsed) && parsed > 0) return { id: parsed, status: null };
  }
  return await getOrgBySubdomain(ctx);
}

/**
 * Verifica el acceso a modulos para una ruta especifica.
 *
 * Fail open: si una consulta falla o se agota el presupuesto de tiempo,
 * se permite el acceso. La UI y las APIs vuelven a validar permisos.
 */
async function checkModuleAccess(ctx: GateContext, pathname: string): Promise<NextResponse | null> {
  const moduleCode = getModuleFromPath(pathname);
  if (!moduleCode) return null; // Ruta sin modulo asociado

  const userId = ctx.userId;
  if (!userId) return null;

  // Sin JWT no se puede consultar: `organization_modules` filtra por
  // `auth.uid()`, asi que como anon devolveria cero filas y bloquearia al
  // usuario en TODAS sus organizaciones. Cero filas solo significa "no lo
  // tiene contratado" cuando la consulta va autenticada.
  if (!ctx.accessToken) return null;

  const org = await resolveOrgFromCookies(ctx);
  if (!org) return null; // Sin organizacion identificable: permitir
  const organizationId = org.id;

  // Consultas independientes en paralelo: modulo activo en la org + cargo del usuario.
  const [moduleRows, memberRows] = await Promise.all([
    edgeSelect<{ is_active: boolean }>(
      `organization_modules?select=is_active&organization_id=eq.${organizationId}` +
        `&module_code=eq.${encodeURIComponent(moduleCode)}&is_active=eq.true&limit=1`,
      { deadline: ctx.deadline, accessToken: ctx.accessToken }
    ),
    edgeSelect<{ job_position_id: string | null }>(
      `organization_members?select=job_position_id&user_id=eq.${encodeURIComponent(userId)}` +
        `&organization_id=eq.${organizationId}&is_active=eq.true&limit=1`,
      { deadline: ctx.deadline, accessToken: ctx.accessToken }
    ),
  ]);

  // 1. La organizacion tiene el modulo activo
  if (moduleRows === null) return null; // consulta fallida -> permitir
  if (moduleRows.length === 0) {
    const redirectUrl = new URL('/app/inicio', ctx.request.url);
    redirectUrl.searchParams.set('error', 'module_not_activated');
    redirectUrl.searchParams.set('module', moduleCode);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. El cargo del usuario tiene acceso al modulo
  if (!memberRows || memberRows.length === 0) return null; // fallback: permitir
  const jobPositionId = memberRows[0].job_position_id;
  if (!jobPositionId) return null;

  const accessRows = await edgeSelect<{ can_access: boolean }>(
    `job_position_module_access?select=can_access&job_position_id=eq.${encodeURIComponent(jobPositionId)}` +
      `&module_code=eq.${encodeURIComponent(moduleCode)}&limit=1`,
    { deadline: ctx.deadline, accessToken: ctx.accessToken }
  );

  if (accessRows === null) return null; // consulta fallida -> permitir
  if (accessRows.length === 0 || !accessRows[0].can_access) {
    const redirectUrl = new URL('/app/inicio', ctx.request.url);
    redirectUrl.searchParams.set('error', 'job_position_no_access');
    redirectUrl.searchParams.set('module', moduleCode);
    return NextResponse.redirect(redirectUrl);
  }

  return null; // Permitir acceso
}

/**
 * Rutas que siempre deben ser accesibles incluso con cuenta congelada
 */
const FROZEN_ALLOWED_ROUTES = [
  '/app/cuenta-congelada',
  '/app/plan',
  '/app/plan/billing',
  '/app/plan/historial',
  '/app/organizacion',
  '/app/roles',
];

/**
 * Verifica el estado de la organizacion y suscripcion.
 * Si la org esta suspendida/eliminada o el trial expiro sin pago,
 * redirige a /app/cuenta-congelada.
 *
 * Fail open ante cualquier error o timeout.
 */
async function checkOrgAndSubscriptionStatus(ctx: GateContext, pathname: string): Promise<NextResponse | null> {
  const request = ctx.request;

  // Solo verificar rutas /app/
  if (!pathname.startsWith('/app/')) return null;

  // Permitir rutas excluidas (cuenta-congelada, plan, auth, etc.)
  const isAllowedRoute = FROZEN_ALLOWED_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (isAllowedRoute) return null;

  // Misma resolucion que checkModuleAccess: 'org_id' y, si falta, subdominio.
  const org = await resolveOrgFromCookies(ctx);
  if (!org) return null; // Sin org identificable o consulta fallida: permitir
  const orgId = org.id;
  let status: string | null = org.status;

  if (status === null) {
    const rows = await edgeSelect<{ id: number; status: string }>(
      `organizations?select=id,status&id=eq.${orgId}&limit=1`,
      { deadline: ctx.deadline, accessToken: ctx.accessToken }
    );
    if (!rows || rows.length === 0) return null; // Permitir en caso de error
    status = rows[0].status;
  }

  // Caso 1: Organizacion suspendida o eliminada
  if (status === 'suspended' || status === 'deleted') {
    const redirectUrl = new URL('/app/cuenta-congelada', request.url);
    redirectUrl.searchParams.set('reason', status);
    return NextResponse.redirect(redirectUrl);
  }

  // Caso 2: Verificar suscripcion (la mas reciente)
  const subs = await edgeSelect<{
    status: string;
    trial_end: string | null;
    current_period_end: string | null;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
  }>(
    `subscriptions?select=status,trial_end,current_period_end,stripe_subscription_id,stripe_customer_id` +
      `&organization_id=eq.${orgId}&order=created_at.desc&limit=1`,
    { deadline: ctx.deadline, accessToken: ctx.accessToken }
  );

  if (!subs || subs.length === 0) return null; // Sin suscripcion registrada: se maneja client-side
  const subData = subs[0];

  const now = new Date();

  // Suscripcion cancelada
  if (subData.status === 'canceled') {
    const redirectUrl = new URL('/app/cuenta-congelada', request.url);
    redirectUrl.searchParams.set('reason', 'canceled');
    return NextResponse.redirect(redirectUrl);
  }

  // Pago pendiente (past_due)
  if (subData.status === 'past_due') {
    const redirectUrl = new URL('/app/cuenta-congelada', request.url);
    redirectUrl.searchParams.set('reason', 'payment_failed');
    return NextResponse.redirect(redirectUrl);
  }

  // Trial expirado: si el status sigue "trialing" y la fecha ya paso, bloquear
  // sin importar si tiene stripe_subscription_id (el webhook actualizaria a "active" si pago)
  if (subData.status === 'trialing') {
    const trialEnd = subData.trial_end
      ? new Date(subData.trial_end)
      : (subData.current_period_end ? new Date(subData.current_period_end) : null);

    if (trialEnd && trialEnd < now) {
      const redirectUrl = new URL('/app/cuenta-congelada', request.url);
      redirectUrl.searchParams.set('reason', 'trial_expired');
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Suscripcion inactiva sin trial vigente
  if (subData.status === 'incomplete' || subData.status === 'incomplete_expired') {
    const redirectUrl = new URL('/app/cuenta-congelada', request.url);
    redirectUrl.searchParams.set('reason', 'trial_expired');
    return NextResponse.redirect(redirectUrl);
  }

  return null; // Todo en orden
}

/**
 * Ejecuta las verificaciones de /app/ (cuenta congelada + acceso a modulos)
 * dentro de un presupuesto de tiempo acotado.
 *
 * Devuelve el redirect si toca bloquear, y la cookie de veredicto a escribir
 * cuando el acceso quedo verificado (solo se cachean veredictos positivos).
 */
async function runAppGate(
  request: NextRequest,
  pathname: string,
  userId: string | null,
  accessToken: string | null
): Promise<{
  redirect: NextResponse | null;
  /** Valor ya firmado de la cookie de veredicto, o null si no hay que escribirla. */
  gateCookie: string | null;
}> {
  const coreRoutes = ['/app/inicio', '/app/plan'];
  const isCorePath = coreRoutes.some(r => pathname === r || pathname.startsWith(r + '/'));

  // En rutas exentas de congelamiento no se verifica el estado, asi que
  // tampoco se puede cachear como verificado.
  const isFrozenExempt =
    pathname === '/app/cuenta-congelada' ||
    FROZEN_ALLOWED_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));

  const moduleCode = isCorePath ? null : getModuleFromPath(pathname);
  const cache = await readGateCache(request, userId);
  const orgKey = orgKeyFromCookies(request);

  const needStatusCheck = !isFrozenExempt && cache?.s !== 1;
  const needModuleCheck = !!moduleCode && !cache?.m.includes(moduleCode);

  if (!needStatusCheck && !needModuleCheck) {
    return { redirect: null, gateCookie: null }; // Todo resuelto por el cache
  }

  const ctx: GateContext = {
    request,
    deadline: Date.now() + MW_DB_BUDGET_MS,
    userId,
    accessToken,
  };

  try {
    if (needStatusCheck) {
      const frozenResult = await checkOrgAndSubscriptionStatus(ctx, pathname);
      if (frozenResult) return { redirect: frozenResult, gateCookie: null };
    }

    if (needModuleCheck) {
      const moduleResult = await checkModuleAccess(ctx, pathname);
      if (moduleResult) return { redirect: moduleResult, gateCookie: null };
    }
  } catch (error) {
    // Nunca bloquear la navegacion por un fallo del gate.
    console.error('[MIDDLEWARE] Error en verificacion de acceso:', error);
    return { redirect: null, gateCookie: null };
  }

  const modules = cache ? [...cache.m] : [];
  if (needModuleCheck && moduleCode && !modules.includes(moduleCode)) modules.push(moduleCode);

  const statusOk = cache?.s === 1 || needStatusCheck;

  const gateCookie = await buildGateCookie({ orgKey, statusOk, modules, userId });
  return { redirect: null, gateCookie };
}

/**
 * Maneja la protección de rutas y redirecciones
 */
async function handleRouteProtection(
  request: NextRequest,
  isAuthenticated: boolean,
  isExpired: boolean,
  userId: string | null,
  accessToken: string | null
) {
  const { pathname } = request.nextUrl;

  // Cookie de veredicto (ya firmada) a escribir sobre la respuesta final.
  let pendingGateCookie: string | null = null;
  const finalize = (response: NextResponse) => {
    if (pendingGateCookie) writeGateCookie(response, pendingGateCookie);
    return response;
  };
  
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
    // NOTA: NO redirigir '/' a /app/inicio en el middleware.
    // El redirect se hace client-side en src/app/page.tsx con router.replace()
    // para que iOS pueda instalar la PWA desde '/' sin que un redirect
    // server-side (302) cambie la URL de instalación que iOS usa como raíz.

    // Permitir /auth/login?addAccount=1: es el flujo del selector de cuentas
    // para agregar una sesión adicional sin cerrar la actual.
    const isAddingAccount = pathname === '/auth/login' && request.nextUrl.searchParams.get('addAccount') === '1';

    if (pathname === '/auth/login' && !isAddingAccount) {
      if (shouldDebug) {
        console.log('🚀 [MIDDLEWARE] Redirigiendo usuario autenticado desde login a /app/inicio');
      }
      return NextResponse.redirect(new URL('/app/inicio', request.url));
    }
    
    if (pathname.startsWith('/auth/') && 
        !isAddingAccount &&
        pathname !== '/auth/logout' &&
        pathname !== '/auth/session-expired' &&
        !pathname.startsWith('/auth/invite') &&
        !pathname.startsWith('/auth/verify') &&
        !pathname.startsWith('/auth/select-organization') &&
        !pathname.startsWith('/auth/signup') &&
        !pathname.startsWith('/auth/reset-password') &&
        !pathname.startsWith('/auth/super-admin-access')) {
      if (shouldDebug) {
        console.log('🚀 [MIDDLEWARE] Redirigiendo usuario autenticado desde auth a /app/inicio');
      }
      return NextResponse.redirect(new URL('/app/inicio', request.url));
    }

    // Verificaciones de /app/: cuenta congelada + acceso a modulos.
    // Acotadas por presupuesto de tiempo y cacheadas en cookie durante 60s,
    // para que nunca puedan colgar la invocacion del middleware.
    if (pathname.startsWith('/app/')) {
      const { redirect, gateCookie } = await runAppGate(request, pathname, userId, accessToken);
      if (redirect) return redirect;
      pendingGateCookie = gateCookie;
    }
  }

  // Manejar subdominios para organizaciones
  const hostname = request.headers.get('host') || '';
  const parts = hostname.split('.');
  
  // Para app.goadmin.io → parts = ['app', 'goadmin', 'io'] → NO es subdominio de organización
  // Para empresa1.app.goadmin.io → parts = ['empresa1', 'app', 'goadmin', 'io'] → SÍ es subdominio de organización
  
  // Si es localhost (desarrollo)
  if (hostname.includes('localhost')) {
    return finalize(NextResponse.next());
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
      return finalize(response);
    }
  }
  
  // Si tiene 3 partes (app.goadmin.io o goadmin.io), no es subdominio de organización
  // No establecer cookie de organización

  if (shouldDebug) {
    console.log('✅ [MIDDLEWARE] Permitiendo acceso a la ruta');
  }
  
  return finalize(NextResponse.next());
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/test (test endpoints - no auth required)
     * - api/stripe (Stripe API endpoints - handle their own auth)
     * - api/sessions (Session API endpoints - handle their own auth)
     *
     * NOTA sobre los assets de public/: Next los sirve en la RAIZ (/sw.js),
     * no bajo /public/, asi que el token "public" de este matcher nunca los
     * excluia. shouldSkipRoute() si los dejaba pasar, pero solo despues de
     * invocar el middleware. Con la PWA revalidando /sw.js en cada navegacion
     * eso eran ~6,5 invocaciones por segundo puramente desperdiciadas.
     * Se enumeran de forma explicita (no por regex de extension) para no
     * arriesgar el parseo del matcher en un hotfix de produccion.
     */
    '/((?!_next/static|_next/image|favicon.ico|favicon-32x32.png|apple-touch-icon.png|icon-192x192.png|icon-512x512.png|placeholder-image.png|placeholder.svg|manifest.json|sw.js|api/test|api/stripe|api/sessions|api/integrations/twilio|api/integrations/whatsapp/webhook|api/integrations/whatsapp/qr/dispatch-pending|api/voice|api/super-admin-access|api/super-admin-cleanup|api/factus|api/facebook-feed|api/cron|api/crm/jobs/run|api/email/webhook|api/crm/webhooks|u/|api/web-orders|api/auth).*)',
  ],
};
