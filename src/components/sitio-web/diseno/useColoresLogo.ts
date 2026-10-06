'use client';

/**
 * «Colores de tu logo» del ColorField (Figma A/07e): el color dominante del logo
 * del sitio, con la MISMA lectura que el asistente (`pixelesDeImagen` +
 * `colorDeAcento`). Lo lee el navegador con CORS anónimo; si la imagen no lo
 * permite, no se ofrece nada (nunca un color inventado).
 */
import { useEffect, useState } from 'react';
import { pixelesDeImagen } from '../resumen/asistente/PasoEstilo';
import { colorDeAcento } from '../resumen/asistente/logicaAsistente';

export function useColoresLogo(logoUrl: string | null): string[] {
  const [colores, setColores] = useState<string[]>([]);
  useEffect(() => {
    if (!logoUrl) {
      setColores([]);
      return;
    }
    let vigente = true;
    void pixelesDeImagen(logoUrl).then((px) => {
      if (!vigente) return;
      const c = px ? colorDeAcento(px) : null;
      setColores(c ? [c] : []);
    });
    return () => {
      vigente = false;
    };
  }, [logoUrl]);
  return colores;
}
