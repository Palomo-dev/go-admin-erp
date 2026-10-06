'use client';

/**
 * Organización activa y lo que la persona puede hacer en ella, para las
 * pantallas de Organización. Todo sale de `GET /api/me/capacidades` (sesión
 * del servidor): nunca de `localStorage` ni del `role_id` en el navegador
 * (auditoría 2026-10, P1-2 y P1-3).
 */
import { useCapacidades } from '@/lib/navigation/useCapacidades';

export type PermisoOrganizacion = 'organizacion' | 'miembros' | 'facturacion' | 'miembro';

export interface AccesoOrganizacion {
  organizationId: number | null;
  cargando: boolean;
  error: boolean;
  recargar: () => void;
  puede: Record<Exclude<PermisoOrganizacion, 'miembro'>, boolean>;
}

export function useAccesoOrganizacion(): AccesoOrganizacion {
  const { datos, cargando, error, recargar } = useCapacidades();
  const c = datos.capacidades;
  return {
    organizationId: datos.organizationId,
    cargando,
    error,
    recargar,
    puede: {
      organizacion: c.gestionarOrganizacion === true || datos.esAdmin,
      miembros: c.gestionarMiembros === true || datos.esAdmin,
      facturacion: c.gestionarFacturacion === true || datos.esAdmin,
    },
  };
}

/** ¿El permiso pedido se cumple? `miembro` = basta con pertenecer (Mis organizaciones). */
export function cumplePermiso(acceso: Pick<AccesoOrganizacion, 'puede' | 'organizationId'>, permiso: PermisoOrganizacion): boolean {
  if (permiso === 'miembro') return acceso.organizationId !== null;
  return acceso.puede[permiso];
}
