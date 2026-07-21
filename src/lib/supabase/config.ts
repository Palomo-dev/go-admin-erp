import { createClient, type Provider } from '@supabase/supabase-js'

// Extrae la referencia del proyecto de la URL de Supabase
export const getProjectRef = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return supabaseUrl.split('.')[0].replace('https://', '');
}

// Función para obtener el valor de una cookie
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

// Función para establecer una cookie (con soporte de chunks para cookies grandes)
const setCookie = (name: string, value: string, maxAge: number = 604800) => {
  if (typeof document === 'undefined') return;
  
  const isAuthCookie = name.includes('-auth-token');
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = isProduction ? '; domain=.goadmin.io' : '';
  const encodedValue = encodeURIComponent(value);
  
  // Limpiar chunks anteriores si existían
  for (let i = 0; i < 20; i++) {
    document.cookie = `${name}.${i}=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT;SameSite=Lax${cookieDomain}`;
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

// Función para eliminar una cookie
const removeCookie = (name: string) => {
  if (typeof document === 'undefined') return;
  
  const isAuthCookie = name.includes('-auth-token');
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = isProduction ? '; domain=.goadmin.io' : '';
  
  document.cookie = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT;SameSite=Lax${!isAuthCookie ? ';HttpOnly' : ''}${isProduction ? ';Secure' : ''}${cookieDomain}`;
  // Limpiar chunks .0, .1, .2...
  for (let i = 0; i < 20; i++) {
    document.cookie = `${name}.${i}=;path=/;expires=Thu, 01 Jan 1970 00:00:01 GMT;SameSite=Lax${cookieDomain}`;
  }
}

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
  
  const projectRef = getProjectRef();
  const storageKey = projectRef ? `sb-${projectRef}-auth-token` : 'sb-auth-token';
  
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: {
        getItem: (key: string) => {
          if (typeof window !== 'undefined') {
            // En el cliente, leer de localStorage como fallback y cookies
            const fromLocalStorage = localStorage.getItem(key);
            if (fromLocalStorage) {
              return fromLocalStorage;
            }
            
            // Intentar leer de cookies (cookie simple)
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
              const [name, value] = cookie.trim().split('=');
              if (name === key && value) {
                console.log('🍪 [STORAGE] Leído de cookie:', key);
                return decodeURIComponent(value);
              }
            }
            
            // Intentar leer cookies chunked (key.0, key.1, ...)
            // IMPORTANTE: No decodificar cada chunk individualmente.
            // El valor completo se codifica con encodeURIComponent antes de dividirse,
            // por lo que un carácter %XX puede quedar dividido entre dos chunks.
            // Se deben concatenar los chunks raw y decodificar el resultado completo.
            const chunkPrefix = `${key}.`;
            const chunks: { index: number; value: string }[] = [];
            for (let cookie of cookies) {
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
            // Guardar en localStorage primero
            localStorage.setItem(key, value);
            console.log('💾 [STORAGE] Guardado en localStorage:', key);
            
            // También guardar en cookies para que el middleware pueda leerlo
            const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
            const isProduction = process.env.NODE_ENV === 'production';
            const cookieDomain = isProduction ? '; domain=.goadmin.io' : '';
            const encodedValue = encodeURIComponent(value);
            
            // Limpiar chunks anteriores si existían
            document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${cookieDomain}`;
            for (let i = 0; i < 20; i++) {
              document.cookie = `${key}.${i}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${cookieDomain}`;
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
            const isProduction = process.env.NODE_ENV === 'production';
            const cookieDomain = isProduction ? '; domain=.goadmin.io' : '';
            document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${cookieDomain}`;
            // Limpiar chunks .0, .1, .2...
            for (let i = 0; i < 20; i++) {
              document.cookie = `${key}.${i}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax${cookieDomain}`;
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
      // Configurar reintentos con backoff exponencial para manejar límites de solicitudes (429)
      fetch: (url: string | URL | Request, options?: RequestInit) => {
        const MAX_RETRIES = 3;
        const BASE_DELAY = 1000; // 1 segundo
        
        // No reintentar peticiones de Auth (ej: /auth/v1/token). Reintentar el
        // refresh de sesión amplifica el problema de rate limit (429) y provoca
        // errores de "refresh_token_already_used".
        const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.toString() : url.url);
        const isAuthRequest = urlString.includes('/auth/v1/');
        
        return new Promise((resolve, reject) => {
          const attemptFetch = async (retriesLeft: number, delay: number) => {
            try {
              const response = await fetch(url, options);
              
              // Si recibimos un 429 (Too Many Requests) y aún tenemos reintentos
              if (response.status === 429 && retriesLeft > 0 && !isAuthRequest) {
                console.log(`Límite de solicitudes alcanzado, reintentando en ${delay}ms (${retriesLeft} intentos restantes)`);
                
                // Esperar antes de reintentar con backoff exponencial
                await new Promise(res => setTimeout(res, delay));
                return attemptFetch(retriesLeft - 1, delay * 2);
              }
              
              resolve(response);
            } catch (error: any) {
              // No reintentar si la petición fue cancelada intencionalmente (AbortController.abort()).
              // Reintentar aquí mantendría la conexión ocupada varios segundos más y anularía el propósito del abort.
              const isAborted = error?.name === 'AbortError' || options?.signal?.aborted;
              if (retriesLeft > 0 && !isAborted) {
                console.log(`Error en solicitud, reintentando en ${delay}ms (${retriesLeft} intentos restantes)`);
                await new Promise(res => setTimeout(res, delay));
                return attemptFetch(retriesLeft - 1, delay * 2);
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
export const createSupabaseServerClient = (request?: any) => {
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
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain = isProduction ? '; domain=.goadmin.io' : '';
    
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
export const signInWithEmail = async (email: string, password: string) => {
  const result = await supabase.auth.signInWithPassword({ email, password });
  
  // Si el login es exitoso, forzar sincronización
  if (result.data.session && !result.error) {
    console.log('✅ [AUTH] Login exitoso, sincronizando sesión...');
  }

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
      defaultBranchId = branchesData[0].id;
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
  } catch (err: any) {
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
export const signUpWithEmail = async (email: string, password: string, userData: any, redirectUrl: string) => {
  // Check if email already exists
  console.log('Verificando correo electrónico...');
  console.log('Email:', email); 
  const { data: existingUsers } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  console.log('Usuario existente:', existingUsers);

  if (existingUsers) {
    return {
      data: { user: null },
      error: { message: 'Este correo electrónico ya está registrado' }
    };
  }
  console.log('Usuario no existente, procediendo a crear...');
  console.log('Datos del usuario:', email, password, userData, redirectUrl);

  try {
    console.log('Intentando crear usuario con Supabase Auth...');
    const { data, error } = await supabase.auth.signUp({
      email: 'example@email.com',
      password: 'example-password',
    })
    
    return { data: { user: null, session: null }, error: null };
  } catch (error: any) {
    console.error('Error crítico en signUpWithEmail:', error);
    
    return {
      data: { user: null, session: null },
      error: {
        message: 'Error interno del servidor. Por favor, intenta nuevamente o contacta al administrador.'
      }
    };
  }
}


// Definir tipos para los datos de invitación
type InviteData = {
  id: string;
  email: string;
  organization_id: string;
  organizations: { name: string } | null;
  branch_id: string;
  role_id: string;
  roles: { name: string } | null;
  created_at: string;
  expires_at: string | null;
  used: boolean;
};

// Función para validar invitaciones
export const validateInvitation = async (inviteCode: string) => {
  const { data, error } = await supabase
    .from('invitations')
    .select(`
      id,
      email,
      code,
      role_id,
      organization_id,
      created_at,
      expires_at,
      used_at,
      status,
      roles(name),
      organizations(name)
    `)
    .eq('code', inviteCode)
    .single();

  if (error) return { data: null, error };

  // Check if invitation is already used, revoked, or expired
  if (data.status === 'used') {
    return { data: null, error: { message: 'La invitación ya ha sido utilizada' } };
  }

  if (data.status === 'revoked') {
    return { data: null, error: { message: 'La invitación ha sido revocada' } };
  }

  const expired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
  if (expired) {
    return { data: null, error: { message: 'La invitación ha expirado' } };
  }

  // Extract data safely from potentially nested objects or arrays
  let organizationName = '';
  let roleName = '';

  // Handle organization data safely
  if (data.organizations) {
    // Supabase returns this as an object with name property
    const org = data.organizations as unknown;
    if (org && typeof org === 'object' && 'name' in org) {
      organizationName = (org as {name: string}).name || '';
    }
  }

  // Handle roles data safely
  if (data.roles) {
    // Supabase returns this as an object with name property
    const role = data.roles as unknown;
    if (role && typeof role === 'object' && 'name' in role) {
      roleName = (role as {name: string}).name || '';
    }
  }

  // Format the data for response
  const formattedData = {
    id: data.id,
    code: data.code,
    email: data.email,
    organization_id: data.organization_id,
    organization_name: organizationName,
    role_id: data.role_id,
    role_name: roleName,
    created_at: data.created_at,
    expires_at: data.expires_at
  };

  return { data: formattedData, error: null };
}

// Función para aceptar invitaciones
export const acceptInvitation = async ({ 
  inviteCode, 
  password, 
  userData 
}: { 
  inviteCode: string; 
  password: string; 
  userData: any 
}) => {
  // Validamos la invitación
  const { data: inviteData, error: validateError } = 
    await validateInvitation(inviteCode);
  
  if (validateError) {
    return { error: validateError };
  }

  try {
    let userId = null;
    
    // First, check if user is already signed in (from email confirmation)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (session && session.user && session.user.email?.toLowerCase() === inviteData.email.toLowerCase()) {
      // User is already authenticated via email confirmation
      console.log('User already authenticated via email confirmation:', session.user.id);
      userId = session.user.id;
    } else {
      // Try to create the user (this might fail if user already exists)
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: inviteData.email,
        password,
        options: {
          data: userData
        }
      });
      
      if (signUpError) {
        // Check if error is due to user already existing
        if (signUpError.message?.includes('already registered') || signUpError.message?.includes('already exists')) {
          // User exists, try to sign them in to get their ID
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: inviteData.email,
            password
          });
          
          if (signInError || !signInData.user) {
            return { error: { message: 'Usuario ya existe pero la contraseña no coincide. Por favor, usa la contraseña que estableciste anteriormente.' } };
          }
          
          userId = signInData.user.id;
          console.log('User already existed, signed in successfully:', userId);
        } else {
          return { error: signUpError };
        }
      } else if (authData && authData.user) {
        userId = authData.user.id;
        console.log('New user created successfully:', userId);
      } else {
        return { error: { message: 'No se pudo crear o autenticar el usuario' } };
      }
    }

    // Obtenemos información de la sucursal principal
    const { data: branchData } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', inviteData.organization_id)
      .eq('is_main', true)
      .single();

    const branchId = branchData?.id || null;

    // Agregamos el usuario a la tabla profiles con todos los campos requeridos
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: inviteData.email,
        first_name: userData.firstName || userData.first_name,
        last_name: userData.lastName || userData.last_name,
        phone: userData.phoneNumber || userData.phone,
        organization_id: inviteData.organization_id,
        role_id: inviteData.role_id,
        branch_id: branchId,
        status: 'active',
        is_owner: false,
        metadata: {},
        preferred_language: 'es',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (profileError) {
      console.error('Error al crear perfil:', profileError);
      return { error: profileError };
    }

    // Marcamos la invitación como utilizada
    const { error: updateInviteError } = await supabase
      .from('invitations')
      .update({ 
        status: 'used', 
        used_at: new Date().toISOString() 
      })
      .eq('code', inviteCode);
    
    if (updateInviteError) {
      console.error('Error al actualizar invitación:', updateInviteError);
      return { error: updateInviteError };
    }
    
    return { data: { user: { id: userId } }, error: null };
  } catch (error: any) {
    console.error('Error en acceptInvitation:', error);
    return { 
      data: null, 
      error: { 
        message: error.message || 'Error al aceptar la invitación' 
      } 
    };
  }
};

// Función auxiliar para completar perfil de invitación
export const createProfileFromInvitation = async ({
  inviteCode,
  userData,
  authUserId,
  password
}: {
  inviteCode: string;
  userData: any;
  authUserId: string;
  password?: string;
}) => {
  // Validar la invitación
  const { data: inviteData, error: validateError } = await validateInvitation(inviteCode);
  
  if (validateError) {
    return { error: validateError };
  }

  try {
    // Obtener información de la sucursal principal
    const { data: branchData } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', inviteData.organization_id)
      .eq('is_main', true)
      .single();

    const branchId = branchData?.id || null;

    // Actualizar contraseña si se proporciona
    if (password) {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: password
      });
      
      if (passwordError) {
        console.error('Error al actualizar contraseña:', passwordError);
        return { error: { message: 'Error al actualizar la contraseña: ' + passwordError.message } };
      }
      console.log('Contraseña actualizada exitosamente');
    }

    // Actualizar perfil (el trigger ya creó el perfil básico)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        first_name: userData.firstName || userData.first_name,
        last_name: userData.lastName || userData.last_name,
        phone: userData.phoneNumber || userData.phone,
        branch_id: branchId,
        last_org_id: inviteData.organization_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', authUserId);
    
    if (profileError) {
      console.error('Error al actualizar perfil:', profileError);
      return { error: profileError };
    }
    console.log('Perfil actualizado exitosamente');

    // Verificar si ya existe la membresía en la organización
    const { data: existingMembership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', authUserId)
      .eq('organization_id', inviteData.organization_id)
      .single();

    if (!existingMembership) {
      // Crear membresía en la organización
      const { error: membershipError } = await supabase
        .from('organization_members')
        .insert({
          user_id: authUserId,
          organization_id: inviteData.organization_id,
          role_id: inviteData.role_id,
          is_active: true
        });

      if (membershipError) {
        console.error('Error al crear membresía:', membershipError);
        return { error: { message: 'Error al crear la membresía en la organización: ' + membershipError.message } };
      }
      console.log('Membresía en organización creada exitosamente');
    } else {
      // Actualizar membresía existente
      const { error: updateMembershipError } = await supabase
        .from('organization_members')
        .update({
          role_id: inviteData.role_id,
          is_active: true
        })
        .eq('user_id', authUserId)
        .eq('organization_id', inviteData.organization_id);

      if (updateMembershipError) {
        console.error('Error al actualizar membresía:', updateMembershipError);
        return { error: { message: 'Error al actualizar la membresía: ' + updateMembershipError.message } };
      }
      console.log('Membresía en organización actualizada exitosamente');
    }

    // Marcar la invitación como utilizada
    const { error: updateInviteError } = await supabase
      .from('invitations')
      .update({ 
        status: 'used', 
        used_at: new Date().toISOString() 
      })
      .eq('code', inviteCode);
    
    if (updateInviteError) {
      console.error('Error al actualizar invitación:', updateInviteError);
      return { error: updateInviteError };
    }
    console.log('Invitación marcada como utilizada');
    
    console.log('Proceso de invitación completado exitosamente para usuario:', authUserId);
    return { data: { user: { id: authUserId } }, error: null };

  } catch (error: any) {
    console.error('Error en createProfileFromInvitation:', error);
    return { 
      error: { 
        message: error.message || 'Error al crear el perfil' 
      } 
    };
  }
};
