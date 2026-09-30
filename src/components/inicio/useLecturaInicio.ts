'use client';

/**
 * Lectura de una ruta `GET /api/inicio/*` con la organización en la cabecera
 * (el servidor la valida contra la sesión). Estados cargando · error · listo
 * y `sinPermiso` (403: el bloque no se pinta, sin hueco). La recarga
 * silenciosa conserva lo último que se vio.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type LecturaInicio<T> =
  | { fase: 'cargando' }
  | { fase: 'error' }
  | { fase: 'sinPermiso' }
  | { fase: 'listo'; datos: T };

export function useLecturaInicio<T>(url: string | null, organizationId: number | null | undefined, version = 0) {
  const [estado, setEstado] = useState<LecturaInicio<T>>({ fase: 'cargando' });
  const pedido = useRef(0);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!url || !organizationId) return;
      const id = ++pedido.current;
      if (!silencioso) setEstado({ fase: 'cargando' });
      try {
        const res = await fetch(url, { headers: { 'X-Organization-Id': String(organizationId) }, cache: 'no-store' });
        if (id !== pedido.current) return;
        if (res.status === 403) {
          setEstado({ fase: 'sinPermiso' });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const datos = (await res.json()) as T;
        if (id === pedido.current) setEstado({ fase: 'listo', datos });
      } catch {
        if (id === pedido.current && !silencioso) setEstado({ fase: 'error' });
      }
    },
    [url, organizationId],
  );

  useEffect(() => {
    cargar(false);
  }, [cargar, version]);

  return { estado, recargar: cargar, setEstado };
}

/** «+12,4 %» / «−3,1 %» en el idioma de la interfaz. */
export function formatoVariacion(valor: number, locale: string): string {
  const abs = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.abs(valor));
  return `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${abs} %`;
}

/** Entero con separador de miles del idioma. */
export function formatoEntero(valor: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(valor);
}
