'use client';

/**
 * Enlaces firmados de las evidencias de un envío (fotos, firma, fotos de novedad). El bucket
 * `shipment-pod` es privado: lo guardado es una ruta y el enlace lo firma el servidor
 * (`GET /api/logistica/envios/[id]/evidencias`, ver `src/lib/logistica/evidencias.ts`).
 *
 * `enlace(valorGuardado)` devuelve el enlace firmado o null (aún cargando, sin permiso, o un valor que
 * no es una evidencia de ese envío: no se pinta). Los enlaces duran poco; se vuelven a pedir cuando
 * cambia `clave` (p. ej. tras recargar el detalle) o al montar.
 */
import { useCallback, useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface EvidenciasEnvio {
  enlace: (valor: string | null | undefined) => string | null;
  cargando: boolean;
}

export function useEvidenciasEnvio(shipmentId: string | null | undefined, activo = true, clave: unknown = null): EvidenciasEnvio {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!shipmentId || !activo || typeof fetch !== 'function') {
      setUrls({});
      return;
    }
    let cancelado = false;
    setCargando(true);
    const org = Number(getOrganizationId()) || null;
    fetch(`/api/logistica/envios/${encodeURIComponent(shipmentId)}/evidencias`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: org ? { 'x-organization-id': String(org) } : {},
    })
      .then((r) => (r.ok ? r.json() : { urls: {} }))
      .then((cuerpo: { urls?: Record<string, string> }) => {
        if (!cancelado) setUrls(cuerpo?.urls ?? {});
      })
      .catch(() => {
        if (!cancelado) setUrls({});
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [shipmentId, activo, clave]);

  const enlace = useCallback((valor: string | null | undefined) => (valor ? urls[valor] ?? null : null), [urls]);
  return { enlace, cargando };
}
