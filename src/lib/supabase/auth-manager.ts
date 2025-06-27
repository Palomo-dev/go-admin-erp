// auth-manager.ts - Gestor centralizado de autenticación para reducir solicitudes de tokens
import { supabase } from './config';

// Almacena la última vez que se verificó la sesión para evitar verificaciones frecuentes
let lastSessionCheck = 0;
// Tiempo mínimo entre verificaciones (5 minutos en ms)
const MIN_CHECK_INTERVAL = 5 * 60 * 1000;
// Almacena la sesión en memoria para reducir llamadas a getSession()
let cachedSession: any = null;
// Almacena una promesa de la operación en curso para evitar operaciones paralelas
let sessionCheckPromise: Promise<any> | null = null;

/**
 * Obtiene la sesión actual del usuario de manera optimizada.
 * Utiliza caché en memoria para reducir llamadas a Supabase.
 */
export const getOptimizedSession = async () => {
  const now = Date.now();
  
  // Si hay una promesa en curso, esperar a que termine para evitar llamadas paralelas
  if (sessionCheckPromise) {
    return sessionCheckPromise;
  }
  
  // Si ya tenemos una sesión en caché y no ha pasado el tiempo mínimo, usarla
  if (cachedSession && (now - lastSessionCheck < MIN_CHECK_INTERVAL)) {
    return { session: cachedSession, error: null };
  }
  
  // Crear una nueva promesa para obtener la sesión
  sessionCheckPromise = new Promise(async (resolve) => {
    try {
      const { data, error } = await supabase.auth.getSession();
      
      // Actualizar caché y timestamp solo si la operación fue exitosa
      if (!error && data.session) {
        cachedSession = data.session;
        lastSessionCheck = now;
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
  try {
    // Verificar si tenemos un token válido antes de intentar refrescar
    const { session } = await getOptimizedSession();
    if (!session) {
      return { error: 'No hay sesión activa' };
    }
    
    // Verificar si el token expira en menos de 10 minutos
    const expiresAt = (session.expires_at || 0) * 1000; // convertir a ms
    const tenMinutesFromNow = Date.now() + 10 * 60 * 1000;
    
    // Solo refrescar si está próximo a expirar
    if (expiresAt < tenMinutesFromNow) {
      console.log('Refrescando token de sesión...');
      const { data, error } = await supabase.auth.refreshSession();
      
      if (data.session) {
        // Actualizar caché con la nueva sesión
        cachedSession = data.session;
        lastSessionCheck = Date.now();
        return { session: data.session, error };
      }
      
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
};

/**
 * Comprueba si el usuario está autenticado de manera optimizada
 */
export const isAuthenticated = async () => {
  const { session, error } = await getOptimizedSession();
  return { isAuthenticated: !!session, session, error };
};
