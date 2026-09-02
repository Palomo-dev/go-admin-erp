/**
 * Resolución server-safe de organization_id.
 *
 * Este módulo NO tiene 'use client' por lo que puede importarse desde
 * API routes (server-side). En server devuelve 0; en client lee de
 * localStorage/sessionStorage igual que obtenerOrganizacionActiva().
 *
 * Los servicios CRM que se usan tanto desde client como desde server
 * deben importar getOrganizationId desde aquí, no desde useOrganization.
 */

export interface Organizacion {
  id: number;
  name?: string;
  slug?: string;
  logo_url?: string;
  subdomain?: string;
}

const STORAGE_KEY = 'organizacionActiva';

/**
 * Obtiene la organización activa desde localStorage/sessionStorage.
 * En server-side devuelve { id: 0 }.
 */
export function obtenerOrganizacionActiva(): Organizacion {
  if (typeof window === 'undefined') {
    return { id: 0 };
  }

  try {
    // 1. Fuente principal: clave JSON
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
      const parsed = JSON.parse(localData);
      if (parsed?.id) return parsed as Organizacion;
    }

    // 2. Respaldo: sessionStorage
    const sessionData = sessionStorage.getItem(STORAGE_KEY);
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      if (parsed?.id) return parsed as Organizacion;
    }

    // 3. Respaldo: clave simple
    const simpleId = localStorage.getItem('currentOrganizationId');
    if (simpleId) {
      const id = parseInt(simpleId, 10);
      if (!isNaN(id) && id > 0) return { id };
    }

    // 4. Claves alternativas
    const alternativas = ['currentOrganization', 'activeOrganization', 'organizacion'];
    for (const key of alternativas) {
      const altData = localStorage.getItem(key);
      if (altData) {
        const parsed = JSON.parse(altData);
        if (parsed?.id) return parsed as Organizacion;
      }
    }

    return { id: 0 };
  } catch {
    return { id: 0 };
  }
}

/**
 * Devuelve el organization_id activo.
 * En server-side devuelve 0; los servicios que se usan desde server
 * deben recibir organizationId explícitamente.
 */
export function getOrganizationId(): number {
  const organizacion = obtenerOrganizacionActiva();
  return organizacion?.id || 0;
}
