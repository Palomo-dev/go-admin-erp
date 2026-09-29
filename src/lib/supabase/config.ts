import { createClient, type AuthError, type Session, type User } from '@supabase/supabase-js'
import { isAppOnline, getCachedForRequest, cacheFreshResponse, isCacheableRequest, resolveOfflineDataRequest } from '@/lib/utils/offlineCache'

// Extrae la referencia del proyecto de la URL de Supabase
export const getProjectRef = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return supabaseUrl.split('.')[0].replace('https://', '');
}

/**
 * Atributo `domain` de las cookies de sesión.
 *
 * En producción se comparten entre subdominios (`.goadmin.io`). Pero la app
 * de escritorio sirve esta misma build de producción desde
 * `http://127.0.0.1:<puerto>` (servidor Next embebido, fase 3 del desktop):
 * ahí una cookie con `domain=.goadmin.io` la rechaza el navegador en
 * silencio, el middleware nunca ve la sesión y el login entra en bucle. Solo
 * se fija el dominio cuando la página vive de verdad bajo goadmin.io.
 */
const getCookieDomain = (): string => {
  if (process.env.NODE_ENV !== 'production') return '';
  if (typeof window === 'undefined') return '; domain=.goadmin.io';
  const host = window.location.hostname;
  return host === 'goadmin.io' || host.endsWith('.goadmin.io') ? '; domain=.goadmin.io' : '';
}

// Función para establecer una cookie (con soporte de chunks para cookies grandes)
const setCookie = (name: string, value: string, maxAge: number = 604800) => {
  if (typeof document === 'undefined') return;
  
  const isAuthCookie = name.includes('-auth-token');
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = getCookieDomain();
  const encodedValue = encodeURIComponent(value);
  
  // Limpiar chunks anteriores si existían (incluir Secure para que el borrado funcione)
  const secureFlag = isProduction ? ';Secure' : '';
  for (let i = 0; i < 20; i++) {
    document.cookie = `${name}.${i}=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT;SameSite=Lax${secureFlag}${cookieDomain}`;
  }
  
  if (encodedValue.length < 3600) {
    document.cookie = `${name}=${encodedValue};path=/;max-age=${maxAge};SameSite=Lax${!isAuthCookie ? ';HttpOnly' : ''}${isProduction ? ';Secure' : ''}${cookieDomain}`;
  } else {
    // Dividir en chunks para cookies grandes
    // IMPORTANTE: Ajustar el límite para no dividir secuencias %XX
    // Next.js (cookie package) decodifica cada cookie individualmente con
    // decodeURIComponent. Si un %XX se divide entre chunks, la decodificación
    // falla y corrompe el token.
    const CHUNK_SIZE = 3500;
    let chunkIndex = 0;
    let offset = 0;
    while (offset < encodedValue.length) {
      let end = Math.min(offset + CHUNK_SIZE, encodedValue.length);
      // No dividir una secuencia %XX (3 caracteres: %, X, X)
      if (end < encodedValue.length) {
        if (encodedValue[end - 2] === '%') {
          end -= 2;
        } else if (encodedValue[end - 1] === '%') {
          end -= 1;
        }
      }
      const chunk = encodedValue.substring(offset, end);
      document.cookie = `${name}.${chunkIndex}=${chunk};path=/;max-age=${maxAge};SameSite=Lax${!isAuthCookie ? ';HttpOnly' : ''}${isProduction ? ';Secure' : ''}${cookieDomain}`;
      offset = end;
      chunkIndex++;
    }
    console.log(`🍪 [SETCOOKIE] Cookie chunked: ${name} (${chunkIndex} chunks, ${encodedValue.length} bytes)`);
  }
}

// Referencia al fetch nativo del navegador antes de cualquier override
const nativeFetch = globalThis.fetch.bind(globalThis);

// ── Circuit breaker para 503/504/522/544 (BD saturada o caída) ──
// Cuando Supabase devuelve 503 (PostgREST sin conexiones), 504 (gateway
// timeout), 522 (Connection timed out) o 544, significa que la BD no responde
// o está saturada. Seguir enviando peticiones solo agrava la sobrecarga.
// El circuit breaker cuenta fallos consecutivos y, al superar el umbral,
// corta todas las peticiones no-auth por COOLDOWN_MS. Las peticiones de auth
// (login, refresh) siempre pasan para que el usuario pueda recuperar sesión.
let cbConsecutiveFailures = 0;
const CB_THRESHOLD = 5;        // 5 fallos consecutivos → abrir circuito
const CB_COOLDOWN_MS = 30_000; // 30s de cooldown antes de reintentar
const DATA_REQUEST_TIMEOUT_MS = 15_000;
const DATA_WRITE_TIMEOUT_MS = 45_000; // escrituras (POST/PATCH/PUT/DELETE) con triggers/RPCs pueden tardar más
const TOKEN_REFRESH_TIMEOUT_MS = 12_000;
let cbOpenUntil = 0;

/** Códigos HTTP que indican que la BD no responde o está saturada. */
const CB_FAILURE_STATUSES = new Set([503, 504, 522, 544]);

const isCircuitOpen = (isAuth: boolean) => {
  if (isAuth) return false; // auth siempre pasa
  if (cbOpenUntil && Date.now() < cbOpenUntil) return true;
  if (cbOpenUntil && Date.now() >= cbOpenUntil) cbOpenUntil = 0; // reset
  return false;
};

const recordSuccess = () => {
  if (cbConsecutiveFailures > 0) cbConsecutiveFailures = 0;
  if (cbOpenUntil) cbOpenUntil = 0;
};

const recordFailure = (status: number) => {
  cbConsecutiveFailures += 1;
  if (cbConsecutiveFailures >= CB_THRESHOLD) {
    cbOpenUntil = Date.now() + CB_COOLDOWN_MS;
    console.warn(`🔌 [CIRCUIT] Circuito abierto por ${CB_COOLDOWN_MS / 1000}s (${cbConsecutiveFailures} fallos consecutivos, último status: ${status})`);
  }
};

// ── Guard global: prevenir bucle infinito de refresh ──
// Cuando el refresh token es inválido, el SDK de Supabase internamente
// intenta refrescar en cada getSession() → bucle infinito → 429.
// Este flag hace que el storage getItem retorne null para el auth-token
// después de un fallo de refresh, para que el SDK deje de intentar.
let refreshBlocked = false;
const REFRESH_BLOCK_DURATION = 60_000; // 60 segundos
let refreshBlockedAt = 0;

const isRefreshBlocked = () => {
  if (refreshBlocked && Date.now() - refreshBlockedAt < REFRESH_BLOCK_DURATION) {
    return true;
  }
  refreshBlocked = false;
  return false;
};

const blockRefresh = () => {
  refreshBlocked = true;
  refreshBlockedAt = Date.now();
  console.warn(`🚫 [AUTH] Refresh bloqueado por ${REFRESH_BLOCK_DURATION / 1000}s (token inválido)`);
};

// Libera el bloqueo anti-bucle. Es imprescindible llamarlo cuando aparece una
// sesión nueva y válida (login, setSession, callback OAuth): si no, el getItem
// del storage sigue devolviendo null durante 60s y getSession()/getUser()
// responden "Auth session missing" aunque el login haya sido correcto.
const unblockRefresh = (reason: string) => {
  if (refreshBlocked) {
    refreshBlocked = false;
    refreshBlockedAt = 0;
    console.log(`✅ [AUTH] Bloqueo de refresh liberado (${reason})`);
  }
};

// Creación del cliente de Supabase para el navegador
export const createSupabaseClient = () => {
  // Configuramos las credenciales, usando valores predeterminados si no hay variables de entorno
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    console.error('Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY')
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Credenciales de Supabase no configuradas en producción')
    }
  }
  
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: {
        getItem: (key: string) => {
          if (typeof window !== 'undefined') {
            // Guard anti-bucle: si el refresh está bloqueado por token inválido,
            // retornar null para que el SDK de Supabase no intente refrescar.
            // Esto rompe el bucle: getSession() → refresh → 400 → getSession() → ...
            if (isRefreshBlocked() && key.includes('-auth-token')) {
              return null;
            }

            // En el cliente, leer de localStorage como fallback y cookies
            const fromLocalStorage = localStorage.getItem(key);
            if (fromLocalStorage) {
              return fromLocalStorage;
            }
            
            // Intentar leer de cookies (cookie simple)
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
              // Usar indexOf en vez de split('=') para no truncar el valor
              // si el JSON del token contiene caracteres '=' (base64, etc.)
              const eqIndex = cookie.indexOf('=');
              if (eqIndex === -1) continue;
              const name = cookie.substring(0, eqIndex).trim();
              const rawValue = cookie.substring(eqIndex + 1);
              if (name === key && rawValue) {
                console.log('🍪 [STORAGE] Leído de cookie:', key);
                try {
                  return decodeURIComponent(rawValue);
                } catch {
                  // Si decodeURIComponent falla (malformed %), devolver raw
                  return rawValue;
                }
              }
            }
            
            // Intentar leer cookies chunked (key.0, key.1, ...)
            // IMPORTANTE: No decodificar cada chunk individualmente.
            // El valor completo se codifica con encodeURIComponent antes de dividirse,
            // por lo que un carácter %XX puede quedar dividido entre dos chunks.
            // Se deben concatenar los chunks raw y decodificar el resultado completo.
            const chunkPrefix = `${key}.`;
            const chunks: { index: number; value: string }[] = [];
            for (const cookie of cookies) {
              const [name, value] = cookie.trim().split('=');
              if (name && name.startsWith(chunkPrefix) && value) {
                const idx = parseInt(name.substring(chunkPrefix.length), 10);
                if (!isNaN(idx)) {
                  chunks.push({ index: idx, value });
                }
              }
            }
            if (chunks.length > 0) {
              chunks.sort((a, b) => a.index - b.index);
              const assembled = chunks.map(c => c.value).join('');
              try {
                const decoded = decodeURIComponent(assembled);
                console.log(`🍪 [STORAGE] Leído de cookie chunked: ${key} (${chunks.length} chunks)`);
                return decoded;
              } catch {
                console.log(`🍪 [STORAGE] Leído de cookie chunked (raw): ${key} (${chunks.length} chunks)`);
                return assembled;
              }
            }
          }
          return null;
        },
        setItem: (key: string, value: string) => {
          if (typeof window !== 'undefined') {
            // Si se está escribiendo un token de auth nuevo, el bloqueo anti-bucle
            // quedó obsoleto: liberarlo antes de guardar para que el siguiente
            // getItem no devuelva null y la sesión recién creada sea visible.
            if (key.includes('-auth-token')) {
              unblockRefresh('token nuevo guardado en storage');
            }

            // Guardar en localStorage primero
            localStorage.setItem(key, value);
            console.log('💾 [STORAGE] Guardado en localStorage:', key);
            
            // También guardar en cookies para que el middleware pueda leerlo
            const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
            const cookieDomain = getCookieDomain();
            const encodedValue = encodeURIComponent(value);
            
            // Limpiar chunks anteriores si existían (incluir Secure para que el borrado funcione)
            document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${secureFlag}${cookieDomain}`;
            for (let i = 0; i < 20; i++) {
              document.cookie = `${key}.${i}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${secureFlag}${cookieDomain}`;
            }
            
            // Si el valor codificado cabe en una sola cookie (< 3600 bytes), usar cookie simple
            if (encodedValue.length < 3600) {
              document.cookie = `${key}=${encodedValue}; path=/; max-age=2592000; SameSite=Lax${secureFlag}${cookieDomain}`;
              console.log('🍪 [STORAGE] Guardado en cookie simple:', key);
            } else {
              // Dividir en chunks de ~3500 bytes para no exceder el límite de 4KB por cookie
              // IMPORTANTE: Ajustar el límite para no dividir secuencias %XX
              // Next.js (cookie package) decodifica cada cookie individualmente con
              // decodeURIComponent. Si un %XX se divide entre chunks, la decodificación
              // falla y corrompe el token.
              const CHUNK_SIZE = 3500;
              let chunkIndex = 0;
              let offset = 0;
              while (offset < encodedValue.length) {
                let end = Math.min(offset + CHUNK_SIZE, encodedValue.length);
                if (end < encodedValue.length) {
                  if (encodedValue[end - 2] === '%') {
                    end -= 2;
                  } else if (encodedValue[end - 1] === '%') {
                    end -= 1;
                  }
                }
                const chunk = encodedValue.substring(offset, end);
                document.cookie = `${key}.${chunkIndex}=${chunk}; path=/; max-age=2592000; SameSite=Lax${secureFlag}${cookieDomain}`;
                offset = end;
                chunkIndex++;
              }
              console.log(`🍪 [STORAGE] Guardado en cookie chunked: ${key} (${chunkIndex} chunks, ${encodedValue.length} bytes)`);
            }
            
            // Verificar que la cookie se estableció correctamente
            setTimeout(() => {
              const cookies = document.cookie.split(';');
              const cookieExists = cookies.some(c => c.trim().startsWith(`${key}=`) || c.trim().startsWith(`${key}.0=`));
              console.log(`🔍 [STORAGE] Verificación cookie ${key}:`, cookieExists ? 'EXISTE' : 'NO EXISTE');
            }, 100);
          }
        },
        removeItem: (key: string) => {
          if (typeof window !== 'undefined') {
            // Eliminar de localStorage
            localStorage.removeItem(key);
            console.log('💾 [STORAGE] Eliminado de localStorage:', key);
            
            // Eliminar de cookies (cookie simple + chunks)
            // IMPORTANTE: Si las cookies se setearon con Secure, la eliminación
            // también debe incluir Secure. Si no, el navegador ignora el borrado
            // y la cookie persiste → bucle infinito de 403 al leer token inválido.
            const cookieDomain = getCookieDomain();
            const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
            document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${secureFlag}${cookieDomain}`;
            // Limpiar chunks .0, .1, .2...
            for (let i = 0; i < 20; i++) {
              document.cookie = `${key}.${i}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${secureFlag}${cookieDomain}`;
            }
            console.log('🍪 [STORAGE] Eliminado de cookie (incluyendo chunks):', key);
          }
        },
      },
    },
    global: {
      headers: {
        'x-application-name': 'GoAdminERP'
      },
      fetch: async (url: string | URL | Request, options?: RequestInit) => {
        const MAX_RETRIES = 3;
        const BASE_DELAY = 1000;

        const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.toString() : url.url);
        const isAuthRequest = urlString.includes('/auth/v1/');
        const isDataRequest = urlString.includes('/rest/v1/');
        const isTokenRefreshRequest = isAuthRequest && urlString.includes('grant_type=refresh_token');
        const method = (options?.method || 'GET').toUpperCase();
        // Body como texto (solo string: el SDK de Supabase siempre manda JSON serializado).
        const requestBody = typeof options?.body === 'string' ? options.body : '';

        // ── BLOQUEO AGRESIVO: si el refresh token es inválido, NO dejar que
        // la petición HTTP salga. Retornar una respuesta sintética 400 inmediata.
        // Esto evita que el SDK haga cientos de POST /token → 429 en Supabase.
        if (isAuthRequest && urlString.includes('grant_type=refresh_token') && isRefreshBlocked()) {
          console.warn('🚫 [AUTH] Bloqueando refresh HTTP (cooldown activo)');
          return new Response(
            JSON.stringify({ error: { message: 'Invalid Refresh Token: Refresh Token Not Found' } }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // ── Circuit breaker: si la BD está caída (522/544 repetidos), cortar
        // peticiones no-auth para no agravar la sobrecarga. Auth siempre pasa.
        if (isCircuitOpen(isAuthRequest)) {
          return new Response(
            JSON.stringify({ error: { message: 'Database temporarily unavailable (circuit breaker open)' } }),
            { status: 503, headers: { 'Content-Type': 'application/json', 'X-Circuit-Breaker': 'open' } }
          );
        }

        // ── Offline cache solo en desktop app ──
        // En Desktop la conectividad la decide el health-check del proceso
        // principal (window.goAdminDesktop.onConnectivity → offlineCache), no
        // navigator.onLine, que devuelve true con WiFi enlazado y sin internet.
        // Fuera del Desktop isAppOnline() cae a navigator.onLine.
        const isDesktopApp = typeof window !== 'undefined' && 'goAdminDesktop' in window;
        const isOnline = isDesktopApp ? isAppOnline() : (typeof navigator !== 'undefined' ? navigator.onLine : true);
        const useOfflineLogic = isDesktopApp && !isOnline;
        if (useOfflineLogic) {
          // ── Auth offline: servir sesión desde localStorage ──
          if (isAuthRequest) {
            const projectRef = getProjectRef();
            const storageKey = projectRef ? `sb-${projectRef}-auth-token` : 'sb-auth-token';
            const storedSession = localStorage.getItem(storageKey);
            if (storedSession) {
              return new Response(storedSession, {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': 'true' },
              });
            }
            return new Response(JSON.stringify({ error: { message: 'Offline: no stored session' } }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (!isAuthRequest) {
            // Datos sin red (fase 4A): GET por URL, RPC de lectura por
            // función + hash del body (nunca se encola), resto REST a la
            // cola. La decisión vive en offlineCache.resolveOfflineDataRequest.
            const offlineHeaders: Record<string, string> = {};
            if (options?.headers) {
              const h = options.headers as Record<string, string>;
              for (const [k, v] of Object.entries(h)) {
                offlineHeaders[k] = v;
              }
            }
            return resolveOfflineDataRequest({
              url: urlString,
              method,
              body: requestBody,
              headers: offlineHeaders,
            });
          } // fin if (!isAuthRequest)
        }

        // ── Fetch normal con reintentos ──
        // Las peticiones de datos (/rest/v1/) y el refresh de token tienen
        // timeout (DATA_REQUEST_TIMEOUT_MS / TOKEN_REFRESH_TIMEOUT_MS): un
        // fetch que nunca resuelve dejaba el lock de sesión tomado para
        // siempre y todas las páginas quedaban en skeleton al navegar.
        // getSession()/getUser() y el resto de auth no llevan timeout propio
        // para no impedir que el SDK restaure una sesión válida durante un
        // cambio de organización. Toda la lógica de offline solo se activa
        // en Desktop y cuando isAppOnline() === false (conectividad real).
        // isOnline y useOfflineLogic ya fueron declarados arriba.

        return new Promise((resolve, reject) => {
          const attemptFetch = async (retriesLeft: number, delay: number) => {
            // AbortController para consultas de datos, refresh de token y fallback offline.
            // getSession() y getUser() online quedan excluidos para no impedir que el SDK
            // restaure una sesión válida durante un cambio de organización.
            const controller = (useOfflineLogic || isDataRequest || isTokenRefreshRequest) ? new AbortController() : null;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            if (controller) {
              const isWriteRequest = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
              const timeoutMs = isTokenRefreshRequest
                ? TOKEN_REFRESH_TIMEOUT_MS
                : isWriteRequest ? DATA_WRITE_TIMEOUT_MS : DATA_REQUEST_TIMEOUT_MS;
              timeoutId = setTimeout(() => controller.abort(), timeoutMs);
              if (options?.signal) {
                if (options.signal.aborted) controller.abort();
                else options.signal.addEventListener('abort', () => controller.abort());
              }
            }

            const fetchOptions = controller
              ? { ...options, signal: controller.signal }
              : options;

            try {
              const response = await nativeFetch(url, fetchOptions);
              if (timeoutId) clearTimeout(timeoutId);

              // ── Circuit breaker: registrar 503/504/522/544 (BD saturada) ──
              if (CB_FAILURE_STATUSES.has(response.status)) {
                recordFailure(response.status);
              } else if (response.ok) {
                recordSuccess();
              }

              // Detectar refresh token inválido (400 en /token?grant_type=refresh_token)
              // y activar el bloqueo global para prevenir el bucle infinito.
              if (response.status === 400 && isAuthRequest &&
                  urlString.includes('grant_type=refresh_token')) {
                console.warn('🚫 [AUTH] Refresh token inválido detectado, activando bloqueo anti-bucle');
                blockRefresh();
                // Limpiar storage para que el SDK no tenga token que intentar refrescar
                if (typeof window !== 'undefined') {
                  try {
                    const projectRef = getProjectRef();
                    const storageKey = projectRef ? `sb-${projectRef}-auth-token` : 'sb-auth-token';
                    localStorage.removeItem(storageKey);
                    localStorage.removeItem('sb-session-cache');
                    // Limpiar cookies chunked
                    const domain = getCookieDomain();
                    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
                    document.cookie = `${storageKey}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${secure}${domain}`;
                    for (let i = 0; i < 20; i++) {
                      document.cookie = `${storageKey}.${i}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${secure}${domain}`;
                    }
                  } catch { /* ignore */ }
                }
              }

              if (response.status === 429 && retriesLeft > 0 && !isAuthRequest) {
                console.log(`Límite de solicitudes alcanzado, reintentando en ${delay}ms (${retriesLeft} intentos restantes)`);
                await new Promise(res => setTimeout(res, delay));
                return attemptFetch(retriesLeft - 1, delay * 2);
              }

              // 503 Service Unavailable: PostgREST puede devolver 503 con
              // PGRST002 ("Could not query the database for the schema cache")
              // durante recargas de schema cache o picos de carga. Es transitorio:
              // reintentar con backoff exponencial.
              if (response.status === 503 && retriesLeft > 0 && !isAuthRequest) {
                console.log(`Servicio no disponible (503), reintentando en ${delay}ms (${retriesLeft} intentos restantes)`);
                await new Promise(res => setTimeout(res, delay));
                return attemptFetch(retriesLeft - 1, delay * 2);
              }

              // Para requests de auth (login, refresh, getUser): si hay 429,
              // reintentar una vez con backoff mayor (5s). No reintentar más
              // de 1 vez para no empeorar el rate limiting.
              if (response.status === 429 && isAuthRequest && retriesLeft === MAX_RETRIES) {
                console.log(`Auth rate-limited, reintentando en 5000ms (1 intento)`);
                await new Promise(res => setTimeout(res, 5000));
                return attemptFetch(retriesLeft - 1, 10000);
              }

              // Cachear respuestas GET exitosas en desktop app:
              // - Offline: inmediatamente (para fallback de timeout)
              // - Online: diferido con requestIdleCallback para no afectar latencia
              if (isDesktopApp && response.ok && !isAuthRequest && isCacheableRequest(urlString, method)) {
                const cloned = response.clone();
                const doCache = () => {
                  cloned.text().then(text => {
                    if (text && text.length > 0 && text.length < 500_000) {
                      cacheFreshResponse({ url: urlString, method, body: requestBody, text, status: response.status });
                    }
                  }).catch(() => {});
                };
                if (useOfflineLogic) {
                  doCache();
                } else if (typeof requestIdleCallback !== 'undefined') {
                  requestIdleCallback(() => doCache(), { timeout: 5000 });
                } else {
                  setTimeout(doCache, 0);
                }
              }

              resolve(response);
            } catch (error) {
              if (timeoutId) clearTimeout(timeoutId);

              const isTimeout = controller?.signal?.aborted && !options?.signal?.aborted;
              const isAborted = (error as { name?: unknown } | null | undefined)?.name === 'AbortError' || options?.signal?.aborted;

              // Timeout en desktop app offline: usar cache como fallback
              if (isTimeout && useOfflineLogic) {
                console.log('[fetch] Timeout en desktop app offline, usando cache como fallback');

                if (!isAuthRequest) {
                  try {
                    const cached = await getCachedForRequest(urlString, method, requestBody);
                    if (cached) {
                      return resolve(new Response(cached.data, {
                        status: cached.status,
                        headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': 'true' },
                      }));
                    }
                  } catch {}
                }
                reject(error);
                return;
              }

              if (retriesLeft > 0 && !isAborted) {
                console.log(`Error en solicitud, reintentando en ${delay}ms (${retriesLeft} intentos restantes)`);
                await new Promise(res => setTimeout(res, delay));
                return attemptFetch(retriesLeft - 1, delay * 2);
              }

              // Último intento fallido: intentar cache para GET en desktop offline
              if (useOfflineLogic && !isAuthRequest) {
                try {
                  const cached = await getCachedForRequest(urlString, method, requestBody);
                  if (cached) {
                    return resolve(new Response(cached.data, {
                      status: cached.status,
                      headers: { 'Content-Type': 'application/json', 'X-Offline-Cache': 'true' },
                    }));
                  }
                } catch {}
              }

              reject(error);
            }
          };

          attemptFetch(MAX_RETRIES, BASE_DELAY);
        });
      }
    }
  })
}

// Creación del cliente de Supabase para el servidor (middleware)
// `request` no se usa; se conserva para no romper la firma exportada.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const createSupabaseServerClient = (request?: unknown) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  
  const projectRef = getProjectRef();
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  });
  
  return { supabase, projectRef };
}

// Cliente para uso en el lado del cliente
export const supabase = createSupabaseClient()

// ── Parche anti-bucle: interceptar refreshSession del SDK ──
// El SDK de Supabase 2.49.x tiene un _recoverAndRefresh() interno que se
// ejecuta automáticamente cuando detecta sesión expirada en storage.
// Este método llama a refreshSession() directamente, sin pasar por nuestro
// global.fetch interceptor. Parcheamos refreshSession para que respete
// el cooldown y no haga la petición HTTP si estamos bloqueados.
if (typeof window !== 'undefined') {
  const originalRefreshSession = supabase.auth.refreshSession.bind(supabase.auth);
  supabase.auth.refreshSession = async (...args: Parameters<typeof originalRefreshSession>) => {
    if (isRefreshBlocked()) {
      console.warn('🚫 [AUTH] refreshSession() bloqueado por cooldown anti-bucle');
      return {
        data: { session: null, user: null },
        error: { message: 'Invalid Refresh Token: Refresh Token Not Found' } as AuthError,
      };
    }
    return originalRefreshSession(...args);
  };
}

// Función para forzar sincronización de sesión y cookies
export const ensureSessionSynced = async (): Promise<boolean> => {
  try {
    console.log('🔄 [SESSION] Forzando sincronización de sesión...');
    
    // Obtener sesión actual
    const { data: sessionData, error } = await supabase.auth.getSession();
    
    if (error || !sessionData.session) {
      console.error('❌ [SESSION] No hay sesión válida para sincronizar');
      return false;
    }
    
    console.log('✅ [SESSION] Sesión válida encontrada:', sessionData.session.user.email);
    
    // Forzar guardado de la sesión en storage
    const projectRef = getProjectRef();
    const storageKey = `sb-${projectRef}-auth-token`;
    
    const sessionToken = {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_at: sessionData.session.expires_at,
      token_type: sessionData.session.token_type,
      user: sessionData.session.user
    };
    
    // Guardar en localStorage
    localStorage.setItem(storageKey, JSON.stringify(sessionToken));
    console.log('💾 [SESSION] Sesión guardada en localStorage');
    
    // Guardar en cookies con soporte de chunks para tokens grandes
    const cookieValue = encodeURIComponent(JSON.stringify(sessionToken));
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    const cookieDomain = getCookieDomain();
    
    // Limpiar cookie simple y chunks anteriores
    document.cookie = `${storageKey}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${cookieDomain}`;
    for (let i = 0; i < 20; i++) {
      document.cookie = `${storageKey}.${i}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${cookieDomain}`;
    }
    
    if (cookieValue.length < 3600) {
      // Cookie simple para valores pequeños
      document.cookie = `${storageKey}=${cookieValue}; path=/; max-age=604800; SameSite=Lax${secureFlag}${cookieDomain}`;
      console.log('🍪 [SESSION] Cookie simple establecida');
    } else {
      // Dividir en chunks para valores grandes
      // IMPORTANTE: Ajustar el límite para no dividir secuencias %XX
      // Next.js (cookie package) decodifica cada cookie individualmente con
      // decodeURIComponent. Si un %XX se divide entre chunks, la decodificación
      // falla y corrompe el token.
      const CHUNK_SIZE = 3500;
      let chunkIndex = 0;
      let offset = 0;
      while (offset < cookieValue.length) {
        let end = Math.min(offset + CHUNK_SIZE, cookieValue.length);
        if (end < cookieValue.length) {
          if (cookieValue[end - 2] === '%') {
            end -= 2;
          } else if (cookieValue[end - 1] === '%') {
            end -= 1;
          }
        }
        const chunk = cookieValue.substring(offset, end);
        document.cookie = `${storageKey}.${chunkIndex}=${chunk}; path=/; max-age=604800; SameSite=Lax${secureFlag}${cookieDomain}`;
        offset = end;
        chunkIndex++;
      }
      console.log(`🍪 [SESSION] Cookie chunked establecida: ${chunkIndex} chunks, ${cookieValue.length} bytes`);
    }
    
    // Verificación final después de un delay
    return new Promise((resolve) => {
      setTimeout(() => {
        const cookies = document.cookie.split(';');
        const exists = cookies.some(c => c.trim().startsWith(`${storageKey}=`) || c.trim().startsWith(`${storageKey}.0=`));
        console.log('🔍 [SESSION] Verificación final de cookie:', exists ? 'ÉXITO' : 'FALLÓ');
        resolve(exists);
      }, 200);
    });
    
  } catch (error) {
    console.error('❌ [SESSION] Error en sincronización:', error);
    return false;
  }
};

// Funciones de autenticación
// Throttle del lado del cliente para evitar que un usuario haga spam de login
// y dispare el rate limiting de Supabase (429).
let lastLoginAttempt = 0;
const LOGIN_THROTTLE_MS = 3_000; // mínimo 3s entre intentos de login
let lastLoginEmail = '';

type ResultadoAccesoServidor = {
  data: { session: Session | null; user: User | null };
  error: { message: string; status: number; codigoAcceso: string; bloqueadoHasta?: string } | null;
};

async function iniciarSesionPorServidor(email: string, password: string): Promise<ResultadoAccesoServidor> {
  let res: Response;
  try {
    res = await fetch('/api/auth/acceso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return { data: { session: null, user: null }, error: { message: 'red', status: 0, codigoAcceso: 'inesperado' } };
  }
  const cuerpo = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    session?: Session;
    codigo?: string;
    bloqueadoHasta?: string;
  };
  if (res.ok && cuerpo.ok && cuerpo.session) {
    return { data: { session: cuerpo.session, user: cuerpo.session.user }, error: null };
  }
  return {
    data: { session: null, user: null },
    error: {
      message: cuerpo.codigo || 'inesperado',
      status: res.status,
      codigoAcceso: cuerpo.codigo || 'inesperado',
      bloqueadoHasta: cuerpo.bloqueadoHasta,
    },
  };
}

export const signInWithEmail = async (email: string, password: string): Promise<ResultadoAccesoServidor> => {
  const now = Date.now();
  const timeSinceLast = now - lastLoginAttempt;

  // Si es el mismo email y han pasado menos de 3s, bloquear
  if (lastLoginEmail === email && timeSinceLast < LOGIN_THROTTLE_MS) {
    const waitMs = LOGIN_THROTTLE_MS - timeSinceLast;
    console.warn(`⏳ [AUTH] Login throttled, espera ${waitMs}ms`);
    return {
      data: { session: null, user: null },
      error: {
        message: 'Demasiados intentos. Espera unos segundos antes de volver a intentar.',
        status: 429,
        codigoAcceso: 'demasiadas',
      },
    };
  }

  lastLoginAttempt = now;
  lastLoginEmail = email;

  // Un login explícito invalida cualquier bloqueo previo por refresh token muerto.
  unblockRefresh('inicio de login con email');

  // Acceso v3, fase 5: el servidor cuenta los fallos y bloquea tras 5 por
  // cuenta + IP (POST /api/auth/acceso). El error lleva `codigoAcceso` (y
  // `bloqueadoHasta`), que `iniciarSesionConCorreo` usa tal cual.
  const result = await iniciarSesionPorServidor(email, password);

  if (result.data.session) {
    const { access_token, refresh_token, expires_at, user } = result.data.session;
  
    const tokenPayload = JSON.stringify({
      access_token,
      refresh_token,
      expires_at,
      user
    });
  
    const projectRef = getProjectRef(); // or hardcode your Supabase project ref
    const cookieName = `sb-${projectRef}-auth-token`;
  
    setCookie(cookieName, tokenPayload, 60 * 60 * 24 * 7); // 7 days

    // Guarda esta sesión en el registro de cuentas de este navegador para
    // permitir el cambio instantáneo entre cuentas ya autenticadas
    try {
      const { upsertAccountFromSession } = await import('@/lib/auth/accountSwitcher');
      await upsertAccountFromSession(result.data.session);
    } catch (e) {
      console.error('Error guardando cuenta para el selector de cuentas:', e);
    }
  }
  

  
  return result;
}

export const signInWithGoogle = async () => {
  console.log('Redirect to:', `${window.location.origin}/auth/callback`);
  return await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
}

export const signInWithMicrosoft = async () => {
  return await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
}

export const signOut = async () => {
  try {
    // Si es una sesión de impersonación de super admin, limpiar el member temporal
    const isImpersonating = localStorage.getItem('superAdminImpersonating') === 'true';
    const superAdminUserId = localStorage.getItem('superAdminUserId');
    const superAdminOrgId = localStorage.getItem('superAdminOrgId');

    if (isImpersonating && superAdminUserId && superAdminOrgId) {
      try {
        await fetch('/api/super-admin-cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: superAdminUserId, org_id: parseInt(superAdminOrgId) }),
        });
      } catch (e) {
        console.error('Error cleaning up super admin access:', e);
      }
    }

    // Extraer referencia del proyecto dinámicamente desde la URL de Supabase
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_URL.split('.')[0].replace('https://', '')
      : '';
      
    // Limpiar cookies de autenticación usando las mismas configuraciones con las que fueron creadas
    // Para cookies generales del sistema
    document.cookie = 'go-admin-erp-session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
    document.cookie = 'go-admin-user-id=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
    
    // Cookies de Supabase Auth
    document.cookie = 'sb-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
    document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
    document.cookie = 'sb-refresh-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
    
    // Limpiar cookie específica del proyecto usando la referencia dinámica
    if (projectRef) {
      document.cookie = `sb-${projectRef}-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
      // Limpiar chunks .0, .1, .2...
      for (let i = 0; i < 20; i++) {
        document.cookie = `sb-${projectRef}-auth-token.${i}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax`;
      }
    }
    
    // También limpiar la cookie CSRF
    document.cookie = 'csrf_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax; HttpOnly';
    
    // Limpiar localStorage de datos relacionados con la sesión
    localStorage.removeItem('supabase.auth.token');
    localStorage.removeItem('sb-access-token');
    localStorage.removeItem('sb-refresh-token');
    localStorage.removeItem('go-admin-erp-auth');
    localStorage.removeItem('currentOrganizationId');
    localStorage.removeItem('currentOrganizationName');
    localStorage.removeItem('currentOrganizationType');
    // No eliminar rememberMe ni userEmail para que el "recuérdame" funcione en el próximo login
    localStorage.removeItem('superAdminImpersonating');
    localStorage.removeItem('superAdminName');
    localStorage.removeItem('superAdminUserId');
    localStorage.removeItem('superAdminOrgId');
    
    // Cerrar sesión en Supabase
    return await supabase.auth.signOut();
  } catch (error) {
    console.error('Error durante el cierre de sesión:', error);
    throw error;
  }
}

// Get session with simplified response format for components that need the session object directly
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession()
  return { session: data.session, error }
}

export const getUserProfile = async (userId: string) => {
  return await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
}

export const getUserRole = async (userId: string) => {
  return await supabase
    .from('user_roles')
    .select('roles(name, permissions)')
    .eq('user_id', userId)
    .single()
}

export const getUserOrganization = async (userId: string, requestedOrgId?: string) => {
  try {
    if (!userId) {
      console.error('Error: Se requiere un ID de usuario válido');
      return { organization: null, role: null, error: 'Se requiere un ID de usuario válido', branches: [] };
    }
    
    // Obtenemos todas las membresías activas del usuario desde organization_members
    const { data: allMemberData, error: memberError } = await supabase
      .from('organization_members')
      .select('id, organization_id, role_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true);
      
    // Verificamos si hay error en la consulta
    if (memberError) {
      console.error('Error obteniendo datos de membresías:', memberError);
      return { organization: null, role: null, error: memberError?.message || 'Error al consultar las membresías', branches: [] };
    }
    
    // Si no hay datos de membresía, devolver información clara
    if (!allMemberData || allMemberData.length === 0) {
      console.log('No se encontró membresía activa para el usuario:', userId);
      return { 
        organization: null, 
        role: null, 
        error: 'No se encontró membresía activa para este usuario', 
        branches: [],
        needsOrganization: true // Flag para indicar que el usuario necesita ser asignado a una organización
      };
    }
    
    // Seleccionamos la membresía a utilizar: si se especificó un ID, usamos esa, si no, la primera
    let memberData;
    
    // Si hay un ID de organización solicitado, buscamos esa membresía
    if (requestedOrgId) {
      memberData = allMemberData.find(m => m.organization_id === requestedOrgId);
      if (!memberData) {
        return { 
          organization: null, 
          role: null, 
          error: 'No tiene acceso a la organización solicitada',
          branches: [],
          availableOrganizations: allMemberData.map(m => m.organization_id)
        };
      }
    } else {
      // Intentar respetar la organización que el usuario tiene seleccionada en localStorage
      let savedOrgId: number | null = null;
      if (typeof window !== 'undefined') {
        try {
          const savedIdStr = localStorage.getItem('currentOrganizationId');
          if (savedIdStr) savedOrgId = parseInt(savedIdStr, 10);
          if (!savedOrgId) {
            const savedOrg = localStorage.getItem('organizacionActiva');
            if (savedOrg) {
              const parsed = JSON.parse(savedOrg);
              if (parsed?.id) savedOrgId = parsed.id;
            }
          }
        } catch { /* silencioso en SSR */ }
      }

      if (savedOrgId) {
        memberData = allMemberData.find(m => m.organization_id === savedOrgId);
      }
      // Fallback: si no se encontró la org guardada, tomamos la primera
      if (!memberData) {
        memberData = allMemberData[0];
      }
    }
    
    // Ya manejamos los errores y verificación de existencia de membresías arriba
    
    // Si tenemos la organización, continuamos
    const organizationId = memberData.organization_id;
    
    // Inicializamos variables para el rol
    let userRoleName = null;
    
    // Obtenemos el rol del usuario en la organización usando role_id de organization_members
    if (memberData.role_id) {
      const { data: roleFromId, error: roleFromIdError } = await supabase
        .from('roles')
        .select('id, name, description')
        .eq('id', memberData.role_id)
        .maybeSingle();
      
      if (!roleFromIdError && roleFromId) {
        userRoleName = roleFromId.name;
      } else if (roleFromIdError) {
        console.error('Error obteniendo rol desde role_id:', roleFromIdError);
      }
    }
    
    // Ahora obtenemos la información de la organización
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, status, type_id, organization_types!fk_organizations_organization_type(name)')
      .eq('id', organizationId)
      .maybeSingle(); // Usar maybeSingle para manejo seguro
    
    if (orgError) {
      console.error('Error consultando organización:', orgError);
      return { organization: null, role: null, error: orgError?.message || 'Error al consultar la organización', branches: [] };
    }
    
    // Si no se encuentra la organización
    if (!orgData) {
      console.log(`Organización no encontrada. ID: ${organizationId}`);
      return { 
        organization: null, 
        role: null, 
        error: 'La organización asignada no existe o fue eliminada', 
        branches: [],
        invalidOrganization: true
      };
    }
    
    // Obtenemos las sucursales
    const { data: branchData, error: branchesError } = await supabase
      .from('branches')
      .select('id, name, address, city, state, country, latitude, longitude, is_main, branch_code')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    
    if (branchesError) {
      console.error('Error obteniendo sucursales:', branchesError);
      // Continuamos a pesar del error
    }
    
    // Aseguramos que branches siempre sea un array
    const branchesData = branchData || [];
    
    // Determinamos la sucursal predeterminada
    let defaultBranchId = null;
    
    if (branchesData.length > 0) {
      // Preferir la sucursal marcada como principal (is_main=true);
      // si ninguna lo está, usar la primera disponible.
      defaultBranchId = branchesData.find((b) => b.is_main === true)?.id ?? branchesData[0].id;
    } else {
      console.log(`La organización ${orgData.id} no tiene sucursales activas`);
    }
    
    // Si no se pudo obtener el rol, usar un valor por defecto
    if (!userRoleName) {
      userRoleName = 'Usuario';
    }
    
    return { 
      organization: {
        id: orgData.id,
        name: orgData.name,
        status: orgData.status,
        type_id: orgData.type_id,
        organization_type: orgData.organization_types && orgData.organization_types.length > 0 ? orgData.organization_types[0].name : null,
        branch_id: defaultBranchId // Añadimos la sucursal predeterminada para compatibilidad
      },
      branch_id: defaultBranchId, // También lo dejamos en la raíz para el nuevo código
      branches: branchesData,
      role: userRoleName,
      hasBranches: branchesData.length > 0
    };
  } catch (error) {
    console.error('Error general obteniendo organización:', error);
    return { 
      organization: null, 
      role: null, 
      error: 'Error inesperado al obtener datos de organización',
      branches: [],
      unexpectedError: true
    };
  }
}

export const getBranches = async (organizationId: string) => {
  return await supabase
    .from('branches')
    .select('*')
    .eq('organization_id', organizationId)
}

export const resetPassword = async (email: string) => {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
      captchaToken: undefined // Opcional: agregar captcha si es necesario
    });
    
    if (error) {
      // Manejar errores específicos
      if (error.message.includes('Email not confirmed')) {
        throw new Error('Tu cuenta aún no ha sido verificada. Por favor confirma tu email primero.');
      }
      if (error.message.includes('Email rate limit exceeded')) {
        throw new Error('Has enviado demasiados correos de recuperación. Espera unos minutos antes de intentar nuevamente.');
      }
      if (error.message.includes('User not found')) {
        // Por seguridad, no revelamos si el email existe o no
        return { data, error: null };
      }
      throw error;
    }
    
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export const updatePassword = async (newPassword: string) => {
  return await supabase.auth.updateUser({
    password: newPassword
  })
}

// Obtener organizaciones disponibles
// Obtener organizaciones disponibles
export const getOrganizations = async () => {
  const { data, error } = await supabase
    .from('organizations')
    .select(`
      id, 
      name, 
      status, 
      logo_url,
      type_id (
        id, 
        name
      ),
      plan_id (
        id,
        name
      )
    `)
    .order('name');

  console.log("data", data);
  
  if (error) {
    console.error('Error al obtener organizaciones:', error);
    return [];
  }
  
  // Return organizations without plan information if plans couldn't be fetched
  return data?.map(org => ({
    id: org.id,
    name: org.name,
    status: org.status,
    logo_url: org.logo_url,
    type_id: org.type_id,
    plan_id: org.plan_id
  })) || [];
};

// Función específica para registro con manejo mejorado de verificación
// Invitaciones: validateInvitation / acceptInvitation / createProfileFromInvitation
// se retiraron (GO-sec 2026-09-28). Leían invitations.code desde el navegador y
// nadie las importaba. El flujo vive en /api/auth/invite*, /api/auth/accept-invitation
// y src/lib/auth/invitaciones.ts (servidor).
