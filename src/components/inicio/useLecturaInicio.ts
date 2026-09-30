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

export interface OpcionesLectura {
  /**
   * Recarga SILENCIOSA («Actualizar» del encabezado): cuando cambia, vuelve a
   * pedir sin pasar por «cargando» y, si falla, conserva lo último que se vio
   * y avisa con `onFalloRefresco` (Figma 445:137833: «Se conservan los
   * últimos datos válidos»).
   */
  refresco?: number;
  onFalloRefresco?: () => void;
}

export function useLecturaInicio<T>(url: string | null, organizationId: number | null | undefined, version = 0, opciones: OpcionesLectura = {}) {
  const [estado, setEstado] = useState<LecturaInicio<T>>({ fase: 'cargando' });
  const pedido = useRef(0);
  const { refresco = 0, onFalloRefresco } = opciones;
  const avisar = useRef(onFalloRefresco);
  avisar.current = onFalloRefresco;

  /** `true` si leyó (o la respuesta era 403); `false` si falló. */
  const cargar = useCallback(
    async (silencioso = false): Promise<boolean> => {
      if (!url || !organizationId) return true;
      const id = ++pedido.current;
      if (!silencioso) setEstado({ fase: 'cargando' });
      try {
        const res = await fetch(url, { headers: { 'X-Organization-Id': String(organizationId) }, cache: 'no-store' });
        if (id !== pedido.current) return true;
        if (res.status === 403) {
          setEstado({ fase: 'sinPermiso' });
          return true;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const datos = (await res.json()) as T;
        if (id === pedido.current) setEstado({ fase: 'listo', datos });
        return true;
      } catch {
        if (id === pedido.current && !silencioso) setEstado({ fase: 'error' });
        return false;
      }
    },
    [url, organizationId],
  );

  useEffect(() => {
    cargar(false);
  }, [cargar, version]);

  // El primer valor de `refresco` no recarga (ya lo hizo el efecto de arriba).
  const ultimoRefresco = useRef(refresco);
  useEffect(() => {
    if (ultimoRefresco.current === refresco) return;
    ultimoRefresco.current = refresco;
    void cargar(true).then((ok) => {
      if (!ok) avisar.current?.();
    });
  }, [refresco, cargar]);

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
