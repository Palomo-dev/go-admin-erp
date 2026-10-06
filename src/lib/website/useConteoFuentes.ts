'use client';

import { useCallback, useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { conteoDesdeRespuesta, type ConteoFuentes } from '@/lib/services/website/fuentesDatosSecciones';

/**
 * Conteos de las fuentes de datos del sitio (`/api/website/fuentes-datos`) para
 * marcar «Faltan datos» en el diálogo y en el lienzo del editor.
 *
 * `null` mientras carga o si falla: nunca se avisa de lo que no se pudo
 * comprobar. La organización la resuelve el servidor desde la sesión; la
 * cabecera es la organización activa, que el servidor valida.
 */
export function useConteoFuentes(habilitado: boolean, sede: number | null): {
  conteos: ConteoFuentes | null;
  recargar: () => void;
} {
  const [conteos, setConteos] = useState<ConteoFuentes | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    if (!habilitado) return;
    let cancelado = false;
    const org = getOrganizationId();
    const url = `/api/website/fuentes-datos${sede !== null ? `?branch_id=${sede}` : ''}`;
    fetch(url, {
      credentials: 'same-origin',
      headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((cuerpo) => {
        if (!cancelado) setConteos(cuerpo ? conteoDesdeRespuesta(cuerpo) : null);
      })
      .catch(() => {
        if (!cancelado) setConteos(null);
      });
    return () => {
      cancelado = true;
    };
  }, [habilitado, sede, vuelta]);

  return { conteos, recargar };
}
