'use client';

/**
 * Miniatura de una plantilla en la galería (Figma «16 Sitio web» › «Plantillas · encabezado y
 * pie en la galería…», tarjeta 1): SU encabezado y SU pie dibujados de forma esquemática pero
 * fiel —logo al centro o a un lado, barra superior, botones con su texto abreviado, megamenú;
 * columnas, mapa, boletín y medios de pago—, con los tokens de SU estilo. Antes todas pintaban
 * el mismo esqueleto y solo cambiaban los colores: el dueño creía que eran iguales.
 *
 * Sale de `shellPorPlantilla.ts` por el modelo `dibujoShell.ts` (sin datos propios). Lleva texto
 * alternativo que describe el encabezado y el pie.
 */
import { useMemo } from 'react';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { ESCALA_MINIATURA, EsquemaShell } from './EsquemaShell';
import { shellDePlantillaParaVer, type ShellParaVer } from './textosShell';
import { useTextosDiseno } from './textos';

/** Lo que pinta la tarjeta de una plantilla (miniatura, línea y alt). */
export function useShellDePlantilla(plantilla: Pick<PlantillaCatalogo, 'id' | 'giro' | 'estilo'>): ShellParaVer {
  const t = useTextosDiseno();
  return useMemo(() => shellDePlantillaParaVer(t, plantilla), [t, plantilla]);
}

export function MiniaturaPlantilla({ shell }: { shell: ShellParaVer }) {
  return (
    <EsquemaShell
      dibujo={shell.dibujo}
      enlaces={shell.enlaces}
      menusPie={shell.menusPie}
      escala={ESCALA_MINIATURA}
      alt={shell.alt}
      className="size-full"
    />
  );
}
