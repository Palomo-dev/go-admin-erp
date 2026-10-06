'use client';

/**
 * Carga, solo para las MUESTRAS del sitio del cliente (presets, pares
 * tipográficos y miniaturas), las familias de Google Fonts que usan sus estilos
 * («Libre Caslon Text», «Bricolage Grotesque»…). El cromo del ERP sigue en Inter.
 * Una hoja por familia, una sola vez por documento. `Inter` ya la tiene la app.
 */
import { useEffect } from 'react';

const YA_EN_LA_APP = new Set(['Inter']);

/** URL de Google Fonts (css2) de una familia con los pesos 400 y 600. */
export function urlFuente(familia: string): string {
  const nombre = encodeURIComponent(familia.trim()).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${nombre}:wght@400;600&display=swap`;
}

function idEnlace(familia: string): string {
  return `fuente-sitio-${familia.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function useFuentesSitio(familias: readonly string[]): void {
  const clave = Array.from(new Set(familias.filter((f) => f && !YA_EN_LA_APP.has(f)))).sort().join('|');
  useEffect(() => {
    if (typeof document === 'undefined' || !clave) return;
    clave.split('|').forEach((familia) => {
      const id = idEnlace(familia);
      if (document.getElementById(id)) return;
      const enlace = document.createElement('link');
      enlace.id = id;
      enlace.rel = 'stylesheet';
      enlace.href = urlFuente(familia);
      document.head.appendChild(enlace);
    });
  }, [clave]);
}
