// ============================================================
// Cliente del único escritor de zonas horarias (fase A, punto 4).
//
// Todo lo que cambie `organizations.timezone` o `branches.timezone` pasa por
// aquí, y de aquí a `PUT /api/organization/timezone`, donde el permiso se
// resuelve en el servidor por id de rol y con la organización de la SESIÓN
// (reglas duras 5 y 6). Ninguna pantalla vuelve a hacer su propio
// `supabase.from('organizations').update({ timezone })`.
//
// Además de escribir, invalida los DOS cachés (organización y sucursales) y
// emite `TIMEZONES_UPDATED_EVENT`. Esa es la razón de que exista un solo
// punto: la invalidación se olvidaba en cuanto había dos caminos, y la
// pantalla seguía formateando con la zona anterior hasta un F5.
// ============================================================

import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { invalidateTimezoneCache } from '@/lib/services/organizationTimezoneService';
import {
  invalidateBranchTimezoneCache,
  notifyTimezonesUpdated,
} from '@/lib/services/branchTimezoneService';

export interface RespuestaZona {
  ok: true;
  scope: 'organization' | 'branch';
  branchId?: number;
  timezone: string | null;
  /** Zona efectiva según `fn_timezone_for` (solo al guardar una sucursal). */
  effectiveTimezone?: string | null;
}

const RUTA = '/api/organization/timezone';

async function enviar(cuerpo: Record<string, unknown>): Promise<RespuestaZona> {
  const orgId = getOrganizationId();
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
  // La cookie de organización viaja sola; la cabecera es el camino explícito
  // y el servidor la valida igual contra `organization_members`.
  if (orgId && orgId > 0) cabeceras['x-organization-id'] = String(orgId);

  const respuesta = await fetch(RUTA, {
    method: 'PUT',
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  });

  let datos: unknown = null;
  try {
    datos = await respuesta.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!respuesta.ok) {
    const mensaje =
      (datos as { error?: string } | null)?.error ?? `Error ${respuesta.status} al guardar la zona`;
    throw new Error(mensaje);
  }

  // Un guardado correcto deja los dos cachés obsoletos: el de la organización
  // y el de las sucursales que heredan de ella.
  if (orgId && orgId > 0) {
    invalidateTimezoneCache(orgId);
    invalidateBranchTimezoneCache(orgId);
  } else {
    invalidateTimezoneCache();
    invalidateBranchTimezoneCache();
  }
  notifyTimezonesUpdated();

  return datos as RespuestaZona;
}

/** Cambia la zona de la organización activa (la de la sesión, no la del body). */
export async function guardarZonaOrganizacion(timezone: string): Promise<RespuestaZona> {
  return enviar({ scope: 'organization', timezone });
}

/** Cambia la zona propia de una sucursal. `null` = heredar de la organización. */
export async function guardarZonaSucursal(
  branchId: number,
  timezone: string | null,
): Promise<RespuestaZona> {
  return enviar({ scope: 'branch', branchId, timezone });
}
