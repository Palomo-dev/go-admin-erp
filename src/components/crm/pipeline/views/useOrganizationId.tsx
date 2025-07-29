"use client";

import { useState, useEffect } from "react";

/**
 * Hook personalizado para obtener el ID de la organización
 * Busca en localStorage y sessionStorage con múltiples claves posibles
 */
export function useOrganizationId() {
  const [organizationId, setOrganizationId] = useState<number | null>(null);

  useEffect(() => {
    // Lista de posibles claves donde podría estar almacenado el ID de la organización
    const possibleKeys = [
      "currentOrganizationId",
      "organizationId", 
      "selectedOrganizationId",
      "orgId",
      "organization_id"
    ];
    
    // Buscar en localStorage
    for (const key of possibleKeys) {
      const orgId = localStorage.getItem(key);
      if (orgId) {
        // Organización encontrada en localStorage
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no está en localStorage, buscar en sessionStorage
    for (const key of possibleKeys) {
      const orgId = sessionStorage.getItem(key);
      if (orgId) {
        // Organización encontrada en sessionStorage
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no se encuentra, usar un valor predeterminado para desarrollo
    if (process.env.NODE_ENV !== 'production') {
      // Usando ID de organización predeterminado para desarrollo
      setOrganizationId(2); // Valor predeterminado para desarrollo
    } else {
      // No se pudo encontrar el ID de organización en el almacenamiento local
      console.warn('No se pudo encontrar el ID de organización en el almacenamiento local');
    }
  }, []);

  return organizationId;
}
