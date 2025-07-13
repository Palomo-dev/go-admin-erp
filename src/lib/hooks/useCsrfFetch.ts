import { useCsrf } from '../context/CsrfContext';

/**
 * Hook que devuelve una función fetch modificada para incluir el token CSRF
 * en todas las solicitudes que modifican datos (POST, PUT, DELETE, PATCH)
 */
export const useCsrfFetch = () => {
  const { csrfToken, isLoading } = useCsrf();
  
  return {
    fetch: async (url: RequestInfo | URL, options?: RequestInit) => {
      // Asegurarnos de que tenemos opciones
      const fetchOptions = options || {};
      
      // Si es una solicitud que modifica datos, añadir el token CSRF
      const method = fetchOptions.method?.toUpperCase() || 'GET';
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        // Asegurar que tenemos headers
        const headers = new Headers(fetchOptions.headers || {});
        
        // Añadir el token CSRF si existe
        if (csrfToken) {
          headers.set('X-CSRF-Token', csrfToken);
        }
        
        // Actualizar las opciones con los nuevos headers
        fetchOptions.headers = headers;
      }
      
      // Realizar la solicitud con las opciones actualizadas
      return fetch(url, fetchOptions);
    },
    isLoading
  };
};

/**
 * Método para aplicar automáticamente el token CSRF a cualquier cliente HTTP
 * Útil para integraciones con bibliotecas como Supabase
 */
export const applyGlobalCsrfInterceptor = (csrfToken: string) => {
  const originalFetch = global.fetch;
  
  global.fetch = async (url, options = {}) => {
    // Asegurar que tenemos opciones
    const fetchOptions = { ...options };
    
    // Si es una solicitud que modifica datos, añadir el token CSRF
    const method = fetchOptions.method?.toUpperCase() || 'GET';
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      // Asegurar que tenemos headers
      const headers = new Headers(fetchOptions.headers || {});
      
      // Añadir el token CSRF
      headers.set('X-CSRF-Token', csrfToken);
      
      // Actualizar las opciones con los nuevos headers
      fetchOptions.headers = headers;
    }
    
    // Realizar la solicitud con las opciones actualizadas
    return originalFetch(url, fetchOptions);
  };
  
  return () => {
    // Función para revertir el interceptor
    global.fetch = originalFetch;
  };
};
