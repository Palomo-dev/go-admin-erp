// auth-manager.ts - Gestor centralizado de autenticación para reducir solicitudes de tokens
import { supabase } from './config';

// Almacena la última vez que se verificó la sesión para evitar verificaciones frecuentes
let lastSessionCheck = 0;
// Tiempo mínimo entre verificaciones (30 minutos en ms para reducir solicitudes)
const MIN_CHECK_INTERVAL = 30 * 60 * 1000; // Aumentado de 15 a 30 minutos
// Tiempo adicional para evitar que expiren los tokens (30 minutos antes)
const REFRESH_BEFORE_EXPIRY = 30 * 60 * 1000;
// Tiempo de espera para debounce (5 segundos)
const DEBOUNCE_TIMEOUT = 5000;

// Verificamos también si hay una sesión guardada en localStorage para evitar llamadas iniciales
let cachedSession: any = null;
let sessionCheckPromise: Promise<any> | null = null;

try {
  if (typeof window !== 'undefined') {
    const sessionStr = localStorage.getItem('sb-session-cache');
    if (sessionStr) {
      const localStorageSession = JSON.parse(sessionStr);
      // Verificar si la sesión almacenada en localStorage aún es válida
      if (localStorageSession?.expires_at) {
        const expiryTime = localStorageSession.expires_at * 1000;
        if (expiryTime < Date.now()) {
          // La sesión expiró, limpiar
          localStorage.removeItem('sb-session-cache');
        } else {
          // La sesión es válida, usarla como caché inicial
          cachedSession = localStorageSession;
        }
      }
    }
  }
} catch (e) {
  console.warn('Error al leer sesión de localStorage:', e);
}

// Para mejorar debounce y deduplicación
let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Obtiene la sesión actual del usuario de manera optimizada.
 * Utiliza caché en memoria y localStorage para reducir llamadas a Supabase.
 * Implementa mecanismos de debounce y deduplicación para minimizar peticiones.
 */
export const getOptimizedSession = async () => {
  const now = Date.now();
  
  // Deduplicación: Si hay una promesa en curso, esperar a que termine para evitar llamadas paralelas
  if (sessionCheckPromise) {
    return sessionCheckPromise;
  }
  
  // Mejora del caché: Si ya tenemos una sesión en caché y no ha pasado el tiempo mínimo, usarla
  if (cachedSession && (now - lastSessionCheck < MIN_CHECK_INTERVAL)) {
    // Verificar si la sesión está por expirar y refrescarla si es necesario
    const expiresAt = (cachedSession.expires_at || 0) * 1000;
    if (expiresAt - now < REFRESH_BEFORE_EXPIRY) {
      // Debounce: evitar múltiples refreshes en un periodo corto de tiempo
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        refreshSessionToken();
      }, DEBOUNCE_TIMEOUT);
    }
    return { session: cachedSession, error: null };
  }
  
  // Crear una nueva promesa para obtener la sesión
  sessionCheckPromise = new Promise(async (resolve) => {
    try {
      // Verificación más completa para reducir llamadas innecesarias
      const hasSupabaseCookie = typeof document !== 'undefined' && 
        document.cookie.split(';').some(c => c.trim().startsWith('sb-'));
      const hasLocalStorageSession = typeof localStorage !== 'undefined' && 
        localStorage.getItem('sb-session-cache') !== null;
        
      if (!hasSupabaseCookie && !hasLocalStorageSession) {
        resolve({ session: null, error: null });
        return;
      }

      // Si llegamos aquí, necesitamos verificar con Supabase
      const { data, error } = await supabase.auth.getSession();
      
      // Actualizar caché y timestamp solo si la operación fue exitosa
      if (!error && data.session) {
        cachedSession = data.session;
        lastSessionCheck = now;
        
        // Guardar en localStorage para persistencia entre recargas
        try {
          localStorage.setItem('sb-session-cache', JSON.stringify(data.session));
        } catch (e) {
          console.warn('Error al guardar sesión en localStorage:', e);
        }
      } else if (!data.session) {
        // Limpiar caché si no hay sesión
        cachedSession = null;
        localStorage.removeItem('sb-session-cache');
      }
      
      resolve({ session: data.session, error });
    } catch (e) {
      console.error('Error al obtener sesión:', e);
      resolve({ session: null, error: e });
    } finally {
      // Liberar la promesa en curso
      sessionCheckPromise = null;
    }
  });
  
  return sessionCheckPromise;
};

/**
 * Refresca manualmente el token de sesión cuando sea necesario
 * en lugar de depender de la renovación automática
 */
export const refreshSessionToken = async () => {
  // Usar un flag para evitar múltiples refrescos simultáneos
  const refreshingKey = 'sb-refreshing-token';
  if (sessionStorage.getItem(refreshingKey) === 'true') {
    return { session: cachedSession, error: null };
  }
  
  try {
    sessionStorage.setItem(refreshingKey, 'true');
    
    // Verificar si tenemos un token válido antes de intentar refrescar
    const { session } = await getOptimizedSession();
    if (!session) {
      sessionStorage.removeItem(refreshingKey);
      return { error: 'No hay sesión activa' };
    }
    
    // Verificar si el token expira en menos de 30 minutos
    const expiresAt = (session.expires_at || 0) * 1000; // convertir a ms
    const expiryThreshold = Date.now() + REFRESH_BEFORE_EXPIRY;
    
    // Solo refrescar si está próximo a expirar
    if (expiresAt < expiryThreshold) {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (data.session) {
        // Actualizar caché con la nueva sesión
        cachedSession = data.session;
        lastSessionCheck = Date.now();
        
        // Guardar en localStorage para persistencia entre recargas
        try {
          localStorage.setItem('sb-session-cache', JSON.stringify(data.session));
        } catch (e) {
          console.warn('Error al guardar sesión refrescada en localStorage:', e);
        }
        
        sessionStorage.removeItem(refreshingKey);
        return { session: data.session, error };
      }
      
      sessionStorage.removeItem(refreshingKey);
      return { session: null, error };
    }
    
    return { session, error: null };
  } catch (e) {
    console.error('Error al refrescar token:', e);
    return { session: null, error: e };
  }
};

/**
 * Limpia la caché de sesión, útil al cerrar sesión
 */
export const clearSessionCache = () => {
  cachedSession = null;
  lastSessionCheck = 0;
  lastHealthCheck = 0;
  
  // Limpiar timers para evitar ejecuciones pendientes
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  
  // Limpiar almacenamiento
  localStorage.removeItem('sb-session-cache');
  sessionStorage.removeItem('sb-refreshing-token');
  sessionStorage.removeItem('last-activity-time');
};

/**
 * Comprueba si el usuario está autenticado de manera optimizada
 */
/**
 * Comprueba si el usuario está autenticado de manera optimizada
 * Intenta usar caché en todas las capas antes de hacer llamadas a Supabase
 * Optimizado para reducir verificaciones innecesarias
 */
export const isAuthenticated = async () => {
  // Verificar caché en memoria primero (la opción más rápida)
  if (cachedSession) {
    const expiresAt = (cachedSession.expires_at || 0) * 1000;
    if (expiresAt > Date.now()) {
      return { isAuthenticated: true, session: cachedSession, error: null };
    }
  }
  
  // Comprobar si hay cookies de sesión
  const hasSessionCookies = typeof document !== 'undefined' && 
    document.cookie.split(';').some(c => c.trim().startsWith('sb-'));
  
  // Si no hay cookies, verificar rápidamente el localStorage
  if (!hasSessionCookies) {
    const sessionStr = typeof localStorage !== 'undefined' ? localStorage.getItem('sb-session-cache') : null;
    if (!sessionStr) {
      // No hay indicios de sesión en ningún lado
      return { isAuthenticated: false, session: null, error: null };
    }
    
    try {
      // Verificar si la sesión en localStorage aún es válida antes de hacer una llamada
      const localSession = JSON.parse(sessionStr);
      if (localSession && localSession.expires_at) {
        const expiryTime = localSession.expires_at * 1000;
        if (expiryTime > Date.now()) {
          // Actualizar caché en memoria
          cachedSession = localSession;
          lastSessionCheck = Date.now() - (MIN_CHECK_INTERVAL / 2); // Forzar una verificación pronto pero no inmediatamente
          return { isAuthenticated: true, session: localSession, error: null };
        }
      }
    } catch (e) {
      console.warn('Error al leer sesión de localStorage:', e);
    }
  }
  
  // Si hay indicios de sesión, verificar con el método optimizado
  const { session, error } = await getOptimizedSession();
  return { isAuthenticated: !!session, session, error };
};

// Almacena la última verificación de salud para reducir llamadas innecesarias
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutos entre verificaciones de salud

/**
 * Realiza una verificación de salud optimizada
 * Reduce la frecuencia de las verificaciones a una vez cada 30 minutos
 */
export const performHealthCheck = async () => {
  const now = Date.now();
  
  // Solo realizar la verificación si ha pasado el intervalo mínimo
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
    return { success: true, fromCache: true };
  }
  
  try {
    // Realizar verificación de sesión como parte del health check
    const { session } = await getOptimizedSession();
    lastHealthCheck = now;
    
    // Devolver éxito o fracaso basado en la sesión
    return { 
      success: !!session, 
      fromCache: false, 
      timestamp: now 
    };
  } catch (e) {
    console.error('Error en health check:', e);
    return { success: false, error: e, fromCache: false };
  }
};

/**
 * Hook personalizado para inicializar la sesión en páginas cliente
 * Llámalo una vez en el componente raíz de la aplicación
 */
export const initializeAuthState = () => {
  // Verificar sesión en caché al iniciar la aplicación
  setTimeout(() => {
    getOptimizedSession().then(({ session }) => {
      // Si encontramos sesión, programar un refresh si es necesario
      if (session) {
        const expiresAt = (session.expires_at || 0) * 1000;
        if (expiresAt - Date.now() < REFRESH_BEFORE_EXPIRY) {
          refreshSessionToken();
        }
        
        // Realizar verificación de salud inicial pero con una demora para no bloquear el renderizado
        setTimeout(() => {
          performHealthCheck();
        }, 5000);
      }
    });
  }, 0);
};
