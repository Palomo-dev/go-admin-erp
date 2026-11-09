'use client';

/**
 * Grupo «Módulos que tu organización no usa» del buscador global (Figma
 * `2421:65004`, docs/design/MODULO-NO-HABILITADO.md §4).
 *
 * Lo decide el servidor (`GET /api/modules/no-usados`): solo quien puede
 * encender módulos recibe la lista; a los demás les llega vacía y
 * `puedeEncender: false`, que el buscador usa para la pista del estado vacío.
 * Se pide una vez por organización, al abrir el buscador.
 */
import { useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { ModuloNoUsado } from '@/lib/organizacion/accesoModulo';

export interface ModulosNoUsados {
  /** `null` mientras no se sabe (o si falló): no se muestra nada nuevo. */
  puedeEncender: boolean | null;
  plan: string | null;
  modulos: ModuloNoUsado[];
}

const VACIO: ModulosNoUsados = { puedeEncender: null, plan: null, modulos: [] };

export function useModulosNoUsados(abierto: boolean, organizacionId: string | null): ModulosNoUsados {
  const [datos, setDatos] = useState<{ org: string | null; valor: ModulosNoUsados } | null>(null);
  const yaPedido = datos?.org === organizacionId;

  useEffect(() => {
    if (!abierto || yaPedido || typeof fetch !== 'function') return;
    let vivo = true;
    // Misma cabecera que la búsqueda de datos: el servidor la valida contra la sesión.
    const org = getOrganizationId();
    fetch('/api/modules/no-usados', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: org > 0 ? { 'x-organization-id': String(org) } : {},
    })
      .then((r) => (r.ok ? (r.json() as Promise<ModulosNoUsados>) : VACIO))
      .then((v) => {
        if (vivo) setDatos({ org: organizacionId, valor: { puedeEncender: v.puedeEncender ?? null, plan: v.plan ?? null, modulos: v.modulos ?? [] } });
      })
      .catch(() => {
        if (vivo) setDatos({ org: organizacionId, valor: VACIO });
      });
    return () => {
      vivo = false;
    };
  }, [abierto, yaPedido, organizacionId]);

  return yaPedido && datos ? datos.valor : VACIO;
}
