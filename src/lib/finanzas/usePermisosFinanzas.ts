'use client';

/**
 * Permisos de Finanzas calculados en el servidor (`GET /api/finanzas/permisos`).
 * Mientras cargan, o si la petición falla, todo es `false` (fail-closed). Una
 * sola petición en vuelo por organización para todos los componentes.
 */
import { useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface PermisosFinanzasCliente {
  ver: boolean;
  crear: boolean;
  anular: boolean;
  aprobar: boolean;
  posVer: boolean;
  posCrear: boolean;
  posAnular: boolean;
}

export const PERMISOS_FINANZAS_VACIOS: PermisosFinanzasCliente = {
  ver: false,
  crear: false,
  anular: false,
  aprobar: false,
  posVer: false,
  posCrear: false,
  posAnular: false,
};

let enVuelo: { org: number; promesa: Promise<PermisosFinanzasCliente> } | null = null;
let ultimos: { org: number; permisos: PermisosFinanzasCliente } | null = null;

async function pedir(org: number): Promise<PermisosFinanzasCliente> {
  if (enVuelo && enVuelo.org === org) return enVuelo.promesa;
  const promesa = fetch('/api/finanzas/permisos', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`permisos de finanzas ${r.status}`);
      const d = (await r.json()) as Partial<Record<keyof PermisosFinanzasCliente, unknown>>;
      const permisos = Object.fromEntries(
        (Object.keys(PERMISOS_FINANZAS_VACIOS) as (keyof PermisosFinanzasCliente)[]).map((k) => [k, d[k] === true]),
      ) as unknown as PermisosFinanzasCliente;
      ultimos = { org, permisos };
      return permisos;
    })
    .finally(() => {
      if (enVuelo?.org === org) enVuelo = null;
    });
  enVuelo = { org, promesa };
  return promesa;
}

export function usePermisosFinanzas(): PermisosFinanzasCliente & { cargando: boolean } {
  const org = getOrganizationId();
  const cache = ultimos && ultimos.org === org ? ultimos.permisos : null;
  const [permisos, setPermisos] = useState<PermisosFinanzasCliente>(cache ?? PERMISOS_FINANZAS_VACIOS);
  const [cargando, setCargando] = useState(cache === null);

  useEffect(() => {
    let vigente = true;
    const cargar = () => {
      pedir(getOrganizationId())
        .then((p) => vigente && setPermisos(p))
        .catch((e) => {
          console.warn('[usePermisosFinanzas] no se pudieron cargar; se aplican los mínimos', e);
          if (vigente) setPermisos(PERMISOS_FINANZAS_VACIOS);
        })
        .finally(() => vigente && setCargando(false));
    };
    cargar();
    const alCambiarOrg = () => {
      ultimos = null;
      setCargando(true);
      cargar();
    };
    window.addEventListener('organization-changed', alCambiarOrg);
    return () => {
      vigente = false;
      window.removeEventListener('organization-changed', alCambiarOrg);
    };
  }, []);

  return { ...permisos, cargando };
}
