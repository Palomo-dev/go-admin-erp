'use client';

/**
 * Permisos de cajas calculados en el servidor (`GET /api/pos/cajas/permisos`).
 * Nunca se deducen del nombre del rol (regla dura 6).
 *
 * Mientras cargan, o si la petición falla, todo es `false` (fail-closed): la
 * pantalla ofrece lo mínimo y se completa cuando llega la respuesta. Una sola
 * petición en vuelo para todos los componentes que lo piden a la vez (la
 * pantalla, el diálogo de cierre, el resumen, el reporte).
 */
import { useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface PermisosCajaCliente {
  userId: string | null;
  cerrarCajasAjenas: boolean;
  verEsperadoEnCierreCiego: boolean;
}

const VACIOS: PermisosCajaCliente = { userId: null, cerrarCajasAjenas: false, verEsperadoEnCierreCiego: false };

let enVuelo: { org: number; promesa: Promise<PermisosCajaCliente> } | null = null;
let ultimos: { org: number; permisos: PermisosCajaCliente } | null = null;

async function pedir(org: number): Promise<PermisosCajaCliente> {
  if (enVuelo && enVuelo.org === org) return enVuelo.promesa;
  const promesa = fetch('/api/pos/cajas/permisos', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`permisos de caja ${r.status}`);
      const d = (await r.json()) as Partial<PermisosCajaCliente>;
      const permisos: PermisosCajaCliente = {
        userId: typeof d.userId === 'string' ? d.userId : null,
        cerrarCajasAjenas: d.cerrarCajasAjenas === true,
        verEsperadoEnCierreCiego: d.verEsperadoEnCierreCiego === true,
      };
      ultimos = { org, permisos };
      return permisos;
    })
    .finally(() => {
      if (enVuelo?.org === org) enVuelo = null;
    });
  enVuelo = { org, promesa };
  return promesa;
}

export function usePermisosCaja(): PermisosCajaCliente & { cargando: boolean } {
  const org = getOrganizationId();
  const cache = ultimos && ultimos.org === org ? ultimos.permisos : null;
  const [permisos, setPermisos] = useState<PermisosCajaCliente>(cache ?? VACIOS);
  const [cargando, setCargando] = useState(cache === null);

  useEffect(() => {
    let vigente = true;
    const cargar = () => {
      const actual = getOrganizationId();
      pedir(actual)
        .then((p) => vigente && setPermisos(p))
        .catch((e) => {
          console.warn('[usePermisosCaja] no se pudieron cargar; se aplican los mínimos', e);
          if (vigente) setPermisos(VACIOS);
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
