/**
 * Hook para manejar la organización activa de forma consistente
 * Centraliza las operaciones de lectura/escritura de la organización para evitar problemas
 */

const STORAGE_KEY = 'organizacionActiva';

export type Organizacion = {
  id: number;
  name?: string;
  slug?: string;
  logo_url?: string;
};

/**
 * Guarda la organización activa en localStorage y sessionStorage como respaldo
 */
export function guardarOrganizacionActiva(organizacion: Organizacion): void {
  try {
    // Guardar en localStorage como fuente principal
    localStorage.setItem(STORAGE_KEY, JSON.stringify(organizacion));
    
    // Guardar en sessionStorage como respaldo
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(organizacion));
    
    console.log('Organización guardada correctamente:', organizacion.id);
  } catch (error) {
    console.error('Error al guardar organización:', error);
  }
}

/**
 * Obtiene la organización activa de forma robusta
 * Intenta recuperarla de múltiples fuentes para mayor resiliencia
 */
export function obtenerOrganizacionActiva(): Organizacion {
  // Valor predeterminado si todo falla
  const valorPredeterminado: Organizacion = { id: 1 };
  
  if (typeof window === 'undefined') {
    return valorPredeterminado; // Para SSR
  }
  
  try {
    // Intentar recuperar del localStorage (fuente principal)
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
      const parsed = JSON.parse(localData);
      console.log('Organización recuperada de localStorage:', parsed.id);
      return parsed;
    }
    
    // Intentar recuperar del sessionStorage (fuente de respaldo)
    const sessionData = sessionStorage.getItem(STORAGE_KEY);
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      console.log('Organización recuperada de sessionStorage:', parsed.id);
      return parsed;
    }
    
    // Si no se encontró nada, verificar otras posibles claves (para migración)
    const alternativas = ['currentOrganization', 'activeOrganization', 'organizacion'];
    for (const key of alternativas) {
      const altData = localStorage.getItem(key);
      if (altData) {
        const parsed = JSON.parse(altData);
        console.log(`Organización recuperada de clave alternativa (${key}):`, parsed.id);
        // Migrar a la clave estándar
        guardarOrganizacionActiva(parsed);
        return parsed;
      }
    }
    
    console.log('No se encontró organización guardada, usando predeterminada');
    return valorPredeterminado;
  } catch (error) {
    console.error('Error al recuperar organización:', error);
    return valorPredeterminado;
  }
}

/**
 * Para uso en componentes: obtiene la organización y proporciona el organization_id
 * Se recomienda usar este método siempre para obtener el ID de organización
 */
export function getOrganizationId(): number {
  const organizacion = obtenerOrganizacionActiva();
  return organizacion?.id || 1;
}

export default {
  guardarOrganizacionActiva,
  obtenerOrganizacionActiva,
  getOrganizationId
};
