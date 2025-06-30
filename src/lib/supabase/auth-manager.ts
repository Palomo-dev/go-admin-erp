// auth-manager.ts - Gestor centralizado de autenticación para reducir solicitudes de tokens
import { supabase } from './config';

// Almacena la última vez que se verificó la sesión para evitar verificaciones frecuentes
let lastSessionCheck = 0;
// Tiempo mínimo entre verificaciones (15 minutos en ms para reducir solicitudes)
const MIN_CHECK_INTERVAL = 15 * 60 * 1000;
// Tiempo adicional para evitar que expiren los tokens (30 minutos antes)
const REFRESH_BEFORE_EXPIRY = 30 * 60 * 1000;

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

/**
 * Obtiene la sesión actual del usuario de manera optimizada.
 * Utiliza caché en memoria y localStorage para reducir llamadas a Supabase.
 */
export const getOptimizedSession = async () => {
  const now = Date.now();
  
  // Si hay una promesa en curso, esperar a que termine para evitar llamadas paralelas
  if (sessionCheckPromise) {
    return sessionCheckPromise;
  }
  
  // Si ya tenemos una sesión en caché y no ha pasado el tiempo mínimo, usarla
  if (cachedSession && (now - lastSessionCheck < MIN_CHECK_INTERVAL)) {
    // Verificar si la sesión está por expirar y refrescarla si es necesario
    const expiresAt = (cachedSession.expires_at || 0) * 1000;
    if (expiresAt - now < REFRESH_BEFORE_EXPIRY) {
      // Programar un refresh en segundo plano sin bloquear
      setTimeout(() => refreshSessionToken(), 0);
    }
    return { session: cachedSession, error: null };
  }
  
  // Crear una nueva promesa para obtener la sesión
  sessionCheckPromise = new Promise(async (resolve) => {
    try {
      // Intentar reducir llamadas innecesarias si no hay sesión en curso
      if (document.cookie.indexOf('sb-') === -1 && !localStorage.getItem('sb-session-cache')) {
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
  localStorage.removeItem('sb-session-cache');
  sessionStorage.removeItem('sb-refreshing-token');
};

/**
 * Comprueba si el usuario está autenticado de manera optimizada
 */
/**
 * Comprueba si el usuario está autenticado de manera optimizada
 * Intenta usar caché en todas las capas antes de hacer llamadas a Supabase
 */
export const isAuthenticated = async () => {
  // Comprobar rápidamente si hay cookies de sesión
  const hasSessionCookies = typeof document !== 'undefined' && document.cookie.indexOf('sb-') !== -1;
  
  // Si no hay cookies, verificar rápidamente el localStorage
  if (!hasSessionCookies) {
    const sessionStr = typeof localStorage !== 'undefined' ? localStorage.getItem('sb-session-cache') : null;
    if (!sessionStr) {
      // No hay indicios de sesión en ningún lado
      return { isAuthenticated: false, session: null, error: null };
    }
  }
  
  // Si hay indicios de sesión, verificar con el método optimizado
  const { session, error } = await getOptimizedSession();
  return { isAuthenticated: !!session, session, error };
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
      }
    });
  }, 0);
};
