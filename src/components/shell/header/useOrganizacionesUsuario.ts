'use client';

/**
 * Organizaciones de la persona para el OrgPicker (`GET /api/me/organizaciones`).
 * Se piden una vez por sesión de página y se reutilizan entre el header de
 * escritorio y la hoja móvil; crear una organización vuelve a pedirlas.
 */
import { useCallback, useEffect, useState } from 'react';

export interface OrganizacionUsuario {
  id: number;
  nombre: string;
  logoUrl: string | null;
  subdominio: string | null;
  rol: string | null;
  plan: string | null;
  estado: 'activa' | 'prueba' | 'suspendida';
}

let cache: OrganizacionUsuario[] | null = null;
let enCurso: Promise<OrganizacionUsuario[]> | null = null;

async function pedir(): Promise<OrganizacionUsuario[]> {
  if (!enCurso) {
    enCurso = fetch('/api/me/organizaciones', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`organizaciones ${r.status}`);
        const json = (await r.json()) as { organizaciones: OrganizacionUsuario[] };
        cache = json.organizaciones;
        return cache;
      })
      .finally(() => {
        enCurso = null;
      });
  }
  return enCurso;
}

export function useOrganizacionesUsuario() {
  const [organizaciones, setOrganizaciones] = useState<OrganizacionUsuario[] | null>(cache);
  const [error, setError] = useState(false);

  const recargar = useCallback(async () => {
    cache = null;
    try {
      setOrganizaciones(await pedir());
      setError(false);
    } catch (e) {
      console.warn('[useOrganizacionesUsuario]', e);
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (cache) return;
    let vivo = true;
    pedir()
      .then((o) => vivo && setOrganizaciones(o))
      .catch((e) => {
        console.warn('[useOrganizacionesUsuario]', e);
        if (vivo) setError(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return { organizaciones, error, recargar };
}
